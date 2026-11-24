import { db } from '../db/database';
import type {
  ExerciseSession,
  FailReason,
  Grams,
  ID,
  ISODate,
  Rating,
  RecommendationDecision,
  SetKind,
  SetResult,
  WeightRecommendation,
  WorkoutSession,
} from '../domain/types';
import { computeRecommendation, confirmedWorkingWeight } from '../domain/progression';
import { nowISO, uid } from '../lib/id';
import { addDays, mondayOf } from '../lib/dates';

export const DEFAULT_REST_SEC = 120;

/* ---------- Чтение ---------- */

export async function getInProgressSession(profileId: ID): Promise<WorkoutSession | undefined> {
  return db.sessions.where({ profileId, status: 'in_progress' }).first();
}

export interface SessionBundle {
  session: WorkoutSession;
  exercises: ExerciseSession[];
  sets: Map<ID, SetResult[]>;
  recommendations: Map<ID, WeightRecommendation>;
}

export function sortSets(list: SetResult[]): SetResult[] {
  return [...list].sort((a, b) => (a.kind === b.kind ? a.index - b.index : a.kind === 'warmup' ? -1 : 1));
}

export async function loadSessionBundle(sessionId: ID): Promise<SessionBundle | null> {
  const session = await db.sessions.get(sessionId);
  if (!session) return null;
  const exercises = (await db.exerciseSessions.where({ sessionId }).toArray()).sort((a, b) => a.order - b.order);
  const allSets = await db.sets.where('exerciseSessionId').anyOf(exercises.map((e) => e.id)).toArray();
  const sets = new Map<ID, SetResult[]>();
  for (const e of exercises) sets.set(e.id, sortSets(allSets.filter((s) => s.exerciseSessionId === e.id)));
  const recs = await db.recommendations.where({ sessionId }).toArray();
  const recommendations = new Map(recs.map((r) => [r.exerciseSessionId, r]));
  return { session, exercises, sets, recommendations };
}

/** Последний завершённый результат этой же линии прогрессии (для «в прошлый раз») */
export async function lastResultFor(programExerciseId: ID, excludeSessionId?: ID) {
  const list = (await db.exerciseSessions.where({ programExerciseId }).toArray())
    .filter((e) => e.status === 'done' && e.sessionId !== excludeSessionId && e.completedAt)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  const last = list[0];
  if (!last) return null;
  const sets = sortSets(await db.sets.where({ exerciseSessionId: last.id }).toArray()).filter((s) => s.kind === 'work' && s.done);
  const session = await db.sessions.get(last.sessionId);
  return { exercise: last, sets, date: session?.date ?? null };
}

async function previousRatings(programExerciseId: ID, excludeEsId: ID): Promise<Rating[]> {
  const list = (await db.exerciseSessions.where({ programExerciseId }).toArray())
    .filter((e) => e.id !== excludeEsId && e.status === 'done' && e.rating && e.completedAt)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  return list.map((e) => e.rating as Rating);
}

/* ---------- Начало тренировки ---------- */

/** Дата слота дня в той же неделе, что и фактическая дата (для переноса тренировки) */
export function plannedDateFor(weekday: number, actualDate: ISODate): ISODate {
  return addDays(mondayOf(actualDate), weekday);
}

export async function startSession(profileId: ID, dayId: ID, date: ISODate, plannedDate?: ISODate): Promise<WorkoutSession> {
  const existing = await getInProgressSession(profileId);
  if (existing) return existing;
  const day = await db.days.get(dayId);
  if (!day) throw new Error('Тренировка не найдена');
  const pes = (await db.programExercises.where({ dayId }).toArray())
    .filter((e) => e.status === 'active')
    .sort((a, b) => a.order - b.order);
  if (pes.length === 0) throw new Error('В этой тренировке нет упражнений');
  const rules = await db.rules.where('programExerciseId').anyOf(pes.map((p) => p.id)).toArray();
  const exs = await db.exercises.bulkGet(pes.map((p) => p.exerciseId));
  const now = nowISO();
  const session: WorkoutSession = {
    id: uid(),
    profileId,
    programId: day.programId,
    dayId,
    plannedDate: plannedDate ?? plannedDateFor(day.weekday, date),
    date,
    startedAt: now,
    finishedAt: null,
    status: 'in_progress',
    currentIndex: 0,
    restEndsAt: null,
    dayNameSnapshot: day.name,
    dayLetterSnapshot: day.letter,
  };
  await db.transaction('rw', [db.sessions, db.exerciseSessions, db.sets], async () => {
    await db.sessions.add(session);
    for (const [i, pe] of pes.entries()) {
      const rule = rules.find((r) => r.programExerciseId === pe.id);
      const es: ExerciseSession = {
        id: uid(),
        sessionId: session.id,
        programExerciseId: pe.id,
        exerciseId: pe.exerciseId,
        nameSnapshot: exs[i]?.name ?? 'Упражнение',
        order: i,
        plannedSets: pe.sets,
        plannedReps: pe.reps,
        plannedWeightG: pe.workingWeightG,
        stepG: rule?.stepG ?? 2500,
        autoProgression: rule?.autoProgression ?? true,
        isCalibration: pe.workingWeightG === null,
        restSec: pe.restSec,
        status: i === 0 ? 'active' : 'pending',
        rating: null,
        failReason: null,
        pain: false,
        unusual: false,
        confirmedWeightG: null,
        completedAt: null,
      };
      await db.exerciseSessions.add(es);
      for (let k = 0; k < pe.sets; k++) {
        await db.sets.add({
          id: uid(),
          exerciseSessionId: es.id,
          index: k,
          kind: 'work',
          plannedReps: pe.reps,
          plannedWeightG: pe.workingWeightG,
          actualReps: null,
          actualWeightG: null,
          done: false,
          assisted: false,
          doneAt: null,
        });
      }
    }
  });
  return session;
}

/* ---------- Подходы ---------- */

export async function updateSet(setId: ID, patch: Partial<Pick<SetResult, 'actualReps' | 'actualWeightG' | 'assisted'>>) {
  await db.sets.update(setId, patch);
}

/** Отмечает подход выполненным. Пустые фактические значения берутся из плана. */
export async function completeSet(setId: ID, actual?: { reps?: number; weightG?: Grams | null }) {
  const set = await db.sets.get(setId);
  if (!set) return;
  const es = await db.exerciseSessions.get(set.exerciseSessionId);
  if (!es) return;
  const weightG = actual?.weightG !== undefined ? actual.weightG : set.actualWeightG ?? set.plannedWeightG;
  if (weightG === null && set.kind === 'work') throw new Error('Укажи вес подхода');
  await db.sets.update(setId, {
    done: true,
    actualReps: actual?.reps ?? set.actualReps ?? set.plannedReps,
    actualWeightG: weightG,
    doneAt: nowISO(),
  });
  // Вес, указанный в одном подходе калибровки, подставляем в следующие невыполненные
  if (set.kind === 'work' && weightG !== null) {
    const rest = await db.sets.where({ exerciseSessionId: es.id }).toArray();
    for (const s of rest) {
      if (s.kind === 'work' && !s.done && s.actualWeightG === null && s.plannedWeightG === null) {
        await db.sets.update(s.id, { actualWeightG: weightG });
      }
    }
  }
  const restSec = es.restSec ?? DEFAULT_REST_SEC;
  await db.sessions.update(es.sessionId, { restEndsAt: new Date(Date.now() + restSec * 1000).toISOString() });
}

export async function uncompleteSet(setId: ID) {
  await db.sets.update(setId, { done: false, doneAt: null });
}

export async function addSet(esId: ID, kind: SetKind) {
  const es = await db.exerciseSessions.get(esId);
  if (!es) return;
  const sets = await db.sets.where({ exerciseSessionId: esId }).toArray();
  const same = sets.filter((s) => s.kind === kind);
  const work = sets.filter((s) => s.kind === 'work');
  const lastWork = work.sort((a, b) => a.index - b.index).at(-1);
  await db.sets.add({
    id: uid(),
    exerciseSessionId: esId,
    index: same.length ? Math.max(...same.map((s) => s.index)) + 1 : 0,
    kind,
    plannedReps: kind === 'warmup' ? Math.max(es.plannedReps, 5) : es.plannedReps,
    plannedWeightG:
      kind === 'warmup'
        ? es.plannedWeightG !== null
          ? Math.max(20000, Math.round((es.plannedWeightG * 0.5) / 2500) * 2500)
          : 20000
        : lastWork?.actualWeightG ?? es.plannedWeightG,
    actualReps: null,
    actualWeightG: null,
    done: false,
    assisted: false,
    doneAt: null,
  });
}

export async function removeSet(setId: ID) {
  await db.sets.delete(setId);
}

export async function setCurrentIndex(sessionId: ID, index: number) {
  const bundle = await loadSessionBundle(sessionId);
  if (!bundle) return;
  await db.transaction('rw', [db.sessions, db.exerciseSessions], async () => {
    await db.sessions.update(sessionId, { currentIndex: index, restEndsAt: null });
    for (const e of bundle.exercises) {
      if (e.order === index && e.status === 'pending') await db.exerciseSessions.update(e.id, { status: 'active' });
    }
  });
}

export async function clearRest(sessionId: ID) {
  await db.sessions.update(sessionId, { restEndsAt: null });
}

export async function extendRest(sessionId: ID, seconds: number) {
  const s = await db.sessions.get(sessionId);
  if (!s) return;
  const base = s.restEndsAt && new Date(s.restEndsAt).getTime() > Date.now() ? new Date(s.restEndsAt).getTime() : Date.now();
  await db.sessions.update(sessionId, { restEndsAt: new Date(base + seconds * 1000).toISOString() });
}

/* ---------- Оценка упражнения и рекомендация ---------- */

export async function skipExercise(esId: ID) {
  await db.exerciseSessions.update(esId, { status: 'skipped', completedAt: nowISO(), rating: null });
}

export interface RatingInput {
  rating: Rating;
  failReason?: FailReason | null;
  pain?: boolean;
  unusual?: boolean;
  /** id рабочих подходов, где понадобилась помощь страхующего */
  assistedSetIds?: ID[];
}

export async function rateExercise(esId: ID, input: RatingInput): Promise<WeightRecommendation | null> {
  const es = await db.exerciseSessions.get(esId);
  if (!es) throw new Error('Упражнение не найдено');
  const existing = await db.recommendations.where({ exerciseSessionId: esId }).first();
  if (existing && existing.decision !== 'pending') throw new Error('Рекомендация уже принята');

  const sets = await db.sets.where({ exerciseSessionId: esId }).toArray();
  const assisted = new Set(input.assistedSetIds ?? []);
  for (const s of sets) {
    const flag = s.kind === 'work' && assisted.has(s.id);
    if (s.assisted !== flag) await db.sets.update(s.id, { assisted: flag });
    s.assisted = flag;
  }
  const work = sets.filter((s) => s.kind === 'work');
  const rule = await db.rules.where({ programExerciseId: es.programExerciseId }).first();
  const prev = await previousRatings(es.programExerciseId, esId);
  const result = computeRecommendation({
    plannedWeightG: es.plannedWeightG,
    plannedSets: es.plannedSets,
    plannedReps: es.plannedReps,
    isCalibration: es.isCalibration,
    stepG: es.stepG,
    autoProgression: es.autoProgression,
    failStreakForDeload: rule?.failStreakForDeload ?? 2,
    deloadPercent: rule?.deloadPercent ?? 10,
    workSets: work,
    rating: input.rating,
    failReason: input.failReason ?? null,
    pain: !!input.pain,
    skipped: false,
    previousRatings: prev,
  });
  const confirmed = confirmedWorkingWeight(work).weightG;
  const now = nowISO();

  return db.transaction('rw', [db.exerciseSessions, db.recommendations, db.history, db.programExercises], async () => {
    await db.exerciseSessions.update(esId, {
      status: 'done',
      rating: input.rating,
      failReason: input.rating === 'failed' ? input.failReason ?? 'reps' : null,
      pain: !!input.pain,
      unusual: !!input.unusual,
      confirmedWeightG: confirmed,
      completedAt: now,
    });
    if (existing) await db.recommendations.delete(existing.id);
    // Калибровка: подтверждённый вес становится стартовым весом линии
    if (es.isCalibration && confirmed !== null) {
      const pe = await db.programExercises.get(es.programExerciseId);
      if (pe && pe.workingWeightG === null) {
        await db.programExercises.update(pe.id, { workingWeightG: confirmed });
        await db.history.add({ id: uid(), programExerciseId: pe.id, weightG: confirmed, source: 'calibration', recommendationId: null, at: now });
      }
    }
    if (!result) return null;
    const rec: WeightRecommendation = {
      id: uid(),
      programExerciseId: es.programExerciseId,
      exerciseSessionId: esId,
      sessionId: es.sessionId,
      fromWeightG: result.fromWeightG,
      recommendedWeightG: result.recommendedWeightG,
      appliedWeightG: null,
      reason: result.reason,
      tone: result.tone,
      title: result.title,
      message: result.message,
      warning: result.warning,
      decision: 'pending',
      createdAt: now,
      decidedAt: null,
    };
    await db.recommendations.add(rec);
    return rec;
  });
}

/**
 * Решение пользователя по рекомендации. Меняет только будущий рабочий вес линии
 * (ProgramExercise.workingWeightG). Завершённые тренировки не трогаются.
 */
export async function decideRecommendation(recId: ID, decision: Exclude<RecommendationDecision, 'pending'>, customWeightG?: Grams) {
  const rec = await db.recommendations.get(recId);
  if (!rec) throw new Error('Рекомендация не найдена');
  let applied: Grams;
  if (decision === 'accepted') applied = rec.recommendedWeightG;
  else if (decision === 'rejected') applied = rec.fromWeightG;
  else {
    if (customWeightG === undefined || !Number.isFinite(customWeightG) || customWeightG < 0) throw new Error('Укажи корректный вес');
    applied = customWeightG;
  }
  const now = nowISO();
  await db.transaction('rw', [db.recommendations, db.programExercises, db.history], async () => {
    await db.recommendations.update(recId, { decision, appliedWeightG: applied, decidedAt: now });
    const pe = await db.programExercises.get(rec.programExerciseId);
    if (!pe) return;
    if (pe.workingWeightG !== applied) {
      await db.programExercises.update(pe.id, { workingWeightG: applied });
    }
    await db.history.add({
      id: uid(),
      programExerciseId: pe.id,
      weightG: applied,
      source: decision === 'custom' ? 'manual' : 'recommendation',
      recommendationId: recId,
      at: now,
    });
  });
}

export async function finishSession(sessionId: ID) {
  const pending = (await db.recommendations.where({ sessionId }).toArray()).filter((r) => r.decision === 'pending');
  for (const r of pending) await decideRecommendation(r.id, 'rejected');
  const exs = await db.exerciseSessions.where({ sessionId }).toArray();
  for (const e of exs) {
    if (e.status === 'pending' || e.status === 'active') await db.exerciseSessions.update(e.id, { status: 'skipped', completedAt: nowISO() });
  }
  await db.sessions.update(sessionId, { status: 'completed', finishedAt: nowISO(), restEndsAt: null });
}

/** Прервать тренировку без сохранения в историю (принятые решения по весам остаются) */
export async function abandonSession(sessionId: ID) {
  await db.sessions.update(sessionId, { status: 'abandoned', finishedAt: nowISO(), restEndsAt: null });
}

/* ---------- Итоги ---------- */

export interface SessionSummary {
  durationMs: number;
  exercisesDone: number;
  workSets: number;
  reps: number;
  volumeKgReps: number; // в килограммах × повторения
  rows: {
    name: string;
    rating: Rating | null;
    skipped: boolean;
    pain: boolean;
    fromG: Grams | null;
    toG: Grams | null;
    decision: RecommendationDecision | null;
  }[];
}

export function summarize(bundle: SessionBundle): SessionSummary {
  const { session, exercises, sets, recommendations } = bundle;
  let workSets = 0;
  let reps = 0;
  let volumeG = 0;
  for (const e of exercises) {
    for (const s of sets.get(e.id) ?? []) {
      if (s.kind !== 'work' || !s.done) continue;
      workSets++;
      reps += s.actualReps ?? 0;
      if (!s.assisted) volumeG += (s.actualWeightG ?? 0) * (s.actualReps ?? 0);
    }
  }
  const end = session.finishedAt ? new Date(session.finishedAt).getTime() : Date.now();
  return {
    durationMs: end - new Date(session.startedAt).getTime(),
    exercisesDone: exercises.filter((e) => e.status === 'done').length,
    workSets,
    reps,
    volumeKgReps: Math.round(volumeG / 1000),
    rows: exercises.map((e) => {
      const r = recommendations.get(e.id);
      const applied = r ? (r.decision === 'pending' ? r.recommendedWeightG : r.appliedWeightG) : null;
      return {
        name: e.nameSnapshot,
        rating: e.rating,
        skipped: e.status === 'skipped',
        pain: e.pain,
        fromG: r?.fromWeightG ?? e.confirmedWeightG ?? e.plannedWeightG,
        toG: applied ?? e.plannedWeightG,
        decision: r?.decision ?? null,
      };
    }),
  };
}

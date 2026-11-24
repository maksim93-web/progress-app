/**
 * Аналитика на реальных сохранённых данных.
 * Объём = Σ (фактический вес × самостоятельно выполненные повторения) по рабочим подходам.
 * Разминочные и выполненные с помощью подходы в объём и рекорды не входят.
 * Расчётный 1ПМ (формула Эпли) — всегда ОЦЕНКА, не выполненный результат.
 */
import type { Dataset } from '../services/dataset';
import type { ExerciseKind, Grams, ID, ISODate, Rating } from './types';
import { addDays, diffDays, weekdayOf, weekIndexFrom } from '../lib/dates';

export type PeriodKey = '1w' | '1m' | '3m' | '6m' | '1y' | 'all';
export const PERIODS: { key: PeriodKey; label: string; days: number | null }[] = [
  { key: '1w', label: 'Неделя', days: 7 },
  { key: '1m', label: 'Месяц', days: 30 },
  { key: '3m', label: '3 мес', days: 91 },
  { key: '6m', label: '6 мес', days: 182 },
  { key: '1y', label: 'Год', days: 365 },
  { key: 'all', label: 'Всё', days: null },
];

export function periodStart(key: PeriodKey, todayISO: ISODate): ISODate | null {
  const p = PERIODS.find((x) => x.key === key);
  return p?.days ? addDays(todayISO, -p.days + 1) : null;
}

/** Расчётный одноповторный максимум (Эпли). Только для 1–10 повторений. */
export function estimate1RM(weightG: Grams, reps: number): Grams | null {
  if (reps < 1 || reps > 10 || weightG <= 0) return null;
  if (reps === 1) return weightG;
  return Math.round((weightG * (1 + reps / 30)) / 100) * 100;
}

export interface LinePoint {
  date: ISODate;
  sessionId: ID;
  weightG: Grams | null; // подтверждённый рабочий вес
  rating: Rating | null;
  pain: boolean;
  volumeG: number; // граммы × повторения
  reps: number;
  bestSelfG: Grams | null;
  e1rmG: Grams | null;
  sets: { weightG: Grams | null; reps: number | null; assisted: boolean }[];
}

export interface LineInfo {
  programExerciseId: ID;
  programId: ID;
  dayId: ID;
  exerciseId: ID;
  exerciseName: string;
  kind: ExerciseKind;
  dayName: string;
  dayLetter: string;
  active: boolean;
  sets: number;
  reps: number;
  /** Подтверждённый вес на СЛЕДУЮЩУЮ тренировку (ещё не выполнен) */
  nextWeightG: Grams | null;
  label: string;
}

export function listLines(ds: Dataset, programId?: ID): LineInfo[] {
  const ex = new Map(ds.exercises.map((e) => [e.id, e]));
  const days = new Map(ds.days.map((d) => [d.id, d]));
  return ds.programExercises
    .filter((p) => !programId || p.programId === programId)
    .map((p) => {
      const e = ex.get(p.exerciseId);
      const d = days.get(p.dayId);
      const name = e?.name ?? 'Упражнение';
      return {
        programExerciseId: p.id,
        programId: p.programId,
        dayId: p.dayId,
        exerciseId: p.exerciseId,
        exerciseName: name,
        kind: e?.kind ?? 'other',
        dayName: d?.name ?? '',
        dayLetter: d?.letter ?? '',
        active: p.status === 'active' && !d?.archived,
        sets: p.sets,
        reps: p.reps,
        nextWeightG: p.workingWeightG,
        label: `${name} · ${d?.letter ?? ''} ${p.sets}×${p.reps}`,
      };
    })
    .sort((a, b) => a.dayLetter.localeCompare(b.dayLetter) || a.exerciseName.localeCompare(b.exerciseName, 'ru'));
}

export function linePoints(ds: Dataset, peId: ID, from: ISODate | null = null): LinePoint[] {
  const sessionDate = new Map(ds.sessions.map((s) => [s.id, s.date]));
  const points: LinePoint[] = [];
  for (const es of ds.exerciseSessions) {
    if (es.programExerciseId !== peId || es.status !== 'done') continue;
    const date = sessionDate.get(es.sessionId);
    if (!date || (from && date < from)) continue;
    const sets = ds.sets.filter((s) => s.exerciseSessionId === es.id && s.kind === 'work' && s.done);
    let volumeG = 0;
    let reps = 0;
    let bestSelfG: Grams | null = null;
    let e1rmG: Grams | null = null;
    for (const s of sets) {
      const r = s.actualReps ?? 0;
      const w = s.actualWeightG ?? 0;
      reps += r;
      if (s.assisted) continue;
      volumeG += w * r;
      if (r >= 1 && (bestSelfG === null || w > bestSelfG)) bestSelfG = w;
      const e = estimate1RM(w, r);
      if (e !== null && (e1rmG === null || e > e1rmG)) e1rmG = e;
    }
    points.push({
      date,
      sessionId: es.sessionId,
      weightG: es.confirmedWeightG,
      rating: es.rating,
      pain: es.pain,
      volumeG,
      reps,
      bestSelfG,
      e1rmG: es.rating === 'failed' && es.failReason === 'assist' ? null : e1rmG,
      sets: sets.map((s) => ({ weightG: s.actualWeightG, reps: s.actualReps, assisted: s.assisted })),
    });
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

export interface LineStats {
  startWeightG: Grams | null;
  currentWeightG: Grams | null; // последний ВЫПОЛНЕННЫЙ рабочий вес
  nextWeightG: Grams | null; // подтверждённый план на следующую тренировку
  bestSelfG: Grams | null;
  gainG: Grams | null;
  gainPct: number | null;
  workouts: number;
  volumeG: number;
  e1rmG: Grams | null;
}

export function lineStats(ds: Dataset, peId: ID, from: ISODate | null = null): LineStats {
  const pts = linePoints(ds, peId, from);
  const pe = ds.programExercises.find((p) => p.id === peId);
  const weights = pts.map((p) => p.weightG).filter((w): w is Grams => w !== null);
  let start: Grams | null = weights[0] ?? null;
  if (!from) {
    const hist = ds.history.filter((h) => h.programExerciseId === peId).sort((a, b) => a.at.localeCompare(b.at));
    if (hist[0] && pts.length) start = hist[0].weightG;
  }
  const current = weights.at(-1) ?? null;
  const best = pts.reduce<Grams | null>((m, p) => (p.bestSelfG !== null && (m === null || p.bestSelfG > m) ? p.bestSelfG : m), null);
  const gain = start !== null && current !== null ? current - start : null;
  const e1 = [...pts].reverse().find((p) => p.e1rmG !== null)?.e1rmG ?? null;
  return {
    startWeightG: start,
    currentWeightG: current,
    nextWeightG: pe?.workingWeightG ?? null,
    bestSelfG: best,
    gainG: gain,
    gainPct: gain !== null && start ? Math.round((gain / start) * 1000) / 10 : null,
    workouts: pts.length,
    volumeG: pts.reduce((s, p) => s + p.volumeG, 0),
    e1rmG: e1,
  };
}

export interface OverallStats {
  workouts: number;
  plannedSlots: number;
  regularityPct: number | null;
  perWeek: number;
  workSets: number;
  reps: number;
  volumeG: number;
  positiveLines: { peId: ID; label: string; gainG: Grams }[];
  stagnantLines: { peId: ID; label: string; weightG: Grams | null; sessions: number }[];
  records: { peId: ID; label: string; weightG: Grams; date: ISODate }[];
  weeklyVolume: { week: string; volumeKg: number; workouts: number }[];
}

export function overallStats(ds: Dataset, from: ISODate | null, todayISO: ISODate): OverallStats {
  const sessions = ds.sessions.filter((s) => !from || s.date >= from);
  const sessionIds = new Set(sessions.map((s) => s.id));
  const es = ds.exerciseSessions.filter((e) => sessionIds.has(e.sessionId));
  const esIds = new Set(es.map((e) => e.id));
  const sets = ds.sets.filter((s) => esIds.has(s.exerciseSessionId) && s.kind === 'work' && s.done);
  const volumeG = sets.reduce((sum, s) => sum + (s.assisted ? 0 : (s.actualWeightG ?? 0) * (s.actualReps ?? 0)), 0);

  // Регулярность: выполнено / запланировано слотов (по программам, от их старта до сегодня)
  let planned = 0;
  for (const program of ds.programs) {
    const begin = from && from > program.startDate ? from : program.startDate;
    if (begin > todayISO) continue;
    const days = ds.days.filter((d) => d.programId === program.id && !d.archived);
    const end = program.status === 'archived' ? program.updatedAt.slice(0, 10) : todayISO;
    for (let d = begin; d <= end && d <= todayISO; d = addDays(d, 1)) {
      const wd = weekdayOf(d);
      planned += days.filter((x) => x.weekday === wd).length;
    }
    // тренировки, проведённые раньше своего планового дня, тоже считаются запланированными
    planned += sessions.filter((x) => x.programId === program.id && x.plannedDate > todayISO).length;
  }
  const firstStart = [...ds.programs].map((p) => p.startDate).sort()[0] ?? todayISO;
  const spanFrom = from && from > firstStart ? from : firstStart;
  const spanDays = Math.max(7, diffDays(todayISO, spanFrom) + 1);

  const lines = listLines(ds);
  const positive: OverallStats['positiveLines'] = [];
  const stagnant: OverallStats['stagnantLines'] = [];
  const records: OverallStats['records'] = [];
  for (const l of lines) {
    const pts = linePoints(ds, l.programExerciseId, from);
    const ws = pts.map((p) => p.weightG).filter((w): w is Grams => w !== null);
    if (ws.length >= 2 && ws.at(-1)! > ws[0]) positive.push({ peId: l.programExerciseId, label: l.label, gainG: ws.at(-1)! - ws[0] });
    if (l.active && ws.length >= 3) {
      const last3 = ws.slice(-3);
      if (last3[2] <= last3[0]) stagnant.push({ peId: l.programExerciseId, label: l.label, weightG: last3[2], sessions: 3 });
    }
    // Личный рекорд линии: лучший самостоятельный вес за всё время
    const all = linePoints(ds, l.programExerciseId);
    let best: { w: Grams; date: ISODate } | null = null;
    for (const p of all) if (p.bestSelfG !== null && (!best || p.bestSelfG > best.w)) best = { w: p.bestSelfG, date: p.date };
    if (best && (!from || best.date >= from)) records.push({ peId: l.programExerciseId, label: l.label, weightG: best.w, date: best.date });
  }

  // Объём по неделям
  const firstProgram = [...ds.programs].sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  const byWeek = new Map<number, { volumeG: number; workouts: number; monday: string }>();
  if (firstProgram) {
    for (const s of sessions) {
      const w = weekIndexFrom(firstProgram.startDate, s.date);
      const cur = byWeek.get(w) ?? { volumeG: 0, workouts: 0, monday: s.date };
      cur.workouts++;
      if (s.date < cur.monday) cur.monday = s.date;
      for (const e of es.filter((x) => x.sessionId === s.id)) {
        for (const st of sets.filter((x) => x.exerciseSessionId === e.id)) {
          if (!st.assisted) cur.volumeG += (st.actualWeightG ?? 0) * (st.actualReps ?? 0);
        }
      }
      byWeek.set(w, cur);
    }
  }
  const weeklyVolume = [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => ({ week: v.monday, volumeKg: Math.round(v.volumeG / 1000), workouts: v.workouts }));

  return {
    workouts: sessions.length,
    plannedSlots: planned,
    regularityPct: planned ? Math.min(100, Math.round((sessions.length / planned) * 100)) : null,
    perWeek: spanDays ? Math.round((sessions.length / (spanDays / 7)) * 10) / 10 : 0,
    workSets: sets.length,
    reps: sets.reduce((s, x) => s + (x.actualReps ?? 0), 0),
    volumeG,
    positiveLines: positive.sort((a, b) => b.gainG - a.gainG),
    stagnantLines: stagnant,
    records: records.sort((a, b) => b.date.localeCompare(a.date)),
    weeklyVolume,
  };
}

export const RATING_SCORE: Record<Rating, number> = { easy: 1, hard: 2, failed: 3 };
export const RATING_LABEL: Record<Rating, string> = { easy: 'Легко', hard: 'Тяжело', failed: 'Не справился' };

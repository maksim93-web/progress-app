import { db } from '../db/database';
import type {
  Grams,
  ID,
  ISODate,
  ProgramExercise,
  ProgressionRule,
  TrainingDay,
  TrainingProgram,
  Weekday,
} from '../domain/types';
import { nowISO, uid } from '../lib/id';
import { formatKg } from '../lib/weight';
import { WEEKDAYS_SHORT } from '../lib/dates';

/* ---------- Черновик программы (мастер создания) ---------- */

export interface DraftExercise {
  key: string;
  exerciseId: ID;
  name: string;
  sets: number;
  reps: number;
  weightG: Grams | null;
  stepG: Grams;
  restSec: number | null;
  comment: string;
  autoProgression: boolean;
}

export interface DraftDay {
  key: string;
  letter: string;
  name: string;
  weekday: Weekday;
  exercises: DraftExercise[];
}

export interface ProgramDraft {
  name: string;
  goal: string;
  daysPerWeek: number;
  cycleWeeks: number;
  startDate: ISODate;
  days: DraftDay[];
}

export const LETTERS = 'ABCDEFG';

export function validateDraft(d: ProgramDraft): string[] {
  const errors: string[] = [];
  if (!d.name.trim()) errors.push('Укажи название программы');
  if (d.daysPerWeek < 1 || d.daysPerWeek > 7) errors.push('Тренировок в неделю: от 1 до 7');
  if (d.days.length !== d.daysPerWeek) errors.push(`Выбери ${d.daysPerWeek} дн. недели`);
  const wd = new Set(d.days.map((x) => x.weekday));
  if (wd.size !== d.days.length) errors.push('Дни недели не должны повторяться');
  d.days.forEach((day) => {
    if (day.exercises.length === 0) errors.push(`Добавь упражнения в тренировку ${day.letter}`);
    day.exercises.forEach((e) => {
      if (e.sets < 1 || e.reps < 1) errors.push(`Проверь подходы и повторения: ${e.name}`);
      if (e.stepG <= 0) errors.push(`Шаг веса должен быть больше нуля: ${e.name}`);
    });
  });
  return errors;
}

async function logChange(programId: ID, description: string) {
  await db.changes.add({ id: uid(), programId, at: nowISO(), description });
}

function makeRule(peId: ID, stepG: Grams, auto: boolean): ProgressionRule {
  return { id: uid(), programExerciseId: peId, stepG, autoProgression: auto, failStreakForDeload: 2, deloadPercent: 10 };
}

/** Создаёт программу из черновика. Прежняя активная программа профиля архивируется. */
export async function createProgramFromDraft(profileId: ID, draft: ProgramDraft): Promise<TrainingProgram> {
  const errors = validateDraft(draft);
  if (errors.length) throw new Error(errors.join('\n'));
  const now = nowISO();
  const program: TrainingProgram = {
    id: uid(),
    profileId,
    name: draft.name.trim(),
    goal: draft.goal.trim(),
    daysPerWeek: draft.daysPerWeek,
    cycleWeeks: draft.cycleWeeks,
    startDate: draft.startDate,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  await db.transaction('rw', [db.programs, db.days, db.programExercises, db.rules, db.history, db.changes], async () => {
    const active = await db.programs.where({ profileId, status: 'active' }).toArray();
    for (const p of active) await db.programs.update(p.id, { status: 'archived', updatedAt: now });
    await db.programs.add(program);
    const sortedDays = [...draft.days].sort((a, b) => a.weekday - b.weekday);
    for (const [i, d] of sortedDays.entries()) {
      const day: TrainingDay = {
        id: uid(),
        programId: program.id,
        letter: d.letter,
        name: d.name.trim() || `Тренировка ${d.letter}`,
        weekday: d.weekday,
        order: i,
        archived: false,
      };
      await db.days.add(day);
      for (const [j, e] of d.exercises.entries()) {
        const pe: ProgramExercise = {
          id: uid(),
          programId: program.id,
          dayId: day.id,
          exerciseId: e.exerciseId,
          order: j,
          sets: e.sets,
          reps: e.reps,
          workingWeightG: e.weightG,
          restSec: e.restSec,
          comment: e.comment,
          status: 'active',
          replacesId: null,
          createdAt: now,
        };
        await db.programExercises.add(pe);
        await db.rules.add(makeRule(pe.id, e.stepG, e.autoProgression));
        if (e.weightG !== null) {
          await db.history.add({ id: uid(), programExerciseId: pe.id, weightG: e.weightG, source: 'initial', recommendationId: null, at: now });
        }
      }
    }
    await db.changes.add({ id: uid(), programId: program.id, at: now, description: 'Программа создана' });
  });
  return program;
}

/* ---------- Чтение ---------- */

export interface ProgramBundle {
  program: TrainingProgram;
  days: TrainingDay[];
  exercises: ProgramExercise[]; // только активные
  rules: Map<ID, ProgressionRule>; // по programExerciseId
  names: Map<ID, string>; // exerciseId → название
}

export async function getActiveProgram(profileId: ID): Promise<TrainingProgram | undefined> {
  return db.programs.where({ profileId, status: 'active' }).first();
}

export async function loadProgramBundle(programId: ID): Promise<ProgramBundle | null> {
  const program = await db.programs.get(programId);
  if (!program) return null;
  const days = (await db.days.where({ programId }).toArray()).filter((d) => !d.archived).sort((a, b) => a.weekday - b.weekday);
  const exercises = (await db.programExercises.where({ programId }).toArray())
    .filter((e) => e.status === 'active')
    .sort((a, b) => a.order - b.order);
  const rulesArr = await db.rules.where('programExerciseId').anyOf(exercises.map((e) => e.id)).toArray();
  const rules = new Map(rulesArr.map((r) => [r.programExerciseId, r]));
  const exIds = [...new Set(exercises.map((e) => e.exerciseId))];
  const exs = await db.exercises.bulkGet(exIds);
  const names = new Map<ID, string>();
  exs.forEach((e) => e && names.set(e.id, e.name));
  return { program, days, exercises, rules, names };
}

/* ---------- Редактирование (применяется к будущим тренировкам) ---------- */

export async function updateProgramMeta(programId: ID, patch: Partial<Pick<TrainingProgram, 'name' | 'goal' | 'cycleWeeks' | 'startDate'>>) {
  await db.programs.update(programId, { ...patch, updatedAt: nowISO() });
  await logChange(programId, 'Изменены настройки программы');
}

export async function renameDay(dayId: ID, name: string) {
  const day = await db.days.get(dayId);
  if (!day) return;
  await db.days.update(dayId, { name: name.trim() || `Тренировка ${day.letter}` });
  await logChange(day.programId, `Тренировка ${day.letter} переименована: «${name.trim()}»`);
}

/** Перенос дня недели. Линии прогрессии привязаны к id дня, поэтому не меняются. */
export async function moveDay(dayId: ID, weekday: Weekday) {
  const day = await db.days.get(dayId);
  if (!day) return;
  const clash = (await db.days.where({ programId: day.programId }).toArray()).find(
    (d) => !d.archived && d.id !== dayId && d.weekday === weekday,
  );
  if (clash) throw new Error(`${WEEKDAYS_SHORT[weekday]} уже занят тренировкой ${clash.letter}`);
  await db.days.update(dayId, { weekday });
  await logChange(day.programId, `Тренировка ${day.letter} перенесена: ${WEEKDAYS_SHORT[day.weekday]} → ${WEEKDAYS_SHORT[weekday]}`);
}

export async function addDay(programId: ID, weekday: Weekday, name: string): Promise<TrainingDay> {
  const all = await db.days.where({ programId }).toArray();
  const active = all.filter((d) => !d.archived);
  if (active.length >= 7) throw new Error('Максимум 7 тренировок в неделю');
  if (active.some((d) => d.weekday === weekday)) throw new Error('Этот день уже занят');
  const used = new Set(all.map((d) => d.letter));
  const letter = [...LETTERS].find((l) => !used.has(l)) ?? String(all.length + 1);
  const day: TrainingDay = { id: uid(), programId, letter, name: name.trim() || `Тренировка ${letter}`, weekday, order: all.length, archived: false };
  await db.days.add(day);
  await db.programs.update(programId, { daysPerWeek: active.length + 1, updatedAt: nowISO() });
  await logChange(programId, `Добавлена тренировка ${letter} (${WEEKDAYS_SHORT[weekday]})`);
  return day;
}

/** Удаление дня из будущего расписания. История тренировок сохраняется. */
export async function archiveDay(dayId: ID) {
  const day = await db.days.get(dayId);
  if (!day) return;
  const active = (await db.days.where({ programId: day.programId }).toArray()).filter((d) => !d.archived);
  if (active.length <= 1) throw new Error('В программе должна остаться хотя бы одна тренировка');
  await db.days.update(dayId, { archived: true });
  await db.programs.update(day.programId, { daysPerWeek: active.length - 1, updatedAt: nowISO() });
  await logChange(day.programId, `Тренировка ${day.letter} убрана из расписания`);
}

export interface NewExerciseParams {
  exerciseId: ID;
  sets: number;
  reps: number;
  weightG: Grams | null;
  stepG: Grams;
  restSec: number | null;
  comment: string;
  autoProgression: boolean;
}

export async function addExerciseToDay(dayId: ID, p: NewExerciseParams): Promise<ProgramExercise> {
  const day = await db.days.get(dayId);
  if (!day) throw new Error('День не найден');
  const siblings = (await db.programExercises.where({ dayId }).toArray()).filter((e) => e.status === 'active');
  const now = nowISO();
  const pe: ProgramExercise = {
    id: uid(),
    programId: day.programId,
    dayId,
    exerciseId: p.exerciseId,
    order: siblings.length ? Math.max(...siblings.map((s) => s.order)) + 1 : 0,
    sets: p.sets,
    reps: p.reps,
    workingWeightG: p.weightG,
    restSec: p.restSec,
    comment: p.comment,
    status: 'active',
    replacesId: null,
    createdAt: now,
  };
  await db.programExercises.add(pe);
  await db.rules.add(makeRule(pe.id, p.stepG, p.autoProgression));
  if (p.weightG !== null) {
    await db.history.add({ id: uid(), programExerciseId: pe.id, weightG: p.weightG, source: 'initial', recommendationId: null, at: now });
  }
  const ex = await db.exercises.get(p.exerciseId);
  await logChange(day.programId, `Тренировка ${day.letter}: добавлено «${ex?.name ?? 'упражнение'}»`);
  return pe;
}

export async function removeProgramExercise(peId: ID) {
  const pe = await db.programExercises.get(peId);
  if (!pe) return;
  await db.programExercises.update(peId, { status: 'removed' });
  const ex = await db.exercises.get(pe.exerciseId);
  await logChange(pe.programId, `Удалено из программы: «${ex?.name ?? 'упражнение'}» (история сохранена)`);
}

/** Копия упражнения из другого дня — получает СОБСТВЕННУЮ независимую линию прогрессии */
export async function duplicateToDay(peId: ID, targetDayId: ID): Promise<ProgramExercise> {
  const src = await db.programExercises.get(peId);
  if (!src) throw new Error('Упражнение не найдено');
  const rule = await db.rules.where({ programExerciseId: peId }).first();
  return addExerciseToDay(targetDayId, {
    exerciseId: src.exerciseId,
    sets: src.sets,
    reps: src.reps,
    weightG: src.workingWeightG,
    stepG: rule?.stepG ?? 2500,
    restSec: src.restSec,
    comment: src.comment,
    autoProgression: rule?.autoProgression ?? true,
  });
}

export async function moveExercise(peId: ID, direction: -1 | 1) {
  const pe = await db.programExercises.get(peId);
  if (!pe) return;
  const list = (await db.programExercises.where({ dayId: pe.dayId }).toArray())
    .filter((e) => e.status === 'active')
    .sort((a, b) => a.order - b.order);
  const i = list.findIndex((e) => e.id === peId);
  const j = i + direction;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await db.transaction('rw', db.programExercises, async () => {
    for (const [k, e] of list.entries()) await db.programExercises.update(e.id, { order: k });
  });
}

export interface ExerciseEdit {
  sets?: number;
  reps?: number;
  restSec?: number | null;
  comment?: string;
  stepG?: Grams;
  autoProgression?: boolean;
  workingWeightG?: Grams | null;
}

/**
 * Изменение параметров упражнения.
 * Если меняется число повторений и repsMode === 'newLine', старая линия закрывается
 * (история сохраняется), создаётся новая линия, требующая калибровки (или с указанным весом).
 */
export async function editProgramExercise(
  peId: ID,
  edit: ExerciseEdit,
  repsMode: 'keepLine' | 'newLine' = 'keepLine',
): Promise<ID> {
  const pe = await db.programExercises.get(peId);
  if (!pe) throw new Error('Упражнение не найдено');
  const rule = await db.rules.where({ programExerciseId: peId }).first();
  const ex = await db.exercises.get(pe.exerciseId);
  const name = ex?.name ?? 'упражнение';
  const now = nowISO();

  if (edit.reps !== undefined && edit.reps !== pe.reps && repsMode === 'newLine') {
    const newPe: ProgramExercise = {
      ...pe,
      id: uid(),
      sets: edit.sets ?? pe.sets,
      reps: edit.reps,
      workingWeightG: edit.workingWeightG !== undefined ? edit.workingWeightG : null,
      restSec: edit.restSec !== undefined ? edit.restSec : pe.restSec,
      comment: edit.comment ?? pe.comment,
      replacesId: pe.id,
      createdAt: now,
    };
    await db.transaction('rw', [db.programExercises, db.rules, db.history, db.changes], async () => {
      await db.programExercises.update(pe.id, { status: 'removed' });
      await db.programExercises.add(newPe);
      await db.rules.add(makeRule(newPe.id, edit.stepG ?? rule?.stepG ?? 2500, edit.autoProgression ?? rule?.autoProgression ?? true));
      if (newPe.workingWeightG !== null) {
        await db.history.add({ id: uid(), programExerciseId: newPe.id, weightG: newPe.workingWeightG, source: 'manual', recommendationId: null, at: now });
      }
      await db.changes.add({ id: uid(), programId: pe.programId, at: now, description: `«${name}»: ${pe.sets}×${pe.reps} → ${newPe.sets}×${newPe.reps}, новая линия прогрессии` });
    });
    return newPe.id;
  }

  const pePatch: Partial<ProgramExercise> = {};
  const notes: string[] = [];
  if (edit.sets !== undefined && edit.sets !== pe.sets) {
    pePatch.sets = edit.sets;
    notes.push(`подходы ${pe.sets} → ${edit.sets}`);
  }
  if (edit.reps !== undefined && edit.reps !== pe.reps) {
    pePatch.reps = edit.reps;
    notes.push(`повторения ${pe.reps} → ${edit.reps}`);
  }
  if (edit.restSec !== undefined) pePatch.restSec = edit.restSec;
  if (edit.comment !== undefined) pePatch.comment = edit.comment;
  if (edit.workingWeightG !== undefined && edit.workingWeightG !== pe.workingWeightG) {
    pePatch.workingWeightG = edit.workingWeightG;
    notes.push(`вес ${formatKg(pe.workingWeightG, true)} → ${formatKg(edit.workingWeightG, true)}`);
  }
  await db.transaction('rw', [db.programExercises, db.rules, db.history, db.changes], async () => {
    if (Object.keys(pePatch).length) await db.programExercises.update(pe.id, pePatch);
    if (rule && (edit.stepG !== undefined || edit.autoProgression !== undefined)) {
      const rp: Partial<ProgressionRule> = {};
      if (edit.stepG !== undefined && edit.stepG !== rule.stepG) {
        rp.stepG = edit.stepG;
        notes.push(`шаг ${formatKg(rule.stepG, true)} → ${formatKg(edit.stepG, true)}`);
      }
      if (edit.autoProgression !== undefined && edit.autoProgression !== rule.autoProgression) {
        rp.autoProgression = edit.autoProgression;
        notes.push(edit.autoProgression ? 'автопрогрессия включена' : 'автопрогрессия выключена');
      }
      if (Object.keys(rp).length) await db.rules.update(rule.id, rp);
    }
    if (pePatch.workingWeightG !== undefined && pePatch.workingWeightG !== null) {
      await db.history.add({ id: uid(), programExerciseId: pe.id, weightG: pePatch.workingWeightG, source: 'manual', recommendationId: null, at: now });
    }
    if (notes.length) await db.changes.add({ id: uid(), programId: pe.programId, at: now, description: `«${name}»: ${notes.join(', ')}` });
  });
  return pe.id;
}

export async function archiveProgram(programId: ID) {
  await db.programs.update(programId, { status: 'archived', updatedAt: nowISO() });
  await logChange(programId, 'Программа архивирована');
}

export async function activateProgram(programId: ID) {
  const p = await db.programs.get(programId);
  if (!p) return;
  const active = await db.programs.where({ profileId: p.profileId, status: 'active' }).toArray();
  for (const a of active) if (a.id !== programId) await db.programs.update(a.id, { status: 'archived', updatedAt: nowISO() });
  await db.programs.update(programId, { status: 'active', updatedAt: nowISO() });
  await logChange(programId, 'Программа снова активна');
}

export async function listPrograms(profileId: ID) {
  return (await db.programs.where({ profileId }).toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listChanges(programId: ID) {
  return (await db.changes.where({ programId }).toArray()).sort((a, b) => b.at.localeCompare(a.at));
}

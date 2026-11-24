/**
 * Динамический тренировочный план: строится из структуры программы,
 * последних ПОДТВЕРЖДЁННЫХ весов и фактически проведённых тренировок.
 * Прогнозных повышений не делает — будущие значения = последний подтверждённый вес.
 */
import type { Dataset } from '../services/dataset';
import type { Grams, ID, ISODate, Rating, TrainingDay, TrainingProgram } from './types';
import { addDays, mondayOf, weekIndexFrom } from '../lib/dates';

export type CellStatus = 'done' | 'missed' | 'next' | 'planned' | 'before_start';
export type ValueKind = 'actual' | 'confirmed' | 'preliminary' | 'calibration' | 'skipped';

export interface PlanCellExercise {
  programExerciseId: ID;
  name: string;
  sets: number;
  reps: number;
  weightG: Grams | null;
  kind: ValueKind;
  rating: Rating | null;
}

export interface PlanCell {
  day: TrainingDay;
  date: ISODate;
  status: CellStatus;
  sessionId: ID | null;
  /** фактическая дата, если тренировку перенесли */
  actualDate: ISODate | null;
  exercises: PlanCellExercise[];
}

export interface PlanWeek {
  index: number; // 0 — неделя старта
  cycleNumber: number; // 1..
  weekInCycle: number; // 1..cycleWeeks
  monday: ISODate;
  cells: PlanCell[];
}

export function cycleInfo(program: TrainingProgram, weekIndex: number) {
  const w = Math.max(0, weekIndex);
  return { cycleNumber: Math.floor(w / program.cycleWeeks) + 1, weekInCycle: (w % program.cycleWeeks) + 1 };
}

export function buildPlan(ds: Dataset, programId: ID, fromWeek: number, toWeek: number, todayISO: ISODate): PlanWeek[] {
  const program = ds.programs.find((p) => p.id === programId);
  if (!program) return [];
  const days = ds.days.filter((d) => d.programId === programId && !d.archived).sort((a, b) => a.weekday - b.weekday);
  const startMonday = mondayOf(program.startDate);
  const nameOf = new Map(ds.exercises.map((e) => [e.id, e.name]));
  const sessions = ds.sessions.filter((s) => s.programId === programId);
  const nextUsed = new Set<ID>(); // дни, у которых «ближайшая» ячейка уже назначена

  // ближайшая непройденная ячейка дня должна учитываться и в неделях до fromWeek
  const todayWeek = weekIndexFrom(program.startDate, todayISO);
  const scanFrom = Math.min(fromWeek, Math.max(0, todayWeek));

  const weeks: PlanWeek[] = [];
  for (let w = scanFrom; w <= toWeek; w++) {
    const monday = addDays(startMonday, w * 7);
    const cells: PlanCell[] = days.map((day) => {
      const date = addDays(monday, day.weekday);
      const session = sessions.find((s) => s.dayId === day.id && weekIndexFrom(program.startDate, s.plannedDate) === w);
      if (session) {
        const exs = ds.exerciseSessions.filter((e) => e.sessionId === session.id).sort((a, b) => a.order - b.order);
        return {
          day,
          date,
          status: 'done',
          sessionId: session.id,
          actualDate: session.date !== date ? session.date : null,
          exercises: exs.map((e) => ({
            programExerciseId: e.programExerciseId,
            name: e.nameSnapshot,
            sets: e.plannedSets,
            reps: e.plannedReps,
            weightG: e.status === 'skipped' ? e.plannedWeightG : e.confirmedWeightG,
            kind: e.status === 'skipped' ? 'skipped' : 'actual',
            rating: e.rating,
          })),
        };
      }
      const pes = ds.programExercises
        .filter((p) => p.dayId === day.id && p.status === 'active')
        .sort((a, b) => a.order - b.order);
      let status: CellStatus;
      if (date < program.startDate) status = 'before_start';
      else if (date < todayISO) status = 'missed';
      else if (!nextUsed.has(day.id)) {
        status = 'next';
        nextUsed.add(day.id);
      } else status = 'planned';
      return {
        day,
        date,
        status,
        sessionId: null,
        actualDate: null,
        exercises: pes.map((p) => ({
          programExerciseId: p.id,
          name: nameOf.get(p.exerciseId) ?? 'Упражнение',
          sets: p.sets,
          reps: p.reps,
          weightG: p.workingWeightG,
          kind: p.workingWeightG === null ? 'calibration' : status === 'next' ? 'confirmed' : 'preliminary',
          rating: null,
        })),
      };
    });
    if (w >= fromWeek) weeks.push({ index: w, ...cycleInfo(program, w), monday, cells });
  }
  return weeks;
}

/** Ближайшая тренировка: первая «next»-ячейка начиная с сегодняшней недели */
export function findNextWorkout(ds: Dataset, programId: ID, todayISO: ISODate): PlanCell | null {
  const program = ds.programs.find((p) => p.id === programId);
  if (!program) return null;
  const tw = Math.max(0, weekIndexFrom(program.startDate, todayISO));
  const weeks = buildPlan(ds, programId, tw, tw + 2, todayISO);
  const cells = weeks.flatMap((w) => w.cells).filter((c) => c.status === 'next' || c.status === 'planned');
  cells.sort((a, b) => a.date.localeCompare(b.date));
  return cells[0] ?? null;
}

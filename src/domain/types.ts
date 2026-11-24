/**
 * Доменная модель PROGRESS.
 *
 * Правила:
 * - У каждой сущности собственный id (строка, генерируется uid()).
 * - Все веса хранятся в целых ГРАММАХ (weightG), чтобы не было ошибок округления.
 *   Перевод в килограммы — только при отображении (lib/weight.ts).
 * - Даты календаря — строки 'YYYY-MM-DD' (локальная дата), моменты времени — ISO-строки.
 * - Ключ прогрессии — ProgramExercise.id. Название упражнения никогда не служит ключом.
 */

export type ID = string;
export type ISODate = string; // 'YYYY-MM-DD'
export type ISODateTime = string; // new Date().toISOString()
export type Grams = number; // целое число граммов

/** 0 = понедельник … 6 = воскресенье */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface UserProfile {
  id: ID;
  name: string;
  createdAt: ISODateTime;
  /** Шаг прогрессии по умолчанию для новых упражнений этого спортсмена */
  defaultStepG: Grams;
}

export type ProgramStatus = 'active' | 'archived';

export interface TrainingProgram {
  id: ID;
  profileId: ID;
  name: string;
  goal: string;
  daysPerWeek: number; // 1..7
  cycleWeeks: number; // продолжительность цикла
  startDate: ISODate;
  status: ProgramStatus;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface TrainingDay {
  id: ID;
  programId: ID;
  /** Буква шаблона: A, B, C … — не меняется при переносе дня */
  letter: string;
  /** Пользовательское название: «Тяжёлый жим» */
  name: string;
  weekday: Weekday;
  order: number;
  archived: boolean;
}

export type ExerciseKind = 'barbell' | 'dumbbell' | 'machine' | 'bodyweight' | 'other';

/** Справочник упражнений (общий + собственные упражнения профиля) */
export interface Exercise {
  id: ID;
  profileId: ID | null; // null — встроенное упражнение
  name: string;
  kind: ExerciseKind;
  custom: boolean;
}

export type ProgramExerciseStatus = 'active' | 'removed';

/**
 * Конкретное упражнение внутри шаблона тренировочного дня = независимая линия прогрессии.
 * workingWeightG — последний ПОДТВЕРЖДЁННЫЙ рабочий вес на следующую тренировку этого дня.
 * null — вес ещё не откалиброван.
 */
export interface ProgramExercise {
  id: ID;
  programId: ID;
  dayId: ID;
  exerciseId: ID;
  order: number;
  sets: number;
  reps: number;
  workingWeightG: Grams | null;
  restSec: number | null;
  comment: string;
  status: ProgramExerciseStatus;
  /** Если линия создана взамен старой (смена повторений) — ссылка на предыдущую */
  replacesId: ID | null;
  createdAt: ISODateTime;
}

/** Правило прогрессии линии (1 к 1 с ProgramExercise) */
export interface ProgressionRule {
  id: ID;
  programExerciseId: ID;
  stepG: Grams;
  autoProgression: boolean;
  /** Сколько неудач подряд считать поводом предложить снижение */
  failStreakForDeload: number;
  /** На сколько процентов предлагать снижение */
  deloadPercent: number;
}

export type SessionStatus = 'in_progress' | 'completed' | 'abandoned';

/** Фактически проведённая тренировка */
export interface WorkoutSession {
  id: ID;
  profileId: ID;
  programId: ID;
  dayId: ID;
  /** Дата, на которую тренировка стояла в плане (для переноса) */
  plannedDate: ISODate;
  /** Фактическая дата проведения */
  date: ISODate;
  startedAt: ISODateTime;
  finishedAt: ISODateTime | null;
  status: SessionStatus;
  currentIndex: number;
  /** Окончание таймера отдыха (переживает перезагрузку) */
  restEndsAt: ISODateTime | null;
  dayNameSnapshot: string;
  dayLetterSnapshot: string;
}

export type Rating = 'easy' | 'hard' | 'failed';
export type FailReason = 'assist' | 'reps';
export type ExerciseSessionStatus = 'pending' | 'active' | 'done' | 'skipped';

/** Результат упражнения в конкретной тренировке (план и факт хранятся раздельно) */
export interface ExerciseSession {
  id: ID;
  sessionId: ID;
  programExerciseId: ID;
  exerciseId: ID;
  nameSnapshot: string;
  order: number;
  // план
  plannedSets: number;
  plannedReps: number;
  plannedWeightG: Grams | null; // null — калибровка
  stepG: Grams;
  autoProgression: boolean;
  isCalibration: boolean;
  restSec: number | null;
  // факт
  status: ExerciseSessionStatus;
  rating: Rating | null;
  failReason: FailReason | null;
  pain: boolean;
  unusual: boolean;
  confirmedWeightG: Grams | null;
  completedAt: ISODateTime | null;
}

export type SetKind = 'warmup' | 'work';

export interface SetResult {
  id: ID;
  exerciseSessionId: ID;
  index: number;
  kind: SetKind;
  plannedReps: number;
  plannedWeightG: Grams | null;
  actualReps: number | null;
  actualWeightG: Grams | null;
  done: boolean;
  /** Подход выполнен с помощью страхующего — не «самостоятельный» */
  assisted: boolean;
  doneAt: ISODateTime | null;
}

export type RecommendationDecision = 'pending' | 'accepted' | 'rejected' | 'custom';

export type RecommendationReason =
  | 'easy_increase'
  | 'easy_auto_off'
  | 'easy_incomplete'
  | 'hard_keep'
  | 'failed_keep'
  | 'failed_deload'
  | 'pain_keep'
  | 'skipped'
  | 'mixed_weights'
  | 'calibration_easy'
  | 'calibration_hard'
  | 'calibration_failed';

export interface WeightRecommendation {
  id: ID;
  programExerciseId: ID;
  exerciseSessionId: ID;
  sessionId: ID;
  fromWeightG: Grams;
  recommendedWeightG: Grams;
  appliedWeightG: Grams | null;
  reason: RecommendationReason;
  tone: 'success' | 'neutral' | 'warning' | 'danger';
  title: string;
  message: string;
  warning: string | null;
  decision: RecommendationDecision;
  createdAt: ISODateTime;
  decidedAt: ISODateTime | null;
}

export type HistorySource = 'initial' | 'calibration' | 'recommendation' | 'manual';

/** История подтверждённых рабочих весов линии */
export interface ProgressHistory {
  id: ID;
  programExerciseId: ID;
  weightG: Grams;
  source: HistorySource;
  recommendationId: ID | null;
  at: ISODateTime;
}

/** Журнал изменений программы */
export interface ProgramChange {
  id: ID;
  programId: ID;
  at: ISODateTime;
  description: string;
}

export interface MetaRecord {
  key: string;
  value: unknown;
}

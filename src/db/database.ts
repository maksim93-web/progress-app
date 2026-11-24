import Dexie, { type Table } from 'dexie';
import type {
  UserProfile,
  TrainingProgram,
  TrainingDay,
  Exercise,
  ProgramExercise,
  ProgressionRule,
  WorkoutSession,
  ExerciseSession,
  SetResult,
  WeightRecommendation,
  ProgressHistory,
  ProgramChange,
  MetaRecord,
  WorkoutMove,
} from '../domain/types';

/**
 * Локальная база IndexedDB (через Dexie).
 * Каждая таблица = отдельная сущность ТЗ. Версия схемы увеличивается при изменениях,
 * что позволит позже добавить облачную синхронизацию (поле updatedAt / журнал).
 */
export class ProgressDB extends Dexie {
  profiles!: Table<UserProfile, string>;
  programs!: Table<TrainingProgram, string>;
  days!: Table<TrainingDay, string>;
  exercises!: Table<Exercise, string>;
  programExercises!: Table<ProgramExercise, string>;
  rules!: Table<ProgressionRule, string>;
  sessions!: Table<WorkoutSession, string>;
  exerciseSessions!: Table<ExerciseSession, string>;
  sets!: Table<SetResult, string>;
  recommendations!: Table<WeightRecommendation, string>;
  history!: Table<ProgressHistory, string>;
  changes!: Table<ProgramChange, string>;
  meta!: Table<MetaRecord, string>;
  moves!: Table<WorkoutMove, string>;

  constructor(name = 'progress-db') {
    super(name);
    this.version(1).stores({
      profiles: 'id',
      programs: 'id, profileId, status, [profileId+status]',
      days: 'id, programId',
      exercises: 'id, profileId, name',
      programExercises: 'id, programId, dayId, exerciseId, status',
      rules: 'id, &programExerciseId',
      sessions: 'id, profileId, programId, dayId, status, date, [profileId+status]',
      exerciseSessions: 'id, sessionId, programExerciseId, completedAt',
      sets: 'id, exerciseSessionId',
      recommendations: 'id, programExerciseId, exerciseSessionId, sessionId',
      history: 'id, programExerciseId, at',
      changes: 'id, programId, at',
      meta: 'key',
    });
    this.version(2).stores({
      moves: 'id, programId, dayId, [dayId+weekIndex]',
    });
  }
}

export let db = new ProgressDB();

/** Для тестов: подменить базу на изолированную */
export function useDatabase(instance: ProgressDB) {
  db = instance;
}

export const ALL_TABLES = [
  'profiles',
  'programs',
  'days',
  'exercises',
  'programExercises',
  'rules',
  'sessions',
  'exerciseSessions',
  'sets',
  'recommendations',
  'history',
  'changes',
  'meta',
  'moves',
] as const;
export type TableName = (typeof ALL_TABLES)[number];

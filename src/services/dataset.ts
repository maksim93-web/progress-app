import { db } from '../db/database';
import type {
  Exercise,
  ExerciseSession,
  ID,
  ProgramExercise,
  ProgressHistory,
  ProgressionRule,
  SetResult,
  TrainingDay,
  TrainingProgram,
  WeightRecommendation,
  WorkoutSession,
  WorkoutMove,
} from '../domain/types';

/** Снимок всех данных профиля — вход для плана, аналитики и помощника */
export interface Dataset {
  programs: TrainingProgram[];
  days: TrainingDay[]; // включая архивные — для истории
  programExercises: ProgramExercise[]; // включая удалённые
  rules: ProgressionRule[];
  exercises: Exercise[];
  sessions: WorkoutSession[]; // только завершённые
  exerciseSessions: ExerciseSession[];
  sets: SetResult[];
  recommendations: WeightRecommendation[];
  history: ProgressHistory[];
  moves: WorkoutMove[];
}

export async function loadDataset(profileId: ID): Promise<Dataset> {
  const programs = await db.programs.where({ profileId }).toArray();
  const programIds = programs.map((p) => p.id);
  const days = await db.days.where('programId').anyOf(programIds).toArray();
  const programExercises = await db.programExercises.where('programId').anyOf(programIds).toArray();
  const peIds = programExercises.map((p) => p.id);
  const rules = await db.rules.where('programExerciseId').anyOf(peIds).toArray();
  const exercises = await db.exercises.toArray();
  const sessions = (await db.sessions.where({ profileId }).toArray()).filter((s) => s.status === 'completed');
  const sessionIds = sessions.map((s) => s.id);
  const exerciseSessions = await db.exerciseSessions.where('sessionId').anyOf(sessionIds).toArray();
  const sets = await db.sets.where('exerciseSessionId').anyOf(exerciseSessions.map((e) => e.id)).toArray();
  const recommendations = await db.recommendations.where('sessionId').anyOf(sessionIds).toArray();
  const history = await db.history.where('programExerciseId').anyOf(peIds).toArray();
  const moves = await db.moves.where('programId').anyOf(programIds).toArray();
  return { programs, days, programExercises, rules, exercises, sessions, exerciseSessions, sets, recommendations, history, moves };
}

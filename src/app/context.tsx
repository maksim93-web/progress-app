import { createContext, useContext } from 'react';
import type { TrainingProgram, UserProfile, WorkoutSession } from '../domain/types';

export interface AppState {
  profile: UserProfile;
  program: TrainingProgram | null;
  activeSession: WorkoutSession | null;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(AppContext);
  if (!v) throw new Error('AppContext не инициализирован');
  return v;
}

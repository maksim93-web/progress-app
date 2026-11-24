import { db } from '../db/database';
import type { Exercise, ExerciseKind, UserProfile } from '../domain/types';
import { BUILTIN_EXERCISES } from '../domain/library';
import { nowISO, uid } from '../lib/id';
import { DEFAULT_STEP_G } from '../lib/weight';

const ACTIVE_PROFILE_KEY = 'activeProfileId';

/** Создаёт встроенный справочник упражнений (идемпотентно) */
export async function seedLibrary() {
  const existing = await db.exercises.bulkGet(BUILTIN_EXERCISES.map((e) => e.id));
  const missing = BUILTIN_EXERCISES.filter((_, i) => !existing[i]);
  if (missing.length) {
    await db.exercises.bulkPut(
      missing.map<Exercise>((e) => ({ id: e.id, profileId: null, name: e.name, kind: e.kind, custom: false })),
    );
  }
}

export async function createProfile(name: string): Promise<UserProfile> {
  const p: UserProfile = { id: uid(), name: name.trim() || 'Спортсмен', createdAt: nowISO(), defaultStepG: DEFAULT_STEP_G };
  await db.profiles.add(p);
  return p;
}

export async function setActiveProfile(id: string) {
  await db.meta.put({ key: ACTIVE_PROFILE_KEY, value: id });
}

/** Возвращает активный профиль, создавая первый при необходимости */
export async function ensureActiveProfile(): Promise<UserProfile> {
  await seedLibrary();
  const meta = await db.meta.get(ACTIVE_PROFILE_KEY);
  if (meta) {
    const p = await db.profiles.get(meta.value as string);
    if (p) return p;
  }
  const any = await db.profiles.toCollection().first();
  if (any) {
    await setActiveProfile(any.id);
    return any;
  }
  const p = await createProfile('Спортсмен');
  await setActiveProfile(p.id);
  return p;
}

export async function updateProfile(id: string, patch: Partial<Pick<UserProfile, 'name' | 'defaultStepG'>>) {
  await db.profiles.update(id, patch);
}

export async function listExercises(profileId: string): Promise<Exercise[]> {
  const all = await db.exercises.toArray();
  return all
    .filter((e) => e.profileId === null || e.profileId === profileId)
    .sort((a, b) => Number(a.custom) - Number(b.custom) || a.name.localeCompare(b.name, 'ru'));
}

export async function createCustomExercise(profileId: string, name: string, kind: ExerciseKind = 'other'): Promise<Exercise> {
  const e: Exercise = { id: uid(), profileId, name: name.trim(), kind, custom: true };
  await db.exercises.add(e);
  return e;
}

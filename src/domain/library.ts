import type { ExerciseKind } from './types';

/** Встроенный справочник упражнений. id стабильны — на них ссылаются программы. */
export const BUILTIN_EXERCISES: { id: string; name: string; kind: ExerciseKind }[] = [
  { id: 'ex-bench', name: 'Жим лёжа', kind: 'barbell' },
  { id: 'ex-bench-close', name: 'Жим узким хватом', kind: 'barbell' },
  { id: 'ex-bench-pause', name: 'Жим лёжа с паузой', kind: 'barbell' },
  { id: 'ex-bench-incline', name: 'Жим штанги на наклонной', kind: 'barbell' },
  { id: 'ex-db-press', name: 'Жим гантелей', kind: 'dumbbell' },
  { id: 'ex-db-incline', name: 'Наклонный жим гантелей', kind: 'dumbbell' },
  { id: 'ex-ohp', name: 'Жим стоя', kind: 'barbell' },
  { id: 'ex-dips', name: 'Отжимания на брусьях', kind: 'bodyweight' },
  { id: 'ex-french', name: 'Французский жим', kind: 'barbell' },
  { id: 'ex-pushdown', name: 'Разгибание рук на блоке', kind: 'machine' },
  { id: 'ex-row', name: 'Тяга штанги', kind: 'barbell' },
  { id: 'ex-cable-row', name: 'Тяга горизонтального блока', kind: 'machine' },
  { id: 'ex-lat', name: 'Тяга верхнего блока', kind: 'machine' },
  { id: 'ex-pullup', name: 'Подтягивания', kind: 'bodyweight' },
  { id: 'ex-db-row', name: 'Тяга гантели в наклоне', kind: 'dumbbell' },
  { id: 'ex-squat', name: 'Приседания со штангой', kind: 'barbell' },
  { id: 'ex-deadlift', name: 'Становая тяга', kind: 'barbell' },
  { id: 'ex-rdl', name: 'Румынская тяга', kind: 'barbell' },
  { id: 'ex-legpress', name: 'Жим ногами', kind: 'machine' },
  { id: 'ex-flyes', name: 'Разведение гантелей', kind: 'dumbbell' },
  { id: 'ex-lateral', name: 'Махи гантелями в стороны', kind: 'dumbbell' },
  { id: 'ex-curl', name: 'Сгибание рук со штангой', kind: 'barbell' },
  { id: 'ex-facepull', name: 'Тяга к лицу', kind: 'machine' },
  { id: 'ex-plank', name: 'Планка', kind: 'bodyweight' },
];

export const GOAL_PRESETS = [
  'Увеличить жим лёжа',
  'Увеличить силу',
  'Набрать мышечную массу',
  'Поддерживать форму',
];

export const KIND_LABEL: Record<ExerciseKind, string> = {
  barbell: 'Штанга',
  dumbbell: 'Гантели',
  machine: 'Тренажёр',
  bodyweight: 'Свой вес',
  other: 'Другое',
};

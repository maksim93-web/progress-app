import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Plus, Search } from 'lucide-react';
import { Button, Field, Stepper, Toggle, WeightInput, cx, inputCls } from '../../ui/kit';
import { STEP_PRESETS_G, formatKg } from '../../lib/weight';
import { createCustomExercise, listExercises } from '../../services/profile';
import { KIND_LABEL } from '../../domain/library';
import type { Exercise, ExerciseKind, Grams } from '../../domain/types';

export interface ExerciseFormValue {
  exerciseId: string;
  name: string;
  sets: number;
  reps: number;
  weightG: Grams | null;
  stepG: Grams;
  restSec: number | null;
  comment: string;
  autoProgression: boolean;
}

const REST_OPTIONS: (number | null)[] = [null, 60, 90, 120, 180, 240];

function Chip({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'h-10 rounded-xl border px-3.5 text-[14px] font-semibold transition',
        on ? 'border-accent/60 bg-accent-soft text-[#c4b9ff]' : 'border-line bg-surface-2 text-ink-2 active:bg-surface-3',
      )}
    >
      {children}
    </button>
  );
}

export function ExerciseForm({
  value,
  onChange,
  weightLabel = 'Рабочий вес',
  showWeight = true,
}: {
  value: ExerciseFormValue;
  onChange: (v: ExerciseFormValue) => void;
  weightLabel?: string;
  showWeight?: boolean;
}) {
  const set = <K extends keyof ExerciseFormValue>(k: K, v: ExerciseFormValue[K]) => onChange({ ...value, [k]: v });
  const customStep = !STEP_PRESETS_G.includes(value.stepG);
  const [showCustomStep, setShowCustomStep] = useState(customStep);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <div className="mb-1.5 px-1 text-[13px] font-medium text-ink-2">Подходы</div>
          <Stepper value={value.sets} min={1} max={20} onChange={(v) => set('sets', v)} />
        </div>
        <div>
          <div className="mb-1.5 px-1 text-[13px] font-medium text-ink-2">Повторения</div>
          <Stepper value={value.reps} min={1} max={100} onChange={(v) => set('reps', v)} />
        </div>
      </div>

      {showWeight && (
        <Field label={weightLabel} hint={value.weightG === null ? 'Можно оставить пустым — определишь вес на первой тренировке' : undefined}>
          <WeightInput valueG={value.weightG} onChange={(g) => set('weightG', g)} placeholder="Не знаю — откалибрую" />
        </Field>
      )}

      <div>
        <div className="mb-1.5 px-1 text-[13px] font-medium text-ink-2">Шаг увеличения общего веса</div>
        <div className="flex flex-wrap gap-2">
          {STEP_PRESETS_G.map((g) => (
            <Chip
              key={g}
              on={!showCustomStep && value.stepG === g}
              onClick={() => {
                setShowCustomStep(false);
                set('stepG', g);
              }}
            >
              {formatKg(g)} кг
            </Chip>
          ))}
          <Chip on={showCustomStep} onClick={() => setShowCustomStep(true)}>
            Своё
          </Chip>
        </div>
        {showCustomStep && (
          <WeightInput className="mt-2" valueG={value.stepG} onChange={(g) => g !== null && g > 0 && set('stepG', g)} placeholder="Например, 3,75" />
        )}
      </div>

      <div>
        <div className="mb-1.5 px-1 text-[13px] font-medium text-ink-2">Отдых между подходами</div>
        <div className="flex flex-wrap gap-2">
          {REST_OPTIONS.map((r) => (
            <Chip key={String(r)} on={value.restSec === r} onClick={() => set('restSec', r)}>
              {r === null ? 'Не задан' : r < 60 ? `${r} с` : `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`}
            </Chip>
          ))}
        </div>
      </div>

      <Toggle
        checked={value.autoProgression}
        onChange={(v) => set('autoProgression', v)}
        label="Автоматическая прогрессия"
        hint={value.autoProgression ? `После «Сделал легко» предложим +${formatKg(value.stepG)} кг` : 'Вес меняешь только вручную'}
      />

      <Field label="Комментарий">
        <input className={inputCls} value={value.comment} placeholder="Например: пауза на груди" onChange={(e) => set('comment', e.target.value)} />
      </Field>
    </div>
  );
}

/** Выбор упражнения из справочника или создание собственного */
export function ExercisePicker({ profileId, onPick }: { profileId: string; onPick: (e: Exercise) => void }) {
  const list = useLiveQuery(() => listExercises(profileId), [profileId]) ?? [];
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<ExerciseKind>('barbell');
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? list.filter((e) => e.name.toLowerCase().includes(s)) : list;
  }, [q, list]);
  const exact = list.some((e) => e.name.toLowerCase() === q.trim().toLowerCase());

  return (
    <div>
      <div className="relative mb-3">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-3" />
        <input className={cx(inputCls, 'pl-11')} placeholder="Найти или создать упражнение" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {q.trim() && !exact && (
        <div className="mb-3 rounded-2xl border border-accent/30 bg-accent-soft p-3">
          <div className="mb-2 text-[14px] font-semibold">Новое упражнение «{q.trim()}»</div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {(Object.keys(KIND_LABEL) as ExerciseKind[]).map((k) => (
              <Chip key={k} on={kind === k} onClick={() => setKind(k)}>
                {KIND_LABEL[k]}
              </Chip>
            ))}
          </div>
          <Button size="md" onClick={async () => onPick(await createCustomExercise(profileId, q, kind))}>
            <Plus size={18} /> Создать и добавить
          </Button>
        </div>
      )}
      <div className="max-h-[52dvh] space-y-1.5 overflow-y-auto">
        {filtered.map((e) => (
          <button key={e.id} onClick={() => onPick(e)} className="flex w-full items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3 text-left active:bg-surface-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-medium">{e.name}</div>
              <div className="text-[12px] text-ink-3">
                {KIND_LABEL[e.kind]}
                {e.custom && ' · своё'}
              </div>
            </div>
            <Check size={18} className="text-ink-3 opacity-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

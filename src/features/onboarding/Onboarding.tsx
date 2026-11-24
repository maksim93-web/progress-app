import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarDays, CheckCheck, ChevronRight, Copy, Flag, Pencil, Plus, Sparkles, Trash2, TrendingUp } from 'lucide-react';
import { Button, Card, IconButton, IconTile, PHOTOS, Pill, Screen, Segments, Sheet, TopBar, cx, inputCls, toast } from '../../ui/kit';
import { useApp } from '../../app/context';
import { navigate } from '../../app/router';
import { LETTERS, createProgramFromDraft, validateDraft, type DraftDay, type DraftExercise, type ProgramDraft } from '../../services/program';
import { WEEKDAYS_FULL, WEEKDAYS_SHORT, formatDateLong, today } from '../../lib/dates';
import { formatKg } from '../../lib/weight';
import { uid } from '../../lib/id';
import type { Weekday } from '../../domain/types';
import { ExerciseForm, ExercisePicker, type ExerciseFormValue } from '../exercise/ExerciseForm';

const DRAFT_KEY = 'progress.onboardingDraft';
type Step = 'welcome' | 'settings' | 'days' | 'builder' | 'weights';
const STEPS: Step[] = ['settings', 'days', 'builder', 'weights'];

/** Предложение дней по умолчанию: 3 → Пн/Ср/Пт и т. п. */
const DEFAULT_WEEKDAYS: Record<number, Weekday[]> = {
  1: [0],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 3, 4],
  6: [0, 1, 2, 3, 4, 5],
  7: [0, 1, 2, 3, 4, 5, 6],
};

function initialDraft(): ProgramDraft {
  return { name: 'Мой жим лёжа', goal: '', daysPerWeek: 3, cycleWeeks: 4, startDate: today(), days: [] };
}

function loadDraft(): { step: Step; draft: ProgramDraft } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveDraft(step: Step, draft: ProgramDraft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ step, draft }));
  } catch {
    /* хранилище недоступно — черновик не критичен */
  }
}
function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

/** Пересобирает дни под выбранные дни недели, сохраняя упражнения и названия по порядку */
function relabelDays(days: DraftDay[]): DraftDay[] {
  return [...days]
    .sort((a, b) => a.weekday - b.weekday)
    .map((d, i) => {
      const letter = LETTERS[i];
      const autoName = /^Тренировка [A-G]$/.test(d.name);
      return { ...d, letter, name: autoName ? `Тренировка ${letter}` : d.name };
    });
}

export function Onboarding({ firstRun }: { firstRun: boolean }) {
  const { profile } = useApp();
  const saved = useMemo(loadDraft, []);
  const [step, setStep] = useState<Step>(saved?.step ?? (firstRun ? 'welcome' : 'settings'));
  const [draft, setDraft] = useState<ProgramDraft>(saved?.draft ?? initialDraft());
  useEffect(() => saveDraft(step, draft), [step, draft]);

  const go = (s: Step) => {
    setStep(s);
    window.scrollTo({ top: 0 });
  };
  const idx = STEPS.indexOf(step as Step);

  const header = step !== 'welcome' && (
    <>
      <div className="relative -mx-4 -mt-[calc(var(--safe-top)+12px)] mb-2 h-[150px] overflow-hidden">
        <img src={PHOTOS.hero} alt="" className="h-full w-full object-cover object-[75%_45%] opacity-80 animate-hero" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(7_7_11/0.4),rgb(7_7_11/0.2)_40%,#07070b)]" />
      </div>
      <div className="relative -mt-[96px] mb-6">
        <TopBar
          onBack={() => (idx > 0 ? go(STEPS[idx - 1]) : firstRun ? go('welcome') : navigate('/program'))}
          title={<span className="text-[15px] text-ink-2">Шаг {idx + 1} из {STEPS.length}</span>}
        />
        <Segments total={STEPS.length} done={(i) => (i < idx ? 'done' : i === idx ? 'current' : 'todo')} />
      </div>
    </>
  );

  if (step === 'welcome') return <Welcome onStart={() => go('settings')} />;

  return (
    <Screen tabbar={false}>
      {header}
      {step === 'settings' && <SettingsStep draft={draft} setDraft={setDraft} onNext={() => go('days')} />}
      {step === 'days' && <DaysStep draft={draft} setDraft={setDraft} onNext={() => go('builder')} />}
      {step === 'builder' && <BuilderStep profileId={profile.id} defaultStepG={profile.defaultStepG} draft={draft} setDraft={setDraft} onNext={() => go('weights')} />}
      {step === 'weights' && (
        <WeightsStep
          draft={draft}
          setDraft={setDraft}
          onCreate={async () => {
            const errors = validateDraft(draft);
            if (errors.length) {
              toast(errors[0]);
              return;
            }
            await createProgramFromDraft(profile.id, draft);
            clearDraft();
            navigate('/', true);
            toast('Программа создана');
          }}
        />
      )}
    </Screen>
  );
}

/* ---------- Экран 1. Приветствие ---------- */

function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden px-5 pb-safe pt-safe">
      <div className="absolute inset-0 animate-hero">
        <img src={PHOTOS.bench} alt="" className="h-full w-full object-cover object-[60%_center]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(7_7_11/0.55)_0%,rgb(7_7_11/0.1)_30%,rgb(7_7_11/0.75)_62%,#07070b_88%)]" />
      </div>
      <div className="relative mt-2 flex items-center gap-2.5 animate-rise">
        <div className="grid h-10 w-10 place-items-center rounded-[13px] bg-gradient-to-br from-[#9479ff] to-[#5b6dff] glow-accent">
          <TrendingUp size={20} strokeWidth={2.6} />
        </div>
        <span className="text-[15px] font-extrabold tracking-[0.28em]">PROGRESS</span>
      </div>
      <div className="relative mt-auto stagger">
        <h1 className="text-[44px] font-extrabold leading-[0.98] tracking-[-0.045em]">
          Твоя программа.
          <br />
          Твои результаты.
          <br />
          <span className="text-gradient">Твой прогресс.</span>
        </h1>
        <p className="mt-4 max-w-[340px] text-[17px] leading-snug text-ink-2">Адаптивный тренировочный план, который развивается вместе с тобой.</p>
        <div className="mt-7 grid grid-cols-3 gap-2">
          {[
            [Pencil, 'Составь программу'],
            [CheckCheck, 'Отмечай подходы'],
            [TrendingUp, 'Получай новый вес'],
          ].map(([Icon, t], i) => {
            const I = Icon as typeof Pencil;
            return (
              <div key={i} className="glass rounded-[18px] p-3">
                <I size={20} className="text-accent-2" />
                <div className="mt-2 text-[13px] font-medium leading-tight text-ink">{t as string}</div>
              </div>
            );
          })}
        </div>
        <Button size="xl" onClick={onStart} className="mt-6">
          Создать программу <ChevronRight size={20} />
        </Button>
      </div>
    </div>
  );
}

/* ---------- Экран 2. Основные настройки ---------- */

function SettingsStep({ draft, setDraft, onNext }: { draft: ProgramDraft; setDraft: (d: ProgramDraft) => void; onNext: () => void }) {
  const [showDate, setShowDate] = useState(draft.startDate !== today());
  return (
    <div>
      <StepHead title="Новая программа" sub="Название и сколько раз в неделю тренируешься" />
      <div className="space-y-4 stagger">
        <div className="glass rounded-[var(--radius-card)] p-4">
          <div className="mb-2 text-[13px] font-medium text-ink-2">Название программы</div>
          <input
            className="w-full bg-transparent text-[24px] font-bold tracking-[-0.02em] outline-none placeholder:text-ink-3"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Например, Жим 100+"
          />
        </div>
        <div className="glass rounded-[var(--radius-card)] p-4">
          <div className="mb-3 flex items-center gap-3">
            <IconTile tone="accent">
              <CalendarDays size={22} />
            </IconTile>
            <div>
              <div className="text-[16px] font-semibold">Тренировок в неделю</div>
              <div className="text-[13px] text-ink-3">Дни выберешь на следующем шаге</div>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <button
                key={n}
                onClick={() => setDraft({ ...draft, daysPerWeek: n, days: [] })}
                className={cx(
                  'num h-14 rounded-2xl text-[22px] font-extrabold transition active:scale-95',
                  draft.daysPerWeek === n ? 'bg-gradient-to-b from-[#9479ff] to-[#5f3ff0] text-white glow-accent' : 'bg-white/[0.05] text-ink-2',
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="glass rounded-[var(--radius-card)] p-4">
          <button onClick={() => setShowDate(!showDate)} className="flex w-full items-center gap-3 text-left">
            <IconTile tone="neutral">
              <Flag size={20} />
            </IconTile>
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-semibold">Начало</div>
              <div className="text-[13px] text-ink-3">{draft.startDate === today() ? 'Сегодня' : formatDateLong(draft.startDate)}</div>
            </div>
            <span className="text-[14px] font-semibold text-accent-2">{showDate ? 'Готово' : 'Изменить'}</span>
          </button>
          {showDate && <input type="date" className={cx(inputCls, 'mt-3')} value={draft.startDate} onChange={(e) => e.target.value && setDraft({ ...draft, startDate: e.target.value })} />}
        </div>
      </div>
      <div className="mt-8">
        <Button size="xl" disabled={!draft.name.trim()} onClick={onNext}>
          Продолжить
        </Button>
      </div>
    </div>
  );
}

function StepHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-5 animate-rise">
      <h1 className="text-[34px] font-extrabold leading-[1.05] tracking-[-0.035em]">{title}</h1>
      <div className="mt-1.5 text-[15px] leading-snug text-ink-2">{sub}</div>
    </div>
  );
}

/* ---------- Экран 3. Выбор дней ---------- */

function DaysStep({ draft, setDraft, onNext }: { draft: ProgramDraft; setDraft: (d: ProgramDraft) => void; onNext: () => void }) {
  useEffect(() => {
    if (draft.days.length === 0) {
      const days = DEFAULT_WEEKDAYS[draft.daysPerWeek].map<DraftDay>((w) => ({ key: uid(), letter: 'A', name: 'Тренировка A', weekday: w, exercises: [] }));
      setDraft({ ...draft, days: relabelDays(days) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const selected = new Map(draft.days.map((d) => [d.weekday, d]));
  const need = draft.daysPerWeek;
  const count = draft.days.length;

  const toggle = (w: Weekday) => {
    if (selected.has(w)) setDraft({ ...draft, days: relabelDays(draft.days.filter((d) => d.weekday !== w)) });
    else {
      if (count >= need) {
        toast(`Выбрано ${need} из ${need}. Сними один день, чтобы выбрать другой`);
        return;
      }
      setDraft({ ...draft, days: relabelDays([...draft.days, { key: uid(), letter: 'A', name: 'Тренировка A', weekday: w, exercises: [] }]) });
    }
  };

  return (
    <div className="animate-rise">
      <StepHead title="Дни тренировок" sub={`Выбери ${need} ${need === 1 ? 'день' : need < 5 ? 'дня' : 'дней'} и дай тренировкам названия. Потом любую тренировку можно перенести`} />
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS_SHORT.map((label, i) => {
          const d = selected.get(i as Weekday);
          return (
            <button
              key={label}
              onClick={() => toggle(i as Weekday)}
              className={cx(
                'flex aspect-[0.78] flex-col items-center justify-center gap-1 rounded-2xl border text-[15px] font-semibold transition active:scale-95',
                d ? 'border-accent/70 bg-gradient-to-b from-accent/40 to-accent/10 text-white glow-accent' : 'glass text-ink-2',
              )}
            >
              {label}
              <span className={cx('grid h-6 w-6 place-items-center rounded-full text-[12px]', d ? 'bg-accent text-white' : 'bg-white/5 text-transparent')}>{d?.letter ?? '·'}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex justify-center">
        <Pill tone={count === need ? 'success' : 'neutral'}>
          Выбрано {count} из {need}
        </Pill>
      </div>
      <div className="mt-5 space-y-2.5">
        {draft.days.map((d) => (
          <div key={d.key} className="glass flex items-center gap-3 rounded-[20px] p-3.5">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#9479ff] to-[#5b6dff] text-[19px] font-extrabold text-white glow-accent">{d.letter}</div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] text-ink-3">{WEEKDAYS_FULL[d.weekday]}</div>
              <input
                className="w-full bg-transparent text-[16px] font-semibold outline-none placeholder:text-ink-3"
                value={d.name}
                placeholder={`Тренировка ${d.letter}`}
                onChange={(e) => setDraft({ ...draft, days: draft.days.map((x) => (x.key === d.key ? { ...x, name: e.target.value } : x)) })}
              />
            </div>
            <Pencil size={16} className="text-ink-3" />
          </div>
        ))}
      </div>
      <div className="mt-8">
        <Button size="xl" disabled={count !== need} onClick={onNext}>
          {count === need ? 'Продолжить' : `Выбери ещё ${need - count}`}
        </Button>
      </div>
    </div>
  );
}

/* ---------- Экран 4. Конструктор тренировок ---------- */

function toDraftExercise(v: ExerciseFormValue, key?: string): DraftExercise {
  return { key: key ?? uid(), ...v };
}

function BuilderStep({
  profileId,
  defaultStepG,
  draft,
  setDraft,
  onNext,
}: {
  profileId: string;
  defaultStepG: number;
  draft: ProgramDraft;
  setDraft: (d: ProgramDraft) => void;
  onNext: () => void;
}) {
  const [activeKey, setActiveKey] = useState(draft.days[0]?.key);
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<{ value: ExerciseFormValue; key: string | null } | null>(null);
  const [copying, setCopying] = useState(false);
  const day = draft.days.find((d) => d.key === activeKey) ?? draft.days[0];
  if (!day) return null;

  const updateDay = (exercises: DraftExercise[]) => setDraft({ ...draft, days: draft.days.map((d) => (d.key === day.key ? { ...d, exercises } : d)) });
  const move = (i: number, dir: -1 | 1) => {
    const list = [...day.exercises];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    updateDay(list);
  };
  const others = draft.days.filter((d) => d.key !== day.key && d.exercises.length);
  const emptyDays = draft.days.filter((d) => d.exercises.length === 0);

  return (
    <div className="animate-rise">
      <StepHead title="Упражнения" sub="Состав повторяется каждую неделю, пока ты его не изменишь" />
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {draft.days.map((d) => (
          <button
            key={d.key}
            onClick={() => setActiveKey(d.key)}
            className={cx(
              'flex shrink-0 items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-left transition',
              d.key === day.key ? 'border-accent/70 bg-accent-soft' : 'border-line bg-surface',
            )}
          >
            <span className={cx('grid h-7 w-7 place-items-center rounded-lg text-[14px] font-bold', d.key === day.key ? 'bg-accent text-white' : 'bg-white/5 text-ink-2')}>{d.letter}</span>
            <span>
              <span className="block text-[12px] text-ink-3">{WEEKDAYS_SHORT[d.weekday]}</span>
              <span className="block max-w-[130px] truncate text-[14px] font-semibold">{d.name}</span>
            </span>
            {d.exercises.length > 0 && <span className="num text-[12px] text-ink-3">{d.exercises.length}</span>}
          </button>
        ))}
      </div>

      <div className="space-y-2.5">
        {day.exercises.map((e, i) => (
          <div key={e.key} className="glass rounded-2xl p-3.5">
            <div className="flex items-start gap-3">
              <div className="num mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/5 text-[14px] font-bold text-ink-2">{i + 1}</div>
              <button className="min-w-0 flex-1 text-left" onClick={() => setEditing({ value: { ...e }, key: e.key })}>
                <div className="text-[16px] font-semibold">{e.name}</div>
                <div className="num mt-0.5 text-[14px] text-ink-2">
                  {e.sets} × {e.reps}
                  {e.weightG !== null ? ` · ${formatKg(e.weightG, true)}` : ''}
                  <span className="text-ink-3"> · шаг {formatKg(e.stepG)}</span>
                </div>
                {e.weightG === null && (
                  <Pill tone="warn" className="mt-1.5">
                    Требуется калибровка
                  </Pill>
                )}
              </button>
            </div>
            <div className="mt-2.5 flex gap-1.5 border-t border-line pt-2.5">
              <IconButton aria-label="Выше" className="h-9 w-9" disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp size={17} />
              </IconButton>
              <IconButton aria-label="Ниже" className="h-9 w-9" disabled={i === day.exercises.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown size={17} />
              </IconButton>
              <IconButton aria-label="Изменить" className="h-9 w-9" onClick={() => setEditing({ value: { ...e }, key: e.key })}>
                <Pencil size={16} />
              </IconButton>
              <div className="flex-1" />
              <IconButton aria-label="Удалить" className="h-9 w-9 text-danger" onClick={() => updateDay(day.exercises.filter((x) => x.key !== e.key))}>
                <Trash2 size={16} />
              </IconButton>
            </div>
          </div>
        ))}
        {day.exercises.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center text-[14px] text-ink-3">В тренировке {day.letter} пока нет упражнений</div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" size="md" onClick={() => setPicking(true)}>
          <Plus size={18} /> Упражнение
        </Button>
        <Button variant="secondary" size="md" disabled={others.length === 0} onClick={() => setCopying(true)}>
          <Copy size={16} /> Копировать
        </Button>
      </div>

      <div className="mt-8">
        <Button
          size="xl"
          disabled={day.exercises.length === 0}
          onClick={() => {
            const next = draft.days.find((d) => d.exercises.length === 0);
            if (next) setActiveKey(next.key);
            else onNext();
          }}
        >
          {day.exercises.length === 0 ? `Добавь упражнения в ${day.letter}` : emptyDays.length > 0 ? `Дальше: тренировка ${emptyDays[0].letter}` : 'Продолжить'}
        </Button>
      </div>

      <Sheet open={picking} onClose={() => setPicking(false)} title="Добавить упражнение">
        <ExercisePicker
          profileId={profileId}
          onPick={(ex) => {
            setPicking(false);
            setEditing({
              key: null,
              value: { exerciseId: ex.id, name: ex.name, sets: 3, reps: 8, weightG: null, stepG: defaultStepG, restSec: 120, comment: '', autoProgression: true },
            });
          }}
        />
      </Sheet>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.value.name}>
        {editing && (
          <>
            <ExerciseForm value={editing.value} onChange={(v) => setEditing({ ...editing, value: v })} />
            <div className="mt-6">
              <Button
                size="lg"
                onClick={() => {
                  if (editing.key) updateDay(day.exercises.map((x) => (x.key === editing.key ? toDraftExercise(editing.value, x.key) : x)));
                  else updateDay([...day.exercises, toDraftExercise(editing.value)]);
                  setEditing(null);
                }}
              >
                {editing.key ? 'Сохранить' : `Добавить в тренировку ${day.letter}`}
              </Button>
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={copying} onClose={() => setCopying(false)} title={`Скопировать в тренировку ${day.letter}`}>
        <p className="mb-3 text-[14px] text-ink-2">Копия получит собственный рабочий вес и отдельную историю прогрессии.</p>
        <div className="space-y-4">
          {others.map((o) => (
            <div key={o.key}>
              <div className="mb-1.5 px-1 text-[13px] font-semibold text-ink-3">
                {o.letter} · {o.name}
              </div>
              <div className="space-y-1.5">
                {o.exercises.map((e) => (
                  <button
                    key={e.key}
                    onClick={() => {
                      updateDay([...day.exercises, { ...e, key: uid() }]);
                      setCopying(false);
                      toast(`«${e.name}» скопировано`);
                    }}
                    className="flex w-full items-center justify-between rounded-2xl bg-surface-2 px-4 py-3 text-left active:bg-surface-3"
                  >
                    <span className="text-[15px] font-medium">{e.name}</span>
                    <span className="num text-[14px] text-ink-3">
                      {e.sets}×{e.reps}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

/* ---------- Экран 5. Калибровка весов ---------- */

function WeightsStep({ draft, setDraft, onCreate }: { draft: ProgramDraft; setDraft: (d: ProgramDraft) => void; onCreate: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const unknown = draft.days.reduce((n, d) => n + d.exercises.filter((e) => e.weightG === null).length, 0);
  const setWeight = (dayKey: string, exKey: string, g: number | null) =>
    setDraft({
      ...draft,
      days: draft.days.map((d) => (d.key === dayKey ? { ...d, exercises: d.exercises.map((e) => (e.key === exKey ? { ...e, weightG: g } : e)) } : d)),
    });

  return (
    <div className="animate-rise">
      <StepHead title="Рабочие веса" sub="Укажи известные веса. Неизвестные оставь пустыми — определишь их на первой тренировке без попыток на максимум." />
      <div className="space-y-5">
        {draft.days.map((d) => (
          <div key={d.key}>
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className="grid h-6 w-6 place-items-center rounded-md bg-accent-soft text-[12px] font-bold text-[#c4b9ff]">{d.letter}</span>
              <span className="text-[15px] font-semibold">{d.name}</span>
              <span className="text-[13px] text-ink-3">· {WEEKDAYS_SHORT[d.weekday]}</span>
            </div>
            <Card className="space-y-3 p-3">
              {d.exercises.map((e) => (
                <div key={e.key} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-medium">{e.name}</div>
                    <div className="num text-[13px] text-ink-3">
                      {e.sets} × {e.reps}
                    </div>
                    {e.weightG === null && <div className="mt-0.5 text-[12px] font-medium text-warn">Требуется калибровка</div>}
                  </div>
                  <WeightCell valueG={e.weightG} onChange={(g) => setWeight(d.key, e.key, g)} />
                </div>
              ))}
            </Card>
          </div>
        ))}
      </div>
      {unknown > 0 && (
        <div className="mt-5 flex gap-3 rounded-2xl border border-accent/25 bg-accent-soft p-4 text-[14px] text-ink-2">
          <Sparkles size={20} className="mt-0.5 shrink-0 text-[#b3a5ff]" />
          <div>
            Без веса: {unknown}. В зале просто укажи вес, с которым выполнил подходы, — он станет стартовым, и включится автоматическая прогрессия.
          </div>
        </div>
      )}
      <div className="mt-8">
        <Button
          size="xl"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onCreate();
            } finally {
              setBusy(false);
            }
          }}
        >
          Создать программу <ChevronRight size={20} />
        </Button>
      </div>
    </div>
  );
}

function WeightCell({ valueG, onChange }: { valueG: number | null; onChange: (g: number | null) => void }) {
  const [text, setText] = useState(valueG === null ? '' : formatKg(valueG));
  return (
    <div className="relative w-[118px] shrink-0">
      <input
        inputMode="decimal"
        value={text}
        placeholder="—"
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.,]/g, '').replace('.', ',');
          setText(t);
          const n = Number(t.replace(',', '.'));
          onChange(t === '' || !Number.isFinite(n) ? null : Math.round(n * 1000));
        }}
        className="num h-12 w-full rounded-xl border border-line-strong bg-surface-2 pl-3 pr-9 text-right text-[17px] font-semibold outline-none focus:border-accent/60"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-3">кг</span>
    </div>
  );
}

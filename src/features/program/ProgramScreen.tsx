import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, ArrowDown, ArrowUp, CalendarDays, Copy, FilePlus2, History as HistoryIcon, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useApp } from '../../app/context';
import { navigate } from '../../app/router';
import { Button, Card, Field, PageTitle, Pill, Screen, Segmented, SectionTitle, Sheet, Stepper, cx, inputCls, toast } from '../../ui/kit';
import {
  activateProgram,
  addDay,
  addExerciseToDay,
  archiveDay,
  archiveProgram,
  duplicateToDay,
  editProgramExercise,
  listChanges,
  listPrograms,
  loadProgramBundle,
  moveDay,
  moveExercise,
  removeProgramExercise,
  renameDay,
  updateProgramMeta,
  type ProgramBundle,
} from '../../services/program';
import { WEEKDAYS_FULL, WEEKDAYS_SHORT, formatDateLong, formatDateShort } from '../../lib/dates';
import { formatKg } from '../../lib/weight';
import type { ProgramExercise, TrainingDay, Weekday } from '../../domain/types';
import { ExerciseForm, ExercisePicker, type ExerciseFormValue } from '../exercise/ExerciseForm';
import { PlanView } from './PlanView';

export function ProgramScreen({ tab }: { tab: 'structure' | 'plan' }) {
  const { profile, program } = useApp();
  const bundle = useLiveQuery(() => (program ? loadProgramBundle(program.id) : null), [program?.id]);

  return (
    <Screen>
      <PageTitle sub={program?.name}>Программа</PageTitle>
      <Segmented
        className="mb-5"
        value={tab}
        onChange={(v) => navigate(v === 'plan' ? '/program/plan' : '/program', true)}
        options={[
          { value: 'structure', label: 'Структура' },
          { value: 'plan', label: 'План' },
        ]}
      />
      {bundle && tab === 'structure' && <Structure bundle={bundle} profileId={profile.id} defaultStepG={profile.defaultStepG} />}
      {bundle && tab === 'plan' && <PlanView programId={bundle.program.id} />}
    </Screen>
  );
}

/* ---------- Структура ---------- */

function Structure({ bundle, profileId, defaultStepG }: { bundle: ProgramBundle; profileId: string; defaultStepG: number }) {
  const { program, days, exercises, rules, names } = bundle;
  const [metaOpen, setMetaOpen] = useState(false);
  const [dayEdit, setDayEdit] = useState<TrainingDay | null>(null);
  const [addDayOpen, setAddDayOpen] = useState(false);
  const [picking, setPicking] = useState<TrainingDay | null>(null);
  const [copyTo, setCopyTo] = useState<TrainingDay | null>(null);
  const [editing, setEditing] = useState<{ pe: ProgramExercise | null; dayId: string; value: ExerciseFormValue } | null>(null);
  const [repsAsk, setRepsAsk] = useState(false);
  const changes = useLiveQuery(() => listChanges(program.id), [program.id]) ?? [];
  const programs = useLiveQuery(() => listPrograms(profileId), [profileId]) ?? [];
  const [archiveAsk, setArchiveAsk] = useState(false);

  const openEdit = (pe: ProgramExercise) => {
    const r = rules.get(pe.id);
    setEditing({
      pe,
      dayId: pe.dayId,
      value: {
        exerciseId: pe.exerciseId,
        name: names.get(pe.exerciseId) ?? '',
        sets: pe.sets,
        reps: pe.reps,
        weightG: pe.workingWeightG,
        stepG: r?.stepG ?? defaultStepG,
        restSec: pe.restSec,
        comment: pe.comment,
        autoProgression: r?.autoProgression ?? true,
      },
    });
  };

  const save = async (mode?: 'keepLine' | 'newLine') => {
    if (!editing) return;
    const v = editing.value;
    try {
      if (!editing.pe) {
        await addExerciseToDay(editing.dayId, { ...v, weightG: v.weightG });
        toast('Упражнение добавлено');
      } else {
        if (v.reps !== editing.pe.reps && !mode) {
          setRepsAsk(true);
          return;
        }
        await editProgramExercise(
          editing.pe.id,
          { sets: v.sets, reps: v.reps, restSec: v.restSec, comment: v.comment, stepG: v.stepG, autoProgression: v.autoProgression, workingWeightG: mode === 'newLine' ? null : v.weightG },
          mode ?? 'keepLine',
        );
        toast(mode === 'newLine' ? 'Создана новая линия — вес определишь на тренировке' : 'Изменения применятся к будущим тренировкам');
      }
      setRepsAsk(false);
      setEditing(null);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <div className="animate-rise">
      <Card className="p-4" onClick={() => setMetaOpen(true)}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[18px] font-semibold">{program.name}</div>
            <div className="truncate text-[14px] text-ink-2">{program.goal}</div>
          </div>
          <Pencil size={17} className="mt-1 text-ink-3" />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Pill tone="accent">{program.daysPerWeek} трен. в неделю</Pill>
          <Pill>Цикл {program.cycleWeeks} нед.</Pill>
          <Pill>Старт {formatDateLong(program.startDate)}</Pill>
        </div>
      </Card>

      {days.map((d) => {
        const list = exercises.filter((e) => e.dayId === d.id);
        return (
          <div key={d.id}>
            <SectionTitle
              right={
                <button className="inline-flex h-8 items-center gap-1 rounded-lg px-2 font-medium text-ink-2 active:bg-white/5" onClick={() => setDayEdit(d)}>
                  <Pencil size={14} /> День
                </button>
              }
            >
              <span className="inline-flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-[14px] font-bold">{d.letter}</span>
                {d.name}
                <span className="text-[14px] font-medium text-ink-3">· {WEEKDAYS_SHORT[d.weekday]}</span>
              </span>
            </SectionTitle>
            <div className="glass divide-y divide-white/[0.06] overflow-hidden rounded-[var(--radius-card)]">
              {list.map((pe, i) => {
                const r = rules.get(pe.id);
                return (
                  <div key={pe.id} className="flex items-center gap-2 py-2 pl-4 pr-2">
                    <button className="min-w-0 flex-1 py-1 text-left" onClick={() => openEdit(pe)}>
                      <div className="truncate text-[15px] font-semibold">{names.get(pe.exerciseId)}</div>
                      <div className="num text-[13px] text-ink-3">
                        {pe.sets}×{pe.reps} · шаг {formatKg(r?.stepG ?? 0)}
                        {r && !r.autoProgression && ' · авто выкл.'}
                      </div>
                    </button>
                    {pe.workingWeightG === null ? <Pill tone="warn">калибр.</Pill> : <span className="num text-[16px] font-semibold">{formatKg(pe.workingWeightG, true)}</span>}
                    <div className="flex flex-col">
                      <button aria-label="Выше" disabled={i === 0} onClick={() => moveExercise(pe.id, -1)} className="grid h-7 w-8 place-items-center text-ink-3 disabled:opacity-20">
                        <ArrowUp size={15} />
                      </button>
                      <button aria-label="Ниже" disabled={i === list.length - 1} onClick={() => moveExercise(pe.id, 1)} className="grid h-7 w-8 place-items-center text-ink-3 disabled:opacity-20">
                        <ArrowDown size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
              <div className="grid grid-cols-2">
                <button className="flex h-12 items-center justify-center gap-1.5 text-[14px] font-semibold text-[#b3a5ff] active:bg-white/5" onClick={() => setPicking(d)}>
                  <Plus size={17} /> Добавить
                </button>
                <button
                  className="flex h-12 items-center justify-center gap-1.5 border-l border-line text-[14px] font-semibold text-ink-2 active:bg-white/5 disabled:opacity-30"
                  disabled={days.length < 2}
                  onClick={() => setCopyTo(d)}
                >
                  <Copy size={15} /> Из другого дня
                </button>
              </div>
            </div>
          </div>
        );
      })}

      <div className="mt-4">
        <Button variant="secondary" disabled={days.length >= 7} onClick={() => setAddDayOpen(true)}>
          <CalendarDays size={18} /> Добавить тренировочный день
        </Button>
      </div>

      <SectionTitle>Программы</SectionTitle>
      <div className="space-y-2">
        <Button variant="secondary" onClick={() => navigate('/onboarding')}>
          <FilePlus2 size={18} /> Создать новую программу
        </Button>
        <Button variant="ghost" onClick={() => setArchiveAsk(true)}>
          <Archive size={18} /> Архивировать текущую
        </Button>
        {programs
          .filter((p) => p.status === 'archived')
          .map((p) => (
            <div key={p.id} className="glass flex items-center gap-3 rounded-2xl p-3.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold">{p.name}</div>
                <div className="text-[12px] text-ink-3">в архиве · старт {formatDateShort(p.startDate)}</div>
              </div>
              <Button variant="secondary" size="md" block={false} onClick={() => activateProgram(p.id)}>
                <RotateCcw size={15} /> Вернуть
              </Button>
            </div>
          ))}
      </div>

      {changes.length > 0 && (
        <>
          <SectionTitle>
            <span className="inline-flex items-center gap-2">
              <HistoryIcon size={18} className="text-ink-3" /> Журнал изменений
            </span>
          </SectionTitle>
          <div className="glass divide-y divide-white/[0.06] rounded-[var(--radius-card)] px-4">
            {changes.slice(0, 12).map((c) => (
              <div key={c.id} className="py-2.5">
                <div className="text-[14px]">{c.description}</div>
                <div className="text-[12px] text-ink-3">{new Date(c.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Настройки программы */}
      <MetaSheet open={metaOpen} onClose={() => setMetaOpen(false)} bundle={bundle} />

      {/* День */}
      <DaySheet day={dayEdit} days={days} onClose={() => setDayEdit(null)} />

      <AddDaySheet open={addDayOpen} onClose={() => setAddDayOpen(false)} programId={program.id} days={days} />

      <Sheet open={!!picking} onClose={() => setPicking(null)} title={`Добавить в тренировку ${picking?.letter ?? ''}`}>
        <ExercisePicker
          profileId={profileId}
          onPick={(ex) => {
            const d = picking!;
            setPicking(null);
            setEditing({ pe: null, dayId: d.id, value: { exerciseId: ex.id, name: ex.name, sets: 3, reps: 8, weightG: null, stepG: defaultStepG, restSec: 120, comment: '', autoProgression: true } });
          }}
        />
      </Sheet>

      <Sheet open={!!copyTo} onClose={() => setCopyTo(null)} title={`Скопировать в тренировку ${copyTo?.letter ?? ''}`}>
        <p className="mb-3 text-[14px] text-ink-2">Копия получит собственный рабочий вес и независимую историю.</p>
        <div className="space-y-4">
          {days
            .filter((d) => d.id !== copyTo?.id)
            .map((d) => (
              <div key={d.id}>
                <div className="mb-1.5 px-1 text-[13px] font-semibold text-ink-3">
                  {d.letter} · {d.name}
                </div>
                <div className="space-y-1.5">
                  {exercises
                    .filter((e) => e.dayId === d.id)
                    .map((e) => (
                      <button
                        key={e.id}
                        onClick={async () => {
                          await duplicateToDay(e.id, copyTo!.id);
                          setCopyTo(null);
                          toast('Скопировано');
                        }}
                        className="flex w-full items-center justify-between rounded-2xl bg-surface-2 px-4 py-3 text-left active:bg-surface-3"
                      >
                        <span className="text-[15px] font-medium">{names.get(e.exerciseId)}</span>
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

      <Sheet open={!!editing} onClose={() => { setEditing(null); setRepsAsk(false); }} title={editing?.value.name}>
        {editing && !repsAsk && (
          <>
            <ExerciseForm value={editing.value} onChange={(v) => setEditing({ ...editing, value: v })} weightLabel={editing.pe ? 'Рабочий вес на следующую тренировку' : 'Рабочий вес'} />
            <div className="mt-6 space-y-2">
              <Button onClick={() => save()}>{editing.pe ? 'Сохранить' : 'Добавить'}</Button>
              {editing.pe && (
                <Button
                  variant="danger"
                  onClick={async () => {
                    await removeProgramExercise(editing.pe!.id);
                    setEditing(null);
                    toast('Упражнение удалено. История сохранена');
                  }}
                >
                  <Trash2 size={17} /> Удалить из программы
                </Button>
              )}
            </div>
          </>
        )}
        {editing && repsAsk && (
          <div>
            <p className="mb-4 text-[15px] text-ink-2">
              Повторения меняются: {editing.pe!.reps} → {editing.value.reps}. Прежний вес может не подойти.
            </p>
            <div className="space-y-2">
              <Button onClick={() => save('newLine')}>Новая линия и калибровка веса</Button>
              <Button variant="secondary" onClick={() => save('keepLine')}>
                Оставить линию и вес {formatKg(editing.value.weightG, true)}
              </Button>
            </div>
            <p className="mt-3 text-[12px] text-ink-3">История прошлых тренировок сохранится в любом случае.</p>
          </div>
        )}
      </Sheet>

      <Sheet open={archiveAsk} onClose={() => setArchiveAsk(false)} title="Архивировать программу?">
        <p className="mb-4 text-[15px] text-ink-2">История и аналитика сохранятся. Программу можно вернуть из архива. После архивации создай новую программу.</p>
        <Button
          onClick={async () => {
            await archiveProgram(program.id);
            setArchiveAsk(false);
            navigate('/', true);
          }}
        >
          Архивировать
        </Button>
      </Sheet>
    </div>
  );
}

function MetaSheet({ open, onClose, bundle }: { open: boolean; onClose: () => void; bundle: ProgramBundle }) {
  const p = bundle.program;
  const [name, setName] = useState(p.name);
  const [goal, setGoal] = useState(p.goal);
  const [cycle, setCycle] = useState(p.cycleWeeks);
  const [start, setStart] = useState(p.startDate);
  return (
    <Sheet open={open} onClose={onClose} title="Настройки программы">
      <div className="space-y-4">
        <Field label="Название">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Цель">
          <input className={inputCls} value={goal} onChange={(e) => setGoal(e.target.value)} />
        </Field>
        <div>
          <div className="mb-1.5 px-1 text-[13px] font-medium text-ink-2">Продолжительность цикла</div>
          <Stepper value={cycle} min={1} max={52} label="недель" onChange={setCycle} />
        </div>
        <Field label="Дата начала" hint="Влияет на нумерацию недель в плане">
          <input type="date" className={inputCls} value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
        </Field>
        <Button
          disabled={!name.trim()}
          onClick={async () => {
            await updateProgramMeta(p.id, { name: name.trim(), goal: goal.trim(), cycleWeeks: cycle, startDate: start });
            onClose();
          }}
        >
          Сохранить
        </Button>
      </div>
    </Sheet>
  );
}

function DaySheet({ day, days, onClose }: { day: TrainingDay | null; days: TrainingDay[]; onClose: () => void }) {
  const [name, setName] = useState('');
  const [current, setCurrent] = useState<string | null>(null);
  if (day && current !== day.id) {
    setCurrent(day.id);
    setName(day.name);
  }
  if (!day) return null;
  return (
    <Sheet open onClose={onClose} title={`Тренировка ${day.letter}`}>
      <div className="space-y-4">
        <Field label="Название">
          <div className="flex gap-2">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
            <Button
              block={false}
              size="md"
              className="h-13"
              onClick={async () => {
                await renameDay(day.id, name);
                toast('Сохранено');
              }}
            >
              OK
            </Button>
          </div>
        </Field>
        <div>
          <div className="mb-1.5 px-1 text-[13px] font-medium text-ink-2">Перенести на другой день недели</div>
          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAYS_SHORT.map((l, i) => {
              const busy = days.find((d) => d.weekday === i && d.id !== day.id);
              const on = day.weekday === i;
              return (
                <button
                  key={l}
                  disabled={!!busy}
                  onClick={async () => {
                    try {
                      await moveDay(day.id, i as Weekday);
                      toast(`Тренировка ${day.letter} теперь ${WEEKDAYS_FULL[i].toLowerCase()}. Линия прогрессии сохранена`);
                      onClose();
                    } catch (e) {
                      toast((e as Error).message);
                    }
                  }}
                  className={cx('h-12 rounded-xl border text-[14px] font-semibold disabled:opacity-30', on ? 'border-accent bg-accent-soft' : 'border-line bg-surface-2')}
                >
                  {l}
                  {busy && <div className="text-[10px] text-ink-3">{busy.letter}</div>}
                </button>
              );
            })}
          </div>
        </div>
        <Button
          variant="danger"
          disabled={days.length <= 1}
          onClick={async () => {
            try {
              await archiveDay(day.id);
              onClose();
              toast('День убран из расписания. История сохранена');
            } catch (e) {
              toast((e as Error).message);
            }
          }}
        >
          <Trash2 size={17} /> Убрать день из расписания
        </Button>
      </div>
    </Sheet>
  );
}

function AddDaySheet({ open, onClose, programId, days }: { open: boolean; onClose: () => void; programId: string; days: TrainingDay[] }) {
  const [wd, setWd] = useState<Weekday | null>(null);
  const [name, setName] = useState('');
  return (
    <Sheet open={open} onClose={onClose} title="Новый тренировочный день">
      <div className="space-y-4">
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAYS_SHORT.map((l, i) => {
            const busy = days.some((d) => d.weekday === i);
            return (
              <button
                key={l}
                disabled={busy}
                onClick={() => setWd(i as Weekday)}
                className={cx('h-12 rounded-xl border text-[14px] font-semibold disabled:opacity-25', wd === i ? 'border-accent bg-accent-soft' : 'border-line bg-surface-2')}
              >
                {l}
              </button>
            );
          })}
        </div>
        <Field label="Название">
          <input className={inputCls} value={name} placeholder="Например, Лёгкий жим" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button
          disabled={wd === null}
          onClick={async () => {
            try {
              await addDay(programId, wd!, name);
              setWd(null);
              setName('');
              onClose();
              toast('День добавлен. Добавь в него упражнения');
            } catch (e) {
              toast((e as Error).message);
            }
          }}
        >
          Добавить
        </Button>
      </div>
    </Sheet>
  );
}

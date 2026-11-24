import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarClock, CalendarDays, Check, ChevronRight, Dumbbell, Lock, Play, Repeat, Sparkles, Target, TrendingUp, Trophy, X } from 'lucide-react';
import { useApp } from '../../app/context';
import { navigate } from '../../app/router';
import { Button, Card, Hero, Photo, Pill, Screen, SectionTitle, Sheet, StatTile, cx, toast } from '../../ui/kit';
import { loadDataset } from '../../services/dataset';
import { buildPlan, findNextWorkout, type PlanCell } from '../../domain/plan';
import { lineStats, listLines, periodStart } from '../../domain/analytics';
import { deterministicInsights } from '../../services/assistant';
import { startSession } from '../../services/workout';
import { moveWorkout } from '../../services/schedule';
import { WEEKDAYS_ACC, WEEKDAYS_FULL, WEEKDAYS_SHORT, addDays, diffDays, formatDateLong, formatDateShort, today, weekIndexFrom, weekdayOf } from '../../lib/dates';
import { formatDeltaKg, formatKg } from '../../lib/weight';
import { InsightCard } from '../analytics/InsightCard';

export function dayWhen(date: string, todayISO: string) {
  const d = diffDays(date, todayISO);
  if (d === 0) return 'Сегодня';
  if (d === 1) return 'Завтра';
  if (d === -1) return 'Вчера';
  return `${WEEKDAYS_SHORT[weekdayOf(date)]}, ${formatDateLong(date)}`;
}

export function Home() {
  const { profile, program, activeSession } = useApp();
  const t = today();
  const ds = useLiveQuery(() => loadDataset(profile.id), [profile.id]);
  const [choose, setChoose] = useState(false);
  const [moving, setMoving] = useState<PlanCell | null>(null);

  if (!program || !ds) return <Screen><div /></Screen>;

  const weekIdx = Math.max(0, weekIndexFrom(program.startDate, t));
  const week = buildPlan(ds, program.id, weekIdx, weekIdx, t)[0];
  const next = findNextWorkout(ds, program.id, t);
  const notStarted = t < program.startDate;

  const upcoming: PlanCell[] = [];
  for (const c of buildPlan(ds, program.id, weekIdx, weekIdx + 1, t).flatMap((w) => w.cells)) {
    if ((c.status === 'next' || c.status === 'planned' || (c.status === 'missed' && c.weekIndex === weekIdx)) && !upcoming.some((u) => u.day.id === c.day.id)) upcoming.push(c);
  }

  const lines = listLines(ds, program.id).filter((l) => l.active);
  const main = lines.find((l) => l.exerciseName === 'Жим лёжа') ?? lines[0];
  const mainStats = main ? lineStats(ds, main.programExerciseId, periodStart('1m', t)) : null;
  const mainAll = main ? lineStats(ds, main.programExerciseId) : null;
  const insights = deterministicInsights({ dataset: ds, programId: program.id, today: t });

  const start = async (cell: PlanCell) => {
    try {
      const s = await startSession(profile.id, cell.day.id, t, cell.slotDate);
      navigate('/workout/' + s.id);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  // Вес основного упражнения по тренировкам недели (график «Прогресс недели»)
  const weekBars = (week?.cells ?? []).flatMap((c) => {
    const e = c.exercises.find((x) => main && ds.programExercises.find((p) => p.id === x.programExerciseId)?.exerciseId === main.exerciseId);
    return e ? [{ cell: c, weightG: e.weightG, kind: e.kind }] : [];
  });
  const known = weekBars.map((b) => b.weightG).filter((w): w is number => w !== null);
  const barMax = Math.max(...known, 1);
  const barMin = known.length ? Math.min(...known) * 0.85 : 0;

  return (
    <Screen>
      <Hero
        title={program.name}
        subtitle={notStarted ? `Старт ${formatDateLong(program.startDate)}` : `${program.daysPerWeek} ${program.daysPerWeek === 1 ? 'тренировка' : program.daysPerWeek < 5 ? 'тренировки' : 'тренировок'} в неделю`}
        icon={<Target size={18} />}
        height={230}
      />

      {/* План на неделю */}
      <SectionTitle right={`Неделя ${weekIdx + 1}`}>План на неделю</SectionTitle>
      <div className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 pt-3 stagger">
        {(week?.cells ?? []).map((c) => {
          const isNext = !!next && next.day.id === c.day.id && next.date === c.date;
          return (
            <button
              key={c.day.id}
              onClick={() => (c.status === 'done' && c.sessionId ? navigate('/history/' + c.sessionId) : setMoving(c))}
              className={cx(
                'relative min-w-[112px] flex-1 rounded-[20px] border px-3.5 pb-3 pt-3 text-left transition active:scale-[0.97]',
                c.status === 'done' && 'border-success/40 bg-gradient-to-b from-success/15 to-success/[0.03] glow-success',
                c.status === 'missed' && !isNext && 'border-danger/35 bg-danger-soft/50',
                isNext && 'border-accent/70 bg-gradient-to-b from-accent/30 to-accent/[0.06] animate-glow',
                !isNext && (c.status === 'planned' || c.status === 'next' || c.status === 'before_start') && 'glass',
              )}
            >
              {isNext && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold text-white shadow-[0_4px_14px_rgb(124_92_255/0.7)]">
                  {next!.status === 'missed' ? 'Пропущена' : 'Следующая'}
                </span>
              )}
              <div className="flex items-center justify-between gap-1">
                <span className="text-[22px] font-extrabold tracking-[-0.02em]">{WEEKDAYS_SHORT[weekdayOf(c.date)]}</span>
                {c.status === 'done' && (
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-success text-[#03140c]">
                    <Check size={15} strokeWidth={3.2} />
                  </span>
                )}
                {c.status === 'missed' && !isNext && <X size={18} className="text-danger" />}
                {c.moved && c.status !== 'done' && <CalendarClock size={16} className="text-accent-2" />}
              </div>
              <div className="mt-1 line-clamp-2 min-h-[34px] text-[13px] leading-[1.3] text-ink-2">{c.day.name}</div>
              <div className="num mt-0.5 text-[11px] text-ink-3">{formatDateShort(c.date)}</div>
            </button>
          );
        })}
      </div>

      {/* Незавершённая тренировка */}
      {activeSession && (
        <Card accent className="mt-5" onClick={() => navigate('/workout/' + activeSession.id)}>
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-accent text-white glow-accent">
              <Dumbbell size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-accent-3">Тренировка не завершена</div>
              <div className="truncate text-[19px] font-bold">{activeSession.dayNameSnapshot}</div>
            </div>
            <ChevronRight className="text-ink-2" />
          </div>
        </Card>
      )}

      {/* Следующая тренировка */}
      {!activeSession && next && (
        <div className="card-accent mt-5 overflow-hidden rounded-[26px] animate-rise">
          <div className="flex items-start gap-3 px-5 pt-5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[14px] text-ink-2">
                <CalendarDays size={17} />
                {next.status === 'missed' ? `Пропущена ${WEEKDAYS_ACC[weekdayOf(next.date)]} — можно сегодня` : `Следующая · ${dayWhen(next.date, t).toLowerCase()}`}
              </div>
              <div className="mt-1.5 text-[28px] font-extrabold leading-[1.05] tracking-[-0.03em]">{next.day.name}</div>
            </div>
            <button aria-label="Начать" onClick={() => start(next)} className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent text-white glow-accent active:scale-95">
              <ChevronRight size={24} />
            </button>
          </div>
          <div className="mt-4 flex min-h-[132px]">
            <Photo name="plates" className="w-[36%] shrink-0 rounded-tr-[22px]" />
            <div className="min-w-0 flex-1 divide-y divide-white/[0.07] px-4">
              {next.exercises.slice(0, 4).map((e) => (
                <div key={e.programExerciseId} className="flex items-center gap-2.5 py-2.5">
                  <Dumbbell size={18} className="shrink-0 text-ink-3" />
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold">{e.name}</div>
                    <div className="num text-[14px] text-ink-2">
                      {e.sets}×{e.reps} — {e.weightG === null ? <span className="text-warn">калибровка</span> : formatKg(e.weightG, true)}
                    </div>
                  </div>
                </div>
              ))}
              {next.exercises.length > 4 && <div className="py-2 text-[13px] text-ink-3">и ещё {next.exercises.length - 4}</div>}
            </div>
          </div>
          <div className="space-y-1 px-5 pb-3 pt-4">
            <Button size="xl" onClick={() => start(next)}>
              <Play size={20} fill="currentColor" /> Начать тренировку
            </Button>
            <div className="grid grid-cols-2">
              <button onClick={() => setMoving(next)} className="flex h-11 items-center justify-center gap-1.5 whitespace-nowrap text-[14px] font-medium text-ink-2 active:text-ink">
                <CalendarClock size={16} /> Перенести
              </button>
              <button onClick={() => setChoose(true)} className="flex h-11 items-center justify-center gap-1.5 whitespace-nowrap text-[14px] font-medium text-ink-2 active:text-ink">
                <Repeat size={16} /> Другая
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Показатели */}
      {main && mainStats && mainAll && (
        <>
          <SectionTitle right={main.dayName}>{main.exerciseName}</SectionTitle>
          <div className="grid grid-cols-3 gap-2.5 stagger">
            <StatTile icon={<Trophy size={20} />} label="Лучший вес" value={formatKg(mainAll.bestSelfG)} sub="без помощи" onClick={() => navigate('/analytics/' + main.programExerciseId)} />
            <StatTile icon={<Lock size={20} />} label="Рабочий вес" value={formatKg(main.nextWeightG)} sub="на следующую" tone="accent" onClick={() => navigate('/analytics/' + main.programExerciseId)} />
            <StatTile
              icon={<TrendingUp size={20} />}
              label="Прогресс"
              value={mainStats.gainG === null ? '—' : formatDeltaKg(mainStats.gainG).replace(' кг', '')}
              sub="кг за месяц"
              tone={mainStats.gainG && mainStats.gainG > 0 ? 'success' : undefined}
              onClick={() => navigate('/analytics')}
            />
          </div>
        </>
      )}

      {/* Прогресс недели */}
      {weekBars.length > 0 && (
        <>
          <SectionTitle right={main?.exerciseName}>Прогресс недели</SectionTitle>
          <div className="glass rounded-[var(--radius-card)] px-4 pb-3 pt-5">
            <div className="flex h-[150px] items-end gap-3">
              {weekBars.map(({ cell, weightG, kind }, i) => {
                const h = weightG === null ? 16 : 22 + ((weightG - barMin) / (barMax - barMin || 1)) * 78;
                const done = cell.status === 'done';
                return (
                  <div key={cell.day.id} className="flex h-full flex-1 flex-col items-center justify-end">
                    <div className={cx('num mb-1.5 text-[13px] font-bold', done ? 'text-success' : 'text-ink-2')}>{weightG === null ? '?' : formatKg(weightG)}</div>
                    <div
                      className={cx(
                        'grid w-full max-w-[64px] place-items-center rounded-b-md rounded-t-xl',
                        done
                          ? 'bg-gradient-to-b from-[#5af0b0] to-[#159a64] shadow-[0_0_24px_-4px_rgb(62_227_156/0.6)]'
                          : kind === 'confirmed'
                            ? 'bg-gradient-to-b from-accent/80 to-accent/25 shadow-[0_0_24px_-6px_rgb(124_92_255/0.7)]'
                            : 'border border-dashed border-white/20 bg-white/[0.04]',
                      )}
                      style={{ height: `${h}%`, transformOrigin: 'bottom', animation: `rise 0.7s ${0.1 + i * 0.08}s cubic-bezier(0.16,1,0.3,1) both` }}
                    >
                      {done && <Check size={18} strokeWidth={3} className="text-[#03140c]" />}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex gap-3 border-t border-white/[0.06] pt-2">
              {weekBars.map(({ cell }) => (
                <div key={cell.day.id} className="flex-1 text-center text-[13px] text-ink-3">
                  {WEEKDAYS_SHORT[weekdayOf(cell.date)]}
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-ink-3">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" />выполнено</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" />следующий вес</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border border-dashed border-white/40" />по плану</span>
            </div>
          </div>
        </>
      )}

      {insights.length > 0 && (
        <>
          <SectionTitle right={<button onClick={() => navigate('/analytics')}>Все</button>}>
            <span className="inline-flex items-center gap-2">
              <Sparkles size={18} className="text-accent-2" /> Помощник
            </span>
          </SectionTitle>
          <InsightCard insight={insights[0]} />
        </>
      )}

      <Sheet open={choose} onClose={() => setChoose(false)} title="Какую тренировку начать?">
        <p className="mb-3 text-[14px] text-ink-2">Тренировка сохранит свою линию прогрессии, даже если проводишь её в другой день.</p>
        <div className="space-y-2">
          {upcoming.map((c) => (
            <button
              key={c.day.id}
              onClick={() => {
                setChoose(false);
                start(c);
              }}
              className="glass flex w-full items-center gap-3 rounded-2xl p-3.5 text-left active:bg-white/10"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent/20 text-[17px] font-extrabold text-accent-3">{c.day.letter}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-semibold">{c.day.name}</span>
                <span className="block text-[13px] text-ink-3">{c.status === 'missed' ? 'пропущена ' + WEEKDAYS_ACC[weekdayOf(c.date)] : 'по плану: ' + dayWhen(c.date, t).toLowerCase()}</span>
              </span>
              <ChevronRight size={18} className="text-ink-3" />
            </button>
          ))}
        </div>
      </Sheet>

      <MoveSheet
        cell={moving}
        onClose={() => setMoving(null)}
        programId={program.id}
        todayISO={t}
        onStart={(c) => {
          setMoving(null);
          start(c);
        }}
      />
    </Screen>
  );
}

/** Разовый перенос тренировки на другой день (расписание и веса не меняются) */
export function MoveSheet({ cell, onClose, programId, todayISO, onStart }: { cell: PlanCell | null; onClose: () => void; programId: string; todayISO: string; onStart?: (c: PlanCell) => void }) {
  if (!cell) return null;
  // переносить можно только в пределах той же недели и не в прошлое
  const monday = addDays(cell.slotDate, -weekdayOf(cell.slotDate));
  const options = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).filter((d) => d >= todayISO);
  const done = cell.status === 'done';
  return (
    <Sheet open onClose={onClose} title={cell.day.name}>
      <div className="mb-4 text-[14px] text-ink-2">
        По расписанию — {WEEKDAYS_FULL[cell.day.weekday].toLowerCase()}, {formatDateLong(cell.slotDate)}.
        {cell.moved && <> Сейчас перенесена на {formatDateLong(cell.date)}.</>}
      </div>
      {done ? (
        <Pill tone="success">Тренировка уже выполнена</Pill>
      ) : (
        <>
          <div className="mb-2 px-1 text-[13px] font-medium text-ink-2">{options.length ? 'Перенести на другой день этой недели' : 'Неделя уже прошла — перенос недоступен'}</div>
          <div className="grid grid-cols-4 gap-2">
            {options.map((d) => {
              const on = d === cell.date;
              return (
                <button
                  key={d}
                  onClick={async () => {
                    await moveWorkout(programId, cell.day.id, cell.weekIndex, d === cell.slotDate ? null : d);
                    toast(d === cell.slotDate ? 'Вернули по расписанию' : `Перенесено: ${WEEKDAYS_SHORT[weekdayOf(d)].toLowerCase()}, ${formatDateShort(d)}`);
                    onClose();
                  }}
                  className={cx('flex h-16 flex-col items-center justify-center rounded-2xl border text-[16px] font-bold transition active:scale-95', on ? 'border-accent bg-accent/25 glow-accent' : 'glass')}
                >
                  {WEEKDAYS_SHORT[weekdayOf(d)]}
                  <span className="num text-[11px] font-medium text-ink-3">{d === todayISO ? 'сегодня' : formatDateShort(d)}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-[12px] leading-snug text-ink-3">Перенос разовый: расписание и рабочие веса не меняются. Сменить день навсегда можно в разделе «Программа».</p>
          {cell.moved && (
            <Button
              variant="secondary"
              className="mt-3"
              onClick={async () => {
                await moveWorkout(programId, cell.day.id, cell.weekIndex, null);
                toast('Вернули по расписанию');
                onClose();
              }}
            >
              Вернуть на {WEEKDAYS_SHORT[cell.day.weekday].toLowerCase()}
            </Button>
          )}
          {onStart && (
            <Button className="mt-2" onClick={() => onStart(cell)}>
              <Play size={18} fill="currentColor" /> Начать сейчас
            </Button>
          )}
        </>
      )}
    </Sheet>
  );
}

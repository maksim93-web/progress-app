import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, ChevronRight, Dumbbell, Play, Repeat, Sparkles, TrendingUp, X } from 'lucide-react';
import { useApp } from '../../app/context';
import { navigate } from '../../app/router';
import { Button, Card, Pill, Screen, SectionTitle, Sheet, Stat, cx, toast } from '../../ui/kit';
import { loadDataset } from '../../services/dataset';
import { buildPlan, cycleInfo, findNextWorkout, type PlanCell } from '../../domain/plan';
import { lineStats, listLines, periodStart } from '../../domain/analytics';
import { deterministicInsights } from '../../services/assistant';
import { startSession } from '../../services/workout';
import { WEEKDAYS_ACC, WEEKDAYS_SHORT, diffDays, formatDateLong, parseISODate, today, weekIndexFrom } from '../../lib/dates';
import { formatDeltaKg, formatKg } from '../../lib/weight';
import { InsightCard } from '../analytics/InsightCard';

export function dayWhen(date: string, todayISO: string) {
  const d = diffDays(date, todayISO);
  if (d === 0) return 'Сегодня';
  if (d === 1) return 'Завтра';
  if (d === -1) return 'Вчера';
  return `${WEEKDAYS_SHORT[(parseISODate(date).getDay() + 6) % 7]}, ${formatDateLong(date)}`;
}

export function Home() {
  const { profile, program, activeSession } = useApp();
  const t = today();
  const ds = useLiveQuery(() => loadDataset(profile.id), [profile.id]);
  const [choose, setChoose] = useState(false);

  if (!program || !ds) return <Screen><div /></Screen>;

  const weekIdx = Math.max(0, weekIndexFrom(program.startDate, t));
  const { cycleNumber, weekInCycle } = cycleInfo(program, weekIdx);
  const week = buildPlan(ds, program.id, weekIdx, weekIdx, t)[0];
  const next = findNextWorkout(ds, program.id, t);
  // для выбора другой тренировки: ближайший непройденный слот каждого дня
  const upcoming: PlanCell[] = [];
  for (const c of buildPlan(ds, program.id, weekIdx, weekIdx + 1, t).flatMap((w) => w.cells)) {
    if ((c.status === 'next' || c.status === 'planned') && !upcoming.some((u) => u.day.id === c.day.id)) upcoming.push(c);
  }
  const notStarted = t < program.startDate;

  const lines = listLines(ds, program.id).filter((l) => l.active);
  const main = lines.find((l) => l.exerciseName === 'Жим лёжа') ?? lines[0];
  const mainStats = main ? lineStats(ds, main.programExerciseId, periodStart('1m', t)) : null;
  const insights = deterministicInsights({ dataset: ds, programId: program.id, today: t });
  const cycleWorkouts = ds.sessions.filter((s) => s.programId === program.id && weekIndexFrom(program.startDate, s.plannedDate) >= weekIdx - weekInCycle + 1).length;

  const start = async (cell: PlanCell) => {
    try {
      // тренировка засчитывается в тот слот плана, который видит пользователь
      const s = await startSession(profile.id, cell.day.id, t, cell.date);
      navigate('/workout/' + s.id);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <Screen>
      <div className="mb-5 mt-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[#a99bff]">
            {notStarted ? `Старт ${formatDateLong(program.startDate)}` : `Неделя ${weekInCycle} из ${program.cycleWeeks}${cycleNumber > 1 ? ` · цикл ${cycleNumber}` : ''}`}
          </div>
          <h1 className="mt-1.5 truncate text-[30px] font-bold leading-tight tracking-[-0.02em]">{program.name}</h1>
          <div className="mt-0.5 truncate text-[15px] text-ink-2">{program.goal}</div>
        </div>
      </div>

      {/* Календарь недели */}
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS_SHORT.map((label, i) => {
          const cell = week?.cells.find((c) => c.day.weekday === i);
          const date = week ? week.monday : t;
          const isToday = weekIndexFrom(program.startDate, t) === weekIdx && (parseISODate(t).getDay() + 6) % 7 === i;
          const st = cell?.status === 'next' && !(next && next.day.id === cell.day.id && next.date === cell.date) ? 'planned' : cell?.status;
          return (
            <button
              key={label}
              onClick={() => cell && navigate('/program/plan')}
              className={cx(
                'relative flex aspect-[0.72] flex-col items-center justify-center gap-1.5 rounded-2xl border text-[13px] font-semibold',
                !cell && 'border-transparent bg-white/[0.025] text-ink-3',
                st === 'done' && 'border-success/40 bg-success-soft text-success',
                st === 'missed' && 'border-danger/30 bg-danger-soft/60 text-danger',
                st === 'next' && 'border-accent/70 bg-accent-soft text-white shadow-[0_0_24px_-6px_rgb(123_97_255/0.7)]',
                (st === 'planned' || st === 'before_start') && 'border-line bg-surface text-ink-2',
              )}
              aria-label={`${label}${cell ? ', тренировка ' + cell.day.letter : ''}`}
              data-date={date}
            >
              <span className={cx(isToday && 'rounded-full bg-white px-1.5 text-[#0a0a0f]')}>{label}</span>
              {cell ? (
                <span className="grid h-6 w-6 place-items-center rounded-full bg-black/25 text-[12px]">
                  {st === 'done' ? <Check size={14} strokeWidth={3} /> : st === 'missed' ? <X size={14} strokeWidth={3} /> : cell.day.letter}
                </span>
              ) : (
                <span className="h-6 w-6 text-center leading-6 text-ink-3">·</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Незавершённая тренировка */}
      {activeSession && (
        <Card accent className="mt-4" onClick={() => navigate('/workout/' + activeSession.id)}>
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-accent text-white">
              <Dumbbell size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-[#c4b9ff]">Тренировка не завершена</div>
              <div className="truncate text-[18px] font-semibold">
                {activeSession.dayLetterSnapshot} · {activeSession.dayNameSnapshot}
              </div>
            </div>
            <ChevronRight className="text-ink-2" />
          </div>
        </Card>
      )}

      {/* Ближайшая тренировка */}
      {!activeSession && next && (
        <>
          <SectionTitle right={dayWhen(next.date, t)}>Ближайшая тренировка</SectionTitle>
          <Card accent className="p-5">
            <div className="flex items-start gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#8a72ff] to-[#5b6dff] text-[20px] font-bold glow-accent">{next.day.letter}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[22px] font-bold leading-tight">{next.day.name}</div>
                <div className="mt-0.5 text-[14px] text-ink-2">
                  {next.exercises.length} {next.exercises.length === 1 ? 'упражнение' : next.exercises.length < 5 ? 'упражнения' : 'упражнений'} · {WEEKDAYS_ACC[next.day.weekday]}
                </div>
              </div>
            </div>
            <div className="mt-4 divide-y divide-white/[0.06] rounded-2xl bg-black/20 px-3.5">
              {next.exercises.map((e) => (
                <div key={e.programExerciseId} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1 truncate text-[15px] font-medium">{e.name}</div>
                  <div className="num shrink-0 text-[14px] text-ink-2">
                    {e.sets}×{e.reps}
                  </div>
                  <div className="num w-[78px] shrink-0 text-right text-[15px] font-semibold">
                    {e.weightG === null ? <Pill tone="warn">калибр.</Pill> : formatKg(e.weightG, true)}
                  </div>
                </div>
              ))}
            </div>
            <Button size="xl" className="mt-4" onClick={() => start(next)}>
              <Play size={20} fill="currentColor" /> Начать тренировку
            </Button>
            <button onClick={() => setChoose(true)} className="mt-2 flex h-11 w-full items-center justify-center gap-2 text-[14px] font-medium text-ink-2 active:text-ink">
              <Repeat size={16} /> Начать другую тренировку
            </button>
          </Card>
        </>
      )}

      {/* Краткая статистика */}
      {main && mainStats && (
        <>
          <SectionTitle right={main.dayName}>{main.exerciseName}</SectionTitle>
          <Card className="grid grid-cols-3 gap-3" onClick={() => navigate('/analytics/' + main.programExerciseId)}>
            <Stat label="Рабочий вес" value={formatKg(mainStats.currentWeightG ?? main.nextWeightG)} sub={mainStats.currentWeightG === null ? 'план' : 'кг, выполнено'} />
            <Stat label="Следующий" value={formatKg(main.nextWeightG)} sub="кг, план" tone="accent" />
            <Stat
              label="За месяц"
              value={mainStats.gainG === null ? '—' : formatDeltaKg(mainStats.gainG).replace(' кг', '')}
              sub={mainStats.gainG === null ? 'нет данных' : 'кг'}
              tone={mainStats.gainG && mainStats.gainG > 0 ? 'success' : undefined}
            />
          </Card>
        </>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-[13px] text-ink-3">
            <TrendingUp size={15} /> В этом цикле
          </div>
          <div className="num mt-1.5 text-[26px] font-bold">
            {cycleWorkouts}
            <span className="text-[15px] font-medium text-ink-3"> / {program.cycleWeeks * program.daysPerWeek}</span>
          </div>
          <div className="text-[12px] text-ink-3">тренировок</div>
        </Card>
        <Card className="p-4" onClick={() => navigate('/history')}>
          <div className="flex items-center gap-2 text-[13px] text-ink-3">
            <Check size={15} /> Всего
          </div>
          <div className="num mt-1.5 text-[26px] font-bold">{ds.sessions.length}</div>
          <div className="text-[12px] text-ink-3">в истории</div>
        </Card>
      </div>

      {insights.length > 0 && (
        <>
          <SectionTitle right={<button onClick={() => navigate('/analytics')}>Все</button>}>
            <span className="inline-flex items-center gap-2">
              <Sparkles size={18} className="text-[#a99bff]" /> Помощник
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
              className="flex w-full items-center gap-3 rounded-2xl bg-surface-2 p-3.5 text-left active:bg-surface-3 disabled:opacity-40"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft font-bold text-[#c4b9ff]">{c.day.letter}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-semibold">{c.day.name}</span>
                <span className="block text-[13px] text-ink-3">
                  по плану {dayWhen(c.date, t).toLowerCase()}
                </span>
              </span>
              <ChevronRight size={18} className="text-ink-3" />
            </button>
          ))}
        </div>
      </Sheet>
    </Screen>
  );
}

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useApp } from '../../app/context';
import { navigate } from '../../app/router';
import { IconButton, Pill, Segmented, cx } from '../../ui/kit';
import { loadDataset } from '../../services/dataset';
import { buildPlan, cycleInfo, type PlanCell, type PlanCellExercise, type PlanWeek } from '../../domain/plan';
import { WEEKDAYS_SHORT, formatDateShort, today, weekIndexFrom } from '../../lib/dates';
import { formatKg } from '../../lib/weight';
import { RATING_LABEL } from '../../domain/analytics';

type Mode = 'week' | 'month' | 'cycle';

export function PlanView({ programId }: { programId: string }) {
  const { profile } = useApp();
  const ds = useLiveQuery(() => loadDataset(profile.id), [profile.id]);
  const [mode, setMode] = useState<Mode>('week');
  const [offset, setOffset] = useState(0);
  const t = today();
  const program = ds?.programs.find((p) => p.id === programId);
  const curWeek = program ? Math.max(0, weekIndexFrom(program.startDate, t)) : 0;

  const range = useMemo(() => {
    if (!program) return [0, 0];
    if (mode === 'week') return [curWeek + offset, curWeek + offset];
    if (mode === 'month') return [curWeek + offset * 4, curWeek + offset * 4 + 3];
    const { cycleNumber } = cycleInfo(program, curWeek);
    const first = (cycleNumber - 1 + offset) * program.cycleWeeks;
    return [first, first + program.cycleWeeks - 1];
  }, [mode, offset, curWeek, program]);

  const weeks = useMemo(() => (ds && program ? buildPlan(ds, program.id, Math.max(0, range[0]), Math.max(0, range[1]), t) : []), [ds, program, range, t]);

  // упражнения, встречающиеся в программе (для таблицы)
  const exerciseOptions = useMemo(() => {
    if (!ds || !program) return [];
    const ids = new Set(ds.programExercises.filter((p) => p.programId === program.id && p.status === 'active').map((p) => p.exerciseId));
    return ds.exercises.filter((e) => ids.has(e.id));
  }, [ds, program]);
  const [exId, setExId] = useState<string | null>(null);
  const selectedEx = exId ?? exerciseOptions.find((e) => e.name === 'Жим лёжа')?.id ?? exerciseOptions[0]?.id;

  if (!ds || !program) return null;

  const title =
    mode === 'week'
      ? `Неделя ${cycleInfo(program, range[0]).weekInCycle}${weeks[0] ? ` · ${formatDateShort(weeks[0].monday)}` : ''}`
      : mode === 'month'
        ? weeks.length
          ? `${formatDateShort(weeks[0].monday)} — ${formatDateShort(weeks.at(-1)!.cells.at(-1)?.date ?? weeks.at(-1)!.monday)}`
          : ''
        : `Цикл ${cycleInfo(program, Math.max(0, range[0])).cycleNumber}`;

  return (
    <div className="animate-rise">
      <Segmented
        value={mode}
        onChange={(m) => {
          setMode(m);
          setOffset(0);
        }}
        options={[
          { value: 'week', label: 'Неделя' },
          { value: 'month', label: 'Месяц' },
          { value: 'cycle', label: 'Цикл' },
        ]}
      />
      <div className="mt-3 flex items-center gap-2">
        <IconButton aria-label="Назад" disabled={range[0] <= 0} onClick={() => setOffset(offset - 1)}>
          <ChevronLeft size={20} />
        </IconButton>
        <div className="flex-1 text-center text-[15px] font-semibold">{title}</div>
        <IconButton aria-label="Вперёд" onClick={() => setOffset(offset + 1)}>
          <ChevronRight size={20} />
        </IconButton>
      </div>

      <Legend />

      {mode === 'week' ? (
        <div className="mt-3 space-y-3">{weeks[0]?.cells.map((c) => <DayCard key={c.day.id} cell={c} />)}</div>
      ) : (
        <>
          <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
            {exerciseOptions.map((e) => (
              <button
                key={e.id}
                onClick={() => setExId(e.id)}
                className={cx('h-9 shrink-0 rounded-xl border px-3 text-[13px] font-semibold', selectedEx === e.id ? 'border-accent/60 bg-accent-soft text-white' : 'border-line bg-surface text-ink-2')}
              >
                {e.name}
              </button>
            ))}
          </div>
          {selectedEx && <PlanTable weeks={weeks} exerciseId={selectedEx} cycleWeeks={program.cycleWeeks} />}
        </>
      )}
    </div>
  );
}

function Legend() {
  const items = [
    ['bg-success', 'выполнено'],
    ['bg-accent', 'подтверждено'],
    ['border border-dashed border-ink-3', 'предварительно'],
    ['bg-danger', 'пропущено'],
  ];
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 px-1">
      {items.map(([c, l]) => (
        <span key={l} className="inline-flex items-center gap-1.5 text-[12px] text-ink-3">
          <span className={cx('h-2.5 w-2.5 rounded-full', c)} />
          {l}
        </span>
      ))}
    </div>
  );
}

function valueCls(kind: PlanCellExercise['kind'], status: PlanCell['status']) {
  if (status === 'missed') return 'text-danger/80 line-through decoration-danger/40';
  switch (kind) {
    case 'actual':
      return 'text-success';
    case 'confirmed':
      return 'text-white';
    case 'preliminary':
      return 'text-ink-3';
    case 'calibration':
      return 'text-warn';
    case 'skipped':
      return 'text-ink-3 line-through';
  }
}

function DayCard({ cell }: { cell: PlanCell }) {
  const status = cell.status;
  const head = {
    done: <Pill tone="success"><Check size={12} strokeWidth={3} /> Выполнено</Pill>,
    missed: <Pill tone="danger"><X size={12} strokeWidth={3} /> Пропущено</Pill>,
    next: <Pill tone="accent">Ближайшая</Pill>,
    planned: <Pill>Предварительно</Pill>,
    before_start: <Pill>До старта</Pill>,
  }[status];
  return (
    <button
      onClick={() => cell.sessionId && navigate('/history/' + cell.sessionId)}
      className={cx(
        'block w-full rounded-[var(--radius-card)] border p-4 text-left',
        status === 'done' && 'border-success/30 bg-success-soft/40',
        status === 'missed' && 'border-danger/25 bg-danger-soft/30',
        status === 'next' && 'card-accent',
        (status === 'planned' || status === 'before_start') && 'border-dashed border-line-strong bg-surface/50',
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-[14px] font-bold">{cell.day.letter}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-semibold">{cell.day.name}</div>
          <div className="text-[12px] text-ink-3">
            {WEEKDAYS_SHORT[cell.day.weekday]}, {formatDateShort(cell.date)}
            {cell.actualDate && ` · проведена ${formatDateShort(cell.actualDate)}`}
          </div>
        </div>
        {head}
      </div>
      <div className="space-y-1">
        {cell.exercises.map((e) => (
          <div key={e.programExerciseId} className="flex items-center gap-2 text-[14px]">
            <span className="min-w-0 flex-1 truncate text-ink-2">{e.name}</span>
            <span className="num text-ink-3">
              {e.sets}×{e.reps}
            </span>
            <span className={cx('num w-[84px] text-right font-semibold', valueCls(e.kind, status))}>
              {e.kind === 'calibration' ? 'калибровка' : e.kind === 'skipped' ? 'пропуск' : formatKg(e.weightG, true)}
            </span>
          </div>
        ))}
      </div>
    </button>
  );
}

function PlanTable({ weeks, exerciseId, cycleWeeks }: { weeks: PlanWeek[]; exerciseId: string; cycleWeeks: number }) {
  const { profile } = useApp();
  const ds = useLiveQuery(() => loadDataset(profile.id), [profile.id]);
  if (!weeks.length || !ds) return null;
  const peToEx = new Map(ds.programExercises.map((p) => [p.id, p.exerciseId]));
  const days = weeks[0].cells.map((c) => c.day).filter((d) => weeks.some((w) => w.cells.some((c) => c.day.id === d.id && c.exercises.some((e) => peToEx.get(e.programExerciseId) === exerciseId))));
  if (!days.length) return <div className="mt-4 text-center text-[14px] text-ink-3">Это упражнение не стоит в расписании</div>;
  return (
    <div className="glass mt-3 overflow-hidden rounded-[var(--radius-card)]">
      <div className="grid border-b border-line text-[12px] font-medium text-ink-3" style={{ gridTemplateColumns: `64px repeat(${days.length}, 1fr)` }}>
        <div className="px-3 py-2.5">Неделя</div>
        {days.map((d) => {
          const anyCell = weeks[0].cells.find((c) => c.day.id === d.id);
          const ex = anyCell?.exercises.find((e) => peToEx.get(e.programExerciseId) === exerciseId);
          return (
            <div key={d.id} className="px-1 py-2.5 text-center">
              <div className="font-semibold text-ink-2">
                {WEEKDAYS_SHORT[d.weekday]} · {d.letter}
              </div>
              {ex && (
                <div className="num">
                  {ex.sets}×{ex.reps}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {weeks.map((w) => (
        <div key={w.index} className="grid border-b border-line last:border-0" style={{ gridTemplateColumns: `64px repeat(${days.length}, 1fr)` }}>
          <div className="px-3 py-3 text-[13px] font-semibold text-ink-2">
            {((w.index % cycleWeeks) + 1).toString()}
            <div className="text-[11px] font-normal text-ink-3">{formatDateShort(w.monday)}</div>
          </div>
          {days.map((d) => {
            const cell = w.cells.find((c) => c.day.id === d.id);
            const e = cell?.exercises.find((x) => peToEx.get(x.programExerciseId) === exerciseId);
            if (!cell || !e) return <div key={d.id} className="py-3 text-center text-ink-3">—</div>;
            return (
              <button
                key={d.id}
                onClick={() => cell.sessionId && navigate('/history/' + cell.sessionId)}
                className="flex flex-col items-center justify-center py-2"
                title={e.rating ? RATING_LABEL[e.rating] : undefined}
              >
                <span
                  className={cx(
                    'num rounded-lg px-2 py-1 text-[14px] font-semibold',
                    cell.status === 'next' && 'bg-accent-soft ring-1 ring-accent/60',
                    cell.status === 'done' && 'bg-success-soft',
                    cell.status === 'planned' && 'border border-dashed border-white/15',
                    valueCls(e.kind, cell.status),
                  )}
                >
                  {e.kind === 'calibration' ? '?' : e.kind === 'skipped' ? 'пропуск' : formatKg(e.weightG)}
                </span>
                {cell.status === 'done' && e.rating && <span className="mt-0.5 text-[10px] text-ink-3">{RATING_LABEL[e.rating].toLowerCase()}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

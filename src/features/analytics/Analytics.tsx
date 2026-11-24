import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend as RLegend } from 'recharts';
import { BarChart3, ChevronRight, Sparkles, Trophy } from 'lucide-react';
import { useApp } from '../../app/context';
import { goBack, navigate } from '../../app/router';
import { Card, Empty, PageTitle, Pill, Screen, SectionTitle, Stat, TopBar, cx } from '../../ui/kit';
import { loadDataset, type Dataset } from '../../services/dataset';
import { PERIODS, RATING_LABEL, RATING_SCORE, lineStats, linePoints, listLines, overallStats, periodStart, type LineInfo, type PeriodKey } from '../../domain/analytics';
import { deterministicInsights, deterministicMonthlySummary } from '../../services/assistant';
import { formatDateShort, today } from '../../lib/dates';
import { formatDeltaKg, formatKg } from '../../lib/weight';
import { InsightCard } from './InsightCard';

export const LINE_COLORS = ['#8b74ff', '#3fd8a0', '#5b9cff', '#f7b84b', '#ff7a90', '#b98bff', '#4fd1e8'];

const axis = { stroke: '#6e6e82', fontSize: 11, tickLine: false, axisLine: false } as const;
const tooltipStyle = {
  contentStyle: { background: '#1b1b25', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, fontSize: 13, color: '#f4f4f8' },
  labelStyle: { color: '#a9a9bb' },
  itemStyle: { color: '#f4f4f8' },
  cursor: { stroke: 'rgba(255,255,255,0.15)', fill: 'rgba(255,255,255,0.04)' },
};

function PeriodPicker({ value, onChange }: { value: PeriodKey; onChange: (p: PeriodKey) => void }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
      {PERIODS.map((p) => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          className={cx(
            'h-10 shrink-0 rounded-xl px-4 text-[14px] font-semibold transition',
            value === p.key ? 'bg-gradient-to-b from-[#8a72ff] to-[#6a4dff] text-white' : 'border border-line bg-surface text-ink-2',
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

export function Analytics() {
  const { profile, program } = useApp();
  const ds = useLiveQuery(() => loadDataset(profile.id), [profile.id]);
  const [period, setPeriod] = useState<PeriodKey>('1m');
  const t = today();
  const from = periodStart(period, t);

  if (!ds) return <Screen><div /></Screen>;
  if (ds.sessions.length === 0) {
    return (
      <Screen>
        <PageTitle>Аналитика</PageTitle>
        <Empty icon={<BarChart3 />} title="Пока нет данных" text="Графики появятся после первой завершённой тренировки. Здесь будут только реальные результаты." />
      </Screen>
    );
  }

  return (
    <Screen>
      <PageTitle>Аналитика</PageTitle>
      <PeriodPicker value={period} onChange={setPeriod} />
      <ExerciseLines ds={ds} from={from} programId={program?.id} />
      <Overall ds={ds} from={from} t={t} />
      {program && <Assistant ds={ds} programId={program.id} t={t} />}
    </Screen>
  );
}

/* ---------- Линии упражнения по дням ---------- */

function ExerciseLines({ ds, from, programId }: { ds: Dataset; from: string | null; programId?: string }) {
  const lines = useMemo(() => listLines(ds).filter((l) => linePoints(ds, l.programExerciseId).length > 0 || (l.active && l.programId === programId)), [ds, programId]);
  const exercises = useMemo(() => {
    const m = new Map<string, string>();
    lines.forEach((l) => m.set(l.exerciseId, l.exerciseName));
    return [...m.entries()];
  }, [lines]);
  const [exId, setExId] = useState<string | null>(null);
  const selected = exId ?? exercises.find(([, n]) => n === 'Жим лёжа')?.[0] ?? exercises[0]?.[0];
  const group = lines.filter((l) => l.exerciseId === selected);

  // данные для общего графика: по датам, отдельная серия на каждую линию
  const chart = useMemo(() => {
    const rows = new Map<string, Record<string, number | string>>();
    group.forEach((l) => {
      for (const p of linePoints(ds, l.programExerciseId, from)) {
        if (p.weightG === null) continue;
        const r = rows.get(p.date) ?? { date: p.date };
        r[l.programExerciseId] = p.weightG / 1000;
        rows.set(p.date, r);
      }
    });
    return [...rows.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [group, ds, from]);

  if (!exercises.length) return null;

  return (
    <>
      <SectionTitle>Рабочие веса</SectionTitle>
      <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
        {exercises.map(([id, name]) => (
          <button
            key={id}
            onClick={() => setExId(id)}
            className={cx('h-9 shrink-0 rounded-xl border px-3 text-[13px] font-semibold', selected === id ? 'border-accent/60 bg-accent-soft text-white' : 'border-line bg-surface text-ink-2')}
          >
            {name}
          </button>
        ))}
      </div>
      <Card className="px-2 pb-2 pt-4">
        <div className="mb-1 px-2 text-[13px] text-ink-3">Независимые линии по тренировочным дням, кг</div>
        {chart.length ? (
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 10, right: 12, left: -14, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d) => formatDateShort(String(d))} {...axis} minTickGap={20} />
                <YAxis {...axis} domain={['dataMin - 5', 'dataMax + 5']} tickFormatter={(v) => String(v).replace('.', ',')} width={44} />
                <Tooltip {...tooltipStyle} labelFormatter={(d) => formatDateShort(String(d))} formatter={(v, k) => { const g = group.find((x) => x.programExerciseId === k); return [`${String(v).replace('.', ',')} кг`, g ? `${g.dayLetter} · ${g.dayName} ${g.sets}×${g.reps}` : String(k)]; }} />
                <RLegend
                  formatter={(k) => {
                    const g = group.find((x) => x.programExerciseId === k);
                    return <span className="text-[12px] text-ink-2">{g ? `${g.dayLetter} · ${g.sets}×${g.reps}${g.active ? '' : ' (архив)'}` : ''}</span>;
                  }}
                />
                {group.map((l, i) => (
                  <Line key={l.programExerciseId} dataKey={l.programExerciseId} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2.5} dot={{ r: 3.5 }} connectNulls type="monotone" />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="px-2 py-8 text-center text-[14px] text-ink-3">Нет выполненных тренировок за период</div>
        )}
      </Card>
      <div className="mt-3 space-y-2.5">
        {group.map((l, i) => (
          <LineCard key={l.programExerciseId} ds={ds} line={l} from={from} color={LINE_COLORS[i % LINE_COLORS.length]} />
        ))}
      </div>
    </>
  );
}

function LineCard({ ds, line, from, color }: { ds: Dataset; line: LineInfo; from: string | null; color: string }) {
  const st = lineStats(ds, line.programExerciseId, from);
  return (
    <Card onClick={() => navigate('/analytics/' + line.programExerciseId)}>
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full" style={{ background: color }} />
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
          {line.dayLetter} · {line.dayName}
          <span className="num ml-1.5 font-normal text-ink-3">
            {line.sets}×{line.reps}
          </span>
        </span>
        {!line.active && <Pill>архив</Pill>}
        <ChevronRight size={18} className="text-ink-3" />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Stat label="Старт" value={formatKg(st.startWeightG)} />
        <Stat label="Сейчас" value={formatKg(st.currentWeightG)} sub={`след.: ${formatKg(st.nextWeightG)}`} />
        <Stat
          label="Прирост"
          value={st.gainG === null ? '—' : formatDeltaKg(st.gainG).replace(' кг', '')}
          sub={st.gainPct !== null ? `${st.gainPct > 0 ? '+' : ''}${String(st.gainPct).replace('.', ',')}%` : undefined}
          tone={st.gainG && st.gainG > 0 ? 'success' : undefined}
        />
      </div>
    </Card>
  );
}

/* ---------- Общая аналитика ---------- */

function Overall({ ds, from, t }: { ds: Dataset; from: string | null; t: string }) {
  const ov = overallStats(ds, from, t);
  return (
    <>
      <SectionTitle>Общая статистика</SectionTitle>
      <Card className="grid grid-cols-3 gap-x-3 gap-y-4">
        <Stat label="Тренировок" value={ov.workouts} sub={`из ${ov.plannedSlots} по плану`} />
        <Stat label="Регулярность" value={ov.regularityPct === null ? '—' : `${ov.regularityPct}%`} sub={`${String(ov.perWeek).replace('.', ',')} в неделю`} tone={ov.regularityPct !== null && ov.regularityPct >= 80 ? 'success' : undefined} />
        <Stat label="Подходов" value={ov.workSets} sub={`${ov.reps} повт.`} />
        <div className="col-span-2">
          <Stat label="Тренировочный объём" value={`${Math.round(ov.volumeG / 1000).toLocaleString('ru-RU')} кг`} sub="вес × самостоятельные повторения" />
        </div>
        <Stat label="С ростом" value={ov.positiveLines.length} sub="упражнений" tone={ov.positiveLines.length ? 'success' : undefined} />
      </Card>

      {ov.weeklyVolume.length > 0 && (
        <Card className="mt-3 px-2 pb-2 pt-4">
          <div className="mb-1 px-2 text-[13px] text-ink-3">Объём по неделям, кг</div>
          <div className="h-[170px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ov.weeklyVolume} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="week" tickFormatter={(d) => formatDateShort(String(d))} {...axis} />
                <YAxis {...axis} width={48} />
                <Tooltip {...tooltipStyle} labelFormatter={(d) => `Неделя с ${formatDateShort(String(d))}`} formatter={(v) => [`${Number(v).toLocaleString('ru-RU')} кг`, 'Объём']} />
                <Bar dataKey="volumeKg" fill="#7b61ff" radius={[6, 6, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {ov.records.length > 0 && (
        <>
          <SectionTitle>
            <span className="inline-flex items-center gap-2">
              <Trophy size={18} className="text-warn" /> Личные рекорды
            </span>
          </SectionTitle>
          <div className="glass divide-y divide-white/[0.06] rounded-[var(--radius-card)] px-4">
            {ov.records.map((r) => (
              <button key={r.peId} onClick={() => navigate('/analytics/' + r.peId)} className="flex w-full items-center gap-3 py-3 text-left">
                <span className="min-w-0 flex-1 truncate text-[14px]">{r.label}</span>
                <span className="text-[12px] text-ink-3">{formatDateShort(r.date)}</span>
                <span className="num text-[16px] font-bold">{formatKg(r.weightG, true)}</span>
              </button>
            ))}
          </div>
          <div className="mt-1.5 px-1 text-[12px] text-ink-3">Лучший вес, выполненный самостоятельно в рабочем подходе</div>
        </>
      )}

      {ov.stagnantLines.length > 0 && (
        <>
          <SectionTitle>Без прогресса</SectionTitle>
          <div className="space-y-2">
            {ov.stagnantLines.map((s) => (
              <Card key={s.peId} className="flex items-center gap-3 p-3.5" onClick={() => navigate('/analytics/' + s.peId)}>
                <span className="min-w-0 flex-1 truncate text-[14px]">{s.label}</span>
                <Pill tone="warn">3 трен. без роста</Pill>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}

/* ---------- Помощник ---------- */

function Assistant({ ds, programId, t }: { ds: Dataset; programId: string; t: string }) {
  const ctx = { dataset: ds, programId, today: t };
  const summary = deterministicMonthlySummary(ctx);
  const insights = deterministicInsights(ctx);
  return (
    <>
      <SectionTitle>
        <span className="inline-flex items-center gap-2">
          <Sparkles size={18} className="text-[#a99bff]" /> Помощник
        </span>
      </SectionTitle>
      <Card accent>
        <div className="text-[13px] font-semibold uppercase tracking-[0.1em] text-[#c4b9ff]">Резюме за 4 недели</div>
        <p className="mt-2 text-[15px] leading-relaxed">{summary}</p>
      </Card>
      <div className="mt-2.5 space-y-2.5">
        {insights.map((i) => (
          <InsightCard key={i.id} insight={i} />
        ))}
      </div>
      <div className="mt-2 px-1 text-[12px] text-ink-3">Помощник только советует и никогда не меняет программу или веса без тебя.</div>
    </>
  );
}

/* ---------- Детально по линии ---------- */

export function LineDetail({ peId }: { peId: string }) {
  const { profile } = useApp();
  const ds = useLiveQuery(() => loadDataset(profile.id), [profile.id]);
  const [period, setPeriod] = useState<PeriodKey>('all');
  const t = today();
  if (!ds) return <Screen tabbar={false}><div /></Screen>;
  const line = listLines(ds).find((l) => l.programExerciseId === peId);
  if (!line) return <Screen tabbar={false}><TopBar onBack={() => goBack('/analytics')} title="Нет данных" /></Screen>;
  const from = periodStart(period, t);
  const pts = linePoints(ds, peId, from);
  const st = lineStats(ds, peId, from);
  const data = pts.map((p) => ({
    date: p.date,
    weight: p.weightG === null ? null : p.weightG / 1000,
    e1rm: p.e1rmG === null ? null : p.e1rmG / 1000,
    rating: p.rating ? RATING_SCORE[p.rating] : null,
    volume: Math.round(p.volumeG / 1000),
  }));

  return (
    <Screen tabbar={false}>
      <TopBar onBack={() => goBack('/analytics')} title={line.exerciseName} subtitle={`${line.dayLetter} · ${line.dayName} · ${line.sets}×${line.reps}`} />
      <PeriodPicker value={period} onChange={setPeriod} />
      <Card className="mt-4 grid grid-cols-3 gap-x-3 gap-y-4">
        <Stat label="Стартовый" value={formatKg(st.startWeightG)} sub="кг" />
        <Stat label="Текущий" value={formatKg(st.currentWeightG)} sub="кг, выполнено" />
        <Stat label="Следующий" value={formatKg(st.nextWeightG)} sub="кг, план" tone="accent" />
        <Stat label="Лучший сам." value={formatKg(st.bestSelfG)} sub="кг" />
        <Stat label="Прирост" value={st.gainG === null ? '—' : formatDeltaKg(st.gainG).replace(' кг', '')} sub={st.gainPct !== null ? `${String(st.gainPct).replace('.', ',')}%` : 'кг'} tone={st.gainG && st.gainG > 0 ? 'success' : undefined} />
        <Stat label="Тренировок" value={st.workouts} />
        <div className="col-span-3 rounded-xl bg-white/[0.035] p-3">
          <Stat label="Расчётный 1ПМ (оценка, не выполненный вес)" value={st.e1rmG === null ? 'нет данных' : `≈ ${formatKg(st.e1rmG, true)}`} sub="Формула Эпли по подходам до 10 повторений" />
        </div>
      </Card>

      {data.length > 0 ? (
        <>
          <SectionTitle>Динамика рабочего веса</SectionTitle>
          <Card className="px-2 pb-2 pt-4">
            <div className="h-[210px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 8, right: 12, left: -14, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(d) => formatDateShort(String(d))} {...axis} minTickGap={20} />
                  <YAxis {...axis} domain={['dataMin - 5', 'dataMax + 5']} width={44} tickFormatter={(v) => String(v).replace('.', ',')} />
                  <Tooltip {...tooltipStyle} labelFormatter={(d) => formatDateShort(String(d))} formatter={(v, k) => [`${String(v).replace('.', ',')} кг`, k === 'e1rm' ? '1ПМ (оценка)' : 'Рабочий вес']} />
                  <Line dataKey="weight" stroke="#8b74ff" strokeWidth={3} dot={{ r: 4 }} type="monotone" connectNulls />
                  <Line dataKey="e1rm" stroke="#6e6e82" strokeWidth={1.5} strokeDasharray="5 5" dot={false} type="monotone" connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 px-3 pb-1 text-[12px] text-ink-3">
              <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-[#8b74ff]" /> рабочий вес</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-0 w-4 border-t border-dashed border-ink-3" /> 1ПМ, оценка</span>
            </div>
          </Card>

          <SectionTitle>Сложность выполнения</SectionTitle>
          <Card className="px-2 pb-2 pt-4">
            <div className="h-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 8, right: 12, left: -6, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(d) => formatDateShort(String(d))} {...axis} minTickGap={20} />
                  <YAxis {...axis} domain={[0.5, 3.5]} ticks={[1, 2, 3]} width={70} tickFormatter={(v) => (v === 1 ? 'легко' : v === 2 ? 'тяжело' : 'не смог')} />
                  <Tooltip {...tooltipStyle} labelFormatter={(d) => formatDateShort(String(d))} formatter={(v) => [v === 1 ? 'Легко' : v === 2 ? 'Тяжело' : 'Не справился', 'Оценка']} />
                  <Line dataKey="rating" stroke="#f7b84b" strokeWidth={2} type="stepAfter" dot={{ r: 4, fill: '#f7b84b' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <SectionTitle>Тренировочный объём, кг</SectionTitle>
          <Card className="px-2 pb-2 pt-4">
            <div className="h-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(d) => formatDateShort(String(d))} {...axis} minTickGap={20} />
                  <YAxis {...axis} width={48} />
                  <Tooltip {...tooltipStyle} labelFormatter={(d) => formatDateShort(String(d))} formatter={(v) => [`${Number(v).toLocaleString('ru-RU')} кг`, 'Объём']} />
                  <Bar dataKey="volume" fill="#3fd8a0" radius={[6, 6, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <SectionTitle>История подходов</SectionTitle>
          <div className="space-y-2">
            {[...pts].reverse().map((p) => (
              <Card key={p.sessionId} className="p-3.5" onClick={() => navigate('/history/' + p.sessionId)}>
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold">{formatDateShort(p.date)}</span>
                  {p.rating && <Pill tone={p.rating === 'easy' ? 'success' : p.rating === 'hard' ? 'warn' : 'danger'}>{RATING_LABEL[p.rating]}</Pill>}
                  {p.pain && <Pill tone="danger">боль</Pill>}
                  <span className="num ml-auto text-[15px] font-bold">{formatKg(p.weightG, true)}</span>
                </div>
                <div className="num mt-1 text-[13px] text-ink-3">{p.sets.map((s) => `${s.reps}×${formatKg(s.weightG)}${s.assisted ? '*' : ''}`).join('  ·  ')}</div>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-6">
          <Empty title="Нет выполненных тренировок" text="За выбранный период по этой линии ещё нет результатов." />
        </div>
      )}
    </Screen>
  );
}

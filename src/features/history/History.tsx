import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, History as HistoryIcon } from 'lucide-react';
import { useApp } from '../../app/context';
import { navigate } from '../../app/router';
import { Empty, PageTitle, Pill, Screen, TopBar } from '../../ui/kit';
import { loadDataset } from '../../services/dataset';
import { loadSessionBundle } from '../../services/workout';
import { formatDateLong, formatDuration, parseISODate, WEEKDAYS_SHORT } from '../../lib/dates';
import { formatKg } from '../../lib/weight';
import { SessionSummaryView } from '../workout/Summary';
import { goBack } from '../../app/router';

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

export function History() {
  const { profile } = useApp();
  const ds = useLiveQuery(() => loadDataset(profile.id), [profile.id]);
  if (!ds) return <Screen><div /></Screen>;
  const sessions = [...ds.sessions].sort((a, b) => b.date.localeCompare(a.date) || b.startedAt.localeCompare(a.startedAt));

  const groups = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const d = parseISODate(s.date);
    const key = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }

  return (
    <Screen>
      <PageTitle sub={sessions.length ? `${sessions.length} завершённых тренировок` : undefined}>История</PageTitle>
      {sessions.length === 0 && <Empty icon={<HistoryIcon />} title="История пуста" text="Здесь появятся завершённые тренировки с подходами, оценками и изменениями весов." />}
      {[...groups.entries()].map(([month, list]) => (
        <div key={month} className="mb-5">
          <div className="mb-2 px-1 text-[14px] font-semibold text-ink-3">{month}</div>
          <div className="space-y-2">
            {list.map((s) => {
              const exs = ds.exerciseSessions.filter((e) => e.sessionId === s.id).sort((a, b) => a.order - b.order);
              const main = exs.find((e) => e.status === 'done');
              const recs = ds.recommendations.filter((r) => r.sessionId === s.id && r.appliedWeightG !== null && r.appliedWeightG > r.fromWeightG);
              const dur = s.finishedAt ? new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime() : 0;
              return (
                <button key={s.id} onClick={() => navigate('/history/' + s.id)} className="glass flex w-full items-center gap-3 rounded-2xl p-3.5 text-left active:scale-[0.99]">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/5 text-center">
                    <div>
                      <div className="num text-[17px] font-bold leading-none">{parseISODate(s.date).getDate()}</div>
                      <div className="text-[11px] text-ink-3">{WEEKDAYS_SHORT[(parseISODate(s.date).getDay() + 6) % 7]}</div>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold">
                      {s.dayLetterSnapshot} · {s.dayNameSnapshot}
                    </div>
                    <div className="num truncate text-[13px] text-ink-3">
                      {main ? `${main.nameSnapshot}: ${main.plannedSets}×${main.plannedReps}, ${formatKg(main.confirmedWeightG, true)}` : 'без выполненных упражнений'}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Pill>{formatDuration(dur)}</Pill>
                      {recs.length > 0 && <Pill tone="success">↑ {recs.length}</Pill>}
                      {s.plannedDate !== s.date && <Pill>перенос с {formatDateLong(s.plannedDate)}</Pill>}
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-ink-3" />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </Screen>
  );
}

export function SessionDetail({ sessionId }: { sessionId: string }) {
  const bundle = useLiveQuery(() => loadSessionBundle(sessionId), [sessionId]);
  if (bundle === undefined) return <Screen tabbar={false}><div /></Screen>;
  if (bundle === null) return <Screen tabbar={false}><TopBar onBack={() => goBack('/history')} title="Тренировка не найдена" /></Screen>;
  return <SessionSummaryView bundle={bundle} />;
}

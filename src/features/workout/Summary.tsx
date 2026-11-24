import { useState } from 'react';
import { ArrowRight, Check, ShieldAlert, SkipForward, Trophy } from 'lucide-react';
import { goBack, navigate } from '../../app/router';
import { Button, Card, Pill, Screen, Stat, TopBar, cx, toast } from '../../ui/kit';
import { summarize, type SessionBundle } from '../../services/workout';
import { RATING_LABEL } from '../../domain/analytics';
import { formatDateLong, formatDuration } from '../../lib/dates';
import { formatKg } from '../../lib/weight';
import type { Rating } from '../../domain/types';

const RATING_TONE: Record<Rating, 'success' | 'warn' | 'danger'> = { easy: 'success', hard: 'warn', failed: 'danger' };

export function SessionSummaryView({ bundle, onFinish }: { bundle: SessionBundle; onFinish?: () => Promise<void> }) {
  const sum = summarize(bundle);
  const { session, exercises, sets } = bundle;
  const [busy, setBusy] = useState(false);
  const live = !!onFinish;

  return (
    <Screen tabbar={false}>
      {!live && <TopBar onBack={() => goBack('/history')} title="Тренировка" subtitle={formatDateLong(session.date)} />}
      {live && (
        <div className="mb-6 mt-6 text-center animate-pop">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-gradient-to-b from-[#3ee0a6] to-[#20b985] text-[#04140d] shadow-[0_0_60px_-10px_rgb(52_211_153/0.8)]">
            <Trophy size={36} />
          </div>
          <h1 className="mt-4 text-[30px] font-bold tracking-[-0.02em]">Тренировка выполнена</h1>
        </div>
      )}
      <Card accent className="p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-accent text-[20px] font-bold">{session.dayLetterSnapshot}</div>
          <div className="min-w-0">
            <div className="truncate text-[20px] font-bold">{session.dayNameSnapshot}</div>
            <div className="text-[13px] text-ink-2">
              {formatDateLong(session.date)}
              {session.plannedDate !== session.date && ` · перенесена с ${formatDateLong(session.plannedDate)}`}
            </div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-y-4">
          <Stat label="Длительность" value={formatDuration(sum.durationMs)} />
          <Stat label="Упражнений" value={`${sum.exercisesDone}/${exercises.length}`} />
          <Stat label="Подходов" value={sum.workSets} />
          <Stat label="Повторений" value={sum.reps} />
          <div className="col-span-2">
            <Stat label="Объём" value={`${sum.volumeKgReps.toLocaleString('ru-RU')} кг`} sub="вес × самостоятельные повторения" />
          </div>
        </div>
      </Card>

      <div className="mb-2.5 mt-6 px-1 text-[19px] font-semibold">Упражнения и веса</div>
      <div className="space-y-2">
        {sum.rows.map((r, i) => {
          const es = exercises[i];
          const done = (sets.get(es.id) ?? []).filter((s) => s.kind === 'work' && s.done);
          const changed = r.fromG !== null && r.toG !== null && r.toG !== r.fromG;
          return (
            <div key={es.id} className="glass rounded-2xl p-3.5">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 truncate text-[16px] font-semibold">{r.name}</div>
                {r.skipped ? (
                  <Pill>
                    <SkipForward size={12} /> Пропущено
                  </Pill>
                ) : r.rating ? (
                  <Pill tone={RATING_TONE[r.rating]}>{RATING_LABEL[r.rating]}</Pill>
                ) : null}
                {r.pain && (
                  <Pill tone="danger">
                    <ShieldAlert size={12} /> Боль
                  </Pill>
                )}
              </div>
              {done.length > 0 && (
                <div className="num mt-1 text-[13px] text-ink-3">
                  {done.map((s) => `${s.actualReps}×${formatKg(s.actualWeightG)}${s.assisted ? '*' : ''}`).join('  ·  ')}
                </div>
              )}
              {!r.skipped && (
                <div className="num mt-2 flex items-center gap-2 text-[17px] font-semibold">
                  <span className="text-ink-2">{formatKg(r.fromG)}</span>
                  <ArrowRight size={16} className="text-ink-3" />
                  <span className={cx(changed ? (r.toG! > r.fromG! ? 'text-success' : 'text-warn') : 'text-ink')}>{formatKg(r.toG, true)}</span>
                  {r.decision === 'custom' && <span className="text-[12px] font-medium text-ink-3">свой вес</span>}
                  {r.decision === 'rejected' && <span className="text-[12px] font-medium text-ink-3">оставлен</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {[...sets.values()].flat().some((s) => s.assisted) && <div className="mt-2 px-1 text-[12px] text-ink-3">* с помощью страхующего — не входит в объём и рекорды</div>}

      {live && (
        <div className="mt-6">
          <Button
            size="xl"
            variant="success"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onFinish!();
              navigate('/', true);
              toast('Тренировка сохранена');
            }}
          >
            <Check size={22} strokeWidth={3} /> Завершить тренировку
          </Button>
        </div>
      )}
    </Screen>
  );
}

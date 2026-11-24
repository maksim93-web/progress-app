import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  ArrowRight,
  BicepsFlexed,
  Check,
  ChevronLeft,
  Dumbbell,
  Target,
  ChevronRight,
  CircleHelp,
  Flame,
  HandHelping,
  History,
  List,
  MoreHorizontal,
  Plus,
  ShieldAlert,
  SkipForward,
  Timer,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useApp } from '../../app/context';
import { navigate } from '../../app/router';
import { Button, Hero, IconButton, PHOTOS, Pill, Screen, Segments, Sheet, Stepper, Toggle, TopBar, WeightInput, cx, toast } from '../../ui/kit';
import {
  abandonSession,
  addSet,
  clearRest,
  completeSet,
  decideRecommendation,
  extendRest,
  finishSession,
  lastResultFor,
  loadSessionBundle,
  rateExercise,
  removeSet,
  setCurrentIndex,
  skipExercise,
  uncompleteSet,
  updateSet,
  type SessionBundle,
} from '../../services/workout';
import type { ExerciseSession, FailReason, Rating, SetResult, WeightRecommendation } from '../../domain/types';
import { formatDeltaKg, formatKg } from '../../lib/weight';
import { WEEKDAYS_ACC, formatDateShort } from '../../lib/dates';
import { db } from '../../db/database';
import { RATING_LABEL } from '../../domain/analytics';
import { SessionSummaryView } from './Summary';

/* ---------- Таймер и удержание экрана ---------- */

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

function useWakeLock() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const req = () => nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => undefined);
    req();
    const onVis = () => document.visibilityState === 'visible' && req();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      lock?.release().catch(() => undefined);
    };
  }, []);
}

function mmss(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/* ---------- Экран тренировки ---------- */

export function Workout({ sessionId }: { sessionId: string }) {
  const bundle = useLiveQuery(() => loadSessionBundle(sessionId), [sessionId]);
  useWakeLock();
  const [started, setStarted] = useState(false);

  if (bundle === undefined) return <Screen tabbar={false}><div /></Screen>;
  if (bundle === null) {
    return (
      <Screen tabbar={false}>
        <TopBar onBack={() => navigate('/', true)} title="Тренировка не найдена" />
      </Screen>
    );
  }
  if (bundle.session.status === 'completed') return <SessionSummaryView bundle={bundle} />;

  const allClosed = bundle.exercises.every((e) => e.status === 'done' || e.status === 'skipped');
  const pendingRec = [...bundle.recommendations.values()].find((r) => r.decision === 'pending');
  if (allClosed && !pendingRec) return <SessionSummaryView bundle={bundle} onFinish={() => finishSession(sessionId)} />;

  const anyProgress = bundle.exercises.some((e) => e.status !== 'pending' && e.status !== 'active') || [...bundle.sets.values()].flat().some((s) => s.done);
  if (!started && !anyProgress) return <Overview bundle={bundle} onStart={() => setStarted(true)} />;

  return <ExerciseRunner bundle={bundle} />;
}

/* ---------- Список упражнений перед стартом ---------- */

function Overview({ bundle, onStart }: { bundle: SessionBundle; onStart: () => void }) {
  const { session, exercises } = bundle;
  return (
    <Screen tabbar={false}>
      <TopBar onBack={() => navigate('/')} title="Тренировка" subtitle={formatDateShort(session.date)} right={<SessionMenu bundle={bundle} />} />
      <div className="mb-5 flex items-center gap-3">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#8a72ff] to-[#5b6dff] text-[24px] font-bold glow-accent">{session.dayLetterSnapshot}</div>
        <div>
          <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em]">{session.dayNameSnapshot}</h1>
          <div className="text-[14px] text-ink-2">{exercises.length} упражн. · по порядку</div>
        </div>
      </div>
      <div className="space-y-2">
        {exercises.map((e, i) => (
          <div key={e.id} className="glass flex items-center gap-3 rounded-2xl p-3.5">
            <div className="num grid h-9 w-9 place-items-center rounded-xl bg-white/5 text-[15px] font-bold text-ink-2">{i + 1}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[16px] font-semibold">{e.nameSnapshot}</div>
              <div className="num text-[14px] text-ink-2">
                {e.plannedSets} × {e.plannedReps}
              </div>
            </div>
            {e.isCalibration ? <Pill tone="warn">Калибровка</Pill> : <div className="num text-[17px] font-semibold">{formatKg(e.plannedWeightG, true)}</div>}
          </div>
        ))}
      </div>
      <div className="mt-6">
        <Button size="xl" onClick={onStart}>
          Поехали <ArrowRight size={20} />
        </Button>
      </div>
    </Screen>
  );
}

/* ---------- Меню тренировки ---------- */

function SessionMenu({ bundle }: { bundle: SessionBundle }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<'finish' | 'abandon' | null>(null);
  return (
    <>
      <IconButton aria-label="Меню тренировки" onClick={() => setOpen(true)}>
        <MoreHorizontal size={20} />
      </IconButton>
      <Sheet open={open} onClose={() => { setOpen(false); setConfirm(null); }} title="Тренировка">
        {confirm === null && (
          <div className="space-y-2">
            <Button variant="secondary" onClick={() => setConfirm('finish')}>
              Завершить досрочно
            </Button>
            <Button variant="danger" onClick={() => setConfirm('abandon')}>
              Отменить тренировку
            </Button>
          </div>
        )}
        {confirm === 'finish' && (
          <div>
            <p className="mb-4 text-[15px] text-ink-2">Невыполненные упражнения будут отмечены как пропущенные, их веса не изменятся. Результаты сохранятся в истории.</p>
            <Button
              onClick={async () => {
                await finishSession(bundle.session.id);
                setOpen(false);
              }}
            >
              Завершить и сохранить
            </Button>
          </div>
        )}
        {confirm === 'abandon' && (
          <div>
            <p className="mb-4 text-[15px] text-ink-2">Тренировка не попадёт в историю и аналитику. Уже принятые изменения весов останутся. Действие нельзя отменить.</p>
            <Button
              variant="danger"
              onClick={async () => {
                await abandonSession(bundle.session.id);
                setOpen(false);
                navigate('/', true);
              }}
            >
              Да, отменить тренировку
            </Button>
          </div>
        )}
      </Sheet>
    </>
  );
}

/* ---------- Сопровождение по упражнениям ---------- */

function ExerciseRunner({ bundle }: { bundle: SessionBundle }) {
  const { session, exercises, sets, recommendations } = bundle;
  const [listOpen, setListOpen] = useState(false);
  const index = Math.min(session.currentIndex, exercises.length - 1);
  const es = exercises[index];
  const esSets = sets.get(es.id) ?? [];
  const rec = recommendations.get(es.id);
  const work = esSets.filter((s) => s.kind === 'work');
  const allWorkDone = work.length > 0 && work.every((s) => s.done);
  const pendingRec = [...recommendations.values()].find((r) => r.decision === 'pending');

  // Если есть неотвеченная рекомендация в другом упражнении — показываем её
  useEffect(() => {
    if (pendingRec && pendingRec.exerciseSessionId !== es.id) {
      const i = exercises.findIndex((e) => e.id === pendingRec.exerciseSessionId);
      if (i >= 0) setCurrentIndex(session.id, i);
    }
  }, [pendingRec, es.id, exercises, session.id]);

  const goNext = async () => {
    const after = exercises.findIndex((e, i) => i > index && (e.status === 'pending' || e.status === 'active'));
    const before = exercises.findIndex((e) => e.status === 'pending' || e.status === 'active');
    const target = after >= 0 ? after : before;
    if (target >= 0 && target !== index) await setCurrentIndex(session.id, target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const done = exercises.filter((e) => e.status === 'done' || e.status === 'skipped').length;
  let phase: 'sets' | 'rate' | 'rec' | 'closed';
  if (es.status === 'skipped') phase = 'closed';
  else if (rec && rec.decision === 'pending') phase = 'rec';
  else if (es.status === 'done') phase = 'closed';
  else if (allWorkDone) phase = 'rate';
  else phase = 'sets';

  return (
    <Screen tabbar={false}>
      <Hero
        title="Тренировка"
        subtitle={session.dayNameSnapshot}
        icon={<Target size={18} />}
        photo="bench"
        height={190}
        top={
          <div className="flex items-center justify-between">
            <IconButton aria-label="На главную" className="bg-black/40 backdrop-blur" onClick={() => navigate('/')}>
              <ChevronLeft size={22} />
            </IconButton>
            <div className="flex gap-1.5">
              <IconButton aria-label="Список упражнений" className="bg-black/40 backdrop-blur" onClick={() => setListOpen(true)}>
                <List size={20} />
              </IconButton>
              <SessionMenu bundle={bundle} />
            </div>
          </div>
        }
      />
      <div className="mb-1 mt-3 flex items-center gap-4">
        <div className="shrink-0 text-[16px] font-semibold">
          Упражнение <span className="num font-extrabold">{index + 1}</span> <span className="text-ink-3">из {exercises.length}</span>
        </div>
        <Segments
          className="flex-1"
          total={exercises.length}
          done={(i) => (exercises[i].status === 'done' ? 'done' : exercises[i].status === 'skipped' ? 'skip' : i === index ? 'current' : 'todo')}
        />
      </div>
      <div className="mb-3 text-right text-[12px] text-ink-3">
        выполнено <span className="num">{Math.round((done / exercises.length) * 100)}%</span>
      </div>

      {phase === 'sets' && <SetsPhase key={es.id} es={es} sets={esSets} sessionId={session.id} restEndsAt={session.restEndsAt} onSkip={async () => { await skipExercise(es.id); await goNext(); }} />}
      {phase === 'rate' && <RatePhase key={es.id} es={es} sets={esSets} />}
      {phase === 'rec' && rec && <RecommendationCard key={rec.id} es={es} rec={rec} sessionDayLetter={session.dayLetterSnapshot} onDone={goNext} />}
      {phase === 'closed' && <ClosedExercise es={es} rec={rec} onNext={goNext} />}

      <Sheet open={listOpen} onClose={() => setListOpen(false)} title="Упражнения">
        <div className="space-y-2">
          {exercises.map((e, i) => (
            <button
              key={e.id}
              onClick={async () => {
                await setCurrentIndex(session.id, i);
                setListOpen(false);
              }}
              className={cx('flex w-full items-center gap-3 rounded-2xl p-3.5 text-left', i === index ? 'bg-accent-soft' : 'bg-surface-2 active:bg-surface-3')}
            >
              <span
                className={cx(
                  'num grid h-8 w-8 place-items-center rounded-lg text-[14px] font-bold',
                  e.status === 'done' ? 'bg-success text-[#04140d]' : e.status === 'skipped' ? 'bg-white/10 text-ink-3' : 'bg-white/5 text-ink-2',
                )}
              >
                {e.status === 'done' ? <Check size={16} strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{e.nameSnapshot}</span>
                <span className="num block text-[13px] text-ink-3">
                  {e.plannedSets}×{e.plannedReps}
                  {e.status === 'skipped' && ' · пропущено'}
                  {e.rating && ` · ${RATING_LABEL[e.rating]}`}
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

/* ---------- Фаза 1: подходы ---------- */

function ExerciseHeader({ es, compact }: { es: ExerciseSession; compact?: boolean }) {
  const last = useLiveQuery(() => lastResultFor(es.programExerciseId, es.sessionId), [es.programExerciseId, es.sessionId]);
  return (
    <div className={cx('relative overflow-hidden', compact ? 'mb-3' : 'mb-4')}>
      <div className="pointer-events-none absolute -right-6 -top-4 h-[150px] w-[190px] opacity-90 [mask-image:radial-gradient(closest-side,black_55%,transparent)]">
        <img src={PHOTOS.plates} alt="" className="h-full w-full object-cover" />
      </div>
      <div className="relative pr-24">
        <h2 className="text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em]">{es.nameSnapshot}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-ink-2">
          <Dumbbell size={18} />
          <span className="num text-[18px] font-semibold">
            {es.plannedSets}×{es.plannedReps}
          </span>
          {es.isCalibration ? <Pill tone="warn">калибровка</Pill> : <span className="num text-[18px] font-semibold">— {formatKg(es.plannedWeightG, true)}</span>}
        </div>
      </div>
      {last && (
        <div className="relative mt-3 flex items-center gap-2 rounded-xl bg-black/30 px-3 py-2 text-[13px] text-ink-2 ring-1 ring-white/[0.06]">
          <History size={15} className="shrink-0 text-ink-3" />
          <span className="min-w-0 truncate">
            Прошлый раз{last.date ? ` (${formatDateShort(last.date)})` : ''}:{' '}
            <span className="num font-semibold text-ink">{last.sets.map((s) => `${s.actualReps}×${formatKg(s.actualWeightG)}`).join(', ') || '—'}</span>
            {last.exercise.rating && ` · ${RATING_LABEL[last.exercise.rating].toLowerCase()}`}
          </span>
        </div>
      )}
    </div>
  );
}

function SetsPhase({ es, sets, sessionId, restEndsAt, onSkip }: { es: ExerciseSession; sets: SetResult[]; sessionId: string; restEndsAt: string | null; onSkip: () => void }) {
  const current = sets.find((s) => !s.done && s.kind === 'warmup') ?? sets.find((s) => !s.done);
  const [editing, setEditing] = useState<SetResult | null>(null);
  const [skipAsk, setSkipAsk] = useState(false);
  const restMs = restEndsAt ? new Date(restEndsAt).getTime() : 0;
  const now = useNow(!!restEndsAt);
  const resting = restEndsAt !== null && restMs > now;
  const [buzzed, setBuzzed] = useState<string | null>(null);
  useEffect(() => {
    if (restEndsAt && restMs <= now && buzzed !== restEndsAt) {
      setBuzzed(restEndsAt);
      navigator.vibrate?.([200, 100, 200]);
    }
  }, [now, restEndsAt, restMs, buzzed]);

  const curWeight = current ? current.actualWeightG ?? current.plannedWeightG : null;
  const curReps = current ? current.actualReps ?? current.plannedReps : 0;
  const weightStep = Math.min(es.stepG, 2500) || 2500;
  let workNo = 0;

  return (
    <div className="animate-rise">
      <div className="card-accent rounded-[26px] p-4 pb-3">
      <ExerciseHeader es={es} />

      {/* Таблица подходов */}
      <div>
        <div className="grid grid-cols-[52px_1fr_1fr_44px] items-center px-2 pb-2 text-[13px] font-medium text-ink-3">
          <span>Подход</span>
          <span className="text-center">Повт.</span>
          <span className="text-center">Вес</span>
          <span />
        </div>
        <div className="space-y-2">
          {sets.map((s) => {
            const isCur = current?.id === s.id;
            const label = s.kind === 'warmup' ? 'Р' : String(++workNo);
            return (
              <button
                key={s.id}
                onClick={() => setEditing(s)}
                className={cx(
                  'grid h-[52px] w-full grid-cols-[52px_1fr_1fr_44px] items-center rounded-2xl px-1 text-left transition-all duration-300 active:scale-[0.98]',
                  s.done && 'bg-gradient-to-r from-success/20 to-success/[0.06] glow-success',
                  isCur && 'bg-gradient-to-r from-accent/30 to-accent/[0.08] animate-glow',
                  !s.done && !isCur && 'border border-dashed border-white/15 bg-black/20',
                )}
              >
                <span className={cx('num pl-2.5 text-[16px] font-bold', s.kind === 'warmup' ? 'text-warn' : 'text-ink-2')}>{label}</span>
                <span className="num text-center text-[19px] font-bold">{s.done ? s.actualReps : (s.actualReps ?? s.plannedReps)}</span>
                <span className={cx('num text-center text-[19px] font-bold', !s.done && !isCur && 'text-ink-2')}>
                  {formatKg(s.done ? s.actualWeightG : s.actualWeightG ?? s.plannedWeightG)}
                  <span className="ml-0.5 text-[13px] font-medium text-ink-3">кг</span>
                </span>
                <span className="grid place-items-center">
                  {s.done ? (
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-success text-[#04140d] shadow-[0_0_12px_rgb(62_227_156/0.8)] animate-pop">
                      <Check size={16} strokeWidth={3} />
                    </span>
                  ) : (
                    <span className={cx('h-7 w-7 rounded-full border-2', isCur ? 'border-accent' : 'border-white/15')} />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      </div>

      {/* Таймер отдыха */}
      {resting && (
        <div className="mx-auto mt-3 flex items-center gap-3 rounded-2xl border border-accent/50 bg-black/40 p-2.5 pl-3.5 shadow-[0_0_30px_-8px_rgb(124_92_255/0.8)] animate-pop">
          <Timer size={22} className="ml-1 text-[#b3a5ff]" />
          <div className="flex-1">
            <div className="text-[12px] text-[#c4b9ff]">Отдых</div>
            <div className="num text-[28px] font-bold leading-none">{mmss(restMs - now)}</div>
          </div>
          <button className="h-11 rounded-xl bg-white/10 px-3 text-[14px] font-semibold active:bg-white/15" onClick={() => extendRest(sessionId, 30)}>
            +30 с
          </button>
          <button className="h-11 rounded-xl bg-white/10 px-3 text-[14px] font-semibold active:bg-white/15" onClick={() => clearRest(sessionId)}>
            Хватит
          </button>
        </div>
      )}

      {/* Текущий подход */}
      {current && (
        <div className="mt-4 space-y-2.5">
          <div className="px-1 text-[13px] font-medium text-ink-2">
            {current.kind === 'warmup' ? 'Разминочный подход' : `Рабочий подход ${sets.filter((s) => s.kind === 'work').indexOf(current) + 1}`} — можно поправить перед отметкой
          </div>
          {current.plannedWeightG === null && (curWeight === null || !sets.some((x) => x.done && x.kind === current.kind)) ? (
            <WeightInput valueG={curWeight} placeholder="Вес, с которым работаешь" onChange={(g) => updateSet(current.id, { actualWeightG: g })} />
          ) : (
            <Stepper
              size="lg"
              value={curWeight ?? 0}
              step={weightStep}
              max={1000000}
              format={(v) => formatKg(v)}
              label="кг"
              onChange={(v) => updateSet(current.id, { actualWeightG: v })}
            />
          )}
          <Stepper size="lg" value={curReps} min={0} max={100} label="повторений" onChange={(v) => updateSet(current.id, { actualReps: v })} />
          <Button
            size="xl"
            variant="success"
            disabled={curWeight === null}
            onClick={async () => {
              try {
                await completeSet(current.id);
              } catch (e) {
                toast((e as Error).message);
              }
            }}
          >
            <Check size={22} strokeWidth={3} /> Подход выполнен
          </Button>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" size="md" onClick={() => addSet(es.id, 'warmup')}>
          <Flame size={17} /> Разминка
        </Button>
        <Button variant="secondary" size="md" onClick={() => setSkipAsk(true)}>
          <SkipForward size={17} /> Пропустить
        </Button>
      </div>
      {es.restSec === null && <div className="mt-3 text-center text-[12px] text-ink-3">Время отдыха не задано — таймер 2:00 по умолчанию</div>}

      <Sheet open={skipAsk} onClose={() => setSkipAsk(false)} title="Пропустить упражнение?">
        <p className="mb-4 text-[15px] text-ink-2">Рабочий вес не изменится. Отметка о пропуске попадёт в историю.</p>
        <Button
          onClick={() => {
            setSkipAsk(false);
            onSkip();
          }}
        >
          Пропустить
        </Button>
      </Sheet>

      <SetEditor set={editing} onClose={() => setEditing(null)} stepG={weightStep} />
    </div>
  );
}

function SetEditor({ set, onClose, stepG }: { set: SetResult | null; onClose: () => void; stepG: number }) {
  const [reps, setReps] = useState(0);
  const [weight, setWeight] = useState<number | null>(null);
  useEffect(() => {
    if (set) {
      setReps(set.actualReps ?? set.plannedReps);
      setWeight(set.actualWeightG ?? set.plannedWeightG);
    }
  }, [set]);
  if (!set) return null;
  return (
    <Sheet open onClose={onClose} title={set.kind === 'warmup' ? 'Разминочный подход' : 'Рабочий подход'}>
      <div className="space-y-3">
        <div>
          <div className="mb-1.5 px-1 text-[13px] font-medium text-ink-2">Вес</div>
          <WeightInput valueG={weight} onChange={setWeight} />
          {weight !== null && (
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {[-stepG * 2, -stepG, stepG, stepG * 2].map((d) => (
                <button key={d} onClick={() => setWeight(Math.max(0, weight + d))} className="num h-11 rounded-xl bg-surface-2 text-[14px] font-semibold active:bg-surface-3">
                  {d > 0 ? '+' : '−'}
                  {formatKg(Math.abs(d))}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="mb-1.5 px-1 text-[13px] font-medium text-ink-2">Повторения</div>
          <Stepper size="lg" value={reps} min={0} max={100} onChange={setReps} />
        </div>
        <Button
          onClick={async () => {
            if (set.done) await updateSet(set.id, { actualReps: reps, actualWeightG: weight });
            else await updateSet(set.id, { actualReps: reps, actualWeightG: weight });
            onClose();
          }}
        >
          Сохранить
        </Button>
        <div className="grid grid-cols-2 gap-2">
          {set.done ? (
            <Button variant="secondary" size="md" onClick={async () => { await uncompleteSet(set.id); onClose(); }}>
              <Undo2 size={17} /> Не выполнен
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="md"
              disabled={weight === null}
              onClick={async () => {
                await completeSet(set.id, { reps, weightG: weight });
                onClose();
              }}
            >
              <Check size={17} /> Выполнен
            </Button>
          )}
          <Button variant="danger" size="md" onClick={async () => { await removeSet(set.id); onClose(); }}>
            <Trash2 size={17} /> Удалить
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

/* ---------- Фаза 2: оценка упражнения ---------- */

const RATING_OPTIONS: { value: Rating; title: string; text: string; tone: string; icon: typeof Check }[] = [
  {
    value: 'easy',
    title: 'Сделал легко',
    text: 'Выполнил все подходы и повторения самостоятельно. В последнем подходе остался небольшой запас.',
    tone: 'success',
    icon: BicepsFlexed,
  },
  {
    value: 'hard',
    title: 'Сделал тяжело',
    text: 'Выполнил всё самостоятельно, но последнее повторение далось тяжело. Запаса практически не осталось.',
    tone: 'warn',
    icon: Dumbbell,
  },
  {
    value: 'failed',
    title: 'Не справился самостоятельно',
    text: 'Потребовалась помощь страхующего или не удалось выполнить все запланированные повторения.',
    tone: 'danger',
    icon: HandHelping,
  },
];

function RatePhase({ es, sets }: { es: ExerciseSession; sets: SetResult[] }) {
  const work = sets.filter((s) => s.kind === 'work');
  const doneWork = work.filter((s) => s.done);
  const shortReps = doneWork.some((s) => (s.actualReps ?? 0) < es.plannedReps);
  const [rating, setRating] = useState<Rating | null>(shortReps ? 'failed' : null);
  const [failReason, setFailReason] = useState<FailReason>(shortReps ? 'reps' : 'assist');
  const [assisted, setAssisted] = useState<string[]>(doneWork.length ? [doneWork[doneWork.length - 1].id] : []);
  const [pain, setPain] = useState(false);
  const [unusual, setUnusual] = useState(false);
  const [busy, setBusy] = useState(false);

  const toneCls = (t: string, on: boolean) =>
    on
      ? t === 'success'
        ? 'border-success/70 bg-success-soft'
        : t === 'warn'
          ? 'border-warn/70 bg-warn-soft'
          : 'border-danger/70 bg-danger-soft'
      : 'border-line bg-surface';
  const iconCls = (t: string) =>
    t === 'success' ? 'bg-success/15 text-success ring-1 ring-success/30' : t === 'warn' ? 'bg-warn/15 text-warn ring-1 ring-warn/30' : 'bg-danger/15 text-danger ring-1 ring-danger/30';

  return (
    <div className="animate-rise">
      <div className="mb-4 mt-3">
        <div className="text-[14px] text-ink-3">
          {es.nameSnapshot} · <span className="num">{doneWork.map((s) => `${s.actualReps}×${formatKg(s.actualWeightG)}`).join(', ')}</span>
        </div>
        <h1 className="mt-1 text-[30px] font-extrabold leading-tight tracking-[-0.03em]">Как прошло упражнение?</h1>
      </div>
      {shortReps && (
        <div className="mb-3 flex gap-2 rounded-2xl bg-warn-soft p-3 text-[13px] text-warn">
          <CircleHelp size={17} className="mt-0.5 shrink-0" />
          Выполнено меньше повторений, чем запланировано, — вес в этот раз не повысится.
        </div>
      )}
      <div className="space-y-2.5">
        {RATING_OPTIONS.map((o) => {
          const Icon = o.icon;
          const on = rating === o.value;
          return (
            <button
              key={o.value}
              onClick={() => setRating(o.value)}
              className={cx('flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition active:scale-[0.99]', toneCls(o.tone, on))}
            >
              <span className={cx('grid h-14 w-14 shrink-0 place-items-center rounded-2xl', iconCls(o.tone))}>
                <Icon size={26} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] font-semibold">{o.title}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-ink-2">{o.text}</span>
              </span>
              <span className={cx('mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2', on ? 'border-white bg-white text-[#0a0a0f]' : 'border-white/20')}>
                {on && <Check size={14} strokeWidth={3} />}
              </span>
            </button>
          );
        })}
      </div>

      {rating === 'failed' && (
        <div className="mt-3 space-y-3 rounded-2xl border border-line bg-surface p-3.5 animate-rise">
          <div className="grid grid-cols-2 gap-2">
            {(['assist', 'reps'] as FailReason[]).map((r) => (
              <button
                key={r}
                onClick={() => setFailReason(r)}
                className={cx('min-h-11 rounded-xl border px-2 py-2 text-[14px] font-semibold', failReason === r ? 'border-danger/60 bg-danger-soft text-ink' : 'border-line bg-surface-2 text-ink-2')}
              >
                {r === 'assist' ? 'Помог страхующий' : 'Не все повторения'}
              </button>
            ))}
          </div>
          {failReason === 'assist' && (
            <div>
              <div className="mb-1.5 text-[13px] text-ink-2">В каком подходе понадобилась помощь?</div>
              <div className="flex flex-wrap gap-1.5">
                {doneWork.map((s, i) => {
                  const on = assisted.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => setAssisted(on ? assisted.filter((x) => x !== s.id) : [...assisted, s.id])}
                      className={cx('num h-10 min-w-10 rounded-xl border px-3 text-[15px] font-bold', on ? 'border-danger/60 bg-danger-soft' : 'border-line bg-surface-2 text-ink-2')}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-line bg-surface px-4 py-1">
        <Toggle checked={pain} onChange={setPain} label={<span className="inline-flex items-center gap-2"><ShieldAlert size={17} className="text-danger" /> Боль или дискомфорт</span>} hint="Вес не будет увеличен" />
        <div className="h-px bg-line" />
        <Toggle checked={unusual} onChange={setUnusual} label="Нестандартные условия" hint="Другой зал, мало сна, болезнь и т. п." />
      </div>

      <div className="mt-5">
        <Button
          size="xl"
          disabled={!rating || busy}
          onClick={async () => {
            if (!rating) return;
            setBusy(true);
            try {
              await rateExercise(es.id, {
                rating,
                failReason: rating === 'failed' ? failReason : null,
                pain,
                unusual,
                assistedSetIds: rating === 'failed' && failReason === 'assist' ? assisted : [],
              });
            } catch (e) {
              toast((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Готово
        </Button>
      </div>
    </div>
  );
}

/* ---------- Фаза 3: рекомендация веса ---------- */

function RecommendationCard({ es, rec, sessionDayLetter, onDone }: { es: ExerciseSession; rec: WeightRecommendation; sessionDayLetter: string; onDone: () => void }) {
  const [custom, setCustom] = useState(false);
  const [customG, setCustomG] = useState<number | null>(rec.recommendedWeightG);
  const [busy, setBusy] = useState(false);
  const pe = useLiveQuery(() => db.programExercises.get(es.programExerciseId), [es.programExerciseId]);
  const day = useLiveQuery(() => (pe ? db.days.get(pe.dayId) : undefined), [pe?.dayId]);
  const delta = rec.recommendedWeightG - rec.fromWeightG;
  const requiresChoice = rec.reason === 'mixed_weights';

  const tone = {
    success: { ring: 'border-success/40', glow: 'from-success/25', text: 'text-success' },
    neutral: { ring: 'border-accent/40', glow: 'from-accent/25', text: 'text-[#c4b9ff]' },
    warning: { ring: 'border-warn/40', glow: 'from-warn/20', text: 'text-warn' },
    danger: { ring: 'border-danger/40', glow: 'from-danger/20', text: 'text-danger' },
  }[rec.tone];

  const decide = async (d: 'accepted' | 'rejected' | 'custom') => {
    setBusy(true);
    try {
      await decideRecommendation(rec.id, d, d === 'custom' ? customG ?? undefined : undefined);
      onDone();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const letter = day?.letter ?? sessionDayLetter;
  const nextText = day ? `тренировку ${letter} — ${WEEKDAYS_ACC[day.weekday]}` : `тренировку ${letter}`;

  return (
    <div className="mt-3 animate-rise">
      <div className={cx('relative overflow-hidden rounded-[28px] border bg-[#15131f] p-5 shadow-[0_30px_70px_-30px_rgb(124_92_255/0.8)]', tone.ring)}>
        <div className={cx('pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b to-transparent', tone.glow)} />
        <div className="pointer-events-none absolute -right-10 -top-6 h-[170px] w-[200px] opacity-70 [mask-image:radial-gradient(closest-side,black_50%,transparent)]">
          <img src={PHOTOS.plates} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="relative">
          <div className={cx('text-[13px] font-semibold uppercase tracking-[0.12em]', tone.text)}>Рекомендация</div>
          <h2 className="mt-1.5 pr-16 text-[26px] font-extrabold leading-tight tracking-[-0.02em]">{rec.title}</h2>
          <p className="mt-1 text-[15px] text-ink-2">{rec.message}</p>
          <div className="mt-4 text-[14px] text-ink-3">
            {es.nameSnapshot} — тренировка {letter}
          </div>
          <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl bg-black/25 p-4">
            <div>
              <div className="text-[12px] text-ink-3">{es.isCalibration ? 'Стартовый вес' : 'Текущий вес'}</div>
              <div className="num text-[30px] font-extrabold leading-none text-ink-2">{formatKg(rec.fromWeightG)}</div>
            </div>
            <ArrowRight className="text-ink-3" />
            <div className="text-right">
              <div className="text-[12px] text-ink-3">Следующий вес</div>
              <div className={cx('num text-[40px] font-extrabold leading-none animate-pop', delta > 0 ? 'text-success drop-shadow-[0_0_18px_rgb(62_227_156/0.6)]' : delta < 0 ? 'text-warn' : 'text-accent-3')}>{formatKg(rec.recommendedWeightG)}</div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between px-1 text-[14px]">
            <span className="text-ink-3">Изменение</span>
            <span className={cx('num font-semibold', delta > 0 ? 'text-success' : delta < 0 ? 'text-warn' : 'text-ink-2')}>{formatDeltaKg(delta)}</span>
          </div>
          {rec.warning && (
            <div className="mt-3 flex gap-2 rounded-xl bg-danger-soft/70 p-3 text-[13px] text-[#ffb3bd]">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              {rec.warning}
            </div>
          )}
          <div className="mt-3 text-[13px] text-ink-3">Новый рабочий вес будет применён в следующую {nextText}.</div>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {!requiresChoice && (
          <Button size="xl" disabled={busy} onClick={() => decide('accepted')}>
            Принять рекомендацию
          </Button>
        )}
        {delta !== 0 && (
          <Button variant="secondary" disabled={busy} onClick={() => decide('rejected')}>
            Оставить {formatKg(rec.fromWeightG, true)}
          </Button>
        )}
        {requiresChoice && (
          <Button size="xl" disabled={busy} onClick={() => decide('rejected')}>
            Оставить {formatKg(rec.fromWeightG, true)}
          </Button>
        )}
        {!custom ? (
          <Button variant="ghost" disabled={busy} onClick={() => setCustom(true)}>
            Указать свой вес
          </Button>
        ) : (
          <div className="flex gap-2 animate-rise">
            <WeightInput className="flex-1" autoFocus valueG={customG} onChange={setCustomG} />
            <Button block={false} disabled={busy || customG === null} onClick={() => decide('custom')}>
              Сохранить
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Закрытое упражнение ---------- */

function ClosedExercise({ es, rec, onNext }: { es: ExerciseSession; rec?: WeightRecommendation; onNext: () => void }) {
  const decisionText = useMemo(() => {
    if (!rec || rec.appliedWeightG === null) return null;
    return `${formatKg(rec.fromWeightG)} → ${formatKg(rec.appliedWeightG, true)}`;
  }, [rec]);
  return (
    <div className="mt-6 animate-rise">
      <ExerciseHeader es={es} />
      <div className="glass rounded-[var(--radius-card)] p-5 text-center">
        <div className={cx('mx-auto grid h-14 w-14 place-items-center rounded-full', es.status === 'skipped' ? 'bg-white/10' : 'bg-success text-[#04140d]')}>
          {es.status === 'skipped' ? <SkipForward /> : <Check strokeWidth={3} />}
        </div>
        <div className="mt-3 text-[18px] font-semibold">{es.status === 'skipped' ? 'Упражнение пропущено' : `Готово · ${es.rating ? RATING_LABEL[es.rating] : ''}`}</div>
        {decisionText && <div className="num mt-1 text-[15px] text-ink-2">Следующий раз: {decisionText}</div>}
      </div>
      <div className="mt-4">
        <Button size="xl" onClick={onNext}>
          Дальше <ArrowRight size={20} />
        </Button>
      </div>
      {es.status === 'skipped' && (
        <Button
          variant="ghost"
          className="mt-2"
          onClick={async () => {
            await db.exerciseSessions.update(es.id, { status: 'active', completedAt: null });
          }}
        >
          <Plus size={17} /> Всё-таки выполнить
        </Button>
      )}
    </div>
  );
}

export function useActiveSessionGuard() {
  const { activeSession } = useApp();
  return activeSession;
}

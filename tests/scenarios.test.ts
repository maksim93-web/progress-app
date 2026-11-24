import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ProgressDB, useDatabase, db } from '../src/db/database';
import { ensureActiveProfile } from '../src/services/profile';
import { createProgramFromDraft, editProgramExercise, loadProgramBundle, moveDay, type ProgramDraft } from '../src/services/program';
import {
  completeSet,
  decideRecommendation,
  finishSession,
  getInProgressSession,
  loadSessionBundle,
  rateExercise,
  startSession,
  summarize,
  updateSet,
  addSet,
} from '../src/services/workout';
import { loadDataset } from '../src/services/dataset';
import { buildPlan } from '../src/domain/plan';
import { lineStats, linePoints, overallStats } from '../src/domain/analytics';
import { computeRecommendation } from '../src/domain/progression';
import { deterministicInsights, deterministicMonthlySummary } from '../src/services/assistant';
import { exportBackup, importBackup, parseBackup } from '../src/services/backup';
import { formatKg, kgToG } from '../src/lib/weight';
import type { ID, Rating } from '../src/domain/types';

let n = 0;
beforeEach(() => {
  useDatabase(new ProgressDB('test-' + ++n));
});

const START = '2026-11-02'; // понедельник

function ex(exerciseId: string, name: string, sets: number, reps: number, kg: number | null) {
  return {
    key: name + sets + reps,
    exerciseId,
    name,
    sets,
    reps,
    weightG: kg === null ? null : kgToG(kg),
    stepG: 2500,
    restSec: 120,
    comment: '',
    autoProgression: true,
  };
}

function draft(): ProgramDraft {
  return {
    name: 'Жим 4 недели',
    goal: 'Увеличить жим лёжа',
    daysPerWeek: 3,
    cycleWeeks: 4,
    startDate: START,
    days: [
      { key: 'a', letter: 'A', name: 'Тяжёлый жим', weekday: 0, exercises: [ex('ex-bench', 'Жим лёжа', 3, 1, 100), ex('ex-row', 'Тяга штанги', 4, 8, 80)] },
      { key: 'b', letter: 'B', name: 'Средний жим', weekday: 2, exercises: [ex('ex-bench', 'Жим лёжа', 4, 5, 85), ex('ex-bench-close', 'Жим узким хватом', 3, 6, null)] },
      { key: 'c', letter: 'C', name: 'Объёмный жим', weekday: 4, exercises: [ex('ex-bench', 'Жим лёжа', 3, 8, 75)] },
    ],
  };
}

async function setup() {
  const profile = await ensureActiveProfile();
  const program = await createProgramFromDraft(profile.id, draft());
  const bundle = (await loadProgramBundle(program.id))!;
  const dayByLetter = (l: string) => bundle.days.find((d) => d.letter === l)!;
  const bench = (l: string) => bundle.exercises.find((e) => e.dayId === dayByLetter(l).id && e.exerciseId === 'ex-bench')!;
  return { profile, program, bundle, dayByLetter, bench };
}

/** Проводит тренировку дня: все подходы по плану, оценка для каждого упражнения, принимает рекомендации */
async function doWorkout(
  profileId: ID,
  dayId: ID,
  date: string,
  opts: { rating?: Rating; failReason?: 'assist' | 'reps'; pain?: boolean; decision?: 'accepted' | 'rejected' | 'custom'; customG?: number; weightG?: number } = {},
) {
  const s = await startSession(profileId, dayId, date);
  const b = (await loadSessionBundle(s.id))!;
  for (const e of b.exercises) {
    for (const set of b.sets.get(e.id)!) await completeSet(set.id, { weightG: opts.weightG ?? set.plannedWeightG ?? 60000 });
    const work = b.sets.get(e.id)!;
    const rec = await rateExercise(e.id, {
      rating: opts.rating ?? 'easy',
      failReason: opts.failReason,
      pain: opts.pain,
      assistedSetIds: opts.failReason === 'assist' ? [work.at(-1)!.id] : [],
    });
    if (rec) await decideRecommendation(rec.id, opts.decision ?? 'accepted', opts.customG);
  }
  await finishSession(s.id);
  return s;
}

async function weightOf(peId: ID) {
  return (await db.programExercises.get(peId))!.workingWeightG;
}

describe('Сценарии ТЗ', () => {
  it('1–2. Программа с тремя днями, одно упражнение в разных днях — разные линии', async () => {
    const { bundle, bench } = await setup();
    expect(bundle.days).toHaveLength(3);
    const ids = new Set(['A', 'B', 'C'].map((l) => bench(l).id));
    expect(ids.size).toBe(3);
    expect(bench('A').reps).toBe(1);
    expect(bench('B').reps).toBe(5);
    expect(bench('C').reps).toBe(8);
  });

  it('3. Калибровка: неизвестный вес определяется в зале и сохраняется как стартовый', async () => {
    const { profile, dayByLetter, bundle } = await setup();
    const close = bundle.exercises.find((e) => e.exerciseId === 'ex-bench-close')!;
    expect(close.workingWeightG).toBeNull();
    const s = await startSession(profile.id, dayByLetter('B').id, '2026-11-04');
    const b = (await loadSessionBundle(s.id))!;
    const es = b.exercises.find((e) => e.programExerciseId === close.id)!;
    expect(es.isCalibration).toBe(true);
    const sets = b.sets.get(es.id)!;
    await completeSet(sets[0].id, { weightG: kgToG(70) });
    // вес первого подхода подставился в остальные
    for (const set of sets.slice(1)) await completeSet(set.id);
    const rec = await rateExercise(es.id, { rating: 'hard' });
    expect(await weightOf(close.id)).toBe(70000);
    expect(rec!.recommendedWeightG).toBe(70000);
    const hist = await db.history.where({ programExerciseId: close.id }).toArray();
    expect(hist.map((h) => h.source)).toContain('calibration');
  });

  it('3b. Калибровка: слишком тяжело — предлагается снизить стартовый вес', async () => {
    const r = computeRecommendation({
      plannedWeightG: null, plannedSets: 3, plannedReps: 6, isCalibration: true, stepG: 2500, autoProgression: true,
      failStreakForDeload: 2, deloadPercent: 10, rating: 'failed', failReason: 'assist', pain: false, skipped: false, previousRatings: [],
      workSets: [1, 2, 3].map(() => ({ done: true, actualReps: 6, actualWeightG: 70000, assisted: false })),
    })!;
    expect(r.reason).toBe('calibration_failed');
    expect(r.recommendedWeightG).toBeLessThan(70000);
  });

  it('4–6. Пн легко со 100 кг → 102,5 только для тренировки A; Ср и Пт без изменений', async () => {
    const { profile, dayByLetter, bench } = await setup();
    const s = await startSession(profile.id, dayByLetter('A').id, '2026-11-02');
    const b = (await loadSessionBundle(s.id))!;
    const es = b.exercises.find((e) => e.programExerciseId === bench('A').id)!;
    for (const set of b.sets.get(es.id)!) await completeSet(set.id);
    const rec = (await rateExercise(es.id, { rating: 'easy' }))!;
    expect(rec.fromWeightG).toBe(100000);
    expect(rec.recommendedWeightG).toBe(102500);
    expect(formatKg(rec.recommendedWeightG, true)).toBe('102,5 кг');
    await decideRecommendation(rec.id, 'accepted');
    expect(await weightOf(bench('A').id)).toBe(102500);
    expect(await weightOf(bench('B').id)).toBe(85000);
    expect(await weightOf(bench('C').id)).toBe(75000);
  });

  it('7. Тяжело — вес не растёт', async () => {
    const { profile, dayByLetter, bench } = await setup();
    await doWorkout(profile.id, dayByLetter('A').id, '2026-11-02', { rating: 'hard' });
    expect(await weightOf(bench('A').id)).toBe(100000);
  });

  it('8. С помощью страхующего — вес не растёт, есть предупреждение', async () => {
    const { profile, dayByLetter, bench } = await setup();
    await doWorkout(profile.id, dayByLetter('A').id, '2026-11-02', { rating: 'failed', failReason: 'assist' });
    expect(await weightOf(bench('A').id)).toBe(100000);
    const recs = await db.recommendations.where({ programExerciseId: bench('A').id }).toArray();
    expect(recs[0].warning).toBeTruthy();
  });

  it('8b. Две неудачи подряд — предлагается снижение', async () => {
    const { profile, dayByLetter, bench } = await setup();
    await doWorkout(profile.id, dayByLetter('A').id, '2026-11-02', { rating: 'failed', failReason: 'reps', decision: 'rejected' });
    await doWorkout(profile.id, dayByLetter('A').id, '2026-11-09', { rating: 'failed', failReason: 'reps', decision: 'rejected' });
    const recs = (await db.recommendations.where({ programExerciseId: bench('A').id }).toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    expect(recs[1].reason).toBe('failed_deload');
    expect(recs[1].recommendedWeightG).toBe(90000);
  });

  it('9. Боль — вес не растёт даже при «легко»', async () => {
    const { profile, dayByLetter, bench } = await setup();
    await doWorkout(profile.id, dayByLetter('A').id, '2026-11-02', { rating: 'easy', pain: true });
    expect(await weightOf(bench('A').id)).toBe(100000);
  });

  it('10. Рекомендацию можно отклонить', async () => {
    const { profile, dayByLetter, bench } = await setup();
    await doWorkout(profile.id, dayByLetter('A').id, '2026-11-02', { rating: 'easy', decision: 'rejected' });
    expect(await weightOf(bench('A').id)).toBe(100000);
  });

  it('11. Можно указать свой вес', async () => {
    const { profile, dayByLetter, bench } = await setup();
    await doWorkout(profile.id, dayByLetter('A').id, '2026-11-02', { rating: 'easy', decision: 'custom', customG: 101250 });
    expect(await weightOf(bench('A').id)).toBe(101250);
    expect(formatKg(101250)).toBe('101,25');
  });

  it('11b. Фактический вес отличался от плана — расчёт от подтверждённого', async () => {
    const { profile, dayByLetter, bench } = await setup();
    await doWorkout(profile.id, dayByLetter('A').id, '2026-11-02', { rating: 'easy', weightG: 97500 });
    expect(await weightOf(bench('A').id)).toBe(100000); // 97,5 + 2,5
  });

  it('11c. Разные веса в подходах — без уточнения не повышаем', async () => {
    const { profile, dayByLetter, bench } = await setup();
    const s = await startSession(profile.id, dayByLetter('A').id, '2026-11-02');
    const b = (await loadSessionBundle(s.id))!;
    const es = b.exercises.find((e) => e.programExerciseId === bench('A').id)!;
    const sets = b.sets.get(es.id)!;
    await completeSet(sets[0].id, { weightG: 100000 });
    await completeSet(sets[1].id, { weightG: 100000 });
    await completeSet(sets[2].id, { weightG: 95000 });
    const rec = (await rateExercise(es.id, { rating: 'easy' }))!;
    expect(rec.reason).toBe('mixed_weights');
    expect(rec.recommendedWeightG).toBe(100000);
  });

  it('Разминочные подходы не влияют на прогрессию и объём', async () => {
    const { profile, dayByLetter, bench } = await setup();
    const s = await startSession(profile.id, dayByLetter('A').id, '2026-11-02');
    let b = (await loadSessionBundle(s.id))!;
    const es = b.exercises.find((e) => e.programExerciseId === bench('A').id)!;
    await addSet(es.id, 'warmup');
    b = (await loadSessionBundle(s.id))!;
    const all = b.sets.get(es.id)!;
    expect(all[0].kind).toBe('warmup');
    for (const set of all) await completeSet(set.id);
    const rec = (await rateExercise(es.id, { rating: 'easy' }))!;
    expect(rec.reason).toBe('easy_increase');
    expect(rec.fromWeightG).toBe(100000);
  });

  it('Не все повторения при «легко» — вес не растёт', async () => {
    const { profile, dayByLetter, bench } = await setup();
    const s = await startSession(profile.id, dayByLetter('A').id, '2026-11-02');
    const b = (await loadSessionBundle(s.id))!;
    const es = b.exercises.find((e) => e.programExerciseId === bench('C').id) ?? b.exercises[0];
    const sets = b.sets.get(es.id)!;
    for (const set of sets) await completeSet(set.id);
    await updateSet(sets[2].id, { actualReps: 0 });
    const rec = (await rateExercise(es.id, { rating: 'easy' }))!;
    expect(rec.recommendedWeightG).toBe(rec.fromWeightG);
  });

  it('12. Перенос тренировки A на вторник сохраняет линию A', async () => {
    const { profile, dayByLetter, bench } = await setup();
    await doWorkout(profile.id, dayByLetter('A').id, '2026-11-03'); // вторник
    expect(await weightOf(bench('A').id)).toBe(102500);
    expect(await weightOf(bench('B').id)).toBe(85000);
    const session = (await db.sessions.toArray())[0];
    expect(session.plannedDate).toBe('2026-11-02');
    // постоянный перенос дня A на вторник — линия та же
    await moveDay(dayByLetter('A').id, 1);
    const ds = await loadDataset(profile.id);
    const plan = buildPlan(ds, session.programId, 0, 1, '2026-11-05');
    const cellA0 = plan[0].cells.find((c) => c.day.letter === 'A')!;
    expect(cellA0.status).toBe('done');
    const cellA1 = plan[1].cells.find((c) => c.day.letter === 'A')!;
    expect(cellA1.date).toBe('2026-11-10');
    expect(cellA1.exercises.find((e) => e.programExerciseId === bench('A').id)!.weightG).toBe(102500);
  });

  it('13. Прерванная тренировка восстанавливается после «закрытия»', async () => {
    const { profile, dayByLetter } = await setup();
    const s = await startSession(profile.id, dayByLetter('A').id, '2026-11-02');
    const b = (await loadSessionBundle(s.id))!;
    await completeSet(b.sets.get(b.exercises[0].id)![0].id);
    // «перезапуск»: новое подключение к той же базе
    const name = db.name;
    db.close();
    useDatabase(new ProgressDB(name));
    const resumed = await getInProgressSession(profile.id);
    expect(resumed?.id).toBe(s.id);
    const rb = (await loadSessionBundle(s.id))!;
    expect(rb.sets.get(rb.exercises[0].id)![0].done).toBe(true);
  });

  it('14. Изменение программы не меняет историю', async () => {
    const { profile, dayByLetter, bench } = await setup();
    await doWorkout(profile.id, dayByLetter('C').id, '2026-11-06');
    const newId = await editProgramExercise(bench('C').id, { reps: 6 }, 'newLine');
    expect(newId).not.toBe(bench('C').id);
    expect((await db.programExercises.get(bench('C').id))!.status).toBe('removed');
    expect((await db.programExercises.get(newId))!.workingWeightG).toBeNull();
    const es = await db.exerciseSessions.where({ programExerciseId: bench('C').id }).toArray();
    expect(es).toHaveLength(1);
    expect(es[0].plannedReps).toBe(8);
    expect(es[0].confirmedWeightG).toBe(75000);
  });

  it('15–16. Аналитика на реальных данных, прогноз не считается достигнутым', async () => {
    const { profile, program, dayByLetter, bench } = await setup();
    await doWorkout(profile.id, dayByLetter('A').id, '2026-11-02'); // 100 → 102,5
    await doWorkout(profile.id, dayByLetter('A').id, '2026-11-09'); // 102,5 → 105
    const ds = await loadDataset(profile.id);
    const st = lineStats(ds, bench('A').id);
    expect(st.startWeightG).toBe(100000);
    expect(st.currentWeightG).toBe(102500); // выполнено
    expect(st.nextWeightG).toBe(105000); // только план
    expect(st.bestSelfG).toBe(102500);
    expect(st.gainG).toBe(2500);
    expect(st.gainPct).toBe(2.5);
    expect(st.workouts).toBe(2);
    expect(st.e1rmG).toBe(102500);
    const pts = linePoints(ds, bench('A').id);
    expect(pts[0].volumeG).toBe(100000 * 3);
    const ov = overallStats(ds, null, '2026-11-10');
    expect(ov.workouts).toBe(2);
    expect(ov.positiveLines.some((l) => l.peId === bench('A').id)).toBe(true);
    const plan = buildPlan(ds, program.id, 0, 2, '2026-11-10');
    const w2a = plan[2].cells.find((c) => c.day.letter === 'A')!;
    expect(w2a.status).toBe('next');
    expect(w2a.exercises[0].kind).toBe('confirmed');
    const w1b = plan[1].cells.find((c) => c.day.letter === 'B')!;
    expect(w1b.status).toBe('next'); // 11 ноября ещё впереди
    const w0b = plan[0].cells.find((c) => c.day.letter === 'B')!;
    expect(w0b.status).toBe('missed');
  });

  it('Итоги тренировки: объём, подходы, изменения весов', async () => {
    const { profile, dayByLetter } = await setup();
    const s = await doWorkout(profile.id, dayByLetter('A').id, '2026-11-02');
    const sum = summarize((await loadSessionBundle(s.id))!);
    expect(sum.workSets).toBe(7);
    expect(sum.reps).toBe(3 + 32);
    expect(sum.volumeKgReps).toBe(300 + 80 * 32);
    expect(sum.rows[0].fromG).toBe(100000);
    expect(sum.rows[0].toG).toBe(102500);
  });

  it('Помощник: резюме и выявление неудач', async () => {
    const { profile, program, dayByLetter } = await setup();
    await doWorkout(profile.id, dayByLetter('A').id, '2026-11-02');
    await doWorkout(profile.id, dayByLetter('A').id, '2026-11-09');
    await doWorkout(profile.id, dayByLetter('B').id, '2026-11-04', { rating: 'hard', weightG: 85000 });
    await doWorkout(profile.id, dayByLetter('B').id, '2026-11-11', { rating: 'hard', weightG: 85000 });
    const ds = await loadDataset(profile.id);
    const text = deterministicMonthlySummary({ dataset: ds, programId: program.id, today: '2026-11-12' });
    expect(text).toContain('+2,5 кг');
    expect(text).toContain('тяжело');
    const ins = deterministicInsights({ dataset: ds, programId: program.id, today: '2026-11-12' });
    expect(ins.length).toBeGreaterThan(0);
  });

  it('Резервная копия: экспорт и импорт', async () => {
    const { profile, dayByLetter } = await setup();
    await doWorkout(profile.id, dayByLetter('A').id, '2026-11-02');
    const backup = await exportBackup();
    const text = JSON.stringify(backup);
    useDatabase(new ProgressDB('restore-' + n));
    await importBackup(parseBackup(text));
    expect(await db.sessions.count()).toBe(1);
    expect(() => parseBackup('{"x":1}')).toThrow();
  });
});

describe('Вес в граммах', () => {
  it('без ошибок плавающей точки', () => {
    expect(kgToG('102,5')).toBe(102500);
    expect(kgToG(0.1 + 0.2)).toBe(300);
    expect(formatKg(102500)).toBe('102,5');
    expect(formatKg(100000, true)).toBe('100 кг');
    expect(formatKg(1250)).toBe('1,25');
  });
});

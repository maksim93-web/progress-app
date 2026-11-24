/**
 * Интеллектуальный помощник.
 * Сейчас — детерминированный анализ истории (предсказуемо, бесплатно, офлайн).
 * Помощник ТОЛЬКО советует: он не меняет программу, подходы, повторения и веса.
 *
 * Для будущего подключения LLM реализуйте AssistantProvider в llmAssistant.ts
 * и передавайте ему тот же AssistantContext.
 */
import type { Dataset } from './dataset';
import type { ID, ISODate } from '../domain/types';
import { linePoints, listLines } from '../domain/analytics';
import { addDays, diffDays } from '../lib/dates';
import { formatDeltaKg, formatKg } from '../lib/weight';

export type InsightTone = 'success' | 'info' | 'warning' | 'danger';

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  text: string;
  programExerciseId?: ID;
}

export interface AssistantContext {
  dataset: Dataset;
  programId: ID;
  today: ISODate;
}

export interface AssistantProvider {
  insights(ctx: AssistantContext): Promise<Insight[]>;
  monthlySummary(ctx: AssistantContext): Promise<string>;
}

function lineName(l: { exerciseName: string; dayName: string }) {
  return `${l.exerciseName.toLowerCase()} (${l.dayName})`;
}

export function deterministicInsights(ctx: AssistantContext): Insight[] {
  const out: Insight[] = [];
  const lines = listLines(ctx.dataset, ctx.programId).filter((l) => l.active);
  for (const l of lines) {
    const pts = linePoints(ctx.dataset, l.programExerciseId);
    if (pts.length === 0) continue;
    const last = pts.at(-1)!;
    const prev = pts.at(-2);
    const name = lineName(l);

    // Боль
    if (pts.slice(-2).some((p) => p.pain)) {
      out.push({
        id: `pain-${l.programExerciseId}`,
        tone: 'danger',
        title: 'Отмечена боль',
        text: `В упражнении ${name} недавно отмечалась боль. Нагрузку не повышаем. Если боль повторяется — обратись к специалисту.`,
        programExerciseId: l.programExerciseId,
      });
    }

    // Повторяющиеся неудачи
    const lastTwo = pts.slice(-2);
    if (lastTwo.length === 2 && lastTwo.every((p) => p.rating === 'failed')) {
      out.push({
        id: `fail-${l.programExerciseId}`,
        tone: 'danger',
        title: 'Две неудачные тренировки подряд',
        text: `${capitalize(name)}: последние две тренировки не удались. Стоит снизить вес на 5–10% или взять восстановительную неделю.`,
        programExerciseId: l.programExerciseId,
      });
    }

    // Рост субъективной сложности при прежнем весе
    if (prev && last.weightG !== null && last.weightG === prev.weightG && score(last.rating) > score(prev.rating)) {
      out.push({
        id: `harder-${l.programExerciseId}`,
        tone: 'warning',
        title: 'Тот же вес даётся тяжелее',
        text: `${capitalize(name)}: ${formatKg(last.weightG, true)} в прошлый раз было ${ratingWord(prev.rating)}, теперь — ${ratingWord(last.rating)}. Проверь сон и восстановление, вес пока сохраняем.`,
        programExerciseId: l.programExerciseId,
      });
    }

    // Давно нет прогресса
    const ws = pts.map((p) => p.weightG);
    const lastIncreaseIdx = ws.findLastIndex((w, i) => i > 0 && w !== null && ws[i - 1] !== null && w > (ws[i - 1] as number));
    const sinceIdx = lastIncreaseIdx === -1 ? 0 : lastIncreaseIdx;
    const sessionsSince = pts.length - 1 - sinceIdx;
    const daysSince = diffDays(ctx.today, pts[sinceIdx].date);
    if (sessionsSince >= 4 || (pts.length >= 3 && daysSince >= 28 && sessionsSince >= 2)) {
      out.push({
        id: `stall-${l.programExerciseId}`,
        tone: 'info',
        title: 'Давно без прогресса',
        text: `${capitalize(name)}: вес не рос ${sessionsSince} тренировок подряд. Можно уменьшить шаг прогрессии или пересмотреть подходы и повторения.`,
        programExerciseId: l.programExerciseId,
      });
    }

    // Хорошая динамика
    if (prev && last.weightG !== null && prev.weightG !== null && last.weightG > prev.weightG && last.rating === 'easy') {
      out.push({
        id: `up-${l.programExerciseId}`,
        tone: 'success',
        title: 'Уверенный рост',
        text: `${capitalize(name)}: ${formatKg(prev.weightG)} → ${formatKg(last.weightG, true)}, и вес дался легко.`,
        programExerciseId: l.programExerciseId,
      });
    }
  }
  const order: Record<InsightTone, number> = { danger: 0, warning: 1, info: 2, success: 3 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}

/** Текстовое резюме за последние 4 недели */
export function deterministicMonthlySummary(ctx: AssistantContext): string {
  const from = addDays(ctx.today, -27);
  const lines = listLines(ctx.dataset, ctx.programId).filter((l) => l.active);
  const sentences: string[] = [];
  const workouts = ctx.dataset.sessions.filter((s) => s.programId === ctx.programId && s.date >= from).length;
  if (workouts === 0) return 'За последние четыре недели завершённых тренировок нет. Резюме появится после первых тренировок.';
  sentences.push(`За четыре недели проведено тренировок: ${workouts}.`);
  const hardOnes: string[] = [];
  for (const l of lines) {
    const pts = linePoints(ctx.dataset, l.programExerciseId, from);
    const ws = pts.map((p) => p.weightG).filter((w): w is number => w !== null);
    if (ws.length >= 2) {
      const d = ws.at(-1)! - ws[0];
      if (d > 0) sentences.push(`Рабочий вес: ${lineName(l)} — ${formatDeltaKg(d)}.`);
      else if (d === 0) sentences.push(`${capitalize(lineName(l))} — вес без изменений (${formatKg(ws[0], true)}).`);
      else sentences.push(`${capitalize(lineName(l))} — вес снижен на ${formatKg(-d, true)}.`);
    }
    const last2 = pts.slice(-2);
    if (last2.length === 2 && last2.every((p) => p.rating === 'hard')) hardOnes.push(lineName(l));
  }
  if (hardOnes.length) {
    sentences.push(`Последние две тренировки (${hardOnes.join(', ')}) выполнены тяжело. Рекомендуем пока сохранить текущую нагрузку.`);
  }
  return sentences.join(' ');
}

export const deterministicAssistant: AssistantProvider = {
  async insights(ctx) {
    return deterministicInsights(ctx);
  },
  async monthlySummary(ctx) {
    return deterministicMonthlySummary(ctx);
  },
};

function score(r: string | null) {
  return r === 'easy' ? 1 : r === 'hard' ? 2 : r === 'failed' ? 3 : 0;
}
function ratingWord(r: string | null) {
  return r === 'easy' ? 'легко' : r === 'hard' ? 'тяжело' : r === 'failed' ? 'не удалось' : '—';
}
function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

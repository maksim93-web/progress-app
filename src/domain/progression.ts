/**
 * Главный алгоритм адаптивной прогрессии (детерминированный, без внешних моделей).
 *
 * Считает рекомендацию веса для ОДНОЙ линии прогрессии (ProgramExercise) после одной тренировки.
 * Ничего не сохраняет и ничего не меняет сам — решение всегда за пользователем.
 */
import type { FailReason, Grams, Rating, RecommendationReason } from './types';
import { floorToStep } from '../lib/weight';

export interface WorkSetInput {
  done: boolean;
  actualReps: number | null;
  actualWeightG: Grams | null;
  assisted: boolean;
}

export interface ProgressionInput {
  plannedWeightG: Grams | null;
  plannedSets: number;
  plannedReps: number;
  isCalibration: boolean;
  stepG: Grams;
  autoProgression: boolean;
  failStreakForDeload: number;
  deloadPercent: number;
  /** Только рабочие подходы. Разминка сюда не передаётся. */
  workSets: WorkSetInput[];
  rating: Rating | null;
  failReason: FailReason | null;
  pain: boolean;
  skipped: boolean;
  /** Оценки предыдущих завершённых тренировок ЭТОЙ ЖЕ линии, от новых к старым */
  previousRatings: Rating[];
}

export interface ProgressionResult {
  reason: RecommendationReason;
  /** Подтверждённый рабочий вес этой тренировки (база расчёта) */
  fromWeightG: Grams;
  recommendedWeightG: Grams;
  tone: 'success' | 'neutral' | 'warning' | 'danger';
  title: string;
  message: string;
  warning: string | null;
  /** Веса в подходах отличались — нужно уточнение пользователя */
  requiresChoice: boolean;
}

/** Подтверждённый рабочий вес: вес выполненных рабочих подходов. */
export function confirmedWorkingWeight(sets: WorkSetInput[]): { weightG: Grams | null; mixed: boolean } {
  const weights = sets
    .filter((s) => s.done && s.actualWeightG !== null)
    .map((s) => s.actualWeightG as Grams);
  if (weights.length === 0) return { weightG: null, mixed: false };
  const counts = new Map<Grams, number>();
  for (const w of weights) counts.set(w, (counts.get(w) ?? 0) + 1);
  if (counts.size === 1) return { weightG: weights[0], mixed: false };
  // Самый частый вес; при равенстве — меньший (консервативно)
  let best: Grams = weights[0];
  let bestCount = 0;
  for (const [w, c] of counts) {
    if (c > bestCount || (c === bestCount && w < best)) {
      best = w;
      bestCount = c;
    }
  }
  return { weightG: best, mixed: true };
}

/** Все запланированные рабочие подходы выполнены полностью и самостоятельно */
export function allSetsCompletedSelf(sets: WorkSetInput[], plannedSets: number, plannedReps: number): boolean {
  const done = sets.filter((s) => s.done);
  if (done.length < plannedSets) return false;
  return done.every((s) => !s.assisted && (s.actualReps ?? 0) >= plannedReps);
}

export function deloadWeight(baseG: Grams, percent: number, stepG: Grams): Grams {
  const unit = Math.max(500, stepG);
  let w = floorToStep(Math.round((baseG * (100 - percent)) / 100), unit);
  if (w >= baseG) w = baseG - unit;
  return Math.max(0, w);
}

function leadingCount(list: Rating[], value: Rating): number {
  let n = 0;
  for (const r of list) {
    if (r !== value) break;
    n++;
  }
  return n;
}

/**
 * Возвращает null, если рекомендацию сформировать нельзя
 * (упражнение пропущено при неизвестном весе).
 */
export function computeRecommendation(input: ProgressionInput): ProgressionResult | null {
  const { weightG: confirmed, mixed } = confirmedWorkingWeight(input.workSets);
  const anyDone = input.workSets.some((s) => s.done);

  // 1. Пропуск — вес не меняем
  if (input.skipped || !anyDone || confirmed === null) {
    if (input.plannedWeightG === null) return null;
    return {
      reason: 'skipped',
      fromWeightG: input.plannedWeightG,
      recommendedWeightG: input.plannedWeightG,
      tone: 'neutral',
      title: 'Упражнение пропущено',
      message: 'Рабочий вес остаётся прежним.',
      warning: null,
      requiresChoice: false,
    };
  }

  if (input.rating === null) throw new Error('Нужна оценка упражнения');

  const base = confirmed;
  const complete = allSetsCompletedSelf(input.workSets, input.plannedSets, input.plannedReps);
  const step = input.stepG;
  let result: ProgressionResult;

  if (input.isCalibration) {
    if (input.rating === 'failed') {
      result = {
        reason: 'calibration_failed',
        fromWeightG: base,
        recommendedWeightG: deloadWeight(base, input.deloadPercent, step),
        tone: 'warning',
        title: 'Стартовый вес оказался тяжёлым',
        message: 'Предлагаем начать с меньшего веса, чтобы выполнять все повторения самостоятельно.',
        warning: null,
        requiresChoice: false,
      };
    } else if (input.rating === 'easy' && complete && input.autoProgression) {
      result = {
        reason: 'calibration_easy',
        fromWeightG: base,
        recommendedWeightG: base + step,
        tone: 'success',
        title: 'Стартовый вес определён',
        message: 'Вес дался с запасом — можно добавить шаг уже в следующий раз.',
        warning: null,
        requiresChoice: false,
      };
    } else {
      result = {
        reason: 'calibration_hard',
        fromWeightG: base,
        recommendedWeightG: base,
        tone: 'neutral',
        title: 'Стартовый вес определён',
        message: 'Закрепим этот вес как рабочий.',
        warning: null,
        requiresChoice: false,
      };
    }
  } else if (input.rating === 'easy') {
    if (!complete) {
      result = {
        reason: 'easy_incomplete',
        fromWeightG: base,
        recommendedWeightG: base,
        tone: 'warning',
        title: 'Вес оставляем',
        message: 'Для повышения нужно выполнить все запланированные подходы и повторения самостоятельно.',
        warning: null,
        requiresChoice: false,
      };
    } else if (!input.autoProgression) {
      result = {
        reason: 'easy_auto_off',
        fromWeightG: base,
        recommendedWeightG: base,
        tone: 'neutral',
        title: 'Автопрогрессия выключена',
        message: 'Вес не меняется автоматически. Можно указать новый вес вручную.',
        warning: null,
        requiresChoice: false,
      };
    } else {
      result = {
        reason: 'easy_increase',
        fromWeightG: base,
        recommendedWeightG: base + step,
        tone: 'success',
        title: 'Отличная работа!',
        message: 'Ты выполнил все подходы с запасом.',
        warning: null,
        requiresChoice: false,
      };
    }
  } else if (input.rating === 'hard') {
    const hardStreak = 1 + leadingCount(input.previousRatings, 'hard');
    result = {
      reason: 'hard_keep',
      fromWeightG: base,
      recommendedWeightG: base,
      tone: 'neutral',
      title: 'Закрепляем вес',
      message: 'Все повторения сделаны, но без запаса. Повторим этот вес ещё раз.',
      warning:
        hardStreak >= 3
          ? `Уже ${hardStreak} тренировки подряд этот вес даётся тяжело. Стоит проверить восстановление.`
          : null,
      requiresChoice: false,
    };
  } else {
    const failStreak = 1 + leadingCount(input.previousRatings, 'failed');
    const why = input.failReason === 'assist' ? 'Потребовалась помощь страхующего.' : 'Не все повторения выполнены.';
    if (failStreak >= input.failStreakForDeload) {
      result = {
        reason: 'failed_deload',
        fromWeightG: base,
        recommendedWeightG: deloadWeight(base, input.deloadPercent, step),
        tone: 'danger',
        title: 'Предлагаем снизить вес',
        message: `${why} Это уже ${failStreak}-я неудачная тренировка подряд — снизим вес на ${input.deloadPercent}% и снова наберём темп.`,
        warning: 'Также стоит оценить сон, питание и восстановление.',
        requiresChoice: false,
      };
    } else {
      result = {
        reason: 'failed_keep',
        fromWeightG: base,
        recommendedWeightG: base,
        tone: 'warning',
        title: 'Вес оставляем',
        message: why,
        warning: 'Оцени, подходит ли эта нагрузка. Если неудача повторится, предложим снизить вес.',
        requiresChoice: false,
      };
    }
  }

  // Неодинаковые веса в подходах — без уточнения не повышаем
  if (mixed && result.recommendedWeightG > base) {
    result = {
      ...result,
      reason: 'mixed_weights',
      recommendedWeightG: base,
      tone: 'neutral',
      title: 'Веса в подходах отличались',
      message: 'Автоматически не повышаем. Укажи вес на следующую тренировку сам или оставь текущий.',
      requiresChoice: true,
    };
  }

  // Боль — никогда не повышаем
  if (input.pain && result.recommendedWeightG > base) {
    result = {
      ...result,
      reason: 'pain_keep',
      recommendedWeightG: base,
      tone: 'danger',
      title: 'Нагрузку не увеличиваем',
      message: 'Отмечена боль или дискомфорт.',
    };
  }
  if (input.pain) {
    result = {
      ...result,
      tone: 'danger',
      warning: 'Отмечена боль. Если она повторяется — снизь нагрузку и обратись к специалисту.',
    };
  }

  return result;
}

/**
 * Точка подключения LLM API в будущем (сейчас не используется).
 *
 * Правила для будущей реализации:
 * - модель получает только агрегированные данные (AssistantContext), без личных данных;
 * - ответ модели — только текст-совет; любые изменения весов/программы
 *   проходят через decideRecommendation/editProgramExercise и подтверждение пользователя;
 * - при ошибке сети используется deterministicAssistant.
 */
import type { AssistantContext, AssistantProvider, Insight } from './assistant';
import { deterministicAssistant } from './assistant';

export interface LlmConfig {
  endpoint: string; // например, собственный backend-прокси
  model: string;
}

export function createLlmAssistant(config: LlmConfig | null): AssistantProvider {
  if (!config) return deterministicAssistant;
  return {
    async insights(ctx: AssistantContext): Promise<Insight[]> {
      // Базовые выводы всегда детерминированные; LLM в будущем может лишь переформулировать их.
      return deterministicAssistant.insights(ctx);
    },
    async monthlySummary(ctx: AssistantContext): Promise<string> {
      const base = await deterministicAssistant.monthlySummary(ctx);
      try {
        const res = await fetch(config.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: config.model, task: 'rephrase_monthly_summary', text: base }),
        });
        if (!res.ok) return base;
        const data = (await res.json()) as { text?: string };
        return data.text?.trim() || base;
      } catch {
        return base;
      }
    },
  };
}

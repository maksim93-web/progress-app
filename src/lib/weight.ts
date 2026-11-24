import type { Grams } from '../domain/types';

/** Килограммы (число или строка «102,5») → граммы, с округлением до целого грамма */
export function kgToG(kg: number | string): Grams {
  const n = typeof kg === 'string' ? Number(kg.replace(',', '.').trim()) : kg;
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 1000);
}

/** Граммы → «102,5» (без лишних нулей, запятая как разделитель) */
export function formatKg(g: Grams | null | undefined, withUnit = false): string {
  if (g === null || g === undefined || !Number.isFinite(g)) return '—';
  const sign = g < 0 ? '−' : '';
  const abs = Math.abs(g);
  const whole = Math.floor(abs / 1000);
  const frac = abs % 1000;
  let s = String(whole);
  if (frac !== 0) {
    s += ',' + String(frac).padStart(3, '0').replace(/0+$/, '');
  }
  return sign + s + (withUnit ? ' кг' : '');
}

/** Изменение веса со знаком: «+2,5 кг», «0 кг», «−5 кг» */
export function formatDeltaKg(g: Grams): string {
  if (g === 0) return '0 кг';
  return (g > 0 ? '+' : '') + formatKg(g, true);
}

/** Округление вниз до кратного шагу (шаг > 0) */
export function floorToStep(g: Grams, stepG: Grams): Grams {
  if (stepG <= 0) return g;
  return Math.floor(g / stepG) * stepG;
}

/** Округление до ближайшего кратного шагу */
export function roundToStep(g: Grams, stepG: Grams): Grams {
  if (stepG <= 0) return g;
  return Math.round(g / stepG) * stepG;
}

export const STEP_PRESETS_G: Grams[] = [500, 1000, 1250, 2500, 5000];
export const DEFAULT_STEP_G: Grams = 2500;

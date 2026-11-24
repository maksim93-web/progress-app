import type { ISODate, Weekday } from '../domain/types';

/** Локальная дата → 'YYYY-MM-DD' */
export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function today(): ISODate {
  return toISODate(new Date());
}

/** 'YYYY-MM-DD' → локальная полночь (без сдвигов часовых поясов) */
export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0); // полдень — защита от перехода на летнее время
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** 0 = понедельник … 6 = воскресенье */
export function weekdayOf(s: ISODate): Weekday {
  const js = parseISODate(s).getDay(); // 0 = вс
  return ((js + 6) % 7) as Weekday;
}

export function mondayOf(s: ISODate): ISODate {
  return addDays(s, -weekdayOf(s));
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(a).getTime() - parseISODate(b).getTime()) / 86400000);
}

/** Номер недели относительно недели старта (0 — неделя старта) */
export function weekIndexFrom(start: ISODate, date: ISODate): number {
  return Math.floor(diffDays(mondayOf(date), mondayOf(start)) / 7);
}

export const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const WEEKDAYS_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
/** «в понедельник», «во вторник» … */
export const WEEKDAYS_ACC = ['в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу', 'в воскресенье'];

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export function formatDateLong(s: ISODate): string {
  const d = parseISODate(s);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}

export function formatDateShort(s: ISODate): string {
  const d = parseISODate(s);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} мин`;
  return `${h} ч ${m} мин`;
}

/** Склонение: plural(3, ['подход', 'подхода', 'подходов']) */
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

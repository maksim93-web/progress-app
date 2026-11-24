import { db } from '../db/database';
import type { ID, ISODate } from '../domain/types';
import { nowISO, uid } from '../lib/id';
import { WEEKDAYS_SHORT, formatDateShort, weekdayOf } from '../lib/dates';

/**
 * Разовый перенос тренировки недели weekIndex на дату date.
 * Расписание программы и линия прогрессии не меняются: тренировка остаётся «тренировкой C этой недели».
 * date === null — вернуть на день по расписанию.
 */
export async function moveWorkout(programId: ID, dayId: ID, weekIndex: number, date: ISODate | null) {
  const existing = await db.moves.where({ dayId, weekIndex }).toArray();
  await db.transaction('rw', [db.moves, db.changes, db.days], async () => {
    for (const m of existing) await db.moves.delete(m.id);
    const day = await db.days.get(dayId);
    if (date) {
      await db.moves.add({ id: uid(), programId, dayId, weekIndex, date, createdAt: nowISO() });
      await db.changes.add({
        id: uid(),
        programId,
        at: nowISO(),
        description: `Тренировка ${day?.letter ?? ''} перенесена на ${WEEKDAYS_SHORT[weekdayOf(date)]}, ${formatDateShort(date)} (разово)`,
      });
    } else if (existing.length) {
      await db.changes.add({ id: uid(), programId, at: nowISO(), description: `Тренировка ${day?.letter ?? ''} возвращена в расписание` });
    }
  });
}

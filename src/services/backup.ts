import { db, ALL_TABLES } from '../db/database';

export const BACKUP_FORMAT = 'progress-backup';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

export async function exportBackup(): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {};
  for (const name of ALL_TABLES) tables[name] = await db.table(name).toArray();
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables };
}

export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Файл не похож на резервную копию PROGRESS');
  }
  const b = data as BackupFile;
  if (!b || b.format !== BACKUP_FORMAT || typeof b.tables !== 'object') throw new Error('Файл не похож на резервную копию PROGRESS');
  if (b.version > BACKUP_VERSION) throw new Error('Копия создана более новой версией приложения');
  return b;
}

/** Полностью заменяет локальные данные содержимым копии */
export async function importBackup(b: BackupFile) {
  await db.transaction('rw', ALL_TABLES.map((n) => db.table(n)), async () => {
    for (const name of ALL_TABLES) {
      await db.table(name).clear();
      const rows = b.tables[name];
      if (Array.isArray(rows) && rows.length) await db.table(name).bulkAdd(rows);
    }
  });
}

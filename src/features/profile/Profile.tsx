import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Download, Plus, Share, Smartphone, Upload, UserRound } from 'lucide-react';
import { useApp } from '../../app/context';
import { navigate } from '../../app/router';
import { Button, Card, Field, PageTitle, Screen, SectionTitle, Sheet, cx, inputCls, toast } from '../../ui/kit';
import { db } from '../../db/database';
import { createProfile, setActiveProfile, updateProfile } from '../../services/profile';
import { exportBackup, importBackup, parseBackup } from '../../services/backup';
import { STEP_PRESETS_G, formatKg } from '../../lib/weight';
import { today } from '../../lib/dates';

export function Profile() {
  const { profile } = useApp();
  const profiles = useLiveQuery(() => db.profiles.toArray(), []) ?? [];
  const [name, setName] = useState(profile.name);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [importText, setImportText] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const standalone = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone);

  return (
    <Screen>
      <PageTitle>Профиль</PageTitle>
      <Card className="flex items-center gap-4">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#8a72ff] to-[#4f7dff] text-[22px] font-bold">{profile.name.slice(0, 1).toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          <input
            className="w-full bg-transparent text-[20px] font-semibold outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== profile.name && updateProfile(profile.id, { name: name.trim() }).then(() => toast('Имя сохранено'))}
          />
          <div className="text-[13px] text-ink-3">Локальный профиль · данные на этом устройстве</div>
        </div>
      </Card>

      <SectionTitle>Шаг прогрессии по умолчанию</SectionTitle>
      <div className="flex flex-wrap gap-2">
        {STEP_PRESETS_G.map((g) => (
          <button
            key={g}
            onClick={() => updateProfile(profile.id, { defaultStepG: g })}
            className={cx('h-11 rounded-xl border px-4 text-[15px] font-semibold', profile.defaultStepG === g ? 'border-accent/60 bg-accent-soft' : 'border-line bg-surface-2 text-ink-2')}
          >
            {formatKg(g)} кг
          </button>
        ))}
      </div>
      <div className="mt-1.5 px-1 text-[12px] text-ink-3">Подставляется для новых упражнений. У каждого упражнения шаг настраивается отдельно.</div>

      <SectionTitle>Спортсмены</SectionTitle>
      <div className="space-y-2">
        {profiles.map((p) => (
          <button
            key={p.id}
            onClick={async () => {
              if (p.id === profile.id) return;
              await setActiveProfile(p.id);
              navigate('/', true);
              toast(`Профиль: ${p.name}`);
            }}
            className={cx('flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left', p.id === profile.id ? 'border-accent/50 bg-accent-soft' : 'border-line bg-surface')}
          >
            <UserRound size={20} className="text-ink-2" />
            <span className="flex-1 text-[15px] font-semibold">{p.name}</span>
            {p.id === profile.id && <Check size={18} className="text-[#b3a5ff]" />}
          </button>
        ))}
        <Button variant="secondary" size="md" onClick={() => setNewOpen(true)}>
          <Plus size={17} /> Добавить спортсмена
        </Button>
      </div>
      <div className="mt-1.5 px-1 text-[12px] text-ink-3">У каждого спортсмена свои программы, веса и статистика.</div>

      <SectionTitle>Резервная копия</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          size="md"
          onClick={async () => {
            const data = await exportBackup();
            const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
            const file = new File([blob], `progress-backup-${today()}.json`, { type: 'application/json' });
            const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
            if (nav.canShare?.({ files: [file] })) {
              try {
                await navigator.share({ files: [file], title: 'PROGRESS — резервная копия' });
                return;
              } catch {
                /* пользователь отменил — скачиваем файлом */
              }
            }
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = file.name;
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        >
          <Download size={17} /> Сохранить
        </Button>
        <Button variant="secondary" size="md" onClick={() => fileRef.current?.click()}>
          <Upload size={17} /> Восстановить
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) setImportText(await f.text());
          }}
        />
      </div>
      <div className="mt-1.5 px-1 text-[12px] text-ink-3">Файл со всеми программами и тренировками. Храни его в «Файлах» или облаке.</div>

      {!standalone && (
        <>
          <SectionTitle>Установка на iPhone</SectionTitle>
          <Card className="space-y-2.5 text-[14px] text-ink-2">
            <div className="flex items-center gap-2">
              <Smartphone size={18} className="text-[#b3a5ff]" /> Открой приложение в Safari
            </div>
            <div className="flex items-center gap-2">
              <Share size={18} className="text-[#b3a5ff]" /> Нажми «Поделиться» → «На экран „Домой“»
            </div>
            <div>После установки PROGRESS запускается как обычное приложение и работает без интернета.</div>
          </Card>
        </>
      )}

      <div className="mt-8 text-center text-[12px] text-ink-3">PROGRESS · версия 0.1 · данные хранятся только на устройстве</div>

      <Sheet open={newOpen} onClose={() => setNewOpen(false)} title="Новый спортсмен">
        <Field label="Имя">
          <input className={inputCls} value={newName} autoFocus onChange={(e) => setNewName(e.target.value)} />
        </Field>
        <Button
          className="mt-4"
          disabled={!newName.trim()}
          onClick={async () => {
            const p = await createProfile(newName);
            await setActiveProfile(p.id);
            setNewOpen(false);
            setNewName('');
            navigate('/', true);
          }}
        >
          Создать и переключиться
        </Button>
      </Sheet>

      <Sheet open={importText !== null} onClose={() => setImportText(null)} title="Восстановить из копии?">
        <p className="mb-4 text-[15px] text-ink-2">Все текущие данные на этом устройстве будут заменены данными из файла. Сначала сохрани текущую копию, если она нужна.</p>
        <Button
          variant="danger"
          onClick={async () => {
            try {
              await importBackup(parseBackup(importText!));
              setImportText(null);
              toast('Данные восстановлены');
              window.location.hash = '#/';
              window.location.reload();
            } catch (err) {
              toast((err as Error).message);
            }
          }}
        >
          Заменить данные
        </Button>
      </Sheet>
    </Screen>
  );
}

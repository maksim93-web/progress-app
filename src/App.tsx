import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/database';
import { ensureActiveProfile } from './services/profile';
import { AppContext, type AppState } from './app/context';
import { navigate, useRoute } from './app/router';
import { TabBar } from './app/TabBar';
import { Onboarding } from './features/onboarding/Onboarding';
import { Home } from './features/home/Home';
import { Workout } from './features/workout/Workout';
import { ProgramScreen } from './features/program/ProgramScreen';
import { History, SessionDetail } from './features/history/History';
import { Analytics, LineDetail } from './features/analytics/Analytics';
import { Profile } from './features/profile/Profile';

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    ensureActiveProfile()
      .then(() => setReady(true))
      .catch((e) => setError(String(e?.message ?? e)));
    // Просим браузер не очищать данные приложения
    navigator.storage?.persist?.().catch(() => undefined);
  }, []);

  const state = useLiveQuery(async (): Promise<AppState | null> => {
    if (!ready) return null;
    const meta = await db.meta.get('activeProfileId');
    const profile = meta ? await db.profiles.get(meta.value as string) : undefined;
    if (!profile) return null;
    const program = (await db.programs.where({ profileId: profile.id, status: 'active' }).first()) ?? null;
    const activeSession = (await db.sessions.where({ profileId: profile.id, status: 'in_progress' }).first()) ?? null;
    return { profile, program, activeSession };
  }, [ready]);

  const route = useRoute();

  if (error) {
    return (
      <div className="pt-safe px-5 text-center">
        <div className="mt-24 text-[18px] font-semibold">Не удалось открыть хранилище</div>
        <div className="mt-2 text-[14px] text-ink-2">{error}</div>
        <div className="mt-2 text-[13px] text-ink-3">Проверь, что браузер не в приватном режиме.</div>
      </div>
    );
  }
  if (!state) return <Splash />;

  return (
    <AppContext.Provider value={state}>
      <Router route={route} state={state} />
    </AppContext.Provider>
  );
}

function Splash() {
  return (
    <div className="grid min-h-[100dvh] place-items-center">
      <div className="text-[13px] font-semibold uppercase tracking-[0.3em] text-[#a99bff] animate-fade">PROGRESS</div>
    </div>
  );
}

function Router({ route, state }: { route: string[]; state: AppState }) {
  const [a, b] = route;

  // Без активной программы — мастер создания (кроме профиля и истории)
  if (!state.program && a !== 'profile' && a !== 'history' && a !== 'analytics') {
    return <Onboarding firstRun />;
  }
  if (a === 'onboarding') return <Onboarding firstRun={false} />;
  if (a === 'workout' && b) return <Workout sessionId={b} />;
  if (a === 'history' && b) return <SessionDetail sessionId={b} />;
  if (a === 'analytics' && b) return <LineDetail peId={b} />;

  let page;
  switch (a) {
    case 'program':
      page = <ProgramScreen tab={b === 'plan' ? 'plan' : 'structure'} />;
      break;
    case 'history':
      page = <History />;
      break;
    case 'analytics':
      page = <Analytics />;
      break;
    case 'profile':
      page = <Profile />;
      break;
    case undefined:
      page = <Home />;
      break;
    default:
      navigate('/', true);
      page = <Home />;
  }
  return (
    <>
      {page}
      <TabBar active={a ?? ''} />
    </>
  );
}

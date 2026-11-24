import { BarChart3, CalendarRange, History, House, UserRound } from 'lucide-react';
import { navigate } from './router';
import { cx } from '../ui/kit';

const TABS = [
  { key: '', label: 'Главная', icon: House },
  { key: 'program', label: 'Программа', icon: CalendarRange },
  { key: 'history', label: 'История', icon: History },
  { key: 'analytics', label: 'Аналитика', icon: BarChart3 },
  { key: 'profile', label: 'Профиль', icon: UserRound },
];

export function TabBar({ active }: { active: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[520px] px-3" style={{ paddingBottom: 'calc(var(--safe-bottom) + 8px)' }}>
      <div className="glass flex h-[var(--tabbar-h)] items-stretch rounded-[26px] bg-[#101018]/80 px-1 shadow-[0_-10px_40px_-10px_rgb(0_0_0/0.8)]">
        {TABS.map(({ key, label, icon: Icon }) => {
          const on = active === key;
          return (
            <button
              key={key}
              onClick={() => navigate('/' + key)}
              className={cx('relative flex flex-1 flex-col items-center justify-center gap-1 text-[10.5px] font-semibold transition', on ? 'text-accent-3' : 'text-ink-3 active:text-ink-2')}
              aria-current={on ? 'page' : undefined}
            >
              {on && <span className="absolute top-1.5 h-9 w-12 rounded-2xl bg-accent/20 blur-[1px]" />}
              <Icon size={22} strokeWidth={on ? 2.4 : 1.9} className={cx('relative', on && 'drop-shadow-[0_0_8px_rgb(124_92_255/0.9)]')} />
              <span className="relative">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

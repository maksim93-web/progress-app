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
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[520px] border-t border-line bg-[#0c0c12]/85 backdrop-blur-xl" style={{ paddingBottom: 'var(--safe-bottom)' }}>
      <div className="flex h-[var(--tabbar-h)] items-stretch">
        {TABS.map(({ key, label, icon: Icon }) => {
          const on = active === key;
          return (
            <button
              key={key}
              onClick={() => navigate('/' + key)}
              className={cx('flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition', on ? 'text-[#a99bff]' : 'text-ink-3 active:text-ink-2')}
              aria-current={on ? 'page' : undefined}
            >
              <span className={cx('grid h-8 w-12 place-items-center rounded-full transition', on && 'bg-accent-soft')}>
                <Icon size={21} strokeWidth={on ? 2.3 : 1.9} />
              </span>
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

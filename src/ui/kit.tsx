import { useEffect, useState, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Minus, Plus, X } from 'lucide-react';
import { formatKg, kgToG } from '../lib/weight';

export function cx(...a: (string | false | null | undefined)[]) {
  return a.filter(Boolean).join(' ');
}

/* ---------- Кнопки ---------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'success' | 'danger';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-gradient-to-b from-[#9479ff] via-[#7c5cff] to-[#5f3ff0] text-white glow-accent active:brightness-90',
  secondary: 'glass text-ink active:bg-white/10',
  ghost: 'bg-transparent text-ink-2 active:bg-white/5',
  success: 'bg-gradient-to-b from-[#5af0b0] to-[#1fbf7f] text-[#03140c] shadow-[0_14px_34px_-12px_rgb(62_227_156/0.75),inset_0_1px_0_rgb(255_255_255/0.4)] active:brightness-90',
  danger: 'bg-danger-soft text-danger border border-danger/30 active:brightness-90',
};

export function Button({
  variant = 'primary',
  size = 'lg',
  block = true,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'md' | 'lg' | 'xl'; block?: boolean }) {
  const h = size === 'xl' ? 'h-16 text-[18px]' : size === 'lg' ? 'h-14 text-[17px]' : 'h-11 text-[15px]';
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-2xl px-5 font-semibold transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100',
        h,
        block && 'w-full',
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function IconButton({ className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/[0.06] text-ink transition active:scale-95 active:bg-white/10 disabled:opacity-30', className)}
    >
      {children}
    </button>
  );
}

/* ---------- Каркас экрана ---------- */

export function Screen({ children, tabbar = true, className }: { children: ReactNode; tabbar?: boolean; className?: string }) {
  return <div className={cx('pt-safe px-4', tabbar ? 'pb-tabbar' : 'pb-safe', 'animate-fade', className)}>{children}</div>;
}

export function TopBar({ title, subtitle, onBack, right }: { title?: ReactNode; subtitle?: ReactNode; onBack?: () => void; right?: ReactNode }) {
  return (
    <div className="mb-4 flex min-h-11 items-center gap-2">
      {onBack && (
        <IconButton aria-label="Назад" onClick={onBack}>
          <ChevronLeft size={22} />
        </IconButton>
      )}
      <div className="min-w-0 flex-1">
        {title && <div className="truncate text-[17px] font-semibold">{title}</div>}
        {subtitle && <div className="truncate text-[13px] text-ink-3">{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-5 mt-1">
      <h1 className="text-[34px] font-extrabold leading-[1.05] tracking-[-0.03em]">{children}</h1>
      {sub && <div className="mt-1.5 text-[15px] text-ink-2">{sub}</div>}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2.5 mt-6 flex items-end justify-between px-1">
      <h2 className="text-[20px] font-bold tracking-[-0.02em]">{children}</h2>
      {right && <div className="text-[13px] text-ink-3">{right}</div>}
    </div>
  );
}

export function Card({ children, className, onClick, accent }: { children: ReactNode; className?: string; onClick?: () => void; accent?: boolean }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      className={cx(
        'block w-full rounded-[var(--radius-card)] p-4 text-left',
        accent ? 'card-accent' : 'glass',
        onClick && 'transition active:scale-[0.99]',
        className,
      )}
    >
      {children}
    </Comp>
  );
}

export function Pill({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'accent' | 'success' | 'warn' | 'danger'; children: ReactNode; className?: string }) {
  const t = {
    neutral: 'bg-white/[0.07] text-ink-2',
    accent: 'bg-accent-soft text-[#b3a5ff]',
    success: 'bg-success-soft text-success',
    warn: 'bg-warn-soft text-warn',
    danger: 'bg-danger-soft text-danger',
  }[tone];
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold', t, className)}>{children}</span>;
}

export function Segmented<T extends string>({ value, options, onChange, className }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx('flex gap-1 rounded-2xl bg-surface p-1 border border-line', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'h-10 flex-1 rounded-xl px-2 text-[14px] font-semibold transition',
            value === o.value ? 'bg-gradient-to-b from-[#8a72ff] to-[#6a4dff] text-white shadow-[0_6px_16px_-8px_rgb(123_97_255/0.8)]' : 'text-ink-2 active:bg-white/5',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex w-full items-center gap-3 py-2 text-left" role="switch" aria-checked={checked}>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-medium">{label}</div>
        {hint && <div className="text-[13px] text-ink-3">{hint}</div>}
      </div>
      <span className={cx('relative h-[31px] w-[51px] shrink-0 rounded-full transition', checked ? 'bg-accent' : 'bg-surface-3')}>
        <span className={cx('absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-[2px]')} />
      </span>
    </button>
  );
}

export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 px-1 text-[13px] font-medium text-ink-2">{label}</div>
      {children}
      {hint && <div className="mt-1 px-1 text-[12px] text-ink-3">{hint}</div>}
    </label>
  );
}

export const inputCls =
  'h-13 w-full rounded-2xl border border-line-strong bg-surface-2 px-4 text-[16px] text-ink placeholder:text-ink-3 outline-none focus:border-accent/60 focus:ring-4 focus:ring-accent/15';

/** Большой степпер: −  [значение]  + */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  format,
  label,
  size = 'md',
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
  label?: string;
  size?: 'md' | 'lg';
}) {
  const big = size === 'lg';
  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl border border-line bg-surface-2 p-1.5">
      <button
        aria-label="Меньше"
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
        className={cx('grid shrink-0 place-items-center rounded-xl bg-white/[0.06] text-ink active:bg-white/10 disabled:opacity-30', big ? 'h-14 w-14' : 'h-11 w-11')}
      >
        <Minus size={big ? 22 : 18} />
      </button>
      <div className="min-w-0 text-center">
        <div className={cx('num font-bold leading-none', big ? 'text-[30px]' : 'text-[22px]')}>{format ? format(value) : value}</div>
        {label && <div className="mt-1 text-[12px] text-ink-3">{label}</div>}
      </div>
      <button
        aria-label="Больше"
        onClick={() => onChange(Math.min(max, value + step))}
        disabled={value >= max}
        className={cx('grid shrink-0 place-items-center rounded-xl bg-white/[0.06] text-ink active:bg-white/10 disabled:opacity-30', big ? 'h-14 w-14' : 'h-11 w-11')}
      >
        <Plus size={big ? 22 : 18} />
      </button>
    </div>
  );
}

/** Ввод веса в кг с запятой. Хранит граммы. */
export function WeightInput({
  valueG,
  onChange,
  placeholder = 'кг',
  className,
  autoFocus,
}: {
  valueG: number | null;
  onChange: (g: number | null) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(valueG === null ? '' : formatKg(valueG));
  useEffect(() => {
    const parsed = text.trim() === '' ? null : kgToG(text);
    if (parsed !== valueG) setText(valueG === null ? '' : formatKg(valueG));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueG]);
  return (
    <div className={cx('relative', className)}>
      <input
        inputMode="decimal"
        autoFocus={autoFocus}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.,]/g, '').replace('.', ',');
          setText(t);
          if (t.trim() === '') onChange(null);
          else {
            const g = kgToG(t);
            if (Number.isFinite(g) && g >= 0 && g <= 1000000) onChange(g);
          }
        }}
        className={cx(inputCls, 'num pr-12 text-[18px] font-semibold')}
      />
      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[15px] text-ink-3">кг</span>
    </div>
  );
}

/** Нижняя панель (не модальное окно на весь экран — быстрое редактирование) */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] animate-fade" onClick={onClose} />
      <div className="relative max-h-[92dvh] w-full max-w-[520px] overflow-y-auto rounded-t-[28px] border-t border-line-strong bg-[#13131b] px-4 pt-3 pb-safe animate-rise">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/15" />
        <div className="mb-3 flex items-center gap-2">
          <div className="flex-1 text-[19px] font-semibold">{title}</div>
          <IconButton aria-label="Закрыть" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="glass flex flex-col items-center rounded-[var(--radius-card)] px-6 py-10 text-center">
      {icon && <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-[#b3a5ff]">{icon}</div>}
      <div className="text-[17px] font-semibold">{title}</div>
      {text && <div className="mt-1.5 max-w-[300px] text-[14px] text-ink-2">{text}</div>}
      {action && <div className="mt-5 w-full">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'success' | 'warn' | 'danger' | 'accent' }) {
  const c = tone === 'success' ? 'text-success' : tone === 'warn' ? 'text-warn' : tone === 'danger' ? 'text-danger' : tone === 'accent' ? 'text-[#b3a5ff]' : 'text-ink';
  return (
    <div className="min-w-0">
      <div className="text-[12px] font-medium text-ink-3">{label}</div>
      <div className={cx('num mt-1 truncate text-[26px] font-extrabold leading-tight', c)}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-[12px] text-ink-3">{sub}</div>}
    </div>
  );
}

let toastTimer: number | undefined;
export function toast(text: string) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className =
      'fixed left-1/2 top-[calc(env(safe-area-inset-top)+12px)] z-[60] -translate-x-1/2 rounded-2xl border border-line-strong bg-[#1d1d28]/95 px-4 py-3 text-[14px] font-medium text-ink shadow-xl backdrop-blur transition-opacity';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.opacity = '1';
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    if (el) el.style.opacity = '0';
  }, 2600);
}


/* ---------- v2: фото, плитки, шапки ---------- */

const BASE = import.meta.env.BASE_URL;
export const PHOTOS = {
  hero: BASE + 'img/hero.jpg',
  bench: BASE + 'img/bench.jpg',
  plates: BASE + 'img/plates.jpg',
  dumbbells: BASE + 'img/dumbbells.jpg',
};
export type PhotoKey = keyof typeof PHOTOS;

/** Шапка экрана с атмосферным фото зала (на всю ширину, под статус-баром) */
export function Hero({
  title,
  subtitle,
  icon,
  photo = 'hero',
  height = 250,
  top,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  photo?: PhotoKey;
  height?: number;
  top?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="relative -mx-4 mb-2 px-4" style={{ minHeight: height }}>
      <div className="hero-photo animate-hero" style={{ height }}>
        <img src={PHOTOS[photo]} alt="" />
      </div>
      <div className="relative flex flex-col justify-end" style={{ minHeight: height }}>
        {top && <div className="absolute inset-x-0 top-0">{top}</div>}
        <div className="animate-rise">
          <h1 className="text-[36px] font-extrabold leading-[1.02] tracking-[-0.035em] drop-shadow-[0_2px_20px_rgb(0_0_0/0.6)]">{title}</h1>
          {subtitle && (
            <div className="mt-2 flex items-center gap-2 text-[16px] text-ink-2">
              {icon && <span className="text-accent-2">{icon}</span>}
              <span className="truncate">{subtitle}</span>
            </div>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Миниатюра-фото в карточке */
export function Photo({ name, className }: { name: PhotoKey; className?: string }) {
  return (
    <div className={cx('relative overflow-hidden', className)}>
      <img src={PHOTOS[name]} alt="" className="h-full w-full object-cover" loading="lazy" />
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[#121019]/70" />
    </div>
  );
}

const TILE_TONES = {
  accent: 'bg-accent/15 text-accent-2 ring-1 ring-accent/30',
  success: 'bg-success/12 text-success ring-1 ring-success/30',
  warn: 'bg-warn/12 text-warn ring-1 ring-warn/30',
  danger: 'bg-danger/12 text-danger ring-1 ring-danger/30',
  neutral: 'bg-white/[0.06] text-ink-2 ring-1 ring-white/10',
};

export function IconTile({ children, tone = 'accent', size = 44, className }: { children: ReactNode; tone?: keyof typeof TILE_TONES; size?: number; className?: string }) {
  return (
    <span className={cx('grid shrink-0 place-items-center rounded-2xl', TILE_TONES[tone], className)} style={{ width: size, height: size }}>
      {children}
    </span>
  );
}

/** Плитка показателя с иконкой (как на макетах) */
export function StatTile({ icon, label, value, sub, tone, onClick }: { icon: ReactNode; label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'success' | 'accent' | 'warn'; onClick?: () => void }) {
  const c = tone === 'success' ? 'text-success' : tone === 'accent' ? 'text-accent-3' : tone === 'warn' ? 'text-warn' : 'text-ink';
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp onClick={onClick} className="glass flex min-w-0 flex-col rounded-[20px] p-3.5 text-left">
      <span className="text-ink-2">{icon}</span>
      <span className="mt-2 text-[12px] leading-tight text-ink-3">{label}</span>
      <span className={cx('num mt-1 truncate text-[25px] font-extrabold leading-none', c)}>{value}</span>
      {sub && <span className="mt-1 truncate text-[11px] text-ink-3">{sub}</span>}
    </Comp>
  );
}

/** Сегментный прогресс (как «Упражнение 1 из 5») */
export function Segments({ total, done, current, className }: { total: number; done: (i: number) => 'done' | 'skip' | 'current' | 'todo'; current?: number; className?: string }) {
  void current;
  return (
    <div className={cx('flex gap-1.5', className)}>
      {Array.from({ length: total }, (_, i) => {
        const st = done(i);
        return (
          <span
            key={i}
            className={cx(
              'h-[7px] flex-1 rounded-full transition-all duration-500',
              st === 'done' && 'bg-success shadow-[0_0_10px_rgb(62_227_156/0.6)]',
              st === 'current' && 'bg-accent shadow-[0_0_12px_rgb(124_92_255/0.9)]',
              st === 'skip' && 'bg-white/25',
              st === 'todo' && 'bg-white/10',
            )}
          />
        );
      })}
    </div>
  );
}

/** Плавный «счёт» числа при появлении */
export function CountUp({ value, format = (v: number) => String(Math.round(v)), duration = 700 }: { value: number; format?: (v: number) => string; duration?: number }) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const from = 0;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      setV(from + (value - from) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
      else setV(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{format(v)}</>;
}

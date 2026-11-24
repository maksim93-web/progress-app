import { AlertTriangle, Info, ShieldAlert, TrendingUp } from 'lucide-react';
import type { Insight } from '../../services/assistant';
import { cx } from '../../ui/kit';

const STYLE = {
  success: { icon: TrendingUp, cls: 'border-success/25 bg-success-soft/60', ic: 'text-success' },
  info: { icon: Info, cls: 'border-accent/25 bg-accent-soft/70', ic: 'text-[#b3a5ff]' },
  warning: { icon: AlertTriangle, cls: 'border-warn/25 bg-warn-soft/60', ic: 'text-warn' },
  danger: { icon: ShieldAlert, cls: 'border-danger/25 bg-danger-soft/60', ic: 'text-danger' },
};

export function InsightCard({ insight }: { insight: Insight }) {
  const s = STYLE[insight.tone];
  const Icon = s.icon;
  return (
    <div className={cx('flex gap-3 rounded-2xl border p-4', s.cls)}>
      <Icon size={20} className={cx('mt-0.5 shrink-0', s.ic)} />
      <div>
        <div className="text-[15px] font-semibold">{insight.title}</div>
        <div className="mt-0.5 text-[14px] leading-snug text-ink-2">{insight.text}</div>
      </div>
    </div>
  );
}

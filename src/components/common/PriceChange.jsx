import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const fmt = (n, d = 2) => {
  const r = Number(Number(n).toFixed(d)) || 0; // `|| 0` folds -0 into 0
  return `${r > 0 ? '+' : ''}${r.toFixed(d)}`;
};

export default function PriceChange({ value, percent, showIcon = false, className }) {
  const basis = percent ?? value;
  if (basis === null || basis === undefined || Number.isNaN(Number(basis))) {
    return <span className={cn('text-muted-foreground', className)}>—</span>;
  }
  const up = Number(basis) >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const hasValue = value !== null && value !== undefined;
  const hasPct = percent !== null && percent !== undefined;
  return (
    <span
      data-trend={up ? 'up' : 'down'}
      className={cn('inline-flex items-center gap-0.5 tabular-nums', up ? 'text-gain' : 'text-loss', className)}
    >
      {showIcon && <Icon className="size-3.5" aria-hidden />}
      {hasValue && <span>{fmt(value)}</span>}
      {hasValue && hasPct && <span>{` (${fmt(percent)}%)`}</span>}
      {!hasValue && hasPct && <span>{`${fmt(percent)}%`}</span>}
    </span>
  );
}

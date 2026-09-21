import { cn } from '@/lib/utils';
import PriceChange from './PriceChange';

export default function StatCard({ label, value, sub, change, icon: Icon, className, children }) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">{label}</span>
        {Icon && <Icon className="size-4 shrink-0" aria-hidden />}
      </div>
      <div className="mt-1.5 text-xl font-semibold tabular-nums">{value}</div>
      {(change || sub) && (
        <div className="mt-0.5 flex items-center gap-2 text-xs">
          {change && <PriceChange value={change.value} percent={change.percent} />}
          {sub && <span className="text-muted-foreground">{sub}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

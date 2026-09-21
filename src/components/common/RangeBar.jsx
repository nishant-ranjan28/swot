import { cn } from '@/lib/utils';

const TONES = {
  neutral: { track: 'bg-muted', marker: 'bg-foreground ring-2 ring-card' },
  gain: { track: 'bg-linear-to-r from-warning via-gain/70 to-gain', marker: 'bg-card border-2 border-gain' },
  loss: { track: 'bg-linear-to-r from-loss via-loss/70 to-warning', marker: 'bg-card border-2 border-loss' },
};

// 52-week style low–high bar with a marker at `value`. Renders nothing when any
// value is missing/zero or the range has no span (same guard as the legacy bars).
export default function RangeBar({ low, high, value, lowLabel, highLabel, label, tone = 'neutral', className }) {
  if (!low || !high || !value || high === low) return null;
  if (![low, high, value].every(n => typeof n === 'number' && Number.isFinite(n))) return null;
  const pct = Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100));
  const t = TONES[tone] || TONES.neutral;
  return (
    <div className={cn('space-y-1', className)}>
      {(lowLabel || highLabel || label) && (
        <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
          <span>{lowLabel}</span>
          {label && <span className="text-muted-foreground">{label}</span>}
          <span>{highLabel}</span>
        </div>
      )}
      <div data-testid="range-track" className={cn('relative h-1.5 rounded-full', t.track)}>
        <div
          data-testid="range-marker"
          className={cn('absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full', t.marker)}
          style={{ left: `calc(${pct}% - 5px)` }}
        />
      </div>
    </div>
  );
}

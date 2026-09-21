import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// Toggleable tile wrapping a card (usually StatCard); the ring/border styles target that child div.
export default function SelectableTile({ selected, className, children, ...props }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'rounded-xl text-left transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        selected ? 'ring-2 ring-primary [&>div]:border-primary' : '[&>div]:hover:border-foreground/20',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export const TileSkeleton = () => (
  <div className="rounded-xl border border-border bg-card p-4">
    <Skeleton className="mb-2 h-3 w-16" />
    <Skeleton className="mb-2 h-5 w-20" />
    <Skeleton className="h-3 w-14" />
  </div>
);

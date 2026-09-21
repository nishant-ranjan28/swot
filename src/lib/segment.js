import { cn } from '@/lib/utils';

// Class for one button in a segmented pill group (tabs/toggles). Pair with aria-pressed.
export const segmentClass = (active) => cn(
  'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
  active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
);

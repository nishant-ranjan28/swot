import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ErrorState({ title = 'Something went wrong', message, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-xl border border-loss/30 bg-loss/5 px-6 py-10 text-center">
      <AlertTriangle className="size-7 text-loss" aria-hidden />
      <p className="font-medium">{title}</p>
      {message && <p className="max-w-md text-sm text-muted-foreground">{message}</p>}
      {onRetry && <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">Try again</Button>}
    </div>
  );
}

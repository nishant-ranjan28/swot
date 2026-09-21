import { cn } from '@/lib/utils';

export default function PageContainer({ className, children }) {
  return <div className={cn('mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6', className)}>{children}</div>;
}

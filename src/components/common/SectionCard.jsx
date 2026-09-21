import { cn } from '@/lib/utils';

export default function SectionCard({ title, description, action, className, contentClassName, children, ...props }) {
  return (
    <section className={cn('rounded-xl border border-border bg-card', className)} {...props}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={cn('p-4', contentClassName)}>{children}</div>
    </section>
  );
}

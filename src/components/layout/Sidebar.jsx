// src/components/layout/Sidebar.jsx
import { Link, useLocation } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen, Activity } from 'lucide-react';
import { NAV_GROUPS, isNavActive } from '@/nav';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';

export function SidebarNav({ collapsed = false, onNavigate }) {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Main" className="flex flex-col gap-5 px-2 py-4">
      {NAV_GROUPS.map(group => (
        <div key={group.label}>
          {!collapsed && (
            <div className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {group.label}
            </div>
          )}
          <ul className="flex flex-col gap-0.5">
            {group.items.map(({ to, label, icon: Icon }) => {
              const active = isNavActive(to, pathname);
              const link = (
                <Link
                  to={to}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  aria-label={collapsed ? label : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    active && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
                    collapsed && 'justify-center px-0',
                  )}
                >
                  <Icon className={cn('size-4 shrink-0', active && 'text-sidebar-primary')} />
                  {!collapsed && <span className="truncate">{label}</span>}
                </Link>
              );
              return (
                <li key={to}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{label}</TooltipContent>
                    </Tooltip>
                  ) : link}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Brand({ collapsed }) {
  return (
    <Link to="/" aria-label="StockPulse home" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
        <Activity className="size-4" />
      </span>
      {!collapsed && <span>StockPulse</span>}
    </Link>
  );
}

export default function Sidebar({ collapsed, onToggle }) {
  const Toggle = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar lg:flex',
        'transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className={cn('flex h-16 items-center border-b border-sidebar-border px-4', collapsed && 'justify-center px-0')}>
        <Brand collapsed={collapsed} />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <SidebarNav collapsed={collapsed} />
      </ScrollArea>
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="flex h-11 items-center justify-center border-t border-sidebar-border text-muted-foreground hover:text-foreground"
      >
        <Toggle className="size-4" />
      </button>
    </aside>
  );
}

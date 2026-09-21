// src/components/layout/AppShell.jsx
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { TooltipProvider } from '@/components/ui/tooltip';
import Sidebar, { SidebarNav, Brand } from './Sidebar';
import TopBar from './TopBar';
import CommandPalette from './CommandPalette';

export default function AppShell({ children }) {
  const [collapsed, setCollapsed] = useLocalStorage('stockpulse_sidebar_collapsed', false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen(o => !o);
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen bg-background">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-72 bg-sidebar p-0">
            <SheetHeader className="h-16 justify-center border-b border-sidebar-border px-4">
              <SheetTitle asChild><div><Brand /></div></SheetTitle>
              <SheetDescription className="sr-only">Site navigation</SheetDescription>
            </SheetHeader>
            <div className="overflow-y-auto">
              <SidebarNav onNavigate={() => setMobileOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onOpenMenu={() => setMobileOpen(true)} onOpenSearch={() => setSearchOpen(true)} />
          <main className="flex-1">{children}</main>
        </div>
      </div>
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </TooltipProvider>
  );
}

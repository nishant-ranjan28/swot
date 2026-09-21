// Account entry point in the TopBar. Renders nothing when accounts aren't configured.
import { Link, useLocation } from 'react-router-dom';
import { LogOut, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useOptionalAuth } from '@/context/AuthContext';
import { useSignOut } from '@/components/auth/useSignOut';

const AUTH_PATHS = ['/login', '/signup', '/forgot-password', '/reset-password'];

function initialOf(user) {
  const source = user?.user_metadata?.full_name?.trim() || user?.email || '?';
  return source[0].toUpperCase();
}

export default function UserMenu() {
  const auth = useOptionalAuth();
  const { pathname, search, hash } = useLocation();
  const { signOut, busy } = useSignOut();

  if (!auth?.enabled) return null;
  if (auth.loading) return <div className="size-8" aria-hidden />;

  if (!auth.user) {
    const state = AUTH_PATHS.includes(pathname) ? undefined : { from: pathname + search + hash };
    return (
      <Button variant="outline" size="sm" asChild>
        <Link to="/login" state={state}>
          Sign in
        </Link>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {initialOf(auth.user)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{auth.user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={busy} onSelect={() => signOut()}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

import React, { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import api from './api';
import { useMarket } from './context/MarketContext';
import { toast } from 'sonner';
import AppShell from './components/layout/AppShell';
import { Toaster } from './components/ui/sonner';
import HomePage from './components/HomePage';
import { useAlertNotifications } from './hooks/useAlertNotifications';
import { PAGE_ROUTES } from './routes';
import ImportLocalDataDialog from './components/auth/ImportLocalDataDialog';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function MarketHomePage() {
  const { setMarket } = useMarket();
  const location = useLocation();

  useEffect(() => {
    const match = location.pathname.match(/^\/(in|us)$/i);
    const m = match?.[1]?.toLowerCase();
    if (m === 'in' || m === 'us') {
      setMarket(m);
      toast(`Switched to ${m === 'in' ? 'Indian' : 'US'} market`);
    }
  }, [location.pathname, setMarket]);

  return <HomePage />;
}

// Its own component, so watchlist changes re-render nothing but this null element.
function AlertNotifications() {
  useAlertNotifications();
  return null;
}

function App() {
  useEffect(() => {
    api.get('/api/health', { timeout: 90000 }).catch(() => {});
  }, []);

  return (
    <AppShell>
      <AlertNotifications />
      <ImportLocalDataDialog />
      <ScrollToTop />
      <Routes>
        <Route path="/in" element={<MarketHomePage />} />
        <Route path="/us" element={<MarketHomePage />} />
        {PAGE_ROUTES.map(r => <Route key={r.path} path={r.path} element={r.element} />)}
      </Routes>
      <Analytics />
      <Toaster richColors position="bottom-center" />
    </AppShell>
  );
}

export default App;

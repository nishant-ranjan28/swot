// src/nav.js
import {
  LayoutDashboard, Bitcoin, Gem, ArrowLeftRight, Globe,
  Filter, ScanSearch, GitCompare, Grid3x3, History,
  PiggyBank, Layers,
  Newspaper, Flame, Landmark, Handshake, CalendarCheck, CalendarDays, Rocket,
  Star, Briefcase,
  Calculator, Receipt, BookOpen,
} from 'lucide-react';

export const NAV_GROUPS = [
  { label: 'Markets', items: [
    { to: '/', label: 'Home', icon: LayoutDashboard },
    { to: '/crypto', label: 'Crypto', icon: Bitcoin },
    { to: '/commodities', label: 'Commodities', icon: Gem },
    { to: '/forex', label: 'Forex', icon: ArrowLeftRight },
    { to: '/macro', label: 'Macro', icon: Globe },
  ]},
  { label: 'Research', items: [
    { to: '/screener', label: 'Screener', icon: Filter },
    { to: '/scanner', label: '52W Scanner', icon: ScanSearch },
    { to: '/compare', label: 'Compare', icon: GitCompare },
    { to: '/sector-heatmap', label: 'Sector Heatmap', icon: Grid3x3 },
    { to: '/backtest', label: 'Backtest', icon: History },
  ]},
  { label: 'Funds', items: [
    { to: '/mutual-funds', label: 'Mutual Funds', icon: PiggyBank },
    { to: '/etf', label: 'ETFs', icon: Layers },
  ]},
  { label: 'Intelligence', items: [
    { to: '/news', label: 'News', icon: Newspaper },
    { to: '/trending', label: 'Trending', icon: Flame },
    { to: '/fii-dii', label: 'FII / DII', icon: Landmark },
    { to: '/deals', label: 'Insider Deals', icon: Handshake },
    { to: '/earnings-calendar', label: 'Earnings', icon: CalendarCheck },
    { to: '/economic-calendar', label: 'Economic Calendar', icon: CalendarDays },
    { to: '/ipo', label: 'IPOs', icon: Rocket },
  ]},
  { label: 'My Stuff', items: [
    { to: '/watchlist', label: 'Watchlist', icon: Star },
    { to: '/portfolio', label: 'Portfolio', icon: Briefcase },
  ]},
  { label: 'Tools', items: [
    { to: '/calculator', label: 'Calculators', icon: Calculator },
    { to: '/tax', label: 'Tax Calculator', icon: Receipt },
    { to: '/glossary', label: 'Glossary', icon: BookOpen },
  ]},
];

export const NAV_ITEMS = NAV_GROUPS.flatMap(g => g.items);

// '/' is active on stock pages too (they are reached from Home/search)
export function isNavActive(to, pathname) {
  if (to === '/') return pathname === '/' || pathname === '/in' || pathname === '/us' || pathname.startsWith('/stock/');
  return pathname === to || pathname.startsWith(`${to}/`);
}

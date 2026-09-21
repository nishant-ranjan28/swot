// src/nav.test.js
import { NAV_ITEMS, isNavActive } from './nav';
import { PAGE_ROUTES } from './routes';

const NON_NAV = new Set(['/stock/:symbol', '/login', '/signup', '/forgot-password', '/reset-password', '/settings']);

test('every page route appears in nav exactly once', () => {
  const navPaths = NAV_ITEMS.map(i => i.to);
  expect(new Set(navPaths).size).toBe(navPaths.length);
  for (const { path } of PAGE_ROUTES) {
    if (!NON_NAV.has(path)) expect(navPaths).toContain(path);
  }
});

test('every nav item points at a real route', () => {
  const routePaths = PAGE_ROUTES.map(r => r.path);
  for (const { to } of NAV_ITEMS) expect(routePaths).toContain(to);
});

test('isNavActive', () => {
  expect(isNavActive('/', '/stock/AAPL')).toBe(true);
  expect(isNavActive('/', '/us')).toBe(true);
  expect(isNavActive('/', '/screener')).toBe(false);
  expect(isNavActive('/screener', '/screener')).toBe(true);
});

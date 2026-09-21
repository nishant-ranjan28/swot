import { withAlpha, readCssVar } from './color';

test('withAlpha converts hex to rgba', () => {
  expect(withAlpha('#16a34a', 0.3)).toBe('rgba(22, 163, 74, 0.3)');
  expect(withAlpha('#fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
});

test('withAlpha passes through non-hex unchanged', () => {
  expect(withAlpha('rgb(1, 2, 3)', 0.5)).toBe('rgb(1, 2, 3)');
});

test('readCssVar reads from element style with fallback', () => {
  document.documentElement.style.setProperty('--gain', ' #22c55e ');
  expect(readCssVar('--gain', '#000')).toBe('#22c55e');
  expect(readCssVar('--nope', '#123456')).toBe('#123456');
});

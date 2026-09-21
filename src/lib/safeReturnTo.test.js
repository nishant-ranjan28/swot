import { safeReturnTo } from './safeReturnTo';

test('keeps a same-origin path with its query and hash', () => {
  expect(safeReturnTo('/screener?x=1#h')).toBe('/screener?x=1#h');
});

test.each([
  ['//evil.com'],
  ['/\\evil.com'],
  ['javascript:alert(1)'],
  ['https://evil.com'],
  ['/\tevil'],
  ['/\nevil'],
  [''],
  [null],
  [undefined],
  [123],
  [{ pathname: '/x' }],
])('rejects %j', (input) => {
  expect(safeReturnTo(input)).toBe('/');
});

test('an encoded tab stays a same-origin path (browsers do not decode %09 in the path)', () => {
  // new URL('/%09/evil.com', origin) → same origin, pathname '/%09/evil.com'.
  expect(safeReturnTo('/%09/evil.com')).toBe('/%09/evil.com');
});

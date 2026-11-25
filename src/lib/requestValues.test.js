import { stockSymbolPath, isSchemeCode } from './requestValues';

test.each(['RELIANCE.NS', 'BRK-B', '^NSEI', 'EURUSD=X', 'GC=F', 'M&M.NS', '0P0000XVU2.BO'])('preserves valid ticker %s as one encoded path segment', symbol => {
  const path = stockSymbolPath(symbol);
  const url = new URL(`/api/stocks/${path}/history`, 'https://api.example');
  expect(url.pathname).toBe(`/api/stocks/${encodeURIComponent(symbol)}/history`);
  expect(url.search).toBe('');
  expect(url.hash).toBe('');
});

test.each(['..', '../jobs', 'RELIANCE.NS?range=max', 'AAPL#hash', '%2e%2e', '//evil.example', 'a\\b', 'https://evil.example', 'a\r\nb', '', null])('rejects invalid ticker %s', symbol => {
  expect(() => stockSymbolPath(symbol)).toThrow(TypeError);
});

test.each([119551, '119551'])('accepts numeric scheme code %s', code => expect(isSchemeCode(code)).toBe(true));
test.each(['../nav', '123?codes=456', '123,456', '123#hash', '1e5', 1.5, 0, {}, null])('rejects invalid scheme code %s', code => expect(isSchemeCode(code)).toBe(false));

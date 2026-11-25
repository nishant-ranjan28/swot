// Instrument identifiers are path segments, not arbitrary URLs or search text.
export function stockSymbolPath(symbol) {
  if (typeof symbol !== 'string' || !/^[a-z0-9^][a-z0-9.^=&_-]{0,63}$/i.test(symbol) || symbol.includes('..')) {
    throw new TypeError('Enter a valid stock symbol.');
  }
  return encodeURIComponent(symbol);
}

export function isSchemeCode(code) {
  return (typeof code === 'string' || Number.isSafeInteger(code))
    && /^[1-9][0-9]{0,11}$/.test(String(code));
}

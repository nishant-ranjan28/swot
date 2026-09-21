// Where to send someone after signing in, given an untrusted `location.state.from`.
// Only same-origin paths survive; anything else (protocol-relative, backslash tricks,
// control characters, absolute URLs, non-strings) falls back to home.

// Backslash, C0 control characters and DEL.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const UNSAFE = new RegExp('[\\\\\\x00-\\x1f\\x7f]');

export function safeReturnTo(from) {
  if (typeof from !== 'string' || !from.startsWith('/') || UNSAFE.test(from)) return '/';
  try {
    const url = new URL(from, window.location.origin);
    if (url.origin !== window.location.origin) return '/';
    return url.pathname + url.search + url.hash;
  } catch {
    return '/';
  }
}

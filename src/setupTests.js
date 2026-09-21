import '@testing-library/jest-dom/vitest';

// jsdom gaps: minimal stubs for browser APIs used by the app and its libraries.
window.matchMedia ||= () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
window.scrollTo = () => {};

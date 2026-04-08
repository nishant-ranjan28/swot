const STORAGE_PREFIX = 'stockpulse_drawings_';

export function getDrawings(symbol) {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${symbol}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveDrawings(symbol, drawings) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${symbol}`, JSON.stringify(drawings));
  } catch {
    // localStorage may be full or unavailable
  }
}

export function addDrawing(symbol, drawing) {
  const drawings = getDrawings(symbol);
  drawings.push({ ...drawing, id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, createdAt: Date.now() });
  saveDrawings(symbol, drawings);
  return drawings;
}

export function removeDrawing(symbol, drawingId) {
  const drawings = getDrawings(symbol).filter(d => d.id !== drawingId);
  saveDrawings(symbol, drawings);
  return drawings;
}

export function clearDrawings(symbol) {
  saveDrawings(symbol, []);
  return [];
}

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
  localStorage.setItem(`${STORAGE_PREFIX}${symbol}`, JSON.stringify(drawings));
}

export function addDrawing(symbol, drawing) {
  const drawings = getDrawings(symbol);
  drawings.push({ ...drawing, id: crypto.randomUUID(), createdAt: Date.now() });
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

// All persistence lives in localStorage so the app works fully offline.

const KEY = 'nonogram.v1';

const DEFAULT_SETTINGS = {
  strict: true,          // mistakes are punished, filled cells are always correct
  lives: 3,              // 0 = unlimited
  forgivingDrags: true,  // only the cell a stroke starts on can cost a life
  autoCross: true,       // auto-cross a line once its clues are satisfied
  crosshair: true,       // highlight the active row/column
  theme: 'auto',         // auto | light | dark
};

const empty = () => ({ settings: { ...DEFAULT_SETTINGS }, progress: {}, saves: {}, stats: { solved: 0, time: 0 } });

let state = load();
let writeTimer = null;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw);
    return {
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
      progress: parsed.progress || {},
      saves: parsed.saves || {},
      stats: { solved: 0, time: 0, ...(parsed.stats || {}) },
    };
  } catch {
    return empty();
  }
}

function flush() {
  writeTimer = null;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked — the game still runs, it just won't persist */
  }
}

function save() {
  if (writeTimer) return;
  writeTimer = setTimeout(flush, 250);
}

export function getSettings() {
  return { ...state.settings };
}

export function setSetting(key, value) {
  state.settings[key] = value;
  save();
}

export function getProgress(id) {
  return state.progress[id] || null;
}

export function allProgress() {
  return state.progress;
}

export function getStats() {
  return { ...state.stats };
}

export function recordWin(id, seconds) {
  const prev = state.progress[id];
  const best = prev && prev.best ? Math.min(prev.best, seconds) : seconds;
  state.progress[id] = { done: true, best, last: seconds, plays: (prev?.plays || 0) + 1 };
  state.stats.solved += 1;
  state.stats.time += seconds;
  delete state.saves[id];
  flush();
  return best === seconds && (!prev || !prev.best || seconds < prev.best);
}

export function getSave(id) {
  return state.saves[id] || null;
}

export function putSave(id, data) {
  state.saves[id] = data;
  save();
}

export function clearSave(id) {
  delete state.saves[id];
  save();
}

/** Most recent unfinished puzzle, for the "Continue" button. */
export function lastSave() {
  let best = null;
  for (const [id, s] of Object.entries(state.saves)) {
    if (!best || (s.at || 0) > (best.save.at || 0)) best = { id, save: s };
  }
  return best;
}

export function resetAll() {
  state = empty();
  flush();
}

export function encodeMarks(marks) {
  let out = '';
  for (let i = 0; i < marks.length; i++) out += marks[i];
  return out;
}

export function decodeMarks(str, length) {
  const marks = new Uint8Array(length);
  if (typeof str !== 'string') return marks;
  for (let i = 0; i < Math.min(length, str.length); i++) marks[i] = str.charCodeAt(i) - 48;
  return marks;
}

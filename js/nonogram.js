// Core nonogram logic: clues, line solving (DFA based), puzzle generation.
// A grid is a Uint8Array of size*size, 1 = filled, 0 = blank.

export const UNKNOWN = 0;
export const FILLED = 1;
export const BLANK = 2;

/** Clue numbers for one line of 0/1 values. */
export function lineClues(values) {
  const out = [];
  let run = 0;
  for (const v of values) {
    if (v) run++;
    else if (run) { out.push(run); run = 0; }
  }
  if (run) out.push(run);
  return out.length ? out : [0];
}

export function computeClues(grid, size) {
  const rows = [];
  const cols = [];
  for (let r = 0; r < size; r++) {
    const line = [];
    for (let c = 0; c < size; c++) line.push(grid[r * size + c]);
    rows.push(lineClues(line));
  }
  for (let c = 0; c < size; c++) {
    const line = [];
    for (let r = 0; r < size; r++) line.push(grid[r * size + c]);
    cols.push(lineClues(line));
  }
  return { rows, cols };
}

export function clueSum(clue) {
  return clue.reduce((a, b) => a + b, 0);
}

/**
 * Build the automaton for a clue list.
 * States: 0..k are "gap" states (j clues completed, currently outside a block),
 * then one state per cell of every block.
 * Returns { count, onFilled, onBlank, accept } where transitions are Int16Array
 * holding the target state or -1.
 */
function buildAutomaton(clue) {
  const clues = clue.length === 1 && clue[0] === 0 ? [] : clue;
  const k = clues.length;
  const total = clueSum(clues);
  const count = k + 1 + total;
  const onFilled = new Int16Array(count).fill(-1);
  const onBlank = new Int16Array(count).fill(-1);
  // gap state j -> index j ; block j cell t (1-based) -> k + 1 + offset(j) + (t-1)
  const offsets = [];
  let acc = 0;
  for (let j = 0; j < k; j++) { offsets.push(acc); acc += clues[j]; }
  const block = (j, t) => k + 1 + offsets[j] + (t - 1);

  for (let j = 0; j <= k; j++) {
    onBlank[j] = j; // stay in the gap
    if (j < k) onFilled[j] = block(j, 1); // start clue j
  }
  for (let j = 0; j < k; j++) {
    for (let t = 1; t <= clues[j]; t++) {
      const s = block(j, t);
      if (t < clues[j]) onFilled[s] = block(j, t + 1);
      else onBlank[s] = j + 1; // block finished, separator consumed
    }
  }
  const accept = new Uint8Array(count);
  accept[k] = 1;
  if (k > 0) accept[block(k - 1, clues[k - 1])] = 1;
  return { count, onFilled, onBlank, accept };
}

const automatonCache = new Map();
function automatonFor(clue) {
  const key = clue.join(',');
  let a = automatonCache.get(key);
  if (!a) { a = buildAutomaton(clue); automatonCache.set(key, a); }
  return a;
}

/**
 * Deduce everything that is forced in a single line.
 * `state` holds UNKNOWN / FILLED / BLANK per cell and is updated in place.
 * Returns the number of newly determined cells, or -1 on contradiction.
 */
export function solveLine(state, offset, stride, len, clue) {
  const { count, onFilled, onBlank, accept } = automatonFor(clue);
  // forward[i] = states reachable after reading i cells
  const forward = new Uint8Array((len + 1) * count);
  forward[0 * count + 0] = 1;
  for (let i = 0; i < len; i++) {
    const cell = state[offset + i * stride];
    const base = i * count;
    const next = (i + 1) * count;
    let any = false;
    for (let s = 0; s < count; s++) {
      if (!forward[base + s]) continue;
      if (cell !== BLANK && onFilled[s] >= 0) { forward[next + onFilled[s]] = 1; any = true; }
      if (cell !== FILLED && onBlank[s] >= 0) { forward[next + onBlank[s]] = 1; any = true; }
    }
    if (!any) return -1;
  }
  // backward[i] = states from which the rest of the line can be completed
  const backward = new Uint8Array((len + 1) * count);
  for (let s = 0; s < count; s++) if (accept[s]) backward[len * count + s] = 1;
  for (let i = len - 1; i >= 0; i--) {
    const cell = state[offset + i * stride];
    const base = i * count;
    const next = (i + 1) * count;
    for (let s = 0; s < count; s++) {
      const f = onFilled[s];
      const b = onBlank[s];
      if (cell !== BLANK && f >= 0 && backward[next + f]) { backward[base + s] = 1; continue; }
      if (cell !== FILLED && b >= 0 && backward[next + b]) backward[base + s] = 1;
    }
  }
  if (!backward[0 * count + 0]) return -1;

  let changed = 0;
  for (let i = 0; i < len; i++) {
    const idx = offset + i * stride;
    if (state[idx] !== UNKNOWN) continue;
    let canFill = false;
    let canBlank = false;
    const base = i * count;
    const next = (i + 1) * count;
    for (let s = 0; s < count; s++) {
      if (!forward[base + s] || !backward[base + s]) continue;
      const f = onFilled[s];
      const b = onBlank[s];
      if (!canFill && f >= 0 && backward[next + f]) canFill = true;
      if (!canBlank && b >= 0 && backward[next + b]) canBlank = true;
      if (canFill && canBlank) break;
    }
    if (!canFill && !canBlank) return -1;
    if (canFill !== canBlank) {
      state[idx] = canFill ? FILLED : BLANK;
      changed++;
    }
  }
  return changed;
}

/**
 * Solve a puzzle using line logic only (no guessing) — exactly what a fair
 * human solve looks like.
 * Returns { grid, solved, contradiction }.
 */
export function lineSolve(rows, cols, size) {
  const state = new Uint8Array(size * size);
  let dirtyRows = new Uint8Array(size).fill(1);
  let dirtyCols = new Uint8Array(size).fill(1);
  let unknown = size * size;

  for (let pass = 0; pass < size * size * 2 && unknown > 0; pass++) {
    let progress = 0;
    for (let r = 0; r < size; r++) {
      if (!dirtyRows[r]) continue;
      dirtyRows[r] = 0;
      const before = state.slice(r * size, r * size + size);
      const n = solveLine(state, r * size, 1, size, rows[r]);
      if (n < 0) return { grid: state, solved: false, contradiction: true };
      if (n > 0) {
        progress += n;
        unknown -= n;
        for (let c = 0; c < size; c++) if (before[c] !== state[r * size + c]) dirtyCols[c] = 1;
      }
    }
    for (let c = 0; c < size; c++) {
      if (!dirtyCols[c]) continue;
      dirtyCols[c] = 0;
      const before = [];
      for (let r = 0; r < size; r++) before.push(state[r * size + c]);
      const n = solveLine(state, c, size, size, cols[c]);
      if (n < 0) return { grid: state, solved: false, contradiction: true };
      if (n > 0) {
        progress += n;
        unknown -= n;
        for (let r = 0; r < size; r++) if (before[r] !== state[r * size + c]) dirtyRows[r] = 1;
      }
    }
    if (!progress) break;
  }
  return { grid: state, solved: unknown === 0, contradiction: false };
}

/** Is the puzzle solvable by pure logic, and does it match the intended grid? */
export function isFairPuzzle(grid, rows, cols, size) {
  const res = lineSolve(rows, cols, size);
  if (!res.solved || res.contradiction) return false;
  for (let i = 0; i < grid.length; i++) {
    const want = grid[i] ? FILLED : BLANK;
    if (res.grid[i] !== want) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Generation

function noiseGrid(size, rng, density) {
  const g = new Uint8Array(size * size);
  for (let i = 0; i < g.length; i++) g[i] = rng() < density ? 1 : 0;
  return g;
}

/** Cellular-automaton smoothing: turns noise into blobby, picture-ish shapes. */
function smooth(grid, size, steps) {
  let cur = grid;
  for (let s = 0; s < steps; s++) {
    const next = new Uint8Array(size * size);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        let n = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const rr = r + dr;
            const cc = c + dc;
            if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
            n += cur[rr * size + cc];
          }
        }
        const self = cur[r * size + c];
        next[r * size + c] = n > 4 || (self && n >= 3) ? 1 : 0;
      }
    }
    cur = next;
  }
  return cur;
}

function densityOf(grid) {
  let n = 0;
  for (const v of grid) n += v;
  return n / grid.length;
}

function hasEmptyLine(grid, size) {
  for (let r = 0; r < size; r++) {
    let n = 0;
    for (let c = 0; c < size; c++) n += grid[r * size + c];
    if (!n) return true;
  }
  for (let c = 0; c < size; c++) {
    let n = 0;
    for (let r = 0; r < size; r++) n += grid[r * size + c];
    if (!n) return true;
  }
  return false;
}

/**
 * Generate a puzzle that is guaranteed solvable by logic alone.
 * Deterministic for a given rng seed.
 */
export function generateGrid(size, rng, opts = {}) {
  const minD = opts.minDensity ?? 0.34;
  const maxD = opts.maxDensity ?? 0.66;
  let best = null;
  for (let attempt = 0; attempt < 400; attempt++) {
    const density = 0.42 + rng() * 0.2;
    const steps = attempt < 200 ? (size >= 10 ? 2 : 1) : 0;
    let grid = smooth(noiseGrid(size, rng, density), size, steps);
    const d = densityOf(grid);
    if (d < minD || d > maxD) continue;
    if (size <= 10 && hasEmptyLine(grid, size)) continue;
    const { rows, cols } = computeClues(grid, size);
    if (isFairPuzzle(grid, rows, cols, size)) return { grid, rows, cols };
    if (!best) best = { grid, rows, cols };
  }
  // Extremely unlikely fallback: keep a valid (if slightly harder) puzzle.
  if (best) return best;
  const grid = noiseGrid(size, rng, 0.5);
  return { grid, ...computeClues(grid, size) };
}

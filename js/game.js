// Game state for a single puzzle: marks, timer, mistakes, undo, win check.

import { lineClues, clueSum } from './nonogram.js';

export const EMPTY = 0;
export const FILL = 1;
export const CROSS = 2;

export class Game {
  constructor(puzzle, settings, saved) {
    this.puzzle = puzzle;
    this.settings = settings;
    this.size = puzzle.size;
    this.marks = new Uint8Array(this.size * this.size);
    this.mistakes = 0;
    this.hints = 0;
    this.elapsed = 0; // seconds of play, penalties included
    this.status = 'playing'; // playing | won | lost
    this.history = [];
    this.rowDone = new Uint8Array(this.size);
    this.colDone = new Uint8Array(this.size);
    // Per-number "this block is nailed down" flags, derived only from the
    // player's own marks — they never peek at the solution.
    this.rowClueDone = puzzle.rows.map((clue) => new Uint8Array(clue.length));
    this.colClueDone = puzzle.cols.map((clue) => new Uint8Array(clue.length));
    this.listeners = new Set();

    if (saved && saved.marks) {
      const src = saved.marks;
      for (let i = 0; i < this.marks.length && i < src.length; i++) this.marks[i] = src[i];
      this.mistakes = saved.mistakes || 0;
      this.hints = saved.hints || 0;
      this.elapsed = saved.elapsed || 0;
    }
    this.refreshLines();
    if (this.isSolved()) this.status = 'won';
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(event) {
    for (const fn of this.listeners) fn(event);
  }

  idx(r, c) {
    return r * this.size + c;
  }

  solutionAt(i) {
    return this.puzzle.grid[i];
  }

  /**
   * Apply one cell action. `want` is the mark the stroke is painting.
   * With `penalize: false` a wrong mark is refused instead of costing a life —
   * that is what a finger overshooting the end of a drag deserves. The caller
   * gets `{ blocked: true }` back so it can stop the stroke there.
   * Returns a change record, `{ blocked: true }`, or null when nothing happened.
   */
  set(i, want, { penalize = true } = {}) {
    if (this.status !== 'playing') return null;
    const from = this.marks[i];
    if (from === want) return null;
    const truth = this.puzzle.grid[i];

    if (this.settings.strict) {
      // In strict mode a filled cell is always correct, so it is permanent.
      if (from === FILL) return null;
      // A cross can only sit on a genuinely empty cell here — crossing a filled
      // one is caught the moment it happens. So painting over your own cross is
      // never news, and must never cost a life: the cross is a wall the stroke
      // stops at. Erasing it (cross mode again) still works.
      if (from === CROSS && want === FILL) return { blocked: true, wall: true };
      const wrong = (want === FILL && truth === 0) || (want === CROSS && truth === 1);
      if (wrong && !penalize) return { blocked: true };
      if (wrong) {
        this.marks[i] = truth === 1 ? FILL : CROSS; // reveal the truth
        this.mistakes++;
        const rec = { i, from, to: this.marks[i], mistake: true };
        this.afterChange([rec]);
        this.emit({ type: 'mistake', index: i });
        if (this.settings.lives && this.mistakes >= this.settings.lives) {
          this.status = 'lost';
          this.emit({ type: 'lost' });
        }
        return rec;
      }
    }

    this.marks[i] = want;
    const rec = { i, from, to: want };
    this.afterChange([rec]);
    return rec;
  }

  afterChange(records) {
    const rows = new Set();
    const cols = new Set();
    const note = (list) => {
      for (const rec of list) {
        rows.add(Math.floor(rec.i / this.size));
        cols.add(rec.i % this.size);
      }
    };
    note(records);

    const auto = [];
    for (const r of rows) {
      const wasDone = this.rowDone[r];
      this.rowDone[r] = this.lineSatisfied(r, true) ? 1 : 0;
      if (this.rowDone[r] && !wasDone && this.settings.autoCross) auto.push(...this.crossRest(r, true));
    }
    for (const c of cols) {
      const wasDone = this.colDone[c];
      this.colDone[c] = this.lineSatisfied(c, false) ? 1 : 0;
      if (this.colDone[c] && !wasDone && this.settings.autoCross) auto.push(...this.crossRest(c, false));
    }
    if (auto.length) {
      // auto-crossing can complete the perpendicular lines too
      note(auto);
      for (const r of rows) this.rowDone[r] = this.lineSatisfied(r, true) ? 1 : 0;
      for (const c of cols) this.colDone[c] = this.lineSatisfied(c, false) ? 1 : 0;
      records.push(...auto);
    }
    for (const r of rows) this.clueProgress(r, true);
    for (const c of cols) this.clueProgress(c, false);
    this.emit({ type: 'cells', records });
    if (this.status === 'playing' && this.isSolved()) {
      this.status = 'won';
      this.emit({ type: 'won' });
    }
  }

  crossRest(n, isRow) {
    const out = [];
    for (let k = 0; k < this.size; k++) {
      const i = isRow ? this.idx(n, k) : this.idx(k, n);
      if (this.marks[i] === EMPTY) {
        this.marks[i] = CROSS;
        out.push({ i, from: EMPTY, to: CROSS, auto: true });
      }
    }
    return out;
  }

  markAt(n, k, isRow) {
    return this.marks[isRow ? n * this.size + k : k * this.size + n];
  }

  /**
   * Work out which individual clue numbers the player has already pinned down,
   * so they can be greyed out.
   *
   * A number counts as done only when it is forced by what is already on the
   * board: everything from that end of the line up to and including its block
   * is marked, and the block is closed by a cross or the edge. That is a
   * deduction the player has already made, so greying it reveals nothing they
   * could not read off the grid themselves — the solution is never consulted.
   */
  clueProgress(n, isRow) {
    const clue = isRow ? this.puzzle.rows[n] : this.puzzle.cols[n];
    const flags = isRow ? this.rowClueDone[n] : this.colClueDone[n];
    flags.fill(0);
    const size = this.size;
    const at = (k) => this.markAt(n, k, isRow);

    if (clue.length === 1 && clue[0] === 0) {
      let all = true;
      for (let k = 0; k < size && all; k++) if (at(k) !== CROSS) all = false;
      flags[0] = all ? 1 : 0;
      return;
    }

    // Sweep in from the left: with every cell before it settled, the first run
    // can only be the first clue. If it already measures that clue it is done —
    // one more cell would overshoot the number the player can read.
    let head = 0;
    let i = 0;
    while (i < size && head < clue.length) {
      const m = at(i);
      if (m === EMPTY) break;
      if (m === CROSS) { i++; continue; }
      let len = 0;
      while (i < size && at(i) === FILL) { len++; i++; }
      if (len !== clue[head]) break; // still growing, or the player has it wrong
      flags[head++] = 1;
      if (i < size && at(i) === EMPTY) break; // past here nothing is settled yet
    }

    // And in from the right, without claiming a number the left sweep took.
    let tail = clue.length - 1;
    let j = size - 1;
    while (j >= 0 && tail >= head) {
      const m = at(j);
      if (m === EMPTY) break;
      if (m === CROSS) { j--; continue; }
      let len = 0;
      while (j >= 0 && at(j) === FILL) { len++; j--; }
      if (len !== clue[tail]) break;
      flags[tail--] = 1;
      if (j >= 0 && at(j) === EMPTY) break;
    }
  }

  lineValues(n, isRow) {
    const out = [];
    for (let k = 0; k < this.size; k++) {
      const i = isRow ? this.idx(n, k) : this.idx(k, n);
      out.push(this.marks[i] === FILL ? 1 : 0);
    }
    return out;
  }

  lineSatisfied(n, isRow) {
    const clue = isRow ? this.puzzle.rows[n] : this.puzzle.cols[n];
    const got = lineClues(this.lineValues(n, isRow));
    if (got.length !== clue.length) return false;
    for (let i = 0; i < clue.length; i++) if (got[i] !== clue[i]) return false;
    return true;
  }

  refreshLines() {
    for (let n = 0; n < this.size; n++) {
      this.rowDone[n] = this.lineSatisfied(n, true) ? 1 : 0;
      this.colDone[n] = this.lineSatisfied(n, false) ? 1 : 0;
      this.clueProgress(n, true);
      this.clueProgress(n, false);
    }
  }

  isSolved() {
    for (let i = 0; i < this.marks.length; i++) {
      const filled = this.marks[i] === FILL ? 1 : 0;
      if (filled !== this.puzzle.grid[i]) return false;
    }
    return true;
  }

  filledCount() {
    let n = 0;
    for (const m of this.marks) if (m === FILL) n++;
    return n;
  }

  targetCount() {
    let n = 0;
    for (const v of this.puzzle.grid) n += v;
    return n;
  }

  pushHistory(records) {
    if (!records.length) return;
    this.history.push(records);
    if (this.history.length > 200) this.history.shift();
  }

  undo() {
    const records = this.history.pop();
    if (!records) return null;
    for (let i = records.length - 1; i >= 0; i--) this.marks[records[i].i] = records[i].from;
    this.refreshLines();
    this.emit({ type: 'cells', records: records.map((r) => ({ i: r.i, from: r.to, to: r.from })) });
    return records;
  }

  /** Reveal one cell the player has not solved yet. Costs 30 seconds. */
  hint() {
    if (this.status !== 'playing') return null;
    const candidates = [];
    for (let i = 0; i < this.marks.length; i++) {
      const truth = this.puzzle.grid[i];
      const want = truth === 1 ? FILL : CROSS;
      if (this.marks[i] !== want && !(truth === 0 && this.marks[i] === CROSS)) candidates.push(i);
    }
    if (!candidates.length) return null;
    // Prefer a filled cell — more satisfying and more useful.
    const filledOnes = candidates.filter((i) => this.puzzle.grid[i] === 1);
    const pool = filledOnes.length ? filledOnes : candidates;
    const i = pool[Math.floor(Math.random() * pool.length)];
    const from = this.marks[i];
    this.marks[i] = this.puzzle.grid[i] === 1 ? FILL : CROSS;
    this.hints++;
    this.elapsed += 30;
    const rec = { i, from, to: this.marks[i], hint: true };
    this.afterChange([rec]);
    this.emit({ type: 'hint', index: i });
    return rec;
  }

  reset() {
    this.marks.fill(EMPTY);
    this.mistakes = 0;
    this.hints = 0;
    this.elapsed = 0;
    this.status = 'playing';
    this.history = [];
    this.refreshLines();
    this.emit({ type: 'reset' });
  }

  serialize() {
    return {
      marks: Array.from(this.marks).join(''),
      mistakes: this.mistakes,
      hints: this.hints,
      elapsed: Math.round(this.elapsed),
      at: Date.now(),
      size: this.size,
    };
  }
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  }
  return `${m}:${String(rest).padStart(2, '0')}`;
}

export { clueSum };

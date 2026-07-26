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
   * Returns a change record, or null when nothing happened.
   */
  set(i, want) {
    if (this.status !== 'playing') return null;
    const from = this.marks[i];
    if (from === want) return null;
    const truth = this.puzzle.grid[i];

    if (this.settings.strict) {
      // In strict mode a filled cell is always correct, so it is permanent.
      // Crosses stay erasable.
      if (from === FILL) return null;
      const wrong = (want === FILL && truth === 0) || (want === CROSS && truth === 1);
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
    const touched = new Set();
    for (const rec of records) {
      touched.add('r' + Math.floor(rec.i / this.size));
      touched.add('c' + (rec.i % this.size));
    }
    const auto = [];
    for (const key of touched) {
      const n = Number(key.slice(1));
      if (key[0] === 'r') {
        const wasDone = this.rowDone[n];
        this.rowDone[n] = this.lineSatisfied(n, true) ? 1 : 0;
        if (this.rowDone[n] && !wasDone && this.settings.autoCross) auto.push(...this.crossRest(n, true));
      } else {
        const wasDone = this.colDone[n];
        this.colDone[n] = this.lineSatisfied(n, false) ? 1 : 0;
        if (this.colDone[n] && !wasDone && this.settings.autoCross) auto.push(...this.crossRest(n, false));
      }
    }
    if (auto.length) {
      // auto-crossing can complete the perpendicular lines too
      const more = new Set();
      for (const rec of auto) {
        more.add('r' + Math.floor(rec.i / this.size));
        more.add('c' + (rec.i % this.size));
      }
      for (const key of more) {
        const n = Number(key.slice(1));
        if (key[0] === 'r') this.rowDone[n] = this.lineSatisfied(n, true) ? 1 : 0;
        else this.colDone[n] = this.lineSatisfied(n, false) ? 1 : 0;
      }
      records.push(...auto);
    }
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

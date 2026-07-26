// Board rendering and pointer input (tap, drag-paint with axis lock, zoom).

import { EMPTY, FILL, CROSS } from './game.js';

const NUM_W = 0.74; // width of a clue number, in cell units
const MIN_CELL = 13;
const MAX_CELL = 54;

export class BoardView {
  constructor(root, game, settings) {
    this.root = root;          // scroll container
    this.game = game;
    this.settings = settings;
    this.size = game.size;
    this.mode = 'fill';
    this.zoom = 1;
    this.stroke = null;
    this.cellEls = [];
    this.rowClueEls = [];
    this.colClueEls = [];
    this.build();
    this.unsub = game.on((e) => this.onGameEvent(e));
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
  }

  destroy() {
    this.unsub?.();
    window.removeEventListener('resize', this.onResize);
    this.root.innerHTML = '';
  }

  build() {
    const { size, game } = this;
    const board = document.createElement('div');
    board.className = 'board';
    board.style.setProperty('--n', size);

    const corner = document.createElement('div');
    corner.className = 'b-corner';

    const cclues = document.createElement('div');
    cclues.className = 'b-cclues';
    for (let c = 0; c < size; c++) {
      const el = document.createElement('div');
      el.className = 'clue col' + (c % 5 === 0 && c ? ' sep' : '');
      el.innerHTML = game.puzzle.cols[c].map((n) => `<span>${n}</span>`).join('');
      cclues.appendChild(el);
      this.colClueEls.push(el);
    }

    const rclues = document.createElement('div');
    rclues.className = 'b-rclues';
    for (let r = 0; r < size; r++) {
      const el = document.createElement('div');
      el.className = 'clue row' + (r % 5 === 0 && r ? ' sep' : '');
      el.innerHTML = game.puzzle.rows[r].map((n) => `<span>${n}</span>`).join('');
      rclues.appendChild(el);
      this.rowClueEls.push(el);
    }

    const cells = document.createElement('div');
    cells.className = 'b-cells';
    const frag = document.createDocumentFragment();
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const el = document.createElement('div');
        let cls = 'cell';
        if (c % 5 === 0 && c) cls += ' sep-l';
        if (r % 5 === 0 && r) cls += ' sep-t';
        if (c === size - 1) cls += ' last-c';
        if (r === size - 1) cls += ' last-r';
        el.className = cls;
        frag.appendChild(el);
        this.cellEls.push(el);
      }
    }
    cells.appendChild(frag);

    const hlRow = document.createElement('div');
    hlRow.className = 'hl hl-row';
    const hlCol = document.createElement('div');
    hlCol.className = 'hl hl-col';
    cells.append(hlRow, hlCol);
    this.hlRow = hlRow;
    this.hlCol = hlCol;

    board.append(corner, cclues, rclues, cells);
    this.root.innerHTML = '';
    this.root.appendChild(board);
    this.board = board;
    this.cells = cells;

    cells.addEventListener('pointerdown', (e) => this.onDown(e));
    cells.addEventListener('pointermove', (e) => this.onMove(e));
    cells.addEventListener('pointerup', (e) => this.onUp(e));
    cells.addEventListener('pointercancel', (e) => this.onUp(e));
    cells.addEventListener('pointerleave', () => {
      if (!this.stroke) this.setCrosshair(null, null);
    });
    cells.addEventListener('contextmenu', (e) => e.preventDefault());

    this.refresh();
    this.layout();
  }

  layout() {
    const { size, game } = this;
    const rgUnits = Math.max(1, ...game.puzzle.rows.map((c) => c.length));
    const cgUnits = Math.max(1, ...game.puzzle.cols.map((c) => c.length));
    const style = getComputedStyle(this.root);
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const availW = Math.max(200, this.root.clientWidth - padX);
    const availH = Math.max(200, this.root.clientHeight - padY);
    const fitW = availW / (size + rgUnits * NUM_W);
    const fitH = availH / (size + cgUnits * NUM_W);
    const cap = size <= 5 ? 68 : size <= 10 ? 58 : MAX_CELL;
    let cell = Math.min(fitW, fitH) * this.zoom;
    cell = Math.max(MIN_CELL, Math.min(cap * Math.max(1, this.zoom), cell));
    this.cell = cell;
    const b = this.board.style;
    b.setProperty('--cell', cell + 'px');
    b.setProperty('--rg', rgUnits * NUM_W * cell + 'px');
    b.setProperty('--cg', cgUnits * NUM_W * cell + 'px');
    b.setProperty('--num', Math.max(8, cell * 0.5) + 'px');
  }

  setZoom(z) {
    this.zoom = Math.max(0.6, Math.min(3, z));
    this.layout();
  }

  setMode(mode) {
    this.mode = mode;
  }

  refresh() {
    for (let i = 0; i < this.cellEls.length; i++) this.paintCell(i);
    for (let r = 0; r < this.size; r++) this.rowClueEls[r].classList.toggle('done', !!this.game.rowDone[r]);
    for (let c = 0; c < this.size; c++) this.colClueEls[c].classList.toggle('done', !!this.game.colDone[c]);
  }

  paintCell(i) {
    const el = this.cellEls[i];
    const m = this.game.marks[i];
    el.classList.toggle('fill', m === FILL);
    el.classList.toggle('cross', m === CROSS);
  }

  onGameEvent(e) {
    if (e.type === 'cells') {
      const lines = new Set();
      for (const rec of e.records) {
        this.paintCell(rec.i);
        lines.add('r' + Math.floor(rec.i / this.size));
        lines.add('c' + (rec.i % this.size));
      }
      for (const key of lines) {
        const n = Number(key.slice(1));
        if (key[0] === 'r') this.rowClueEls[n].classList.toggle('done', !!this.game.rowDone[n]);
        else this.colClueEls[n].classList.toggle('done', !!this.game.colDone[n]);
      }
    } else if (e.type === 'mistake') {
      const el = this.cellEls[e.index];
      el.classList.remove('wrong');
      void el.offsetWidth;
      el.classList.add('wrong');
      if (this.settings.vibrate && navigator.vibrate) navigator.vibrate(60);
    } else if (e.type === 'hint') {
      const el = this.cellEls[e.index];
      el.classList.remove('hinted');
      void el.offsetWidth;
      el.classList.add('hinted');
    } else if (e.type === 'reset') {
      this.refresh();
    }
  }

  pos(e) {
    const rect = this.cells.getBoundingClientRect();
    const c = Math.floor((e.clientX - rect.left) / this.cell);
    const r = Math.floor((e.clientY - rect.top) / this.cell);
    if (r < 0 || c < 0 || r >= this.size || c >= this.size) return null;
    return { r, c };
  }

  setCrosshair(r, c) {
    if (!this.settings.crosshair || r === null) {
      this.hlRow.style.display = 'none';
      this.hlCol.style.display = 'none';
      return;
    }
    this.hlRow.style.display = 'block';
    this.hlCol.style.display = 'block';
    this.hlRow.style.transform = `translateY(${r * this.cell}px)`;
    this.hlCol.style.transform = `translateX(${c * this.cell}px)`;
  }

  onDown(e) {
    if (this.game.status !== 'playing') return;
    const p = this.pos(e);
    if (!p) return;
    e.preventDefault();
    this.cells.setPointerCapture(e.pointerId);
    const secondary = e.button === 2 || e.ctrlKey;
    const mode = secondary ? (this.mode === 'fill' ? 'cross' : 'fill') : this.mode;
    const i = p.r * this.size + p.c;
    const cur = this.game.marks[i];
    let paint;
    if (mode === 'fill') paint = cur === FILL ? EMPTY : FILL;
    else paint = cur === CROSS ? EMPTY : CROSS;
    this.stroke = { paint, startR: p.r, startC: p.c, lastR: p.r, lastC: p.c, axis: null, records: [] };
    this.apply(p.r, p.c);
    this.setCrosshair(p.r, p.c);
  }

  onMove(e) {
    if (!this.stroke) {
      if (e.pointerType === 'mouse') {
        const p = this.pos(e);
        this.setCrosshair(p ? p.r : null, p ? p.c : null);
      }
      return;
    }
    const rect = this.cells.getBoundingClientRect();
    let c = Math.floor((e.clientX - rect.left) / this.cell);
    let r = Math.floor((e.clientY - rect.top) / this.cell);
    r = Math.max(0, Math.min(this.size - 1, r));
    c = Math.max(0, Math.min(this.size - 1, c));
    const s = this.stroke;
    if (!s.axis && (r !== s.startR || c !== s.startC)) {
      const dr = Math.abs(r - s.startR);
      const dc = Math.abs(c - s.startC);
      s.axis = dc >= dr ? 'row' : 'col';
    }
    if (s.axis === 'row') r = s.startR;
    else if (s.axis === 'col') c = s.startC;
    if (r === s.lastR && c === s.lastC) return;
    // fill in every cell between the last position and this one
    const stepR = Math.sign(r - s.lastR);
    const stepC = Math.sign(c - s.lastC);
    let cr = s.lastR;
    let cc = s.lastC;
    while (cr !== r || cc !== c) {
      if (cr !== r) cr += stepR;
      if (cc !== c) cc += stepC;
      this.apply(cr, cc);
    }
    s.lastR = r;
    s.lastC = c;
    this.setCrosshair(r, c);
  }

  apply(r, c) {
    const i = r * this.size + c;
    const rec = this.game.set(i, this.stroke.paint);
    if (rec) this.stroke.records.push(rec);
  }

  onUp(e) {
    if (!this.stroke) return;
    try {
      this.cells.releasePointerCapture(e.pointerId);
    } catch { /* pointer already released */ }
    if (this.stroke.records.length) this.game.pushHistory(this.stroke.records);
    this.stroke = null;
    if (e.pointerType !== 'mouse') this.setCrosshair(null, null);
    this.onStrokeEnd?.();
  }

  /** Small canvas rendering of the finished picture, for the win screen. */
  static renderPicture(puzzle, px = 12) {
    const { size, grid } = puzzle;
    const canvas = document.createElement('canvas');
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = size * px * dpr;
    canvas.height = size * px * dpr;
    canvas.style.width = size * px + 'px';
    canvas.style.height = size * px + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const css = getComputedStyle(document.documentElement);
    ctx.fillStyle = css.getPropertyValue('--pic-bg').trim() || '#fff';
    ctx.fillRect(0, 0, size * px, size * px);
    ctx.fillStyle = css.getPropertyValue('--pic-fg').trim() || '#243b53';
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid[r * size + c]) ctx.fillRect(c * px, r * px, px, px);
      }
    }
    return canvas;
  }
}

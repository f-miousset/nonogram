// Screens, routing and glue.

import { PACKS, ART, getPuzzle, levelId, dailyId, todayKey, packBySize } from './puzzles.js';
import { Game, formatTime } from './game.js';
import { BoardView } from './board.js';
import * as store from './storage.js';

const app = document.getElementById('app');
const overlayEl = document.getElementById('overlay');

const ICONS = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M4 9h9a5 5 0 010 10h-3"/><path d="M4 9l4-4M4 9l4 4"/></svg>',
  bulb: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 00-3.6 10.8c.5.4.8 1 .9 1.7l.1.5h5.2l.1-.5c.1-.7.4-1.3.9-1.7A6 6 0 0012 3z"/></svg>',
  restart: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 11-2.6-5.9"/><path d="M20 4v5h-5"/></svg>',
  cog: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 14.5a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2v.2a2 2 0 11-4 0v-.1a1.7 1.7 0 00-2.9-1.2l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00-1.2-2.9H3a2 2 0 110-4h.1a1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 002.9-1.2V3a2 2 0 114 0v.1a1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 001.2 2.9H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>',
  help: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.6 2.6 0 015 .8c0 1.7-2.5 2.2-2.5 3.7"/><path d="M12 17.2v.2"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5l10 6.5-10 6.5z"/></svg>',
  dice: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r="1.2"/><circle cx="15" cy="15" r="1.2"/><circle cx="15" cy="9" r="1.2"/><circle cx="9" cy="15" r="1.2"/></svg>',
  calendar: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5.5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3.5v4M16 3.5v4"/></svg>',
  zoomIn: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M11 8.5v5M8.5 11h5M20 20l-4.2-4.2"/></svg>',
  zoomOut: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M8.5 11h5M20 20l-4.2-4.2"/></svg>',
};

const html = (strings, ...values) => strings.reduce((acc, s, i) => acc + s + (values[i] ?? ''), '');

function node(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

let settings = store.getSettings();
let session = null; // active game screen state
let deferredInstall = null;

// ---------------------------------------------------------------------------
// Theme

function applyTheme() {
  document.documentElement.dataset.theme = settings.theme;
}

// ---------------------------------------------------------------------------
// Level helpers

function levelState(size, index) {
  const id = levelId(size, index);
  const prog = store.getProgress(id);
  const done = !!prog?.done;
  const unlocked = index === 0 || !!store.getProgress(levelId(size, index - 1))?.done;
  return { id, done, unlocked, best: prog?.best, saved: !!store.getSave(id) };
}

function packStats(pack) {
  let done = 0;
  let next = 0;
  for (let i = 0; i < pack.count; i++) {
    if (store.getProgress(levelId(pack.size, i))?.done) {
      done++;
      next = Math.min(pack.count - 1, i + 1);
    }
  }
  return { done, next };
}

function puzzleTitle(puzzle) {
  const parts = puzzle.id.split(':');
  if (parts[0] === 'p') return `${packBySize(puzzle.size)?.name ?? ''} · Level ${Number(parts[2]) + 1}`;
  if (parts[0] === 'd') return `Daily · ${parts[1]}`;
  return `Random ${puzzle.size}×${puzzle.size}`;
}

// ---------------------------------------------------------------------------
// Screens

function screenHome() {
  const last = store.lastSave();
  const stats = store.getStats();
  const daily = dailyId();
  const dailyDone = !!store.getProgress(daily)?.done;

  const packCards = PACKS.map((p) => {
    const { done } = packStats(p);
    const pct = Math.round((done / p.count) * 100);
    return html`
      <a class="card pack" href="#/pack/${p.size}">
        <div class="pack-grid" aria-hidden="true">${miniGrid(p.size)}</div>
        <div class="pack-text">
          <h3>${p.name}</h3>
          <p>${p.blurb}</p>
          <div class="meter"><i style="width:${pct}%"></i></div>
          <span class="muted small">${done} / ${p.count} solved</span>
        </div>
      </a>`;
  }).join('');

  const el = node(html`
    <div class="screen home">
      <header class="hero">
        <h1>Nonogram</h1>
        <p>Picture cross puzzles. Fully offline.</p>
      </header>
      ${last
        ? html`<a class="card row primary" href="#/play/${encodeURIComponent(last.id)}">
            <span class="ico">${ICONS.play}</span>
            <span class="grow"><b>Continue</b><small>${esc(puzzleTitle(getPuzzle(last.id)))} · ${formatTime(last.save.elapsed || 0)}</small></span>
          </a>`
        : ''}
      <div class="quick">
        <a class="card row" href="#/play/${encodeURIComponent(daily)}">
          <span class="ico">${ICONS.calendar}</span>
          <span class="grow"><b>Daily puzzle</b><small>${todayKey()}${dailyDone ? ' · solved' : ''}</small></span>
          ${dailyDone ? `<span class="tick">${ICONS.check}</span>` : ''}
        </a>
        <button class="card row" id="random-btn">
          <span class="ico">${ICONS.dice}</span>
          <span class="grow"><b>Random puzzle</b><small>Endless, freshly generated</small></span>
        </button>
      </div>
      <h2 class="section">Packs</h2>
      <div class="packs">${packCards}</div>
      <div class="foot">
        <a class="btn ghost" href="#/help">${ICONS.help}<span>How to play</span></a>
        <a class="btn ghost" href="#/settings">${ICONS.cog}<span>Settings</span></a>
      </div>
      <p class="muted small center">${stats.solved} puzzles solved · ${formatTime(stats.time)} played</p>
      <button class="btn install" id="install-btn" hidden>Install app</button>
    </div>`);

  el.querySelector('#random-btn').addEventListener('click', () => askRandom());

  const install = el.querySelector('#install-btn');
  if (deferredInstall) {
    install.hidden = false;
    install.addEventListener('click', async () => {
      install.hidden = true;
      deferredInstall.prompt();
      await deferredInstall.userChoice;
      deferredInstall = null;
    });
  }
  return el;
}

// One little 5×5 picture per pack, so the cards are telling them apart at a glance.
const PACK_THUMBS = {
  5: ['.#.#.', '#####', '#####', '.###.', '..#..'],       // heart
  10: ['..#..', '.###.', '#####', '..#..', '.###.'],      // tree
  15: ['..###', '..#.#', '..#..', '###..', '##...'],      // note
  20: ['#.#.#', '#####', '..#..', '..#..', '.###.'],      // cactus
};

function miniGrid(size) {
  const rows = PACK_THUMBS[size] || PACK_THUMBS[5];
  return rows.map((row) => [...row].map((ch) => `<i class="${ch === '#' ? 'on' : ''}"></i>`).join('')).join('');
}

function askRandom() {
  showOverlay(html`
    <div class="sheet">
      <h2>Random puzzle</h2>
      <p class="muted">Pick a size — every puzzle is solvable with logic alone.</p>
      <div class="choices">
        ${PACKS.map((p) => `<button class="btn choice" data-size="${p.size}">${p.size} × ${p.size}<small>${p.name}</small></button>`).join('')}
      </div>
      <button class="btn ghost wide" data-close>Cancel</button>
    </div>`,
    (root) => {
      root.querySelectorAll('[data-size]').forEach((b) =>
        b.addEventListener('click', () => {
          const size = Number(b.dataset.size);
          const seed = (Math.random() * 0xffffffff) >>> 0;
          hideOverlay();
          location.hash = `#/play/${encodeURIComponent(`r:${size}:${seed}`)}`;
        })
      );
    });
}

function screenPack(size) {
  const pack = packBySize(size);
  if (!pack) return screenHome();
  const { done } = packStats(pack);
  const items = [];
  for (let i = 0; i < pack.count; i++) {
    const st = levelState(size, i);
    const name = ART[size]?.[i]?.name;
    if (st.unlocked) {
      // The picture is the reward, so names only show up once the level is solved.
      items.push(html`
        <a class="level ${st.done ? 'done' : ''} ${st.saved ? 'saved' : ''}" href="#/play/${encodeURIComponent(st.id)}">
          <span class="num">${i + 1}</span>
          ${st.done
            ? `<span class="tick">${ICONS.check}</span><small>${name ? esc(name) : formatTime(st.best || 0)}</small>`
            : '<small>&nbsp;</small>'}
        </a>`);
    } else {
      items.push(html`<div class="level locked"><span class="num">${i + 1}</span><span class="lock">${ICONS.lock}</span></div>`);
    }
  }
  const el = node(html`
    <div class="screen pack-screen">
      <header class="bar">
        <a class="icon-btn" href="#/">${ICONS.back}</a>
        <div class="bar-title"><b>${pack.name}</b><small>${pack.blurb} · ${done}/${pack.count}</small></div>
        <button class="icon-btn" id="rand">${ICONS.dice}</button>
      </header>
      <div class="levels">${items.join('')}</div>
    </div>`);
  el.querySelector('#rand').addEventListener('click', () => {
    const seed = (Math.random() * 0xffffffff) >>> 0;
    location.hash = `#/play/${encodeURIComponent(`r:${size}:${seed}`)}`;
  });
  return el;
}

function screenHelp() {
  return node(html`
    <div class="screen text-screen">
      <header class="bar">
        <a class="icon-btn" href="#/">${ICONS.back}</a>
        <div class="bar-title"><b>How to play</b></div>
        <span class="icon-btn ghost"></span>
      </header>
      <div class="prose">
        <p>The numbers next to each row and column tell you how many cells in a row are filled, in order. <b>3 1</b> means a block of three, at least one gap, then a single cell.</p>
        <h3>Controls</h3>
        <ul>
          <li>Tap a cell to fill it. Drag to paint a whole run.</li>
          <li>Switch the toolbar toggle to <b>✕</b> to mark cells you know are empty. On a desktop, right-click does the same thing.</li>
          <li>Drags lock to a single row or column, so long runs stay straight. Only the cell you press down on can cost a life — if the drag runs past where it should stop, it simply stops, no penalty.</li>
          <li>Clue numbers grey out one by one as you pin their block down from either end of the line.</li>
          <li>Undo takes back your last stroke. A hint reveals one cell and adds 30 seconds.</li>
          <li>Keyboard: <b>X</b> switches mode, <b>Z</b> undoes, <b>H</b> hints, <b>+</b> and <b>−</b> zoom.</li>
        </ul>
        <h3>Mistakes</h3>
        <p>In the default <b>strict mode</b> a wrong mark costs a life and the true cell is revealed. Lose three and the puzzle restarts. Turn strict mode off in settings if you would rather play without the pressure — you can then erase anything and check the result yourself.</p>
        <h3>No guessing</h3>
        <p>Every puzzle here is verified to be solvable by logic alone before it is handed to you. If you are stuck, there is always a line you can reason about.</p>
      </div>
    </div>`);
}

function screenSettings() {
  const rows = [
    ['strict', 'Strict mode', 'Wrong marks cost a life and reveal the cell'],
    ['autoCross', 'Auto-cross finished lines', 'Cross off the rest of a line once its clues are met'],
    ['crosshair', 'Row & column highlight', 'Highlight the line you are pointing at'],
    ['vibrate', 'Vibrate on mistakes', 'Short buzz on supported devices'],
  ];
  const el = node(html`
    <div class="screen text-screen">
      <header class="bar">
        <a class="icon-btn" href="#/">${ICONS.back}</a>
        <div class="bar-title"><b>Settings</b></div>
        <span class="icon-btn ghost"></span>
      </header>
      <div class="settings">
        ${rows.map(([key, label, hintText]) => html`
          <label class="setting">
            <span><b>${label}</b><small>${hintText}</small></span>
            <input type="checkbox" data-key="${key}" ${settings[key] ? 'checked' : ''}>
            <i class="switch"></i>
          </label>`).join('')}
        <div class="setting">
          <span><b>Theme</b><small>Follows your system by default</small></span>
          <select id="theme">
            ${['auto', 'light', 'dark'].map((t) => `<option value="${t}" ${settings.theme === t ? 'selected' : ''}>${t[0].toUpperCase() + t.slice(1)}</option>`).join('')}
          </select>
        </div>
        <button class="btn danger wide" id="reset">Reset all progress</button>
        <p class="muted small center">Everything is stored on this device only.</p>
      </div>
    </div>`);

  el.querySelectorAll('input[data-key]').forEach((input) =>
    input.addEventListener('change', () => {
      settings[input.dataset.key] = input.checked;
      store.setSetting(input.dataset.key, input.checked);
    })
  );
  el.querySelector('#theme').addEventListener('change', (e) => {
    settings.theme = e.target.value;
    store.setSetting('theme', e.target.value);
    applyTheme();
  });
  el.querySelector('#reset').addEventListener('click', () => {
    showOverlay(html`
      <div class="sheet">
        <h2>Reset everything?</h2>
        <p class="muted">Solved levels, best times and saved boards will be deleted. This cannot be undone.</p>
        <button class="btn danger wide" id="yes">Delete my progress</button>
        <button class="btn ghost wide" data-close>Keep it</button>
      </div>`,
      (root) => root.querySelector('#yes').addEventListener('click', () => {
        store.resetAll();
        settings = store.getSettings();
        applyTheme();
        hideOverlay();
        location.hash = '#/';
      })
    );
  });
  return el;
}

// ---------------------------------------------------------------------------
// Game screen

function screenGame(id) {
  let puzzle;
  try {
    puzzle = getPuzzle(id);
  } catch {
    location.hash = '#/';
    return node('<div class="screen"></div>');
  }
  const saved = store.getSave(id);
  const game = new Game(puzzle, settings, saved && saved.size === puzzle.size ? { ...saved, marks: saved.marks } : null);

  const el = node(html`
    <div class="screen game">
      <header class="bar">
        <a class="icon-btn" href="${backHref(id)}">${ICONS.back}</a>
        <div class="bar-title"><b>${esc(puzzleTitle(puzzle))}</b><small class="progress"></small></div>
        <div class="status">
          <span class="timer">0:00</span>
          <span class="lives"></span>
        </div>
      </header>
      <div class="board-area" id="board"></div>
      <div class="toolbar">
        <button class="icon-btn" id="undo" title="Undo">${ICONS.undo}</button>
        <button class="icon-btn" id="zoom-out" title="Zoom out">${ICONS.zoomOut}</button>
        <div class="mode-toggle" id="mode">
          <button class="active" data-mode="fill"><i class="swatch fill"></i></button>
          <button data-mode="cross"><i class="swatch cross"></i></button>
        </div>
        <button class="icon-btn" id="zoom-in" title="Zoom in">${ICONS.zoomIn}</button>
        <button class="icon-btn" id="hint" title="Hint (+30s)">${ICONS.bulb}</button>
        <button class="icon-btn" id="restart" title="Restart">${ICONS.restart}</button>
      </div>
    </div>`);

  const boardRoot = el.querySelector('#board');
  const timerEl = el.querySelector('.timer');
  const livesEl = el.querySelector('.lives');
  const progressEl = el.querySelector('.progress');

  // The board needs its real size, so build it after the screen is in the DOM.
  const view = new BoardView(boardRoot, game, settings);
  session = { id, game, view, ticker: null };

  const renderStatus = () => {
    timerEl.textContent = formatTime(game.elapsed);
    if (settings.strict && settings.lives) {
      const left = Math.max(0, settings.lives - game.mistakes);
      livesEl.innerHTML = Array.from({ length: settings.lives }, (_, i) =>
        `<i class="heart ${i < left ? '' : 'lost'}"></i>`).join('');
    } else {
      livesEl.innerHTML = '';
    }
    progressEl.textContent = `${game.filledCount()} / ${game.targetCount()} cells`;
  };
  renderStatus();

  const save = () => {
    if (game.status === 'playing') store.putSave(id, game.serialize());
  };

  view.onStrokeEnd = () => {
    renderStatus();
    save();
  };

  session.ticker = setInterval(() => {
    if (game.status !== 'playing' || document.hidden) return;
    game.elapsed += 1;
    timerEl.textContent = formatTime(game.elapsed);
    if (game.elapsed % 10 === 0) save();
  }, 1000);

  game.on((e) => {
    if (e.type === 'won') {
      clearInterval(session.ticker);
      const isBest = store.recordWin(id, Math.round(game.elapsed));
      renderStatus();
      setTimeout(() => showWin(id, puzzle, game, isBest), 320);
    } else if (e.type === 'lost') {
      clearInterval(session.ticker);
      renderStatus();
      setTimeout(() => showLost(id, game, view), 400);
    } else {
      renderStatus();
    }
  });

  el.querySelector('#undo').addEventListener('click', () => {
    game.undo();
    renderStatus();
    save();
  });
  el.querySelector('#hint').addEventListener('click', () => {
    game.hint();
    renderStatus();
    save();
  });
  el.querySelector('#zoom-in').addEventListener('click', () => view.setZoom(view.zoom * 1.25));
  el.querySelector('#zoom-out').addEventListener('click', () => view.setZoom(view.zoom / 1.25));
  el.querySelector('#restart').addEventListener('click', () => {
    showOverlay(html`
      <div class="sheet">
        <h2>Restart puzzle?</h2>
        <p class="muted">The board, the timer and your mistakes are cleared.</p>
        <button class="btn primary wide" id="yes">Restart</button>
        <button class="btn ghost wide" data-close>Cancel</button>
      </div>`,
      (root) => root.querySelector('#yes').addEventListener('click', () => {
        game.reset();
        store.clearSave(id);
        renderStatus();
        clearInterval(session.ticker);
        session.ticker = setInterval(() => {
          if (game.status !== 'playing' || document.hidden) return;
          game.elapsed += 1;
          timerEl.textContent = formatTime(game.elapsed);
        }, 1000);
        hideOverlay();
      })
    );
  });

  const modeEl = el.querySelector('#mode');
  const selectMode = (mode) => {
    modeEl.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    view.setMode(mode);
  };
  modeEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mode]');
    if (btn) selectMode(btn.dataset.mode);
  });

  // Desktop shortcuts.
  session.onKey = (e) => {
    if (e.metaKey || e.altKey || !overlayEl.hidden) return;
    const key = e.key.toLowerCase();
    if (key === 'z' || key === 'u') { game.undo(); renderStatus(); save(); }
    else if (key === 'x') selectMode(view.mode === 'cross' ? 'fill' : 'cross');
    else if (key === 'h') { game.hint(); renderStatus(); save(); }
    else if (key === '+' || key === '=') view.setZoom(view.zoom * 1.25);
    else if (key === '-') view.setZoom(view.zoom / 1.25);
    else return;
    e.preventDefault();
  };
  window.addEventListener('keydown', session.onKey);

  return el;
}

function backHref(id) {
  const parts = id.split(':');
  return parts[0] === 'p' ? `#/pack/${parts[1]}` : '#/';
}

function nextLevelId(id) {
  const parts = id.split(':');
  if (parts[0] !== 'p') return null;
  const size = Number(parts[1]);
  const index = Number(parts[2]) + 1;
  const pack = packBySize(size);
  return pack && index < pack.count ? levelId(size, index) : null;
}

function showWin(id, puzzle, game, isBest) {
  const best = store.getProgress(id)?.best;
  const next = nextLevelId(id);
  showOverlay(html`
    <div class="sheet win">
      <div class="confetti">${Array.from({ length: 14 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>
      <h2>Solved!</h2>
      <div class="picture" id="pic"></div>
      <p class="pic-name">${esc(puzzle.name)}</p>
      <div class="win-stats">
        <div><b>${formatTime(game.elapsed)}</b><small>time</small></div>
        <div><b>${formatTime(best || game.elapsed)}</b><small>best</small></div>
        <div><b>${game.mistakes}</b><small>mistakes</small></div>
      </div>
      ${isBest ? '<p class="badge">New best time</p>' : ''}
      ${next ? `<button class="btn primary wide" id="next">Next level</button>` : ''}
      <button class="btn ghost wide" id="leave">Back to levels</button>
    </div>`,
    (root) => {
      const px = Math.max(6, Math.min(14, Math.floor(220 / puzzle.size)));
      root.querySelector('#pic').appendChild(BoardView.renderPicture(puzzle, px));
      root.querySelector('#next')?.addEventListener('click', () => {
        hideOverlay();
        location.hash = `#/play/${encodeURIComponent(next)}`;
      });
      root.querySelector('#leave').addEventListener('click', () => {
        hideOverlay();
        location.hash = backHref(id);
      });
    },
    { dismissable: false }
  );
}

function showLost(id, game, view) {
  showOverlay(html`
    <div class="sheet">
      <h2>Out of lives</h2>
      <p class="muted">Three wrong marks. Take another run at it — the picture stays the same.</p>
      <button class="btn primary wide" id="retry">Try again</button>
      <button class="btn ghost wide" id="leave">Back to levels</button>
    </div>`,
    (root) => {
      root.querySelector('#retry').addEventListener('click', () => {
        game.reset();
        store.clearSave(id);
        hideOverlay();
        // restart the clock
        clearInterval(session.ticker);
        session.ticker = setInterval(() => {
          if (game.status !== 'playing' || document.hidden) return;
          game.elapsed += 1;
          document.querySelector('.timer').textContent = formatTime(game.elapsed);
        }, 1000);
        document.querySelector('.timer').textContent = formatTime(0);
        document.querySelectorAll('.heart').forEach((h) => h.classList.remove('lost'));
        view.refresh();
      });
      root.querySelector('#leave').addEventListener('click', () => {
        hideOverlay();
        location.hash = backHref(id);
      });
    },
    { dismissable: false }
  );
}

// ---------------------------------------------------------------------------
// Overlay

let overlayClose = null;

function showOverlay(markup, wire, opts = {}) {
  overlayEl.innerHTML = '';
  const inner = node(markup);
  overlayEl.appendChild(inner);
  overlayEl.hidden = false;
  requestAnimationFrame(() => overlayEl.classList.add('open'));
  overlayEl.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', hideOverlay));
  overlayClose = opts.dismissable === false ? null : hideOverlay;
  wire?.(inner);
}

function hideOverlay() {
  overlayEl.classList.remove('open');
  overlayClose = null;
  setTimeout(() => {
    overlayEl.hidden = true;
    overlayEl.innerHTML = '';
  }, 180);
}

overlayEl.addEventListener('click', (e) => {
  if (e.target === overlayEl && overlayClose) overlayClose();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && overlayClose) overlayClose();
});

// ---------------------------------------------------------------------------
// Router

function teardown() {
  if (session) {
    if (session.game.status === 'playing') store.putSave(session.id, session.game.serialize());
    clearInterval(session.ticker);
    if (session.onKey) window.removeEventListener('keydown', session.onKey);
    session.view.destroy();
    session = null;
  }
  if (!overlayEl.hidden) hideOverlay();
}

function route() {
  teardown();
  const path = (location.hash || '#/').slice(1);
  const [, seg, arg] = path.split('/');
  let screen;
  if (seg === 'pack') screen = screenPack(Number(arg));
  else if (seg === 'play') screen = screenGame(decodeURIComponent(arg || ''));
  else if (seg === 'help') screen = screenHelp();
  else if (seg === 'settings') screen = screenSettings();
  else screen = screenHome();
  app.innerHTML = '';
  app.appendChild(screen);
  window.scrollTo(0, 0);
  if (session) session.view.layout();
}

window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', () => {
  if (session && session.game.status === 'playing') store.putSave(session.id, session.game.serialize());
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && session && session.game.status === 'playing') {
    store.putSave(session.id, session.game.serialize());
  }
});
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  const btn = document.getElementById('install-btn');
  if (btn) btn.hidden = false;
});

applyTheme();
route();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* offline support is a bonus; the game runs regardless */
    });
  });
}

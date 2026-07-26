# Nonogram

An offline-first nonogram (picture cross / griddler) PWA, in the spirit of nonogram.com.
Vanilla JS, no build step, no dependencies, no network calls — install it once and it
works on a plane.

<img src="icons/icon-192.png" width="96" alt="">

## Play

```bash
npm start
```

Then open <http://localhost:8123>. Any static file server works — the app is plain
ES modules, CSS and PNGs. Service workers need `http://localhost` or HTTPS, so opening
`index.html` from the filesystem will run the game but skip offline caching.

To install it as an app, use "Install" / "Add to Home Screen" in the browser.

## What's in it

- **Four packs** — 5×5, 10×10, 15×15 and 20×20 — plus a daily puzzle and endless random ones.
- **Hand-drawn pixel art** for the first levels of the Easy and Medium packs; everything
  beyond that is generated on the fly from the level id, so 130 levels cost no storage.
- **Every puzzle is fair.** Generated grids are accepted only if a line solver can finish
  them with no guessing, and the hand-drawn ones are checked by `npm run verify`.
- **Strict mode** (default, like the original): a wrong mark costs a life and reveals the
  true cell. Lives are settable to one, three, five or unlimited, and strict mode can be
  turned off entirely for a relaxed, fully erasable board.
- **Forgiving drags** (settings toggle, on by default). Only the cell you press down on can
  cost a life; if the drag runs past where it should stop, it just stops. Overshooting with
  a clumsy finger is free. Turn it off to have every cell a drag touches count.
- **Per-number clue dimming.** Each number greys out as soon as its block is pinned down
  from either end of the line — computed from your marks and the printed clues alone, so
  it can never hand you a deduction you had not already made.
- Drag-to-paint with row/column axis lock, auto-cross of finished lines, crosshair
  highlight, undo, hints, zoom, best times, autosave, light/dark theme.

## How it works

| File | Role |
| --- | --- |
| `js/nonogram.js` | Clues, the line solver, and puzzle generation |
| `js/puzzles.js` | Hand-drawn art, pack definitions, id → puzzle |
| `js/game.js` | One puzzle in progress: marks, lives, timer, undo, win check |
| `js/board.js` | Board DOM, sizing, pointer input |
| `js/app.js` | Screens and routing |
| `js/storage.js` | localStorage: settings, progress, saved boards |
| `js/haptics.js` | Mistake buzz, including the iOS 17.4+ workaround |
| `sw.js` | Precaches every asset; cache-first with background refresh |

### The solver

Each line is turned into a small automaton: gap states between blocks, one state per cell
of each block. Running it forward over the known cells and backward from the accepting
states gives, for every cell, whether it can be filled, blank, or only one of the two —
which is exactly the set of deductions a human can make from that line alone. Iterating
rows and columns to a fixpoint solves the puzzle, or proves it needs a guess.

Generation is: random noise → cellular-automaton smoothing (turns noise into blob shapes
that read as pictures) → keep it only if the solver finishes it. Seeded by the level id,
so `p:15:7` is the same puzzle on every device, forever.

## Scripts

```bash
npm run verify   # check every hand-drawn and generated puzzle is solvable without guessing
npm run icons    # regenerate the PNG icons (dependency-free PNG encoder)
```

## License

MIT

// Hand-drawn pixel art for the first levels of each pack, plus an endless
// supply of generated puzzles. Every puzzle is reproducible from its id.

import { mulberry32, hashString } from './rng.js';
import { computeClues, generateGrid, isFairPuzzle } from './nonogram.js';

const art = (name, rows) => ({ name, rows });

export const ART = {
  5: [
    art('Heart', ['.#.#.', '#####', '#####', '.###.', '..#..']),
    art('Diamond', ['..#..', '.###.', '#####', '.###.', '..#..']),
    art('Plus', ['..#..', '..#..', '#####', '..#..', '..#..']),
    art('House', ['..#..', '.###.', '#####', '#.#.#', '#####']),
    art('Tree', ['..#..', '.###.', '#####', '..#..', '.###.']),
    art('Arrow', ['..#..', '.###.', '#.#.#', '..#..', '..#..']),
    art('Fish', ['..#..', '.####', '#####', '.####', '..#..']),
    art('Rocket', ['..#..', '.###.', '.###.', '#####', '#.#.#']),
    art('Note', ['..###', '..#.#', '..#..', '###..', '##...']),
    art('Key', ['.###.', '.#.#.', '.###.', '..#..', '..##.']),
    art('Boat', ['..#..', '.##..', '####.', '#####', '.###.']),
    art('Cup', ['#####', '#...#', '#...#', '.###.', '..#..']),
    art('Duck', ['.##..', '###..', '.#...', '.###.', '#####']),
    art('Umbrella', ['.###.', '#####', '..#..', '..#..', '.##..']),
    art('Snowman', ['.###.', '.#.#.', '.###.', '#####', '.###.']),
    art('Flag', ['#####', '#####', '#....', '#....', '#....']),
    art('Cactus', ['#.#.#', '#####', '..#..', '..#..', '.###.']),
    art('Anchor', ['..#..', '.###.', '..#..', '#.#.#', '.###.']),
  ],
  10: [
    art('Heart', [
      '..##..##..',
      '.########.',
      '##########',
      '##########',
      '##########',
      '.########.',
      '.########.',
      '..######..',
      '...####...',
      '....##....',
    ]),
    art('Cat', [
      '.#......#.',
      '.##....##.',
      '.########.',
      '##########',
      '##.####.##',
      '##########',
      '####..####',
      '.########.',
      '..######..',
      '...####...',
    ]),
    art('Invader', [
      '..#....#..',
      '...#..#...',
      '..######..',
      '.##.##.##.',
      '##########',
      '#.######.#',
      '#.#....#.#',
      '#.#....#.#',
      '...##.##..',
      '..##..##..',
    ]),
    art('Mushroom', [
      '...####...',
      '.########.',
      '##########',
      '##########',
      '##.####.##',
      '.########.',
      '...####...',
      '...#..#...',
      '...####...',
      '..######..',
    ]),
    art('Sailboat', [
      '....#.....',
      '....##....',
      '....###...',
      '....####..',
      '....#####.',
      '....######',
      '##########',
      '.########.',
      '..######..',
      '...####...',
    ]),
    art('Ghost', [
      '...####...',
      '..######..',
      '.########.',
      '.##.##.##.',
      '.########.',
      '.########.',
      '.########.',
      '.########.',
      '.########.',
      '.#.##.##.#',
    ]),
  ],
};

export const PACKS = [
  { id: '5', size: 5, name: 'Easy', blurb: '5 × 5', count: 40 },
  { id: '10', size: 10, name: 'Medium', blurb: '10 × 10', count: 40 },
  { id: '15', size: 15, name: 'Hard', blurb: '15 × 15', count: 30 },
  { id: '20', size: 20, name: 'Expert', blurb: '20 × 20', count: 20 },
];

export function packBySize(size) {
  return PACKS.find((p) => p.size === size);
}

export function levelId(size, index) {
  return `p:${size}:${index}`;
}

function gridFromArt(rows) {
  const size = rows.length;
  const grid = new Uint8Array(size * size);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) grid[r * size + c] = rows[r][c] === '#' ? 1 : 0;
  }
  return grid;
}

function fromArt(entry, id, size) {
  const grid = gridFromArt(entry.rows);
  const { rows, cols } = computeClues(grid, size);
  return { id, size, name: entry.name, grid, rows, cols, fair: isFairPuzzle(grid, rows, cols, size) };
}

function generated(id, size, seed, name) {
  const rng = mulberry32(seed);
  const { grid, rows, cols } = generateGrid(size, rng);
  return { id, size, name, grid, rows, cols, fair: true };
}

const cache = new Map();

/**
 * Build the puzzle for an id. Supported ids:
 *   p:<size>:<index>   level from a pack
 *   r:<size>:<seed>    random puzzle
 *   d:<YYYY-MM-DD>     daily puzzle
 */
export function getPuzzle(id) {
  if (cache.has(id)) return cache.get(id);
  const parts = id.split(':');
  let puzzle;
  if (parts[0] === 'p') {
    const size = Number(parts[1]);
    const index = Number(parts[2]);
    const list = ART[size] || [];
    if (index < list.length) {
      puzzle = fromArt(list[index], id, size);
      if (!puzzle.fair) puzzle = generated(id, size, hashString(id), `Level ${index + 1}`);
    } else {
      puzzle = generated(id, size, hashString(id), `Level ${index + 1}`);
    }
  } else if (parts[0] === 'r') {
    const size = Number(parts[1]);
    puzzle = generated(id, size, Number(parts[2]) >>> 0, 'Random');
  } else if (parts[0] === 'd') {
    const date = parts[1];
    const size = [10, 10, 15, 10, 15, 15, 20][new Date(date + 'T12:00:00').getDay()] || 10;
    puzzle = generated(id, size, hashString('daily-' + date), 'Daily');
  } else {
    throw new Error('Unknown puzzle id: ' + id);
  }
  cache.set(id, puzzle);
  return puzzle;
}

export function todayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dailyId(d = new Date()) {
  return `d:${todayKey(d)}`;
}

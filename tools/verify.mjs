// Sanity checks: every hand-drawn puzzle must be solvable by logic alone, and
// generating a level for each pack must be fast enough to feel instant.
// Run with:  node tools/verify.mjs
import { ART, PACKS, getPuzzle, levelId } from '../js/puzzles.js';
import { computeClues, isFairPuzzle } from '../js/nonogram.js';

let failures = 0;

for (const [size, list] of Object.entries(ART)) {
  const n = Number(size);
  list.forEach((entry, i) => {
    if (entry.rows.length !== n || entry.rows.some((r) => r.length !== n)) {
      console.log(`✗ ${size}x${size} "${entry.name}" has wrong dimensions`);
      failures++;
      return;
    }
    const grid = new Uint8Array(n * n);
    entry.rows.forEach((row, r) => {
      for (let c = 0; c < n; c++) grid[r * n + c] = row[c] === '#' ? 1 : 0;
    });
    const { rows, cols } = computeClues(grid, n);
    const fair = isFairPuzzle(grid, rows, cols, n);
    console.log(`${fair ? '✓' : '✗'} ${size}x${size} #${i} ${entry.name}${fair ? '' : ' — needs guessing'}`);
    if (!fair) failures++;
  });
}

for (const pack of PACKS) {
  const t0 = performance.now();
  let worst = 0;
  for (let i = 0; i < pack.count; i++) {
    const t = performance.now();
    const p = getPuzzle(levelId(pack.size, i));
    worst = Math.max(worst, performance.now() - t);
    if (!isFairPuzzle(p.grid, p.rows, p.cols, p.size)) {
      console.log(`✗ generated ${pack.id} #${i} needs guessing`);
      failures++;
    }
  }
  const total = performance.now() - t0;
  console.log(
    `✓ pack ${pack.name} (${pack.size}x${pack.size}): ${pack.count} levels in ${total.toFixed(0)}ms, worst ${worst.toFixed(0)}ms`
  );
}

console.log(failures ? `\n${failures} problem(s)` : '\nAll good.');
process.exit(failures ? 1 : 0);

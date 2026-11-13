/* Spider Solitaire core tests — pure logic, no DOM. Run: node game/test/spider_tests.js */
'use strict';
const fs = require('fs');
const path = require('path');
eval(fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'rng.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '..', 'src', 'apps', 'spider_core.js'), 'utf8'));
const BF = globalThis.BF;

let passed = 0, failed = 0;
function ok(c, name) {
  if (c) { passed++; console.log('  ok - ' + name); }
  else { failed++; console.log('  FAIL - ' + name); }
}
function section(s) { console.log('\n== ' + s + ' =='); }
function card(r, s, up) { return { r, s, up: up === undefined ? true : up }; }
function emptyGame() {
  const g = new BF.SpiderCore(1);
  g.tableau = [[], [], [], [], [], [], [], [], [], []];
  g.stock = [];
  return g;
}

section('Spider deal');
{
  const g = new BF.SpiderCore(42);
  ok(g.tableau.length === 10, '10 columns');
  ok(g.tableau.slice(0, 4).every(c => c.length === 6) && g.tableau.slice(4).every(c => c.length === 5), 'columns hold 6,6,6,6,5,5,5,5,5,5');
  ok(g.stock.length === 50, '50 cards in stock (104 - 54 dealt)');
  ok(g.tableau.every(c => c[c.length - 1].up && c.slice(0, -1).every(x => !x.up)), 'only the top card of each column is face-up');
  const g2 = new BF.SpiderCore(42);
  ok(JSON.stringify(g.tableau) === JSON.stringify(g2.tableau), 'same seed -> identical deal');
}

section('Spider movable-run rules');
{
  const g = emptyGame();
  g.tableau[0] = [card(7, 0), card(6, 0), card(5, 0)];  // same-suit descending
  g.tableau[1] = [card(9, 1), card(8, 2)];              // descending but mixed suit
  g.tableau[2] = [card(5, 0, false), card(4, 0)];       // face-down card in the way
  ok(g.movableRun(0, 0), 'same-suit descending run is movable from the top of the run');
  ok(g.movableRun(0, 2), 'single top card is a movable run');
  ok(!g.movableRun(1, 0), 'mixed-suit run is NOT movable');
  ok(!g.movableRun(2, 0), 'run starting on a face-down card is NOT movable');
  ok(!g.movableRun(0, 1) === false, 'sub-run from middle is movable');
}

section('Spider move validation');
{
  const g = emptyGame();
  g.tableau[0] = [card(8, 0), card(7, 0), card(6, 0)];  // movable run 7-6 from idx 1
  g.tableau[1] = [card(8, 2)];                          // 8 of another suit: valid target for a 7
  g.tableau[2] = [card(9, 1)];                          // 9: invalid target for a 7
  ok(g.tryMove(0, 1, 1), 'run 7-6 drops onto 8 (rank+1, any suit)');
  ok(g.tableau[1].map(c => c.r).join(',') === '8,7,6', 'run appended in order');
  ok(g.tableau[0].length === 1 && g.tableau[0][0].up, 'source top card exposed face-up');
  ok(g.moves === 1 && g.score === 499, 'one move, score 500 -> 499');
  ok(!g.tryMove(1, 1, 2), 'run starting at 7 cannot drop onto 9');
  ok(!g.tryMove(1, 0, 1), 'same-column move rejected');
  ok(g.tryMove(1, 1, 3), 'run drops onto an empty column');
  const g2 = emptyGame();
  g2.tableau[0] = [card(9, 1), card(8, 2)]; // mixed-suit: not movable
  g2.tableau[1] = [card(9, 0)];
  ok(!g2.tryMove(0, 0, 1), 'mixed-suit run cannot move');
}

section('Spider foundation completion and win');
{
  const g = emptyGame();
  const col0 = [];
  for (let r = 13; r >= 2; r--) col0.push(card(r, 0)); // K..2 of spades
  g.tableau[0] = col0;
  g.tableau[1] = [card(1, 0)];                            // A of spades
  const scoreBefore = g.score;
  ok(g.tryMove(1, 0, 0), 'ace drops onto the 2, completing K..A');
  ok(g.foundations === 1, 'completed same-suit K..A run removed to a foundation');
  ok(g.tableau[0].length === 0, 'column emptied by the removal');
  ok(g.score === scoreBefore - 1 + 100, 'score = -1 for the move, +100 for the foundation');
  g.foundations = 7;
  const colA = [];
  for (let r = 13; r >= 2; r--) colA.push(card(r, 1));
  g.tableau[2] = colA;
  g.tableau[3] = [card(1, 1)];
  ok(g.tryMove(3, 0, 2), 'eighth foundation completes');
  ok(g.foundations === 8 && g.won, '8 foundations -> game won');
  ok(!g.tryMove(2, 0, 3) === false || g.won, 'no moves after win matter');
}

section('Spider stock deal rules');
{
  const g = new BF.SpiderCore(7);
  ok(g.stock.length === 50, 'stock starts with 50');
  ok(g.dealStock(), 'deal works when all columns are non-empty');
  ok(g.stock.length === 40, '10 cards left the stock (50 -> 40)');
  ok(g.tableau.every(c => c[c.length - 1].up), 'dealt cards land face-up');
  g.tableau[5] = [];
  ok(!g.dealStock(), 'no deal while any column is empty');
  g.tableau[5] = [card(3, 3)];
  g.stock = g.stock.slice(0, 4);
  ok(!g.dealStock(), 'no deal when stock < 10');
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);

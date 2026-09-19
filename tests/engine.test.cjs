'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/engine');
const C = require('../js/campaign');
const P = require('../js/progress');
const sample = C.levels[1].puzzle;
const mask = (...ds) => ds.reduce((m, n) => m | (1 << n), 0);

test('topology: 27 units, 20 unique peers per cell', () => {
  assert.equal(S.UNITS.length, 27);
  S.PEERS.forEach((peers, i) => { assert.equal(peers.length, 20); assert.ok(!peers.includes(i)); assert.equal(new Set(peers).size, 20); });
});
test('parser supports formatted rows and blank markers; rejects unsupported input', () => {
  assert.deepEqual(S.parse(S.format(sample)), sample);
  assert.deepEqual(S.parse(S.format(sample).replaceAll('.', '?').replaceAll('\n', ' \n ')), sample);
  for (const bad of ['123', 'x'.repeat(81), '1'.repeat(81)]) assert.throws(() => S.parse(bad));
});
test('invalid and unsolvable grids cannot win or solve', () => {
  const b = S.solve(sample); b[0] = b[1];
  assert.equal(S.isSolved(b), false); assert.equal(S.solve(b), null); assert.equal(S.countSolutions(b), 0);
  assert.equal(S.valid([1]), false); assert.throws(() => S.state([1]));
});
test('search distinguishes zero, one and multiple solutions', () => {
  assert.equal(S.countSolutions(sample), 1);
  assert.equal(S.countSolutions(Array(81).fill(0)), 2);
  const b = [...S.solve(sample)]; b[0] = 0; b[1] = 0; b[0] = 1;
  // Explicit contradictory board independent of the original solution.
  b[2] = b[3]; assert.equal(S.countSolutions(b), 0);
});
test('search is bounded and does not mutate input', () => {
  const before = [...sample]; S.solve(sample); assert.deepEqual(sample, before);
  assert.throws(() => S.search(Array(81).fill(0), {maxNodes: 1}), /лимит/);
});
test('naked pair excludes neither member (regression: pairs[b] vs pairs[bb])', () => {
  const s = {board: Array(81).fill(0), candidates: Array(81).fill(0)};
  s.candidates[0] = mask(1, 2); s.candidates[1] = mask(1, 2); s.candidates[2] = mask(1, 2, 3);
  const step = S.nakedSubset(s);
  assert.deepEqual(step.removals, [[2, mask(1, 2)]]);
  S.apply(s, step);
  assert.equal(s.candidates[0], mask(1, 2)); assert.equal(s.candidates[1], mask(1, 2));
  assert.equal(s.candidates[2], mask(3));
  assert.equal(S.single(s).index, 2);
  assert.equal(S.nakedSubset(s), null); // Removed candidates do not come back on the next step.
});
test('hidden pair removes only other candidates', () => {
  const s = {board: Array(81).fill(0), candidates: Array(81).fill(0)};
  s.candidates[0] = mask(1, 2, 3); s.candidates[1] = mask(1, 2, 4);
  S.apply(s, S.hiddenPair(s)); assert.equal(s.candidates[0], mask(1, 2)); assert.equal(s.candidates[1], mask(1, 2));
});
test('clone and serialisation preserve effective candidates', () => {
  const s = S.state(sample), copy = S.clone(s); copy.board[0] = 0;
  assert.notDeepEqual(copy.board, s.board);
  assert.deepEqual(JSON.parse(JSON.stringify(s)).candidates, s.candidates);
});
for (const level of C.levels) test(`${level.id}: unique, logically solvable, givens preserved`, () => {
  assert.equal(S.countSolutions(level.puzzle), 1);
  const solution = S.solve(level.puzzle); assert.ok(S.isSolved(solution));
  assert.ok(level.puzzle.every((n, i) => !n || solution[i] === n));
  assert.ok(S.analyse(level.puzzle).solved);
  if (level.type === 'puzzle') assert.deepEqual(S.analyse(level.puzzle).techniques, ['Единственный кандидат']);
});
test('one-move mission has a provable single; repair has exactly one wrong editable value', () => {
  const l = C.levels[2], g = P.game('story', l.puzzle, l.id);
  assert.equal(P.goal(g), false); S.apply(g, S.single(g)); assert.equal(P.goal(g), true);
  const r = C.levels[3], solution = S.solve(r.puzzle);
  const wrong = r.initial.map((n, i) => n !== solution[i] ? i : -1).filter(i => i >= 0);
  assert.equal(wrong.length, 1); assert.equal(r.puzzle[wrong[0]], 0); assert.equal(S.isSolved(r.initial), false);
});
test('generator is deterministic by seed and produces different full solutions', () => {
  const a = S.generate('easy', 81), b = S.generate('easy', 81), c = S.generate('easy', 82);
  assert.deepEqual(a.puzzle, b.puzzle); assert.notDeepEqual(a.solution, c.solution);
  assert.equal(S.countSolutions(a.puzzle), 1); assert.ok(S.isSolved(a.solution));
});
test('40 seeded puzzles: every placement/elimination agrees with unique solution', () => {
  for (let seed = 0; seed < 40; seed++) {
    const {puzzle, solution} = S.generate(['easy', 'medium', 'hard'][seed % 3], seed + 900);
    assert.equal(S.countSolutions(puzzle), 1);
    const s = S.state(puzzle); let steps = 0;
    while (!S.isSolved(s.board) && steps++ < 1000) {
      const step = S.next(s);
      if (step.index !== null) assert.equal(step.value, solution[step.index], `seed ${seed}: ${step.technique}`);
      for (const [i, m] of step.removals) assert.equal(m & (1 << solution[i]), 0, `seed ${seed}: unsound ${step.technique}`);
      S.apply(s, step);
    }
    assert.ok(S.isSolved(s.board)); assert.deepEqual(s.board, solution);
  }
});
test('no false victory on contradiction or stale placement', () => {
  const s = S.state(sample), step = S.next(s); S.apply(s, step); assert.throws(() => S.apply(s, step), /устарела/);
  const invalid = S.state(Array(81).fill(1)); assert.throws(() => S.next(invalid), /противоречие/);
});
test('chapter unlocking, star upgrades, one-time XP and chapter bonus', () => {
  const p = P.fresh(); assert.equal(P.unlocked(p, 1), false);
  assert.deepEqual(P.reward(p, C.levels[1].id), {xp: 0, stars: 0});
  assert.equal(P.reward(p, C.levels[0].id, {hints: 1, mistakes: 1}).stars, 1);
  assert.equal(P.reward(p, C.levels[0].id).xp, 0); assert.equal(p.completed[C.levels[0].id], 3);
  for (const l of C.levels.slice(1)) P.reward(p, l.id);
  assert.equal(P.summary(p).xp, 750); assert.equal(P.summary(p).stars, 18); assert.equal(p.mastery, true);
  assert.equal(P.reward(p, C.levels[5].id).xp, 0);
});
test('walkthrough gets no rewards or unlocks; hints still allow story', () => {
  const p = P.fresh(); P.reward(p, C.levels[0].id, {demo: true}); assert.equal(P.summary(p).xp, 0);
  P.reward(p, C.levels[0].id, {hints: 2}); assert.equal(P.unlocked(p, 1), true); assert.equal(p.completed[C.levels[0].id], 2);
});
test('save roundtrip preserves sessions, notes, undo and candidate removals', () => {
  const p = P.fresh(), l = C.levels[0];
  const g = P.game('story', l.puzzle, l.id); p.sessions.story = g;
  g.history.push({...S.clone(g), notes: [...g.notes]}); S.apply(g, S.next(g));
  assert.deepEqual(P.decode(JSON.stringify(p)), p);
});
test('bad versions, altered givens, invalid masks, impossible unlocks rejected', () => {
  assert.throws(() => P.decode('broken')); assert.throws(() => P.decode('{"version":2}'));
  const p = P.fresh(); p.sessions.story = P.game('story', C.levels[0].puzzle, C.levels[0].id);
  let bad = JSON.parse(JSON.stringify(p)); bad.sessions.story.board[1] = 0; assert.throws(() => P.validate(bad));
  bad = JSON.parse(JSON.stringify(p)); bad.sessions.story.candidates[0] = 1; assert.throws(() => P.validate(bad));
  bad = P.fresh(); bad.completed['signal-2'] = 3; assert.throws(() => P.validate(bad));
});
test('storage errors and corrupted data are handled without deleting the stored value', () => {
  const denied = {getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }};
  assert.ok(P.load(denied).warning); assert.equal(P.save(denied, P.fresh()), false);
  let value = '{corrupt'; const storage = {getItem() {return value;}, setItem(k, v) {value = v;}};
  assert.ok(P.load(storage).warning); assert.equal(value, '{corrupt');
  assert.ok(P.save(storage, P.fresh())); assert.equal(P.load(storage).warning, '');
});

/* SudokuHelper engine. No DOM, network or dependencies. Masks use bits 1..9. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Sudoku = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FULL = 1022;
  const digits = mask => Array.from({length: 9}, (_, i) => i + 1).filter(n => mask & (1 << n));
  const row = i => Math.floor(i / 9), col = i => i % 9;
  const box = i => Math.floor(row(i) / 3) * 3 + Math.floor(col(i) / 3);
  const UNITS = Array.from({length: 27}, (_, u) => Array.from({length: 81}, (_, i) => i)
    .filter(i => u < 9 ? row(i) === u : u < 18 ? col(i) === u - 9 : box(i) === u - 18));
  const PEERS = Array.from({length: 81}, (_, i) => Array.from(new Set([
    ...UNITS[row(i)], ...UNITS[9 + col(i)], ...UNITS[18 + box(i)]])).filter(j => j !== i));
  const pos = i => `R${row(i) + 1}C${col(i) + 1}`;
  function assertBoard(b) {
    if (!Array.isArray(b) || b.length !== 81 || b.some(n => !Number.isInteger(n) || n < 0 || n > 9))
      throw new Error('Нужно ровно 81 значение от 0 до 9.');
  }
  function valid(b) {
    try { assertBoard(b); } catch (_) { return false; }
    return b.every((n, i) => !n || PEERS[i].every(j => b[j] !== n));
  }
  const isSolved = b => valid(b) && !b.includes(0);
  function candidates(b) {
    assertBoard(b);
    return b.map((v, i) => v ? 0 : PEERS[i].reduce((m, j) => m & ~(1 << b[j]), FULL));
  }
  function state(b) { return {board: [...b], candidates: candidates(b)}; }
  function clone(s) { return {board: [...s.board], candidates: [...s.candidates]}; }
  function parse(text) {
    const chars = String(text).replace(/\s/g, '');
    if (!/^[1-9.0?_]{81}$/.test(chars))
      throw new Error('Введите 81 клетку: 1–9 или . / 0 / ? / _ для пустых. Пробелы и переносы игнорируются.');
    const b = [...chars].map(c => /[1-9]/.test(c) ? Number(c) : 0);
    if (!valid(b)) throw new Error('В позиции есть повторяющиеся цифры в строке, столбце или блоке.');
    return b;
  }
  const format = b => Array.from({length: 9}, (_, r) => b.slice(r * 9, r * 9 + 9).map(n => n || '.').join('')).join('\n');
  function seeded(seed) {
    let a = seed >>> 0;
    return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function shuffled(xs, rng) {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  // MRV backtracking with a work budget. Completed but contradictory grids are never accepted.
  function search(input, {limit = 1, rng = null, maxNodes = 250000} = {}) {
    assertBoard(input);
    if (!valid(input)) return [];
    const b = [...input], solutions = [], rs = Array(9).fill(0), cs = [...rs], bs = [...rs];
    b.forEach((v, i) => { if (v) { rs[row(i)] |= 1 << v; cs[col(i)] |= 1 << v; bs[box(i)] |= 1 << v; } });
    let nodes = 0;
    function visit() {
      if (++nodes > maxNodes) throw new Error('Достигнут лимит поиска. Добавьте исходные цифры или выберите другую позицию.');
      let at = -1, opts = [], size = 10;
      for (let i = 0; i < 81; i++) if (!b[i]) {
        const d = digits(FULL & ~(rs[row(i)] | cs[col(i)] | bs[box(i)]));
        if (!d.length) return;
        if (d.length < size) { at = i; opts = d; size = d.length; if (size === 1) break; }
      }
      if (at === -1) { solutions.push([...b]); return; }
      if (rng) opts = shuffled(opts, rng);
      const r = row(at), c = col(at), k = box(at);
      for (const n of opts) {
        const bit = 1 << n;
        b[at] = n; rs[r] |= bit; cs[c] |= bit; bs[k] |= bit;
        visit();
        b[at] = 0; rs[r] &= ~bit; cs[c] &= ~bit; bs[k] &= ~bit;
        if (solutions.length >= limit) return;
      }
    }
    visit(); return solutions;
  }
  const solve = b => search(b)[0] || null;
  const countSolutions = b => search(b, {limit: 2}).length;
  function placement(index, value, technique, explanation, cells = [index]) {
    return {index, value, technique, explanation, cells, removals: []};
  }
  function removal(technique, explanation, cells, removals) {
    return removals.length ? {index: null, value: null, technique, explanation, cells, removals} : null;
  }
  function combinations(a, size) {
    const out = [];
    function choose(start, acc) {
      if (acc.length === size) { out.push(acc); return; }
      for (let i = start; i <= a.length - (size - acc.length); i++) choose(i + 1, [...acc, a[i]]);
    }
    choose(0, []); return out;
  }
  function single(s) {
    for (let i = 0; i < 81; i++) {
      const d = digits(s.candidates[i]);
      if (!s.board[i] && d.length === 1) return placement(i, d[0], 'Единственный кандидат',
        `${pos(i)}: подходит только ${d[0]}. Другие цифры уже заняты в строке, столбце или блоке.`, [i, ...PEERS[i].filter(j => s.board[j])]);
    }
    return null;
  }
  function hiddenSingle(s) {
    for (const unit of UNITS) for (let n = 1; n <= 9; n++) {
      if (unit.some(i => s.board[i] === n)) continue;
      const cells = unit.filter(i => s.candidates[i] & (1 << n));
      if (cells.length === 1) return placement(cells[0], n, 'Единственное место',
        `В выделенной области цифра ${n} может находиться только в ${pos(cells[0])}.`, unit);
    }
    return null;
  }
  function nakedSubset(s, size = 2) {
    for (const unit of UNITS) {
      const eligible = unit.filter(i => { const n = digits(s.candidates[i]).length; return n >= 2 && n <= size; });
      for (const cells of combinations(eligible, size)) {
        const mask = cells.reduce((m, i) => m | s.candidates[i], 0);
        if (digits(mask).length !== size) continue;
        const removals = unit.filter(i => !cells.includes(i) && (s.candidates[i] & mask)).map(i => [i, s.candidates[i] & mask]);
        const step = removal(size === 2 ? 'Открытая пара' : 'Открытая тройка',
          `${cells.map(pos).join(', ')} занимают цифры ${digits(mask).join(', ')}. Исключаем их из остальных клеток области.`, cells, removals);
        if (step) return step;
      }
    }
    return null;
  }
  function hiddenPair(s) {
    for (const unit of UNITS) for (const ds of combinations(digits(FULL), 2)) {
      const locations = ds.map(n => unit.filter(i => s.candidates[i] & (1 << n)));
      if (locations.some(a => a.length !== 2) || locations[0].some(i => !locations[1].includes(i))) continue;
      const mask = (1 << ds[0]) | (1 << ds[1]), cells = locations[0];
      const step = removal('Скрытая пара', `Цифры ${ds.join(' и ')} встречаются только в ${cells.map(pos).join(', ')}. Другие кандидаты там исключаются.`,
        cells, cells.filter(i => s.candidates[i] & ~mask).map(i => [i, s.candidates[i] & ~mask]));
      if (step) return step;
    }
    return null;
  }
  function locked(s) {
    for (let u = 0; u < 27; u++) for (let n = 1; n <= 9; n++) {
      const bit = 1 << n, cells = UNITS[u].filter(i => s.candidates[i] & bit);
      if (cells.length < 2) continue;
      const targets = u >= 18 ? [row(cells[0]), 9 + col(cells[0])] : [18 + box(cells[0])];
      for (const t of targets) if (cells.every(i => UNITS[t].includes(i))) {
        const step = removal(u >= 18 ? 'Указующая пара / тройка' : 'Сокращение блока',
          `Все места для ${n} в одной области лежат на пересечении с другой. Убираем ${n} за пределами пересечения.`,
          cells, UNITS[t].filter(i => !UNITS[u].includes(i) && (s.candidates[i] & bit)).map(i => [i, bit]));
        if (step) return step;
      }
    }
    return null;
  }
  function fish(s, size = 2) {
    for (const offset of [0, 9]) for (let n = 1; n <= 9; n++) {
      const bit = 1 << n;
      const lines = Array.from({length: 9}, (_, i) => i + offset).filter(u => {
        const len = UNITS[u].filter(i => s.candidates[i] & bit).length; return len >= 2 && len <= size;
      });
      for (const bases of combinations(lines, size)) {
        const cells = bases.flatMap(u => UNITS[u].filter(i => s.candidates[i] & bit));
        const cross = [...new Set(cells.map(offset ? row : col))];
        if (cross.length !== size) continue;
        const removals = cross.flatMap(v => UNITS[offset ? v : 9 + v])
          .filter(i => !bases.includes(offset ? col(i) + 9 : row(i)) && (s.candidates[i] & bit)).map(i => [i, bit]);
        const step = removal(size === 2 ? 'X-Wing' : 'Swordfish',
          `Кандидат ${n} в ${size} параллельных линиях ограничен ${size} пересечениями. В остальных клетках пересекающих линий он исключается.`, cells, removals);
        if (step) return step;
      }
    }
    return null;
  }
  function xyWing(s) {
    for (let p = 0; p < 81; p++) {
      if (digits(s.candidates[p]).length !== 2) continue;
      const wings = PEERS[p].filter(i => digits(s.candidates[i]).length === 2 && digits(s.candidates[i] & s.candidates[p]).length === 1);
      for (const [a, b] of combinations(wings, 2)) {
        const pm = s.candidates[p], am = s.candidates[a], bm = s.candidates[b];
        const z = am & bm & ~pm;
        if (!z || (am & pm) === (bm & pm) || digits(pm | am | bm).length !== 3) continue;
        const step = removal('XY-Wing', `Каким бы ни был кандидат в ${pos(p)}, одно из крыльев содержит ${digits(z)[0]}. Общие соседи крыльев не могут содержать эту цифру.`,
          [p, a, b], PEERS[a].filter(i => i !== p && i !== a && i !== b && PEERS[b].includes(i) && (s.candidates[i] & z)).map(i => [i, z]));
        if (step) return step;
      }
    }
    return null;
  }
  function coloring(s) {
    for (let n = 1; n <= 9; n++) {
      const bit = 1 << n, graph = new Map();
      for (const unit of UNITS) {
        const cells = unit.filter(i => s.candidates[i] & bit);
        if (cells.length !== 2) continue;
        const [a, b] = cells;
        if (!graph.has(a)) graph.set(a, new Set()); if (!graph.has(b)) graph.set(b, new Set());
        graph.get(a).add(b); graph.get(b).add(a);
      }
      const visited = new Set();
      for (const start of graph.keys()) {
        if (visited.has(start)) continue;
        const colors = new Map([[start, 0]]), queue = [start]; visited.add(start);
        for (let q = 0; q < queue.length; q++) for (const j of graph.get(queue[q])) if (!colors.has(j)) {
          colors.set(j, 1 - colors.get(queue[q])); visited.add(j); queue.push(j);
        }
        const groups = [queue.filter(i => colors.get(i) === 0), queue.filter(i => colors.get(i) === 1)];
        for (const group of groups) if (group.some(i => group.some(j => PEERS[i].includes(j))))
          return removal('Простое окрашивание', `Две клетки одного цвета видят друг друга. Кандидат ${n} исключается во всей этой группе.`, queue, group.map(i => [i, bit]));
        const removals = s.candidates.map((m, i) => i).filter(i => !colors.has(i) && (s.candidates[i] & bit) && groups.every(g => g.some(j => PEERS[i].includes(j)))).map(i => [i, bit]);
        const step = removal('Простое окрашивание', `Клетки, видящие оба цвета цепочки, не могут содержать ${n}.`, queue, removals);
        if (step) return step;
      }
    }
    return null;
  }
  function next(s, allowSearch = true) {
    if (!valid(s.board) || s.board.some((n, i) => !n && !s.candidates[i])) throw new Error('В позиции противоречие. Отмените ошибочный ход.');
    if (isSolved(s.board)) return null;
    const step = single(s) || hiddenSingle(s) || nakedSubset(s) || nakedSubset(s, 3) || hiddenPair(s) || locked(s) || fish(s) || fish(s, 3) || xyWing(s) || coloring(s);
    if (step || !allowSearch) return step;
    const solved = solve(s.board);
    if (!solved) throw new Error('У позиции нет решения. Отмените ошибочный ход.');
    const i = s.board.findIndex(v => !v);
    return {...placement(i, solved[i], 'Поиск с возвратом',
      `Логические приёмы исчерпаны. Поиск с откатом проверил продолжение: ${pos(i)} = ${solved[i]}. Это вычисленный ход, а не логическое объяснение.`), searched: true};
  }
  function apply(s, step) {
    if (!step) return;
    if (step.index !== null) {
      const i = step.index, n = step.value;
      if (s.board[i] || !(s.candidates[i] & (1 << n))) throw new Error('Подсказка устарела. Запросите новую.');
      s.board[i] = n; s.candidates[i] = 0;
      for (const p of PEERS[i]) s.candidates[p] &= ~(1 << n);
    } else {
      for (const [i, mask] of step.removals) s.candidates[i] &= ~mask;
    }
  }
  function analyse(board, maxSteps = 1000) {
    const s = state(board), steps = [];
    while (!isSolved(s.board) && steps.length < maxSteps) {
      const step = next(s, false); if (!step) break; steps.push(step); apply(s, step);
    }
    const techniques = [...new Set(steps.map(t => t.technique))];
    const difficulty = !isSolved(s.board) ? 'expert' : techniques.some(t => !['Единственный кандидат', 'Единственное место'].includes(t)) ? 'hard' : techniques.includes('Единственное место') ? 'medium' : 'easy';
    return {solved: isSolved(s.board), steps, techniques, difficulty};
  }
  function generate(difficulty = 'easy', seed = Date.now()) {
    const rng = seeded(seed), target = {easy: 40, medium: 32, hard: 27}[difficulty] || 40;
    const solution = search(Array(81).fill(0), {rng})[0], puzzle = [...solution];
    let clues = 81;
    for (const i of shuffled(Array.from({length: 81}, (_, k) => k), rng)) {
      if (clues <= target) break;
      const n = puzzle[i]; puzzle[i] = 0;
      try { if (countSolutions(puzzle) !== 1) puzzle[i] = n; else clues--; } catch (_) { puzzle[i] = n; }
    }
    return {puzzle, solution, rating: analyse(puzzle)};
  }
  return {FULL, UNITS, PEERS, digits, row, col, box, pos, valid, isSolved, candidates, state, clone, parse, format,
    solve, search, countSolutions, seeded, generate, next, apply, analyse, single, hiddenSingle, nakedSubset, hiddenPair, locked, fish, xyWing, coloring};
});

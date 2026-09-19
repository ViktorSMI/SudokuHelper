(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine'), require('./campaign'));
  else root.Progress = factory(root.Sudoku, root.Campaign);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (S, C) {
  'use strict';
  const KEY = 'sudokuhelper.archive81.v1';
  const fresh = () => ({version: 1, completed: {}, mastery: false, theme: 'lime', sessions: {}});
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  function summary(p) {
    const done = C.levels.filter(l => has(p.completed, l.id));
    const stars = done.reduce((sum, l) => sum + p.completed[l.id], 0);
    const xp = done.length * 100 + (done.length === C.levels.length ? 150 : 0);
    const rank = [...C.ranks].reverse().find(r => xp >= r.xp);
    return {done: done.length, stars, xp, rank, nextRank: C.ranks.find(r => r.xp > xp)};
  }
  function unlocked(p, index) { return index === 0 || (index > 0 && index < C.levels.length && has(p.completed, C.levels[index - 1].id)); }
  function reward(p, id, {mistakes = 0, hints = 0, demo = false} = {}) {
    const index = C.levels.findIndex(l => l.id === id);
    if (demo || index < 0 || !unlocked(p, index)) return {xp: 0, stars: 0};
    const before = summary(p).xp, stars = 1 + (mistakes === 0 ? 1 : 0) + (hints === 0 ? 1 : 0);
    p.completed[id] = Math.max(p.completed[id] || 0, stars);
    if (id === 'signal-3' && hints === 0 && mistakes === 0) p.mastery = true;
    return {xp: summary(p).xp - before, stars};
  }
  function goal(game) {
    if (game.mode !== 'story') return S.isSolved(game.board);
    const level = C.levels.find(l => l.id === game.levelId);
    if (!level) return false;
    if (level.type !== 'single') return S.isSolved(game.board);
    const base = S.candidates(level.puzzle);
    return level.puzzle.some((n, i) => !n && S.digits(base[i]).length === 1 && game.board[i] === S.digits(base[i])[0]);
  }
  function game(mode, puzzle, levelId = null, initial = puzzle) {
    return {mode, levelId, puzzle: [...puzzle], board: [...initial], candidates: S.candidates(initial),
      notes: Array(81).fill(0), history: [], mistakes: 0, hints: 0, demo: false, finished: false,
      noteMode: false, showCandidates: false};
  }
  function vector(a, max = S.FULL) {
    return Array.isArray(a) && a.length === 81 && a.every(n => Number.isInteger(n) && n >= 0 && n <= max && (max !== S.FULL || !(n & ~S.FULL)));
  }
  // Validate into a new object; never merge untrusted keys into the live profile.
  function validate(raw) {
    if (!raw || raw.version !== 1 || typeof raw.completed !== 'object' || raw.completed === null || Array.isArray(raw.completed)) throw new Error('Неизвестный или повреждённый формат сохранения.');
    const p = fresh(); let gap = false;
    for (const level of C.levels) {
      if (!has(raw.completed, level.id)) { gap = true; continue; }
      const stars = raw.completed[level.id];
      if (gap || !Number.isInteger(stars) || stars < 1 || stars > 3) throw new Error('Повреждён прогресс глав.');
      p.completed[level.id] = stars;
    }
    if (Object.keys(raw.completed).some(k => !C.levels.some(l => l.id === k))) throw new Error('Сохранение содержит неизвестные уровни.');
    p.mastery = raw.mastery === true && p.completed['signal-3'] === 3;
    const unlockedThemes = C.ranks.filter(r => summary(p).xp >= r.xp).map(r => r.theme);
    p.theme = unlockedThemes.includes(raw.theme) ? raw.theme : 'lime';
    for (const mode of ['story', 'practice', 'helper']) {
      const source = raw.sessions && raw.sessions[mode]; if (!source) continue;
      if (source.mode !== mode || !vector(source.puzzle, 9) || !vector(source.board, 9) || !S.valid(source.puzzle)) throw new Error('Повреждена сохранённая партия.');
      let level = null;
      if (mode === 'story') {
        const index = C.levels.findIndex(l => l.id === source.levelId); level = C.levels[index];
        if (!level || !unlocked(p, index) || level.puzzle.some((n, i) => n !== source.puzzle[i])) throw new Error('Неизвестный или закрытый уровень.');
      }
      const g = game(mode, source.puzzle, level ? level.id : null, source.board);
      function snapshot(src) {
        if (!src || !vector(src.board, 9) || !vector(src.notes) || !vector(src.candidates)) throw new Error('Повреждено состояние доски.');
        if (g.puzzle.some((n, i) => n && src.board[i] !== n)) throw new Error('Изменены исходные цифры.');
        if ((!level || level.type !== 'repair') && !S.valid(src.board)) throw new Error('В сохранении есть конфликтующие цифры.');
        const legal = S.candidates(src.board);
        if (src.candidates.some((mask, i) => (mask & ~legal[i]) || (src.board[i] && mask))) throw new Error('Повреждены кандидаты.');
        return {board: [...src.board], candidates: [...src.candidates], notes: [...src.notes]};
      }
      Object.assign(g, snapshot(source));
      for (const k of ['mistakes', 'hints']) {
        if (!Number.isSafeInteger(source[k]) || source[k] < 0 || source[k] > 1000000) throw new Error('Повреждены счётчики партии.');
        g[k] = source[k];
      }
      for (const k of ['demo', 'finished', 'noteMode', 'showCandidates']) g[k] = source[k] === true;
      if (g.finished && !goal(g)) throw new Error('Некорректный результат партии.');
      if (!Array.isArray(source.history) || source.history.length > 30) throw new Error('Повреждена история ходов.');
      g.history = source.history.map(snapshot);
      p.sessions[mode] = g;
    }
    return p;
  }
  function load(storage) {
    try { const text = storage.getItem(KEY); return {profile: text ? validate(JSON.parse(text)) : fresh(), warning: ''}; }
    catch (_) { return {profile: fresh(), warning: 'Сохранение недоступно или повреждено. Старые данные не перезаписаны. Используй экспорт прогресса.'}; }
  }
  function save(storage, p) {
    try { storage.setItem(KEY, JSON.stringify(p)); return true; } catch (_) { return false; }
  }
  function decode(text) {
    if (typeof text !== 'string' || text.length > 2000000) throw new Error('Файл сохранения слишком большой.');
    let data; try { data = JSON.parse(text); } catch (_) { throw new Error('Не удалось прочитать JSON-файл.'); }
    return validate(data);
  }
  return {KEY, fresh, summary, unlocked, reward, goal, game, validate, load, save, decode};
});

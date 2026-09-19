/* UI controller. Classic scripts also work when index.html is opened directly. */
(function () {
  'use strict';
  const S = window.Sudoku, C = window.Campaign, P = window.Progress;
  const $ = id => document.getElementById(id);
  let storage;
  try { storage = window.localStorage; } catch (_) { storage = {getItem() {throw Error();}, setItem() {throw Error();}}; }
  const loaded = P.load(storage);
  let profile = loaded.profile, storageBlocked = !!loaded.warning;
  let route = 'history', game = null, selected = -1, hint = null, busy = false, run = 0, speed = 3;
  let toastTimer, dialogAction = null;
  const solutions = new Map();
  const stars = n => '★'.repeat(n) + '☆'.repeat(3 - n);
  const levelFor = g => C.levels.find(l => l.id === g.levelId);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function solution(g) {
    const key = g.puzzle.join('');
    if (!solutions.has(key)) solutions.set(key, S.solve(g.puzzle));
    return solutions.get(key);
  }
  function warn(message) { $('storageWarning').hidden = !message; $('storageWarning').textContent = message; }
  if (loaded.warning) warn(loaded.warning + ' Автозапись отключена до импорта или явного сброса в профиле.');
  function persist() {
    if (storageBlocked) return;
    if (!P.save(storage, profile)) warn('Браузер не смог сохранить прогресс. Экспортируй его в профиле перед закрытием страницы.');
    else warn('');
  }
  function toast(text) {
    $('toast').textContent = text; $('toast').classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3000);
  }
  function chrome() {
    const info = P.summary(profile);
    document.documentElement.dataset.theme = profile.theme;
    $('headerRank').innerHTML = `<strong>${info.rank.name}</strong>${info.xp} XP · ${info.stars} ★`;
    const active = route === 'game' ? (game.mode === 'story' ? 'history' : game.mode) : route;
    document.querySelectorAll('[data-route]').forEach(b => { if (b.dataset.route === active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  }
  function stop() { run++; busy = false; hint = null; }
  function navigate(to) {
    stop(); persist(); route = to; chrome(); window.scrollTo(0, 0);
    if (to === 'history') renderHistory();
    else if (to === 'practice') renderPractice();
    else if (to === 'helper') renderHelper();
    else renderProfile();
  }
  function openDialog(html, action = null) {
    dialogAction = action; $('dialogContent').innerHTML = html;
    if (!$('dialog').open) $('dialog').showModal();
  }
  function confirm(title, text, action, label = 'Продолжить') {
    openDialog(`<div class="eyebrow">Архив 81</div><h2 id="dialogTitle">${esc(title)}</h2><p>${esc(text)}</p><div class="dialog-actions"><button class="btn" data-action="close-dialog">Отмена</button><button class="btn primary" data-action="confirm">${esc(label)}</button></div>`, action);
  }
  function renderHistory() {
    const info = P.summary(profile), next = C.levels.findIndex(l => !profile.completed[l.id]);
    const active = next < 0 ? 5 : next;
    const ongoing = profile.sessions.story && !profile.sessions.story.finished;
    $('main').innerHTML = `
      <section class="hero" aria-labelledby="heroTitle">
        <div><div class="eyebrow">Судоку-приключение · Глава I</div>
          <h1 id="heroTitle">Восстанови то,<br>что было <em>стёрто.</em></h1>
          <p>81 ячейка. Одно странное сообщение. Пройди путь от первого сигнала до тайны, которую архив хранит о тебе.</p>
          <div class="hero-actions"><button class="btn primary" data-action="continue-story">${ongoing ? 'Продолжить расследование' : info.done === 6 ? 'Вернуться к испытаниям' : info.done ? 'Продолжить историю' : 'Войти в архив'} <span aria-hidden="true">↗</span></button><span class="tag">${info.done === 6 ? 'Сектор восстановлен' : 'Сектор 01 / Первый сигнал'}</span></div></div>
        <div class="terminal-art" aria-hidden="true"><div class="signal-grid">${['8','·','1','·','9','·','3','·','?'].map((n,i)=>`<span class="${i===4 || (i<info.done && i!==1) ? 'live' : ''}">${n}</span>`).join('')}</div><small>ВХОДЯЩИЙ СИГНАЛ · 00:81</small></div>
      </section>
      <div class="overview"><div><span>ВОССТАНОВЛЕНО</span><strong>${info.done} <small>/ 6 уровней</small></strong><div class="progress" role="progressbar" aria-label="Прогресс главы" aria-valuemin="0" aria-valuemax="6" aria-valuenow="${info.done}"><span style="width:${info.done/6*100}%"></span></div></div><div><span>ТВОЙ РАНГ</span><strong>${info.rank.name}</strong><small>${info.xp} XP · ${info.nextRank ? 'далее: '+info.nextRank.xp+' XP' : 'максимальный ранг'}</small></div><div><span>МАСТЕРСТВО</span><strong class="accent">${info.stars} <small>/ 18 ★</small></strong><small>Каждый шаг имеет значение</small></div></div>
      <section aria-labelledby="chapterTitle"><div class="section-heading"><div><div class="eyebrow">Глава 01</div><h2 id="chapterTitle">Первый сигнал</h2></div><p>6 уровней · без ограничения времени</p></div>
      <div class="level-grid">${C.levels.map((l,i)=>{const open=P.unlocked(profile,i),done=profile.completed[l.id];return `<button class="level ${i===active?'current':''}" data-action="level" data-index="${i}" ${open?'':'disabled'} aria-label="Уровень ${i+1}: ${l.title}${done?', '+done+' из 3 звёзд':open?', доступен':', закрыт'}"><span class="level-top"><span>${String(i+1).padStart(2,'0')} / ${done?'ВОССТАНОВЛЕН':!open?'ЗАКРЫТО':l.boss?'ИСПЫТАНИЕ':'ДОСТУПЕН'}</span><span class="stars">${done?stars(done):!open?'⌑':'○'}</span></span><h3>${l.title}</h3><p>${l.label}</p><span class="level-arrow" aria-hidden="true">${open?'↗':'—'}</span></button>`;}).join('')}</div></section>
      <details class="upcoming"><summary>Дальше по сюжету · ещё четыре главы в разработке</summary><div class="chapters">${C.chapters.slice(1).map((c,i)=>`<div><div class="eyebrow">0${i+2} / В разработке</div><h3>${c.title}</h3><p>${c.subtitle}</p></div>`).join('')}</div></details>`;
  }
  function startLevel(index, restart = false) {
    if (!P.unlocked(profile, index)) return;
    const l = C.levels[index], saved = profile.sessions.story;
    if (!restart && saved && saved.levelId === l.id && !saved.finished) return openGame(saved);
    const start = () => {
      const g = P.game('story', l.puzzle, l.id, l.initial || l.puzzle);
      profile.sessions.story = g; persist(); openGame(g);
    };
    if (!restart && saved && !saved.finished && saved.levelId !== l.id)
      confirm('Начать другой уровень?', 'Текущая сюжетная партия будет заменена. Полученные звёзды и опыт останутся.', start, 'Начать');
    else start();
  }
  function renderPractice() {
    const saved = profile.sessions.practice;
    $('main').innerHTML = `<div class="page-heading"><div><div class="eyebrow">Свободный режим</div><h1>Практика без спешки.</h1><p>Новая сетка, заметки и подробные объяснения. Без влияния на сюжет.</p></div>${saved?'<button class="btn primary" data-action="resume-practice">Продолжить партию ↗</button>':''}</div>
      <div class="intro-layout"><section class="card"><div class="eyebrow">Создай головоломку</div><h3>Выбери стартовую сложность</h3><div class="choices">${[['easy','01','Лёгкая','Больше исходных цифр'],['medium','02','Средняя','Больше пространства'],['hard','03','Сложная','Меньше опор']].map(([key,n,title,text])=>`<button class="choice" data-action="generate" data-difficulty="${key}"><span class="eyebrow">${n}</span><strong>${title}</strong><small>${text}</small></button>`).join('')}</div><p>После генерации покажем реальную оценку по необходимым приёмам. Она может отличаться от выбранной: число исходных цифр не определяет сложность.</p><div class="form-status" id="formStatus" role="status"></div></section><aside class="card"><div class="eyebrow">Тренируй понимание</div><h3>Не угадывай — замечай</h3><p>«Кандидаты» покажут возможные цифры. «Подсказка» объяснит следующий приём, а «Применить шаг» выполнит его.</p><hr class="divider"><p>Для подтверждения мастерства пройди задание «Один точный ход» в истории. Обычная правильная цифра ещё не доказывает, что приём освоен.</p><button class="btn ghost" data-route="history" style="margin-top:18px">К сюжетным заданиям ↗</button></aside></div>`;
  }
  function generate(difficulty) {
    const begin = () => {
      const token = ++run; busy = true;
      document.querySelectorAll('[data-action=generate]').forEach(b=>b.disabled=true);
      if ($('formStatus')) $('formStatus').textContent = 'Собираем сетку и проверяем единственность решения…';
      setTimeout(() => {
        if (run !== token || route !== 'practice') return;
        try {
          const result = S.generate(difficulty); const g = P.game('practice', result.puzzle);
          profile.sessions.practice = g; busy = false; persist(); openGame(g);
          status('Оценка по приёмам: '+({easy:'лёгкая',medium:'средняя',hard:'сложная',expert:'требуется поиск'}[result.rating.difficulty])+'. '+result.rating.techniques.join(' · '));
        } catch (e) {busy = false; renderPractice(); $('formStatus').textContent=e.message;}
      }, 30);
    };
    const saved = profile.sessions.practice;
    if (saved && !saved.finished) confirm('Создать новую сетку?', 'Незавершённая партия практики будет заменена.', begin, 'Создать'); else begin();
  }
  function renderHelper() {
    const saved = profile.sessions.helper;
    $('main').innerHTML = `<div class="page-heading"><div><div class="eyebrow">Логический помощник</div><h1>Разберём по шагам.</h1><p>Импортируй судоку и узнай, почему следующая цифра стоит именно здесь.</p></div>${saved?'<button class="btn primary" data-action="resume-helper">Вернуться к доске ↗</button>':''}</div>
      <div class="intro-layout"><section class="card"><label class="eyebrow" for="importText">Позиция · 9 строк по 9 клеток</label><textarea class="import-area" id="importText" spellcheck="false" aria-describedby="importHelp" placeholder="53..7....&#10;6..195...&#10;.98....6.&#10;8...6...3&#10;4..8.3..1&#10;7...2...6&#10;.6....28.&#10;...419..5&#10;....8..79"></textarea><p id="importHelp">1–9 — цифры. Точка, 0, ? или _ — пустая клетка. Пробелы и переносы игнорируются.</p><button class="btn primary" style="margin-top:20px" data-action="import-board">Загрузить позицию ↗</button><div class="form-status" id="formStatus" role="status"></div></section><aside class="card"><div class="eyebrow">Как работает помощник</div><h3>От простого к сложному</h3><p>Единственные кандидаты, пары и тройки, сокращения, X-Wing, Swordfish, XY-Wing и окрашивание.</p><hr class="divider"><p>Если логики недостаточно, поиск с возвратом проверит продолжение. Такой шаг отмечается отдельно и не выдаётся за логическое доказательство.</p><p>Импорт проверяется на конфликты и наличие решения. При нескольких решениях помощник предупредит об этом.</p></aside></div>`;
  }
  function importBoard() {
    try {
      const puzzle = S.parse($('importText').value), count = S.countSolutions(puzzle);
      if (!count) throw new Error('У этой позиции нет решения. Проверь исходные цифры.');
      const begin = () => {const g=P.game('helper',puzzle);profile.sessions.helper=g;persist();openGame(g);status(count===1?'Позиция загружена. Решение единственное.':'У позиции несколько решений. Поиск покажет одно из возможных продолжений.');};
      if (profile.sessions.helper && !profile.sessions.helper.finished) confirm('Загрузить новую позицию?', 'Текущая партия помощника будет заменена.', begin, 'Загрузить'); else begin();
    } catch(e) {$('formStatus').textContent=e.message;}
  }
  function openGame(g) {
    stop(); game = g; route = 'game'; selected = g.puzzle.findIndex(v=>!v); chrome(); renderGame(); window.scrollTo(0, 0);
  }
  function renderGame() {
    const l = levelFor(game), title = l ? l.title : game.mode === 'helper' ? 'Разбор позиции' : 'Свободная практика';
    $('main').innerHTML = `<div class="game-head"><button class="btn ghost" data-action="back" aria-label="Назад к выбору режима">←</button><div><div class="eyebrow">${l?'Глава I / '+l.label:game.mode==='helper'?'Помощник':'Практика'}</div><h2>${title}</h2></div></div>
      ${l?`<p class="game-objective">${l.type==='single'?'Задача: найди клетку с одним кандидатом. Достаточно одного доказанного хода.':l.type==='repair'?'Задача: одна из светлых цифр неверна. Найди и исправь подмену.':'Задача: заполни поле. Цифры не повторяются в строках, столбцах и блоках.'}</p>`:''}
      <div class="game-layout"><section aria-label="Игровая доска"><div class="game-metrics" id="gameMetrics"></div><div class="board" id="board" role="grid" aria-label="Судоку, 9 строк и 9 столбцов" aria-rowcount="9" aria-colcount="9"></div>
      <div class="numpad" id="numpad" aria-label="Ввод цифры"></div><div class="tools"><button class="btn" data-action="notes" id="notesBtn" aria-pressed="false"><span class="icon" aria-hidden="true">✎</span>Заметки</button><button class="btn" data-action="candidates" id="candidatesBtn" aria-pressed="false"><span class="icon" aria-hidden="true">⁙</span>Кандидаты</button><button class="btn" data-action="undo" id="undoBtn"><span class="icon" aria-hidden="true">↶</span>Отмена</button><button class="btn" data-action="erase" id="eraseBtn"><span class="icon" aria-hidden="true">⌫</span>Стереть</button></div>
      <div class="help-tools"><button class="btn" data-action="hint" id="hintBtn">✧ Подсказка</button><button class="btn" data-action="step" id="stepBtn">Применить шаг →</button></div><p class="game-status" id="gameStatus" role="status" aria-live="polite"></p></section>
      <aside class="game-aside"><section class="card mission-card"><div class="eyebrow">${l?'Входящая запись / ЭХО':'Рабочая область'}</div><h3>${l?'Связь установлена.':'Твоя логическая лаборатория'}</h3><div class="transmission"><p>${l?l.intro:'Решай самостоятельно или разбирай позицию по шагам. Здесь нет наград за автопрохождение и ограничений по времени.'}</p></div><hr class="divider"><div class="eyebrow">${l?'Задача уровня':'Инструменты'}</div><p style="margin-top:12px">${l?l.tutorial:'Заметки и кандидаты доступны бесплатно. При замене или стирании цифры исключения перестраиваются; отмена хода возвращает прежнее состояние полностью.'}</p></section>
      <section class="card hint-card" id="hintCard" hidden><div class="eyebrow">Следующий шаг</div><h3 id="hintTitle"></h3><p id="hintText"></p><button class="btn primary" data-action="step" id="hintApply">Применить →</button></section>
      <section class="card"><div class="side-actions"><button class="btn small ghost" data-action="restart" id="restartBtn">Начать заново</button><button class="btn small ghost" data-action="copy">Копировать</button></div><button class="btn ghost" data-action="solve" id="solveBtn" style="width:100%;margin-top:10px">▶ Посмотреть разбор</button><label class="speed" for="speed">Скорость<input id="speed" type="range" min="1" max="5" value="${speed}"><span id="speedLabel">×${speed}</span></label><p class="key-help">1–9 — ввод · стрелки — выбор клетки<br>N — заметки · Delete — стереть · Ctrl/Cmd+Z — отмена</p></section></aside></div>`;
    renderBoard();
    if (game.finished) status(game.demo?'Разбор завершён. Для самостоятельного прохождения начни уровень заново.':'Готово! Результат сохранён.');
  }
  function renderBoard() {
    if (route !== 'game' || !$('board')) return;
    const focusBoard = document.activeElement && document.activeElement.classList.contains('cell');
    const values = game.board, effective = game.candidates;
    $('board').innerHTML = Array.from({length:9},(_,r)=>`<div class="board-row" role="row">${Array.from({length:9},(_,c)=>{
      const i=r*9+c, value=values[i], m=game.showCandidates?effective[i]:game.notes[i];
      const classes=['cell',game.puzzle[i]?'given':'',i===selected?'selected':'',selected>=0&&S.PEERS[selected].includes(i)?'peer':'',selected>=0&&value&&values[selected]===value?'same':'',c===2||c===5?'block-right':'',r===2||r===5?'block-bottom':'',hint&&(hint.index===i||hint.cells.includes(i))?'hint':''].filter(Boolean).join(' ');
      const content=value||`<span class="pencil" aria-hidden="true">${Array.from({length:9},(_,n)=>`<span>${m&(1<<(n+1))?n+1:''}</span>`).join('')}</span>`;
      return `<button class="${classes}" role="gridcell" id="cell-${i}" data-action="cell" data-index="${i}" aria-rowindex="${r+1}" aria-colindex="${c+1}" aria-selected="${i===selected}" aria-readonly="${!!game.puzzle[i]}" aria-label="Строка ${r+1}, столбец ${c+1}: ${value||'пусто'}${game.puzzle[i]?', исходная цифра':!value&&m?', кандидаты '+S.digits(m).join(', '):''}" tabindex="${i===selected || (selected<0&&i===0)?0:-1}">${content}</button>`;
    }).join('')}</div>`).join('');
    $('numpad').innerHTML=Array.from({length:9},(_,n)=>`<button class="num" data-action="number" data-value="${n+1}" aria-label="Ввести ${n+1}" ${busy||game.finished?'disabled':''}>${n+1}<small aria-hidden="true">${Math.max(0,9-values.filter(v=>v===n+1).length)}</small></button>`).join('');
    const l=levelFor(game);
    $('gameMetrics').innerHTML=`<span>${l&&l.type==='single'?'ОДИН ДОКАЗАННЫЙ ХОД':values.filter(Boolean).length+' / 81 ЯЧЕЕК'}</span><span>Ошибки: ${game.mistakes} · Подсказки: ${game.hints}</span>`;
    for(const [id,on] of [['notesBtn',game.noteMode],['candidatesBtn',game.showCandidates]]) {$(id).classList.toggle('active',on);$(id).setAttribute('aria-pressed',String(on));}
    ['notesBtn','candidatesBtn','eraseBtn','hintBtn','stepBtn','restartBtn','hintApply'].forEach(id=>{if($(id))$(id).disabled=busy||game.finished;});
    $('restartBtn').disabled=busy;
    $('undoBtn').disabled=busy||!game.history.length||game.finished;
    $('solveBtn').textContent=busy?'■ Остановить разбор':'▶ Посмотреть разбор';
    $('solveBtn').disabled=game.finished;
    if(focusBoard&&selected>=0) $('cell-'+selected).focus({preventScroll:true});
  }
  function status(text, bad=false) {if($('gameStatus')){$('gameStatus').textContent=text;$('gameStatus').classList.toggle('bad',bad);}}
  function clearHint() {hint=null;if($('hintCard'))$('hintCard').hidden=true;}
  function snapshot() {game.history.push({...S.clone(game),notes:[...game.notes]});if(game.history.length>30)game.history.shift();}
  function mutateCell(i, n) {
    const old=game.board[i];
    if(!old&&n){game.board[i]=n;game.candidates[i]=0;for(const j of S.PEERS[i])game.candidates[j]&=~(1<<n);}
    else {game.board[i]=n;game.candidates=S.candidates(game.board);}
    game.notes[i]=0;
    if(n)for(const j of S.PEERS[i])game.notes[j]&=~(1<<n);
  }
  function input(n) {
    if(route!=='game'||busy||game.finished||selected<0||game.puzzle[selected])return;
    const i=selected;
    if(game.noteMode&&n){
      if(game.board[i])return;
      snapshot();game.notes[i]^=1<<n;game.showCandidates=false;clearHint();persist();renderBoard();return;
    }
    if(game.board[i]===n && (n || !game.notes[i]))return;
    if(n){
      const conflict=S.PEERS[i].some(j=>game.board[j]===n);
      const expected=game.mode==='helper'?null:solution(game);
      if(conflict||(expected&&expected[i]!==n)){
        game.mistakes++;persist();renderBoard();$('cell-'+i).classList.add('error');
        const el=$('cell-'+i);setTimeout(()=>el.classList.remove('error'),450);
        status(conflict?'Эта цифра уже есть в строке, столбце или блоке.':'Эта цифра не подходит к решению. Попробуй проверить кандидатов.',true);return;
      }
      const l=levelFor(game);
      if(l&&l.type==='single'&&S.digits(S.candidates(l.puzzle)[i]).length!==1){status('Для этого задания выбери клетку, у которой в исходной позиции ровно один кандидат.');return;}
    }
    snapshot();mutateCell(i,n);clearHint();persist();renderBoard();status(n?'Ход сохранён.':'Клетка очищена. Исключения кандидатов пересчитаны.');complete();
  }
  function undo() {
    if(!game||busy||game.finished||!game.history.length)return;
    const old=game.history.pop();game.board=old.board;game.candidates=old.candidates;game.notes=old.notes;
    clearHint();persist();renderBoard();status('Ход отменён. Ошибки и использованные подсказки остаются в статистике.');
  }
  function findHint() {
    const l=levelFor(game);
    if(l&&l.type==='repair'){
      const solved=solution(game),i=game.board.findIndex((v,j)=>v!==solved[j]);
      return i<0?null:{index:i,value:solved[i],technique:'Восстановление записи',explanation:`Проверь ${S.pos(i)}: по строке, столбцу и блоку здесь нужна цифра ${solved[i]}.`,cells:[i,...S.PEERS[i]],removals:[],repair:true};
    }
    return S.next(game);
  }
  function showHint() {
    if(!game||busy||game.finished)return;
    try{
      if(!hint){hint=findHint();if(hint){game.hints++;persist();}}
      if(!hint){complete();return;}
      $('hintCard').hidden=false;$('hintTitle').textContent=hint.technique;$('hintText').textContent=hint.explanation;
      renderBoard();status('Подсказка доступна справа или под доской. Её использование не блокирует сюжет.');
    }catch(e){status(e.message,true);}
  }
  function execute(step) {
    snapshot();
    if(step.repair)mutateCell(step.index,step.value);
    else {S.apply(game,step);if(step.index!==null){game.notes[step.index]=0;for(const j of S.PEERS[step.index])game.notes[j]&=~(1<<step.value);}else game.showCandidates=true;}
    if(step.index!==null)selected=step.index;
  }
  function applyHint() {
    if(!game||busy||game.finished)return;
    if(!hint)showHint();if(!hint)return;
    try{const step=hint;execute(step);clearHint();persist();renderBoard();status(step.technique+': '+step.explanation);complete();}
    catch(e){clearHint();status(e.message,true);}
  }
  function complete() {
    if(!game||game.finished||!P.goal(game))return false;
    game.finished=true;busy=false;
    let earned={xp:0,stars:0};
    if(game.mode==='story')earned=P.reward(profile,game.levelId,game);
    persist();chrome();renderBoard();
    const l=levelFor(game),index=l?C.levels.indexOf(l):-1;
    if(game.demo){
      openDialog(`<div class="eyebrow">Разбор завершён</div><h2 id="dialogTitle">Теперь твой ход.</h2><p>Автоматический разбор не приносит звёзд и опыта и не открывает следующий уровень. Начни заново, чтобы решить самостоятельно. Обычными подсказками пользоваться можно.</p><div class="dialog-actions"><button class="btn" data-action="close-dialog">К доске</button><button class="btn primary" data-action="restart-now">Попробовать самому</button></div>`);
    }else if(l){
      openDialog(`<div class="eyebrow">${index===5?'Глава I завершена':'Запись восстановлена'}</div><h2 id="dialogTitle">${index===5?'Первый сигнал принят.':'Ещё один шаг к разгадке.'}</h2><div class="stars" aria-label="${earned.stars} из 3 звёзд">${stars(earned.stars)}</div><p>★ За прохождение · ${game.mistakes===0?'★':'☆'} Без ошибок · ${game.hints===0?'★':'☆'} Без подсказок</p><div class="reward">${earned.xp?'+'+earned.xp+' XP':'Рекорд обновлён · опыт уже получен'}</div><p>${l.outro}</p>${index===5?'<p style="margin-top:14px">Продолжение истории — в следующих обновлениях. Доступно повторное прохождение на три звезды.</p>':''}<div class="dialog-actions"><button class="btn" data-action="map">К карте</button>${index<5?`<button class="btn primary" data-action="next-level" data-index="${index+1}">Дальше →</button>`:'<button class="btn primary" data-action="open-profile">Мой прогресс ↗</button>'}</div>`);
    }else{
      openDialog('<div class="eyebrow">Головоломка решена</div><h2 id="dialogTitle">Всё на своих местах.</h2><p>Все строки, столбцы и блоки проверены. В практике и помощнике сюжетный опыт не начисляется.</p><div class="dialog-actions"><button class="btn" data-action="close-dialog">К доске</button><button class="btn primary" data-route="practice">Новая практика ↗</button></div>');
    }
    status(game.demo?'Разбор завершён без награды.':'Решено! Результат сохранён.');return true;
  }
  function restart() {
    if(!game)return;
    stop();
    const old=game,l=levelFor(old);
    const g=P.game(old.mode,old.puzzle,old.levelId,l&&l.initial?l.initial:old.puzzle);
    profile.sessions[g.mode]=g;persist();openGame(g);
  }
  async function autoSolve() {
    if(!game||game.finished)return;
    if(busy){stop();persist();renderBoard();status('Разбор остановлен. Эта попытка остаётся демонстрационной.');return;}
    const begin=async()=>{
      clearHint();game.demo=true;persist();busy=true;const token=++run;const active=game;renderBoard();
      try{
        let steps=0;
        while(run===token&&game===active&&!P.goal(game)&&steps++<1000){
          const step=findHint();if(!step)break;execute(step);persist();renderBoard();status(step.technique+': '+step.explanation);
          await new Promise(resolve=>setTimeout(resolve,Math.max(25,550/(speed*speed))));
        }
        if(run!==token||game!==active)return;
        busy=false;renderBoard();
        if(!complete())status('Разбор не завершён: решение не подтверждено. Проверь позицию или отмени ошибочные ходы.',true);
      }catch(e){if(run===token){busy=false;renderBoard();status(e.message,true);}}
    };
    confirm('Посмотреть автоматический разбор?', 'Эта попытка станет демонстрационной, даже если остановить анимацию. Для звёзд и опыта понадобится начать уровень заново.',begin,'Показать разбор');
  }
  async function copyBoard() {
    const text=S.format(game.board);
    try{
      if(!navigator.clipboard)throw Error();
      await navigator.clipboard.writeText(text);toast('Позиция скопирована.');
    }catch(_){
      openDialog(`<div class="eyebrow">Экспорт позиции</div><h2 id="dialogTitle">Скопируй поле.</h2><p>Браузер не разрешил доступ к буферу. Выдели текст ниже и скопируй вручную.</p><textarea class="import-area" id="copyText" readonly aria-label="Позиция судоку">${text}</textarea><div class="dialog-actions"><button class="btn primary" data-action="close-dialog">Готово</button></div>`);
      $('copyText').focus();$('copyText').select();
    }
  }
  function renderProfile() {
    const info=P.summary(profile),themes=[['lime','Архив','#dcfa83',0],['amber','Янтарь','#ffd580',150],['cyan','Сигнал','#91e9e2',350],['violet','Память','#d7b8ff',650]];
    $('main').innerHTML=`<div class="page-heading"><div><div class="eyebrow">Личное дело</div><h1>Архивариус — это ты.</h1><p>Твои открытия, освоенные приёмы и восстановленные записи.</p></div><button class="btn ghost" data-route="history">К карте глав ↗</button></div>
      <div class="profile-grid"><section class="card"><div class="eyebrow">Ранг / ${info.xp} XP</div><div class="profile-rank">${info.rank.name}</div><p>${info.nextRank?'До ранга «'+info.nextRank.name+'» — '+(info.nextRank.xp-info.xp)+' XP.':'Максимальный ранг.'}</p><div class="progress" role="progressbar" aria-label="Опыт до следующего ранга" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${info.nextRank?Math.floor((info.xp-info.rank.xp)/(info.nextRank.xp-info.rank.xp)*100):100}"><span style="width:${info.nextRank?(info.xp-info.rank.xp)/(info.nextRank.xp-info.rank.xp)*100:100}%"></span></div><hr class="divider"><p>100 XP за первое прохождение уровня. Ещё 150 XP за всю главу. Повторы улучшают звёзды, а не дублируют опыт.</p><h3>Оформление терминала</h3><div class="themes">${themes.map(([key,name,color,xp])=>`<button class="theme-btn" style="background:${color}" data-action="theme" data-theme="${key}" ${info.xp<xp?'disabled':''} aria-pressed="${profile.theme===key}" aria-label="Тема ${name}${info.xp<xp?', откроется за '+xp+' XP':''}" title="${name} · ${xp} XP">${profile.theme===key?'✓':info.xp<xp?'·':''}</button>`).join('')}</div><p>Новые темы: 150, 350 и 650 XP. Оформление не меняет правила.</p></section>
      <section class="card"><div class="eyebrow">Мастерство</div><h3>Единственный кандидат <span class="tag">${profile.mastery?'Освоен':'Тренируем'}</span></h3><p>${profile.mastery?'Ты самостоятельно нашёл доказанный ход в специальном задании.':'Пройди «Один точный ход» без ошибок и подсказок, чтобы подтвердить освоение.'}</p><hr class="divider"><div class="eyebrow">Сохранение прогресса</div><h3>${info.done} / 6 уровней · ${info.stars} / 18 ★</h3><p>Прогресс хранится только в этом браузере. Для переноса или резервной копии экспортируй JSON-файл. Аккаунт не нужен.</p><div class="side-actions" style="margin-top:18px"><button class="btn" data-action="export-save">↓ Экспорт</button><button class="btn" data-action="import-save">↑ Импорт</button></div><button class="btn small ghost danger" data-action="reset" style="margin-top:14px">Сбросить прогресс</button></section></div>
      <section class="journal"><div class="section-heading"><h2>Журнал архива</h2><p>${info.done} восстановленных записей</p></div>${C.levels.map((l,i)=>profile.completed[l.id]?`<details><summary><span class="accent mono">0${i+1}</span> / ${l.title} <span class="stars">${stars(profile.completed[l.id])}</span></summary><p>${l.intro}</p><p>${l.outro}</p></details>`:`<details><summary class="muted">0${i+1} / Запись зашифрована</summary><p>Откроется после прохождения уровня «${l.title}».</p></details>`).join('')}</section>`;
  }
  function exportSave() {
    const blob=new Blob([JSON.stringify(profile,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='archive81-save.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast('Файл прогресса подготовлен.');
  }
  $('saveFile').addEventListener('change',async e=>{
    const file=e.target.files[0];e.target.value='';if(!file)return;
    try{
      if(file.size>2000000)throw new Error('Файл слишком большой. Максимум 2 МБ.');
      const imported=P.decode(await file.text()),info=P.summary(imported);
      confirm('Заменить текущий прогресс?',`В файле: ${info.done} уровней, ${info.stars} звёзд, ${info.xp} XP. Текущие данные будут заменены. Экспортируй их заранее, если нужна резервная копия.`,()=>{
        stop();profile=imported;game=null;storageBlocked=false;persist();navigate('profile');toast('Прогресс импортирован.');
      },'Заменить');
    }catch(e){toast(e.message);}
  });
  document.addEventListener('click',e=>{
    const b=e.target.closest('button,[data-route]');
    if(e.target.closest('.brand')){e.preventDefault();navigate('history');return;}
    if(!b||b.disabled)return;
    if(b.dataset.route){$('dialog').close();navigate(b.dataset.route);return;}
    const a=b.dataset.action;
    if(a==='close-dialog'){$('dialog').close();dialogAction=null;}
    else if(a==='confirm'){const fn=dialogAction;dialogAction=null;$('dialog').close();if(fn)fn();}
    else if(a==='continue-story'){const g=profile.sessions.story;if(g&&!g.finished)openGame(g);else startLevel(Math.max(0,C.levels.findIndex(l=>!profile.completed[l.id])));}
    else if(a==='level')startLevel(Number(b.dataset.index));
    else if(a==='generate')generate(b.dataset.difficulty);
    else if(a==='resume-practice')openGame(profile.sessions.practice);
    else if(a==='resume-helper')openGame(profile.sessions.helper);
    else if(a==='import-board')importBoard();
    else if(a==='back')navigate(game.mode==='story'?'history':game.mode);
    else if(a==='cell'&&!busy){selected=Number(b.dataset.index);clearHint();renderBoard();$('cell-'+selected).focus({preventScroll:true});}
    else if(a==='number')input(Number(b.dataset.value));
    else if(a==='erase')input(0);
    else if(a==='notes'||a==='candidates'){if(game&&!busy&&!game.finished){const k=a==='notes'?'noteMode':'showCandidates';game[k]=!game[k];persist();renderBoard();}}
    else if(a==='undo')undo();
    else if(a==='hint')showHint();
    else if(a==='step')applyHint();
    else if(a==='solve')autoSolve();
    else if(a==='copy')copyBoard();
    else if(a==='restart')confirm('Начать заново?','Ходы этой попытки будут сброшены. Полученные звёзды и опыт останутся.',restart,'Начать');
    else if(a==='restart-now'){$('dialog').close();restart();}
    else if(a==='map'){$('dialog').close();navigate('history');}
    else if(a==='next-level'){$('dialog').close();startLevel(Number(b.dataset.index));}
    else if(a==='open-profile'){$('dialog').close();navigate('profile');}
    else if(a==='theme'){profile.theme=b.dataset.theme;persist();chrome();renderProfile();}
    else if(a==='export-save')exportSave();
    else if(a==='import-save')$('saveFile').click();
    else if(a==='reset')confirm('Сбросить весь прогресс?','Главы, звёзды, опыт и сохранённые партии будут удалены из этого браузера. Это нельзя отменить без экспортированного файла.',()=>{stop();profile=P.fresh();game=null;storageBlocked=false;persist();navigate('profile');toast('Прогресс сброшен.');},'Сбросить');
  });
  document.addEventListener('input',e=>{if(e.target.id==='speed'){speed=Number(e.target.value);$('speedLabel').textContent='×'+speed;}});
  document.addEventListener('keydown',e=>{
    if(route!=='game'||busy||$('dialog').open||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)||e.target.isContentEditable)return;
    if(e.ctrlKey||e.metaKey){if(e.key.toLowerCase()==='z'){e.preventDefault();undo();}return;}
    if(/^[1-9]$/.test(e.key)){e.preventDefault();input(Number(e.key));}
    else if(['Delete','Backspace','0'].includes(e.key)){e.preventDefault();input(0);}
    else if(e.key.toLowerCase()==='n'){e.preventDefault();$('notesBtn').click();}
    else if(e.key.startsWith('Arrow')){
      e.preventDefault();const i=Math.max(0,selected),r=S.row(i),c=S.col(i);
      selected=e.key==='ArrowLeft'?r*9+Math.max(0,c-1):e.key==='ArrowRight'?r*9+Math.min(8,c+1):e.key==='ArrowUp'?Math.max(0,r-1)*9+c:Math.min(8,r+1)*9+c;
      clearHint();renderBoard();$('cell-'+selected).focus({preventScroll:true});
    }
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&busy){stop();persist();renderBoard();status('Разбор приостановлен: вкладка скрыта.');}});
  window.addEventListener('pagehide',persist);
  navigate(['#practice','#helper','#profile'].includes(location.hash)?location.hash.slice(1):'history');
})();

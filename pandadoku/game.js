(() => {
'use strict';
const $ = id => document.getElementById(id);

/* ============================================================
   SUDOKU ENGINE  (pure functions, no DOM)
   ============================================================ */

// Precompute the 20 peers (same row/col/box) for each of the 81 cells.
const PEERS = (() => {
  const out = [];
  for (let i = 0; i < 81; i++) {
    const r = Math.floor(i / 9), c = i % 9;
    const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
    const set = new Set();
    for (let k = 0; k < 9; k++) { set.add(r * 9 + k); set.add(k * 9 + c); }
    for (let rr = br; rr < br + 3; rr++)
      for (let cc = bc; cc < bc + 3; cc++) set.add(rr * 9 + cc);
    set.delete(i);
    out.push([...set]);
  }
  return out;
})();

// Target clue counts per difficulty. Robust fallback: generation never
// breaks uniqueness — if the target is unreachable it simply stops earlier.
const DIFFICULTY = { leicht: 40, mittel: 32, schwer: 25 };

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function isValid(g, i, v) {
  for (let k = 0; k < PEERS[i].length; k++) if (g[PEERS[i][k]] === v) return false;
  return true;
}

function getCandidates(g, i) {
  const used = new Set();
  const peers = PEERS[i];
  for (let k = 0; k < peers.length; k++) if (g[peers[k]]) used.add(g[peers[k]]);
  const res = [];
  for (let v = 1; v <= 9; v++) if (!used.has(v)) res.push(v);
  return res;
}

// Build a complete, valid, randomized solution via backtracking.
function generateFullGrid() {
  const g = new Array(81).fill(0);
  (function fill(i) {
    if (i === 81) return true;
    const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (let k = 0; k < 9; k++) {
      const v = nums[k];
      if (isValid(g, i, v)) { g[i] = v; if (fill(i + 1)) return true; g[i] = 0; }
    }
    return false;
  })(0);
  return g;
}

// Count solutions up to `limit` (used with limit=2 for a uniqueness test).
// Uses the MRV heuristic (fewest candidates first) for speed.
function countSolutions(grid, limit) {
  limit = limit || 2;
  const g = grid.slice();
  let count = 0;
  (function solve() {
    let best = -1, bestCands = null, bestLen = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i] === 0) {
        const cands = getCandidates(g, i);
        if (cands.length < bestLen) {
          bestLen = cands.length; best = i; bestCands = cands;
          if (bestLen <= 1) break;
        }
      }
    }
    if (best === -1) { count++; return count >= limit; }
    if (bestLen === 0) return false;
    for (let k = 0; k < bestCands.length; k++) {
      g[best] = bestCands[k];
      if (solve()) return true;
      g[best] = 0;
    }
    return false;
  })();
  return count;
}

// Return a fully solved copy of `grid`, or null if unsolvable.
function solveGrid(grid) {
  const g = grid.slice();
  const ok = (function solve() {
    let best = -1, bestCands = null, bestLen = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i] === 0) {
        const cands = getCandidates(g, i);
        if (cands.length < bestLen) {
          bestLen = cands.length; best = i; bestCands = cands;
          if (bestLen <= 1) break;
        }
      }
    }
    if (best === -1) return true;
    if (bestLen === 0) return false;
    for (let k = 0; k < bestCands.length; k++) {
      g[best] = bestCands[k];
      if (solve()) return true;
      g[best] = 0;
    }
    return false;
  })();
  return ok ? g : null;
}

// Produce a uniquely-solvable puzzle by digging holes out of a full grid.
function generatePuzzle(difficulty) {
  const solution = generateFullGrid();
  const puzzle = solution.slice();
  const target = DIFFICULTY[difficulty] || DIFFICULTY.mittel;
  const order = shuffle([...Array(81).keys()]);
  let clues = 81;
  for (let k = 0; k < order.length; k++) {
    if (clues <= target) break;
    const idx = order[k];
    const backup = puzzle[idx];
    if (backup === 0) continue;
    puzzle[idx] = 0;
    if (countSolutions(puzzle, 2) !== 1) puzzle[idx] = backup; // restore → keep unique
    else clues--;
  }
  return { puzzle, solution, clues };
}

/* ============================================================
   GAME STATE
   ============================================================ */
let board, puzzle, solution, givens, notes, errors;
let selected = -1, noteMode = false, hintsLeft = 3, mistakes = 0;
let history = [], redoStack = [];
let status = 'playing';                 // 'playing' | 'paused' | 'won'
let difficulty = 'mittel';
let elapsed = 0, runningSince = null;   // aktive Millisekunden + Abschnittsstart
let genToken = 0;                        // guards overlapping generations
const STORAGE_KEY = 'pandadoku-save-v1';

/* ============================================================
   DOM BUILD  (no innerHTML anywhere)
   ============================================================ */
const boardEl = $('board');
const cells = [];
(function buildBoard() {
  for (let i = 0; i < 81; i++) {
    const r = Math.floor(i / 9), c = i % 9;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cell';
    btn.tabIndex = i === 0 ? 0 : -1;
    btn.setAttribute('role', 'gridcell');
    btn.setAttribute('aria-selected', 'false');
    if (c % 3 === 2 && c !== 8) btn.classList.add('sep-r');
    if (r % 3 === 2 && r !== 8) btn.classList.add('sep-b');
    btn.dataset.i = String(i);
    const val = document.createElement('span');
    val.className = 'val';
    const notesDiv = document.createElement('div');
    notesDiv.className = 'notes';
    const noteSpans = [];
    for (let n = 1; n <= 9; n++) {
      const s = document.createElement('span');
      notesDiv.appendChild(s);
      noteSpans.push(s);
    }
    btn.appendChild(val);
    btn.appendChild(notesDiv);
    btn.addEventListener('click', () => selectCell(i));
    cells.push({ btn, val, noteSpans });
    boardEl.appendChild(btn);
  }
})();

/* ============================================================
   SNAPSHOT / RESTORE  (for undo/redo)
   ============================================================ */
function snapshot() {
  return {
    board: board.slice(),
    notes: notes.map(s => new Set(s)),
    errors: errors.slice(),
    hintsLeft, mistakes
  };
}
function restore(s) {
  board = s.board.slice();
  notes = s.notes.map(x => new Set(x));
  errors = s.errors.slice();
  hintsLeft = s.hintsLeft;
  mistakes = s.mistakes;
}
function pushHistory() {
  history.push(snapshot());
  redoStack = [];
  if (history.length > 300) history.shift();
}

/* ============================================================
   DEFENSIVE PERSISTENCE
   ============================================================ */
function encodeSnapshot(s) {
  return { board: s.board, notes: s.notes.map(set => [...set]), errors: s.errors, hintsLeft: s.hintsLeft, mistakes: s.mistakes };
}
function decodeSnapshot(raw, fixed) {
  if (!raw || !Array.isArray(raw.board) || raw.board.length !== 81 || !Array.isArray(raw.notes) || raw.notes.length !== 81 || !Array.isArray(raw.errors) || raw.errors.length !== 81) return null;
  const snapBoard = raw.board.map(Number);
  if (snapBoard.some((value, i) => !Number.isInteger(value) || value < 0 || value > 9 || (fixed[i] && value !== puzzle[i]))) return null;
  const snapNotes = raw.notes.map((values, i) => {
    if (!Array.isArray(values) || fixed[i] || snapBoard[i]) return new Set();
    return new Set(values.filter(value => Number.isInteger(value) && value >= 1 && value <= 9));
  });
  return {
    board: snapBoard,
    notes: snapNotes,
    errors: raw.errors.map((value, i) => value === true && !fixed[i] && snapBoard[i] !== 0),
    hintsLeft: Number.isInteger(raw.hintsLeft) ? Math.max(0, Math.min(3, raw.hintsLeft)) : 3,
    mistakes: Number.isInteger(raw.mistakes) ? Math.max(0, Math.min(1000000, raw.mistakes)) : 0
  };
}

let saveTimer = 0;
function saveGame() {
  if (!puzzle || !board || !solution) return;
  const payload = {
    version: 1, difficulty, puzzle, solution, board,
    notes: notes.map(set => [...set]), errors,
    selected, noteMode, hintsLeft, mistakes, status,
    elapsedMs: getElapsedMs(),
    history: history.slice(-100).map(encodeSnapshot),
    redo: redoStack.slice(-100).map(encodeSnapshot)
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch (_error) { /* optional */ }
}
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = 0; saveGame(); }, 220);
}
function flushSave() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
  saveGame();
}
function loadGame() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!data || data.version !== 1 || !DIFFICULTY[data.difficulty]) return false;
    if (!Array.isArray(data.puzzle) || data.puzzle.length !== 81 || !Array.isArray(data.solution) || data.solution.length !== 81) return false;
    const loadedPuzzle = data.puzzle.map(Number), loadedSolution = data.solution.map(Number);
    if (loadedPuzzle.some(v => !Number.isInteger(v) || v < 0 || v > 9) || loadedSolution.some(v => !Number.isInteger(v) || v < 1 || v > 9)) return false;
    if (countSolutions(loadedPuzzle, 2) !== 1) return false;
    const solved = solveGrid(loadedPuzzle);
    if (!solved || solved.some((value, i) => value !== loadedSolution[i])) return false;
    puzzle = loadedPuzzle; solution = loadedSolution; givens = puzzle.map(v => v !== 0);
    const current = decodeSnapshot({ board: data.board, notes: data.notes, errors: data.errors, hintsLeft: data.hintsLeft, mistakes: data.mistakes }, givens);
    if (!current) return false;
    board = current.board; notes = current.notes; errors = current.errors;
    hintsLeft = current.hintsLeft; mistakes = current.mistakes;
    difficulty = data.difficulty;
    selected = Number.isInteger(data.selected) && data.selected >= -1 && data.selected < 81 ? data.selected : -1;
    noteMode = data.noteMode === true;
    const complete = board.every((value, i) => value === solution[i]);
    status = data.status === 'won' && complete ? 'won' : data.status === 'paused' ? 'paused' : 'playing';
    elapsed = Number.isFinite(data.elapsedMs) ? Math.max(0, Math.min(31536000000, data.elapsedMs)) : 0;
    runningSince = status === 'playing' ? Date.now() : null;
    history = Array.isArray(data.history) ? data.history.map(item => decodeSnapshot(item, givens)).filter(Boolean).slice(-100) : [];
    redoStack = Array.isArray(data.redo) ? data.redo.map(item => decodeSnapshot(item, givens)).filter(Boolean).slice(-100) : [];
    return true;
  } catch (_error) { return false; }
}

/* ============================================================
   ACTIONS
   ============================================================ */
function selectCell(i) {
  if (status !== 'playing') return;
  selected = i;
  cells[i].btn.focus();
  render();
}

function enterNumber(v) {
  if (status !== 'playing' || selected < 0) return;
  if (givens[selected]) { announce('Dieses Feld ist fest vorgegeben.'); return; }
  if (noteMode) {
    if (board[selected] !== 0) return;
    pushHistory();
    const ns = notes[selected];
    if (ns.has(v)) ns.delete(v); else ns.add(v);
    render();
    return;
  }
  if (board[selected] === v) {          // same digit → clear (toggle)
    pushHistory();
    board[selected] = 0;
    errors[selected] = false;
    render();
    return;
  }
  pushHistory();
  board[selected] = v;
  notes[selected].clear();
  if (v !== solution[selected]) { errors[selected] = true; mistakes++; }
  else errors[selected] = false;
  render();
  checkWin();
}

function clearCell() {
  if (status !== 'playing' || selected < 0 || givens[selected]) return;
  if (board[selected] === 0 && notes[selected].size === 0) return;
  pushHistory();
  board[selected] = 0;
  errors[selected] = false;
  notes[selected].clear();
  render();
}

function moveSelection(dr, dc) {
  if (status !== 'playing') return;
  if (selected < 0) { selected = 40; }   // fall back to centre cell
  let r = Math.floor(selected / 9) + dr;
  let c = (selected % 9) + dc;
  r = Math.max(0, Math.min(8, r));
  c = Math.max(0, Math.min(8, c));
  selected = r * 9 + c;
  cells[selected].btn.focus();
  render();
}

function toggleNotes() {
  if (status !== 'playing') return;
  noteMode = !noteMode;
  render();
  announce(noteMode ? 'Notizmodus an: Kandidaten setzen.' : 'Notizmodus aus.');
}

function hint() {
  if (status !== 'playing') return;
  if (hintsLeft <= 0) { announce('Keine Hinweise mehr übrig.'); return; }
  let target = -1;
  if (selected >= 0 && !givens[selected] && board[selected] !== solution[selected]) target = selected;
  if (target < 0) {
    const empties = [];
    for (let i = 0; i < 81; i++) if (!givens[i] && board[i] !== solution[i]) empties.push(i);
    if (!empties.length) { announce('Alles ist korrekt – kein Hinweis nötig.'); return; }
    target = empties[Math.floor(Math.random() * empties.length)];
  }
  pushHistory();
  board[target] = solution[target];
  errors[target] = false;
  notes[target].clear();
  hintsLeft--;
  selected = target;
  cells[target].btn.focus();
  announce('Hinweis eingesetzt: ' + solution[target] + '. Noch ' + hintsLeft + ' übrig.');
  render();
  checkWin();
}

function undo() {
  if (status !== 'playing' || !history.length) {
    if (status === 'playing') announce('Nichts rückgängig zu machen.');
    return;
  }
  redoStack.push(snapshot());
  restore(history.pop());
  render();
  announce('Zug rückgängig gemacht.');
}

function redo() {
  if (status !== 'playing' || !redoStack.length) {
    if (status === 'playing') announce('Nichts wiederherzustellen.');
    return;
  }
  history.push(snapshot());
  restore(redoStack.pop());
  render();
  announce('Zug wiederhergestellt.');
}

function togglePause() {
  if (status === 'won') return;
  if (status === 'playing') {
    pauseTimer();
    status = 'paused';
    $('pause-overlay').hidden = false;
    $('pause-btn').textContent = '▶ Weiter';
    render();
    $('resume-btn').focus();
  } else if (status === 'paused') {
    status = 'playing';
    runningSince = Date.now();
    $('pause-overlay').hidden = true;
    $('pause-btn').textContent = '⏸ Pause';
    render();
    queueMicrotask(() => $('pause-btn').focus());
  }
}

function restart() {
  genToken++;
  if (!puzzle) return;
  board = puzzle.slice();
  givens = puzzle.map(v => v !== 0);
  notes = Array.from({ length: 81 }, () => new Set());
  errors = new Array(81).fill(false);
  selected = -1; noteMode = false; hintsLeft = 3; mistakes = 0;
  history = []; redoStack = [];
  status = 'playing'; elapsed = 0; runningSince = Date.now();
  $('result').hidden = true;
  $('pause-overlay').hidden = true;
  $('pause-btn').textContent = '⏸ Pause';
  updateTimerDisplay();
  render();
  announce('Neustart: dasselbe Rätsel.');
}

function newGame(diff) {
  if (diff) difficulty = diff;
  const token = ++genToken;
  announce('Generiere neues Rätsel …');
  // Defer so the status message can paint before the (blocking) generation.
  setTimeout(() => {
    if (token !== genToken) return;
    const res = generatePuzzle(difficulty);
    puzzle = res.puzzle;
    solution = res.solution;
    board = puzzle.slice();
    givens = puzzle.map(v => v !== 0);
    notes = Array.from({ length: 81 }, () => new Set());
    errors = new Array(81).fill(false);
    selected = -1; noteMode = false; hintsLeft = 3; mistakes = 0;
    history = []; redoStack = [];
    status = 'playing'; elapsed = 0; runningSince = Date.now();
    $('result').hidden = true;
    $('pause-overlay').hidden = true;
    $('pause-btn').textContent = '⏸ Pause';
    updateTimerDisplay();
    render();
    announce('Neues Rätsel (' + difficulty + ', ' + countClues() + ' Vorgaben).');
  }, 20);
}

/* ============================================================
   WIN + TIMER
   ============================================================ */
function checkWin() {
  for (let i = 0; i < 81; i++) if (board[i] !== solution[i]) return;
  status = 'won';
  pauseTimer();
  $('result-title').textContent = 'Pandadoku gelöst! 🎉';
  $('result-text').textContent =
    'Zeit: ' + formatTime(getElapsed()) +
    ' · Fehler: ' + mistakes +
    ' · Benutzte Hinweise: ' + (3 - hintsLeft) + '.';
  $('result').hidden = false;
  $('result-new-btn').focus();
  render();
}

function getElapsedMs() {
  return runningSince != null ? elapsed + (Date.now() - runningSince) : elapsed;
}
function getElapsed() { return Math.floor(getElapsedMs() / 1000); }
function pauseTimer() {
  if (runningSince != null) {
    elapsed += Date.now() - runningSince;
    runningSince = null;
  }
}
function formatTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor(sec / 60) % 60;
  const s = sec % 60;
  const p = n => String(n).padStart(2, '0');
  return h > 0 ? h + ':' + p(m) + ':' + p(s) : p(m) + ':' + p(s);
}
function updateTimerDisplay() { $('time').textContent = formatTime(getElapsed()); }
setInterval(() => { if (status === 'playing') updateTimerDisplay(); }, 500);

function countClues() {
  let n = 0;
  for (let i = 0; i < 81; i++) if (givens[i]) n++;
  return n;
}
function announce(text) { $('message').textContent = text; }

/* ============================================================
   RENDER
   ============================================================ */
function cellLabel(i) {
  const r = Math.floor(i / 9) + 1, c = (i % 9) + 1;
  const v = board[i];
  if (v) {
    let t = 'Feld Zeile ' + r + ', Spalte ' + c + ': ' + v;
    if (givens[i]) t += ' (vorgegeben)';
    if (errors[i]) t += ' (falsch)';
    return t;
  }
  const ns = notes[i];
  const txt = ns.size ? [...ns].join(', ') : 'leer';
  return 'Feld Zeile ' + r + ', Spalte ' + c + ': ' + txt;
}

function render() {
  const selVal = selected >= 0 ? board[selected] : 0;
  const activeCell = selected >= 0 ? selected : 0;
  const selPeers = selected >= 0 ? PEERS[selected] : null;
  for (let i = 0; i < 81; i++) {
    const c = cells[i];
    const v = board[i];
    let cls = 'cell';
    if (givens[i]) cls += ' given';
    if (v) cls += ' filled';
    if (i === selected) cls += ' selected';
    else if (selPeers && selPeers.indexOf(i) !== -1) cls += ' peer';
    if (selVal && v === selVal && i !== selected) cls += ' same';
    if (errors[i]) cls += ' error';
    c.btn.className = cls;
    if (v) {
      c.val.textContent = String(v);
    } else {
      c.val.textContent = '';
      const ns = notes[i];
      for (let n = 1; n <= 9; n++) c.noteSpans[n - 1].textContent = ns.has(n) ? String(n) : '';
    }
    c.btn.setAttribute('aria-label', cellLabel(i));
    c.btn.setAttribute('aria-selected', String(i === selected));
    c.btn.tabIndex = i === activeCell ? 0 : -1;
    c.btn.disabled = status !== 'playing';
  }

  $('mistakes').textContent = String(mistakes);
  $('hints-left').textContent = String(hintsLeft);
  $('status').textContent = status === 'playing' ? 'Läuft' : status === 'paused' ? 'Pausiert' : status === 'won' ? 'Gelöst' : '';

  $('undo-btn').disabled = history.length === 0 || status !== 'playing';
  $('redo-btn').disabled = redoStack.length === 0 || status !== 'playing';
  $('hint-btn').disabled = hintsLeft <= 0 || status !== 'playing';
  $('note-btn').setAttribute('aria-pressed', String(noteMode));

  for (const d of ['leicht', 'mittel', 'schwer']) {
    $('diff-' + d).setAttribute('aria-pressed', String(difficulty === d));
  }
  scheduleSave();
}

/* ============================================================
   EVENT WIRING
   ============================================================ */
for (let n = 1; n <= 9; n++) {
  $('num-' + n).addEventListener('click', () => {
    enterNumber(n);
    if (selected >= 0 && status === 'playing') cells[selected].btn.focus();
  });
}
$('erase').addEventListener('click', () => {
  clearCell();
  if (selected >= 0 && status === 'playing') cells[selected].btn.focus();
});
$('note-btn').addEventListener('click', toggleNotes);
$('hint-btn').addEventListener('click', hint);
$('undo-btn').addEventListener('click', undo);
$('redo-btn').addEventListener('click', redo);
$('pause-btn').addEventListener('click', togglePause);
$('restart-btn').addEventListener('click', restart);
$('new-btn').addEventListener('click', () => newGame());
$('diff-leicht').addEventListener('click', () => newGame('leicht'));
$('diff-mittel').addEventListener('click', () => newGame('mittel'));
$('diff-schwer').addEventListener('click', () => newGame('schwer'));
$('resume-btn').addEventListener('click', togglePause);
$('result-new-btn').addEventListener('click', () => newGame());
$('result-close-btn').addEventListener('click', () => { $('result').hidden = true; });

document.addEventListener('keydown', (e) => {
  const tag = (e.target && e.target.tagName) || '';
  // Im Ergebnisdialog bleiben Buttons vollständig nativ bedienbar.
  // Nur Escape ist ein globaler Dialogbefehl; Enter aktiviert den fokussierten Button.
  if ($('result').hidden === false) {
    if (e.key === 'Escape') { e.preventDefault(); $('result').hidden = true; }
    return;
  }
  // While paused: only P / Escape resume.
  if (status === 'paused') {
    if (e.key.toLowerCase() === 'p' || e.key === 'Escape') { e.preventDefault(); togglePause(); }
    return;
  }
  // Don't hijack keys while a form control is focused.
  if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;

  const k = e.key;
  if (k === 'ArrowLeft') { e.preventDefault(); moveSelection(0, -1); return; }
  if (k === 'ArrowRight') { e.preventDefault(); moveSelection(0, 1); return; }
  if (k === 'ArrowUp') { e.preventDefault(); moveSelection(-1, 0); return; }
  if (k === 'ArrowDown') { e.preventDefault(); moveSelection(1, 0); return; }
  if (k === 'Backspace' || k === 'Delete' || k === '0') { e.preventDefault(); clearCell(); return; }
  if (k >= '1' && k <= '9') { e.preventDefault(); enterNumber(Number(k)); return; }

  const l = k.toLowerCase();
  if (l === 'n') { e.preventDefault(); toggleNotes(); return; }
  if (l === 'r') { e.preventDefault(); restart(); return; }
  if (l === 'h') { e.preventDefault(); hint(); return; }
  if (l === 'p') { e.preventDefault(); togglePause(); return; }
  if (l === 'm') { e.preventDefault(); newGame(); return; }
});

/* ============================================================
   BOOT + PUBLIC API (for smoke tests)
   ============================================================ */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (status === 'playing') pauseTimer(); flushSave(); }
  else if (status === 'playing' && runningSince == null) runningSince = Date.now();
});
window.addEventListener('pagehide', () => { if (status === 'playing') pauseTimer(); flushSave(); });
window.addEventListener('pageshow', () => { if (status === 'playing' && runningSince == null) runningSince = Date.now(); });

if (loadGame()) {
  $('pause-overlay').hidden = status !== 'paused';
  $('pause-btn').textContent = status === 'paused' ? '▶ Weiter' : '⏸ Pause';
  $('result').hidden = status !== 'won';
  if (status === 'won') {
    $('result-title').textContent = 'Pandadoku gelöst! 🎉';
    $('result-text').textContent = 'Zeit: ' + formatTime(getElapsed()) + ' · Fehler: ' + mistakes + ' · Benutzte Hinweise: ' + (3 - hintsLeft) + '.';
  }
  updateTimerDisplay();
  render();
  announce(status === 'paused' ? 'Pausiertes Rätsel wiederhergestellt.' : 'Gespeichertes Rätsel wiederhergestellt.');
} else newGame('mittel');

window.PandaDoku = {
  // pure engine
  PEERS, DIFFICULTY,
  isValid, getCandidates, generateFullGrid,
  countSolutions, solveGrid, generatePuzzle,
  // game API
  newGame, restart, undo, redo, hint,
  togglePause, toggleNotes, selectCell, enterNumber,
  clearCell, moveSelection,
  getState: () => ({
    board: board ? board.slice() : null,
    puzzle: puzzle ? puzzle.slice() : null,
    solution: solution ? solution.slice() : null,
    givens: givens ? givens.slice() : null,
    errors: errors ? errors.slice() : null,
    notes: notes ? notes.map(s => [...s]) : null,
    status, difficulty, selected, noteMode, hintsLeft, mistakes,
    elapsed: getElapsed(), elapsedMs: getElapsedMs(),
    historyLength: history.length, redoLength: redoStack.length
  }),
  save: flushSave
};
})();

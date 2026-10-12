'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const playBtn = document.getElementById('play-btn');
const themeBtn = document.getElementById('theme-btn');
const recordBadge = document.getElementById('record-badge');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const saveBtn = document.getElementById('save-btn');
const recordsSection = document.getElementById('records');
const recordsBody = document.getElementById('records-body');
const recordsEmpty = document.getElementById('records-empty');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const resetRecordsBtn = document.getElementById('reset-records-btn');

const RECORDS_KEY = 'tetris-records';
const STATS_KEY = 'tetris-stats';
const NAME_KEY = 'tetris-player-name';
const MAX_RECORDS = 5;
const NAME_MAX = 12;

let theme, gridColor;
let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
// Por partida (los reinicia init())
let combo, maxComboThisGame, recordSaved, highlightIndex;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  return cleared;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  // Combo: piezas consecutivas que limpian al menos una línea
  if (clearLines() > 0) {
    combo++;
    maxComboThisGame = Math.max(maxComboThisGame, combo);
  } else {
    combo = 0;
  }
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // Antes de la primera partida no hay pieza actual
  if (!current) return;

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (!next) return;
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  if (gameOver) return;
  gameOver = true;
  cancelAnimationFrame(animId);
  draw();
  updateStats();
  showOverlay('gameover');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    overlay.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    showOverlay('pause');
  }
}

// ---- Records (localStorage) ----
// Los records y estadísticas persisten entre partidas: init() no los toca.

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null; // JSON corrupto o localStorage no disponible
  }
}

function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}

function toCount(n) {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function loadRecords() {
  const data = readJSON(RECORDS_KEY);
  if (!Array.isArray(data)) return [];
  return data
    .filter(r => r && typeof r === 'object' && Number.isFinite(r.score))
    .map(r => ({
      name: String(r.name ?? '').slice(0, NAME_MAX) || 'Anónimo',
      score: toCount(r.score),
      lines: toCount(r.lines),
      level: toCount(r.level) || 1,
      date: typeof r.date === 'string' ? r.date : '',
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RECORDS);
}

function loadStats() {
  const data = readJSON(STATS_KEY);
  const obj = data && typeof data === 'object' ? data : {};
  return { bestCombo: toCount(obj.bestCombo), maxLines: toCount(obj.maxLines) };
}

function updateStats() {
  const stats = loadStats();
  writeJSON(STATS_KEY, {
    bestCombo: Math.max(stats.bestCombo, maxComboThisGame),
    maxLines: Math.max(stats.maxLines, lines),
  });
}

function qualifies(value, records) {
  if (value <= 0) return false;
  return records.length < MAX_RECORDS || value > records[records.length - 1].score;
}

function saveRecord() {
  if (recordSaved || !gameOver) return;
  const records = loadRecords();
  if (!qualifies(score, records)) return;
  const name = nameInput.value.trim().slice(0, NAME_MAX) || 'Anónimo';
  try { localStorage.setItem(NAME_KEY, name); } catch (e) {}
  // Con empate, el record más antiguo queda por encima
  let idx = records.findIndex(r => r.score < score);
  if (idx === -1) idx = records.length;
  records.splice(idx, 0, { name, score, lines, level, date: new Date().toISOString() });
  writeJSON(RECORDS_KEY, records.slice(0, MAX_RECORDS));
  recordSaved = true;
  highlightIndex = idx;
  nameInput.blur();
  renderRecords();
}

function resetRecords() {
  if (!confirm('¿Borrar todos los records? Esta acción no se puede deshacer.')) return;
  try {
    localStorage.removeItem(RECORDS_KEY);
    localStorage.removeItem(STATS_KEY);
  } catch (e) {}
  highlightIndex = -1;
  // La tabla está vacía: la puntuación de esta partida puede volver a guardarse
  recordSaved = false;
  renderRecords();
}

// Pinta la tabla y las estadísticas; en game over también el badge y el
// campo de nombre (solo si la puntuación entra en el top y aún no se guardó).
function renderRecords() {
  const records = loadRecords();
  const stats = loadStats();

  recordsBody.replaceChildren();
  records.forEach((r, i) => {
    const tr = document.createElement('tr');
    if (i === highlightIndex) tr.classList.add('highlight');
    if (r.date) {
      const d = new Date(r.date);
      if (!isNaN(d)) tr.title = d.toLocaleString();
    }
    for (const text of [i + 1, r.name, r.score.toLocaleString(), r.lines, r.level]) {
      const td = document.createElement('td');
      td.textContent = text; // textContent: el nombre nunca se interpreta como HTML
      tr.appendChild(td);
    }
    recordsBody.appendChild(tr);
  });
  recordsEmpty.classList.toggle('hidden', records.length > 0);
  bestComboEl.textContent = stats.bestCombo;
  maxLinesEl.textContent = stats.maxLines;

  const isGameOver = overlay.dataset.mode === 'gameover';
  const canSave = isGameOver && !recordSaved && qualifies(score, records);
  const formWasHidden = nameForm.classList.contains('hidden');
  recordBadge.classList.toggle('hidden', !(canSave || (isGameOver && recordSaved)));
  nameForm.classList.toggle('hidden', !canSave);
  if (canSave && formWasHidden) {
    // Propone el último nombre usado
    let lastName = '';
    try { lastName = localStorage.getItem(NAME_KEY) || ''; } catch (e) {}
    nameInput.value = lastName.slice(0, NAME_MAX);
    nameInput.focus();
    // Cursor al final, sin seleccionar: si el game over llegó con un Space
    // (hard drop) mantenido, los espacios extra se recortan en saveRecord()
    // en lugar de sustituir el nombre propuesto.
    nameInput.setSelectionRange(nameInput.value.length, nameInput.value.length);
  }
}

// El overlay es compartido por la pantalla de inicio, la pausa y el game over
function showOverlay(mode) {
  overlay.dataset.mode = mode;
  const titles = { start: 'TETRIS', pause: 'PAUSA', gameover: 'GAME OVER' };
  overlayTitle.textContent = titles[mode];
  overlayScore.textContent = mode === 'gameover' ? `Puntuación: ${score.toLocaleString()}` : '';
  recordsSection.classList.toggle('hidden', mode === 'pause');
  playBtn.classList.toggle('hidden', mode !== 'start');
  restartBtn.classList.toggle('hidden', mode === 'start');
  recordBadge.classList.add('hidden');
  nameForm.classList.add('hidden');
  overlay.classList.remove('hidden');
  if (mode !== 'pause') renderRecords();
}

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  // Si endGame() se disparó en este frame no hay que reprogramar el loop
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  combo = 0;
  maxComboThisGame = 0;
  recordSaved = false;
  highlightIndex = -1;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // Mientras se escribe el nombre, las teclas no controlan el juego
  if (e.target instanceof HTMLInputElement) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

// El tema es una preferencia del usuario: init() no lo reinicia.
function applyTheme(newTheme, redraw) {
  theme = newTheme;
  document.documentElement.dataset.theme = theme;
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
  const isDark = theme === 'dark';
  themeBtn.textContent = isDark ? '☀️ Modo claro' : '🌙 Modo oscuro';
  themeBtn.setAttribute('aria-label', isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
  try { localStorage.setItem('tetris-theme', theme); } catch (e) {}
  // En pausa o game over el loop está detenido, así que se redibuja a mano
  if (redraw) {
    draw();
    drawNext();
  }
}

themeBtn.addEventListener('click', () => {
  applyTheme(theme === 'dark' ? 'light' : 'dark', true);
  themeBtn.blur(); // evita que Space vuelva a pulsar el botón
});

function startGame(e) {
  e.currentTarget.blur(); // evita que Space vuelva a pulsar el botón
  init();
}

restartBtn.addEventListener('click', startGame);
playBtn.addEventListener('click', startGame);

nameForm.addEventListener('submit', e => {
  e.preventDefault(); // Enter en el campo también envía el formulario
  saveRecord();
  saveBtn.blur();
});

resetRecordsBtn.addEventListener('click', () => {
  resetRecordsBtn.blur();
  resetRecords();
});

let savedTheme = null;
try { savedTheme = localStorage.getItem('tetris-theme'); } catch (e) {}
applyTheme(savedTheme === 'light' ? 'light' : 'dark', false);

// Pantalla de inicio: tablero vacío y overlay con los records. La partida no
// empieza hasta pulsar "Jugar"; gameOver = true bloquea el teclado y la pausa.
board = createBoard();
current = null;
next = null;
gameOver = true;
paused = false;
draw();
drawNext();
showOverlay('start');

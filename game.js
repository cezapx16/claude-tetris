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
const MIN_START_LEVEL = 1;
const MAX_START_LEVEL = 10;

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
const themeBtn = document.getElementById('theme-btn');
const gameOverBox = document.getElementById('gameover-box');
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const pauseControls = document.getElementById('pause-controls');
const startLevelEl = document.getElementById('start-level');
const levelDownBtn = document.getElementById('level-down');
const levelUpBtn = document.getElementById('level-up');

// Preferencias del usuario: init() no las reinicia.
let theme, gridColor, startLevel;
// Estado de la partida: init() lo reinicia todo.
let board, current, next, score, lines, level, baseLevel, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

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
    level = Math.max(baseLevel, Math.floor(lines / 10) + 1);
    dropInterval = speedForLevel(level);
    updateHUD();
  }
}

function speedForLevel(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
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
  clearLines();
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
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

// El overlay es compartido: muestra el menú de pausa o la caja de game over.
function showOverlay(mode) {
  pauseMenu.classList.toggle('hidden', mode !== 'pause');
  gameOverBox.classList.toggle('hidden', mode !== 'gameover');
  overlay.classList.remove('hidden');
}

function hideOverlay() {
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  setControlsVisible(false);
  // Un botón con foco se pulsaría con Space/Enter al volver al juego
  if (document.activeElement && overlay.contains(document.activeElement)) {
    document.activeElement.blur();
  }
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  showOverlay('gameover');
}

function pauseGame() {
  if (gameOver || paused) return;
  paused = true;
  cancelAnimationFrame(animId);
  showOverlay('pause');
}

function resumeGame() {
  if (gameOver || !paused) return;
  paused = false;
  hideOverlay();
  // Sin esto el tiempo pasado en pausa haría caer la pieza de golpe
  lastTime = performance.now();
  dropAccum = 0;
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

function togglePause() {
  if (paused) resumeGame();
  else pauseGame();
}

function setControlsVisible(visible) {
  pauseControls.classList.toggle('hidden', !visible);
  controlsBtn.setAttribute('aria-expanded', String(visible));
  controlsBtn.textContent = visible ? 'Ocultar controles' : 'Ver controles';
}

// El nivel inicial es una preferencia: se aplica en la próxima partida (init()).
function setStartLevel(lvl, persist) {
  startLevel = Math.min(MAX_START_LEVEL, Math.max(MIN_START_LEVEL, lvl));
  startLevelEl.textContent = startLevel;
  startLevelEl.setAttribute('aria-valuenow', startLevel);
  levelDownBtn.disabled = startLevel <= MIN_START_LEVEL;
  levelUpBtn.disabled = startLevel >= MAX_START_LEVEL;
  if (persist) {
    try { localStorage.setItem('tetris-start-level', String(startLevel)); } catch (e) {}
  }
}

// Navegación por teclado del menú de pausa (los inputs del juego no llegan aquí).
function handleMenuKey(e) {
  const items = [resumeBtn, pauseRestartBtn, controlsBtn, startLevelEl];
  const idx = items.indexOf(document.activeElement);
  switch (e.code) {
    case 'ArrowDown':
    case 'ArrowUp': {
      e.preventDefault();
      const step = e.code === 'ArrowDown' ? 1 : -1;
      const nextIdx = idx === -1
        ? (step === 1 ? 0 : items.length - 1)
        : (idx + step + items.length) % items.length;
      items[nextIdx].focus();
      break;
    }
    case 'ArrowLeft':
    case 'ArrowRight':
      e.preventDefault();
      if (document.activeElement === startLevelEl) {
        setStartLevel(startLevel + (e.code === 'ArrowRight' ? 1 : -1), true);
      }
      break;
    case 'Space':
    case 'Enter':
    case 'NumpadEnter': {
      // Solo activan el botón enfocado (menú o tema); sin foco no hacen nada
      const focused = document.activeElement;
      if (!focused || focused === document.body || focused === startLevelEl) e.preventDefault();
      break;
    }
  }
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
  draw();
  // lockPiece() may have ended the game; don't reschedule over endGame()'s cancel
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  baseLevel = startLevel;
  level = baseLevel;
  paused = false;
  gameOver = false;
  dropInterval = speedForLevel(level);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  hideOverlay();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') {
    e.preventDefault();
    if (!e.repeat) togglePause();
    return;
  }
  // Con el menú abierto los inputs del juego quedan bloqueados
  if (paused) { handleMenuKey(e); return; }
  if (gameOver) return;
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

// init() oculta el overlay y quita el foco de sus botones
restartBtn.addEventListener('click', init);
pauseRestartBtn.addEventListener('click', init);
resumeBtn.addEventListener('click', resumeGame);
controlsBtn.addEventListener('click', () => {
  setControlsVisible(pauseControls.classList.contains('hidden'));
});
levelDownBtn.addEventListener('click', () => setStartLevel(startLevel - 1, true));
levelUpBtn.addEventListener('click', () => setStartLevel(startLevel + 1, true));

let savedTheme = null;
try { savedTheme = localStorage.getItem('tetris-theme'); } catch (e) {}
applyTheme(savedTheme === 'light' ? 'light' : 'dark', false);

let savedStartLevel = NaN;
try { savedStartLevel = parseInt(localStorage.getItem('tetris-start-level'), 10); } catch (e) {}
setStartLevel(Number.isFinite(savedStartLevel) ? savedStartLevel : MIN_START_LEVEL, false);

init();

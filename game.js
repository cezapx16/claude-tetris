'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

// Cada skin define su paleta (indexada igual que los tipos de pieza, 1–8)
// y su propia forma de pintar un bloque. `grid` es opcional: si falta se usa
// el --grid del tema claro/oscuro. El fondo del tablero lo pone style.css
// según el atributo data-skin (solo neon lo sobrescribe).
const SKINS = {
  retro: {
    colors: [
      null,
      '#4dd0e1', // I - cyan
      '#ffd54f', // O - yellow
      '#ba68c8', // T - purple
      '#81c784', // S - green
      '#e57373', // Z - red
      '#90caf9', // J - pale blue
      '#ffb74d', // L - orange
      '#b0bec5', // N - tuerca (gris metálico)
    ],
    drawBlock: drawBlockRetro,
  },
  neon: {
    colors: [
      null,
      '#00f0ff', // I
      '#fff200', // O
      '#ff2bd6', // T
      '#39ff14', // S
      '#ff073a', // Z
      '#2f7bff', // J
      '#ff9100', // L
      '#e0e0ff', // N - tuerca
    ],
    grid: '#16162a',
    drawBlock: drawBlockNeon,
  },
  pastel: {
    colors: [
      null,
      '#a8e6ef', // I
      '#fff1a8', // O
      '#d7b8f3', // T
      '#b8e6c1', // S
      '#f7b2b7', // Z
      '#b9d4f7', // J
      '#ffd1a8', // L
      '#cfd8dc', // N - tuerca
    ],
    drawBlock: drawBlockPastel,
  },
  pixel: {
    colors: [
      null,
      '#00b8d4', // I
      '#f9d71c', // O
      '#9c27b0', // T
      '#43a047', // S
      '#e53935', // Z
      '#1e63c9', // J
      '#fb8c00', // L
      '#90a4ae', // N - tuerca
    ],
    drawBlock: drawBlockPixel,
  },
};

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N - tuerca: anillo 3x3 con hueco en el centro
];

const NUT = 8;

const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'KeyX', 'Space', 'KeyP']);

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
const themeBtn = document.getElementById('theme-btn');
const skinSelect = document.getElementById('skin-select');

let theme, gridColor, skinName, skin;
let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * (PIECES.length - 1)) + 1;
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

// Envoltorio común a todas las skins: aplica la transparencia (ghost) y
// restaura después el estado del contexto (globalAlpha, sombras, trazos).
function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.save();
  context.globalAlpha = alpha ?? 1;
  skin.drawBlock(context, x * size, y * size, size, skin.colors[colorIndex]);
  context.restore();
  context.globalAlpha = 1;
  context.shadowBlur = 0;
  context.shadowColor = 'transparent';
}

// Retro: cuadrados planos con un brillo en la parte superior
function drawBlockRetro(context, px, py, size, color) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(px + 1, py + 1, size - 2, 4);
}

// Neon: relleno tenue y contorno brillante con resplandor (shadowBlur)
function drawBlockNeon(context, px, py, size, color) {
  const baseAlpha = context.globalAlpha;
  context.globalAlpha = baseAlpha * 0.25;
  context.fillStyle = color;
  context.fillRect(px + 3, py + 3, size - 6, size - 6);
  context.globalAlpha = baseAlpha;
  context.shadowColor = color;
  context.shadowBlur = size * 0.5;
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(px + 4, py + 4, size - 8, size - 8);
}

// Rectángulo redondeado con arcTo (sin depender de ctx.roundRect)
function roundedRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

// Pastel: colores suaves, esquinas redondeadas y un borde claro
function drawBlockPastel(context, px, py, size, color) {
  roundedRectPath(context, px + 2, py + 2, size - 4, size - 4, size * 0.25);
  context.fillStyle = color;
  context.fill();
  context.strokeStyle = 'rgba(255,255,255,0.55)';
  context.lineWidth = 1.5;
  context.stroke();
}

// Pixel art: bloque con biselado en "píxeles" grandes y un tramado (dither)
function drawBlockPixel(context, px, py, size, color) {
  const n = 6;                  // rejilla de 6×6 píxeles por bloque
  const p = size / n;
  context.fillStyle = color;
  context.fillRect(px, py, size, size);
  // bisel: claro arriba/izquierda, oscuro abajo/derecha
  context.fillStyle = 'rgba(255,255,255,0.35)';
  context.fillRect(px, py, size, p);
  context.fillRect(px, py + p, p, size - p);
  context.fillStyle = 'rgba(0,0,0,0.35)';
  context.fillRect(px + p, py + size - p, size - p, p);
  context.fillRect(px + size - p, py + p, p, size - 2 * p);
  // tramado de tablero de ajedrez en el interior
  context.fillStyle = 'rgba(0,0,0,0.15)';
  for (let r = 1; r < n - 1; r++)
    for (let c = 1; c < n - 1; c++)
      if ((r + c) % 2 === 0)
        context.fillRect(px + c * p, py + r * p, p, p);
  // contorno de 1px para separar bloques vecinos
  context.strokeStyle = 'rgba(0,0,0,0.5)';
  context.lineWidth = 1;
  context.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
}

// Decoración del hueco de la tuerca: solo visual, la celda central sigue vacía
function drawNutHole(context, x, y, size, alpha) {
  context.globalAlpha = alpha ?? 1;
  context.strokeStyle = skin.colors[NUT];
  context.lineWidth = 2;
  context.beginPath();
  context.arc((x + 0.5) * size, (y + 0.5) * size, size * 0.35, 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = skin.grid || gridColor;
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
  if (current.type === NUT) drawNutHole(ctx, current.x + 1, gy + 1, BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  if (current.type === NUT) drawNutHole(ctx, current.x + 1, current.y + 1, BLOCK);
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
  if (next.type === NUT) drawNutHole(nextCtx, offX + 1, offY + 1, NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
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
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // Si el selector de skin conserva el foco (Escape, Tab, mismo valor...),
  // una tecla de juego le quita el foco y se procesa como jugada normal en
  // vez de cambiar la skin. El resto de teclas siguen siendo del selector.
  if (e.target === skinSelect) {
    if (!GAME_KEYS.has(e.code)) return;
    e.preventDefault();
    skinSelect.blur();
  }
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

// La skin también es una preferencia: init() no la reinicia.
function applySkin(name, redraw) {
  skinName = Object.prototype.hasOwnProperty.call(SKINS, name) ? name : 'retro';
  skin = SKINS[skinName];
  // data-skin permite a style.css cambiar el fondo de los canvas (neon)
  document.documentElement.dataset.skin = skinName;
  skinSelect.value = skinName;
  try { localStorage.setItem('tetris-skin', skinName); } catch (e) {}
  if (redraw) {
    draw();
    drawNext();
  }
}

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value, true);
  skinSelect.blur(); // evita que flechas/Space sigan cambiando el selector
});

restartBtn.addEventListener('click', init);

let savedTheme = null;
try { savedTheme = localStorage.getItem('tetris-theme'); } catch (e) {}
applyTheme(savedTheme === 'light' ? 'light' : 'dark', false);

let savedSkin = null;
try { savedSkin = localStorage.getItem('tetris-skin'); } catch (e) {}
applySkin(savedSkin, false);

init();

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JavaScript Tetris on HTML5 Canvas. No dependencies, no `package.json`, no build step, no test suite, no linter. The README and all user-facing UI text are in Spanish — keep new UI strings in Spanish.

## Running

Open `index.html` directly in a browser, or serve the directory statically (preferred):

```bash
python -m http.server 8000   # then open http://localhost:8000
```

Verification is manual: load the page and play.

## Architecture

Three files: `index.html` (DOM: `#board` canvas, side panel HUD, `#next-canvas`, `#overlay` holding the pause menu and the game-over box), `style.css` (dark theme), and `game.js` (all logic, loaded as a classic script with `'use strict'` — no modules, all state is top-level `let` globals reset by `init()`).

Key conventions in `game.js`:

- **Cell values double as piece type and color index.** `PIECES[type]` matrices store the type number (1–8) in filled cells, `board` cells store the same number (0 = empty), and the active skin's palette `skin.colors[n]` maps it to a color. `merge()` copies shape values straight into `board`. Adding a piece type means adding an entry at the same index in `PIECES` **and in the `colors` array of every skin in `SKINS`** (retro, neon, pastel, pixel) (`randomPiece()` uses `PIECES.length - 1`, so no other change is needed). Type 8 is the "tuerca" (nut) challenge piece: a 3×3 ring whose center cell is 0; `drawNutHole()` paints a purely decorative circle in that hole (in the active skin's nut color) for the falling piece, ghost and preview.
- **`collide(shape, x, y)` is the single source of truth** for movement, rotation (with simple horizontal kicks `[0,-1,1,-2,2]` in `tryRotate`), ghost projection (`ghostY`), and game-over detection on `spawn()`. Rows with `y < 0` are allowed (above the board).
- **Piece lifecycle:** `lockPiece()` → `merge()` → `clearLines()` (updates score/lines/level/`dropInterval`) → `spawn()` (promotes `next` to `current`, rolls a new `next`, calls `endGame()` if the new piece collides immediately).
- **Game loop:** `loop(ts)` uses `requestAnimationFrame`, accumulates `dropAccum`, and stores the frame id in `animId`. Pause and game over stop the loop via `cancelAnimationFrame(animId)`. `loop` bails out early when `gameOver`/`paused` is set and skips rescheduling if the game ended during the frame (a cancel issued from inside the loop, e.g. `endGame()` via an auto-drop `lockPiece()`, would otherwise be overridden). `resumeGame()` resets `lastTime` and `dropAccum` before rescheduling. Keep this in mind when touching pause/game-over logic.
- **Rendering** is a full redraw each frame (`draw()`: grid → board → ghost at `globalAlpha 0.2` → current piece). `drawBlock()` is shared between the main and preview canvases; the preview is redrawn only on `spawn()`. The HUD (`updateHUD()`) is DOM text, updated on input and line clears.
- **Skins** (`SKINS` object: `retro`, `neon`, `pastel`, `pixel`). Each skin has `colors`, a per-skin block painter (`drawBlockRetro`/`Neon`/`Pastel`/`Pixel`, signature `(context, px, py, size, color)`) and an optional `grid` color that overrides the theme's `--grid` (only neon sets it). `drawBlock()` is the shared wrapper: it sets `globalAlpha` (ghost = 0.2) inside `save()`/`restore()` and resets alpha/shadow afterwards, so painters may freely set `shadowBlur` etc. Pastel's rounded corners use a manual `arcTo` path (`roundedRectPath`), not `ctx.roundRect`. The board/preview background comes from CSS: `applySkin()` sets `<html data-skin>` and `style.css` forces a black canvas background for neon; other skins follow the light/dark `--board-bg`.
- **Preferences** (theme, skin, start level) are not reset by `init()`. `applyTheme(theme, redraw)` / `applySkin(name, redraw)` / `setStartLevel(n, …)` persist to localStorage (`tetris-theme` / `tetris-skin` / `tetris-start-level`, wrapped in try/catch); with `redraw = true` theme/skin call `draw()` + `drawNext()` so changes show while paused or after game over. Controls are blurred after use (Space would re-trigger them), and if `#skin-select` still has focus (Escape, Tab, re-picking the same option) a key in `GAME_KEYS` is `preventDefault`ed, blurs the select and is handled as a normal key; other keys stay with the select.
- The `#overlay` is shared by the pause menu (`#pause-menu`) and the game-over box (`#gameover-box`); `showOverlay('pause'|'gameover')` picks which one is visible. `hideOverlay()` (called by `init()` and `resumeGame()`) hides it, collapses the controls list and blurs any focused overlay button so Space/Enter can't re-trigger it.
- **Pause menu:** `P`/`Escape` call `togglePause()` → `pauseGame()`/`resumeGame()`. While `paused`, the keydown handler routes every other key to `handleMenuKey()` (↑/↓ move focus, ←/→ change the start level, Space/Enter only activate a focused menu button), so game inputs are blocked.
- **Levels:** `startLevel` is a user preference (persisted in `localStorage` as `tetris-start-level`, not reset by `init()`); `init()` copies it into the per-game `baseLevel`. `level = max(baseLevel, floor(lines / 10) + 1)` and `dropInterval = speedForLevel(level)`, in both `init()` and `clearLines()`.

Board dimensions: `COLS × BLOCK` and `ROWS × BLOCK` must match the `width`/`height` attributes of `<canvas id="board">` in `index.html`.

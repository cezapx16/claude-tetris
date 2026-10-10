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

Three files: `index.html` (DOM: `#board` canvas, side panel HUD, `#next-canvas`, `#overlay`), `style.css` (dark theme), and `game.js` (all logic, loaded as a classic script with `'use strict'` — no modules, all state is top-level `let` globals reset by `init()`).

Key conventions in `game.js`:

- **Cell values double as piece type and color index.** `PIECES[type]` matrices store the type number (1–7) in filled cells, `board` cells store the same number (0 = empty), and `COLORS[n]` maps it to a color. `merge()` copies shape values straight into `board`. Adding a piece type means adding an entry at the same index in both `PIECES` and `COLORS` and updating the `* 7` in `randomPiece()`.
- **`collide(shape, x, y)` is the single source of truth** for movement, rotation (with simple horizontal kicks `[0,-1,1,-2,2]` in `tryRotate`), ghost projection (`ghostY`), and game-over detection on `spawn()`. Rows with `y < 0` are allowed (above the board).
- **Piece lifecycle:** `lockPiece()` → `merge()` → `clearLines()` (updates score/lines/level/`dropInterval`) → `spawn()` (promotes `next` to `current`, rolls a new `next`, calls `endGame()` if the new piece collides immediately).
- **Game loop:** `loop(ts)` uses `requestAnimationFrame`, accumulates `dropAccum`, and stores the frame id in `animId`. Pause and game over stop the loop via `cancelAnimationFrame(animId)`. Note that `loop` always reschedules itself at the end, so a cancel issued from inside the loop (e.g. `endGame()` reached through an auto-drop `lockPiece()`) gets overridden. Keep this in mind when touching pause/game-over logic.
- **Rendering** is a full redraw each frame (`draw()`: grid → board → ghost at `globalAlpha 0.2` → current piece). `drawBlock()` is shared between the main and preview canvases; the preview is redrawn only on `spawn()`. The HUD (`updateHUD()`) is DOM text, updated on input and line clears.
- The `#overlay` is shared by the pause and game-over states (title/score text is swapped). Only `init()` hides it.

Board dimensions: `COLS × BLOCK` and `ROWS × BLOCK` must match the `width`/`height` attributes of `<canvas id="board">` in `index.html`.

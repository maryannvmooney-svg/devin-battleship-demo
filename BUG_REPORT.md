# Bug report

These are the bugs actually found while building and testing this game, how each one was fixed, and how each fix was checked. Remaining limitations are listed separately at the end.

## Bugs found and fixed

### 1. Computer opponent switched to random guessing after some sinkings

- **How it was found:** A script simulated 500 complete games of the computer against randomly placed fleets. One game took **91 shots**, while the average was about 45.
- **Cause:** When two of the player's ships touch, the computer can't always tell which hit squares belonged to a ship it just sank. (For example, the Destroyer at B2–C2 sat next to the Cruiser at A3–C3.) One leftover square stayed marked as "hit, ship not yet sunk", but no remaining ship could fit through it. The computer's targeting logic found no useful moves around that square and fell back to **purely random** shots for the rest of the game, instead of its normal smart search.
- **Fix:** Before each shot, the computer now checks every leftover hit. If no remaining ship could cover that square, the square is treated as part of a ship that is already sunk (`retireOrphanHits` in `src/game.js`).
- **How the fix was checked:**
  - Added two regression tests in `tests/game.test.js`: one recreates the exact touching-ships situation, and one checks that no game out of 500 simulated games needs more than 80 shots. With the fix temporarily switched off, both tests **failed** (worst game: 91 shots). With the fix, both **pass**.
  - In a 1,000-game simulation, the worst game dropped from 91 to **69 shots**, with an average of about 45 (random guessing averages about 96).
  - The full test suite (25 tests) passes.

### 2. Board stuck out past the page margin on narrow phones

- **How it was found:** I measured the page in headless Chrome at 320px, 375px, and 390px widths and took screenshots. The "Your fleet" panel was wider than the space inside the page margins. At 375px its right edge was at 374px, which left a 1px margin on the right and 12px on the left, so the board looked shoved to the right. (The browser testing agent also saw a few pixels of overflow under mobile emulation.)
- **Cause:** The CSS formula for the square size (`--cell` in `styles.css`) only allowed for the outer page padding. It forgot the panel's own padding, its border, and the 2px gaps between squares.
- **Fix:** The square size now subtracts all of those: `min(calc((100vw - 3rem - 22px) / 11), 34px)`.
- **How the fix was checked:** I re-measured at 320px, 375px, and 390px. The panel now has equal 12–13px margins on both sides and there is no horizontal scrolling (`scrollWidth == clientWidth`). I also re-checked screenshots. A scripted full game at 390px width finished with no horizontal overflow.

## Testing performed

- **Automated tests** (`npm test`, Node's built-in test runner, 25 tests): ship placement (inside the board, off the board, overlapping, rotating, moving), random placement (300 random fleets checked), starting only once the fleet is complete, turn order, rejecting shots out of turn, rejecting repeated and off-board shots, hit/miss/sunk results, player win, computer win, restart, and the computer's behaviour (never repeats a shot, follows up next to a hit, continues along a line, goes back to searching after a sinking, far better than random, and has no access to the player's board).
- **Manual browser testing** (Chrome on desktop, plus Chrome mobile emulation at 375px and 390px with touch input, recorded):
  - placement previews, rotation (button and `R` key), picking up and moving ships, Clear, Random placement, and the Start button staying disabled until all ships are placed;
  - the turn banner, clicks during the computer's turn being ignored, and the "already fired" message;
  - hit, miss, and sunk markings, and enemy ships staying hidden;
  - the computer following up on hits;
  - three full games played to the end (all three were won by the computer), the winner dialog, View boards, Play again;
  - Restart in the middle of a game, including restarting during the computer's turn (no leftover computer shot landed on the new game).

  No gameplay bugs were found in this pass.
- **Scripted browser games** (Playwright driving the real page, using only what is visible on screen to choose shots): the player won one full game at desktop size (1280px) and one at mobile size (390px). Both showed the win dialog and all five enemy ships marked sunk. After each win, Restart returned the game to the placement screen. There were no JavaScript errors in the browser console.

## Remaining limitations (not bugs)

- Browser testing used Chrome only, on desktop and with mobile emulation. It was not run on real phones, Safari, or Firefox.
- On a 375px-wide phone, board squares are about 28px. That is smaller than the usual 44px recommendation for touch targets, because 11 columns (labels plus 10 squares) have to fit across the screen.
- Screen-reader support (cell labels, announcements of the latest move) was added but not tested with an actual screen reader.
- When ships touch, the computer can still occasionally guess wrong about which hits belonged to a sunk ship. Bug 1's fix keeps this from derailing it, but it can waste a few shots.
- There is no saved game, sound, difficulty setting, or two-player mode.

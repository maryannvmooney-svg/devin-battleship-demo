import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_SIZE, FLEET, HORIZONTAL, VERTICAL, PHASE,
  Board, ComputerPlayer, Game, createRng, coordLabel,
} from '../src/game.js';

const [CARRIER, BATTLESHIP, CRUISER, SUBMARINE, DESTROYER] = FLEET;

function placeFleetInRows(board) {
  FLEET.forEach((def, i) => {
    assert.equal(board.placeShip(def, i * 2, 0, HORIZONTAL), true);
  });
}

function startedGame(seed = 1) {
  const game = new Game(createRng(seed));
  placeFleetInRows(game.playerBoard);
  assert.equal(game.start().ok, true);
  return game;
}

function sinkWholeFleet(game) {
  for (const ship of game.computerBoard.ships) {
    for (const [r, c] of ship.cells) {
      if (game.phase === PHASE.GAME_OVER) return;
      assert.equal(game.playerFire(r, c).ok, true);
      if (game.phase === PHASE.COMPUTER_TURN) game.computerFire();
    }
  }
}

test('fleet uses the standard ship lengths', () => {
  assert.deepEqual(FLEET.map((s) => s.length), [5, 4, 3, 3, 2]);
  assert.equal(BOARD_SIZE, 10);
});

test('coordinates are labelled with letters for columns and numbers for rows', () => {
  assert.equal(coordLabel(0, 0), 'A1');
  assert.equal(coordLabel(9, 9), 'J10');
});

test('ships can be placed horizontally and vertically inside the board', () => {
  const board = new Board();
  assert.equal(board.placeShip(CARRIER, 0, 5, HORIZONTAL), true);
  assert.deepEqual(board.ships[0].cells, [[0, 5], [0, 6], [0, 7], [0, 8], [0, 9]]);
  assert.equal(board.placeShip(BATTLESHIP, 6, 0, VERTICAL), true);
  assert.deepEqual(board.ships[1].cells, [[6, 0], [7, 0], [8, 0], [9, 0]]);
});

test('placement outside the board is rejected', () => {
  const board = new Board();
  assert.equal(board.placeShip(CARRIER, 0, 6, HORIZONTAL), false);
  assert.equal(board.placeShip(CARRIER, 6, 0, VERTICAL), false);
  assert.equal(board.placeShip(DESTROYER, -1, 0, HORIZONTAL), false);
  assert.equal(board.placeShip(DESTROYER, 0, 10, HORIZONTAL), false);
  assert.equal(board.placeShip(DESTROYER, 0.5, 0, HORIZONTAL), false);
  assert.equal(board.ships.length, 0);
});

test('overlapping ships are rejected', () => {
  const board = new Board();
  assert.equal(board.placeShip(CARRIER, 4, 2, HORIZONTAL), true);
  assert.equal(board.placeShip(BATTLESHIP, 2, 4, VERTICAL), false);
  assert.equal(board.placeShip(CRUISER, 4, 6, HORIZONTAL), false);
  assert.equal(board.ships.length, 1);
  assert.equal(board.placeShip(CRUISER, 5, 2, HORIZONTAL), true);
});

test('re-placing a ship moves it (rotation) instead of duplicating it', () => {
  const board = new Board();
  assert.equal(board.placeShip(CRUISER, 3, 3, HORIZONTAL), true);
  assert.equal(board.placeShip(CRUISER, 3, 3, VERTICAL), true);
  assert.equal(board.ships.length, 1);
  assert.equal(board.ships[0].orientation, VERTICAL);
  assert.deepEqual(board.ships[0].cells, [[3, 3], [4, 3], [5, 3]]);
});

test('a failed move leaves the ship where it was', () => {
  const board = new Board();
  board.placeShip(CRUISER, 3, 3, HORIZONTAL);
  assert.equal(board.placeShip(CRUISER, 9, 9, HORIZONTAL), false);
  assert.deepEqual(board.ships[0].cells, [[3, 3], [3, 4], [3, 5]]);
});

test('random placement always produces a complete, legal, non-overlapping fleet', () => {
  for (let seed = 1; seed <= 300; seed += 1) {
    const board = new Board();
    board.placeFleetRandomly(createRng(seed));
    assert.equal(board.ships.length, FLEET.length);
    assert.equal(board.isFleetComplete(), true);
    const seen = new Set();
    for (const ship of board.ships) {
      assert.equal(ship.cells.length, ship.length);
      for (const [r, c] of ship.cells) {
        assert.ok(r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE);
        const key = `${r},${c}`;
        assert.equal(seen.has(key), false, `overlap at ${key} with seed ${seed}`);
        seen.add(key);
      }
    }
    assert.equal(seen.size, 17);
  }
});

test('the battle cannot start until every ship is placed', () => {
  const game = new Game(createRng(2));
  assert.deepEqual(game.start(), { ok: false, reason: 'fleet-incomplete' });
  game.playerBoard.placeShip(CARRIER, 0, 0, HORIZONTAL);
  assert.equal(game.start().ok, false);
  assert.equal(game.phase, PHASE.PLACEMENT);
  assert.deepEqual(game.playerFire(0, 0), { ok: false, reason: 'not-your-turn' });
});

test('turns alternate between player and computer', () => {
  const game = startedGame(3);
  assert.equal(game.phase, PHASE.PLAYER_TURN);
  assert.deepEqual(game.computerFire(), { ok: false, reason: 'not-computer-turn' });
  assert.equal(game.playerFire(0, 0).ok, true);
  assert.equal(game.phase, PHASE.COMPUTER_TURN);
  assert.deepEqual(game.playerFire(1, 1), { ok: false, reason: 'not-your-turn' });
  assert.equal(game.computerFire().ok, true);
  assert.equal(game.phase, PHASE.PLAYER_TURN);
});

test('repeated and out-of-board shots are rejected without using the turn', () => {
  const game = startedGame(4);
  game.playerFire(5, 5);
  game.computerFire();
  assert.deepEqual(game.playerFire(5, 5), { ok: false, reason: 'repeat' });
  assert.deepEqual(game.playerFire(10, 0), { ok: false, reason: 'invalid' });
  assert.equal(game.phase, PHASE.PLAYER_TURN);
  assert.equal(game.playerShots, 1);
});

test('hits, misses and sinking are reported correctly', () => {
  const board = new Board();
  board.placeShip(DESTROYER, 0, 0, HORIZONTAL);
  assert.deepEqual(board.receiveShot(5, 5), { result: 'miss' });
  assert.deepEqual(board.receiveShot(0, 0), { result: 'hit' });
  assert.deepEqual(board.receiveShot(0, 0), { result: 'repeat' });
  assert.deepEqual(board.receiveShot(0, 1), {
    result: 'sunk', ship: { id: 'destroyer', name: 'Destroyer', length: 2 },
  });
  assert.equal(board.allSunk(), true);
});

test('the player wins when every computer ship is sunk', () => {
  const game = startedGame(5);
  sinkWholeFleet(game);
  assert.equal(game.phase, PHASE.GAME_OVER);
  assert.equal(game.winner, 'player');
  assert.deepEqual(game.computerFire(), { ok: false, reason: 'not-computer-turn' });
  assert.deepEqual(game.playerFire(9, 9).ok, false);
});

test('the computer wins when every player ship is sunk', () => {
  const game = startedGame(6);
  const playerTargets = [];
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      if (!game.computerBoard.shipAt(r, c)) playerTargets.push([r, c]);
    }
  }
  while (game.phase !== PHASE.GAME_OVER) {
    const [r, c] = playerTargets.shift();
    assert.equal(game.playerFire(r, c).ok, true);
    assert.equal(game.computerFire().ok, true);
  }
  assert.equal(game.winner, 'computer');
  assert.equal(game.playerBoard.allSunk(), true);
  assert.equal(game.computerBoard.allSunk(), false);
});

test('restarting clears both boards and returns to placement', () => {
  const game = startedGame(7);
  game.playerFire(0, 0);
  game.computerFire();
  game.reset();
  assert.equal(game.phase, PHASE.PLACEMENT);
  assert.equal(game.winner, null);
  assert.equal(game.playerBoard.ships.length, 0);
  assert.equal(game.computerBoard.ships.length, FLEET.length);
  assert.equal(game.playerShots, 0);
  assert.ok(game.computerBoard.shots.flat().every((s) => s === null));
  assert.ok(game.playerBoard.shots.flat().every((s) => s === null));
  assert.ok(game.computer.view.flat().every((s) => s === 'unknown'));
});

test('the computer never repeats a shot and always fires on the board', () => {
  for (let seed = 1; seed <= 100; seed += 1) {
    const rng = createRng(seed);
    const board = new Board();
    board.placeFleetRandomly(rng);
    const ai = new ComputerPlayer(rng);
    const seen = new Set();
    while (!board.allSunk()) {
      const [r, c] = ai.chooseShot();
      assert.ok(r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE);
      const key = `${r},${c}`;
      assert.equal(seen.has(key), false, `repeat shot ${key} with seed ${seed}`);
      seen.add(key);
      ai.recordResult(r, c, board.receiveShot(r, c));
    }
    assert.ok(seen.size <= 100);
  }
});

test('the computer fires at every square before running out of moves', () => {
  const ai = new ComputerPlayer(createRng(9));
  const seen = new Set();
  for (let i = 0; i < 100; i += 1) {
    const [r, c] = ai.chooseShot();
    seen.add(`${r},${c}`);
    ai.recordResult(r, c, { result: 'miss' });
  }
  assert.equal(seen.size, 100);
  assert.equal(ai.chooseShot(), null);
});

test('after a hit, the computer follows up on a neighbouring square', () => {
  for (let seed = 1; seed <= 50; seed += 1) {
    const ai = new ComputerPlayer(createRng(seed));
    ai.recordResult(4, 4, { result: 'hit' });
    const [r, c] = ai.chooseShot();
    assert.equal(Math.abs(r - 4) + Math.abs(c - 4), 1, `seed ${seed} shot ${r},${c}`);
  }
});

test('after two hits in a line, the computer continues along that line', () => {
  for (let seed = 1; seed <= 50; seed += 1) {
    const ai = new ComputerPlayer(createRng(seed));
    ai.recordResult(4, 4, { result: 'hit' });
    ai.recordResult(4, 5, { result: 'hit' });
    const [r, c] = ai.chooseShot();
    assert.equal(r, 4);
    assert.ok(c === 3 || c === 6, `seed ${seed} shot ${r},${c}`);
  }
});

test('after a miss beside a hit, the computer tries the other neighbours', () => {
  const ai = new ComputerPlayer(createRng(11));
  ai.recordResult(0, 0, { result: 'hit' });
  ai.recordResult(0, 1, { result: 'miss' });
  const [r, c] = ai.chooseShot();
  assert.deepEqual([r, c], [1, 0]);
});

test('once a ship is sunk the computer goes back to searching', () => {
  const ai = new ComputerPlayer(createRng(12));
  ai.recordResult(4, 4, { result: 'hit' });
  ai.recordResult(4, 5, { result: 'sunk', ship: { length: 2 } });
  assert.equal(ai.view[4][4], 'sunk');
  assert.equal(ai.view[4][5], 'sunk');
  assert.deepEqual(ai.unresolvedHits(), []);
  assert.deepEqual(ai.remaining, [5, 4, 3, 3]);
});

test('the computer is clearly better than random guessing', () => {
  let total = 0;
  const games = 200;
  for (let seed = 1; seed <= games; seed += 1) {
    const rng = createRng(seed * 7919);
    const board = new Board();
    board.placeFleetRandomly(rng);
    const ai = new ComputerPlayer(rng);
    let shots = 0;
    while (!board.allSunk()) {
      const [r, c] = ai.chooseShot();
      ai.recordResult(r, c, board.receiveShot(r, c));
      shots += 1;
    }
    total += shots;
  }
  // Pure random play needs about 96 shots on average.
  assert.ok(total / games < 65, `average ${total / games}`);
});

test('the computer opponent has no access to the player board', () => {
  const game = startedGame(13);
  const keys = Object.keys(game.computer);
  assert.deepEqual(keys.sort(), ['remaining', 'rng', 'view']);
  for (const value of Object.values(game.computer)) {
    assert.ok(!(value instanceof Board));
  }
});

test('a hit left over from an ambiguous sinking does not stall the computer', () => {
  // Destroyer B2-C2 and cruiser A3-C3 touch, so sinking the destroyer at B2
  // cannot tell whether C2 or B3 was its other half.
  const ai = new ComputerPlayer(createRng(14));
  ai.recordResult(2, 2, { result: 'hit' });
  ai.recordResult(0, 2, { result: 'miss' });
  ai.recordResult(1, 3, { result: 'miss' });
  ai.recordResult(1, 2, { result: 'hit' });
  ai.recordResult(2, 1, { result: 'hit' });
  ai.recordResult(1, 1, { result: 'sunk', ship: { length: 2 } });
  ai.recordResult(2, 0, { result: 'sunk', ship: { length: 3 } });
  assert.equal(ai.view[1][2], 'hit');
  ai.chooseShot();
  assert.equal(ai.view[1][2], 'sunk');
  assert.deepEqual(ai.unresolvedHits(), []);
});

test('the computer never needs an excessive number of shots', () => {
  let worst = 0;
  for (let seed = 1; seed <= 500; seed += 1) {
    const rng = createRng(seed * 31);
    const board = new Board();
    board.placeFleetRandomly(rng);
    const ai = new ComputerPlayer(rng);
    let shots = 0;
    while (!board.allSunk()) {
      const [r, c] = ai.chooseShot();
      ai.recordResult(r, c, board.receiveShot(r, c));
      shots += 1;
    }
    worst = Math.max(worst, shots);
  }
  assert.ok(worst <= 80, `worst game took ${worst} shots`);
});

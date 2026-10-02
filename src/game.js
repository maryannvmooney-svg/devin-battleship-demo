export const BOARD_SIZE = 10;

export const FLEET = Object.freeze([
  { id: 'carrier', name: 'Carrier', length: 5 },
  { id: 'battleship', name: 'Battleship', length: 4 },
  { id: 'cruiser', name: 'Cruiser', length: 3 },
  { id: 'submarine', name: 'Submarine', length: 3 },
  { id: 'destroyer', name: 'Destroyer', length: 2 },
]);

export const HORIZONTAL = 'horizontal';
export const VERTICAL = 'vertical';

export function createRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function coordLabel(row, col) {
  return `${String.fromCharCode(65 + col)}${row + 1}`;
}

export function inBounds(row, col) {
  return Number.isInteger(row) && Number.isInteger(col)
    && row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

export function shipCells(row, col, length, orientation) {
  const cells = [];
  for (let i = 0; i < length; i += 1) {
    cells.push(orientation === VERTICAL ? [row + i, col] : [row, col + i]);
  }
  return cells;
}

export class Board {
  constructor() {
    this.ships = [];
    this.shots = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
  }

  shipAt(row, col) {
    return this.ships.find((ship) => ship.cells.some(([r, c]) => r === row && c === col)) || null;
  }

  hasShip(id) {
    return this.ships.some((ship) => ship.id === id);
  }

  canPlace(length, row, col, orientation, ignoreId = null) {
    return shipCells(row, col, length, orientation).every(([r, c]) => {
      if (!inBounds(r, c)) return false;
      const occupant = this.shipAt(r, c);
      return !occupant || occupant.id === ignoreId;
    });
  }

  placeShip(def, row, col, orientation) {
    if (orientation !== HORIZONTAL && orientation !== VERTICAL) return false;
    if (!this.canPlace(def.length, row, col, orientation, def.id)) return false;
    this.removeShip(def.id);
    this.ships.push({
      id: def.id,
      name: def.name,
      length: def.length,
      row,
      col,
      orientation,
      cells: shipCells(row, col, def.length, orientation),
      hits: 0,
    });
    return true;
  }

  removeShip(id) {
    this.ships = this.ships.filter((ship) => ship.id !== id);
  }

  clearShips() {
    this.ships = [];
  }

  placeFleetRandomly(rng = Math.random, fleet = FLEET) {
    this.clearShips();
    for (const def of fleet) {
      let placed = false;
      while (!placed) {
        const orientation = rng() < 0.5 ? HORIZONTAL : VERTICAL;
        const row = Math.floor(rng() * BOARD_SIZE);
        const col = Math.floor(rng() * BOARD_SIZE);
        placed = this.placeShip(def, row, col, orientation);
      }
    }
  }

  isFleetComplete(fleet = FLEET) {
    return fleet.every((def) => this.hasShip(def.id));
  }

  isSunk(ship) {
    return ship.hits >= ship.length;
  }

  allSunk() {
    return this.ships.length > 0 && this.ships.every((ship) => this.isSunk(ship));
  }

  receiveShot(row, col) {
    if (!inBounds(row, col)) return { result: 'invalid' };
    if (this.shots[row][col] !== null) return { result: 'repeat' };
    const ship = this.shipAt(row, col);
    if (!ship) {
      this.shots[row][col] = 'miss';
      return { result: 'miss' };
    }
    this.shots[row][col] = 'hit';
    ship.hits += 1;
    if (this.isSunk(ship)) {
      return { result: 'sunk', ship: { id: ship.id, name: ship.name, length: ship.length } };
    }
    return { result: 'hit' };
  }
}

const DIRECTIONS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/**
 * Computer opponent. It only ever learns what a human opponent would be told:
 * whether each of its own shots was a miss, a hit, or sank a ship (and which ship).
 * It never receives a reference to the player's board.
 */
export class ComputerPlayer {
  constructor(rng = Math.random, fleet = FLEET) {
    this.rng = rng;
    this.view = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill('unknown'));
    this.remaining = fleet.map((def) => def.length);
  }

  isUnknown(row, col) {
    return inBounds(row, col) && this.view[row][col] === 'unknown';
  }

  unresolvedHits() {
    const hits = [];
    for (let r = 0; r < BOARD_SIZE; r += 1) {
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        if (this.view[r][c] === 'hit') hits.push([r, c]);
      }
    }
    return hits;
  }

  feasiblePlacements() {
    const placements = [];
    for (const length of this.remaining) {
      for (const orientation of [HORIZONTAL, VERTICAL]) {
        for (let r = 0; r < BOARD_SIZE; r += 1) {
          for (let c = 0; c < BOARD_SIZE; c += 1) {
            const cells = shipCells(r, c, length, orientation);
            const open = cells.every(([cr, cc]) => inBounds(cr, cc)
              && this.view[cr][cc] !== 'miss' && this.view[cr][cc] !== 'sunk');
            if (open) placements.push(cells);
          }
        }
      }
    }
    return placements;
  }

  /**
   * A hit that no remaining ship could cover must belong to a ship that is
   * already sunk, so it is no longer worth targeting.
   */
  retireOrphanHits(placements) {
    const coverable = new Set();
    for (const cells of placements) {
      for (const [r, c] of cells) coverable.add(r * BOARD_SIZE + c);
    }
    for (const [r, c] of this.unresolvedHits()) {
      if (!coverable.has(r * BOARD_SIZE + c)) this.view[r][c] = 'sunk';
    }
  }

  chooseShot() {
    const placements = this.feasiblePlacements();
    this.retireOrphanHits(placements);
    const hits = this.unresolvedHits();
    const targeting = hits.length > 0;
    const scores = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));

    for (const cells of placements) {
      const covered = cells.filter(([r, c]) => this.view[r][c] === 'hit').length;
      if (targeting && covered === 0) continue;
      const weight = targeting ? covered * covered : 1;
      for (const [r, c] of cells) {
        if (this.view[r][c] === 'unknown') scores[r][c] += weight;
      }
    }

    let best = this.pickBest(scores);
    if (!best && targeting) best = this.pickAdjacentToHits(hits);
    if (!best) best = this.pickRandomUnknown();
    return best;
  }

  pickBest(scores) {
    let bestScore = 0;
    let candidates = [];
    for (let r = 0; r < BOARD_SIZE; r += 1) {
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        if (!this.isUnknown(r, c)) continue;
        if (scores[r][c] > bestScore) {
          bestScore = scores[r][c];
          candidates = [[r, c]];
        } else if (scores[r][c] === bestScore && bestScore > 0) {
          candidates.push([r, c]);
        }
      }
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(this.rng() * candidates.length)];
  }

  pickAdjacentToHits(hits) {
    const options = [];
    for (const [r, c] of hits) {
      for (const [dr, dc] of DIRECTIONS) {
        if (this.isUnknown(r + dr, c + dc)) options.push([r + dr, c + dc]);
      }
    }
    if (options.length === 0) return null;
    return options[Math.floor(this.rng() * options.length)];
  }

  pickRandomUnknown() {
    const options = [];
    for (let r = 0; r < BOARD_SIZE; r += 1) {
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        if (this.isUnknown(r, c)) options.push([r, c]);
      }
    }
    if (options.length === 0) return null;
    return options[Math.floor(this.rng() * options.length)];
  }

  recordResult(row, col, outcome) {
    if (outcome.result === 'miss') {
      this.view[row][col] = 'miss';
      return;
    }
    if (outcome.result === 'hit') {
      this.view[row][col] = 'hit';
      return;
    }
    if (outcome.result === 'sunk') {
      this.view[row][col] = 'hit';
      const length = outcome.ship.length;
      this.markSunk(row, col, length);
      const index = this.remaining.indexOf(length);
      if (index !== -1) this.remaining.splice(index, 1);
    }
  }

  /**
   * The sinking shot is known to belong to the sunk ship; pick the line of
   * unresolved hits through it that matches the ship's length.
   */
  markSunk(row, col, length) {
    const candidates = [];
    for (const orientation of [HORIZONTAL, VERTICAL]) {
      for (let offset = 0; offset < length; offset += 1) {
        const startRow = orientation === VERTICAL ? row - offset : row;
        const startCol = orientation === HORIZONTAL ? col - offset : col;
        const cells = shipCells(startRow, startCol, length, orientation);
        if (cells.every(([r, c]) => inBounds(r, c) && this.view[r][c] === 'hit')) {
          candidates.push(cells);
        }
      }
    }
    if (candidates.length === 1) {
      for (const [r, c] of candidates[0]) this.view[r][c] = 'sunk';
    } else {
      this.view[row][col] = 'sunk';
    }
  }
}

export const PHASE = Object.freeze({
  PLACEMENT: 'placement',
  PLAYER_TURN: 'player',
  COMPUTER_TURN: 'computer',
  GAME_OVER: 'over',
});

export class Game {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.reset();
  }

  reset() {
    this.playerBoard = new Board();
    this.computerBoard = new Board();
    this.computerBoard.placeFleetRandomly(this.rng);
    this.computer = new ComputerPlayer(this.rng);
    this.phase = PHASE.PLACEMENT;
    this.winner = null;
    this.playerShots = 0;
    this.computerShots = 0;
  }

  start() {
    if (this.phase !== PHASE.PLACEMENT) return { ok: false, reason: 'already-started' };
    if (!this.playerBoard.isFleetComplete()) return { ok: false, reason: 'fleet-incomplete' };
    this.phase = PHASE.PLAYER_TURN;
    return { ok: true };
  }

  playerFire(row, col) {
    if (this.phase !== PHASE.PLAYER_TURN) return { ok: false, reason: 'not-your-turn' };
    const outcome = this.computerBoard.receiveShot(row, col);
    if (outcome.result === 'invalid' || outcome.result === 'repeat') {
      return { ok: false, reason: outcome.result };
    }
    this.playerShots += 1;
    if (this.computerBoard.allSunk()) {
      this.phase = PHASE.GAME_OVER;
      this.winner = 'player';
    } else {
      this.phase = PHASE.COMPUTER_TURN;
    }
    return { ok: true, row, col, ...outcome };
  }

  computerFire() {
    if (this.phase !== PHASE.COMPUTER_TURN) return { ok: false, reason: 'not-computer-turn' };
    const target = this.computer.chooseShot();
    if (!target) return { ok: false, reason: 'no-moves' };
    const [row, col] = target;
    const outcome = this.playerBoard.receiveShot(row, col);
    if (outcome.result === 'invalid' || outcome.result === 'repeat') {
      return { ok: false, reason: outcome.result };
    }
    this.computer.recordResult(row, col, outcome);
    this.computerShots += 1;
    if (this.playerBoard.allSunk()) {
      this.phase = PHASE.GAME_OVER;
      this.winner = 'computer';
    } else {
      this.phase = PHASE.PLAYER_TURN;
    }
    return { ok: true, row, col, ...outcome };
  }
}

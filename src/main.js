import {
  BOARD_SIZE, FLEET, HORIZONTAL, VERTICAL, PHASE, Game, shipCells, coordLabel,
} from './game.js';

const COMPUTER_DELAY_MS = 700;

const $ = (id) => document.getElementById(id);
const els = {
  turn: $('turn-indicator'),
  message: $('message'),
  instructions: $('instructions'),
  enemyPanel: $('enemy-panel'),
  enemyBoard: $('enemy-board'),
  enemyFleet: $('enemy-fleet'),
  playerBoard: $('player-board'),
  playerFleet: $('player-fleet'),
  placementPanel: $('placement-panel'),
  roster: $('ship-roster'),
  rotate: $('rotate-btn'),
  orientationLabel: $('orientation-label'),
  random: $('random-btn'),
  clear: $('clear-btn'),
  start: $('start-btn'),
  restart: $('restart-btn'),
  overlay: $('game-over'),
  overlayTitle: $('game-over-title'),
  overlayDetail: $('game-over-detail'),
  playAgain: $('play-again-btn'),
  viewBoards: $('view-boards-btn'),
};

const state = {
  game: new Game(),
  selectedId: FLEET[0].id,
  orientation: HORIZONTAL,
  hover: null,
  computerTimer: null,
  lastPlayerShot: null,
  lastComputerShot: null,
};

function buildBoard(container, onCellClick, onCellHover) {
  container.innerHTML = '';
  container.appendChild(document.createElement('div'));
  for (let c = 0; c < BOARD_SIZE; c += 1) {
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = String.fromCharCode(65 + c);
    container.appendChild(label);
  }
  const cells = [];
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = String(r + 1);
    container.appendChild(label);
    const row = [];
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.setAttribute('role', 'gridcell');
      cell.dataset.row = String(r);
      cell.dataset.col = String(c);
      cell.addEventListener('click', () => onCellClick(r, c));
      if (onCellHover) {
        cell.addEventListener('mouseenter', () => onCellHover(r, c));
        cell.addEventListener('focus', () => onCellHover(r, c));
      }
      container.appendChild(cell);
      row.push(cell);
    }
    cells.push(row);
  }
  if (onCellHover) container.addEventListener('mouseleave', () => onCellHover(null, null));
  return cells;
}

const playerCells = buildBoard(els.playerBoard, onPlayerCellClick, onPlayerCellHover);
const enemyCells = buildBoard(els.enemyBoard, onEnemyCellClick, null);

function setMessage(html) {
  els.message.innerHTML = html;
}

function selectedDef() {
  return FLEET.find((def) => def.id === state.selectedId) || null;
}

function nextUnplacedId() {
  const def = FLEET.find((d) => !state.game.playerBoard.hasShip(d.id));
  return def ? def.id : null;
}

function onPlayerCellHover(row, col) {
  if (state.game.phase !== PHASE.PLACEMENT) return;
  state.hover = row === null ? null : [row, col];
  renderPlayerBoard();
}

function onPlayerCellClick(row, col) {
  const { game } = state;
  if (game.phase !== PHASE.PLACEMENT) return;
  const board = game.playerBoard;
  const occupant = board.shipAt(row, col);
  const def = selectedDef();

  if (occupant && (!def || occupant.id === def.id || !board.canPlace(def.length, row, col, state.orientation, def.id))) {
    board.removeShip(occupant.id);
    state.selectedId = occupant.id;
    state.orientation = occupant.orientation;
    setMessage(`Picked up your <strong>${occupant.name}</strong>. Tap a square to place it again.`);
    render();
    return;
  }

  if (!def) {
    setMessage('All ships are placed. Tap a ship to move it, or press <strong>Start battle</strong>.');
    return;
  }

  if (!board.placeShip(def, row, col, state.orientation)) {
    setMessage(`The <strong>${def.name}</strong> doesn't fit there — it would overlap another ship or go off the board.`);
    renderPlayerBoard();
    return;
  }

  state.selectedId = nextUnplacedId();
  setMessage(state.selectedId
    ? `${def.name} placed. Next: <strong>${selectedDef().name}</strong> (${selectedDef().length} squares).`
    : 'All ships placed! Press <strong>Start battle</strong> when you\'re ready.');
  render();
}

function toggleOrientation() {
  if (state.game.phase !== PHASE.PLACEMENT) return;
  state.orientation = state.orientation === HORIZONTAL ? VERTICAL : HORIZONTAL;
  render();
}

function randomPlacement() {
  if (state.game.phase !== PHASE.PLACEMENT) return;
  state.game.playerBoard.placeFleetRandomly();
  state.selectedId = null;
  setMessage('Fleet placed randomly. Tap a ship to move it, or press <strong>Start battle</strong>.');
  render();
}

function clearPlacement() {
  if (state.game.phase !== PHASE.PLACEMENT) return;
  state.game.playerBoard.clearShips();
  state.selectedId = FLEET[0].id;
  setMessage('Board cleared. Choose a ship, then tap the board to place it.');
  render();
}

function startBattle() {
  const result = state.game.start();
  if (!result.ok) {
    setMessage('Place all five ships before starting the battle.');
    return;
  }
  state.selectedId = null;
  state.hover = null;
  els.instructions.open = false;
  setMessage('Fire at a square in <strong>Enemy waters</strong>.');
  render();
  els.enemyPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function describeShot(who, row, col, outcome) {
  const where = coordLabel(row, col);
  if (outcome.result === 'miss') return `${who} fired at ${where} — miss.`;
  if (outcome.result === 'hit') return `${who} fired at ${where} — <strong>hit!</strong>`;
  const owner = who === 'You' ? 'the enemy' : 'your';
  return `${who} fired at ${where} — <strong>sunk ${owner} ${outcome.ship.name}!</strong>`;
}

function onEnemyCellClick(row, col) {
  const { game } = state;
  if (game.phase === PHASE.PLACEMENT) return;
  if (game.phase === PHASE.GAME_OVER) {
    setMessage('The game is over. Press <strong>Restart</strong> to play again.');
    return;
  }
  if (game.phase === PHASE.COMPUTER_TURN) {
    setMessage('Hold on — it\'s the computer\'s turn.');
    return;
  }
  const outcome = game.playerFire(row, col);
  if (!outcome.ok) {
    if (outcome.reason === 'repeat') {
      setMessage(`You already fired at ${coordLabel(row, col)}. Pick a different square.`);
    }
    return;
  }
  state.lastPlayerShot = [row, col];
  setMessage(describeShot('You', row, col, outcome));
  render();
  if (game.phase === PHASE.COMPUTER_TURN) scheduleComputerTurn();
  else if (game.phase === PHASE.GAME_OVER) showGameOver();
}

function scheduleComputerTurn() {
  const { game } = state;
  clearTimeout(state.computerTimer);
  state.computerTimer = setTimeout(() => {
    state.computerTimer = null;
    if (state.game !== game || game.phase !== PHASE.COMPUTER_TURN) return;
    const outcome = game.computerFire();
    if (!outcome.ok) return;
    state.lastComputerShot = [outcome.row, outcome.col];
    const playerLine = els.message.innerHTML;
    setMessage(`${playerLine}<br>${describeShot('Computer', outcome.row, outcome.col, outcome)}`);
    render();
    if (game.phase === PHASE.GAME_OVER) showGameOver();
  }, COMPUTER_DELAY_MS);
}

function showGameOver() {
  const { game } = state;
  const won = game.winner === 'player';
  els.overlayTitle.textContent = won ? 'You win!' : 'The computer wins';
  els.overlayDetail.textContent = won
    ? `You sank the whole enemy fleet in ${game.playerShots} shots.`
    : `The computer sank your fleet in ${game.computerShots} shots. Its remaining ships are now revealed.`;
  els.overlay.hidden = false;
  els.playAgain.focus();
}

function restart() {
  const inBattle = state.game.phase === PHASE.PLAYER_TURN || state.game.phase === PHASE.COMPUTER_TURN;
  if (inBattle && !window.confirm('Abandon this game and start over?')) return;
  clearTimeout(state.computerTimer);
  state.computerTimer = null;
  state.game = new Game();
  state.selectedId = FLEET[0].id;
  state.orientation = HORIZONTAL;
  state.hover = null;
  state.lastPlayerShot = null;
  state.lastComputerShot = null;
  els.overlay.hidden = true;
  els.instructions.open = true;
  setMessage('Choose a ship, then tap the board to place it.');
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function previewCells() {
  if (!state.hover || state.game.phase !== PHASE.PLACEMENT) return null;
  const def = selectedDef();
  if (!def) return null;
  const [row, col] = state.hover;
  const board = state.game.playerBoard;
  const occupant = board.shipAt(row, col);
  if (occupant && occupant.id !== def.id && !board.canPlace(def.length, row, col, state.orientation, def.id)) {
    return null;
  }
  return {
    ok: board.canPlace(def.length, row, col, state.orientation, def.id),
    cells: shipCells(row, col, def.length, state.orientation),
  };
}

function isLast(shot, r, c) {
  return shot && shot[0] === r && shot[1] === c;
}

function renderPlayerBoard() {
  const { game } = state;
  const board = game.playerBoard;
  const preview = previewCells();
  const previewSet = new Set(preview ? preview.cells.map(([r, c]) => `${r},${c}`) : []);
  const placing = game.phase === PHASE.PLACEMENT;
  els.playerBoard.classList.toggle('interactive', placing);

  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      const cell = playerCells[r][c];
      const ship = board.shipAt(r, c);
      const shot = board.shots[r][c];
      const sunk = ship && board.isSunk(ship);
      cell.className = 'cell';
      if (ship) cell.classList.add('ship');
      if (shot === 'miss') cell.classList.add('miss', 'shot');
      if (shot === 'hit') cell.classList.add(sunk ? 'sunk' : 'hit', 'shot');
      if (shot === 'hit' && sunk) cell.classList.add('hit');
      if (previewSet.has(`${r},${c}`)) cell.classList.add(preview.ok ? 'preview-ok' : 'preview-bad');
      if (isLast(state.lastComputerShot, r, c)) cell.classList.add('last');
      let label = `${coordLabel(r, c)}`;
      if (ship) label += `, your ${ship.name}`;
      if (shot) label += `, ${shot === 'hit' ? (sunk ? 'sunk' : 'hit') : 'miss'}`;
      cell.setAttribute('aria-label', label);
      cell.tabIndex = placing ? 0 : -1;
    }
  }
}

function renderEnemyBoard() {
  const { game } = state;
  const board = game.computerBoard;
  const over = game.phase === PHASE.GAME_OVER;
  const canFire = game.phase === PHASE.PLAYER_TURN;
  els.enemyBoard.classList.toggle('interactive', canFire);

  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      const cell = enemyCells[r][c];
      const shot = board.shots[r][c];
      const ship = shot === 'hit' || over ? board.shipAt(r, c) : null;
      const sunk = ship && board.isSunk(ship);
      cell.className = 'cell';
      if (shot === 'miss') cell.classList.add('miss', 'shot');
      if (shot === 'hit') cell.classList.add('hit', 'shot');
      if (shot === 'hit' && sunk) cell.classList.add('sunk');
      if (!shot && over && ship) cell.classList.add('revealed');
      if (isLast(state.lastPlayerShot, r, c)) cell.classList.add('last');
      let label = coordLabel(r, c);
      if (shot === 'miss') label += ', miss';
      else if (shot === 'hit') label += sunk ? `, sunk ${ship.name}` : ', hit';
      else label += over && ship ? `, enemy ${ship.name}` : ', not fired at';
      cell.setAttribute('aria-label', label);
      cell.setAttribute('aria-disabled', String(!canFire || Boolean(shot)));
    }
  }
}

function renderFleetStatus(list, board, mine) {
  list.innerHTML = '';
  for (const def of FLEET) {
    const ship = board.ships.find((s) => s.id === def.id);
    const li = document.createElement('li');
    const sunk = ship && board.isSunk(ship);
    li.textContent = `${def.name} (${def.length})`;
    if (sunk) li.classList.add('sunk');
    else if (mine && ship && ship.hits > 0) li.textContent += ` · ${ship.hits} hit${ship.hits > 1 ? 's' : ''}`;
    li.title = sunk ? 'Sunk' : 'Afloat';
    list.appendChild(li);
  }
}

function renderRoster() {
  const board = state.game.playerBoard;
  els.roster.innerHTML = '';
  for (const def of FLEET) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    const placed = board.hasShip(def.id);
    if (placed) btn.classList.add('placed');
    if (def.id === state.selectedId) btn.classList.add('selected');
    btn.setAttribute('aria-pressed', String(def.id === state.selectedId));
    const name = document.createElement('span');
    name.className = 'ship-name';
    name.textContent = `${def.name} (${def.length})`;
    const pips = document.createElement('span');
    pips.className = 'ship-pips';
    pips.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < def.length; i += 1) pips.appendChild(document.createElement('span'));
    btn.append(name, pips);
    btn.addEventListener('click', () => {
      state.selectedId = def.id;
      setMessage(placed
        ? `Tap a new square to move your <strong>${def.name}</strong>.`
        : `Tap a square to place your <strong>${def.name}</strong> (${def.length} squares).`);
      render();
    });
    li.appendChild(btn);
    els.roster.appendChild(li);
  }
}

function renderStatus() {
  const { game } = state;
  els.turn.dataset.phase = game.phase;
  if (game.phase === PHASE.PLACEMENT) els.turn.textContent = 'Place your ships';
  else if (game.phase === PHASE.PLAYER_TURN) els.turn.textContent = 'Your turn — fire!';
  else if (game.phase === PHASE.COMPUTER_TURN) els.turn.textContent = 'Computer is aiming…';
  else els.turn.textContent = game.winner === 'player' ? 'Victory! You win!' : 'Defeat — the computer wins';
}

function render() {
  const { game } = state;
  const placing = game.phase === PHASE.PLACEMENT;
  els.placementPanel.hidden = !placing;
  els.enemyPanel.hidden = placing;
  els.playerFleet.hidden = placing;
  els.orientationLabel.textContent = state.orientation === HORIZONTAL ? 'Horizontal' : 'Vertical';
  els.start.disabled = !game.playerBoard.isFleetComplete();
  renderStatus();
  renderRoster();
  renderPlayerBoard();
  renderEnemyBoard();
  renderFleetStatus(els.enemyFleet, game.computerBoard, false);
  renderFleetStatus(els.playerFleet, game.playerBoard, true);
}

els.rotate.addEventListener('click', toggleOrientation);
els.random.addEventListener('click', randomPlacement);
els.clear.addEventListener('click', clearPlacement);
els.start.addEventListener('click', startBattle);
els.restart.addEventListener('click', restart);
els.playAgain.addEventListener('click', restart);
els.viewBoards.addEventListener('click', () => { els.overlay.hidden = true; });
document.addEventListener('keydown', (event) => {
  if ((event.key === 'r' || event.key === 'R') && !event.ctrlKey && !event.metaKey && !event.altKey) {
    toggleOrientation();
  }
  if (event.key === 'Escape' && !els.overlay.hidden) els.overlay.hidden = true;
});

render();

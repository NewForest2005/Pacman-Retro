const game = {
  zoom: 2,
  maze: null,
  player: null,
  ghosts: [],
  pellets: new Set(),
  powerPellets: new Set(),
  powerUntil: 0,
  eatenInCombo: 0,
  score: 0,
  lives: 3,
  status: "loading",
  lastGhostRequest: 0,
  ghostRequestInProgress: false
};

const DIRECTIONS = {
  up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1]
};

const POWER_DURATION = 8000;
const GHOST_EAT_POINTS = [200, 400, 800, 1600];
const JAIL_WAIT_MS = 5000;
const JAIL_RELEASE_GAP_MIN_MS = 1000;
const JAIL_RELEASE_GAP_MAX_MS = 5000;
const EATEN_GHOST_JAIL_WAIT_MIN_MS = 1000;
const EATEN_GHOST_JAIL_WAIT_MAX_MS = 3000;
const WALL_INSET_RATIO = 0.16;

function cellCenter(index, size) { return index * size + size / 2; }

function isWalkable(row, col, maze) {
  return maze && row >= 0 && row < maze.rows && col >= 0 && col < maze.cols && maze.grid[row][col] === 1;
}
function isGhostHouseInterior(row, col, maze) {
  const house = maze && maze.ghostHouse;
  if (!house) return false;
  if (house.interiorCells) {
    return house.interiorCells.some(cell => cell.row === row && cell.col === col);
  }
  const isInside = row >= house.top && row <= house.bottom &&
    col >= house.left && col <= house.right;
  return isInside && !(row === house.door.row && col === house.door.col);
}
function isGhostHouseCell(row, col, maze) {
  const house = maze && maze.ghostHouse;
  if (house && house.cells) {
    return house.cells.some(cell => cell.row === row && cell.col === col);
  }
  return house && row >= house.top && row <= house.bottom &&
    col >= house.left && col <= house.right;
}
function atCellCenter(entity, size) {
  const tolerance = Math.max(entity.speed, 1);
  return Math.abs(entity.x - cellCenter(entity.col, size)) < tolerance &&
    Math.abs(entity.y - cellCenter(entity.row, size)) < tolerance;
}
function canMove(entity, direction, maze) {
  const delta = DIRECTIONS[direction];
  if (!delta) return false;
  const nextRow = entity.row + delta[0];
  const nextCol = entity.col + delta[1];
  const tunnel = getTunnelFor(entity, maze);
  const isTunnelJump = tunnel && nextRow === tunnel.row && (
    (entity.col === tunnel.leftCol && direction === "left") ||
    (entity.col === tunnel.rightCol && direction === "right")
  );
  if (!isWalkable(nextRow, nextCol, maze) && !isTunnelJump) return false;
  if (entity.isPlayer && isGhostHouseInterior(nextRow, nextCol, maze)) return false;
  if (entity.jailWander && !isGhostHouseInterior(nextRow, nextCol, maze)) return false;
  if (!entity.isPlayer && entity.stateMachine && !entity.leavingJail &&
      !entity.stateMachine.isEyes() && isGhostHouseCell(nextRow, nextCol, maze)) return false;
  return true;
}
function getTunnelFor(entity, maze) {
  return (maze.tunnels || []).find(tunnel => tunnel.row === entity.row);
}
function moveEntity(entity, maze) {
  const size = maze.cellSize;
  if (atCellCenter(entity, size)) {
    entity.x = cellCenter(entity.col, size);
    entity.y = cellCenter(entity.row, size);
    if (canMove(entity, entity.nextDirection, maze)) entity.direction = entity.nextDirection;
    if (!canMove(entity, entity.direction, maze)) {
      entity.direction = "none";
      return;
    }
  }
  const delta = DIRECTIONS[entity.direction];
  if (!delta) return;
  entity.x += delta[1] * entity.speed;
  entity.y += delta[0] * entity.speed;

  const tunnel = getTunnelFor(entity, maze);
  if (tunnel && entity.row === tunnel.row) {
    if (entity.direction === "left" && entity.x < 0) {
      entity.col = tunnel.rightCol;
      entity.x = cellCenter(entity.col, size);
      return;
    }
    if (entity.direction === "right" && entity.x > maze.cols * size) {
      entity.col = tunnel.leftCol;
      entity.x = cellCenter(entity.col, size);
      return;
    }
  }

  entity.row = constrain(Math.round((entity.y - size / 2) / size), 0, maze.rows - 1);
  entity.col = constrain(Math.round((entity.x - size / 2) / size), 0, maze.cols - 1);
}

function buildReturnRoute(ghost, maze) {
  const start = { row: ghost.row, col: ghost.col };
  const goal = ghost.home;
  const startKey = `${start.row},${start.col}`;
  const goalKey = `${goal.row},${goal.col}`;
  const queue = [start];
  const visited = new Set([startKey]);
  const previous = new Map();

  while (queue.length) {
    const current = queue.shift();
    const currentKey = `${current.row},${current.col}`;
    if (currentKey === goalKey) break;

    for (const direction of Object.keys(DIRECTIONS)) {
      const [dr, dc] = DIRECTIONS[direction];
      let next = { row: current.row + dr, col: current.col + dc };
      const tunnel = (maze.tunnels || []).find(item => item.row === current.row);
      if (tunnel && direction === "left" && current.col === tunnel.leftCol) {
        next = { row: current.row, col: tunnel.rightCol };
      } else if (tunnel && direction === "right" && current.col === tunnel.rightCol) {
        next = { row: current.row, col: tunnel.leftCol };
      }

      if (!isWalkable(next.row, next.col, maze)) continue;
      const nextKey = `${next.row},${next.col}`;
      if (visited.has(nextKey)) continue;
      visited.add(nextKey);
      previous.set(nextKey, current);
      queue.push(next);
    }
  }

  if (!visited.has(goalKey)) return [];
  const route = [];
  let current = goal;
  while (`${current.row},${current.col}` !== startKey) {
    route.unshift(current);
    current = previous.get(`${current.row},${current.col}`);
  }
  return route;
}

function normalizeMazeData(data) {
  const powerPellets = Array.isArray(data.powerPellets) ? data.powerPellets : [];
  const ghostSpawns = Array.isArray(data.ghostSpawns) ? data.ghostSpawns : [];
  const excluded = new Set([
    `${data.playerSpawn.row},${data.playerSpawn.col}`,
    ...ghostSpawns.map(spawn => `${spawn.row},${spawn.col}`),
    ...powerPellets.map(pellet => `${pellet.row},${pellet.col}`)
  ]);

  if (data.ghostHouse) {
    const house = data.ghostHouse;
    const cells = house.cells || [];
    cells.forEach(cell => excluded.add(`${cell.row},${cell.col}`));
    if (!cells.length && Number.isInteger(house.top)) {
      for (let row = house.top; row <= house.bottom; row++) {
        for (let col = house.left; col <= house.right; col++) {
          excluded.add(`${row},${col}`);
        }
      }
    }
  }

  const pellets = Array.isArray(data.pellets)
    ? data.pellets
    : data.grid.flatMap((row, rowIndex) => row
      .map((cell, colIndex) => cell === 1 && !excluded.has(`${rowIndex},${colIndex}`)
        ? { row: rowIndex, col: colIndex }
        : null)
      .filter(Boolean));

  return { ...data, pellets, powerPellets, ghostSpawns };
}

async function initializeGame() {
  try {
    game.status = "loading";
    game.maze = normalizeMazeData(await fetchMaze());
    game.zoom = game.maze.displayScale || 2;
    resizeCanvas(
      game.maze.cols * game.maze.cellSize * game.zoom,
      (game.maze.rows * game.maze.cellSize + 32) * game.zoom
    );
    game.score = 0;
    game.lives = 3;
    game.player = createPlayer(game.maze.playerSpawn);
    game.ghosts = game.maze.ghostSpawns.map(createGhost);
    scheduleGhostReleases();
    game.pellets = new Set(game.maze.pellets.map(p => `${p.row},${p.col}`));
    game.powerPellets = new Set((game.maze.powerPellets || []).map(p => `${p.row},${p.col}`));
    game.powerUntil = 0;
    game.eatenInCombo = 0;
    game.bonus = new BonusItems(
      BONUS_ITEMS_CONFIG,
      game.maze.playerSpawn,
      game.bonusImages || [],
      game.maze
    );
    game.status = "playing";
  } catch (error) {
    console.error(error);
    game.status = "error";
  }
}

function updateGame() {
  updateGhostStates();
  updatePlayer(game.player, game.maze);
  if (game.bonus) game.score += game.bonus.update(game.player, game.score);
  game.ghosts.forEach(ghost => updateGhost(ghost, game.maze));
  collectPellet();
  respawnEatenGhosts();
  checkGhostCollisions();

  if (game.pellets.size === 0 && game.powerPellets.size === 0) game.status = "won";
  const now = millis();
  if (!game.ghostRequestInProgress && now - game.lastGhostRequest > 300) {
    game.lastGhostRequest = now;
    game.ghostRequestInProgress = true;
    requestGhostMoves(game.player, game.ghosts).then(response => {
      applyGhostMoves(game.ghosts, response);
    }).catch(console.error).finally(() => {
      game.ghostRequestInProgress = false;
    });
  }
}

function drawGame() {
  if (!game.maze) {
    fill("white"); textAlign(CENTER, CENTER); text("Cargando...", width / (2 * game.zoom), height / (2 * game.zoom)); return;
  }
  const size = game.maze.cellSize;
  for (let row = 0; row < game.maze.rows; row++) {
    for (let col = 0; col < game.maze.cols; col++) {
      if (game.maze.grid[row][col] === 0) {
        drawWallCell(row, col, size);
      }
    }
  }
  drawGhostHouse(size);
  noStroke(); fill("#ffdca8");
  game.pellets.forEach(key => { const [row, col] = key.split(",").map(Number); circle(cellCenter(col, size), cellCenter(row, size), 4); });
  const powerBlink = frameCount % 20 < 10;
  fill(powerBlink ? "white" : "#ff6699");
  game.powerPellets.forEach(key => { const [row, col] = key.split(",").map(Number); circle(cellCenter(col, size), cellCenter(row, size), size * 0.4); });
  if (game.bonus) game.bonus.draw(size);
  if (game.player) drawPlayer(game.player, size);
  game.ghosts.forEach(ghost => drawGhost(ghost, size));
  drawHud();
}

function drawWallCell(row, col, cellSize) {
  if (isTunnelOpening(row, col)) return;
  const inset = cellSize * WALL_INSET_RATIO;
  const x = col * cellSize;
  const y = row * cellSize;
  const connectsLeft = isWallCell(row, col - 1);
  const connectsRight = isWallCell(row, col + 1);
  const connectsUp = isWallCell(row - 1, col);
  const connectsDown = isWallCell(row + 1, col);

  noStroke();
  fill("#14258c");
  rect(x + inset, y + inset, cellSize - inset * 2, cellSize - inset * 2);

  // Join neighboring wall cells so the thinner walls remain continuous.
  if (connectsLeft) rect(x, y + inset, inset * 2, cellSize - inset * 2);
  if (connectsRight) rect(x + cellSize - inset * 2, y + inset, inset * 2, cellSize - inset * 2);
  if (connectsUp) rect(x + inset, y, cellSize - inset * 2, inset * 2);
  if (connectsDown) rect(x + inset, y + cellSize - inset * 2, cellSize - inset * 2, inset * 2);
}

function isWallCell(row, col) {
  if (isTunnelOpening(row, col)) return false;
  return row >= 0 && row < game.maze.rows && col >= 0 && col < game.maze.cols &&
    game.maze.grid[row][col] === 0;
}

function isTunnelOpening(row, col) {
  return (game.maze.tunnels || []).some(tunnel =>
    tunnel.row === row && (tunnel.leftCol - 1 === col || tunnel.rightCol + 1 === col)
  );
}

function drawGhostHouse(cellSize) {
  const house = game.maze.ghostHouse;
  if (!house) return;

  push();
  noStroke();
  fill("#090d42");
  const interiorCells = house.interiorCells || [];
  if (interiorCells.length) {
    interiorCells.forEach(cell => {
      rect(cell.col * cellSize, cell.row * cellSize, cellSize, cellSize);
    });
  } else {
    rect(
      (house.left + 1) * cellSize,
      (house.top + 1) * cellSize,
      (house.right - house.left - 1) * cellSize,
      (house.bottom - house.top - 1) * cellSize
    );
  }

  // The door is the only opening in the house.
  stroke("#ff9de2");
  strokeWeight(3);
  const doorX = cellCenter(house.door.col, cellSize);
  const doorY = house.door.row * cellSize;
  line(doorX - cellSize * 0.3, doorY, doorX + cellSize * 0.3, doorY);
  pop();
}

function collectPellet() {
  const key = `${game.player.row},${game.player.col}`;
  if (game.pellets.delete(key)) { game.score += 10; return; }
  if (game.powerPellets.delete(key)) {
    game.score += 50;
    game.powerUntil = millis() + POWER_DURATION;
    game.eatenInCombo = 0;
    game.ghosts.forEach(ghost => {
      if (!ghost.stateMachine.isEyes()) ghost.stateMachine.transitionTo(GHOST_STATE.FRIGHTENED);
    });
  }
}

function updateGhostStates() {
  if (game.powerUntil > 0 && millis() >= game.powerUntil) {
    game.powerUntil = 0;
    game.eatenInCombo = 0;
    game.ghosts.forEach(ghost => {
      if (!ghost.stateMachine.isEyes()) {
        ghost.respawnAt = 0;
        ghost.stateMachine.transitionTo(GHOST_STATE.NORMAL);
      }
    });
  }
}

function respawnEatenGhosts() {
  const now = millis();
  const size = game.maze.cellSize;
  game.ghosts.forEach(ghost => {
    const machine = ghost.stateMachine;
    if (!machine.isEyes()) return;
    if (ghost.row !== ghost.home.row || ghost.col !== ghost.home.col) return;
    if (!atCellCenter(ghost, size)) return;
    if (ghost.respawnAt === 0) {
      ghost.x = cellCenter(ghost.home.col, size);
      ghost.y = cellCenter(ghost.home.row, size);
      ghost.direction = "none";
      ghost.nextDirection = "none";
      ghost.returnRoute = [];
      ghost.returnRouteIndex = 0;
      ghost.respawnAt = now + randomInteger(
        EATEN_GHOST_JAIL_WAIT_MIN_MS,
        EATEN_GHOST_JAIL_WAIT_MAX_MS
      );
      return;
    }
    if (now >= ghost.respawnAt) {
      ghost.respawnAt = 0;
      ghost.released = false;
      ghost.releaseAt = now;
      ghost.leavingJail = false;
      ghost.jailWander = false;
      ghost.jailRoute = [];
      ghost.jailRouteIndex = 0;
      machine.transitionTo(GHOST_STATE.NORMAL);
    }
  });
}

function eatGhost(ghost) {
  const index = Math.min(game.eatenInCombo, GHOST_EAT_POINTS.length - 1);
  game.score += GHOST_EAT_POINTS[index];
  game.eatenInCombo++;
  ghost.stateMachine.transitionTo(GHOST_STATE.EYES);
  ghost.returnRoute = buildReturnRoute(ghost, game.maze);
  ghost.returnRouteIndex = 0;
  ghost.respawnAt = 0;
  ghost.direction = "none";
  ghost.nextDirection = "none";
}

function checkGhostCollisions() {
  for (const ghost of game.ghosts) {
    if (dist(game.player.x, game.player.y, ghost.x, ghost.y) >= game.maze.cellSize * 0.55) continue;
    if (ghost.stateMachine.isFrightened()) {
      eatGhost(ghost);
    } else if (!ghost.stateMachine.isEyes()) {
      loseLife(); return;
    }
  }
}

function loseLife() {
  game.lives--;
  if (game.lives <= 0) { game.status = "gameOver"; return; }
  resetRound();
}

function resetRound() {
  game.powerUntil = 0;
  resetPlayer(game.player, game.maze.playerSpawn);
  game.ghosts.forEach((ghost, index) => resetGhost(ghost, game.maze.ghostSpawns[index]));
  scheduleGhostReleases();
}

function scheduleGhostReleases() {
  const house = game.maze.ghostHouse;
  if (!house) return;

  const now = millis();
  const randomizedOrder = [...game.ghosts].sort(() => Math.random() - 0.5);
  let releaseAt = now + JAIL_WAIT_MS;

  randomizedOrder.forEach((ghost, index) => {
    ghost.releaseAt = releaseAt;
    ghost.released = false;
    ghost.leavingJail = false;
    ghost.jailRoute = buildJailRoute(ghost, house);
    ghost.jailRouteIndex = 0;

    if (index < randomizedOrder.length - 1) {
      releaseAt += randomInteger(JAIL_RELEASE_GAP_MIN_MS, JAIL_RELEASE_GAP_MAX_MS);
    }
  });
}

function buildJailRoute(ghost, house) {
  const route = [];
  let row = ghost.row;
  let col = ghost.col;
  const door = house.door;

  while (col !== door.col) {
    col += Math.sign(door.col - col);
    route.push({ row, col });
  }
  while (row !== door.row) {
    row += Math.sign(door.row - row);
    route.push({ row, col });
  }
  return route;
}

function randomInteger(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function drawHud() {
  const hudY = game.maze.rows * game.maze.cellSize + 6;
  fill("white"); noStroke(); textAlign(LEFT, TOP); textSize(16);
  text(`Score: ${game.score}   Lives: ${game.lives}`, 8, hudY);
  if (game.status === "won" || game.status === "gameOver" || game.status === "error") {
    textAlign(CENTER, CENTER); textSize(26);
    text(game.status === "won" ? "YOU WIN" : game.status === "gameOver" ? "GAME OVER" : "BACKEND ERROR",
      game.maze.cols * game.maze.cellSize / 2, game.maze.rows * game.maze.cellSize / 2);
  }
}

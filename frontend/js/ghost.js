const GHOST_COLORS = {
  chaser: "#ff3030",
  interceptor: "#ff9de2",
  strategic: "#25d9ff",
  random: "#ff9d2e"
};

const FRIGHTENED_BLINK_MS = 2000;
const GHOST_BASE_SPEED = 1.5;
const GHOST_EYES_SPEED = 3;

function createGhost(spawn) {
  return {
    id: spawn.id,
    row: spawn.row,
    col: spawn.col,
    x: cellCenter(spawn.col, game.maze.cellSize),
    y: cellCenter(spawn.row, game.maze.cellSize),
    home: { row: spawn.row, col: spawn.col },
    direction: "none",
    nextDirection: "none",
    speed: GHOST_BASE_SPEED,
    color: GHOST_COLORS[spawn.id] || "white",
    respawnAt: 0,
    releaseAt: 0,
    released: false,
    leavingJail: false,
    jailWander: false,
    jailRoute: [],
    jailRouteIndex: 0,
    returnRoute: [],
    returnRouteIndex: 0,
    stateMachine: new GhostStateMachine()
  };
}

function updateGhost(ghost, maze) {
  ghost.speed = ghost.stateMachine.isEyes() ? GHOST_EYES_SPEED : GHOST_BASE_SPEED;

  if (ghost.stateMachine.isEyes() && ghost.returnRoute.length) {
    updateReturnToJail(ghost, maze);
    return;
  }

  if (!ghost.released) {
    if (millis() < ghost.releaseAt) {
      ghost.jailWander = true;
      updateJailWander(ghost, maze);
      return;
    }
    ghost.released = true;
    ghost.leavingJail = true;
    ghost.jailWander = false;
    ghost.jailRoute = buildJailRoute(ghost, maze.ghostHouse);
    ghost.jailRouteIndex = 0;
  }

  if (ghost.leavingJail) updateJailExit(ghost, maze);
  moveEntity(ghost, maze);
}

function updateReturnToJail(ghost, maze) {
  const target = ghost.returnRoute[ghost.returnRouteIndex];
  if (!target) {
    ghost.direction = "none";
    ghost.nextDirection = "none";
    return;
  }

  if (atCellCenter(ghost, maze.cellSize) &&
      ghost.row === target.row && ghost.col === target.col) {
    ghost.returnRouteIndex++;
  }

  const nextTarget = ghost.returnRoute[ghost.returnRouteIndex];
  if (!nextTarget) {
    ghost.direction = "none";
    ghost.nextDirection = "none";
    return;
  }

  const routeDirection = directionBetween(
    { row: ghost.row, col: ghost.col },
    nextTarget
  );
  let movementDirection = routeDirection;
  if (movementDirection === "none" && !atCellCenter(ghost, maze.cellSize)) {
    const targetX = cellCenter(nextTarget.col, maze.cellSize);
    const targetY = cellCenter(nextTarget.row, maze.cellSize);
    if (Math.abs(ghost.x - targetX) > 0.5) {
      movementDirection = ghost.x < targetX ? "right" : "left";
    } else if (Math.abs(ghost.y - targetY) > 0.5) {
      movementDirection = ghost.y < targetY ? "down" : "up";
    }
  }
  ghost.nextDirection = movementDirection;
  // An eaten ghost can be caught between cells. Give it a direction now so
  // it can reach the next center instead of waiting forever with "none".
  if (!atCellCenter(ghost, maze.cellSize)) ghost.direction = movementDirection;
  moveEntity(ghost, maze);
}

function updateJailWander(ghost, maze) {
  if (!atCellCenter(ghost, maze.cellSize)) {
    moveEntity(ghost, maze);
    return;
  }

  const options = Object.keys(DIRECTIONS).filter(direction => canMove(ghost, direction, maze));
  if (!options.length) {
    ghost.direction = "none";
    ghost.nextDirection = "none";
    return;
  }

  const forward = options.filter(direction => direction !== OPPOSITE_DIRECTIONS[ghost.direction]);
  const choices = forward.length ? forward : options;
  ghost.nextDirection = choices[Math.floor(Math.random() * choices.length)];
  moveEntity(ghost, maze);
}

const OPPOSITE_DIRECTIONS = {
  up: "down",
  down: "up",
  left: "right",
  right: "left"
};

function updateJailExit(ghost, maze) {
  if (!atCellCenter(ghost, maze.cellSize)) return;

  const target = ghost.jailRoute[ghost.jailRouteIndex];
  if (!target) {
    ghost.leavingJail = false;
    ghost.nextDirection = "none";
    return;
  }

  if (ghost.row === target.row && ghost.col === target.col) {
    ghost.jailRouteIndex++;
  }

  const nextTarget = ghost.jailRoute[ghost.jailRouteIndex];
  if (!nextTarget) {
    // Continue through the door into the corridor.
    ghost.leavingJail = false;
    ghost.nextDirection = "down";
    return;
  }

  ghost.nextDirection = directionBetween(
    { row: ghost.row, col: ghost.col },
    nextTarget
  );
}

function directionBetween(from, to) {
  if (to.row < from.row) return "up";
  if (to.row > from.row) return "down";
  if (to.col < from.col) return "left";
  if (to.col > from.col) return "right";
  return "none";
}

function applyGhostMoves(ghosts, response) {
  (response.moves || []).forEach(move => {
    const ghost = ghosts.find(item => item.id === move.id);
    if (ghost && DIRECTIONS[move.direction]) ghost.nextDirection = move.direction;
  });
}

function drawGhost(ghost, cellSize) {
  const machine = ghost.stateMachine;

  if (machine.isEyes()) {
    drawGhostEyesOnly(ghost, cellSize);
    return;
  }

  push();
  noStroke();
  if (machine.isFrightened()) {
    const remaining = game.powerUntil - millis();
    const whiteFlash = remaining < FRIGHTENED_BLINK_MS && Math.floor(millis() / 200) % 2 === 0;
    drawFrightenedGhostBody(ghost, cellSize, whiteFlash);
    drawGhostEyes(ghost, cellSize, whiteFlash ? "#2631f7" : "white");
  } else {
    drawNormalGhostBody(ghost, cellSize);
    drawGhostEyes(ghost, cellSize, "#111");
  }
  pop();
}

function drawNormalGhostBody(ghost, cellSize) {
  fill(ghost.color);
  circle(ghost.x, ghost.y, cellSize * 0.7);
  rectMode(CENTER);
  rect(ghost.x, ghost.y + cellSize * 0.14, cellSize * 0.7, cellSize * 0.28);
}

function drawFrightenedGhostBody(ghost, cellSize, whiteFlash) {
  fill(whiteFlash ? "white" : "#2631f7");
  circle(ghost.x, ghost.y, cellSize * 0.7);
  fill(whiteFlash ? "#2631f7" : "white");
  for (let i = 0; i < 4; i++) {
    circle(ghost.x - cellSize * 0.21 + i * cellSize * 0.14, ghost.y + cellSize * 0.31, cellSize * 0.13);
  }
  fill(whiteFlash ? "#2631f7" : "white");
  for (let i = 0; i < 3; i++) {
    circle(ghost.x - cellSize * 0.14 + i * cellSize * 0.14, ghost.y + cellSize * 0.29, cellSize * 0.08);
  }
}

function drawGhostEyes(ghost, cellSize, pupilColor) {
  fill("white");
  circle(ghost.x - cellSize * 0.13, ghost.y - cellSize * 0.08, cellSize * 0.16);
  circle(ghost.x + cellSize * 0.13, ghost.y - cellSize * 0.08, cellSize * 0.16);
  fill(pupilColor);
  circle(ghost.x - cellSize * 0.13, ghost.y - cellSize * 0.08, cellSize * 0.07);
  circle(ghost.x + cellSize * 0.13, ghost.y - cellSize * 0.08, cellSize * 0.07);
}

function drawGhostEyesOnly(ghost, cellSize) {
  push();
  noStroke();
  fill("white");
  circle(ghost.x - cellSize * 0.12, ghost.y, cellSize * 0.32);
  circle(ghost.x + cellSize * 0.12, ghost.y, cellSize * 0.32);
  fill("#2631f7");
  circle(ghost.x - cellSize * 0.12, ghost.y, cellSize * 0.16);
  circle(ghost.x + cellSize * 0.12, ghost.y, cellSize * 0.16);
  pop();
}

function repositionGhost(ghost, spawn) {
  ghost.row = spawn.row;
  ghost.col = spawn.col;
  ghost.x = cellCenter(spawn.col, game.maze.cellSize);
  ghost.y = cellCenter(spawn.row, game.maze.cellSize);
  ghost.direction = "none";
  ghost.nextDirection = "none";
}

function resetGhost(ghost, spawn) {
  repositionGhost(ghost, spawn);
  ghost.respawnAt = 0;
  ghost.releaseAt = 0;
  ghost.released = false;
  ghost.leavingJail = false;
  ghost.jailWander = false;
  ghost.jailRoute = [];
  ghost.jailRouteIndex = 0;
  ghost.returnRoute = [];
  ghost.returnRouteIndex = 0;
  ghost.stateMachine.reset();
}

  

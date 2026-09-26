function createPlayer(spawn) {
  return {
    isPlayer: true,
    row: spawn.row,
    col: spawn.col,
    x: cellCenter(spawn.col, game.maze.cellSize),
    y: cellCenter(spawn.row, game.maze.cellSize),
    direction: "none",
    nextDirection: "none",
    speed: 2
  };
}

function handlePlayerInput(keyCode, key) {
  const directions = {};
  directions[UP_ARROW]    = "up";
  directions[DOWN_ARROW]  = "down";
  directions[LEFT_ARROW]  = "left";
  directions[RIGHT_ARROW]  = "right";
  directions["w"] = "up";
  directions["s"] = "down";
  directions["a"] = "left";
  directions["d"] = "right";
  const value = directions[keyCode] ?? (key ? directions[key.toLowerCase()] : undefined);
  if (game.player && value) game.player.nextDirection = value;
}

function updatePlayer(player, maze) {
  moveEntity(player, maze);
}

// Mínimo y máximo de apertura de la boca (en grados).
const MOUTH_MIN = 4;
const MOUTH_MAX = 45;

function drawPlayer(player, cellSize) {
  push();
  fill("#ffe600");
  noStroke();

  const mouth = player.direction === "none"
    ? radians(MOUTH_MIN)
    : radians(MOUTH_MIN) + abs(sin(millis() / 160)) * radians(MOUTH_MAX - MOUTH_MIN);

  const rotations = {
    right: 0,
    down: HALF_PI,
    left: PI,
    up: -HALF_PI
  };
  
  translate(player.x, player.y);
  rotate(rotations[player.direction] ?? 0);
  arc(0, 0, cellSize * 0.72, cellSize * 0.72, mouth, TWO_PI - mouth);
  pop();
}

function resetPlayer(player, spawn) {
  player.row = spawn.row;
  player.col = spawn.col;
  player.x = cellCenter(spawn.col, game.maze.cellSize);
  player.y = cellCenter(spawn.row, game.maze.cellSize);
  player.direction = "none";
  player.nextDirection = "none";
}

// Configuración de ítems de bonus: agrega un objeto por cada ítem futuro.
// Cada ítem aparece en una celda transitable aleatoria cuando el puntaje
// alcanza su "threshold"; al pasar Pac-Man por él se consume y suma "points".
const BONUS_ITEMS_CONFIG = [
  { image: "images/cereza.png", threshold: 1500, points: 100 },
  { image: "images/fresa.png", threshold: 2500, points: 200 },
  // futuro: { image: "images/cereza.png", threshold: 2000, points: 200 },
];

class BonusItems {
  constructor(config, spawn, images, maze) {
    this.items = config;
    this.spawn = spawn;
    this.images = images;
    this.maze = maze;
    this.index = 0;
    this.active = false;
  }

  get current() {
    return this.items[this.index];
  }

  update(player, score) {
    const item = this.current;
    if (!item) return 0;

    if (!this.active) {
      if (score >= item.threshold) {
        this.spawn = this.randomSpawn();
        this.active = true;
      }
      return 0;
    }

    if (player.row === this.spawn.row && player.col === this.spawn.col) {
      this.active = false;
      this.index++;
      return item.points;
    }
    return 0;
  }

  randomSpawn() {
    if (!this.maze) return this.spawn;

    const house = this.maze.ghostHouse;
    const door = house && house.door;
    const blocked = new Set([
      `${this.maze.playerSpawn.row},${this.maze.playerSpawn.col}`,
      ...(this.maze.ghostSpawns || []).map(spawn => `${spawn.row},${spawn.col}`),
      ...((this.maze.powerPellets || []).map(pellet => `${pellet.row},${pellet.col}`))
    ]);
    const candidates = [];

    for (let row = 0; row < this.maze.rows; row++) {
      for (let col = 0; col < this.maze.cols; col++) {
        if (this.maze.grid[row][col] !== 1) continue;
        if (blocked.has(`${row},${col}`)) continue;

        const insideHouse = house && row >= house.top && row <= house.bottom &&
          col >= house.left && col <= house.right;
        if (insideHouse) continue;

        // Keep the central jail exit corridor clear: door row through the
        // first junction below the jail.
        const inJailCorridor = door && col === door.col &&
          row >= door.row && row <= door.row + 3;
        if (inJailCorridor) continue;

        candidates.push({ row, col });
      }
    }

    return candidates.length
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : this.spawn;
  }

  draw(cellSize) {
    if (!this.active) return;
    const item = this.current;
    const img = this.images[this.index];
    if (!img) return;

    const height = cellSize * 0.8;
    const width = height * (img.width / img.height);
    const x = cellCenter(this.spawn.col, cellSize) - width / 2;
    const y = cellCenter(this.spawn.row, cellSize) - height / 2;
    image(img, x, y, width, height);
  }
}

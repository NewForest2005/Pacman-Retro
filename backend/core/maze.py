"""Utilities for the single maze loaded from shared/maze.json."""

import json
from pathlib import Path

MAZE_PATH = Path(__file__).resolve().parents[2] / "shared" / "maze.json"
with open(MAZE_PATH, encoding="utf-8") as file:
    _DATA = json.load(file)

WALL = 0
PATH = 1
ROWS = _DATA["rows"]
COLS = _DATA["cols"]
CELL_SIZE = _DATA["cellSize"]
GRID = _DATA["grid"]
PLAYER_SPAWN = _DATA["playerSpawn"]
GHOST_HOUSE = _DATA["ghostHouse"]
GHOST_SPAWNS = _DATA["ghostSpawns"]
TUNNELS = _DATA.get("tunnels", [])
_SPAWN_CELLS = {(PLAYER_SPAWN["row"], PLAYER_SPAWN["col"])} | {
    (ghost["row"], ghost["col"]) for ghost in GHOST_SPAWNS
}
POWER_PELLET_CELLS = {
    (pellet["row"], pellet["col"])
    for pellet in _DATA.get("powerPellets", [])
}

DIRECTIONS = {
    "up": (-1, 0), "down": (1, 0),
    "left": (0, -1), "right": (0, 1),
}


def is_ghost_house_cell(row, col):
    cells = GHOST_HOUSE.get("cells")
    if cells is not None:
        return (row, col) in {(cell["row"], cell["col"]) for cell in cells}
    return (GHOST_HOUSE["top"] <= row <= GHOST_HOUSE["bottom"] and
            GHOST_HOUSE["left"] <= col <= GHOST_HOUSE["right"])


def is_ghost_house_interior(row, col):
    cells = GHOST_HOUSE.get("interiorCells")
    if cells is not None:
        return (row, col) in {(cell["row"], cell["col"]) for cell in cells}
    door = GHOST_HOUSE["door"]
    return is_ghost_house_cell(row, col) and (row, col) != (door["row"], door["col"])


def in_bounds(row, col):
    return 0 <= row < ROWS and 0 <= col < COLS


def is_wall(row, col):
    return not in_bounds(row, col) or GRID[row][col] == WALL


def is_walkable(row, col):
    return not is_wall(row, col)


def get_neighbors(row, col):
    neighbors = []
    for direction, (dr, dc) in DIRECTIONS.items():
        nr, nc = row + dr, col + dc
        if is_walkable(nr, nc):
            neighbors.append((nr, nc, direction))
    for tunnel in TUNNELS:
        if row == tunnel["row"] and col == tunnel["leftCol"]:
            neighbors.append((row, tunnel["rightCol"], "left"))
        elif row == tunnel["row"] and col == tunnel["rightCol"]:
            neighbors.append((row, tunnel["leftCol"], "right"))
    return neighbors


def pellet_cells():
    return [
        {"row": row, "col": col}
        for row in range(ROWS)
        for col in range(COLS)
        if GRID[row][col] == PATH
        and (row, col) not in _SPAWN_CELLS
        and (row, col) not in POWER_PELLET_CELLS
        and not is_ghost_house_cell(row, col)
    ]


def to_json():
    return {
        "rows": ROWS, "cols": COLS, "cellSize": CELL_SIZE,
        "grid": GRID, "pellets": pellet_cells(),
        "powerPellets": [{"row": row, "col": col}
                          for row, col in sorted(POWER_PELLET_CELLS)],
        "playerSpawn": PLAYER_SPAWN, "ghostHouse": GHOST_HOUSE,
        "ghostSpawns": GHOST_SPAWNS, "tunnels": TUNNELS,
    }

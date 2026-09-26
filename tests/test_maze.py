from collections import deque

from backend.core import maze


def test_maze_dimensions_match_grid():
    assert len(maze.GRID) == maze.ROWS
    assert all(len(row) == maze.COLS for row in maze.GRID)


def test_spawn_cells_are_walkable():
    assert maze.is_walkable(maze.PLAYER_SPAWN["row"], maze.PLAYER_SPAWN["col"])
    for spawn in maze.GHOST_SPAWNS:
        assert maze.is_walkable(spawn["row"], spawn["col"])


def test_ghost_spawns_are_inside_the_ghost_house():
    house = maze.GHOST_HOUSE
    for spawn in maze.GHOST_SPAWNS:
        assert house["top"] <= spawn["row"] <= house["bottom"]
        assert house["left"] <= spawn["col"] <= house["right"]
        assert (spawn["row"], spawn["col"]) != (
            house["door"]["row"], house["door"]["col"]
        )


def test_ghost_house_has_a_walkable_single_door():
    house = maze.GHOST_HOUSE
    door = house["door"]

    assert maze.is_walkable(door["row"], door["col"])
    assert maze.is_wall(house["top"], house["left"])
    assert maze.is_wall(house["top"], house["right"])
    assert maze.is_wall(house["bottom"], house["left"])
    assert maze.is_wall(house["bottom"], house["right"])


def test_out_of_bounds_cells_behave_as_walls():
    assert maze.in_bounds(0, 0)
    assert not maze.in_bounds(-1, 0)
    assert not maze.in_bounds(maze.ROWS, 0)
    assert maze.is_wall(-1, 0)
    assert maze.is_wall(maze.ROWS, maze.COLS)


def test_neighbors_are_walkable_and_have_valid_directions():
    neighbors = maze.get_neighbors(*((maze.PLAYER_SPAWN["row"], maze.PLAYER_SPAWN["col"])))
    valid_directions = set(maze.DIRECTIONS)

    assert neighbors
    for row, col, direction in neighbors:
        assert maze.is_walkable(row, col)
        assert direction in valid_directions


def test_pellets_exclude_spawns_and_power_pellets():
    pellet_positions = {(pellet["row"], pellet["col"]) for pellet in maze.pellet_cells()}
    spawn_positions = {
        (maze.PLAYER_SPAWN["row"], maze.PLAYER_SPAWN["col"]),
        *((spawn["row"], spawn["col"]) for spawn in maze.GHOST_SPAWNS),
    }

    assert not pellet_positions & spawn_positions
    assert not pellet_positions & maze.POWER_PELLET_CELLS
    for row in range(maze.GHOST_HOUSE["top"], maze.GHOST_HOUSE["bottom"] + 1):
        for col in range(maze.GHOST_HOUSE["left"], maze.GHOST_HOUSE["right"] + 1):
            assert (row, col) not in pellet_positions


def test_walkable_maze_has_no_dead_ends():
    walkable = [
        (row, col)
        for row in range(maze.ROWS)
        for col in range(maze.COLS)
        if maze.is_walkable(row, col)
    ]
    assert all(len(maze.get_neighbors(row, col)) >= 2 for row, col in walkable)


def test_all_walkable_cells_are_connected():
    walkable = {
        (row, col)
        for row in range(maze.ROWS)
        for col in range(maze.COLS)
        if maze.is_walkable(row, col)
    }
    start = next(iter(walkable))
    visited = {start}
    pending = deque([start])

    while pending:
        current = pending.popleft()
        for row, col, _direction in maze.get_neighbors(*current):
            if (row, col) not in visited:
                visited.add((row, col))
                pending.append((row, col))

    assert visited == walkable


def test_tunnel_connects_both_sides():
    tunnel = maze.TUNNELS[0]
    left = (tunnel["row"], tunnel["leftCol"])
    right = (tunnel["row"], tunnel["rightCol"])

    assert right in {(row, col) for row, col, _ in maze.get_neighbors(*left)}
    assert left in {(row, col) for row, col, _ in maze.get_neighbors(*right)}


def test_to_json_contains_frontend_maze_data():
    data = maze.to_json()

    assert data["rows"] == maze.ROWS
    assert data["cols"] == maze.COLS
    assert data["grid"] == maze.GRID
    assert data["playerSpawn"] == maze.PLAYER_SPAWN
    assert data["ghostSpawns"] == maze.GHOST_SPAWNS
    assert {tuple((p["row"], p["col"])) for p in data["powerPellets"]} == maze.POWER_PELLET_CELLS

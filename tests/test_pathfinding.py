from backend.core import maze
from backend.core.pathfinding import astar, bfs, first_step_direction, manhattan


def _assert_valid_path(path, start, goal):
    assert path is not None
    assert path[0] == start
    assert path[-1] == goal
    for current, following in zip(path, path[1:]):
        assert following in {(row, col) for row, col, _ in maze.get_neighbors(*current)}


def test_manhattan_distance():
    assert manhattan((1, 2), (4, 6)) == 7
    assert manhattan((4, 6), (1, 2)) == 7


def test_bfs_returns_trivial_path_when_start_is_goal():
    assert bfs((7, 9), (7, 9)) == [(7, 9)]


def test_astar_returns_trivial_path_when_start_is_goal():
    assert astar((7, 9), (7, 9)) == [(7, 9)]


def test_bfs_finds_a_valid_shortest_path():
    start = (1, 1)
    goal = (7, 9)
    path = bfs(start, goal)

    _assert_valid_path(path, start, goal)
    assert len(path) - 1 == 22


def test_astar_finds_a_path_with_the_same_length_as_bfs():
    start = (13, 17)
    goal = (7, 9)
    breadth_path = bfs(start, goal)
    astar_path = astar(start, goal)

    _assert_valid_path(astar_path, start, goal)
    assert len(astar_path) == len(breadth_path)


def test_pathfinding_rejects_a_wall_as_a_goal():
    start = (1, 1)
    wall = (0, 0)

    assert maze.is_wall(*wall)
    assert bfs(start, wall) is None
    assert astar(start, wall) is None


def test_first_step_direction_translates_path():
    start = (7, 9)
    assert first_step_direction(start, [(7, 9), (6, 9)]) == "up"
    assert first_step_direction(start, [(7, 9), (8, 9)]) == "down"
    assert first_step_direction(start, [(7, 9), (7, 8)]) == "left"
    assert first_step_direction(start, [(7, 9), (7, 10)]) == "right"
    assert first_step_direction(start, [start]) == "none"

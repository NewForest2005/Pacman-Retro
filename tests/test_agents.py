"""Pruebas (Fase 6/7): comportamiento de huida de los fantasmas asustados."""

import pytest

from backend.app import app as flask_app
from backend.agents import GhostAgent
from backend.core.game_state import EntityState
from backend.core.pathfinding import manhattan

PLAYER_POS = {"row": 7, "col": 9}
GHOST_SPAWNS = [
    {"id": "chaser", "row": 5, "col": 8},
    {"id": "interceptor", "row": 5, "col": 10},
    {"id": "strategic", "row": 6, "col": 8},
    {"id": "random", "row": 6, "col": 10},
]


def _ghost_states(overrides):
    """Estados de los 4 fantasmas con los parches {id: {...}} aplicados."""
    states = [
        {"id": g["id"], "row": g["row"], "col": g["col"], "direction": "none", "state": "normal"}
        for g in GHOST_SPAWNS
    ]
    for gid, patch in overrides.items():
        for state in states:
            if state["id"] == gid:
                state.update(patch)
    return states


def _send_move(ghost_states):
    client = flask_app.test_client()
    return client.post("/ghosts/move", json={"player": PLAYER_POS, "ghosts": ghost_states})


def _move_for(response, gid):
    return next(m for m in response.json["moves"] if m["id"] == gid)["direction"]


def _entity(gid, row, col, state="normal", direction="none"):
    return EntityState(id=gid, row=row, col=col, direction=direction, state=state)


@pytest.mark.parametrize(
    "start_pos,expected",
    [
        ((6, 8), "up"),
        ((6, 10), "up"),
        ((5, 9), "left"),
        ((8, 9), "down"),
    ],
)
def test_frightened_agent_flees_away_from_player(start_pos, expected):
    """Un fantasma asustado elige el vecino que más lo aleja de Pacman."""
    ghost = GhostAgent("prueba", *start_pos)
    ghost.state = "frightened"
    ghost.direction = "none"
    player = _entity("player", PLAYER_POS["row"], PLAYER_POS["col"])

    direction = ghost.step(player, [_entity("prueba", *start_pos, state="frightened")])

    assert direction == expected
    start_distance = manhattan(start_pos, (player.row, player.col))
    new_row, new_col = start_pos
    dr, dc = {"up": (-1, 0), "down": (1, 0), "left": (0, -1), "right": (0, 1)}[direction]
    assert manhattan((new_row + dr, new_col + dc), (player.row, player.col)) > start_distance


def test_frightened_ghost_flees_via_endpoint():
    """End-to-end: el POST con state frightened hace que el chaser huya."""
    ghost_states = _ghost_states({
        "chaser": {"row": 6, "col": 8, "direction": "none", "state": "frightened"},
    })
    response = _send_move(ghost_states)
    assert response.status_code == 200
    assert _move_for(response, "chaser") == "up"


def test_normal_ghost_chases_by_default():
    """En la misma posición, un chaser normal sigue persiguiendo a Pacman."""
    ghost_states = _ghost_states({
        "chaser": {"row": 6, "col": 8, "direction": "none", "state": "normal"},
    })
    response = _send_move(ghost_states)
    assert response.status_code == 200
    assert _move_for(response, "chaser") == "right"


def test_all_normal_ghosts_still_chase():
    """Sin super bolas activas, los cuatro agentes mantienen su personalidad."""
    ghost_states = _ghost_states({})
    response = _send_move(ghost_states)
    assert response.status_code == 200
    for gid in ("chaser", "interceptor", "strategic", "random"):
        assert _move_for(response, gid) in {"up", "down", "left", "right"}


def test_eyes_ghost_at_home_stands_still():
    """Un fantasma en modo ojos parado en su casa devuelve 'none'."""
    ghost = GhostAgent("prueba", 1, 1)
    ghost.state = "eyes"
    player = _entity("player", PLAYER_POS["row"], PLAYER_POS["col"])

    direction = ghost.step(player, [_entity("prueba", 1, 1, state="eyes")])

    assert direction == "none"


def test_eyes_ghost_travels_toward_home():
    """Un fantasma en modo ojos lejos de casa se acerca a su spawn."""
    ghost = GhostAgent("prueba", 1, 1)
    ghost.row, ghost.col = 7, 9
    ghost.state = "eyes"
    player = _entity("player", PLAYER_POS["row"], PLAYER_POS["col"])
    direction = ghost.step(player, [_entity("prueba", 7, 9, state="eyes")])

    assert direction in {"up", "down", "left", "right"}
    dr, dc = {"up": (-1, 0), "down": (1, 0), "left": (0, -1), "right": (0, 1)}[direction]
    path = ghost._return_home(ghost.perceive(player, [_entity("prueba", 7, 9, state="eyes")]))
    assert path == direction

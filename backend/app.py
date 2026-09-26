"""Servidor Flask: expone el laberinto y decide el movimiento de los fantasmas."""

from flask import Flask, jsonify, request
from flask_cors import CORS

from .core import maze
from .core.game_state import parse_move_request, InvalidGameState
from .agents import GHOST_CLASSES

app = Flask(__name__)
CORS(app)

# Los fantasmas conservan su estado durante la partida y usan el único
# laberinto definido en shared/maze.json.
ghosts = {
    spawn["id"]: GHOST_CLASSES[spawn["id"]](spawn["id"], spawn["row"], spawn["col"])
    for spawn in maze.GHOST_SPAWNS
}


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/maze")
def get_maze():
    return jsonify(maze.to_json())


@app.route("/ghosts/move", methods=["POST"])
def ghosts_move():
    try:
        player, ghost_states = parse_move_request(request.get_json(force=True))
    except InvalidGameState as exc:
        return jsonify({"error": str(exc)}), 400

    for state in ghost_states:
        agent = ghosts.get(state.id)
        if agent is not None:
            agent.row, agent.col, agent.direction = state.row, state.col, state.direction
            if hasattr(agent, "state"):
                agent.state = state.state

    moves = []
    for state in ghost_states:
        agent = ghosts.get(state.id)
        if agent is None:
            continue
        direction = agent.step(player, ghost_states)
        moves.append({"id": agent.id, "direction": direction})

    return jsonify({"moves": moves})


if __name__ == "__main__":
    app.run(port=5000, debug=True)

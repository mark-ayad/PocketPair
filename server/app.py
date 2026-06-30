# server/app.py

from flask import Flask, jsonify, send_from_directory, request
from flask_cors import CORS
import json
import os
import random
import fcntl
from datetime import date

app = Flask(__name__)

# In production the frontend is served by this same app (same origin), so no
# cross-origin access is needed. Cross-origin is only enabled for explicitly
# listed domains via POCKETPAIR_CORS_ORIGINS (comma-separated) — e.g. during
# local dev with a separate frontend port.
_cors_origins = os.environ.get('POCKETPAIR_CORS_ORIGINS', '').strip()
if _cors_origins:
    CORS(app, resources={r"/api/*": {
        "origins": [o.strip() for o in _cors_origins.split(',') if o.strip()]
    }})


@app.after_request
def set_security_headers(response):
    """Conservative security headers for all responses."""
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; img-src 'self' data:; "
        "style-src 'self' 'unsafe-inline'; script-src 'self'; "
        "frame-ancestors 'none'"
    )
    return response

# Define paths to our data files, relative to the app.py location
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
RANGE_LIBRARY_PATH = os.path.join(DATA_DIR, 'rangeLibrary.json')
HISTORY_PATH = os.path.join(DATA_DIR, 'gameHistory.json')
HAND_LIBRARY_PATH = os.path.join(DATA_DIR, 'handLibrary.json')

# --- Helper Functions for Data Management ---

def load_json(file_path):
    """Safely loads JSON data from a file."""
    try:
        with open(file_path, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        # Return empty list/dict if file doesn't exist yet
        if 'gameHistory.json' in file_path:
            return []
        return None 
    except json.JSONDecodeError:
        print(f"Error decoding JSON from {file_path}. Returning empty structure.")
        return []

def save_json(file_path, data):
    """Safely saves data back to a JSON file."""
    with open(file_path, 'w') as f:
        json.dump(data, f, indent=4)

def normalize_puzzle(puzzle):
    """Backfill blind structure so the frontend can always rely on it.

    Older hands only carry `StartingPot` (= SB + BB in heads-up). When the
    blind fields are absent we infer them from the pot assuming a standard
    heads-up structure (SB = BB / 2, so StartingPot = 1.5 * BB). This keeps the
    existing library working while giving the client real blind values to drive
    blind-posting animation and big-blind-relative chip scaling.
    """
    if not isinstance(puzzle, dict):
        return puzzle

    starting_pot = puzzle.get('StartingPot')

    big_blind = puzzle.get('bigBlind')
    if not big_blind:
        big_blind = round(starting_pot / 1.5, 2) if starting_pot else 20
    small_blind = puzzle.get('smallBlind') or round(big_blind / 2, 2)
    ante = puzzle.get('ante', 0)

    puzzle['bigBlind'] = big_blind
    puzzle['smallBlind'] = small_blind
    puzzle['ante'] = ante

    # Heads-up: each player posts the ante. Warn (don't mutate) on mismatch so
    # content authoring surfaces bad data without breaking playable hands.
    expected_pot = small_blind + big_blind + ante * 2
    if starting_pot is not None and abs(starting_pot - expected_pot) > 0.01:
        print(f"[warn] puzzle {puzzle.get('id')}: StartingPot {starting_pot} "
              f"!= SB+BB+antes {expected_pot}")

    return puzzle

def select_daily_puzzle():
    """
    Selects the puzzle for today and records it, so every visitor gets the same
    hand for the day and a finished game stays consistent across reloads.

    The whole read-modify-write of the history is serialized with a file lock,
    and the pick is seeded by the date — so concurrent first-of-day requests
    (e.g. multiple gunicorn workers) can never double-write the history or hand
    out different puzzles.
    """
    today_id = date.today().strftime("%Y%m%d")

    range_library = load_json(RANGE_LIBRARY_PATH)
    if not range_library:
        return {"error": "Range library is empty or missing."}, 500

    lock_path = HISTORY_PATH + '.lock'
    with open(lock_path, 'w') as lock_file:
        fcntl.flock(lock_file, fcntl.LOCK_EX)
        try:
            history = load_json(HISTORY_PATH) or []

            # Already chosen today? (server restarts, later visitors)
            for entry in history:
                if entry.get("date") == today_id:
                    puzzle = next((p for p in range_library if p['id'] == entry['puzzle_id']), None)
                    if puzzle:
                        return puzzle
                    # Puzzle was removed from the library — drop the stale entry.
                    history.remove(entry)
                    break

            used_ids = [entry["puzzle_id"] for entry in history]
            available_puzzles = [p for p in range_library if p['id'] not in used_ids]

            if not available_puzzles:
                # Every puzzle has been used — start a fresh cycle.
                history = []
                available_puzzles = list(range_library)

            # Deterministic per-day pick: identical regardless of which worker
            # wins the race.
            rng = random.Random(today_id)
            selected_puzzle = rng.choice(available_puzzles)

            history.append({"date": today_id, "puzzle_id": selected_puzzle['id']})
            save_json(HISTORY_PATH, history)
            return selected_puzzle
        finally:
            fcntl.flock(lock_file, fcntl.LOCK_UN)

# --- API Endpoint ---

@app.route('/api/daily-puzzle', methods=['GET'])
def get_daily_puzzle():
    """Endpoint for the front-end to fetch the unique daily puzzle data."""
    puzzle_data = select_daily_puzzle()

    # select_daily_puzzle may return a (body, status) tuple on error
    if isinstance(puzzle_data, tuple):
        body, status = puzzle_data
        return jsonify(body), status
    if isinstance(puzzle_data, dict) and "error" in puzzle_data:
        return jsonify(puzzle_data), 500

    return jsonify(normalize_puzzle(puzzle_data))

ROOT_DIR = os.path.abspath(os.path.join(app.root_path, '..'))

@app.route('/')
def serve_index():
    return send_from_directory(ROOT_DIR, 'index.html')

@app.route('/js/<path:filename>')
def serve_js(filename):
    return send_from_directory(os.path.join(ROOT_DIR, 'js'), filename)

@app.route('/styles/<path:filename>')
def serve_styles(filename):
    return send_from_directory(os.path.join(ROOT_DIR, 'styles'), filename)


# --- Hand recorder (content authoring tool) ---

@app.route('/builder')
def serve_builder():
    return send_from_directory(ROOT_DIR, 'builder.html')

@app.route('/api/builder/library', methods=['GET'])
def builder_library():
    """How many hands have been recorded so far (for the recorder's counter)."""
    hands = load_json(HAND_LIBRARY_PATH) or []
    return jsonify({'count': len(hands), 'ids': [h.get('id') for h in hands]})

@app.route('/api/builder/hand/<hid>', methods=['GET'])
def builder_hand(hid):
    """Serve a single recorded hand by id, for playtesting via /?preview=<id>."""
    hands = load_json(HAND_LIBRARY_PATH) or []
    hand = next((h for h in hands if str(h.get('id')) == str(hid)), None)
    if not hand:
        return jsonify({'error': 'hand not found'}), 404
    return jsonify(normalize_puzzle(hand))

@app.route('/api/builder/save', methods=['POST'])
def builder_save():
    """Append a finished hand to handLibrary.json, auto-assigning the next id."""
    hand = request.get_json(silent=True)
    if not isinstance(hand, dict):
        return jsonify({'error': 'Invalid hand payload'}), 400

    lock_path = HAND_LIBRARY_PATH + '.lock'
    with open(lock_path, 'w') as lock_file:
        fcntl.flock(lock_file, fcntl.LOCK_EX)
        try:
            hands = load_json(HAND_LIBRARY_PATH) or []
            next_id = 0
            for h in hands:
                try:
                    next_id = max(next_id, int(h.get('id', 0)))
                except (ValueError, TypeError):
                    pass
            hand['id'] = str(next_id + 1)
            hands.append(hand)
            save_json(HAND_LIBRARY_PATH, hands)
            return jsonify({'ok': True, 'id': hand['id'], 'count': len(hands)})
        finally:
            fcntl.flock(lock_file, fcntl.LOCK_UN)


if __name__ == '__main__':
    # Local development server only. In production run under gunicorn
    # (see deploy/), which imports `app` directly and ignores this block.
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=False, port=port)
# server/app.py

from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
import json
import os
import random
from datetime import date

app = Flask(__name__)
# Allow the frontend (running on a different port) to access the API
CORS(app) 

# Define paths to our data files, relative to the app.py location
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
RANGE_LIBRARY_PATH = os.path.join(DATA_DIR, 'rangeLibrary.json')
HISTORY_PATH = os.path.join(DATA_DIR, 'gameHistory.json')

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
    Selects a random, unused puzzle from the library, 
    based on the current date, and updates the history.
    """
    today_id = date.today().strftime("%Y%m%d")
    
    # 1. Load all content and history
    range_library = load_json(RANGE_LIBRARY_PATH)
    history = load_json(HISTORY_PATH)
    
    if not range_library:
        return {"error": "Range library is empty or missing."}, 500

    # 2. Check if the puzzle for today has already been selected (for server restarts)
    for entry in history:
        if entry.get("date") == today_id:
            # Found today's puzzle — return it only if it still exists in the library
            puzzle = next((p for p in range_library if p['id'] == entry['puzzle_id']), None)
            if puzzle:
                return puzzle
            # Puzzle was deleted from library — remove stale entry and pick a new one
            history.remove(entry)
            save_json(HISTORY_PATH, history)
            break
    
    # 3. Get the list of IDs already used
    used_ids = [entry["puzzle_id"] for entry in history]
    
    # 4. Find all available (unused) puzzles
    available_puzzles = [p for p in range_library if p['id'] not in used_ids]

    if not available_puzzles:
        # Handle the case where all puzzles have been used (e.g., reset the history)
        history.clear()
        save_json(HISTORY_PATH, history)
        # Recurse to select from the newly reset history
        return select_daily_puzzle()

    # 5. Select a random available puzzle
    selected_puzzle = random.choice(available_puzzles)
    
    # 6. Update history
    new_entry = {
        "date": today_id,
        "puzzle_id": selected_puzzle['id']
    }
    history.append(new_entry)
    save_json(HISTORY_PATH, history)
    
    return selected_puzzle

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


if __name__ == '__main__':
    # Running in debug mode for development
    # When deployed, the port might be different (e.g., 80 or 8080)
    app.run(debug=False, port=5000)
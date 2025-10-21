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
            # Found today's puzzle, return it from the library
            return next((p for p in range_library if p['id'] == entry['puzzle_id']), None)
    
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
    
    if "error" in puzzle_data:
        return jsonify(puzzle_data), 500
        
    return jsonify(puzzle_data)

# Optional: Serve the static files (index.html, CSS, JS) from Flask
@app.route('/')
def serve_index():
    return send_from_directory(os.path.abspath(os.path.join(app.root_path, '..')), 'index.html')


if __name__ == '__main__':
    # Running in debug mode for development
    # When deployed, the port might be different (e.g., 80 or 8080)
    app.run(debug=True, port=5000)
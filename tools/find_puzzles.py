import json
import subprocess
import os
import random
import pokerkit # Make sure this is installed in your venv!

# --- Configuration ---
SOLVER_PATH = "./console_solver" # Path relative to this script in tools/
INPUT_FILENAME = "temp_solver_input.txt"
OUTPUT_FILENAME = "output_result.json"
PUZZLES_TO_FIND = 365
OUTPUT_DIR = "found_puzzles"

# Ensure the output directory exists
os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Define the Game Type ---
# We are using No-Limit Texas Hold'em
game_setup = pokerkit.NoLimitTexasHoldem

# --- Main Factory Loop (Start) ---
def find_puzzles():
    puzzles_found = 0
    games_simulated = 0

    while puzzles_found < PUZZLES_TO_FIND:
        games_simulated += 1
        print(f"\n--- Simulating Game #{games_simulated} (Found: {puzzles_found}) ---")

        # --- 1. Setup a new hand using pokerkit ---
        
        # Define the starting stacks (in chips, not BBs).
        # Let's use 100 BBs deep, assuming BB=2 chips, SB=1 chip.
        starting_stacks = (200, 200) 
        
        # Define the blinds/antes. PokerKit uses chip amounts.
        # SB=1 chip, BB=2 chips
        blinds_or_antes = (1, 2) 

        # Create the game state object
        state = game_setup.create_state(
            # Automations control automatic dealing and posting blinds
            automations = (
                pokerkit.Automation.ANTE_POSTING,
                pokerkit.Automation.BLIND_OR_STRADDLE_POSTING,
                pokerkit.Automation.HOLE_DEALING,      # This is the correct name
                pokerkit.Automation.BOARD_DEALING,     # We add this for the Flop/Turn/River
            ),
            # Number of players
            player_count = 2,
            # Stacks
            raw_starting_stacks = starting_stacks,
            # Blinds
            raw_blinds_or_straddles = blinds_or_antes,
            # Board cards start empty
            board_cards = (),
            # Hole cards start empty (will be dealt by automation)
            hole_cards = ((), ()),
        )
        
        # Check initial state (Optional debug print)
        print(f"Initial State: Pot={state.pot}, Stacks={state.stacks}")
        print(f"Player 0 Cards: {state.hole_cards[0]}")
        print(f"Player 1 Cards: {state.hole_cards[1]}")
        print(f"Button/SB is Player: {state.button_index}") # PokerKit's SB is the button HU

        # !!! --- TODO: Add the rest of the simulation logic here --- !!!
        #       - Loop through streets
        #       - Call create_solver_input_file
        #       - Call solver subprocess
        #       - Call get_gto_action_from_output
        #       - Check for fold
        #       - game.push(action)
        #       - Save if valid
        
        # For now, just break the loop to test the setup
        break # REMOVE THIS BREAK LATER

# --- Placeholder Functions (We'll implement these next) ---
def create_solver_input_file(game_state, filename=INPUT_FILENAME):
    print(f"  TODO: Create input file for solver based on state: {game_state.street}")
    pass # Placeholder

def get_gto_action_from_output(game_state, output_filename=OUTPUT_FILENAME):
    print(f"  TODO: Parse solver output and find best action for player {game_state.actor_index}")
    # Placeholder: Return a check action and assume no fold possible
    return pokerkit.CheckAction(), False # Placeholder

def format_game_to_json(game_state, puzzle_id, actions_by_street):
    print(f"  TODO: Format final game state into JSON")
    return {} # Placeholder

def format_pokerkit_action_for_display(action):
     return str(action) # Basic placeholder

# --- Run the Factory ---
if __name__ == "__main__":
    print("Starting Puzzle Factory...")
    # Make sure venv is active before running!
    # To run: cd tools && source ../venv/bin/activate && python find_puzzles.py
    
    find_puzzles()
    
    print("\nPuzzle Factory Finished (or stopped early).")
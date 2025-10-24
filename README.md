# PocketPair
### The Daily Iconic Poker Hand Deduction Puzzle

PocketPair is a daily puzzle game for poker fans designed to test your hand-reading skills. Each day, you are presented with a complete, famous poker hand from a televised event. Your goal is to use the betting action and Wordle-style feedback to deduce the villain's exact two hidden cards in 6 attempts or less.

## How to Play

The game flow is designed to mimic a real, televised hand, revealing information street by street.

1.  **Start:** You are shown your (Hero's) hand and the **Pre-Flop** betting action.
2.  **Guess (1 per street):** Make your first guess of the Villain's hand. You get one guess for Pre-Flop, one for the Flop, and one for the Turn.
3.  **Advance:** Click "Show Next Street" to reveal the community cards and the betting action for that street.
4.  **The River:** Once the River is revealed, you use all your remaining guesses (out of a total of 6) to find the solution.
5.  **Win:** You win by guessing the Villain's exact two cards (rank and suit) within the 6-attempt limit.

## Feedback System

After each guess, you will receive feedback based on the two cards you selected:

* **🟩 Green:** Exact card match (Rank & Suit).
* **🟨 Yellow:** Correct Rank, wrong Suit.
* **⬜ Grey:** Rank is not in the Villain's hand.

The feedback is **non-positional**, meaning the colors apply to your two-card guess as a pair, not in a specific order.

## Technical Stack

This project is built with a simple and lightweight stack:

* **Frontend:** Vanilla JavaScript (ES6+), HTML5, and CSS3.
* **Backend:** A simple Python server using **Flask** and **Flask-CORS**.
* **Data:** Game puzzles are served from a static `rangeLibrary.json` file via the Flask API, and a `gameHistory.json` file tracks daily puzzles.

## Local Development (How to Run)

To run the project on your local machine, follow these steps:

1.  **Clone the Repository:**
    ```bash
    git clone [https://github.com/your-username/PocketPair.git](https://github.com/your-username/PocketPair.git)
    cd PocketPair
    ```

2.  **Set Up the Backend Server:**
    * Navigate to the server directory:
        ```bash
        cd server
        ```
    * (Recommended) Create a virtual environment:
        ```bash
        python3 -m venv venv
        source venv/bin/activate
        ```
    * Install the required Python packages:
        ```bash
        pip install Flask flask-cors
        ```
    * Run the Flask server:
        ```bash
        python app.py
        ```
    The server will start and listen on `http://127.0.0.1:5000`.

3.  **Play the Game:**
    * The Flask server is already configured to host the `index.html` file.
    * Just open your web browser and navigate to: **http://127.0.0.1:5000**
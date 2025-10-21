// js/script.js

const API_URL = 'http://127.0.0.1:5000/api/daily-puzzle';
let currentPuzzle = null;
let currentStreetIndex = 0;
let attempts = 6;
let selectedCards = []; 
const MAX_ATTEMPTS = 6;
const BOARD_SIZE = 5; 

/**
 * Renders a card HTML element with suit color and rank/symbol placement.
 * @param {string} cardCode - e.g., "As"
 */
function renderCard(cardCode) {
    if (!cardCode) return ''; 

    const rank = cardCode.slice(0, -1);
    const suitCode = cardCode.slice(-1).toLowerCase();
    let suitSymbol;
    let suitColorClass;

    switch (suitCode) {
        case 's': suitSymbol = '♠'; suitColorClass = 'card-suit-black'; break;
        case 'h': suitSymbol = '♥'; suitColorClass = 'card-suit-red'; break;
        case 'd': suitSymbol = '♦'; suitColorClass = 'card-suit-red'; break;
        case 'c': suitSymbol = '♣'; suitColorClass = 'card-suit-black'; break;
        default: suitSymbol = ''; suitColorClass = '';
    }
    
    // Updated card visual: Rank on top, Symbol below, centrally aligned
    return `
        <span class="card ${suitColorClass}" data-card="${cardCode}">
            <div class="card-rank-display">${rank}</div>
            <div class="card-symbol-display">${suitSymbol}</div>
        </span>
    `;
}

/**
 * Fetches the puzzle data and starts the game.
 */
async function fetchDailyPuzzle() {
    try {
        const response = await fetch(API_URL); 
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        currentPuzzle = await response.json();
        
        initializeGame(currentPuzzle);

    } catch (error) {
        console.error("Failed to fetch daily puzzle:", error);
        document.getElementById('action-log-zone').innerHTML = 
            '<p class="error-message">Error loading game. Is the Python server running?</p>';
    }
}

/**
 * Sets initial game state.
 */
function initializeGame(data) {
    // Initialize attempt display
    attempts = MAX_ATTEMPTS;
    document.getElementById('attempts-left').textContent = MAX_ATTEMPTS;
    
    // Set Hero's hand at the bottom of the table
    document.getElementById('hero-cards').innerHTML = 
        data.HeroHand.map(card => renderCard(card)).join('');
    
    // Set initial pot size
    document.getElementById('pot-size').textContent = `Pot: $${data.StartingPot.toFixed(2)}`;

    // Render all 5 placeholders immediately for stability
    const boardContainer = document.getElementById('board-cards');
    boardContainer.innerHTML = Array(BOARD_SIZE).fill('<span class="card-placeholder"></span>').join('');

    // Clear log and render all street actions up to the current street
    document.getElementById('action-log-zone').innerHTML = '';
    renderFullActionStatus();

    // Setup the card selection grid 
    generateCardGrid();
    markKnownCards(data.HeroHand, []); 
}

/**
 * Renders the entire columnar action status display.
 */
function renderFullActionStatus() {
    const logZone = document.getElementById('action-log-zone');
    const allHistory = currentPuzzle.ActionHistory;
    logZone.innerHTML = ''; // Clear the log zone

    allHistory.forEach((streetData, index) => {
        // Only render streets that have been revealed (index <= currentStreetIndex)
        if (index > currentStreetIndex) return;

        const streetLogHTML = `
            <div class="street-column">
                <h4>${streetData.Street}</h4>
                ${streetData.Actions.map(action => `<p class="action-line">${action}</p>`).join('')}
            </div>
        `;
        logZone.innerHTML += streetLogHTML;
    });

    // Update board and pot based on the current street
    const currentStreetData = allHistory[currentStreetIndex];
    const boardContainer = document.getElementById('board-cards');
    const potElement = document.getElementById('pot-size');
    
    potElement.textContent = `Pot: $${currentStreetData.PotEnd.toFixed(2)}`;
    
    const cardsRendered = currentStreetData.CardsShown.map(card => renderCard(card)).join('');
    
    // Render placeholders for the cards not yet shown
    const placeholdersNeeded = BOARD_SIZE - currentStreetData.CardsShown.length;
    const placeholders = Array(placeholdersNeeded).fill('<span class="card-placeholder"></span>').join('');

    boardContainer.innerHTML = cardsRendered + placeholders;
    
    // Update the known cards in the selection grid
    markKnownCards(currentPuzzle.HeroHand, currentStreetData.CardsShown);
}

/**
 * Creates the interactive 52-card grid, organized by RANK horizontally (2 -> A).
 */
function generateCardGrid() {
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    const suits = ['d', 's', 'h', 'c']; 
    const gridContainer = document.getElementById('card-grid');
    gridContainer.innerHTML = '';
    
    suits.forEach(suit => {
        ranks.forEach(rank => {
            const cardCode = rank + suit;
            const cardElement = renderCard(cardCode);
            const wrapper = document.createElement('div');
            wrapper.classList.add('card-wrapper');
            wrapper.innerHTML = cardElement;
            wrapper.addEventListener('click', () => handleCardSelection(cardCode, wrapper));
            gridContainer.appendChild(wrapper);
        });
    });
}

/**
 * Handles card selection and updates the slots.
 */
function handleCardSelection(cardCode, element) {
    if (element.classList.contains('known-card') || element.classList.contains('rank-eliminated')) return;

    const isSelected = selectedCards.includes(cardCode);
    const slot1 = document.getElementById('card-slot-1');
    const slot2 = document.getElementById('card-slot-2');

    if (isSelected) {
        selectedCards = selectedCards.filter(c => c !== cardCode);
        element.classList.remove('selected');
        
        // Slot update logic
        if (slot1.dataset.card === cardCode) {
            slot1.innerHTML = 'Card 1';
            slot1.dataset.card = '';
        } else if (slot2.dataset.card === cardCode) {
            slot2.innerHTML = 'Card 2';
            slot2.dataset.card = '';
        }
    } else if (selectedCards.length < 2) {
        selectedCards.push(cardCode);
        element.classList.add('selected');

        // Slot update logic: Use renderCard which is horizontally aligned
        if (slot1.dataset.card === '') {
            slot1.innerHTML = renderCard(cardCode);
            slot1.dataset.card = cardCode;
        } else {
            slot2.innerHTML = renderCard(cardCode);
            slot2.dataset.card = cardCode;
        }
    }

    // Enable submit/next street if two cards are selected
    const isReady = selectedCards.length === 2;
    document.getElementById('submit-guess-btn').disabled = !isReady;
    document.getElementById('next-street-btn').disabled = !(isReady && currentStreetIndex < currentPuzzle.ActionHistory.length - 1);
}


/**
 * Runs the deduction logic or advances the street.
 */
function submitGuess() {
    if (selectedCards.length !== 2) return;
    
    // If not on the river (last street), hitting submit advances the game
    if (currentStreetIndex < currentPuzzle.ActionHistory.length - 1) {
        revealNextStreet();
        return;
    }
    
    // FIX 2: Core Game Logic: Decrement attempts and update display
    attempts--;
    document.getElementById('attempts-left').textContent = attempts;

    // Call external deduction logic
    const feedbackColors = generateFeedback(selectedCards, currentPuzzle.VillainSolution);
    
    // FIX 2: Render history
    renderGuessHistory(selectedCards, feedbackColors);
    updateDeductionAid(feedbackColors, selectedCards);

    // Check Win/Loss
    if (feedbackColors.every(c => c === 'GREEN')) {
        endGame(true);
    } else if (attempts === 0) {
        endGame(false);
    }

    // Reset selection state
    resetSelection();
}

/**
 * Renders the guess and feedback to the history list.
 */
function renderGuessHistory(guess, feedback) {
    const historyList = document.getElementById('guess-history-list');
    
    const feedbackBoxesHTML = `
        <div class="feedback-boxes">
            <span class="feedback-box ${feedback[0].toLowerCase()}"></span>
            <span class="feedback-box ${feedback[1].toLowerCase()}"></span>
            <span class="feedback-box ${feedback[2].toLowerCase()}"></span>
            <span class="feedback-box ${feedback[3].toLowerCase()}"></span>
        </div>
    `;

    const guessHTML = `
        <div class="guess-row">
            <div class="guess-cards">
                ${guess.map(card => renderCard(card)).join('')}
            </div>
            ${feedbackBoxesHTML}
        </div>
    `;
    historyList.insertAdjacentHTML('afterbegin', guessHTML); 
}

/**
 * Updates the card grid based on RED feedback.
 */
function updateDeductionAid(feedbackColors, guess) {
    if (feedbackColors[0] === 'RED') {
        const rank = guess[0].slice(0, -1);
        document.querySelectorAll(`.card-wrapper .card[data-card^="${rank}"]`).forEach(c => {
            c.parentNode.classList.add('rank-eliminated');
        });
    }
    if (feedbackColors[2] === 'RED') {
        const rank = guess[1].slice(0, -1);
        document.querySelectorAll(`.card-wrapper .card[data-card^="${rank}"]`).forEach(c => {
            c.parentNode.classList.add('rank-eliminated');
        });
    }
}

/**
 * Visually marks cards that are already known (Hero or Board) as unavailable.
 */
function markKnownCards(heroCards, boardCards) {
    const knownCards = [...heroCards, ...boardCards];
    document.querySelectorAll('.card-wrapper').forEach(wrapper => {
        const cardElement = wrapper.querySelector('.card');
        const cardCode = cardElement ? cardElement.dataset.card : null;
        
        wrapper.classList.remove('known-card'); 
        if (knownCards.includes(cardCode)) {
            wrapper.classList.add('known-card');
        }
    });
}

/**
 * Resets the selection slots after a guess.
 */
function resetSelection() {
    selectedCards.forEach(cardCode => {
        const wrapper = document.querySelector(`.card-wrapper .card[data-card="${cardCode}"]`)?.parentNode;
        if (wrapper) wrapper.classList.remove('selected');
    });
    selectedCards = [];
    document.getElementById('card-slot-1').innerHTML = 'Card 1';
    document.getElementById('card-slot-2').innerHTML = 'Card 2';
    document.getElementById('card-slot-1').dataset.card = '';
    document.getElementById('card-slot-2').dataset.card = '';
    document.getElementById('submit-guess-btn').disabled = true;
    document.getElementById('next-street-btn').disabled = true;
}

/**
 * Moves the game to the next street (Flop, Turn, River).
 */
function revealNextStreet() {
    currentStreetIndex++;
    if (currentStreetIndex < currentPuzzle.ActionHistory.length) {
        // Rerender the entire action status to show the new street
        renderFullActionStatus(); 
        resetSelection(); 
    }
    
    // Disable both buttons if we reached the River (final guessing street)
    if (currentStreetIndex === currentPuzzle.ActionHistory.length - 1) {
        document.getElementById('next-street-btn').style.display = 'none';
        document.getElementById('submit-guess-btn').textContent = 'Submit Final Guess';
    }
}

/**
 * Ends the game and displays result.
 */
function endGame(win) {
    document.getElementById('submit-guess-btn').disabled = true;
    document.getElementById('next-street-btn').disabled = true;
    document.getElementById('next-street-btn').style.display = 'none';
    
    // Unhide Villain's cards
    const villainCards = document.getElementById('villain-cards');
    villainCards.innerHTML = currentPuzzle.VillainSolution.map(card => renderCard(card)).join('');

    // Display result logic
    const resultMessage = win 
        ? `CONGRATULATIONS! Solved in ${MAX_ATTEMPTS - attempts} attempts.`
        : `GAME OVER. Solution: ${currentPuzzle.VillainSolution.map(card => renderCard(card)).join('')}.`;

    document.getElementById('guess-history-zone').innerHTML += `<h3 style="color: ${win ? 'var(--color-green)' : 'var(--color-red)'}; margin-top: 20px; text-align: center;">${resultMessage}</h3>`;
}

// Event Listeners
document.getElementById('submit-guess-btn').addEventListener('click', submitGuess);
document.getElementById('next-street-btn').addEventListener('click', submitGuess); 

// Start the game loop
fetchDailyPuzzle();
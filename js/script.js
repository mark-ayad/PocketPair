// js/script.js

const API_URL = 'http://127.0.0.1:5000/api/daily-puzzle';
let currentPuzzle = null;
let currentStreetIndex = 0;
let attempts = 6;
let selectedCards = []; 
let lockedCard = null; 
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
    attempts = MAX_ATTEMPTS;
    lockedCard = null;
    document.getElementById('attempts-left').textContent = MAX_ATTEMPTS;
    
    document.getElementById('hero-cards').innerHTML = 
        data.HeroHand.map(card => renderCard(card)).join('');
    
    document.getElementById('pot-size').textContent = `Pot: $${data.StartingPot.toFixed(2)}`;

    const boardContainer = document.getElementById('board-cards');
    boardContainer.innerHTML = Array(BOARD_SIZE).fill('<span class="card-placeholder"></span>').join('');

    document.getElementById('action-log-zone').innerHTML = '';
    renderFullActionStatus();

    generateCardGrid();
    markKnownCards(data.HeroHand, []); 

    document.getElementById('next-street-btn').disabled = false;
    
    // Clear old guess lists
    document.querySelectorAll('.guess-list').forEach(list => list.innerHTML = '');
}

/**
 * Renders the entire columnar action status display.
 */
function renderFullActionStatus() {
    const logZone = document.getElementById('action-log-zone');
    const allHistory = currentPuzzle.ActionHistory;
    logZone.innerHTML = ''; 

    allHistory.forEach((streetData, index) => {
        if (index > currentStreetIndex) return;

        const streetLogHTML = `
            <div class="street-column">
                <h4>${streetData.Street}</h4>
                ${streetData.Actions.map(action => `<p class="action-line">${action}</p>`).join('')}
            </div>
        `;
        logZone.innerHTML += streetLogHTML;
    });

    const currentStreetData = allHistory[currentStreetIndex];
    const boardContainer = document.getElementById('board-cards');
    const potElement = document.getElementById('pot-size');
    
    potElement.textContent = `Pot: $${currentStreetData.PotEnd.toFixed(2)}`;
    
    const cardsRendered = currentStreetData.CardsShown.map(card => renderCard(card)).join('');
    
    const placeholdersNeeded = BOARD_SIZE - currentStreetData.CardsShown.length;
    const placeholders = Array(placeholdersNeeded).fill('<span class="card-placeholder"></span>').join('');

    boardContainer.innerHTML = cardsRendered + placeholders;
    
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
    if (element.classList.contains('known-card') || 
        element.classList.contains('rank-miss') ||
        element.classList.contains('exact-match')) {
        return;
    }

    if (cardCode === lockedCard) return;

    const isSelected = selectedCards.includes(cardCode);
    const slot1 = document.getElementById('card-slot-1');
    const slot2 = document.getElementById('card-slot-2');

    if (isSelected) {
        selectedCards = selectedCards.filter(c => c !== cardCode);
        element.classList.remove('selected');
        
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

        if (slot1.dataset.card === '') {
            slot1.innerHTML = renderCard(cardCode);
            slot1.dataset.card = cardCode;
        } else {
            slot2.innerHTML = renderCard(cardCode);
            slot2.dataset.card = cardCode;
        }
    }

    const isReady = selectedCards.length === 2;
    document.getElementById('submit-guess-btn').disabled = !isReady;

    const isRiver = currentStreetIndex === currentPuzzle.ActionHistory.length - 1;
    document.getElementById('next-street-btn').disabled = isRiver;
}


/**
 * Runs the deduction logic.
 */
function submitGuess() {
    if (selectedCards.length !== 2) return;
    
    attempts--;
    document.getElementById('attempts-left').textContent = attempts;

    const feedbackResult = generateFeedback(selectedCards, currentPuzzle.VillainSolution);
    
    renderGuessHistory(feedbackResult, currentStreetIndex);
    updateDeductionAid(feedbackResult);

    if (feedbackResult.every(item => item.feedback === 'GREEN')) {
        endGame(true);
    } else if (attempts === 0) {
        endGame(false);
    }

    resetSelection();
}

/**
 * Renders the guess and feedback to the correct street column.
 */
function renderGuessHistory(feedbackResult, streetIndex) {
    let targetList;
    switch (streetIndex) {
        case 0: targetList = document.querySelector('#preflop-guesses .guess-list'); break;
        case 1: targetList = document.querySelector('#flop-guesses .guess-list'); break;
        case 2: targetList = document.querySelector('#turn-guesses .guess-list'); break;
        case 3: targetList = document.querySelector('#river-guesses .guess-list'); break;
        default: targetList = document.querySelector('#preflop-guesses .guess-list');
    }

    const guessHTML = `
        <div class="guess-row">
            <div class="guess-cards">
                ${feedbackResult.map(item => {
                    const cardElementHTML = renderCard(item.card);
                    // Inject the feedback class directly into the card span
                    return cardElementHTML.replace(
                        '<span class="card', 
                        `<span class="card ${item.feedback.toLowerCase()}`
                    );
                }).join('')}
            </div>
        </div>
    `;
    targetList.insertAdjacentHTML('beforeend', guessHTML); 
}

/**
 * Updates the card grid based on guess feedback.
 */
function updateDeductionAid(feedbackResult) {
    feedbackResult.forEach(item => {
        const wrapper = document.querySelector(`.card-wrapper .card[data-card="${item.card}"]`)?.parentNode;
        if (!wrapper) return;

        switch (item.feedback) {
            case 'GREEN':
                wrapper.classList.remove('rank-match');
                wrapper.classList.add('exact-match');
                lockedCard = item.card; 
                break;
            case 'YELLOW':
                if (!wrapper.classList.contains('exact-match')) {
                    wrapper.classList.add('rank-match');
                }
                break;
            case 'GREY':
                const rank = item.card.slice(0, -1);
                document.querySelectorAll(`.card-wrapper .card[data-card^="${rank}"]`).forEach(c => {
                    const w = c.parentNode;
                    if (!w.classList.contains('exact-match')) {
                        w.classList.add('rank-miss');
                        w.classList.remove('rank-match');
                    }
                });
                break;
        }
    });
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
 * Resets the selection slots after a guess, accounting for a locked card.
 */
function resetSelection() {
    selectedCards.forEach(cardCode => {
        const wrapper = document.querySelector(`.card-wrapper .card[data-card="${cardCode}"]`)?.parentNode;
        if (wrapper) wrapper.classList.remove('selected');
    });
    
    selectedCards = [];
    document.getElementById('card-slot-1').innerHTML = 'Card 1';
    document.getElementById('card-slot-1').dataset.card = '';
    document.getElementById('card-slot-2').innerHTML = 'Card 2';
    document.getElementById('card-slot-2').dataset.card = '';

    if (lockedCard) {
        selectedCards.push(lockedCard);
        document.getElementById('card-slot-1').innerHTML = renderCard(lockedCard);
        document.getElementById('card-slot-1').dataset.card = lockedCard;
        
        const wrapper = document.querySelector(`.card-wrapper .card[data-card="${lockedCard}"]`)?.parentNode;
        if (wrapper) wrapper.classList.add('selected');
    }

    document.getElementById('submit-guess-btn').disabled = true;
}

/**
 * Moves the game to the next street (Flop, Turn, River).
 */
function revealNextStreet() {
    currentStreetIndex++;
    if (currentStreetIndex < currentPuzzle.ActionHistory.length) {
        renderFullActionStatus(); 
        resetSelection(); 
    }
    
    if (currentStreetIndex === currentPuzzle.ActionHistory.length - 1) {
        document.getElementById('next-street-btn').style.display = 'none';
        document.getElementById('next-street-btn').disabled = true;
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
    
    const villainCards = document.getElementById('villain-cards');
    villainCards.innerHTML = currentPuzzle.VillainSolution.map(card => renderCard(card)).join('');

    const resultMessage = win 
        ? `CONGRATULATIONS! Solved in ${MAX_ATTEMPTS - attempts} attempts.`
        : `GAME OVER. Solution: ${currentPuzzle.VillainSolution.map(card => renderCard(card)).join('')}.`;
    
    const historyZone = document.getElementById('guess-history-zone');
    const resultHeader = document.createElement('h3');
    resultHeader.style.color = win ? 'var(--color-green-wordle)' : 'var(--color-error)';
    resultHeader.style.marginTop = '20px';
    resultHeader.style.textAlign = 'center';
    resultHeader.innerHTML = resultMessage;
    
    historyZone.appendChild(resultHeader);
}

// Event Listeners
document.getElementById('submit-guess-btn').addEventListener('click', submitGuess);
document.getElementById('next-street-btn').addEventListener('click', revealNextStreet); 

// Start the game loop
fetchDailyPuzzle();
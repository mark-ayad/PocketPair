/**
 * Normalizes just the rank part of a card.
 * @param {string} rank - The rank (e.g., "10", "T", "K")
 * @returns {string} - The normalized rank (e.g., "T", "T", "K")
 */
function normalizeRank(rank) {
    // Handle potential null or undefined input
    if (!rank) return '';
    return rank === "10" ? "T" : rank;
}

// js/script.js

const API_URL = 'http://127.0.0.1:5000/api/daily-puzzle';
let currentPuzzle = null;
let currentStreetIndex = 0;
let attempts = 6;
let selectedCards = [];
let lockedCard = null;
let hasGuessedThisStreet = false;
let knownYellowRanks = new Set(); // Stores ranks confirmed YELLOW in previous guesses
const MAX_ATTEMPTS = 6;
const BOARD_SIZE = 5;

/**
 * Renders a card HTML element with suit color and rank/symbol placement.
 * @param {string} cardCode - e.g., "As"
 */
function renderCard(cardCode) {
    if (!cardCode) return '';

    // Normalize rank '10' to 'T' for consistency in display
    let displayRank = cardCode.slice(0, -1);
    if (displayRank === "10") displayRank = "T";
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
            <div class="card-rank-display">${displayRank}</div>
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

        // Ensure VillainSolution is present before initializing
        if (!currentPuzzle || !currentPuzzle.VillainSolution) {
             throw new Error("Puzzle data is missing VillainSolution.");
        }

        initializeGame(currentPuzzle);

    } catch (error) {
        console.error("Failed to fetch or initialize daily puzzle:", error);
        // Display a user-friendly error message
        const logZone = document.getElementById('action-log-zone');
        if(logZone){
             logZone.innerHTML = '<p class="error-message">Error loading game. Please check server connection and data files.</p>';
        } else {
             document.body.innerHTML = '<p class="error-message">Critical error loading game components.</p>';
        }
    }
}


/**
 * Sets initial game state.
 */
function initializeGame(data) {
    attempts = MAX_ATTEMPTS;
    lockedCard = null;
    knownYellowRanks = new Set(); // Reset known yellow ranks for a new game
    currentStreetIndex = 0; // Ensure game starts at pre-flop
    hasGuessedThisStreet = false; // Reset guess status

    document.getElementById('attempts-left').textContent = MAX_ATTEMPTS;

    document.getElementById('hero-cards').innerHTML =
        data.HeroHand.map(card => renderCard(card)).join('');

    document.getElementById('pot-size').textContent = `Pot: $${data.StartingPot.toFixed(2)}`;

    // Ensure villain cards start hidden (or show placeholders if needed)
    document.getElementById('villain-cards').innerHTML = `
        <span class="card card-back"></span>
        <span class="card card-back"></span>
    `;


    const boardContainer = document.getElementById('board-cards');
    boardContainer.innerHTML = Array(BOARD_SIZE).fill('<span class="card-placeholder"></span>').join('');

    document.getElementById('action-log-zone').innerHTML = '';
    renderFullActionStatus();

    generateCardGrid();
    markKnownCards(data.HeroHand, []);

    // Clear old guess lists thoroughly
    document.querySelectorAll('.guess-list').forEach(list => list.innerHTML = '');

    // Reset selection slots
    resetSelection();

    // Update buttons for the initial state
    updateButtonStates();

     // Ensure Next Street button is correctly displayed/hidden initially
     const nextBtn = document.getElementById('next-street-btn');
     nextBtn.style.display = 'inline-block'; // Show initially
     nextBtn.textContent = 'Show Next Street'; // Reset text


    // Remove any previous win/loss message
    const existingResultHeader = document.querySelector('#guess-history-zone h3[style*="color"]');
    if (existingResultHeader) {
        existingResultHeader.remove();
    }
}

/**
 * Renders the entire columnar action status display.
 */
function renderFullActionStatus() {
    const logZone = document.getElementById('action-log-zone');
    if (!logZone || !currentPuzzle || !currentPuzzle.ActionHistory) return; // Add guards

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
    if (!currentStreetData) return; // Guard

    const boardContainer = document.getElementById('board-cards');
    const potElement = document.getElementById('pot-size');

    if (potElement) potElement.textContent = `Pot: $${currentStreetData.PotEnd.toFixed(2)}`;

    if (boardContainer) {
        const cardsRendered = currentStreetData.CardsShown.map(card => renderCard(card)).join('');
        const placeholdersNeeded = BOARD_SIZE - currentStreetData.CardsShown.length;
        const placeholders = Array(placeholdersNeeded > 0 ? placeholdersNeeded : 0).fill('<span class="card-placeholder"></span>').join('');
        boardContainer.innerHTML = cardsRendered + placeholders;
    }

    markKnownCards(currentPuzzle.HeroHand, currentStreetData.CardsShown);
}

/**
 * Creates the interactive 52-card grid, organized by RANK horizontally (2 -> A).
 */
function generateCardGrid() {
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    const suits = ['d', 's', 'h', 'c']; // Consistent suit order
    const gridContainer = document.getElementById('card-grid');
    gridContainer.innerHTML = '';

    suits.forEach(suit => {
        ranks.forEach(rank => {
            const cardCode = rank + suit;
            const cardElement = renderCard(cardCode); // Use consistent rendering
            const wrapper = document.createElement('div');
            wrapper.classList.add('card-wrapper');
            wrapper.innerHTML = cardElement;
            // Ensure event listener uses the wrapper element correctly
            wrapper.addEventListener('click', () => handleCardSelection(cardCode, wrapper));
            gridContainer.appendChild(wrapper);
        });
    });
}

/**
 * Updates the disabled state and styling of the action buttons,
 * and controls the Submit button text.
 */
function updateButtonStates() {
    const submitBtn = document.getElementById('submit-guess-btn');
    const nextBtn = document.getElementById('next-street-btn');
    if (!submitBtn || !nextBtn || !currentPuzzle || !currentPuzzle.ActionHistory) return; // Add guards

    const isReadyToSubmit = selectedCards.length === 2;
    const isRiver = currentStreetIndex === currentPuzzle.ActionHistory.length - 1;

    // --- Submit Button Text ---
    if (isRiver && attempts === 1) {
        submitBtn.textContent = 'Submit Final Guess';
    } else {
        submitBtn.textContent = 'Submit Guess';
    }

    // --- Submit Button Logic ---
    let submitShouldBeEnabled = false;
    if (isRiver) {
        submitShouldBeEnabled = isReadyToSubmit && attempts > 0; // Can only submit if attempts remain
    } else {
        submitShouldBeEnabled = isReadyToSubmit && !hasGuessedThisStreet && attempts > 0;
    }
    submitBtn.disabled = !submitShouldBeEnabled;
    submitBtn.classList.toggle('btn-primary', submitShouldBeEnabled);

    // --- Next Street Button Logic ---
    let nextShouldBeEnabled = !isRiver && hasGuessedThisStreet;
    nextBtn.disabled = !nextShouldBeEnabled;
    nextBtn.classList.toggle('btn-primary', nextShouldBeEnabled);

    // Ensure the Next Street button is hidden on the river
    nextBtn.style.display = isRiver ? 'none' : 'inline-block';
}


/**
 * Handles card selection and updates the slots.
 */
function handleCardSelection(cardCode, element) {
    // Check the wrapper's classes for lockouts
    if (element.classList.contains('known-card') ||
        element.classList.contains('rank-miss') ||
        element.classList.contains('exact-match')) {
        return;
    }

    if (cardCode === lockedCard) return;

    // Prevent card changes if a guess has already been made on this street (pre-river)
    if (currentStreetIndex < currentPuzzle.ActionHistory.length - 1 && hasGuessedThisStreet) {
        return;
    }

    const isSelected = selectedCards.includes(cardCode);
    const slot1 = document.getElementById('card-slot-1');
    const slot2 = document.getElementById('card-slot-2');
    if (!slot1 || !slot2) return; // Add guards

    if (isSelected) {
        selectedCards = selectedCards.filter(c => c !== cardCode);
        element.classList.remove('selected');

        // Clear the correct slot
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

        // Fill the first available slot
        if (!slot1.dataset.card) { // Check if dataset.card is empty or null
            slot1.innerHTML = renderCard(cardCode);
            slot1.dataset.card = cardCode;
        } else if (!slot2.dataset.card) {
            slot2.innerHTML = renderCard(cardCode);
            slot2.dataset.card = cardCode;
        }
    }

    updateButtonStates();
}


/**
 * Runs the deduction logic.
 */
function submitGuess() {
    if (selectedCards.length !== 2 || !currentPuzzle || !currentPuzzle.VillainSolution) return; // Add guards

    // Pre-River: prevent multiple guesses on the same street
    if (currentStreetIndex < currentPuzzle.ActionHistory.length - 1 && hasGuessedThisStreet) {
        return;
    }

    attempts--;
    document.getElementById('attempts-left').textContent = attempts;

    // Pass the knownYellowRanks to the feedback function
    const feedbackResult = generateFeedback(selectedCards, currentPuzzle.VillainSolution, knownYellowRanks);

    // Update knownYellowRanks based on the feedback received
    feedbackResult.forEach(item => {
        if (item.feedback === 'YELLOW') {
            const rank = normalizeRank(item.card.slice(0, -1));
            knownYellowRanks.add(rank);
        }
    });

    renderGuessHistory(feedbackResult, currentStreetIndex);

    updateDeductionAid(feedbackResult);

    // Check for win condition
    if (feedbackResult.every(item => item.feedback === 'GREEN')) {
        endGame(true);
        return; // Stop further execution on win
    }

    // Check for loss condition
    if (attempts <= 0) {
        endGame(false);
        return; // Stop further execution on loss
    }

    // After a successful guess (pre-river), lock the guessing phase for this street
    if (currentStreetIndex < currentPuzzle.ActionHistory.length - 1) {
        hasGuessedThisStreet = true;
    }

    // Update button states: this will disable Submit and enable Next Street (if pre-river)
    updateButtonStates();

    // Reset selection for the next action (either next street or next guess on river)
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
        default: targetList = document.querySelector('#preflop-guesses .guess-list'); // Fallback
    }

    if (!targetList) return; // Guard

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
 * Updates the card grid based on guess feedback, handling rank overlaps correctly.
 */
function updateDeductionAid(feedbackResult) {
    const ranksInCurrentGuess = { green: new Set(), yellow: new Set(), grey: new Set() };
    const specificCardsProcessed = new Set(); // Track cards handled in Pass 1

    // --- Pass 1: Apply GREEN and YELLOW feedback & track ranks for THIS guess ---
    feedbackResult.forEach(item => {
        const wrapper = document.querySelector(`.card-wrapper .card[data-card="${item.card}"]`)?.parentNode;
        if (!wrapper) return;

        const itemRank = normalizeRank(item.card.slice(0, -1));
        const cardCode = item.card;
        specificCardsProcessed.add(cardCode); // Mark this card as handled

        switch (item.feedback) {
            case 'GREEN':
                wrapper.classList.remove('rank-match', 'selected', 'rank-miss');
                wrapper.classList.add('exact-match');
                lockedCard = cardCode; // Update locked card if found
                ranksInCurrentGuess.green.add(itemRank);
                 // Ensure global knownYellow is cleared if we find the exact card
                 knownYellowRanks.delete(itemRank);
                break;
            case 'YELLOW':
                 // Only mark yellow if not already exactly matched
                if (!wrapper.classList.contains('exact-match')) {
                    // Apply the class directly based on the feedback result.
                    // The cumulative logic check is handled by generateFeedback.
                    wrapper.classList.add('rank-match');
                    ranksInCurrentGuess.yellow.add(itemRank);
                }
                break;
            case 'GREY':
                // Track grey ranks for Pass 2 logic
                ranksInCurrentGuess.grey.add(itemRank);
                break;
        }
    });

    // --- Pass 2: Apply GREY feedback intelligently based on global state ---
    feedbackResult.forEach(item => {
        if (item.feedback !== 'GREY') return;

        const wrapper = document.querySelector(`.card-wrapper .card[data-card="${item.card}"]`)?.parentNode;
        if (!wrapper) return;

        const itemRank = normalizeRank(item.card.slice(0, -1));
        const cardCode = item.card;

        // Determine if this rank is already confirmed (Globally GREEN or YELLOW)
        const rankIsConfirmedGreen = lockedCard && normalizeRank(lockedCard.slice(0, -1)) === itemRank;
        // Use the global knownYellowRanks state here
        const rankIsConfirmedYellow = knownYellowRanks.has(itemRank);

        if (rankIsConfirmedGreen || rankIsConfirmedYellow) {
            // Rank IS known globally. Only grey out THIS specific guessed card.
            if (!wrapper.classList.contains('exact-match') && !wrapper.classList.contains('rank-match')) {
                wrapper.classList.add('rank-miss');
                wrapper.classList.remove('selected');
            }
        } else {
            // Rank is NOT globally confirmed green/yellow.
            // Grey out the entire rank ONLY if NO card of this rank got green/yellow in THIS guess.
            const onlyGreyInCurrentGuess = !ranksInCurrentGuess.green.has(itemRank) && !ranksInCurrentGuess.yellow.has(itemRank);

            if (onlyGreyInCurrentGuess) {
                 // Grey out the whole rank (excluding any potential locked green card implicitly)
                 document.querySelectorAll(`.card-wrapper .card`).forEach(c => {
                    const cardRank = normalizeRank(c.dataset.card.slice(0, -1));
                    if (cardRank === itemRank) {
                        const w = c.parentNode;
                        // Final check: don't grey out the globally known green card
                         if (!w.classList.contains('exact-match')) {
                            w.classList.add('rank-miss');
                            w.classList.remove('rank-match', 'selected');
                        }
                    }
                });
            } else {
                 // Rank had green/yellow in *this* guess. Only grey out the specific grey card from this guess.
                  if (!wrapper.classList.contains('exact-match') && !wrapper.classList.contains('rank-match')) {
                      wrapper.classList.add('rank-miss');
                      wrapper.classList.remove('selected');
                  }
            }
        }
    });

     // --- Pass 3: Final GREEN rank lockout (redundant but safe) ---
     // If a rank is globally GREEN, ensure all others of that rank are greyed out.
     if (lockedCard) {
         const greenRank = normalizeRank(lockedCard.slice(0, -1));
         document.querySelectorAll(`.card-wrapper .card`).forEach(c => {
             const cardRank = normalizeRank(c.dataset.card.slice(0, -1));
             if (cardRank === greenRank) {
                 const w = c.parentNode;
                 if (!w.classList.contains('exact-match')) {
                     w.classList.remove('rank-match', 'selected');
                     w.classList.add('rank-miss');
                 }
             }
         });
     }
}


/**
 * Visually marks cards that are already known (Hero or Board) as unavailable.
 */
function markKnownCards(heroCards, boardCards) {
    const knownCards = [...heroCards, ...boardCards];
    // Need normalizeCard defined globally or passed in if it's not
    const normalizedKnownCards = knownCards.map(card => normalizeCard(card)).filter(Boolean); // Filter out nulls

    document.querySelectorAll('.card-wrapper').forEach(wrapper => {
        const cardElement = wrapper.querySelector('span.card'); // Target the span with class card
        const cardCode = cardElement ? cardElement.dataset.card : null;

        wrapper.classList.remove('known-card'); // Reset first

        if (cardCode) {
            const normalizedCardCode = normalizeCard(cardCode);
             // Check against the normalized list
            if (normalizedKnownCards.includes(normalizedCardCode)) {
                wrapper.classList.add('known-card');
            }
        }
    });
}


/**
 * Resets the selection slots and grid selection after a guess.
 */
function resetSelection() {
    selectedCards.forEach(cardCode => {
        const wrapper = document.querySelector(`.card-wrapper .card[data-card="${cardCode}"]`)?.parentNode;
        if (wrapper && !wrapper.classList.contains('exact-match')) { // Don't deselect green cards visually
             wrapper.classList.remove('selected');
        }
    });

    selectedCards = [];
    const slot1 = document.getElementById('card-slot-1');
    const slot2 = document.getElementById('card-slot-2');
    if (!slot1 || !slot2) return; // Add guards


    slot1.innerHTML = 'Card 1';
    slot1.dataset.card = '';
    slot2.innerHTML = 'Card 2';
    slot2.dataset.card = '';

    if (lockedCard) {
        selectedCards.push(lockedCard);
        slot1.innerHTML = renderCard(lockedCard);
        slot1.dataset.card = lockedCard;

        // Ensure the locked card visually stays selected (if needed)
        const wrapper = document.querySelector(`.card-wrapper .card[data-card="${lockedCard}"]`)?.parentNode;
        if (wrapper) wrapper.classList.add('selected'); // Re-add selected if cleared
    }
}


/**
 * Moves the game to the next street (Flop, Turn, River).
 */
function revealNextStreet() {
    if (currentStreetIndex >= currentPuzzle.ActionHistory.length - 1) return; // Don't advance past river

    currentStreetIndex++;
    hasGuessedThisStreet = false; // Allow guessing on the new street
    renderFullActionStatus();
    resetSelection();
    updateButtonStates(); // Update buttons for the new street state
}


/**
 * Ends the game and displays result.
 */
function endGame(win) {
    const submitBtn = document.getElementById('submit-guess-btn');
    const nextBtn = document.getElementById('next-street-btn');
     if(submitBtn) submitBtn.disabled = true;
     if(nextBtn) {
         nextBtn.disabled = true;
         nextBtn.style.display = 'none';
     }

    // New logic to style the villain's cards
    const villainCardsContainer = document.getElementById('villain-cards');
    if (!villainCardsContainer || !currentPuzzle || !currentPuzzle.VillainSolution) return; // Guard

    const originalSolution = currentPuzzle.VillainSolution;
    // Ensure lockedCard is normalized if it exists
    const normalizedLockedCard = lockedCard ? normalizeCard(lockedCard) : null;
    let finalCardsHTML = '';

    originalSolution.forEach(card => {
        const normalizedCard = normalizeCard(card);
        let cardHTML = renderCard(card); // Use original card for rendering

        if (win) {
            // If they won, both cards are green
            cardHTML = cardHTML.replace('<span class="card', '<span class="card final-green"');
        } else {
            // If they lost, check if this card matches the locked one
            if (normalizedLockedCard && normalizedLockedCard === normalizedCard) {
                cardHTML = cardHTML.replace('<span class="card', '<span class="card final-green"');
            } else {
                cardHTML = cardHTML.replace('<span class="card', '<span class="card final-red"');
            }
        }
        finalCardsHTML += cardHTML;
    });

    villainCardsContainer.innerHTML = finalCardsHTML;

    // Display result message
    const resultMessage = win
        ? `CONGRATULATIONS! Solved in ${MAX_ATTEMPTS - attempts} attempts.`
        : `GAME OVER. Solution: ${originalSolution.map(card => renderCard(card)).join(' ')}`; // Render cards in message

    const historyZone = document.getElementById('guess-history-zone');
    if (!historyZone) return; // Guard

     // Remove previous result message if it exists
     const existingResultHeader = historyZone.querySelector('h3[style*="color"]');
     if (existingResultHeader) {
         existingResultHeader.remove();
     }


    const resultHeader = document.createElement('h3');
    resultHeader.style.color = win ? 'var(--color-green-wordle)' : 'var(--color-error)';
    resultHeader.style.marginTop = '20px';
    resultHeader.style.textAlign = 'center';
    resultHeader.innerHTML = resultMessage; // Use innerHTML to render card spans

    historyZone.appendChild(resultHeader);
}

// Event Listeners (ensure elements exist before adding listeners)
const submitButton = document.getElementById('submit-guess-btn');
const nextStreetButton = document.getElementById('next-street-btn');

if (submitButton) submitButton.addEventListener('click', submitGuess);
if (nextStreetButton) nextStreetButton.addEventListener('click', revealNextStreet);

// --- Intro Screen Logic ---

// Get elements
const introScreen = document.getElementById('intro-screen');
const gameContainer = document.querySelector('.game-container');
const playButton = document.getElementById('play-game-btn');
const dateElement = document.getElementById('intro-date');

// Set the date on the intro screen
if (dateElement) {
    const today = new Date();
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    dateElement.textContent = today.toLocaleDateString('en-US', options);
}

// Play Button Listener
if (playButton && introScreen && gameContainer) {
    playButton.addEventListener('click', () => {
        introScreen.style.display = 'none'; // Hide intro
        gameContainer.style.display = 'flex'; // Show game

        // Add the new class to the body to switch themes/layouts
        document.body.classList.add('game-active');

        // Now that the user wants to play, fetch the puzzle and start the game
        fetchDailyPuzzle();
    });
} else {
    console.error("Intro screen elements not found, cannot initialize play button.");
}

// --- Legend Popup Logic ---
const legend = document.getElementById('feedback-legend');
const showLegendBtn = document.getElementById('show-legend-btn');

if (showLegendBtn && legend) {
    showLegendBtn.addEventListener('click', (e) => {
        // Toggle the 'show' class on the legend
        legend.classList.toggle('show');
        // Stop this click from immediately closing the legend if it's open
        e.stopPropagation();
    });

    // Add a global click listener to close the legend
    document.addEventListener('click', (e) => {
        // If the legend is shown AND the click was *not* inside the legend
        // AND the click was *not* on the button itself, then hide it.
        if (legend.classList.contains('show') &&
            !legend.contains(e.target) &&
            e.target !== showLegendBtn) {
            legend.classList.remove('show');
        }
    });
} else {
     console.error("Legend elements not found, cannot initialize legend button.");
}
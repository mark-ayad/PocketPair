// js/script.js

function formatCurrency(num) {
    if (num >= 1000000) {
        return '$' + (num / 1000000).toFixed(2) + 'M';
    }
    if (num >= 1000) {
        return '$' + (num / 1000).toFixed(2) + 'K';
    }
    return '$' + num.toFixed(2);
}

function normalizeCard(card) {
    if (!card || typeof card !== 'string' || card.length < 2) return null;
    if (card.startsWith('10')) return card.replace('10', 'T');
    return card;
}

function normalizeRank(rank) {
    if (!rank) return '';
    return rank === '10' ? 'T' : rank;
}

const API_URL = '/api/daily-puzzle';
const STORAGE_KEY = 'pocketpair_state';
const MAX_ATTEMPTS = 6;
const BOARD_SIZE = 5;

let currentPuzzle = null;
let currentStreetIndex = 0;
let attempts = MAX_ATTEMPTS;
let selectedCards = [];
let lockedCards = [];
let hasGuessedThisStreet = false;
let knownYellowRanks = new Set();
let guessLog = [];   // [{streetIndex, feedbackResult}] — drives share text and persistence
let gameOver = false;
let gameWon = false;

// --- Mobile bottom-sheet picker helpers ---
function isMobile() {
    return window.matchMedia('(max-width: 900px)').matches;
}
function openSheet() {
    document.getElementById('selection-grid-zone')?.classList.add('open');
    document.getElementById('sheet-backdrop')?.classList.add('open');
    document.body.classList.add('sheet-open');
}
function closeSheet() {
    document.getElementById('selection-grid-zone')?.classList.remove('open');
    document.getElementById('sheet-backdrop')?.classList.remove('open');
    document.body.classList.remove('sheet-open');
}

/**
 * Renders a card HTML element with suit color and rank/symbol placement.
 * @param {string} cardCode - e.g., "As"
 */
function renderCard(cardCode) {
    if (!cardCode) return '';

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

        if (!currentPuzzle || !currentPuzzle.VillainSolution) {
             throw new Error("Puzzle data is missing VillainSolution.");
        }

        initializeGame(currentPuzzle);

        // Restore saved progress if it's for today's puzzle
        let restored = false;
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const saved = JSON.parse(raw);
                if (saved.puzzleId === currentPuzzle.id) {
                    restoreGameState(saved);
                    restored = true;
                }
            }
        } catch (e) {
            localStorage.removeItem(STORAGE_KEY);
        }

        // Animate preflop actions on fresh game start (not restore)
        if (!restored) {
            setTimeout(() => animateStreetActions(currentPuzzle.ActionHistory[0]), 350);
        }

    } catch (error) {
        console.error("Failed to fetch or initialize daily puzzle:", error);
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
    lockedCards = [];
    knownYellowRanks = new Set();
    currentStreetIndex = 0;
    hasGuessedThisStreet = false;
    guessLog = [];
    gameOver = false;
    gameWon = false;

    document.getElementById('attempts-left').textContent = MAX_ATTEMPTS;

    // Tell the chip renderer this hand's big blind so pots/stacks scale by BB
    // (relative size) rather than raw dollars.
    setBigBlind(data.bigBlind);

    document.getElementById('hero-cards').innerHTML =
        data.HeroHand.map(card => renderCard(card)).join('');

    document.getElementById('pot-size').textContent = `Pot: ${formatCurrency(data.StartingPot)}`;
    
    document.getElementById('hero-stack').innerHTML = `Stack:<br>${formatCurrency(data.heroStartingStackBBs)}`;
    document.getElementById('villain-stack').innerHTML = `Stack:<br>${formatCurrency(data.villainStartingStackBBs)}`;


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

    document.querySelectorAll('.guess-list').forEach(list => list.innerHTML = '');

    resetSelection();
    updateButtonStates();

     const nextBtn = document.getElementById('next-street-btn');
     nextBtn.style.display = 'inline-block';
     nextBtn.textContent = 'Show Next Street';


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
    if (!logZone || !currentPuzzle || !currentPuzzle.ActionHistory) return;

    const heroLabel = document.getElementById('hero-label');
    const villainLabel = document.getElementById('villain-label');
    const heroButton = document.getElementById('hero-button-marker');
    const villainButton = document.getElementById('villain-button-marker');

    heroLabel.textContent = currentPuzzle.heroName || 'Hero';
    villainLabel.textContent = currentPuzzle.villainName || 'Villain';

    // In heads-up: BTN = SB = dealer. Show dealer button on whichever player has it.
    const heroIsDealer = currentPuzzle.HeroPosition === 'SB' || currentPuzzle.HeroPosition === 'BTN';
    if (heroIsDealer) {
        heroButton.classList.remove('hidden');
        villainButton.classList.add('hidden');
    } else {
        heroButton.classList.add('hidden');
        villainButton.classList.remove('hidden');
    }

    // Hand timeline — all streets shown; revealed ones display their plays so
    // the user can review everything, future ones stay dimmed (no spoilers).
    const allHistory = currentPuzzle.ActionHistory;
    logZone.innerHTML = allHistory.map((streetData, index) => {
        let state = 'future';
        if (index < currentStreetIndex) state = 'revealed';
        else if (index === currentStreetIndex) state = 'current';

        const actionsHTML = (index <= currentStreetIndex)
            ? streetData.Actions.map(action => `<p class="action-line">${action}</p>`).join('')
            : '<p class="action-line muted">—</p>';

        return `
            <div class="timeline-street ${state}">
                <div class="timeline-street-header">${streetData.Street}</div>
                <div class="timeline-actions">${actionsHTML}</div>
            </div>
        `;
    }).join('');

    const currentStreetData = allHistory[currentStreetIndex];
    if (!currentStreetData) return;

    const boardContainer = document.getElementById('board-cards');
    const potElement = document.getElementById('pot-size');
    const heroStackEl = document.getElementById('hero-stack');
    const villainStackEl = document.getElementById('villain-stack');

    if (potElement) potElement.textContent = `Pot: ${formatCurrency(currentStreetData.PotEnd)}`;

    if (heroStackEl) heroStackEl.innerHTML = `Stack:<br>${formatCurrency(currentStreetData.HeroStack)}`;
    if (villainStackEl) villainStackEl.innerHTML = `Stack:<br>${formatCurrency(currentStreetData.VillainStack)}`;

    const heroStackChips    = document.getElementById('hero-stack-chips');
    const villainStackChips = document.getElementById('villain-stack-chips');
    if (heroStackChips)    renderStackChip(heroStackChips,    currentStreetData.HeroStack);
    if (villainStackChips) renderStackChip(villainStackChips, currentStreetData.VillainStack);


    if (boardContainer) {
        const prevCount = boardContainer.querySelectorAll('.card:not(.card-placeholder)').length;
        const cardsRendered = currentStreetData.CardsShown.map((card, i) => {
            const html = renderCard(card);
            return i >= prevCount
                ? html.replace('<span class="card', '<span class="board-card-reveal card')
                : html;
        }).join('');
        const placeholdersNeeded = BOARD_SIZE - currentStreetData.CardsShown.length;
        const placeholders = Array(placeholdersNeeded > 0 ? placeholdersNeeded : 0).fill('<span class="card-placeholder"></span>').join('');
        boardContainer.innerHTML = cardsRendered + placeholders;

        // Stagger newly revealed board cards
        boardContainer.querySelectorAll('.board-card-reveal').forEach((el, i) => {
            el.style.animationDelay = `${i * 120}ms`;
        });
    }

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
 * Updates the disabled state and styling of the action buttons,
 * and controls the Submit button text.
 */
/**
 * Drives the mobile bottom action bar: either opens the picker ("Make Your
 * Guess") or, once a non-river street has been guessed, advances the street.
 */
function updateMobileBar() {
    const bar = document.getElementById('mobile-action-bar');
    const trigger = document.getElementById('mobile-guess-trigger');
    if (!bar || !trigger || !currentPuzzle || !currentPuzzle.ActionHistory) return;

    if (gameOver) {
        bar.classList.add('bar-hidden');
        return;
    }
    bar.classList.remove('bar-hidden');

    const isRiver = currentStreetIndex === currentPuzzle.ActionHistory.length - 1;
    if (!isRiver && hasGuessedThisStreet) {
        trigger.textContent = 'Show Next Street';
        trigger.dataset.mode = 'next';
    } else {
        trigger.textContent = 'Make Your Guess';
        trigger.dataset.mode = 'guess';
    }
}

function updateButtonStates() {
    const submitBtn = document.getElementById('submit-guess-btn');
    const nextBtn = document.getElementById('next-street-btn');
    if (!submitBtn || !nextBtn || !currentPuzzle || !currentPuzzle.ActionHistory) return;

    updateMobileBar();

    if (gameOver) {
        submitBtn.disabled = true;
        nextBtn.disabled = true;
        return;
    }

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
        submitShouldBeEnabled = isReadyToSubmit && attempts > 0;
    } else {
        submitShouldBeEnabled = isReadyToSubmit && !hasGuessedThisStreet && attempts > 0;
    }
    submitBtn.disabled = !submitShouldBeEnabled;
    submitBtn.classList.toggle('btn-primary', submitShouldBeEnabled);

    // --- Next Street Button Logic ---
    let nextShouldBeEnabled = !isRiver && hasGuessedThisStreet;
    nextBtn.disabled = !nextShouldBeEnabled;
    nextBtn.classList.toggle('btn-primary', nextShouldBeEnabled);

    nextBtn.style.display = isRiver ? 'none' : 'inline-block';
}


/**
 * Handles card selection and updates the slots.
 */
function handleCardSelection(cardCode, element) {
    if (gameOver) return;

    if (element.classList.contains('known-card') ||
        element.classList.contains('rank-miss') ||
        element.classList.contains('exact-match')) {
        return;
    }

    if (lockedCards.includes(cardCode)) return;

    if (currentStreetIndex < currentPuzzle.ActionHistory.length - 1 && hasGuessedThisStreet) {
        return;
    }

    const isSelected = selectedCards.includes(cardCode);
    const slot1 = document.getElementById('card-slot-1');
    const slot2 = document.getElementById('card-slot-2');
    if (!slot1 || !slot2) return;

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

        if (!slot1.dataset.card) {
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
    if (selectedCards.length !== 2 || !currentPuzzle || !currentPuzzle.VillainSolution) return;

    if (currentStreetIndex < currentPuzzle.ActionHistory.length - 1 && hasGuessedThisStreet) {
        return;
    }

    attempts--;
    document.getElementById('attempts-left').textContent = attempts;

    const feedbackResult = generateFeedback(selectedCards, currentPuzzle.VillainSolution);

    feedbackResult.forEach(item => {
        if (item.feedback === 'YELLOW') {
            const rank = normalizeRank(item.card.slice(0, -1));
            knownYellowRanks.add(rank);
        }
    });

    guessLog.push({ streetIndex: currentStreetIndex, feedbackResult });
    renderGuessHistory(feedbackResult, currentStreetIndex);
    updateDeductionAid(feedbackResult);

    if (feedbackResult.every(item => item.feedback === 'GREEN')) {
        endGame(true);
        return;
    }

    if (attempts <= 0) {
        endGame(false);
        return;
    }

    if (currentStreetIndex < currentPuzzle.ActionHistory.length - 1) {
        hasGuessedThisStreet = true;
    }

    saveGameState();
    updateButtonStates();
    resetSelection();

    // On mobile, drop back to the table after a non-river guess so the player
    // sees the board and feedback. On the river they keep guessing in the sheet.
    if (isMobile() && currentStreetIndex < currentPuzzle.ActionHistory.length - 1) {
        closeSheet();
    }
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

    if (!targetList) return;

    const guessHTML = `
        <div class="guess-row">
            <div class="guess-cards">
                ${feedbackResult.map(item => {
                    const cardElementHTML = renderCard(item.card);
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
    const specificCardsProcessed = new Set();

    feedbackResult.forEach(item => {
        const wrapper = document.querySelector(`.card-wrapper .card[data-card="${item.card}"]`)?.parentNode;
        if (!wrapper) return;

        const itemRank = normalizeRank(item.card.slice(0, -1));
        const cardCode = item.card;
        specificCardsProcessed.add(cardCode);

        switch (item.feedback) {
            case 'GREEN':
                wrapper.classList.remove('rank-match', 'selected', 'rank-miss');
                wrapper.classList.add('exact-match');
                
                if (!lockedCards.includes(cardCode)) {
                    lockedCards.push(cardCode);
                }
                
                ranksInCurrentGuess.green.add(itemRank);
                 knownYellowRanks.delete(itemRank);
                break;
            case 'YELLOW':
                if (!wrapper.classList.contains('exact-match')) {
                    wrapper.classList.add('rank-match');
                    ranksInCurrentGuess.yellow.add(itemRank);
                }
                break;
            case 'GREY':
                ranksInCurrentGuess.grey.add(itemRank);
                break;
        }
    });

    feedbackResult.forEach(item => {
        if (item.feedback !== 'GREY') return;

        const wrapper = document.querySelector(`.card-wrapper .card[data-card="${item.card}"]`)?.parentNode;
        if (!wrapper) return;

        const itemRank = normalizeRank(item.card.slice(0, -1));

        const rankIsConfirmedGreen = lockedCards.some(c => normalizeRank(c.slice(0, -1)) === itemRank);
        const rankIsConfirmedYellow = knownYellowRanks.has(itemRank);

        if (rankIsConfirmedGreen) {
            // A green for this rank is locked — grey ALL remaining suits (only one King possible in a 2-card hand)
            document.querySelectorAll('.card-wrapper .card').forEach(c => {
                const cardRank = normalizeRank(c.dataset.card.slice(0, -1));
                if (cardRank === itemRank) {
                    const w = c.parentNode;
                    if (!w.classList.contains('exact-match')) {
                        w.classList.add('rank-miss');
                        w.classList.remove('rank-match', 'selected');
                    }
                }
            });
        } else if (rankIsConfirmedYellow) {
            if (!wrapper.classList.contains('exact-match') && !wrapper.classList.contains('rank-match')) {
                wrapper.classList.add('rank-miss');
                wrapper.classList.remove('selected');
            }
        } else {
            const onlyGreyInCurrentGuess = !ranksInCurrentGuess.green.has(itemRank) && !ranksInCurrentGuess.yellow.has(itemRank);

            if (onlyGreyInCurrentGuess) {
                 document.querySelectorAll(`.card-wrapper .card`).forEach(c => {
                    const cardRank = normalizeRank(c.dataset.card.slice(0, -1));
                    if (cardRank === itemRank) {
                        const w = c.parentNode;
                         if (!w.classList.contains('exact-match')) {
                            w.classList.add('rank-miss');
                            w.classList.remove('rank-match', 'selected');
                        }
                    }
                });
            } else {
                  if (!wrapper.classList.contains('exact-match') && !wrapper.classList.contains('rank-match')) {
                      wrapper.classList.add('rank-miss');
                      wrapper.classList.remove('selected');
                  }
            }
        }
    });

     // Count how many green cards we have for each rank
     const lockedRankCounts = {};
     lockedCards.forEach(card => {
         const rank = normalizeRank(card.slice(0, -1));
         lockedRankCounts[rank] = (lockedRankCounts[rank] || 0) + 1;
     });

     // Find ranks where we have found *both* cards (a confirmed pair)
     const confirmedPairRanks = Object.keys(lockedRankCounts).filter(rank => lockedRankCounts[rank] === 2);

     // Grey out other cards *only* for confirmed pairs
     confirmedPairRanks.forEach(rank => {
         document.querySelectorAll(`.card-wrapper .card`).forEach(c => {
             const cardRank = normalizeRank(c.dataset.card.slice(0, -1));
             if (cardRank === rank) {
                 const w = c.parentNode;
                 // Only grey it out if it's not already green
                 if (!w.classList.contains('exact-match')) {
                     w.classList.remove('rank-match', 'selected');
                     w.classList.add('rank-miss');
                 }
             }
         });
     });
}


/**
 * Visually marks cards that are already known (Hero or Board) as unavailable.
 */
function markKnownCards(heroCards, boardCards) {
    const knownCards = [...heroCards, ...boardCards];
    const normalizedKnownCards = knownCards.map(card => normalizeCard(card)).filter(Boolean);

    document.querySelectorAll('.card-wrapper').forEach(wrapper => {
        const cardElement = wrapper.querySelector('span.card');
        const cardCode = cardElement ? cardElement.dataset.card : null;

        wrapper.classList.remove('known-card');

        if (cardCode) {
            const normalizedCardCode = normalizeCard(cardCode);
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
        if (wrapper && !wrapper.classList.contains('exact-match')) {
             wrapper.classList.remove('selected');
        }
    });

    selectedCards = [];
    const slot1 = document.getElementById('card-slot-1');
    const slot2 = document.getElementById('card-slot-2');
    if (!slot1 || !slot2) return;


    slot1.innerHTML = 'Card 1';
    slot1.dataset.card = '';
    slot2.innerHTML = 'Card 2';
    slot2.dataset.card = '';

    if (lockedCards.length === 1) {
        const card = lockedCards[0];
        selectedCards.push(card);
        slot1.innerHTML = renderCard(card);
        slot1.dataset.card = card;

        const wrapper = document.querySelector(`.card-wrapper .card[data-card="${card}"]`)?.parentNode;
        if (wrapper) wrapper.classList.add('selected'); 

    } else if (lockedCards.length === 2) {
        const card1 = lockedCards[0];
        const card2 = lockedCards[1];
        selectedCards.push(card1, card2);
        
        slot1.innerHTML = renderCard(card1);
        slot1.dataset.card = card1;
        slot2.innerHTML = renderCard(card2);
        slot2.dataset.card = card2;

        const wrapper1 = document.querySelector(`.card-wrapper .card[data-card="${card1}"]`)?.parentNode;
        if (wrapper1) wrapper1.classList.add('selected');
        const wrapper2 = document.querySelector(`.card-wrapper .card[data-card="${card2}"]`)?.parentNode;
        if (wrapper2) wrapper2.classList.add('selected');
    }
}


/**
 * Moves the game to the next street (Flop, Turn, River).
 */
function revealNextStreet() {
    if (currentStreetIndex >= currentPuzzle.ActionHistory.length - 1) return;

    currentStreetIndex++;
    hasGuessedThisStreet = false;
    renderFullActionStatus();
    resetSelection();
    saveGameState();
    updateButtonStates();
    animateStreetActions(currentPuzzle.ActionHistory[currentStreetIndex]);
}


/**
 * Ends the game and displays the result modal.
 * @param {boolean} win
 * @param {boolean} showModal - false when restoring from saved state (avoid auto-popping modal)
 */
function endGame(win, showModal = true) {
    gameOver = true;
    gameWon = win;
    closeSheet();
    saveGameState();
    // 1. Disable game buttons
    const submitBtn = document.getElementById('submit-guess-btn');
    const nextBtn = document.getElementById('next-street-btn');
    if (submitBtn) submitBtn.disabled = true;
    if (nextBtn) {
        nextBtn.disabled = true;
        nextBtn.style.display = 'none';
    }

    // 2. Show the final correct cards on the table
    const villainCardsContainer = document.getElementById('villain-cards');
    if (!villainCardsContainer || !currentPuzzle || !currentPuzzle.VillainSolution) return;

    const originalSolution = currentPuzzle.VillainSolution;
    const normalizedLockedCards = lockedCards.map(c => normalizeCard(c));
    let finalCardsHTML = '';

    originalSolution.forEach(card => {
        const normalizedCard = normalizeCard(card);
        let cardHTML = renderCard(card);

        if (win) {
            cardHTML = cardHTML.replace('<span class="card', '<span class="card final-green"');
        } else {
            if (normalizedLockedCards.includes(normalizedCard)) {
                cardHTML = cardHTML.replace('<span class="card', '<span class="card final-green"');
            } else {
                cardHTML = cardHTML.replace('<span class="card', '<span class="card final-red"');
            }
        }
        finalCardsHTML += cardHTML;
    });
    villainCardsContainer.innerHTML = finalCardsHTML;


    // 3. Get all modal elements
    const modal = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalCards = document.getElementById('modal-solution-cards');
    const modalContext = document.getElementById('modal-context');
    const modalYoutubeBtn = document.getElementById('modal-youtube-btn');
    
    if (!modal || !modalTitle || !modalCards || !modalContext || !modalYoutubeBtn) {
        console.error("Modal elements not found!");
        return;
    }

    // 4. Populate modal content
    if (win) {
        modalTitle.innerHTML = `CONGRATULATIONS!`;
        modalTitle.className = 'win';
    } else {
        modalTitle.innerHTML = `GAME OVER`;
        modalTitle.className = 'loss';
    }

    // Render the larger solution cards
    modalCards.innerHTML = originalSolution.map(card => renderCard(card)).join('');
    
    // Set context and YouTube link
    modalContext.textContent = currentPuzzle.context || "No context available for this hand.";
    
    // Only surface the "Watch Hand" button for a real http(s) link.
    const videoLink = (currentPuzzle.youtubeLink || '').trim();
    if (/^https?:\/\//i.test(videoLink)) {
        modalYoutubeBtn.href = videoLink;
        modalYoutubeBtn.style.display = 'block';
    } else {
        modalYoutubeBtn.removeAttribute('href');
        modalYoutubeBtn.style.display = 'none';
    }

    // 5. Show the modal (skipped when restoring saved state)
    if (showModal) {
        modal.classList.add('show');
    }
}

function saveGameState() {
    if (!currentPuzzle) return;
    const state = {
        puzzleId: currentPuzzle.id,
        streetIndex: currentStreetIndex,
        attempts,
        hasGuessedThisStreet,
        guessLog,
        gameOver,
        gameWon
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function restoreGameState(savedState) {
    currentStreetIndex = savedState.streetIndex;
    attempts = savedState.attempts;
    hasGuessedThisStreet = savedState.hasGuessedThisStreet;
    guessLog = savedState.guessLog || [];
    gameOver = savedState.gameOver || false;
    gameWon = savedState.gameWon || false;

    // Reset derived state — rebuilt by replaying guessLog
    lockedCards = [];
    knownYellowRanks = new Set();

    document.getElementById('attempts-left').textContent = attempts;
    renderFullActionStatus();

    // Suppress slide-in animation during restore (would flash on every refresh)
    document.body.classList.add('restoring');
    guessLog.forEach(entry => {
        entry.feedbackResult.forEach(item => {
            if (item.feedback === 'YELLOW') {
                knownYellowRanks.add(normalizeRank(item.card.slice(0, -1)));
            }
        });
        renderGuessHistory(entry.feedbackResult, entry.streetIndex);
        updateDeductionAid(entry.feedbackResult);
    });
    document.body.classList.remove('restoring');

    const currentStreetData = currentPuzzle.ActionHistory[currentStreetIndex];
    if (currentStreetData) {
        markKnownCards(currentPuzzle.HeroHand, currentStreetData.CardsShown);
        // Restore pot chips statically (no animation on page reload)
        const potChips = document.getElementById('pot-chips');
        if (potChips) renderChipPile(potChips, currentStreetData.PotEnd, false);
    }

    resetSelection();
    updateButtonStates();

    if (gameOver) {
        endGame(gameWon, false); // restore board state, skip modal
    }
}

function generateShareText() {
    if (!currentPuzzle) return '';
    const attemptsUsed = MAX_ATTEMPTS - attempts;
    const result = gameWon ? `${attemptsUsed}/6` : 'X/6';
    const emojiMap = { GREEN: '🟩', YELLOW: '🟨', GREY: '⬜' };
    const rows = guessLog.map(entry =>
        entry.feedbackResult.map(item => emojiMap[item.feedback]).join('')
    ).join('\n');
    return `PocketPair #${currentPuzzle.id} ${result}\n\n${rows}`;
}

// Wait for the DOM to be fully loaded before attaching event listeners
document.addEventListener('DOMContentLoaded', () => {

    // Event Listeners
    const submitButton = document.getElementById('submit-guess-btn');
    const nextStreetButton = document.getElementById('next-street-btn');

    if (submitButton) submitButton.addEventListener('click', submitGuess);
    if (nextStreetButton) nextStreetButton.addEventListener('click', revealNextStreet);

    // Replay the chip animation for the currently revealed street on demand.
    const replayBtn = document.getElementById('replay-animation-btn');
    if (replayBtn) {
        replayBtn.addEventListener('click', () => {
            if (!currentPuzzle || !currentPuzzle.ActionHistory) return;
            const street = currentPuzzle.ActionHistory[currentStreetIndex];
            if (street) animateStreetActions(street);
        });
    }

    // --- Mobile bottom-sheet picker wiring ---
    const guessTrigger = document.getElementById('mobile-guess-trigger');
    const sheetCloseBtn = document.getElementById('sheet-close');
    const sheetBackdrop = document.getElementById('sheet-backdrop');

    if (guessTrigger) {
        guessTrigger.addEventListener('click', () => {
            if (guessTrigger.dataset.mode === 'next') {
                closeSheet();
                revealNextStreet();
            } else {
                openSheet();
            }
        });
    }
    if (sheetCloseBtn) sheetCloseBtn.addEventListener('click', closeSheet);
    if (sheetBackdrop) sheetBackdrop.addEventListener('click', closeSheet);

    // --- ADD THIS BLOCK for Modal ---
    const modal = document.getElementById('modal-overlay');
    const closeModalBtn = document.getElementById('modal-close-btn');

    if (modal && closeModalBtn) {
        closeModalBtn.addEventListener('click', () => modal.classList.remove('show'));
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('show');
        });
    }

    // Share button — copy Wordle-style emoji grid to clipboard
    const shareBtn = document.getElementById('modal-share-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', () => {
            const text = generateShareText();
            navigator.clipboard.writeText(text).then(() => {
                shareBtn.textContent = 'Copied!';
                setTimeout(() => { shareBtn.textContent = 'Share'; }, 2000);
            });
        });
    }


    // --- Intro Screen Logic ---

    const introScreen = document.getElementById('intro-screen');
    const gameContainer = document.querySelector('.game-container');
    const playButton = document.getElementById('play-game-btn');
    const dateElement = document.getElementById('intro-date');

    if (dateElement) {
        const today = new Date();
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        dateElement.textContent = today.toLocaleDateString('en-US', options);
    }

    if (playButton && introScreen && gameContainer) {
        playButton.addEventListener('click', () => {
            introScreen.style.display = 'none';
            gameContainer.style.display = 'flex';

            document.body.classList.add('game-active');
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
            legend.classList.toggle('show');
            e.stopPropagation();
        });

        document.addEventListener('click', (e) => {
            if (legend.classList.contains('show') &&
                !legend.contains(e.target) &&
                e.target !== showLegendBtn) {
                legend.classList.remove('show');
            }
        });
    } else {
        console.error("Legend elements not found, cannot initialize legend button.");
    }

}); // End of DOMContentLoaded
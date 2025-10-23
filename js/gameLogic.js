// js/gameLogic.js

/**
 * Normalizes a card string's rank from "10" to "T".
 * e.g., "10d" becomes "Td", "As" remains "As".
 * Returns null if the card format is invalid.
 * @param {string} card - The card string.
 * @returns {string|null} - The normalized card string or null.
 */
function normalizeCard(card) {
    if (!card || typeof card !== 'string' || card.length < 2) {
        return null; // Invalid card format
    }
    if (card.startsWith("10")) {
        return card.replace("10", "T");
    }
    // Basic validation for rank and suit characters (can be expanded)
    const rank = card.slice(0, -1);
    const suit = card.slice(-1).toLowerCase();
    if (!/^[2-9TJQKA]$/.test(rank) || !/^[sdhc]$/.test(suit)) {
       // Allow potentially invalid card strings for now, feedback logic handles downstream
    }
    return card; // Return original if not '10' prefix
}


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

/**
 * Generates Wordle-style feedback for a two-card guess, considering known yellow ranks.
 *
 * @param {string[]} guess - An array of two card strings (e.g., ["Td", "Jd"]).
 * @param {string[]} solution - The two-card solution (e.g., ["10d", "Jd"]).
 * @param {Set<string>} knownYellowRanks - A Set containing ranks already confirmed YELLOW in previous guesses.
 * @returns {Array<object>} An array of feedback objects, e.g.,
 * [{card: "Td", feedback: "GREEN"}, {card: "Jd", feedback: "GREEN"}]
 */
function generateFeedback(guess, solution, knownYellowRanks) {
    // Initialize feedback array with original guess cards
    const feedback = [
        { card: guess[0], feedback: 'GREY' },
        { card: guess[1], feedback: 'GREY' }
    ];

    // Normalize both guess and solution for 10/T mismatch and ensure validity
    const normalizedGuess = guess.map(normalizeCard).filter(Boolean);
    const normalizedSolution = solution.map(normalizeCard).filter(Boolean);

    // Guard against invalid input after normalization
    if (normalizedGuess.length !== 2 || normalizedSolution.length !== 2) {
        console.error("Invalid guess or solution provided:", guess, solution);
         return [ { card: guess[0] || '', feedback: 'GREY' }, { card: guess[1] || '', feedback: 'GREY' } ];
    }

    // Make a mutable copy of the normalized solution pool
    let solutionPool = [...normalizedSolution];
    let solutionRanksAvailable = []; // Will store ranks of cards NOT matched green

    // --- Pass 1: Check for GREEN (Exact Card Match) ---
    for (let i = 0; i < feedback.length; i++) {
        const guessCard = normalizedGuess[i];
        const matchIndex = solutionPool.indexOf(guessCard);

        if (matchIndex !== -1) {
            feedback[i].feedback = 'GREEN';
            solutionPool.splice(matchIndex, 1); // Remove from pool
        }
    }

    // --- Update available ranks after GREEN pass ---
    solutionRanksAvailable = solutionPool.map(card => normalizeRank(card.slice(0, -1)));


    // --- Pass 2: Check for YELLOW (Rank Match), considering known yellows ---
    for (let i = 0; i < feedback.length; i++) {
        // Skip cards that are already GREEN
        if (feedback[i].feedback === 'GREEN') {
            continue;
        }

        const guessCard = normalizedGuess[i];
        const guessRank = normalizeRank(guessCard.slice(0, -1));

        // Check if this rank exists among the *remaining* solution cards
        const rankMatchIndex = solutionRanksAvailable.indexOf(guessRank);

        if (rankMatchIndex !== -1) {
             // If this rank is *already known* yellow, this specific guess must be GREY
             if (knownYellowRanks.has(guessRank)) {
                 feedback[i].feedback = 'GREY';
             } else {
                // Otherwise, it's a valid YELLOW
                feedback[i].feedback = 'YELLOW';
                // Consume the rank so it cannot be matched YELLOW again in this guess
                solutionRanksAvailable.splice(rankMatchIndex, 1);
            }
        }
        // If not GREEN or YELLOW (or forced GREY), it remains GREY (default)
    }

    // Return the feedback using the original guess card strings
    return feedback;
}
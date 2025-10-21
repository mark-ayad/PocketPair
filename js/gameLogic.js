// js/gameLogic.js

/**
 * Normalizes a card string's rank from "10" to "T".
 * e.g., "10d" becomes "Td", "As" remains "As".
 * @param {string} card - The card string.
 * @returns {string} - The normalized card string.
 */
function normalizeCard(card) {
    if (card.startsWith("10")) {
        return card.replace("10", "T");
    }
    return card;
}

/**
 * Normalizes just the rank part of a card.
 * @param {string} rank - The rank (e.g., "10", "T", "K")
 * @returns {string} - The normalized rank (e.g., "T", "T", "K")
 */
function normalizeRank(rank) {
    return rank === "10" ? "T" : rank;
}

/**
 * Generates Wordle-style feedback for a two-card guess.
 *
 * @param {string[]} guess - An array of two card strings (e.g., ["Td", "Jd"]).
 * @param {string[]} solution - The two-card solution (e.g., ["10d", "Jd"]).
 * @returns {Array<object>} An array of feedback objects, e.g.,
 * [{card: "Td", feedback: "GREEN"}, {card: "Jd", feedback: "GREEN"}]
 */
function generateFeedback(guess, solution) {
    const feedback = [
        { card: guess[0], feedback: 'GREY' },
        { card: guess[1], feedback: 'GREY' }
    ];

    // Normalize both guess and solution for 10/T mismatch
    const normalizedGuess = guess.map(normalizeCard);
    const normalizedSolution = solution.map(normalizeCard);

    // Get ranks from the normalized guess
    const guessRanks = [
        normalizedGuess[0].slice(0, -1), 
        normalizedGuess[1].slice(0, -1)
    ];

    // Make a mutable copy of the normalized solution pool
    let solutionPool = [...normalizedSolution];

    // --- Pass 1: Check for GREEN (Exact Card Match) ---
    for (let i = 0; i < feedback.length; i++) {
        const guessCard = normalizedGuess[i]; // e.g., "Td"
        const matchIndex = solutionPool.indexOf(guessCard); // e.g., finds "Td" in ["Jd", "Td"]

        if (matchIndex !== -1) {
            feedback[i].feedback = 'GREEN';
            solutionPool.splice(matchIndex, 1); // Remove from pool
        }
    }

    // Get the ranks of the *remaining* cards in the solution pool
    let solutionRanksAvailable = solutionPool.map(card => card.slice(0, -1));

    // --- Pass 2: Check for YELLOW (Rank Match) ---
    for (let i = 0; i < feedback.length; i++) {
        // Skip cards that are already GREEN
        if (feedback[i].feedback === 'GREEN') {
            continue;
        }

        const guessRank = guessRanks[i]; // e.g., "T"
        const rankMatchIndex = solutionRanksAvailable.indexOf(guessRank);

        if (rankMatchIndex !== -1) {
            feedback[i].feedback = 'YELLOW';
            solutionRanksAvailable.splice(rankMatchIndex, 1); // Consume the rank
        } 
        // If not GREEN or YELLOW, it remains GREY
    }

    return feedback;
}
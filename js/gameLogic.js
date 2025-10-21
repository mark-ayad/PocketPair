/**
 * Generates Wordle-style feedback for a two-card guess.
 *
 * @param {string[]} guess - An array of two card strings (e.g., ["As", "Kh"]).
 * @param {string[]} solution - The two-card solution (e.g., ["Ac", "Kd"]).
 * @returns {Array<object>} An array of feedback objects, e.g.,
 * [{card: "As", feedback: "YELLOW"}, {card: "Kh", feedback: "GREY"}]
 * Feedback types: 'GREEN' (Exact match), 'YELLOW' (Rank match), 'GREY' (No match).
 */
function generateFeedback(guess, solution) {
    const feedback = [
        { card: guess[0], feedback: 'GREY' },
        { card: guess[1], feedback: 'GREY' }
    ];

    const guessRanks = [guess[0].slice(0, -1), guess[1].slice(0, -1)];
    const solRanks = [solution[0].slice(0, -1), solution[1].slice(0, -1)];

    // Make copies to "use up" matches
    let solCopy = [...solution];

    // First pass: Check for GREEN (exact card match)
    for (let i = 0; i < feedback.length; i++) {
        const guessCard = feedback[i].card;
        const exactMatchIndex = solCopy.indexOf(guessCard);

        if (exactMatchIndex !== -1) {
            feedback[i].feedback = 'GREEN';
            solCopy.splice(exactMatchIndex, 1); // Remove from copy
        }
    }

    // Make a copy of remaining ranks
    let solRanksCopy = solCopy.map(card => card.slice(0, -1));

    // Second pass: Check for YELLOW (rank match)
    for (let i = 0; i < feedback.length; i++) {
        // Skip cards that are already green
        if (feedback[i].feedback === 'GREEN') {
            continue;
        }

        const guessRank = guessRanks[i];
        const rankMatchIndex = solRanksCopy.indexOf(guessRank);

        if (rankMatchIndex !== -1) {
            feedback[i].feedback = 'YELLOW';
            solRanksCopy.splice(rankMatchIndex, 1); // Remove rank from copy
        }
    }

    return feedback;
}
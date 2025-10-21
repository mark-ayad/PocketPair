// js/gameLogic.js

/**
 * Generates the non-positional four-attribute feedback.
 * @param {Array<string>} guess - Two guessed cards (e.g., ["As", "Qs"])
 * @param {Array<string>} solution - The two hidden cards (e.g., ["Kd", "Qc"])
 * @returns {Array<string>} Four feedback colors (Rank1, Suit1, Rank2, Suit2)
 */
function generateFeedback(guess, solution) {
    const feedback = [];
    
    // Helper to get card components
    const parseCard = (card) => ({ 
        rank: card.slice(0, -1), 
        suit: card.slice(-1) 
    });

    const guessCard1 = parseCard(guess[0]);
    const guessCard2 = parseCard(guess[1]);
    
    // Create flexible copies of the solution attributes for matching
    let availableSolutions = [
        parseCard(solution[0]),
        parseCard(solution[1])
    ];

    // Card 1 and Card 2 attributes (Rank, Suit) are stored in this order: [R1, S1, R2, S2]
    const attributes = [guessCard1.rank, guessCard1.suit, guessCard2.rank, guessCard2.suit];
    
    // --- Phase 1: Full Card Match (GREEN) ---
    // Track which solution card has been used
    let solutionUsed = [false, false];

    // Check guess card 1
    if (guessCard1.rank === availableSolutions[0].rank && guessCard1.suit === availableSolutions[0].suit) {
        feedback[0] = 'GREEN'; feedback[1] = 'GREEN'; solutionUsed[0] = true;
    } else if (guessCard1.rank === availableSolutions[1].rank && guessCard1.suit === availableSolutions[1].suit) {
        feedback[0] = 'GREEN'; feedback[1] = 'GREEN'; solutionUsed[1] = true;
    }

    // Check guess card 2
    if (!solutionUsed[0] && guessCard2.rank === availableSolutions[0].rank && guessCard2.suit === availableSolutions[0].suit) {
        feedback[2] = 'GREEN'; feedback[3] = 'GREEN'; solutionUsed[0] = true;
    } else if (!solutionUsed[1] && guessCard2.rank === availableSolutions[1].rank && guessCard2.suit === availableSolutions[1].suit) {
        feedback[2] = 'GREEN'; feedback[3] = 'GREEN'; solutionUsed[1] = true;
    }

    // --- Phase 2: Partial Match (YELLOW) on remaining attributes ---
    
    // Check Card 1 attributes (if not already GREEN)
    if (feedback[0] !== 'GREEN') {
        let matchedIndex = solutionUsed[0] ? 1 : 0; // Check the unmatched solution card
        if (solutionUsed[0] && solutionUsed[1]) matchedIndex = -1; // Both used, no match possible

        // Rank match?
        if (matchedIndex !== -1 && guessCard1.rank === availableSolutions[matchedIndex].rank) {
            feedback[0] = 'YELLOW';
            // Mark the attribute as consumed to prevent double-matching
            availableSolutions[matchedIndex].rank = null; 
        } else {
            feedback[0] = 'RED';
        }
        
        // Suit match?
        if (matchedIndex !== -1 && guessCard1.suit === availableSolutions[matchedIndex].suit) {
             feedback[1] = 'YELLOW';
        } else {
            feedback[1] = 'RED';
        }
    }

    // Check Card 2 attributes (if not already GREEN)
    if (feedback[2] !== 'GREEN') {
        let matchedIndex = solutionUsed[0] ? 1 : 0; 
        if (solutionUsed[0] && solutionUsed[1]) matchedIndex = -1; 

        // Rank match?
        if (matchedIndex !== -1 && guessCard2.rank === availableSolutions[matchedIndex].rank) {
            feedback[2] = 'YELLOW';
        } else {
            feedback[2] = 'RED';
        }

        // Suit match?
        if (matchedIndex !== -1 && guessCard2.suit === availableSolutions[matchedIndex].suit) {
            feedback[3] = 'YELLOW';
        } else {
            feedback[3] = 'RED';
        }
    }
    
    // Ensure the output is always 4 colors
    return feedback.map(c => c || 'RED');
}
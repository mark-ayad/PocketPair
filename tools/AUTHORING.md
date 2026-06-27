# Authoring PocketPair hands

Hands live in `data/rangeLibrary.json` as a JSON array. Use
`tools/hand_template.json` as a starting point, then **always run the
validator** before committing:

```bash
python3 tools/validate_hands.py
```

It exits non-zero and lists every problem if any hand is malformed.

## Cards
- Two characters: rank + suit. Ranks `2 3 4 5 6 7 8 9 T J Q K A`, suits
  `c d h s` (use `T`, not `10`).
- The 2 hero cards, 2 villain cards, and 5 board cards must all be **distinct**
  (9 unique cards).

## Fields
| Field | Notes |
|-------|-------|
| `id` | Unique string across the whole library. |
| `name`, `context` | Title and the after-game blurb. |
| `youtubeLink` | Optional. Must be an `http(s)` URL to show the "Watch Hand" button. |
| `heroName`, `villainName` | Display names. |
| `HeroPosition` | `SB`/`BTN` means Hero is the dealer/small blind (heads-up). |
| `smallBlind`, `bigBlind`, `ante` | Blind structure. If omitted, the server infers `BB = StartingPot / 1.5`, `SB = BB / 2`, `ante = 0`. Set them explicitly for clarity. |
| `heroStartingStackBBs`, `villainStartingStackBBs` | Starting stacks **in dollars** (the name is historical). |
| `HeroHand`, `VillainSolution`, `Board` | See Cards above. `Board` is `[flop, flop, flop, turn, river]`. |
| `StartingPot` | Must equal `smallBlind + bigBlind + ante*2`. |
| `ActionHistory` | Exactly 4 streets: Pre-Flop, Flop, Turn, River. |

## The betting / pot convention (important)
The validator and the animation both assume:

- A **"bets/raises to $X"** sets the player's **total wagered that street**
  (cumulative, blind included). A **"check-raises to $X"** is a raise.
- A **"calls $X"** adds `$X` to that player's street total.
- **Pre-flop**, the SB and BB players begin already committed for their blind
  (plus ante). So "Hero (SB) raises to $60" costs $50 more on top of the
  posted $10.
- Each street's `PotEnd` = previous `PotEnd` + both players' final street
  totals. `HeroStack`/`VillainStack` = starting stack − total contributed so
  far. Stacks must never go negative.

`CardsShown` per street: `[]` pre-flop, 3 on the flop, 4 on the turn, 5 on the
river — and must match the front of `Board`.

> Note: 10 of the original placeholder hands (ids 2–10, 12) violate the pot
> convention and should be replaced. Run the validator to see the current list.

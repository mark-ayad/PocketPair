#!/usr/bin/env python3
"""Validate a PocketPair hand library.

Usage:
    python3 tools/validate_hands.py [data/rangeLibrary.json]

Checks each hand for the data convention the game relies on:
  - required fields present and well-typed
  - valid, non-duplicated cards (2 hero + 2 villain + 5 board = 9 distinct)
  - StartingPot == smallBlind + bigBlind + antes (per player)
  - chip conservation: PotEnd reconciles street-by-street from the blinds and
    the betting line (see project_hand_action_convention)
  - player stacks reconcile (start - contributed) and never go negative
  - youtubeLink, if present, is an http(s) URL
  - villain hole-card combos are unique across the library (warning)

Exits non-zero if any hand has errors. Warnings don't fail the run.
"""

import json
import os
import re
import sys

RANKS = set('23456789TJQKA')
SUITS = set('cdhs')
STREETS = ['Pre-Flop', 'Flop', 'Turn', 'River']
CARDS_SHOWN_LEN = {0: 0, 1: 3, 2: 4, 3: 5}  # by street index

REQUIRED = [
    'id', 'name', 'HeroPosition', 'HeroHand', 'VillainSolution', 'Board',
    'StartingPot', 'ActionHistory',
    'heroStartingStackBBs', 'villainStartingStackBBs',
]


def norm_card(c):
    if isinstance(c, str) and c.startswith('10'):
        return 'T' + c[2:]
    return c


def card_ok(c):
    return (isinstance(c, str) and len(c) == 2
            and c[0] in RANKS and c[1].lower() in SUITS)


def infer_blinds(hand):
    """Mirror the backend: use explicit blinds or infer from StartingPot."""
    sp = hand.get('StartingPot')
    bb = hand.get('bigBlind') or (round(sp / 1.5, 2) if sp else 20)
    sb = hand.get('smallBlind') or round(bb / 2, 2)
    ante = hand.get('ante', 0)
    return sb, bb, ante


def street_totals(actions, hero_init, villain_init):
    """Return (hero_total, villain_total) wagered this street.

    Matches js/chips.js parseStreetActions: 'raise/bet to $X' sets the absolute
    street total; 'call $X' adds X. Seeded with posted blinds pre-flop.
    """
    hero_bet, villain_bet = hero_init, villain_init
    for a in actions:
        low = a.lower()
        hero = low.startswith('hero')
        m = re.search(r'\$([0-9,]+(?:\.[0-9]+)?)', a)
        amt = float(m.group(1).replace(',', '')) if m else 0
        # Order matches js/chips.js: raise before check, so a check-raise is a
        # raise. A raise/bet sets the absolute street total; a call adds to it.
        if 'fold' in low:
            continue
        if 'raise' in low:
            if hero:
                hero_bet = amt
            else:
                villain_bet = amt
        elif 'call' in low:
            if hero:
                hero_bet += amt
            else:
                villain_bet += amt
        elif 'bet' in low or amt > 0:
            if hero:
                hero_bet = amt
            else:
                villain_bet = amt
        # else: a check — no chips
    return hero_bet, villain_bet


def validate_hand(hand, seen_combos):
    errors, warnings = [], []
    hid = hand.get('id', '?')

    for f in REQUIRED:
        if f not in hand:
            errors.append(f'missing field: {f}')
    if errors:
        return errors, warnings  # can't go further without core fields

    hero = [norm_card(c) for c in hand['HeroHand']]
    villain = [norm_card(c) for c in hand['VillainSolution']]
    board = [norm_card(c) for c in hand['Board']]

    for label, cards, n in (('HeroHand', hero, 2),
                            ('VillainSolution', villain, 2),
                            ('Board', board, 5)):
        if len(cards) != n:
            errors.append(f'{label} must have {n} cards, has {len(cards)}')
        for c in cards:
            if not card_ok(c):
                errors.append(f'{label} has invalid card: {c!r}')

    all_cards = hero + villain + board
    dupes = {c for c in all_cards if all_cards.count(c) > 1}
    if dupes:
        errors.append(f'duplicate cards across hand/board: {sorted(dupes)}')

    # Blind structure / starting pot
    sb, bb, ante = infer_blinds(hand)
    expected_start = sb + bb + ante * 2
    if abs(hand['StartingPot'] - expected_start) > 0.01:
        errors.append(f'StartingPot {hand["StartingPot"]} != SB+BB+antes '
                      f'{expected_start}')

    # Action history structure
    ah = hand['ActionHistory']
    if len(ah) != 4:
        errors.append(f'ActionHistory must have 4 streets, has {len(ah)}')
        return errors, warnings

    hero_is_sb = hand.get('HeroPosition') in ('SB', 'BTN')
    hero_total = (sb if hero_is_sb else bb) + ante
    villain_total = (bb if hero_is_sb else sb) + ante

    running_pot = 0.0
    hero_contrib = 0.0
    villain_contrib = 0.0
    for i, street in enumerate(ah):
        if street.get('Street') != STREETS[i]:
            warnings.append(f'street {i} named {street.get("Street")!r}, '
                            f'expected {STREETS[i]!r}')
        shown = [norm_card(c) for c in street.get('CardsShown', [])]
        if len(shown) != CARDS_SHOWN_LEN[i]:
            errors.append(f'{STREETS[i]} CardsShown should have '
                          f'{CARDS_SHOWN_LEN[i]} cards, has {len(shown)}')
        elif shown != board[:len(shown)]:
            errors.append(f'{STREETS[i]} CardsShown {shown} != board prefix '
                          f'{board[:len(shown)]}')

        if i == 0:
            h, v = street_totals(street['Actions'], hero_total, villain_total)
        else:
            h, v = street_totals(street['Actions'], 0, 0)
        hero_contrib += h
        villain_contrib += v
        running_pot += h + v

        if abs(running_pot - street['PotEnd']) > 0.01:
            errors.append(f'{STREETS[i]} PotEnd {street["PotEnd"]} != '
                          f'reconciled {round(running_pot, 2)}')

        # Stacks
        exp_hero = hand['heroStartingStackBBs'] - hero_contrib
        exp_vill = hand['villainStartingStackBBs'] - villain_contrib
        if 'HeroStack' in street and abs(street['HeroStack'] - exp_hero) > 0.01:
            warnings.append(f'{STREETS[i]} HeroStack {street["HeroStack"]} != '
                            f'expected {round(exp_hero, 2)}')
        if 'VillainStack' in street and abs(street['VillainStack'] - exp_vill) > 0.01:
            warnings.append(f'{STREETS[i]} VillainStack {street["VillainStack"]} '
                            f'!= expected {round(exp_vill, 2)}')
        if exp_hero < -0.01 or exp_vill < -0.01:
            errors.append(f'{STREETS[i]} stack went negative')

    # youtube link
    link = (hand.get('youtubeLink') or '').strip()
    if link and not re.match(r'^https?://', link, re.I):
        warnings.append(f'youtubeLink is not an http(s) URL: {link!r}')

    # Unique villain combo (order-independent)
    combo = tuple(sorted(villain))
    if combo in seen_combos:
        warnings.append(f'villain combo {combo} also used by hand '
                        f'{seen_combos[combo]}')
    else:
        seen_combos[combo] = hid

    return errors, warnings


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(__file__), '..', 'data', 'rangeLibrary.json')
    with open(path) as f:
        library = json.load(f)

    seen_combos = {}
    total_errors = 0
    total_warnings = 0
    failing = []

    for hand in library:
        errors, warnings = validate_hand(hand, seen_combos)
        hid = hand.get('id', '?')
        if errors:
            failing.append(hid)
            total_errors += len(errors)
            print(f'\n✗ hand {hid} ({hand.get("name", "")})')
            for e in errors:
                print(f'    ERROR: {e}')
        for w in warnings:
            total_warnings += 1
            print(f'  ! hand {hid}: {w}')

    print(f'\nChecked {len(library)} hands: '
          f'{len(failing)} with errors, {total_warnings} warnings.')
    if failing:
        print(f'Hands with errors: {", ".join(map(str, failing))}')
    sys.exit(1 if total_errors else 0)


if __name__ == '__main__':
    main()

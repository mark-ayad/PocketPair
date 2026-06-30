// js/chips.js — chip visuals (denominations) and per-action street animations

let _animGen = 0;

// Big-blind unit used to convert absolute dollar amounts into BB-relative chip
// magnitudes. Set per-puzzle via setBigBlind() so a 20BB pot reads the same
// size whether the game is $1/$2 or $500/$1000 ("dynamic pots, relative
// regardless of game"). Dollar labels still show the true absolute amount.
let _bigBlind = 20;
function setBigBlind(bb) {
    _bigBlind = (typeof bb === 'number' && bb > 0) ? bb : 20;
}

// Chip denominations expressed in BIG BLINDS, high → low. Greedy change-making
// maps any amount (after /bigBlind) onto stacks of these, so a pile reads like
// real chips and scales by relative pot size rather than raw dollar magnitude.
const BB_DENOMS = [
    { v: 100, face: '#ef6c00', edge: '#bf360c', light: '#ffa726' }, // orange
    { v: 50,  face: '#f9a825', edge: '#e65100', light: '#ffd54f' }, // gold
    { v: 25,  face: '#8e24aa', edge: '#4a148c', light: '#ce93d8' }, // purple
    { v: 10,  face: '#37474f', edge: '#0d1b22', light: '#78909c' }, // charcoal
    { v: 5,   face: '#2e7d32', edge: '#1b5e20', light: '#66bb6a' }, // green
    { v: 2,   face: '#1565c0', edge: '#0d47a1', light: '#42a5f5' }, // blue
    { v: 1,   face: '#cfd8dc', edge: '#90a4ae', light: '#eceff1' }, // white
];

const ACTION_TEXT = {
    check: 'Check',
    call:  'Call',
    bet:   'Bet',
    raise: 'Raise',
    fold:  'Fold',
    allin: 'All In',
};

// Display label for an action type, including n-bet types like "3bet".
function actionText(type) {
    const m = /^(\d+)bet$/.exec(type);
    if (m) return m[1] + '-Bet';
    return ACTION_TEXT[type] || type;
}

// Standard poker bet-counting: pre-flop the blinds are the 1st "bet" so the
// open is a raise (2-bet) and the first re-raise is a 3-bet; post-flop the
// first wager is a bet, its raise is a raise (2-bet), the re-raise a 3-bet,
// etc. Returns a label per action: check/call/fold/bet/raise/3bet/4bet/...
function _betLabel(level) {
    if (level <= 1) return 'bet';     // post-flop opening bet
    if (level === 2) return 'raise';  // the open / first raise
    return level + 'bet';             // 3bet, 4bet, 5bet, ...
}
function classifyBetLevels(actions, isPreflop) {
    let level = isPreflop ? 1 : 0;    // pre-flop: the big blind is the 1st bet
    return actions.map(a => {
        const low = a.toLowerCase();
        if (low.includes('fold')) return 'fold';
        if (low.includes('raise')) { level += 1; return _betLabel(level); } // incl. check-raise
        if (low.includes('call')) return 'call';
        if (low.includes('bet') || /\$\s*\d/.test(a)) { level += 1; return _betLabel(level); }
        return 'check';
    });
}

// Break an amount into denomination counts (greedy, largest first). The amount
// is first converted to whole big blinds, so chip piles are sized relative to
// the blinds rather than the raw dollar figure.
function makeChange(amount) {
    let rem = Math.round(amount / _bigBlind);
    const out = [];
    for (const d of BB_DENOMS) {
        if (rem >= d.v) {
            const count = Math.floor(rem / d.v);
            rem -= count * d.v;
            out.push({ d, count });
        }
    }
    // Sub-1BB but non-zero (e.g. a posted small blind) still shows one chip.
    if (out.length === 0 && amount > 0) {
        out.push({ d: BB_DENOMS[BB_DENOMS.length - 1], count: 1 });
    }
    return out;
}

// Build one single-color stack (chips overlapping vertically). Tighter overlap
// + a higher cap lets the stack height read as the chip "weight".
function buildStack(d, count, size) {
    const dim  = size === 'sm' ? 22 : 30;
    const step = 4;
    const n = Math.min(count, 8);

    const stack = document.createElement('div');
    stack.className = 'chip-stack';
    stack.style.width  = dim + 'px';
    stack.style.height = (dim + (n - 1) * step) + 'px';

    for (let i = 0; i < n; i++) {
        const disc = document.createElement('div');
        disc.className = 'chip-disc chip-' + size;
        disc.style.bottom = (i * step) + 'px';
        disc.style.background = `radial-gradient(circle at 35% 30%, ${d.light}, ${d.face})`;
        disc.style.borderColor = d.edge;
        stack.appendChild(disc);
    }
    return stack;
}

/**
 * Renders a chip pile (denomination stacks + optional $ label) into `el`.
 */
function renderChips(el, amount, { size = 'lg', showLabel = true, maxDenoms = Infinity } = {}) {
    el.innerHTML = '';
    if (!amount || amount <= 0) return;

    let change = makeChange(amount);
    if (change.length > maxDenoms) change = change.slice(0, maxDenoms);

    const wrap = document.createElement('div');
    wrap.className = 'chip-wrap';

    const pile = document.createElement('div');
    pile.className = 'chip-pile';
    change.forEach(({ d, count }) => pile.appendChild(buildStack(d, count, size)));
    wrap.appendChild(pile);

    if (showLabel) {
        const lbl = document.createElement('div');
        lbl.className = 'chip-label';
        lbl.textContent = formatCurrency(amount);
        wrap.appendChild(lbl);
    }

    el.appendChild(wrap);
}

// One tasteful chip color per context — the exact value lives in the bubble,
// so chips just convey "whose chips" + relative weight (stack height).
const CHIP_COLORS = {
    pot:   { face: '#d99a2b', edge: '#9c6b14', light: '#ffce73' }, // amber/gold
    bet:   { face: '#3f7fd0', edge: '#244f8a', light: '#7db0f0' }, // blue
    stack: { face: '#3a9182', edge: '#205a4f', light: '#74c4b4' }, // teal
};

// How many discs to show for an amount — grows smoothly (log) with big-blind
// depth so a bigger pot/bet reads as a taller stack without exploding.
function _cleanStackCount(amount) {
    const bb = Math.max(1, amount / _bigBlind);
    return Math.max(2, Math.min(8, Math.round(1 + 2.5 * Math.log10(bb + 1))));
}

// A single neat single-color stack whose HEIGHT reflects the amount.
function renderCleanStack(el, amount, colorKey = 'pot', size = 'lg') {
    el.innerHTML = '';
    if (!amount || amount <= 0) return;

    const color = CHIP_COLORS[colorKey] || CHIP_COLORS.pot;
    const wrap = document.createElement('div');
    wrap.className = 'chip-wrap';
    const pile = document.createElement('div');
    pile.className = 'chip-pile';
    pile.appendChild(buildStack(color, _cleanStackCount(amount), size));
    wrap.appendChild(pile);
    el.appendChild(wrap);
}

// Pot uses the warm/gold clean stack.
function renderChipPile(el, amount) {
    renderCleanStack(el, amount, 'pot', 'lg');
}

// Player stack: a single teal clean stack; amount shows in the pill beside it.
function renderStackChip(el, amount) {
    renderCleanStack(el, amount, 'stack', 'sm');
}

/**
 * Parses action strings into chip events.
 * Returns [{actor, type, delta, amount}] where delta = newly committed chips.
 * `heroBetInit`/`villainBetInit` seed each player's already-committed amount —
 * used pre-flop so a "raise to $X" after posting a blind commits X minus the
 * blind already in front of that player.
 */
function parseStreetActions(actions, heroBetInit = 0, villainBetInit = 0) {
    let heroBet = heroBetInit, villainBet = villainBetInit;
    const isPreflop = heroBetInit > 0 || villainBetInit > 0; // blinds only pre-flop
    const labels = classifyBetLevels(actions, isPreflop);

    // Hands authored by the recorder prefix actions with the player's nickname
    // (e.g. "Brunson raises to $80") instead of "Hero"/"Villain". Use the
    // puzzle's nicks to attribute the action; fall back to the Hero/Villain
    // literals used by the older library.
    const p = (typeof currentPuzzle !== 'undefined') ? currentPuzzle : null;
    const heroNick = (p && p.heroNick || '').toLowerCase();
    const villNick = (p && p.villainNick || '').toLowerCase();

    return actions.map((action, i) => {
        const lower = action.toLowerCase();
        let isHero;
        if (lower.startsWith('villain')) isHero = false;
        else if (lower.startsWith('hero')) isHero = true;
        else if (villNick && lower.startsWith(villNick)) isHero = false;
        else if (heroNick && lower.startsWith(heroNick)) isHero = true;
        else isHero = true;
        const m = action.match(/\$([0-9,]+(?:\.[0-9]+)?)/);
        const amount = m ? parseFloat(m[1].replace(/,/g, '')) : 0;
        const allIn = /\ball[\s-]?in\b|shove|jam/.test(lower);

        // type = the n-bet label (check/call/fold/bet/raise/3bet/...). A
        // bet/raise/n-bet all commit "to" the absolute amount, so the chip math
        // is the same for all of them.
        let type = labels[i];
        let delta = 0;
        if (type === 'call') {
            delta = amount;
            if (isHero) heroBet += delta; else villainBet += delta;
        } else if (type !== 'check' && type !== 'fold') {
            if (isHero) { delta = amount - heroBet; heroBet = amount; }
            else        { delta = amount - villainBet; villainBet = amount; }
        }

        if (allIn) type = 'allin';

        return { actor: isHero ? 'hero' : 'villain', type, delta, amount };
    });
}

// Work out the forced blinds in front of each player for a given street.
// Only pre-flop carries posted blinds. Heads-up: the dealer (BTN/SB) posts the
// small blind, the other player posts the big blind. Reads the current puzzle's
// blind structure (filled in by the backend's normalize_puzzle).
function _blindInfo(streetData) {
    const street = (streetData && streetData.Street || '').toLowerCase();
    const isPreflop = street.includes('pre');
    const p = (typeof currentPuzzle !== 'undefined') ? currentPuzzle : null;
    if (!isPreflop || !p) {
        return { isPreflop: false, hero: 0, villain: 0 };
    }
    const sb = p.smallBlind || 0;
    const bb = p.bigBlind || 0;
    const heroIsSB = p.HeroPosition === 'SB' || p.HeroPosition === 'BTN';
    return {
        isPreflop: true,
        hero: heroIsSB ? sb : bb,
        villain: heroIsSB ? bb : sb,
        heroLabel: heroIsSB ? 'SB' : 'BB',
        villainLabel: heroIsSB ? 'BB' : 'SB',
    };
}

// A small money pill showing the committed amount next to a zone's chips.
function _amountPill(amount) {
    const pill = document.createElement('span');
    pill.className = 'bet-amount';
    pill.textContent = formatCurrency(amount);
    return pill;
}

// Render a posted-blind badge (SB/BB) + its chips + amount into a bet zone.
function _renderBlindZone(zone, label, total) {
    zone.innerHTML = '';
    const badge = document.createElement('div');
    badge.className = 'action-badge action-blind';
    badge.textContent = label;
    zone.appendChild(badge);
    if (total > 0) {
        const holder = document.createElement('div');
        renderCleanStack(holder, total, 'bet', 'lg');
        if (holder.firstChild) zone.appendChild(holder.firstChild);
        zone.appendChild(_amountPill(total));
    }
}

// Show/hide the Replay button — it should only appear once a street's action
// has finished animating.
function _setReplayVisible(visible) {
    const btn = document.getElementById('replay-animation-btn');
    if (btn) btn.classList.toggle('replay-ready', visible);
    // The "Show Next Street" button shares this lifecycle (hidden while
    // animating, shown once settled if the player has already guessed).
    if (typeof onAnimationSettled === 'function') onAnimationSettled(visible);
}

// Update the pot bubble to a given amount; hide it entirely when the pot is
// empty (no point showing "$0" before any chips arrive).
function setPotDisplay(amount) {
    const el = document.getElementById('pot-size');
    if (!el) return;
    if (!amount || amount <= 0) {
        el.style.visibility = 'hidden';
    } else {
        el.style.visibility = 'visible';
        el.textContent = formatCurrency(amount);
    }
}

// Clear a bet zone's chips/badge and any lingering animation classes/styles.
function _clearZone(zone) {
    zone.innerHTML = '';
    zone.classList.remove('chip-slide-down', 'chip-slide-up');
    zone.style.transition = '';
    zone.style.transform = '';
    zone.style.opacity = '';
}

// Slide a bet zone diagonally into the pot, wherever the pot currently sits
// (it may be left of / below the board). Measured at runtime so it's correct
// across desktop and mobile layouts. Returns when the motion finishes.
function _sweepZoneToPot(zone, potEl, ms) {
    return new Promise(resolve => {
        if (!zone || !potEl || !zone.firstChild) { resolve(); return; }

        // Drop any slide-in animation so our inline transform takes effect.
        zone.classList.remove('chip-slide-down', 'chip-slide-up');
        zone.style.transition = 'none';
        zone.style.transform = 'translate(0, 0)';
        void zone.offsetWidth; // reflow at natural position before measuring

        const zr = zone.getBoundingClientRect();
        const pr = potEl.getBoundingClientRect();
        const dx = (pr.left + pr.width / 2) - (zr.left + zr.width / 2);
        const dy = (pr.top + pr.height / 2) - (zr.top + zr.height / 2);

        zone.style.transition = `transform ${ms}ms ease-in, opacity ${ms}ms ease-in`;
        zone.style.transform = `translate(${dx}px, ${dy}px) scale(0.4)`;
        zone.style.opacity = '0';
        setTimeout(resolve, ms);
    });
}

// Render an action badge (+ chips for the committed total) into a bet zone.
function _renderZone(zone, ev, total) {
    zone.innerHTML = '';

    const badge = document.createElement('div');
    // n-bet types (3bet/4bet) reuse the raise styling.
    const styleType = /^\d+bet$/.test(ev.type) ? 'raise' : ev.type;
    badge.className = 'action-badge action-' + styleType;
    if (ev.type === 'allin') {
        const tri = document.createElement('span');
        tri.className = 'allin-tri';
        badge.appendChild(tri);
        badge.appendChild(document.createTextNode(ACTION_TEXT.allin));
    } else {
        badge.textContent = actionText(ev.type);
    }
    zone.appendChild(badge);

    if (total > 0) {
        const holder = document.createElement('div');
        renderCleanStack(holder, total, 'bet', 'lg');
        if (holder.firstChild) zone.appendChild(holder.firstChild);
        zone.appendChild(_amountPill(total));
    }
}

// Update a player's stack pill + chips during the animation. Skips unknown
// stacks (0 = unknown) so we never show a bogus/negative count for them.
function _setOneStack(pillId, chipsId, amount, known) {
    if (!known) return;
    const v = Math.max(0, Math.round(amount * 100) / 100);
    const pill = document.getElementById(pillId);
    const chips = document.getElementById(chipsId);
    if (pill) pill.textContent = formatCurrency(v);
    if (chips) renderStackChip(chips, v);
}
function _setStacks(heroAmt, villAmt, heroKnown, villKnown) {
    _setOneStack('hero-stack', 'hero-stack-chips', heroAmt, heroKnown);
    _setOneStack('villain-stack', 'villain-stack-chips', villAmt, villKnown);
}

/**
 * Plays all chip animations for a street sequentially.
 * Newer calls automatically cancel in-flight animations via _animGen.
 */
async function animateStreetActions(streetData) {
    const gen = ++_animGen;
    const alive = () => gen === _animGen;
    const pause = ms => new Promise(r => setTimeout(r, ms));
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const villainZone = document.getElementById('villain-bet-zone');
    const heroZone    = document.getElementById('hero-bet-zone');
    const potChips    = document.getElementById('pot-chips');
    if (!villainZone || !heroZone) return;

    _clearZone(villainZone);
    _clearZone(heroZone);
    _setReplayVisible(false); // hide replay while the action animates

    // Pre-street pot + stacks (where things stood BEFORE this street's action),
    // so the chips build up and the stacks count down — and a replay starts
    // from the same place rather than the finished values.
    const _p = (typeof currentPuzzle !== 'undefined') ? currentPuzzle : null;
    const _hist = _p ? _p.ActionHistory : null;
    const _idx = _hist ? _hist.indexOf(streetData) : -1;
    const startPot = _idx > 0 ? _hist[_idx - 1].PotEnd : 0;
    const preHero = _idx > 0 ? _hist[_idx - 1].HeroStack : (_p ? _p.heroStartingStackBBs : 0);
    const preVill = _idx > 0 ? _hist[_idx - 1].VillainStack : (_p ? _p.villainStartingStackBBs : 0);
    const heroKnown = !!(_p && _p.heroStartingStackBBs > 0);
    const villKnown = !!(_p && _p.villainStartingStackBBs > 0);

    if (!prefersReduced) {
        if (potChips) { renderChipPile(potChips, startPot); setPotDisplay(startPot); }
        _setStacks(preHero, preVill, heroKnown, villKnown); // full stacks, pre-blinds
    }

    // Pre-flop carries posted blinds; seed each player's committed total with
    // them so raise deltas and the running pot reconcile.
    const blinds = _blindInfo(streetData);
    const parsed = parseStreetActions(streetData.Actions, blinds.hero, blinds.villain);
    let vShown = blinds.villain, hShown = blinds.hero;

    if (prefersReduced) {
        // Place blinds + final committed totals statically, then the pot.
        if (blinds.villain > 0) _renderBlindZone(villainZone, blinds.villainLabel, blinds.villain);
        if (blinds.hero > 0)    _renderBlindZone(heroZone, blinds.heroLabel, blinds.hero);
        const lastV = [...parsed].reverse().find(e => e.actor === 'villain');
        const lastH = [...parsed].reverse().find(e => e.actor === 'hero');
        parsed.forEach(ev => {
            if (ev.actor === 'villain') vShown += ev.delta; else hShown += ev.delta;
        });
        if (lastV) _renderZone(villainZone, lastV, vShown);
        if (lastH) _renderZone(heroZone, lastH, hShown);
        if (potChips) renderChipPile(potChips, streetData.PotEnd);
        setPotDisplay(streetData.PotEnd);
        _setReplayVisible(true);
        return;
    }

    // Let the board reveal settle first
    await pause(450);
    if (!alive()) return;

    // Post the blinds before any voluntary action, so the pot builds from them.
    if (blinds.villain > 0) {
        villainZone.classList.remove('chip-slide-down');
        void villainZone.offsetWidth;
        _renderBlindZone(villainZone, blinds.villainLabel, blinds.villain);
        villainZone.classList.add('chip-slide-down');
    }
    if (blinds.hero > 0) {
        heroZone.classList.remove('chip-slide-up');
        void heroZone.offsetWidth;
        _renderBlindZone(heroZone, blinds.heroLabel, blinds.hero);
        heroZone.classList.add('chip-slide-up');
    }
    if (blinds.villain > 0 || blinds.hero > 0) {
        _setStacks(preHero - hShown, preVill - vShown, heroKnown, villKnown); // minus blinds
        await pause(900);
        if (!alive()) return;
    }

    for (const ev of parsed) {
        if (!alive()) return;

        // Hold between actions so each play is readable
        await pause(1100);
        if (!alive()) return;

        const zone = ev.actor === 'hero' ? heroZone : villainZone;
        if (ev.delta > 0) {
            if (ev.actor === 'hero') hShown += ev.delta; else vShown += ev.delta;
        }
        const total = ev.actor === 'hero' ? hShown : vShown;

        // Count this player's stack down as their chips go into the bet zone.
        _setStacks(preHero - hShown, preVill - vShown, heroKnown, villKnown);

        const slideClass = ev.actor === 'villain' ? 'chip-slide-down' : 'chip-slide-up';
        zone.classList.remove('chip-slide-down', 'chip-slide-up');
        void zone.offsetWidth; // restart animation
        _renderZone(zone, ev, total);
        zone.classList.add(slideClass);

        // Stack text dims briefly to show chips leaving
        const stackEl = document.getElementById(ev.actor === 'hero' ? 'hero-stack' : 'villain-stack');
        if (stackEl) {
            stackEl.classList.remove('stack-pulse');
            void stackEl.offsetWidth;
            stackEl.classList.add('stack-pulse');
            setTimeout(() => stackEl.classList.remove('stack-pulse'), 700);
        }
    }

    if (!alive()) return;
    await pause(1000);
    if (!alive()) return;

    if (vShown > 0 || hShown > 0) {
        // Chips fly diagonally to wherever the pot is (left of / below board).
        const potTarget = potChips || document.getElementById('pot-area');
        await Promise.all([
            _sweepZoneToPot(villainZone, potTarget, 650),
            _sweepZoneToPot(heroZone, potTarget, 650),
        ]);
        if (!alive()) return;

        _clearZone(villainZone);
        _clearZone(heroZone);

        // Pot chips + bubble pop in at the new total
        setPotDisplay(streetData.PotEnd);
        if (potChips) {
            potChips.innerHTML = '';
            renderChipPile(potChips, streetData.PotEnd);
            potChips.classList.remove('chip-pop');
            void potChips.offsetWidth;
            potChips.classList.add('chip-pop');
            setTimeout(() => potChips.classList.remove('chip-pop'), 700);
        }
    } else {
        // Both checked — let the badges linger, then clear
        await pause(500);
        if (!alive()) return;
        _clearZone(villainZone);
        _clearZone(heroZone);
    }

    // Land on the exact end-of-street stacks.
    _setStacks(streetData.HeroStack, streetData.VillainStack, heroKnown, villKnown);
    if (alive()) _setReplayVisible(true); // action settled — allow replay
}

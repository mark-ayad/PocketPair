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

// Build one single-denomination stack (chips overlapping vertically).
function buildStack(d, count, size) {
    const dim  = size === 'sm' ? 22 : 30;
    const step = size === 'sm' ? 5  : 6;
    const n = Math.min(count, 6);

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

// Back-compat wrappers used by script.js
function renderChipPile(el, amount, showLabel = true) {
    renderChips(el, amount, { size: 'lg', showLabel });
}

// Pick a single chip color for a player stack based on its depth in big blinds,
// so the tier is comparable across games of any stakes.
function _stackTier(bb) {
    if (bb < 25)   return { face: '#2e7d32', edge: '#1b5e20', light: '#66bb6a' }; // green
    if (bb < 75)   return { face: '#37474f', edge: '#0d1b22', light: '#78909c' }; // charcoal
    if (bb < 150)  return { face: '#8e24aa', edge: '#4a148c', light: '#ce93d8' }; // purple
    if (bb < 300)  return { face: '#f9a825', edge: '#e65100', light: '#ffd54f' }; // gold
    return { face: '#ef6c00', edge: '#bf360c', light: '#ffa726' };                // orange
}

// Player stack: one tidy vertical pile in a single tier color. Taller = deeper
// stack (in BB). The exact amount still shows in the "Stack: $X" text above it.
function renderStackChip(el, amount) {
    el.innerHTML = '';
    if (!amount || amount <= 0) return;

    const bb = amount / _bigBlind;
    const tier = _stackTier(bb);
    const count = Math.max(2, Math.min(6, Math.round(1 + bb / 50)));

    const wrap = document.createElement('div');
    wrap.className = 'chip-wrap';
    const pile = document.createElement('div');
    pile.className = 'chip-pile';
    pile.appendChild(buildStack(tier, count, 'sm'));
    wrap.appendChild(pile);
    el.appendChild(wrap);
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

    return actions.map(action => {
        const lower = action.toLowerCase();
        const isHero = lower.startsWith('hero');
        const m = action.match(/\$([0-9,]+(?:\.[0-9]+)?)/);
        const amount = m ? parseFloat(m[1].replace(/,/g, '')) : 0;
        const allIn = /\ball[\s-]?in\b|shove|jam/.test(lower);

        let type = 'check';
        let delta = 0;

        if (lower.includes('fold')) {
            type = 'fold';
        } else if (lower.includes('check')) {
            type = 'check';
        } else if (lower.includes('call')) {
            type = 'call';
            delta = amount;
            if (isHero) heroBet += delta; else villainBet += delta;
        } else if (lower.includes('raise')) {
            type = 'raise';
            if (isHero) { delta = amount - heroBet; heroBet = amount; }
            else        { delta = amount - villainBet; villainBet = amount; }
        } else if (lower.includes('bet') || amount > 0) {
            type = 'bet';
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

// Render a posted-blind badge (SB/BB) + its chips into a bet zone.
function _renderBlindZone(zone, label, total) {
    zone.innerHTML = '';
    const badge = document.createElement('div');
    badge.className = 'action-badge action-blind';
    badge.textContent = label;
    zone.appendChild(badge);
    if (total > 0) {
        const holder = document.createElement('div');
        renderChipPile(holder, total, false);
        if (holder.firstChild) zone.appendChild(holder.firstChild);
    }
}

// Clear a bet zone's chips/badge and any lingering animation classes.
function _clearZone(zone) {
    zone.innerHTML = '';
    zone.classList.remove('chip-slide-down', 'chip-slide-up', 'chip-sweep-up', 'chip-sweep-down');
}

// Render an action badge (+ chips for the committed total) into a bet zone.
function _renderZone(zone, ev, total) {
    zone.innerHTML = '';

    const badge = document.createElement('div');
    badge.className = 'action-badge action-' + ev.type;
    if (ev.type === 'allin') {
        const tri = document.createElement('span');
        tri.className = 'allin-tri';
        badge.appendChild(tri);
        badge.appendChild(document.createTextNode(ACTION_TEXT.allin));
    } else {
        badge.textContent = ACTION_TEXT[ev.type] || ev.type;
    }
    zone.appendChild(badge);

    if (total > 0) {
        const holder = document.createElement('div');
        renderChipPile(holder, total, false); // amount already shown in the timeline
        if (holder.firstChild) zone.appendChild(holder.firstChild);
    }
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
        if (potChips) renderChipPile(potChips, streetData.PotEnd, false);
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
        villainZone.classList.add('chip-sweep-up');
        heroZone.classList.add('chip-sweep-down');

        await pause(650);
        if (!alive()) return;

        _clearZone(villainZone);
        _clearZone(heroZone);

        // Pot chips pop in at the new total
        if (potChips) {
            potChips.innerHTML = '';
            renderChipPile(potChips, streetData.PotEnd, false);
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
}

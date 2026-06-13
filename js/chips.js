// js/chips.js — chip visuals (denominations) and per-action street animations

let _animGen = 0;

// Standard casino denominations, high → low. Greedy change-making maps any
// amount onto stacks of these so a pile reads like real chips on a table.
const DENOMS = [
    { v: 5000, face: '#ef6c00', edge: '#bf360c', light: '#ffa726' },
    { v: 1000, face: '#f9a825', edge: '#e65100', light: '#ffd54f' },
    { v: 500,  face: '#8e24aa', edge: '#4a148c', light: '#ce93d8' },
    { v: 100,  face: '#37474f', edge: '#0d1b22', light: '#78909c' },
    { v: 25,   face: '#2e7d32', edge: '#1b5e20', light: '#66bb6a' },
    { v: 5,    face: '#c62828', edge: '#8e0000', light: '#ef5350' },
    { v: 1,    face: '#cfd8dc', edge: '#90a4ae', light: '#eceff1' },
];

const ACTION_TEXT = {
    check: 'Check',
    call:  'Call',
    bet:   'Bet',
    raise: 'Raise',
    fold:  'Fold',
    allin: 'All In',
};

// Break an amount into denomination counts (greedy, largest first).
function makeChange(amount) {
    let rem = Math.round(amount);
    const out = [];
    for (const d of DENOMS) {
        if (rem >= d.v) {
            const count = Math.floor(rem / d.v);
            rem -= count * d.v;
            out.push({ d, count });
        }
    }
    return out;
}

// Build one single-denomination stack (chips overlapping vertically).
function buildStack(d, count, size) {
    const dim  = size === 'sm' ? 22 : 30;
    const step = size === 'sm' ? 5  : 6;
    const n = Math.min(count, 5);

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

// Pick a single chip color for a player stack based on its magnitude.
function _stackTier(amount) {
    if (amount < 1000)   return { face: '#2e7d32', edge: '#1b5e20', light: '#66bb6a' }; // green
    if (amount < 3000)   return { face: '#37474f', edge: '#0d1b22', light: '#78909c' }; // charcoal
    if (amount < 10000)  return { face: '#8e24aa', edge: '#4a148c', light: '#ce93d8' }; // purple
    if (amount < 30000)  return { face: '#f9a825', edge: '#e65100', light: '#ffd54f' }; // gold
    return { face: '#ef6c00', edge: '#bf360c', light: '#ffa726' };                       // orange
}

// Player stack: one tidy vertical pile in a single tier color. Taller = more
// chips. The exact amount still shows in the "Stack: $X" text above it.
function renderStackChip(el, amount) {
    el.innerHTML = '';
    if (!amount || amount <= 0) return;

    const tier = _stackTier(amount);
    const count = Math.max(3, Math.min(5, Math.round(2 + amount / 3000)));

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
 */
function parseStreetActions(actions) {
    let heroBet = 0, villainBet = 0;

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

    const parsed = parseStreetActions(streetData.Actions);
    let vShown = 0, hShown = 0;

    if (prefersReduced) {
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

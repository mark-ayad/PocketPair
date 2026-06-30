// js/builder.js — guided heads-up hand recorder for PocketPair.
// The hand is stored as an ordered list of EVENTS (actions + board deals).
// Everything else (action strings, pot, stacks, current prompt) is DERIVED by
// replaying those events through simulate(), so editing setup or undoing is
// just "change inputs / drop an event, then re-simulate".

const SUITS = [['s', '♠', 'black'], ['h', '♥', 'red'], ['d', '♦', 'red'], ['c', '♣', 'black']];
const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const STREETS = ['Pre-Flop', 'Flop', 'Turn', 'River'];
const BOARD_COUNT = [0, 3, 4, 5];

function $(id) { return document.getElementById(id); }
function fmt(n) { return Number.isInteger(n) ? String(n) : (+n).toFixed(2); }
function round2(n) { return Math.round(n * 100) / 100; }
function other(role) { return role === 'SB' ? 'BB' : 'SB'; }

function renderCardFace(code) {
    const rank = code.slice(0, -1);
    const s = SUITS.find(x => x[0] === code.slice(-1));
    return `<span class="card card-suit-${s ? s[2] : ''}">` +
        `<div class="card-rank-display">${rank}</div>` +
        `<div class="card-symbol-display">${s ? s[1] : ''}</div></span>`;
}

// ---------- recorder state ----------
let setup = null;     // {sbBlind,bbBlind,ante, guess, title,video,context, sb:{name,nick,stack,cards}, bb:{...}}
let events = [];      // [{type:'action', actor, act, amount} | {type:'board', cards:[...]}]
let holeSlots = {};   // setup-screen hole cards: slotId -> code
let sim = null;       // latest simulate() result
let pickTarget = null;

// ==================================================================
//  SIMULATION  (pure: setup + events -> full derived state)
// ==================================================================
function simulate(setup, events) {
    const heroRole = setup.guess === 'SB' ? 'BB' : 'SB';
    const S = {
        streets: [], board: [], totalSB: 0, totalBB: 0,
        engine: null, phase: null, pendingStreet: 0, handOver: false,
    };
    const stackOf = r => (r === 'SB' ? setup.sb.stack : setup.bb.stack);
    const nickOf = r => (r === 'SB' ? setup.sb.nick : setup.bb.nick);

    function behind(role) {
        const prev = role === 'SB' ? S.totalSB : S.totalBB;
        const now = S.engine ? (role === 'SB' ? S.engine.sbContrib : S.engine.bbContrib) : 0;
        return stackOf(role) - prev - now;
    }
    function startStreet(idx) {
        const pre = idx === 0;
        S.engine = {
            idx, pre,
            sbContrib: pre ? setup.sbBlind + setup.ante : 0,
            bbContrib: pre ? setup.bbBlind + setup.ante : 0,
            currentBet: pre ? setup.bbBlind + setup.ante : 0,
            toAct: pre ? 'SB' : 'BB',
            voluntary: false, oneChecked: false, actions: [], over: false, handOver: false,
        };
        S.phase = 'action';
        // All-in run-out — only when stacks are known (>0).
        const sbAllIn = stackOf('SB') > 0 && behind('SB') <= 0;
        const bbAllIn = stackOf('BB') > 0 && behind('BB') <= 0;
        if (!pre && (sbAllIn || bbAllIn)) S.engine.over = true;
        if (S.engine.over) finalizeStreet();
    }
    function applyAction(actor, type, amount, allIn) {
        const e = S.engine;
        let verb = '';
        if (type === 'fold') { verb = 'folds'; e.handOver = true; }
        else if (type === 'check') { verb = 'checks'; }
        else if (type === 'call') {
            const toCall = round2(e.currentBet - (actor === 'SB' ? e.sbContrib : e.bbContrib));
            if (actor === 'SB') e.sbContrib += toCall; else e.bbContrib += toCall;
            verb = 'calls $' + fmt(toCall);
        } else if (type === 'bet') {
            if (actor === 'SB') e.sbContrib += amount; else e.bbContrib += amount;
            e.currentBet = (actor === 'SB' ? e.sbContrib : e.bbContrib);
            e.voluntary = true; verb = 'bets $' + fmt(amount);
        } else if (type === 'raise') {
            if (actor === 'SB') e.sbContrib = amount; else e.bbContrib = amount;
            e.currentBet = amount; e.voluntary = true; verb = 'raises to $' + fmt(amount);
        }
        let str = `${nickOf(actor)} ${verb}`;
        // All-in if explicitly flagged, or auto-detected when the stack is known.
        const autoAllIn = stackOf(actor) > 0 && behind(actor) <= 0;
        if (type !== 'fold' && type !== 'check' && (allIn || autoAllIn)) str += ' (all-in)';
        e.actions.push(str);

        if (e.handOver) e.over = true;
        else if (type === 'check') {
            if (e.pre) e.over = true;
            else if (e.oneChecked) e.over = true;
            else { e.oneChecked = true; e.toAct = other(actor); }
        } else if (type === 'call') {
            if (e.voluntary) e.over = true; else e.toAct = 'BB';
        } else { e.toAct = other(actor); e.oneChecked = false; }

        if (e.over) finalizeStreet();
    }
    function finalizeStreet() {
        const e = S.engine;
        S.totalSB += e.sbContrib; S.totalBB += e.bbContrib;
        const heroTotal = heroRole === 'SB' ? S.totalSB : S.totalBB;
        const villTotal = heroRole === 'SB' ? S.totalBB : S.totalSB;
        // Unknown starting stack (0) -> record 0 (unknown), not a negative.
        const heroStart = stackOf(heroRole);
        const villStart = stackOf(other(heroRole));
        S.streets.push({
            Street: STREETS[e.idx],
            Actions: e.actions.slice(),
            PotEnd: round2(S.totalSB + S.totalBB),
            HeroStack: heroStart > 0 ? round2(heroStart - heroTotal) : 0,
            VillainStack: villStart > 0 ? round2(villStart - villTotal) : 0,
            CardsShown: S.board.slice(0, BOARD_COUNT[e.idx]),
        });
        if (e.handOver || e.idx === 3) { S.phase = 'review'; S.handOver = e.handOver; S.engine = null; }
        else { S.pendingStreet = e.idx + 1; S.phase = 'board'; }
    }

    startStreet(0);
    for (const ev of events) {
        if (S.phase === 'action' && S.engine && ev.type === 'action') applyAction(ev.actor, ev.act, ev.amount, ev.allIn);
        else if (S.phase === 'board' && ev.type === 'board') { S.board = S.board.concat(ev.cards); startStreet(S.pendingStreet); }
        else break;
    }
    S.behind = behind; S.nickOf = nickOf; S.stackOf = stackOf;
    return S;
}

function usedCards() {
    const u = [setup.sb.cards[0], setup.sb.cards[1], setup.bb.cards[0], setup.bb.cards[1]];
    (sim ? sim.board : []).forEach(c => u.push(c));
    return u.filter(Boolean);
}

// ==================================================================
//  CARD PICKER  (grid + type-to-pick)
// ==================================================================
function normalizeTyped(s) {
    s = s.trim().toLowerCase().replace(/10/, 't');
    if (s.length < 2) return null;
    const rank = s[0].toUpperCase();
    const suit = s[1];
    if (!RANKS.includes(rank) || !'cdhs'.includes(suit)) return null;
    return rank + suit;
}
function openPicker(title, blocked, onPick) {
    pickTarget = onPick;
    $('card-picker-title').textContent = title;
    const input = $('card-picker-input');
    input.value = '';
    const grid = $('card-picker-grid');
    grid.innerHTML = '';
    SUITS.forEach(([su]) => RANKS.forEach(r => {
        const code = r + su;
        const btn = document.createElement('button');
        btn.className = 'cp-card';
        btn.dataset.code = code;
        btn.innerHTML = renderCardFace(code);
        if (blocked.includes(code)) { btn.classList.add('used'); btn.disabled = true; }
        btn.addEventListener('click', () => choosePicked(code, blocked));
        grid.appendChild(btn);
    }));
    $('card-picker').classList.remove('hidden');
    setTimeout(() => input.focus(), 30);
}
function choosePicked(code, blocked) {
    if (!code || blocked.includes(code)) return;
    $('card-picker').classList.add('hidden');
    const cb = pickTarget; pickTarget = null;
    if (cb) cb(code);
}
function closePicker() { $('card-picker').classList.add('hidden'); pickTarget = null; }

// ==================================================================
//  SETUP
// ==================================================================
function lastWord(s) { const p = s.trim().split(/\s+/); return p[p.length - 1] || s.trim(); }

function readSetup() {
    const sb = {
        name: $('sb-name').value.trim() || 'Small Blind',
        nick: $('sb-nick').value.trim(),
        stack: parseFloat($('sb-stack').value) || 0,   // 0 = unknown
        cards: [holeSlots['sb-c1'], holeSlots['sb-c2']],
    };
    const bb = {
        name: $('bb-name').value.trim() || 'Big Blind',
        nick: $('bb-nick').value.trim(),
        stack: parseFloat($('bb-stack').value) || 0,   // 0 = unknown
        cards: [holeSlots['bb-c1'], holeSlots['bb-c2']],
    };
    sb.nick = sb.nick || lastWord(sb.name);
    bb.nick = bb.nick || lastWord(bb.name);
    return {
        title: $('f-title').value.trim(),
        video: $('f-video').value.trim(),
        context: $('f-context').value.trim(),
        sbBlind: parseFloat($('f-sb').value),
        bbBlind: parseFloat($('f-bb').value),
        ante: parseFloat($('f-ante').value) || 0,
        guess: document.querySelector('input[name="guess"]:checked').value,
        sb, bb,
    };
}
function fillSetup(s) {
    $('f-title').value = s.title; $('f-video').value = s.video; $('f-context').value = s.context;
    $('f-sb').value = s.sbBlind; $('f-bb').value = s.bbBlind; $('f-ante').value = s.ante;
    $('sb-name').value = s.sb.name === 'Small Blind' ? '' : s.sb.name;
    $('bb-name').value = s.bb.name === 'Big Blind' ? '' : s.bb.name;
    $('sb-nick').value = s.sb.nick; $('bb-nick').value = s.bb.nick;
    $('sb-stack').value = s.sb.stack; $('bb-stack').value = s.bb.stack;
    document.querySelector(`input[name="guess"][value="${s.guess}"]`).checked = true;
    holeSlots = { 'sb-c1': s.sb.cards[0], 'sb-c2': s.sb.cards[1], 'bb-c1': s.bb.cards[0], 'bb-c2': s.bb.cards[1] };
    document.querySelectorAll('.card-pick').forEach(b => {
        const c = holeSlots[b.dataset.slot];
        if (c) { b.innerHTML = renderCardFace(c); b.classList.add('filled'); }
        else { b.innerHTML = '+'; b.classList.remove('filled'); }
    });
}
function validateSetup(s) {
    const need = [];
    if (!s.title) need.push('a hand title');
    if (!(s.sbBlind > 0) || !(s.bbBlind > 0)) need.push('valid blinds');
    // Stacks are optional (0 = unknown).
    const hole = [...s.sb.cards, ...s.bb.cards];
    if (hole.some(c => !c)) need.push('all four hole cards');
    else if (new Set(hole).size !== 4) need.push('four DISTINCT hole cards');
    return need;
}

function goToSetup(editing) {
    $('action-screen').classList.add('hidden');
    $('review-screen').classList.add('hidden');
    $('setup-screen').classList.remove('hidden');
    $('setup-heading').textContent = editing ? 'Edit setup' : 'Hand setup';
    $('start-btn').textContent = editing ? 'Update & continue →' : 'Start recording →';
}

function startRecording() {
    const s = readSetup();
    const need = validateSetup(s);
    if (need.length) { $('setup-error').textContent = 'Please enter ' + need.join(', ') + '.'; return; }
    $('setup-error').textContent = '';
    setup = s;
    // events persist across an edit; if the betting line is now impossible the
    // review step will flag negative stacks.
    rerun();
    $('setup-screen').classList.add('hidden');
    render();
}

// ==================================================================
//  DRIVING THE HAND
// ==================================================================
function rerun() { sim = simulate(setup, events); }

function doAction(act, amount, allIn) {
    if (!sim.engine) return;
    events.push({ type: 'action', actor: sim.engine.toAct, act, amount, allIn: !!allIn });
    rerun(); render();
}
function dealBoard(cards) {
    events.push({ type: 'board', cards });
    rerun(); render();
}
function undo() {
    if (!events.length) { goToSetup(true); return; }
    events.pop(); rerun();
    if (sim.phase === 'review') { render(); } else { $('review-screen').classList.add('hidden'); $('action-screen').classList.remove('hidden'); render(); }
}

// ==================================================================
//  RENDER
// ==================================================================
function render() {
    if (sim.phase === 'review') { renderReview(); return; }
    $('review-screen').classList.add('hidden');
    $('action-screen').classList.remove('hidden');

    const curStreet = sim.engine ? sim.engine.idx : sim.pendingStreet;
    $('street-steps').innerHTML = STREETS.map((n, i) =>
        `<span class="step ${i === curStreet ? 'active' : (i < curStreet ? 'done' : '')}">${n}</span>`).join('');
    $('cur-pot').textContent = '$' + fmt(livePot());
    renderBoard(); renderLog();
    if (sim.phase === 'board') renderBoardEntry(); else renderPrompt();
}
function livePot() {
    const live = sim.engine ? sim.engine.sbContrib + sim.engine.bbContrib : 0;
    return round2(sim.totalSB + sim.totalBB + live);
}
function renderBoard() {
    $('board-display').innerHTML = sim.board.length
        ? sim.board.map(renderCardFace).join('')
        : '<span class="board-empty">No board yet</span>';
}
function renderLog() {
    let html = '';
    const all = sim.streets.slice();
    if (sim.engine && sim.engine.actions.length) {
        all.push({ Street: STREETS[sim.engine.idx], Actions: sim.engine.actions, current: true });
    }
    all.forEach(s => {
        if (!s.Actions.length) return;
        html += `<div class="log-street${s.current ? ' current' : ''}"><span class="log-street-name">${s.Street}</span>` +
            s.Actions.map(a => `<span class="log-action">${a}</span>`).join('') + '</div>';
    });
    $('action-log').innerHTML = html || '<span class="board-empty">Actions will appear here</span>';
}

function renderPrompt() {
    const zone = $('prompt-zone');
    const e = sim.engine;
    if (!e) { zone.innerHTML = ''; return; }
    const actor = e.toAct;
    const my = actor === 'SB' ? e.sbContrib : e.bbContrib;
    const facing = e.currentBet > my + 1e-9;
    const toCall = round2(e.currentBet - my);
    // Cap by the all-in street total only when the stack is known (>0).
    const maxTotal = sim.stackOf(actor) > 0
        ? round2(sim.stackOf(actor) - (actor === 'SB' ? sim.totalSB : sim.totalBB))
        : Infinity;

    let bubbles = '';
    if (facing) {
        bubbles += `<button class="bubble fold" data-act="fold">Fold</button>`;
        bubbles += `<button class="bubble call" data-act="call">Call $${fmt(toCall)}</button>`;
        bubbles += `<label class="allin-check"><input type="checkbox" id="call-allin"> all-in</label>`;
        bubbles += `<button class="bubble raise" data-act="open-raise">Raise…</button>`;
    } else {
        bubbles += `<button class="bubble" data-act="check">Check</button>`;
        bubbles += e.currentBet > 0
            ? `<button class="bubble raise" data-act="open-raise">Raise…</button>`
            : `<button class="bubble bet" data-act="open-bet">Bet…</button>`;
    }
    const facingTxt = facing ? `facing $${fmt(toCall)} to call` : (e.currentBet > 0 ? 'option to check or raise' : 'first to act');
    zone.innerHTML =
        `<p class="prompt-who"><strong>${sim.nickOf(actor)}</strong> <span class="pos-tag">${actor}</span> — ${facingTxt}</p>` +
        `<div class="bubbles">${bubbles}</div>` +
        `<div id="amount-panel" class="amount-panel hidden"></div>`;

    zone.querySelectorAll('.bubble').forEach(b => b.addEventListener('click', () => {
        const a = b.dataset.act;
        if (a === 'check' || a === 'fold') doAction(a);
        else if (a === 'call') doAction('call', undefined, $('call-allin') && $('call-allin').checked);
        else if (a === 'open-bet') openAmount('bet', maxTotal, 0);
        else if (a === 'open-raise') openAmount('raise', maxTotal, e.currentBet);
    }));
}

// Amount entry with presets + Enter to confirm.
function openAmount(kind, maxTotal, currentBet) {
    const panel = $('amount-panel');
    const pot = livePot();
    const finite = Number.isFinite(maxTotal);       // false when the stack is unknown
    const label = kind === 'bet' ? 'Bet' : 'Raise to';
    // Presets: bets use pot fractions; raises offer a pot-sized raise. All-in
    // only appears when the stack is known.
    let presets = kind === 'bet'
        ? [['½ pot', round2(pot / 2)], ['¾ pot', round2(pot * 0.75)], ['Pot', round2(pot)]]
        : [['Pot', round2(currentBet + pot)]];
    if (finite) presets.push(['All-in', maxTotal]);
    presets = presets.filter(([, v]) => v > 0 && (!finite || v <= maxTotal));

    panel.classList.remove('hidden');
    panel.innerHTML =
        `<div class="amount-row"><label>${label} $</label>` +
        `<input id="amt-input" type="number" step="any" min="0"${finite ? ` max="${maxTotal}"` : ''} placeholder="amount"></div>` +
        `<div class="presets">${presets.map(([t, v]) => `<button class="preset" data-v="${v}">${t} ($${fmt(v)})</button>`).join('')}</div>` +
        `<label class="allin-check"><input type="checkbox" id="amt-allin"${finite ? '' : ''}> This is all-in</label>` +
        `<div class="amount-actions"><button id="amt-cancel" class="builder-btn ghost">Cancel</button>` +
        `<button id="amt-confirm" class="builder-btn primary">Confirm ${label.toLowerCase()}</button></div>` +
        `<p id="amt-error" class="builder-error"></p>`;

    const input = $('amt-input');
    setTimeout(() => input.focus(), 20);
    const confirm = () => {
        const v = round2(parseFloat(input.value));
        const err = $('amt-error');
        if (!(v > 0)) { err.textContent = 'Enter an amount.'; return; }
        if (finite && v > maxTotal + 0.001) { err.textContent = `Max is $${fmt(maxTotal)} (their stack).`; return; }
        if (kind === 'raise' && v <= currentBet) { err.textContent = `A raise must be more than $${fmt(currentBet)}.`; return; }
        doAction(kind, v, $('amt-allin') && $('amt-allin').checked);
    };
    // Clicking the All-in preset also ticks the all-in box.
    panel.querySelectorAll('.preset').forEach(p => p.addEventListener('click', () => {
        input.value = p.dataset.v;
        if (/all-in/i.test(p.textContent) && $('amt-allin')) $('amt-allin').checked = true;
        confirm();
    }));
    input.addEventListener('keydown', e => { if (e.key === 'Enter') confirm(); });
    $('amt-confirm').addEventListener('click', confirm);
    $('amt-cancel').addEventListener('click', () => panel.classList.add('hidden'));
}

function renderBoardEntry() {
    const idx = sim.pendingStreet;
    const need = BOARD_COUNT[idx] - sim.board.length;
    const zone = $('prompt-zone');
    let slots = '';
    for (let i = 0; i < need; i++) slots += `<button class="card-pick board-slot" data-i="${i}">+</button>`;
    zone.innerHTML =
        `<p class="prompt-who">Deal the <strong>${STREETS[idx]}</strong> — add ${need} card${need > 1 ? 's' : ''}</p>` +
        `<div class="board-entry">${slots}</div>` +
        `<button id="board-continue" class="builder-btn primary" disabled>Continue →</button>`;

    const refresh = () => {
        const codes = [...zone.querySelectorAll('.board-slot')].map(b => b.dataset.code).filter(Boolean);
        $('board-continue').disabled = codes.length !== need;
    };
    zone.querySelectorAll('.board-slot').forEach(btn => btn.addEventListener('click', () => {
        const taken = usedCards().concat([...zone.querySelectorAll('.board-slot')].map(b => b.dataset.code).filter(Boolean).filter(c => c !== btn.dataset.code));
        openPicker('Pick ' + STREETS[idx] + ' card', taken, code => {
            btn.dataset.code = code; btn.innerHTML = renderCardFace(code); btn.classList.add('filled'); refresh();
        });
    }));
    $('board-continue').addEventListener('click', () => {
        dealBoard([...zone.querySelectorAll('.board-slot')].map(b => b.dataset.code));
    });
}

// ==================================================================
//  REVIEW & SAVE
// ==================================================================
function buildHand() {
    const heroRole = setup.guess === 'SB' ? 'BB' : 'SB';
    const hero = heroRole === 'SB' ? setup.sb : setup.bb;
    const vill = setup.guess === 'SB' ? setup.sb : setup.bb;
    return {
        name: setup.title, context: setup.context, youtubeLink: setup.video,
        heroName: hero.name, villainName: vill.name,
        heroNick: hero.nick, villainNick: vill.nick,
        HeroPosition: heroRole,
        smallBlind: setup.sbBlind, bigBlind: setup.bbBlind, ante: setup.ante,
        heroStartingStackBBs: hero.stack, villainStartingStackBBs: vill.stack,
        HeroHand: hero.cards, VillainSolution: vill.cards,
        Board: sim.board.slice(0, 5),
        StartingPot: round2(setup.sbBlind + setup.bbBlind + setup.ante * 2),
        ActionHistory: sim.streets,
    };
}
function validateHand(h) {
    const errs = [];
    if (h.ActionHistory.length !== 4) errs.push('The hand must reach the river — it ended early (a fold before the river can\'t be a guess-the-hand puzzle).');
    if (h.Board.length !== 5) errs.push('The board needs all 5 cards.');
    h.ActionHistory.forEach(s => { if (s.HeroStack < -0.01 || s.VillainStack < -0.01) errs.push(`${s.Street}: a stack went negative — check bet sizes (maybe a stack is too small after editing).`); });
    return errs;
}
function renderReview() {
    $('action-screen').classList.add('hidden');
    $('review-screen').classList.remove('hidden');
    const h = buildHand();
    const errs = validateHand(h);
    $('review-error').textContent = errs.join(' ');
    $('save-btn').disabled = errs.length > 0;
    const finalPot = h.ActionHistory.length ? h.ActionHistory[h.ActionHistory.length - 1].PotEnd : 0;
    $('review-summary').innerHTML =
        `<div class="rev-line"><strong>${h.name}</strong></div>` +
        `<div class="rev-line">${h.heroNick} (${h.HeroPosition}, shown) vs <strong>${h.villainNick}</strong> (to guess)</div>` +
        `<div class="rev-cards"><span>Shown</span> ${h.HeroHand.map(renderCardFace).join('')} <span>Answer</span> ${h.VillainSolution.map(renderCardFace).join('')}</div>` +
        `<div class="rev-cards"><span>Board</span> ${h.Board.map(renderCardFace).join('')}</div>` +
        `<div class="rev-line">Final pot $${fmt(finalPot)} · blinds $${fmt(h.smallBlind)}/$${fmt(h.bigBlind)}</div>`;
    $('review-json').textContent = JSON.stringify(h, null, 2);
    $('save-status').textContent = '';
}
async function saveHand() {
    const h = buildHand();
    $('save-status').textContent = 'Saving…';
    try {
        const res = await fetch('/api/builder/save', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(h),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Save failed');
        $('save-status').textContent = `Saved as hand #${data.id} — ${data.count} in the library.`;
        $('save-btn').disabled = true;
        refreshCount();
        setTimeout(resetAll, 900);
    } catch (e) { $('save-status').textContent = 'Error: ' + e.message; }
}

function resetAll() {
    setup = null; events = []; sim = null; holeSlots = {};
    document.querySelectorAll('.card-pick').forEach(b => { b.innerHTML = '+'; b.classList.remove('filled'); delete b.dataset.code; });
    ['f-title', 'f-video', 'f-context', 'sb-name', 'sb-nick', 'sb-stack', 'bb-name', 'bb-nick', 'bb-stack'].forEach(id => { $(id).value = ''; });
    goToSetup(false);
}

async function refreshCount() {
    try { const d = await (await fetch('/api/builder/library')).json(); $('lib-count').textContent = `${d.count} saved`; }
    catch (e) { /* ignore */ }
}

// ==================================================================
//  WIRING
// ==================================================================
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.card-pick').forEach(btn => {
        if (btn.classList.contains('board-slot')) return;
        btn.addEventListener('click', () => {
            const slot = btn.dataset.slot;
            const taken = Object.entries(holeSlots).filter(([k]) => k !== slot).map(([, v]) => v).filter(Boolean);
            openPicker('Pick ' + slot.replace('-', ' '), taken, code => {
                holeSlots[slot] = code; btn.innerHTML = renderCardFace(code); btn.classList.add('filled');
            });
        });
    });
    $('start-btn').addEventListener('click', startRecording);
    $('card-picker-close').addEventListener('click', closePicker);
    $('card-picker').addEventListener('click', e => { if (e.target.id === 'card-picker') closePicker(); });
    $('card-picker-input').addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const code = normalizeTyped(e.target.value);
        const blocked = [...$('card-picker-grid').querySelectorAll('.cp-card.used')].map(b => b.dataset.code);
        if (code) choosePicked(code, blocked);
    });
    $('undo-btn').addEventListener('click', undo);
    $('back-edit-btn').addEventListener('click', undo);
    $('edit-setup-btn').addEventListener('click', () => { fillSetup(setup); goToSetup(true); });
    $('review-edit-setup-btn').addEventListener('click', () => { fillSetup(setup); goToSetup(true); });
    $('restart-btn').addEventListener('click', () => { if (confirm('Clear this hand and start over?')) resetAll(); });
    $('save-btn').addEventListener('click', saveHand);
    refreshCount();
});

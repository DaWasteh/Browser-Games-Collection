/* Panndike – DOM-freie Klondike-Engine (UMD)
 * Deterministische Deals, Zugregeln, Zieh-1/3, Hinweise und sichere Auto-Moves.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PanndikeEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SUITS = Object.freeze(['S', 'H', 'D', 'C']);
  const RED = new Set(['H', 'D']);
  const SYMBOLS = Object.freeze({ S: '♠', H: '♥', D: '♦', C: '♣' });
  const SUIT_NAMES = Object.freeze({ S: 'Pik', H: 'Herz', D: 'Karo', C: 'Kreuz' });
  const RANK_NAMES = Object.freeze(['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'B', 'D', 'K']);

  function hashSeed(value) {
    const text = String(value == null ? '' : value);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    hash += hash << 13; hash ^= hash >>> 7;
    hash += hash << 3; hash ^= hash >>> 17;
    hash += hash << 5;
    return hash >>> 0 || 0x9e3779b9;
  }

  function createPrng(seed) {
    let value = hashSeed(seed);
    return function random() {
      value += 0x6d2b79f5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function makeDeck(seed) {
    const deck = [];
    let id = 0;
    for (const suit of SUITS) {
      for (let rank = 1; rank <= 13; rank += 1) {
        deck.push({ id: id++, suit, rank, faceUp: false });
      }
    }
    const random = createPrng(seed);
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  function normalizeDrawCount(value) {
    return Number(value) === 3 ? 3 : 1;
  }

  function createState(options) {
    const opts = options || {};
    const seed = String(opts.seed == null ? '1' : opts.seed);
    const deck = makeDeck(seed);
    const tableau = Array.from({ length: 7 }, () => []);
    let cursor = 0;
    for (let col = 0; col < 7; col += 1) {
      for (let row = 0; row <= col; row += 1) {
        const card = deck[cursor++];
        card.faceUp = row === col;
        tableau[col].push(card);
      }
    }
    return {
      version: 1,
      seed,
      dealType: opts.dealType === 'daily' ? 'daily' : 'random',
      drawCount: normalizeDrawCount(opts.drawCount),
      tableau,
      stock: deck.slice(cursor),
      waste: [],
      foundations: { S: [], H: [], D: [], C: [] },
      moves: 0,
      score: 0,
      passes: 0,
      status: 'playing'
    };
  }

  function cardColor(card) {
    return card && RED.has(card.suit) ? 'red' : 'black';
  }

  function isValidSequence(cards) {
    if (!Array.isArray(cards) || cards.length === 0 || !cards[0].faceUp) return false;
    for (let i = 1; i < cards.length; i += 1) {
      if (!cards[i].faceUp) return false;
      if (cards[i - 1].rank !== cards[i].rank + 1) return false;
      if (cardColor(cards[i - 1]) === cardColor(cards[i])) return false;
    }
    return true;
  }

  function sourceCards(state, source) {
    if (!state || !source) return null;
    if (source.zone === 'tableau') {
      const column = state.tableau[source.col];
      if (!column || !Number.isInteger(source.index) || source.index < 0 || source.index >= column.length) return null;
      const cards = column.slice(source.index);
      return isValidSequence(cards) ? cards : null;
    }
    if (source.zone === 'waste') {
      return state.waste.length ? [state.waste[state.waste.length - 1]] : null;
    }
    if (source.zone === 'foundation' && SUITS.includes(source.suit)) {
      const pile = state.foundations[source.suit];
      return pile.length ? [pile[pile.length - 1]] : null;
    }
    return null;
  }

  function canMoveToTableau(state, source, columnIndex) {
    const cards = sourceCards(state, source);
    const destination = state && state.tableau[columnIndex];
    if (!cards || !destination || (source.zone === 'tableau' && source.col === columnIndex)) return false;
    const target = destination[destination.length - 1];
    if (!target) return cards[0].rank === 13;
    return target.faceUp && target.rank === cards[0].rank + 1 && cardColor(target) !== cardColor(cards[0]);
  }

  function canMoveToFoundation(state, source, suit) {
    const cards = sourceCards(state, source);
    if (!cards || cards.length !== 1 || !SUITS.includes(suit)) return false;
    const card = cards[0];
    return card.suit === suit && card.rank === state.foundations[suit].length + 1;
  }

  function sameColorSibling(suit) {
    if (suit === 'S') return 'C';
    if (suit === 'C') return 'S';
    if (suit === 'H') return 'D';
    return 'H';
  }

  function isSafeFoundationCard(state, card) {
    if (!card || !canMoveToFoundation(state, cardSource(state, card.id), card.suit)) return false;
    if (card.rank <= 2) return true;
    const opposite = SUITS.filter(suit => RED.has(suit) !== RED.has(card.suit));
    if (!opposite.every(suit => state.foundations[suit].length >= card.rank - 1)) return false;
    return state.foundations[sameColorSibling(card.suit)].length >= card.rank - 2;
  }

  function cardSource(state, cardId) {
    for (let col = 0; col < state.tableau.length; col += 1) {
      const index = state.tableau[col].findIndex(card => card.id === cardId);
      if (index !== -1) return { zone: 'tableau', col, index };
    }
    if (state.waste.length && state.waste[state.waste.length - 1].id === cardId) return { zone: 'waste' };
    for (const suit of SUITS) {
      const pile = state.foundations[suit];
      if (pile.length && pile[pile.length - 1].id === cardId) return { zone: 'foundation', suit };
    }
    return null;
  }

  function detach(state, source) {
    if (source.zone === 'tableau') {
      const column = state.tableau[source.col];
      const cards = column.splice(source.index);
      let revealed = false;
      if (column.length && !column[column.length - 1].faceUp) {
        column[column.length - 1].faceUp = true;
        revealed = true;
      }
      return { cards, revealed };
    }
    if (source.zone === 'waste') return { cards: [state.waste.pop()], revealed: false };
    return { cards: [state.foundations[source.suit].pop()], revealed: false };
  }

  function updateWin(state) {
    if (foundationCount(state) === 52) state.status = 'won';
  }

  function move(state, source, destination) {
    if (!state || state.status !== 'playing') return { ok: false, reason: 'ended' };
    const cards = sourceCards(state, source);
    if (!cards) return { ok: false, reason: 'source' };
    let legal = false;
    if (destination && destination.zone === 'tableau') legal = canMoveToTableau(state, source, destination.col);
    else if (destination && destination.zone === 'foundation') legal = canMoveToFoundation(state, source, destination.suit);
    if (!legal) return { ok: false, reason: 'destination' };

    const detached = detach(state, source);
    if (destination.zone === 'tableau') state.tableau[destination.col].push(...detached.cards);
    else state.foundations[destination.suit].push(detached.cards[0]);

    let delta = detached.revealed ? 5 : 0;
    if (destination.zone === 'foundation') delta += 10;
    if (source.zone === 'waste' && destination.zone === 'tableau') delta += 5;
    if (source.zone === 'foundation') delta -= 10;
    state.score = Math.max(0, state.score + delta);
    state.moves += 1;
    updateWin(state);
    return { ok: true, cards: detached.cards.length, revealed: detached.revealed, scoreDelta: delta, won: state.status === 'won' };
  }

  function draw(state) {
    if (!state || state.status !== 'playing') return { ok: false, reason: 'ended' };
    if (state.stock.length) {
      const count = Math.min(state.drawCount, state.stock.length);
      for (let i = 0; i < count; i += 1) {
        const card = state.stock.pop();
        card.faceUp = true;
        state.waste.push(card);
      }
      state.moves += 1;
      return { ok: true, kind: 'draw', count };
    }
    if (state.waste.length) {
      state.stock = state.waste.reverse();
      state.stock.forEach(card => { card.faceUp = false; });
      state.waste = [];
      state.passes += 1;
      state.moves += 1;
      state.score = Math.max(0, state.score - (state.drawCount === 3 ? 5 : 20));
      return { ok: true, kind: 'recycle', count: state.stock.length };
    }
    return { ok: false, reason: 'empty' };
  }

  function topTableauSources(state) {
    const out = [];
    for (let col = 0; col < 7; col += 1) {
      const column = state.tableau[col];
      for (let index = 0; index < column.length; index += 1) {
        if (isValidSequence(column.slice(index))) out.push({ zone: 'tableau', col, index });
      }
    }
    return out;
  }

  function legalMoves(state, options) {
    const opts = options || {};
    const sources = topTableauSources(state);
    if (state.waste.length) sources.push({ zone: 'waste' });
    if (opts.includeFoundationBack) {
      for (const suit of SUITS) if (state.foundations[suit].length) sources.push({ zone: 'foundation', suit });
    }
    const moves = [];
    for (const source of sources) {
      const cards = sourceCards(state, source);
      for (let col = 0; col < 7; col += 1) {
        if (canMoveToTableau(state, source, col)) {
          const reveals = source.zone === 'tableau' && source.index > 0 && !state.tableau[source.col][source.index - 1].faceUp;
          moves.push({ source: { ...source }, destination: { zone: 'tableau', col }, cardId: cards[0].id, reveals, kind: 'tableau' });
        }
      }
      if (cards && cards.length === 1 && canMoveToFoundation(state, source, cards[0].suit)) {
        moves.push({ source: { ...source }, destination: { zone: 'foundation', suit: cards[0].suit }, cardId: cards[0].id, safe: isSafeFoundationCard(state, cards[0]), kind: 'foundation' });
      }
    }
    return moves;
  }

  function findHint(state) {
    const moves = legalMoves(state);
    const priorities = [
      moveInfo => moveInfo.reveals,
      moveInfo => moveInfo.kind === 'foundation' && moveInfo.safe,
      moveInfo => moveInfo.source.zone === 'waste' && moveInfo.kind === 'tableau',
      moveInfo => moveInfo.kind === 'tableau',
      moveInfo => moveInfo.kind === 'foundation'
    ];
    for (const predicate of priorities) {
      const found = moves.find(predicate);
      if (found) return found;
    }
    if (state.stock.length) return { kind: 'draw', source: { zone: 'stock' }, destination: { zone: 'waste' } };
    if (state.waste.length) return { kind: 'recycle', source: { zone: 'stock' }, destination: { zone: 'stock' } };
    return null;
  }

  function autoFoundation(state) {
    if (!state || state.status !== 'playing') return { moved: 0, won: false };
    let moved = 0;
    while (true) {
      let source = null;
      for (let col = 0; col < 7 && !source; col += 1) {
        const column = state.tableau[col];
        const card = column[column.length - 1];
        if (card && isSafeFoundationCard(state, card)) source = { zone: 'tableau', col, index: column.length - 1 };
      }
      if (!source && state.waste.length) {
        const card = state.waste[state.waste.length - 1];
        if (isSafeFoundationCard(state, card)) source = { zone: 'waste' };
      }
      if (!source) break;
      const card = sourceCards(state, source)[0];
      const result = move(state, source, { zone: 'foundation', suit: card.suit });
      if (!result.ok) break;
      moved += 1;
      if (state.status === 'won') break;
    }
    return { moved, won: state.status === 'won' };
  }

  function foundationCount(state) {
    return SUITS.reduce((sum, suit) => sum + state.foundations[suit].length, 0);
  }

  function dealCode(state) {
    return hashSeed(state.seed).toString(36).toUpperCase().padStart(7, '0').slice(-7);
  }

  function dailySeed(dateValue) {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue || Date.now());
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `daily-${year}-${month}-${day}`;
  }

  function validateState(value) {
    if (!value || value.version !== 1 || !Array.isArray(value.tableau) || value.tableau.length !== 7) return false;
    if (!Array.isArray(value.stock) || !Array.isArray(value.waste) || !value.foundations) return false;
    if (![1, 3].includes(value.drawCount) || !['playing', 'won'].includes(value.status)) return false;
    const cards = [];
    value.tableau.forEach(column => { if (Array.isArray(column)) cards.push(...column); });
    cards.push(...value.stock, ...value.waste);
    for (const suit of SUITS) {
      const pile = value.foundations[suit];
      if (!Array.isArray(pile)) return false;
      cards.push(...pile);
      for (let i = 0; i < pile.length; i += 1) {
        if (pile[i].suit !== suit || pile[i].rank !== i + 1 || !pile[i].faceUp) return false;
      }
    }
    if (cards.length !== 52 || new Set(cards.map(card => card && card.id)).size !== 52) return false;
    for (const card of cards) {
      if (!card || !Number.isInteger(card.id) || card.id < 0 || card.id > 51) return false;
      if (!SUITS.includes(card.suit) || !Number.isInteger(card.rank) || card.rank < 1 || card.rank > 13 || typeof card.faceUp !== 'boolean') return false;
    }
    for (const column of value.tableau) {
      if (!Array.isArray(column)) return false;
      let sawFaceUp = false;
      for (const card of column) {
        if (card.faceUp) sawFaceUp = true;
        else if (sawFaceUp) return false;
      }
    }
    if (!value.stock.every(card => !card.faceUp) || !value.waste.every(card => card.faceUp)) return false;
    if (!Number.isFinite(value.moves) || value.moves < 0 || !Number.isFinite(value.score) || value.score < 0) return false;
    return foundationCount(value) === 52 ? value.status === 'won' : value.status === 'playing';
  }

  function cardName(card) {
    return card ? `${RANK_NAMES[card.rank]} ${SUIT_NAMES[card.suit]}` : '';
  }

  return Object.freeze({
    SUITS, RED, SYMBOLS, SUIT_NAMES, RANK_NAMES,
    hashSeed, createPrng, clone, makeDeck, createState, normalizeDrawCount,
    cardColor, cardName, cardSource, sourceCards, isValidSequence,
    canMoveToTableau, canMoveToFoundation, isSafeFoundationCard,
    move, draw, legalMoves, findHint, autoFoundation,
    foundationCount, dealCode, dailySeed, validateState
  });
});

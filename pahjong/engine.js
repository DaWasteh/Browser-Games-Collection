/* Pahjong – DOM-freie Mahjong-Solitaire-Engine (UMD).
 * Kanonisches 144-Stein-Turtle-Layout mit Halbstein-Koordinaten.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PahjongEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TILE_UNITS = 2;
  const BOARD_WIDTH_UNITS = 32;
  const BOARD_HEIGHT_UNITS = 16;

  function hashSeed(value) {
    const text = String(value == null ? '' : value);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
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

  function shuffle(values, random) {
    const result = values.slice();
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function makeSlots() {
    const slots = [];
    const add = (x, y, z) => slots.push({ id: slots.length, x, y, z });
    const row = (y, startX, count, z) => {
      for (let index = 0; index < count; index += 1) add(startX + index * 2, y, z);
    };

    // Unterste Schildkrötenebene: Körper plus Kopf/Schwanz/äußerer Kopfstein.
    row(0, 4, 12, 0);
    row(2, 8, 8, 0);
    row(4, 6, 10, 0);
    row(6, 4, 12, 0);
    row(8, 4, 12, 0);
    row(10, 6, 10, 0);
    row(12, 8, 8, 0);
    row(14, 4, 12, 0);
    add(2, 7, 0);
    add(28, 7, 0);
    add(30, 7, 0);

    // Vier zentrierte obere Ebenen (36 + 16 + 4 + 1).
    for (let y = 2; y <= 12; y += 2) for (let x = 8; x <= 18; x += 2) add(x, y, 1);
    for (let y = 4; y <= 10; y += 2) for (let x = 10; x <= 16; x += 2) add(x, y, 2);
    for (let y = 6; y <= 8; y += 2) for (let x = 12; x <= 14; x += 2) add(x, y, 3);
    add(13, 7, 4);

    if (slots.length !== 144) throw new Error(`Turtle-Layout hat ${slots.length} statt 144 Plätze.`);
    return Object.freeze(slots.map(Object.freeze));
  }

  const SLOTS = makeSlots();

  function overlaps(a0, b0) {
    return Math.max(a0, b0) < Math.min(a0 + TILE_UNITS, b0 + TILE_UNITS);
  }

  function covers(lower, upper) {
    return upper.z > lower.z && overlaps(lower.x, upper.x) && overlaps(lower.y, upper.y);
  }

  const COVERERS = SLOTS.map(slot => SLOTS.filter(other => covers(slot, other)).map(other => other.id));
  const LEFT = SLOTS.map(slot => SLOTS.filter(other => other.z === slot.z && other.x + TILE_UNITS === slot.x && overlaps(other.y, slot.y)).map(other => other.id));
  const RIGHT = SLOTS.map(slot => SLOTS.filter(other => other.z === slot.z && slot.x + TILE_UNITS === other.x && overlaps(other.y, slot.y)).map(other => other.id));

  function occupied(cards, id, remaining) {
    return remaining ? remaining.has(id) : !cards[id].removed;
  }

  function isFreeIn(cards, id, remaining) {
    if (!cards[id] || !occupied(cards, id, remaining)) return false;
    if (COVERERS[id].some(other => occupied(cards, other, remaining))) return false;
    const leftBlocked = LEFT[id].some(other => occupied(cards, other, remaining));
    const rightBlocked = RIGHT[id].some(other => occupied(cards, other, remaining));
    return !leftBlocked || !rightBlocked;
  }

  function makeFaces() {
    const faces = [];
    const addCopies = (key, suit, rank, symbol, name, copies = 4) => {
      for (let copy = 0; copy < copies; copy += 1) {
        faces.push({ uid: `${key}-${copy}`, key, group: 'normal', suit, rank, symbol, name });
      }
    };
    for (let rank = 1; rank <= 9; rank += 1) addCopies(`dot-${rank}`, 'dot', rank, '●', `${rank} Kreis${rank === 1 ? '' : 'e'}`);
    for (let rank = 1; rank <= 9; rank += 1) addCopies(`bam-${rank}`, 'bamboo', rank, rank === 1 ? '🐦' : '竹', `${rank} Bambus`);
    for (let rank = 1; rank <= 9; rank += 1) addCopies(`char-${rank}`, 'character', rank, '萬', `${rank} Zeichen`);
    [['east', '東', 'Ostwind'], ['south', '南', 'Südwind'], ['west', '西', 'Westwind'], ['north', '北', 'Nordwind']]
      .forEach(([key, symbol, name]) => addCopies(`wind-${key}`, 'wind', 0, symbol, name));
    [['red', '中', 'Roter Drache'], ['green', '發', 'Grüner Drache'], ['white', '白', 'Weißer Drache']]
      .forEach(([key, symbol, name]) => addCopies(`dragon-${key}`, 'dragon', 0, symbol, name));
    [['plum', '🌸', 'Pflaumenblüte'], ['orchid', '🌺', 'Orchidee'], ['bamboo', '🎋', 'Bambusblüte'], ['chrys', '🌼', 'Chrysantheme']]
      .forEach(([key, symbol, name], index) => faces.push({ uid: `flower-${index}`, key: `flower-${key}`, group: 'flower', suit: 'flower', rank: index + 1, symbol, name }));
    [['spring', '🌱', 'Frühling'], ['summer', '☀', 'Sommer'], ['autumn', '🍂', 'Herbst'], ['winter', '❄', 'Winter']]
      .forEach(([key, symbol, name], index) => faces.push({ uid: `season-${index}`, key: `season-${key}`, group: 'season', suit: 'season', rank: index + 1, symbol, name }));
    if (faces.length !== 144) throw new Error(`Steinsatz hat ${faces.length} statt 144 Steine.`);
    return faces;
  }

  function isMatch(a, b) {
    if (!a || !b || a.id === b.id || a.removed || b.removed) return false;
    if (a.face.group === 'flower' && b.face.group === 'flower') return true;
    if (a.face.group === 'season' && b.face.group === 'season') return true;
    return a.face.key === b.face.key;
  }

  function facePairs(seed) {
    const random = createPrng(`faces|${seed}`);
    const faces = makeFaces();
    const byKey = new Map();
    for (const face of faces.filter(face => face.group === 'normal')) {
      if (!byKey.has(face.key)) byKey.set(face.key, []);
      byKey.get(face.key).push(face);
    }
    const pairs = [];
    for (const group of byKey.values()) {
      const mixed = shuffle(group, random);
      pairs.push([mixed[0], mixed[1]], [mixed[2], mixed[3]]);
    }
    const flowers = shuffle(faces.filter(face => face.group === 'flower'), random);
    const seasons = shuffle(faces.filter(face => face.group === 'season'), random);
    pairs.push([flowers[0], flowers[1]], [flowers[2], flowers[3]]);
    pairs.push([seasons[0], seasons[1]], [seasons[2], seasons[3]]);
    return shuffle(pairs, random);
  }

  function buildRemovalPlan(cards, ids, seed, attempts = 300) {
    const sourceIds = Array.from(ids);
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const random = createPrng(`plan|${seed}|${attempt}`);
      const remaining = new Set(sourceIds);
      const plan = [];
      while (remaining.size) {
        const free = [];
        for (const id of remaining) if (isFreeIn(cards, id, remaining)) free.push(id);
        if (free.length < 2) break;
        const mixed = shuffle(free, random);
        const first = mixed[0];
        // Entferne bevorzugt weit auseinanderliegende freie Steine; das öffnet
        // beide Seiten der Schildkröte und vermeidet geometrische Sackgassen.
        let second = mixed[1], bestDistance = -1;
        for (let i = 1; i < mixed.length; i += 1) {
          const a = cards[first], b = cards[mixed[i]];
          const distance = Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) * 2 + random() * .1;
          if (distance > bestDistance) { bestDistance = distance; second = mixed[i]; }
        }
        plan.push([first, second]);
        remaining.delete(first); remaining.delete(second);
      }
      if (!remaining.size) return plan;
    }
    return null;
  }

  function verifyRemovalPlan(cards, plan, ids) {
    if (!Array.isArray(plan)) return false;
    const remaining = new Set(ids);
    for (const pair of plan) {
      if (!Array.isArray(pair) || pair.length !== 2 || pair[0] === pair[1]) return false;
      if (!remaining.has(pair[0]) || !remaining.has(pair[1])) return false;
      if (!isFreeIn(cards, pair[0], remaining) || !isFreeIn(cards, pair[1], remaining)) return false;
      remaining.delete(pair[0]); remaining.delete(pair[1]);
    }
    return remaining.size === 0;
  }

  function createCards() {
    return SLOTS.map(slot => ({ ...slot, removed: false, face: null }));
  }

  function createState(options) {
    const opts = options || {};
    const seed = String(opts.seed == null ? 'pahjong' : opts.seed);
    const cards = createCards();
    const ids = new Set(cards.map(card => card.id));
    const plan = buildRemovalPlan(cards, ids, seed, 500);
    if (!plan || !verifyRemovalPlan(cards, plan, ids)) throw new Error('Kein gültiger Turtle-Entfernungsplan gefunden.');
    const pairs = facePairs(seed);
    plan.forEach((pair, index) => {
      cards[pair[0]].face = pairs[index][0];
      cards[pair[1]].face = pairs[index][1];
    });
    return { version: 2, seed, cards, moves: 0, shuffles: 0, status: 'playing', solutionPlan: plan.map(pair => pair.slice()) };
  }

  function isFree(state, id) {
    return !!state && isFreeIn(state.cards, id, null);
  }

  function freeIds(state) {
    return state.cards.filter(card => isFree(state, card.id)).map(card => card.id);
  }

  function matchingPairs(state) {
    const free = freeIds(state);
    const pairs = [];
    for (let i = 0; i < free.length; i += 1) {
      for (let j = i + 1; j < free.length; j += 1) {
        if (isMatch(state.cards[free[i]], state.cards[free[j]])) pairs.push([free[i], free[j]]);
      }
    }
    return pairs;
  }

  function findHint(state) {
    return matchingPairs(state)[0] || null;
  }

  function removePair(state, firstId, secondId) {
    if (!state || state.status !== 'playing') return { ok: false, reason: 'status' };
    const a = state.cards[firstId], b = state.cards[secondId];
    if (!isFree(state, firstId) || !isFree(state, secondId)) return { ok: false, reason: 'blocked' };
    if (!isMatch(a, b)) return { ok: false, reason: 'mismatch' };
    a.removed = true; b.removed = true; state.moves += 1;
    const remaining = state.cards.filter(card => !card.removed).length;
    if (remaining === 0) state.status = 'won';
    else if (!findHint(state)) state.status = 'blocked';
    return { ok: true, remaining, status: state.status };
  }

  function shuffleRemaining(state) {
    if (!state || state.status === 'won') return { ok: false, reason: 'won' };
    const live = state.cards.filter(card => !card.removed);
    const ids = new Set(live.map(card => card.id));
    const seed = `${state.seed}|shuffle|${state.shuffles + 1}|${state.moves}`;
    const plan = buildRemovalPlan(state.cards, ids, seed, 800);
    if (!plan || !verifyRemovalPlan(state.cards, plan, ids)) return { ok: false, reason: 'geometry' };

    const groups = new Map();
    for (const card of live) {
      const key = card.face.group === 'normal' ? card.face.key : card.face.group;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(card.face);
    }
    const random = createPrng(`faces|${seed}`);
    const pairs = [];
    for (const group of groups.values()) {
      const mixed = shuffle(group, random);
      if (mixed.length % 2) return { ok: false, reason: 'faces' };
      for (let i = 0; i < mixed.length; i += 2) pairs.push([mixed[i], mixed[i + 1]]);
    }
    const mixedPairs = shuffle(pairs, random);
    if (mixedPairs.length !== plan.length) return { ok: false, reason: 'count' };
    plan.forEach((pair, index) => {
      state.cards[pair[0]].face = mixedPairs[index][0];
      state.cards[pair[1]].face = mixedPairs[index][1];
    });
    state.shuffles += 1;
    state.moves += 1;
    state.status = 'playing';
    state.solutionPlan = plan.map(pair => pair.slice());
    return { ok: true, plan: state.solutionPlan };
  }

  function validateState(value) {
    if (!value || value.version !== 2 || !Array.isArray(value.cards) || value.cards.length !== 144) return false;
    if (!['playing', 'blocked', 'won'].includes(value.status)) return false;
    const ids = new Set();
    const faceUids = new Set();
    for (let index = 0; index < value.cards.length; index += 1) {
      const card = value.cards[index];
      const slot = SLOTS[index];
      if (!card || card.id !== index || card.x !== slot.x || card.y !== slot.y || card.z !== slot.z || typeof card.removed !== 'boolean') return false;
      if (!card.face || typeof card.face.uid !== 'string' || typeof card.face.key !== 'string' || !['normal', 'flower', 'season'].includes(card.face.group)) return false;
      ids.add(card.id); faceUids.add(card.face.uid);
    }
    if (ids.size !== 144 || faceUids.size !== 144) return false;
    if (!Number.isInteger(value.moves) || value.moves < 0 || !Number.isInteger(value.shuffles) || value.shuffles < 0) return false;
    const remaining = value.cards.filter(card => !card.removed).length;
    if (remaining % 2) return false;
    if (remaining === 0 && value.status !== 'won') return false;
    if (remaining > 0 && value.status === 'won') return false;
    return true;
  }

  function dealCode(state) {
    return hashSeed(state.seed).toString(36).toUpperCase().padStart(7, '0').slice(-7);
  }

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function testPlans(rounds = 100) {
    let passed = 0;
    for (let index = 0; index < rounds; index += 1) {
      const state = createState({ seed: `test-${index}` });
      if (verifyRemovalPlan(state.cards, state.solutionPlan, new Set(state.cards.map(card => card.id)))) passed += 1;
    }
    return { rounds, passed, allPassed: passed === rounds };
  }

  return Object.freeze({
    TILE_UNITS, BOARD_WIDTH_UNITS, BOARD_HEIGHT_UNITS, SLOTS,
    hashSeed, createPrng, shuffle, overlaps, covers,
    isFreeIn, isFree, freeIds, isMatch, matchingPairs, findHint,
    makeFaces, createState, removePair, shuffleRemaining,
    buildRemovalPlan, verifyRemovalPlan, validateState,
    dealCode, clone, testPlans
  });
});

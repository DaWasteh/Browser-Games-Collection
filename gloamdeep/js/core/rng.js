// Seeded pseudo-random number generation.
// Pure module: no DOM access, safe to import from Node tests.

/** 32-bit string hash (cyrb-style). Returns an unsigned 32-bit integer. */
export function hashString(str) {
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

/** Combine any number of integers into one well-mixed 32-bit seed. */
export function mixSeed(...parts) {
  let h = 0x9e3779b9;
  for (const p of parts) {
    let k = (p | 0) >>> 0;
    k = Math.imul(k ^ (k >>> 16), 0x85ebca6b);
    k = Math.imul(k ^ (k >>> 13), 0xc2b2ae35);
    k ^= k >>> 16;
    h = Math.imul(h ^ k, 0x27d4eb2d) + 0x165667b1;
    h ^= h >>> 15;
  }
  return h >>> 0;
}

/** Seed for a dungeon floor: identical for identical (worldSeed, depth). */
export function floorSeed(worldSeed, depth) {
  return mixSeed(worldSeed, depth, 0xf100d);
}

/** Human friendly seed text, e.g. "K7F2Q9". */
export function seedToText(seed) {
  return (seed >>> 0).toString(36).toUpperCase().padStart(6, '0');
}

/** Parse user text into a seed: base36 codes round-trip, any other text is hashed. */
export function textToSeed(text) {
  const t = String(text || '').trim();
  if (!t) return randomSeed();
  if (/^[0-9a-z]{1,7}$/i.test(t)) {
    const n = parseInt(t, 36);
    if (Number.isFinite(n) && n <= 0xffffffff) return n >>> 0;
  }
  return hashString(t);
}

export function randomSeed() {
  const buf = new Uint32Array(1);
  if (globalThis.crypto && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(buf);
    return buf[0] >>> 0;
  }
  return (Math.random() * 0xffffffff) >>> 0;
}

/** Mulberry32 based generator with convenience helpers. */
export class RNG {
  constructor(seed = randomSeed()) {
    this.state = (seed >>> 0) || 0x6d2b79f5;
  }

  /** Float in [0, 1). */
  next() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  float(min = 0, max = 1) { return min + (max - min) * this.next(); }

  /** Integer in [min, max] inclusive. */
  int(min, max) { return min + Math.floor(this.next() * (max - min + 1)); }

  chance(p) { return this.next() < p; }

  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }

  sign() { return this.next() < 0.5 ? -1 : 1; }

  /** entries: [{w: weight, ...}] or [[value, weight], ...] */
  weighted(entries) {
    let total = 0;
    for (const e of entries) total += Array.isArray(e) ? e[1] : e.w;
    let r = this.next() * total;
    for (const e of entries) {
      r -= Array.isArray(e) ? e[1] : e.w;
      if (r <= 0) return Array.isArray(e) ? e[0] : e;
    }
    const last = entries[entries.length - 1];
    return Array.isArray(last) ? last[0] : last;
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  /** Gaussian-ish value in [-1, 1] (average of three uniforms). */
  tri() { return (this.next() + this.next() + this.next()) / 1.5 - 1; }

  /** Independent child generator derived from the current state. */
  fork(salt = 0) { return new RNG(mixSeed(this.state, salt, 0x51f7)); }
}

/** Shared runtime RNG for combat rolls, particles etc. (not used for world generation). */
export const runtimeRng = new RNG();

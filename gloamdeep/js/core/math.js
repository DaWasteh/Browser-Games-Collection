// Small math helpers shared by gameplay and rendering. Pure module.

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a);
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const dist2 = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };
export const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);

/** Smallest signed difference between two angles. */
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Frame-rate independent exponential approach: moves `cur` toward `target`. */
export function damp(cur, target, sharpness, dt) {
  return lerp(cur, target, 1 - Math.exp(-sharpness * dt));
}

/** Round to the nearest integer pixel (avoids sub-pixel shimmer in pixel art). */
export const px = (v) => Math.round(v);

export function approach(cur, target, delta) {
  if (cur < target) return Math.min(cur + delta, target);
  return Math.max(cur - delta, target);
}

/** Facing index for 4-directional sprites: 0 down, 1 left, 2 right, 3 up. */
export function dir4(angle) {
  const a = ((angle % TAU) + TAU) % TAU;
  if (a >= Math.PI * 0.25 && a < Math.PI * 0.75) return 0;
  if (a >= Math.PI * 0.75 && a < Math.PI * 1.25) return 1;
  if (a >= Math.PI * 1.25 && a < Math.PI * 1.75) return 3;
  return 2;
}

export function formatNumber(n) {
  n = Math.floor(n);
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'k';
  return String(n);
}

/** Parse "#rrggbb" into [r, g, b]. */
export function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function rgbToHex(r, g, b) {
  const c = (x) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

/** Multiply a hex colour's brightness (f < 1 darkens, f > 1 lightens). */
export function shade(hex, f) {
  const [r, g, b] = hexToRgb(hex);
  if (f <= 1) return rgbToHex(r * f, g * f, b * f);
  const t = f - 1;
  return rgbToHex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
}

export function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
}

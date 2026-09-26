// Procedural pixel-art characters. Every sprite is painted with fillRect at 1 world pixel per
// pixel, then outlined (dark "sel-out" contour) and cached. A white silhouette variant is cached
// for hit flashes. Nothing here is loaded from files.

import { shade } from '../core/math.js';

import { makeCanvas, box, dot, outline, silhouette, mirror } from './pixel.js';
import { paintBoss, BOSS_SIZE } from './bossArt.js';

const cache = new Map();

// ------------------------------------------------------------------ humanoids

const HUMAN = { headW: 8, headH: 8, bodyW: 10, bodyH: 9, legH: 3, bootH: 2 };
const CHILD = { headW: 7, headH: 7, bodyW: 8, bodyH: 6, legH: 2, bootH: 2 };

function paintHead(g, L, dir, hx, hy, d, glow) {
  const w = d.headW, h = d.headH;
  const side = dir === 2;
  const back = dir === 3;
  const eyeCol = L.eye || '#1a1420';
  const eyes = (y, x1, x2) => { dot(g, x1, y, eyeCol); if (x2 != null) dot(g, x2, y, eyeCol); };
  switch (L.head) {
    case 'hood': {
      box(g, hx + 1, hy, w - 2, 1, L.hood, true);
      box(g, hx, hy + 1, w, h - 2, L.hood);
      box(g, hx + 1, hy + h - 1, w - 2, 1, L.hoodDark, true);
      if (back) { dot(g, hx + (w >> 1) - 1, hy + 2, L.hoodDark, 2, h - 4); break; }
      const fw = side ? 3 : w - 4, fx = side ? hx + w - 3 : hx + 2;
      dot(g, fx, hy + 3, L.hoodDark, fw, 1);
      box(g, fx, hy + 4, fw, h - 6, L.skin, true);
      if (side) eyes(hy + 5, hx + w - 2); else eyes(hy + 5, fx, fx + fw - 1);
      break;
    }
    case 'helm': {
      box(g, hx, hy, w, h - 1, L.helm || '#8a93a6');
      dot(g, hx + 1, hy, shade(L.helm || '#8a93a6', 1.3), w - 2, 1);
      if (L.plume) dot(g, hx + (w >> 1) - 1, hy - 2, L.plume, 2, 3);
      if (!back) {
        const vx = side ? hx + w - 4 : hx + 1, vw = side ? 4 : w - 2;
        dot(g, vx, hy + 4, '#141018', vw, 2);
        if (glow) { if (side) dot(g, hx + w - 2, hy + 4, eyeCol); else { dot(g, hx + 2, hy + 4, eyeCol); dot(g, hx + w - 3, hy + 4, eyeCol); } }
      }
      break;
    }
    case 'hair': {
      box(g, hx, hy + 2, w, h - 3, L.skin);
      box(g, hx, hy, w, 3, L.hair);
      if (back) { box(g, hx, hy, w, h - 2, L.hair); break; }
      if (side) { dot(g, hx, hy + 3, L.hair, 2, h - 5); eyes(hy + 4, hx + w - 2); }
      else { dot(g, hx, hy + 3, L.hair, 1, 3); dot(g, hx + w - 1, hy + 3, L.hair, 1, 3); eyes(hy + 4, hx + 2, hx + w - 3); }
      if (L.beard && !back) dot(g, side ? hx + w - 4 : hx + 1, hy + h - 3, L.beard, side ? 4 : w - 2, 3);
      if (L.bun && !side) dot(g, hx + (w >> 1) - 1, hy - 2, L.hair, 3, 2);
      break;
    }
    case 'hat': {
      box(g, hx, hy + 3, w, h - 4, L.skin);
      dot(g, hx - 2, hy + 3, L.hat, w + 4, 1);
      box(g, hx + 1, hy, w - 2, 3, L.hat);
      dot(g, hx + 1, hy + 2, L.hatBand || '#c9a45a', w - 2, 1);
      if (L.feather) dot(g, hx + w - 2, hy - 2, L.feather, 1, 3);
      if (!back) {
        if (side) eyes(hy + 5, hx + w - 2); else eyes(hy + 5, hx + 2, hx + w - 3);
        if (L.beard) dot(g, side ? hx + w - 4 : hx + 1, hy + h - 3, L.beard, side ? 4 : w - 2, 3);
      }
      break;
    }
    case 'skull': {
      box(g, hx + 1, hy, w - 2, h - 2, L.bone);
      dot(g, hx + 2, hy + h - 2, L.bone, w - 4, 2);
      if (!back) {
        const sx = side ? hx + w - 4 : hx + 2;
        dot(g, sx, hy + 3, '#120c10', 2, 2);
        if (!side) dot(g, hx + w - 4, hy + 3, '#120c10', 2, 2);
        dot(g, side ? hx + w - 3 : hx + 3, hy + h - 2, '#120c10', side ? 1 : w - 6, 1);
        if (glow) { dot(g, sx + 1, hy + 4, eyeCol); if (!side) dot(g, hx + w - 3, hy + 4, eyeCol); }
      }
      if (L.horns) { dot(g, hx, hy - 2, L.horns, 1, 3); dot(g, hx + w - 1, hy - 2, L.horns, 1, 3); dot(g, hx - 1, hy - 3, L.horns); dot(g, hx + w, hy - 3, L.horns); }
      break;
    }
    case 'hollow': {
      box(g, hx + 1, hy + 1, w - 2, h - 2, L.skin);
      dot(g, hx + 1, hy, L.hair || shade(L.skin, 0.6), w - 2, 2);
      dot(g, hx, hy + 1, L.hair || shade(L.skin, 0.6), 1, 4);
      if (!back) {
        const ex = side ? hx + w - 3 : hx + 2;
        dot(g, ex, hy + 3, '#140c10', 2, 2);
        if (!side) dot(g, hx + w - 4, hy + 3, '#140c10', 2, 2);
        if (glow) { dot(g, ex, hy + 3, eyeCol); if (!side) dot(g, hx + w - 3, hy + 3, eyeCol); }
        dot(g, side ? hx + w - 3 : hx + 3, hy + h - 3, '#2a1418', side ? 2 : w - 6, 1);
      }
      if (L.horns) { dot(g, hx, hy - 2, L.horns, 2, 2); dot(g, hx + w - 2, hy - 2, L.horns, 2, 2); }
      break;
    }
    case 'cowl': {
      dot(g, hx + (w >> 1) - 1, hy - 2, L.robe, 2, 2);
      box(g, hx, hy, w, h, L.robe);
      if (!back) {
        const fx = side ? hx + w - 4 : hx + 1, fw = side ? 4 : w - 2;
        dot(g, fx, hy + 3, '#07050a', fw, h - 4);
        if (side) dot(g, hx + w - 2, hy + 4, eyeCol); else { dot(g, hx + 2, hy + 4, eyeCol); dot(g, hx + w - 3, hy + 4, eyeCol); }
        if (L.bigEye) { dot(g, hx + (w >> 1) - 2, hy + 4, L.accent, 4, 3); dot(g, hx + (w >> 1) - 1, hy + 5, '#ffffff', 2, 1); }
      }
      break;
    }
    case 'mushroom': {
      box(g, hx + 2, hy + 3, w - 4, h - 3, L.skin);
      box(g, hx - 2, hy, w + 4, 4, L.cap);
      dot(g, hx - 1, hy + 4, shade(L.cap, 0.6), w + 2, 1);
      dot(g, hx, hy + 1, L.spots || '#fff4d8'); dot(g, hx + w - 2, hy + 2, L.spots || '#fff4d8'); dot(g, hx + 3, hy, L.spots || '#fff4d8');
      if (!back) { if (side) dot(g, hx + w - 3, hy + 5, L.eye); else { dot(g, hx + 3, hy + 5, L.eye); dot(g, hx + w - 4, hy + 5, L.eye); } }
      break;
    }
    case 'bulb': {
      box(g, hx - 1, hy, w + 2, h - 1, L.skin);
      dot(g, hx, hy + 1, L.accent, 2, 1); dot(g, hx + w - 2, hy + 2, L.accent, 1, 2);
      if (!back) {
        const mx = side ? hx + w - 2 : hx + (w >> 1) - 1;
        dot(g, mx, hy + h - 4, '#101408', side ? 2 : 3, 2);
        dot(g, mx, hy + h - 4, L.accent, 1, 1);
        if (side) dot(g, hx + w - 3, hy + 2, L.eye); else { dot(g, hx + 1, hy + 3, L.eye); dot(g, hx + w - 2, hy + 3, L.eye); }
      }
      break;
    }
    case 'crystal': {
      box(g, hx + 1, hy + 2, w - 2, h - 3, L.skin);
      dot(g, hx + 1, hy - 1, L.accent, 1, 3); dot(g, hx + 3, hy - 3, shade(L.accent, 1.2), 2, 5); dot(g, hx + w - 3, hy - 1, L.accent, 1, 3);
      if (!back) { if (side) dot(g, hx + w - 2, hy + 4, L.eye); else { dot(g, hx + 2, hy + 4, L.eye); dot(g, hx + w - 3, hy + 4, L.eye); } }
      break;
    }
    default:
      box(g, hx, hy, w, h, L.skin || '#c0a080');
  }
}

function paintHumanoid(g, L, dir, frame, pose, W, H) {
  const d = L.dims || HUMAN;
  const fx = W >> 1;
  const fy = H - 2;
  const walk = pose === 'walk';
  const f = frame & 3;
  let bob = walk ? (f === 1 || f === 3 ? 1 : 0) : (pose === 'idle' && (frame & 1) ? 1 : 0);
  if (pose === 'windup') bob = 1;
  if (L.float) bob = (frame & 1) ? -1 : 0;
  let lOff = 0, rOff = 0;
  if (walk) { if (f === 1) { lOff = 1; rOff = -1; } else if (f === 3) { lOff = -1; rOff = 1; } }
  const hunch = L.hunch ? 1 : 0;
  const bodyTop = fy - d.bootH - d.legH - d.bodyH + 1 + bob + (L.float ? -2 : 0);
  const headTop = bodyTop - d.headH + 1 + hunch;
  const bw = d.bodyW;
  const side = dir === 2, back = dir === 3;
  const glow = true;
  const armRaise = pose === 'windup' ? -3 : pose === 'strike' ? 1 : 0;
  const robe = L.body === 'robe';

  // lantern behind the body when walking away / to the side
  const drawLantern = (lx, ly) => {
    if (!L.lantern) return;
    dot(g, lx + 1, ly - 1, '#6a4a2a', 1, 1);
    box(g, lx, ly, 3, 4, '#8a6a3a', true);
    dot(g, lx + 1, ly + 1, '#fff2b0', 1, 2);
    dot(g, lx, ly + 1, '#ffc24a', 1, 2);
    dot(g, lx + 2, ly + 1, '#ffb030', 1, 2);
  };
  if (L.lantern && (back || side)) drawLantern(side ? fx - bw / 2 - 2 : fx - bw / 2 - 3, bodyTop + 5);

  // legs
  if (!robe) {
    const legY = fy - d.bootH - d.legH + 1;
    const pants = L.body === 'ribs' ? L.bone : L.pants || '#3a3030';
    const legW = L.body === 'ribs' ? 1 : 2;
    if (side) {
      const s = walk ? (f === 1 ? 2 : f === 3 ? -2 : 0) : 0;
      dot(g, fx - 1 - s, legY, shade(pants, 0.75), legW, d.legH);
      box(g, fx - 2 - s, fy - d.bootH + 1, 3, d.bootH, shade(L.boots || '#2e2420', 0.8), true);
      dot(g, fx + s, legY, pants, legW, d.legH);
      box(g, fx - 1 + s + 1, fy - d.bootH + 1, 3, d.bootH, L.boots || '#2e2420', true);
    } else {
      const lx = fx - 3, rx = fx + 1;
      dot(g, lx + (legW === 1 ? 1 : 0), legY + Math.min(0, lOff), pants, legW, d.legH + Math.max(0, lOff) - Math.min(0, lOff) + (lOff < 0 ? -1 : 0));
      dot(g, rx, legY + Math.min(0, rOff), pants, legW, d.legH + Math.max(0, rOff) - Math.min(0, rOff) + (rOff < 0 ? -1 : 0));
      box(g, lx - 1, fy - d.bootH + 1 + lOff, 3, d.bootH, L.boots || '#2e2420', true);
      box(g, rx, fy - d.bootH + 1 + rOff, 3, d.bootH, L.boots || '#2e2420', true);
    }
  }

  // body
  const bx = fx - (side ? (bw >> 1) - 1 : bw >> 1);
  const sbw = side ? bw - 2 : bw;
  if (L.body === 'ribs') {
    const cx = fx - 1;
    dot(g, cx, bodyTop, L.bone, 2, d.bodyH - 1);
    for (let i = 0; i < 3; i++) dot(g, cx - 3, bodyTop + 1 + i * 2, L.bone, side ? 5 : 8, 1);
    dot(g, cx - 2, bodyTop + d.bodyH - 2, L.bone, 6, 2);
    if (L.cloth) dot(g, cx - 3, bodyTop + d.bodyH - 3, L.cloth, 8, 2);
  } else if (robe) {
    const robeBottom = fy - (L.float ? 3 : 0);
    const rh = robeBottom - bodyTop + 1;
    box(g, bx, bodyTop, sbw, rh - 2, L.robe);
    const sway = (frame & 1) ? 1 : 0;
    dot(g, bx - 1 + sway, bodyTop + rh - 3, L.robe, sbw + 2, 2);
    dot(g, bx - 1 + sway, bodyTop + rh - 2, L.trim || shade(L.robe, 0.6), sbw + 2, 1);
    if (!back && !side) dot(g, fx - 1, bodyTop + 1, L.trim || shade(L.robe, 1.3), 2, rh - 4);
    if (L.sash) dot(g, bx, bodyTop + 4, L.sash, sbw, 1);
  } else {
    const main = L.body === 'armor' ? L.armor : L.body === 'apron' ? L.coat : L.body === 'tunic' ? L.tunic : L.cloak || L.cloth || '#554';
    box(g, bx, bodyTop, sbw, d.bodyH, main);
    if (L.body === 'cloak') {
      dot(g, bx - (side ? 0 : 1), bodyTop + d.bodyH - 3, main, sbw + (side ? 1 : 2), 3);
      dot(g, bx - (side ? 0 : 1), bodyTop + d.bodyH - 1, L.trim, sbw + (side ? 1 : 2), 1);
      if (!back) {
        if (!side) dot(g, fx - 1, bodyTop + 1, L.tunic, 2, d.bodyH - 3);
        else dot(g, bx + sbw - 2, bodyTop + 1, L.tunic, 2, d.bodyH - 3);
        dot(g, side ? bx + 1 : bx + 1, bodyTop + 5, L.belt, side ? sbw - 1 : sbw - 2, 1);
        dot(g, side ? bx + sbw - 2 : fx - 1, bodyTop + 5, L.buckle, side ? 1 : 2, 1);
      } else {
        dot(g, fx - 1, bodyTop + 2, shade(main, 0.8), 2, d.bodyH - 3);
      }
    } else if (L.body === 'armor') {
      dot(g, bx + 1, bodyTop + 2, shade(L.armor, 1.25), sbw - 2, 1);
      dot(g, bx, bodyTop + d.bodyH - 3, L.cape || shade(L.armor, 0.7), sbw, 1);
      if (L.cape && back) box(g, bx, bodyTop + 1, sbw, d.bodyH, L.cape);
      if (L.tabard && !back) dot(g, fx - 2 + (side ? 2 : 0), bodyTop + 3, L.tabard, 4, d.bodyH - 3);
    } else if (L.body === 'apron') {
      if (!back) dot(g, side ? bx + sbw - 3 : fx - 3, bodyTop + 3, L.apron, side ? 3 : 6, d.bodyH - 3);
      dot(g, bx, bodyTop + 3, L.belt || '#5a3a24', sbw, 1);
    } else if (L.body === 'rags') {
      for (let i = 0; i < sbw; i += 2) dot(g, bx + i, bodyTop + d.bodyH, main, 1, 1 + ((i + frame) & 1));
      if (L.accent && !back) dot(g, bx + 2, bodyTop + 2, L.accent, 1, 2);
      dot(g, bx, bodyTop + 4, shade(main, 0.7), sbw, 1);
    } else if (L.body === 'tunic') {
      dot(g, bx, bodyTop + 4, L.belt || '#5a3a24', sbw, 1);
    }
  }

  // arms
  const armCol = L.body === 'ribs' ? L.bone : L.body === 'armor' ? shade(L.armor, 0.9) : robe ? L.robe : L.body === 'cloak' ? L.cloakDark : L.body === 'apron' ? shade(L.coat, 0.85) : shade(L.tunic || L.cloth || '#555', 0.9);
  const handCol = L.body === 'ribs' ? L.bone : L.hand || L.skin || '#c8a080';
  const armLen = (L.longArms ? 7 : 5);
  if (side) {
    const s = walk ? (f === 1 ? -1 : f === 3 ? 1 : 0) : 0;
    const ax = fx - 1 + s + (pose === 'strike' ? 2 : 0);
    dot(g, ax, bodyTop + 1 + armRaise, armCol, 2, armLen);
    dot(g, ax, bodyTop + 1 + armLen + armRaise, handCol, 2, 1);
  } else {
    const la = walk ? (f === 1 ? -1 : f === 3 ? 1 : 0) : 0;
    const lx = fx - (bw >> 1) - 2, rx = fx + (bw >> 1);
    dot(g, lx, bodyTop + 1 + la + armRaise, armCol, 2, armLen);
    dot(g, rx, bodyTop + 1 - la + armRaise, armCol, 2, armLen);
    if (!back) {
      dot(g, lx, bodyTop + 1 + armLen + la + armRaise, handCol, 2, 1);
      dot(g, rx, bodyTop + 1 + armLen - la + armRaise, handCol, 2, 1);
    }
  }

  // held item baked into enemy sprites
  if (L.held && !back) {
    const hx = side ? fx + 2 : fx + (bw >> 1) + 1;
    const hy = bodyTop + armLen + armRaise;
    if (L.held === 'bow') {
      dot(g, hx + 1, hy - 5, L.heldCol, 1, 10);
      dot(g, hx, hy - 6, L.heldCol, 1, 1); dot(g, hx, hy + 5, L.heldCol, 1, 1);
      dot(g, hx - 1, hy - 5, '#d8d0c0', 1, 10);
    } else if (L.held === 'staff') {
      dot(g, hx, hy - 9, '#5a3a24', 1, 14);
      dot(g, hx - 1, hy - 11, L.heldCol, 3, 3);
    } else if (L.held === 'sling') {
      dot(g, hx, hy - 1, L.heldCol, 2, 2);
    } else if (L.held === 'claw') {
      dot(g, hx, hy, L.heldCol, 1, 2); dot(g, hx + 1, hy + 1, L.heldCol, 1, 2);
    }
  }

  paintHead(g, L, dir, fx - (d.headW >> 1) + (side && L.hunch ? 1 : 0), headTop, d, glow);

  if (L.lantern && !back && !side) drawLantern(fx - (bw >> 1) - 4, bodyTop + armLen + (walk ? (f === 1 ? -1 : f === 3 ? 1 : 0) : 0));
}

// ------------------------------------------------------------------ beasts

function paintBeast(g, L, frame, pose, W, H) {
  const fy = H - 2;
  const fx = W >> 1;
  const plan = L.plan;
  const f = frame & 3;
  if (plan === 'bat') {
    const flap = pose === 'windup' ? 0 : (f & 1);
    const by = fy - 9 + (f === 1 ? -1 : 0);
    box(g, fx - 2, by, 5, 5, L.body);
    const wy = flap ? by - 2 : by + 1;
    // wings
    dot(g, fx - 7, wy, L.dark, 5, 2); dot(g, fx - 8, wy + (flap ? -1 : 2), L.dark, 2, 2);
    dot(g, fx + 3, wy, L.dark, 5, 2); dot(g, fx + 7, wy + (flap ? -1 : 2), L.dark, 2, 2);
    dot(g, fx - 6, wy + 2, shade(L.dark, 0.7), 3, 1); dot(g, fx + 4, wy + 2, shade(L.dark, 0.7), 3, 1);
    dot(g, fx - 1, by - 1, L.body); dot(g, fx + 1, by - 1, L.body);
    if (L.horns) { dot(g, fx - 2, by - 2, L.horns); dot(g, fx + 2, by - 2, L.horns); }
    dot(g, fx - 1, by + 1, L.eye); dot(g, fx + 1, by + 1, L.eye);
    if (L.accent) dot(g, fx, by + 3, L.accent);
  } else if (plan === 'panda') {
    const by = fy - 6 + (pose === 'walk' && (f & 1) ? -1 : 0);
    box(g, fx - 4, by, 9, 5, L.body);
    dot(g, fx - 4, by + 4, L.dark, 9, 1);
    // legs
    const s = pose === 'walk' ? (f === 1 ? 1 : f === 3 ? -1 : 0) : 0;
    dot(g, fx - 3 + s, by + 5, L.dark, 2, 2); dot(g, fx + 2 - s, by + 5, L.dark, 2, 2);
    // head
    box(g, fx + 3, by - 4, 6, 5, L.body);
    dot(g, fx + 4, by - 2, '#f4ece0', 4, 2);
    dot(g, fx + 3, by - 5, L.body); dot(g, fx + 8, by - 5, L.body);
    dot(g, fx + 4, by - 2, L.eye); dot(g, fx + 7, by - 2, L.eye);
    dot(g, fx + 6, by - 1, '#1a1010');
    // ringed tail
    for (let i = 0; i < 5; i++) dot(g, fx - 5 - i, by - 1 + Math.round(Math.sin(i * 0.7 + frame * 0.8)), i % 2 ? L.body : '#6a2a14', 1, 2);
  } else {
    // spider / skitter
    const by = fy - 6 + (pose === 'windup' ? 1 : 0);
    box(g, fx - 3, by, 7, 4, L.body);
    box(g, fx + 2, by - 1, 4, 4, L.dark);
    const legPhase = pose === 'walk' ? f : 0;
    for (let i = 0; i < 3; i++) {
      const lo = ((i + legPhase) & 1) ? 1 : 0;
      dot(g, fx - 3 + i * 3, by + 4, L.dark, 1, 2 + lo);
      dot(g, fx - 4 + i * 3, by + 5 + lo, L.dark, 1, 1);
      dot(g, fx - 2 + i * 3, by - 1, L.dark, 1, 1);
    }
    dot(g, fx + 4, by, L.eye); dot(g, fx + 5, by + 1, L.eye);
    if (L.accent) { dot(g, fx - 2, by + 1, L.accent, 2, 1); dot(g, fx, by, L.accent); }
    if (L.crystal) { dot(g, fx - 1, by - 3, L.accent, 1, 3); dot(g, fx + 1, by - 2, shade(L.accent, 1.2), 1, 2); }
  }
}

// ------------------------------------------------------------------ blobs (bloaters, Mother Mycelia)

function paintBlob(g, L, frame, pose, W, H, big) {
  const fy = H - 2, fx = W >> 1;
  const swell = pose === 'windup' ? 1 + (frame & 1) : 0;
  const rw = (big ? 12 : 6) + swell, rh = (big ? 11 : 6) + swell;
  const cy = fy - rh - 2 + ((frame & 1) && pose !== 'windup' ? 1 : 0);
  for (let y = -rh; y <= rh; y++) {
    const span = Math.round(rw * Math.sqrt(Math.max(0, 1 - (y * y) / (rh * rh))));
    const col = y < -rh * 0.4 ? shade(L.body, 1.15) : y > rh * 0.5 ? L.dark : L.body;
    dot(g, fx - span, cy + y, col, span * 2 + 1, 1);
  }
  dot(g, fx - (rw >> 1), cy - rh + 2, shade(L.body, 1.4), 2, 1);
  // pustules / cracks
  const n = big ? 7 : 3;
  for (let i = 0; i < n; i++) {
    const a = i * 2.3 + 0.5, r = (i % 2 ? 0.55 : 0.3);
    dot(g, Math.round(fx + Math.cos(a) * rw * r), Math.round(cy + Math.sin(a) * rh * r), L.accent, big ? 2 : 1, big ? 2 : 1);
  }
  // legs
  if (!big) { dot(g, fx - 3, fy - 1, L.dark, 2, 2); dot(g, fx + 2, fy - 1, L.dark, 2, 2); }
  // face
  dot(g, fx - 2, cy - 1, L.eye); dot(g, fx + 2, cy - 1, L.eye);
  dot(g, fx - 1, cy + 2, '#1a0c10', 3, 1);
  if (L.cap) {
    const capW = rw + 3;
    for (let y = 0; y < (big ? 7 : 4); y++) {
      const span = Math.round(capW * Math.sqrt(1 - Math.pow((y - (big ? 7 : 4)) / (big ? 7 : 4), 2)));
      dot(g, fx - span, cy - rh - (big ? 5 : 3) + y, y < 2 ? shade(L.cap, 1.2) : L.cap, span * 2 + 1, 1);
    }
    for (let i = 0; i < (big ? 6 : 3); i++) dot(g, fx - capW + 3 + i * (big ? 4 : 3), cy - rh - (big ? 3 : 1) + (i % 2), '#fff0f4', 1, 1);
  }
  if (L.spikes) {
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI * (0.15 + i * 0.175);
      dot(g, Math.round(fx + Math.cos(a) * (rw + 1)), Math.round(cy + Math.sin(a) * (rh + 1)), L.accent, 1, 2);
    }
  }
  if (big) {
    // tendrils
    for (let i = 0; i < 6; i++) {
      const tx = fx - rw + 2 + i * 4;
      const wav = Math.round(Math.sin(frame * 1.3 + i) * 1);
      dot(g, tx + wav, fy - 3, L.dark, 2, 4);
    }
  }
}

// ------------------------------------------------------------------ hulks (brutes, Cinder Colossus)

function paintHulk(g, L, dir, frame, pose, W, H, big) {
  const fy = H - 2, fx = W >> 1;
  const s = big ? 1.6 : 1;
  const walk = pose === 'walk';
  const f = frame & 3;
  const bob = walk && (f & 1) ? 1 : 0;
  const raise = pose === 'windup' ? -4 : pose === 'strike' ? 2 : 0;
  const bw = Math.round(16 * s), bh = Math.round(12 * s);
  const top = fy - Math.round(5 * s) - bh + bob;
  const back = dir === 3;
  // legs
  const lw = Math.round(4 * s), lh = Math.round(5 * s);
  const lo = walk ? (f === 1 ? 1 : f === 3 ? -1 : 0) : 0;
  box(g, fx - Math.round(6 * s), fy - lh + 1 + Math.max(0, lo), lw, lh - Math.max(0, lo), L.dark);
  box(g, fx + Math.round(2 * s), fy - lh + 1 + Math.max(0, -lo), lw, lh - Math.max(0, -lo), L.dark);
  // torso
  box(g, fx - (bw >> 1), top, bw, bh, L.body);
  dot(g, fx - (bw >> 1) + 2, top + bh - 3, shade(L.body, 0.75), bw - 4, 2);
  // shoulders + arms
  const aw = Math.round(5 * s), ah = Math.round(11 * s);
  box(g, fx - (bw >> 1) - aw + 2, top + 1 + raise, aw, ah, shade(L.body, 0.9));
  box(g, fx + (bw >> 1) - 2, top + 1 + raise, aw, ah, shade(L.body, 0.9));
  box(g, fx - (bw >> 1) - aw + 1, top + ah + raise, aw + 1, Math.round(3 * s), L.dark);
  box(g, fx + (bw >> 1) - 2, top + ah + raise, aw + 1, Math.round(3 * s), L.dark);
  // head
  const hw = Math.round(6 * s), hh = Math.round(5 * s);
  box(g, fx - (hw >> 1), top - hh + 2, hw, hh, shade(L.body, 1.05));
  if (!back) {
    dot(g, fx - (hw >> 1) + 1, top - hh + 4, L.eye, Math.max(1, Math.round(s)), 1);
    dot(g, fx + (hw >> 1) - 1 - Math.max(1, Math.round(s)), top - hh + 4, L.eye, Math.max(1, Math.round(s)), 1);
  }
  // features
  if (L.feature === 'armor') {
    dot(g, fx - (bw >> 1) - aw + 2, top, '#b0b4c0', aw, 2); dot(g, fx + (bw >> 1) - 2, top, '#b0b4c0', aw, 2);
    dot(g, fx - (hw >> 1), top - hh + 1, '#8a8e9a', hw, 2);
    if (!back) dot(g, fx - 2, top + 3, L.accent, 4, 4);
  } else if (L.feature === 'moss') {
    for (let i = 0; i < bw; i += 2) dot(g, fx - (bw >> 1) + i, top - 1 - ((i >> 1) & 1), L.accent, 2, 2);
    dot(g, fx - 3, top + 4, shade(L.accent, 0.8), 3, 2);
  } else if (L.feature === 'core') {
    if (!back) { dot(g, fx - 2, top + 3, L.accent, 4, 4); dot(g, fx - 1, top + 4, '#fff0a0', 2, 2); }
    dot(g, fx - (bw >> 1) + 2, top + 2, L.accent, 1, 3); dot(g, fx + (bw >> 1) - 3, top + 5, L.accent, 1, 3);
    dot(g, fx - 5, top + bh - 4, L.accent, 3, 1);
  } else if (L.feature === 'crystal') {
    dot(g, fx - (bw >> 1) - aw + 3, top - 4 + raise, L.accent, 2, 5); dot(g, fx - (bw >> 1) - aw + 5, top - 2 + raise, shade(L.accent, 1.3), 1, 3);
    dot(g, fx + (bw >> 1) + 1, top - 4 + raise, L.accent, 2, 5); dot(g, fx + (bw >> 1) - 1, top - 2 + raise, shade(L.accent, 1.3), 1, 3);
    if (!back) dot(g, fx - 1, top + 3, L.accent, 2, 3);
  }
}

// ------------------------------------------------------------------ wisps (Lumen Wisp)

function paintWisp(g, L, frame, W, H) {
  const fx = W >> 1, cy = H - 14 + ((frame & 1) ? -1 : 0);
  for (let i = 0; i < 6; i++) dot(g, fx - 1 + Math.round(Math.sin(frame * 0.9 + i) * 1), cy + 3 + i, i < 3 ? L.body : L.dark, 2 - (i > 3 ? 1 : 0), 1);
  box(g, fx - 4, cy - 4, 8, 8, L.body);
  dot(g, fx - 3, cy - 3, L.accent, 6, 6);
  dot(g, fx - 2, cy - 2, '#ffffff', 4, 3);
  dot(g, fx - 2, cy, L.eye); dot(g, fx + 1, cy, L.eye);
}

// ------------------------------------------------------------------ looks

export function playerLook(trim = '#c9a45a', helm = null) {
  return {
    key: `player|${trim}|${helm || ''}`,
    plan: 'human', head: helm ? 'helm' : 'hood', helm, plume: helm ? trim : null, body: 'cloak',
    skin: '#e2b48c', hood: '#3d5a80', hoodDark: '#243852', cloak: '#3d5a80', cloakDark: '#2b4262',
    trim, tunic: '#8a5a3a', pants: '#4a3a30', boots: '#2e2420', belt: '#5a3a24', buckle: '#e8c35a',
    eye: '#1a1420', lantern: true,
  };
}

export const NPC_LOOKS = {
  warden: { key: 'warden', plan: 'human', head: 'hair', hair: '#cfd0d8', body: 'armor', armor: '#7c8598', cape: '#8a2a2a', tabard: '#8a2a2a', skin: '#d8a888', pants: '#3a3440', boots: '#2a2228', eye: '#1a1420' },
  merchant: { key: 'merchant', plan: 'human', head: 'hat', hat: '#5a3a24', hatBand: '#c9a45a', feather: '#d04a3a', beard: '#9a7a5a', body: 'apron', coat: '#3f6b4a', apron: '#d8cbb0', belt: '#4a2a1a', skin: '#e0b090', pants: '#3a3030', boots: '#2e2420', eye: '#1a1420' },
  villagerA: { key: 'villagerA', plan: 'human', head: 'hair', hair: '#9a4a2a', bun: true, body: 'tunic', tunic: '#8a6a9a', belt: '#e0d8c0', skin: '#e8b898', pants: '#6a5a7a', boots: '#3a2a22', eye: '#1a1420' },
  villagerB: { key: 'villagerB', plan: 'human', head: 'hair', hair: '#b8b8b8', beard: '#d8d8d8', body: 'tunic', tunic: '#6a5a3a', belt: '#3a2a1a', skin: '#d8a888', pants: '#4a4038', boots: '#2e2420', eye: '#1a1420' },
  child: { key: 'child', plan: 'human', dims: CHILD, head: 'hair', hair: '#e8c86a', body: 'tunic', tunic: '#4a7a9a', belt: '#5a3a24', skin: '#f0c0a0', pants: '#5a4a3a', boots: '#3a2a22', eye: '#1a1420' },
  redpanda: { key: 'redpanda', plan: 'panda', body: '#c8582a', dark: '#3a1a10', eye: '#1a1010' },
};

/** Look for an enemy archetype in a biome skin. */
export function enemyLook(arch, skinId, pal) {
  const k = `${arch}|${skinId}`;
  const base = { key: k, body: pal.body, dark: pal.dark, accent: pal.accent, eye: pal.eye };
  switch (arch) {
    case 'grunt': {
      const head = { crypt: 'hollow', fungal: 'mushroom', ember: 'helm', void: 'crystal' }[skinId];
      return { ...base, plan: 'human', head, body: 'rags', cloth: pal.dark, skin: pal.body, cap: pal.accent, helm: pal.dark, hunch: true, longArms: true, pants: pal.dark, boots: shade(pal.dark, 0.7), hand: pal.body, held: 'claw', heldCol: pal.accent };
    }
    case 'archer': {
      const cfg = {
        crypt: { head: 'skull', body: 'ribs', bone: pal.body, cloth: '#5a2a2a', held: 'bow', heldCol: pal.accent },
        fungal: { head: 'bulb', body: 'rags', skin: pal.body, cloth: pal.dark, held: null },
        ember: { head: 'hollow', body: 'rags', skin: pal.body, cloth: pal.dark, horns: pal.accent, held: 'sling', heldCol: pal.accent },
        void: { head: 'crystal', body: 'robe', skin: pal.body, robe: pal.dark, trim: pal.accent, held: 'staff', heldCol: pal.accent },
      }[skinId];
      return { ...base, plan: 'human', pants: pal.dark, boots: shade(pal.dark, 0.7), hand: pal.body, ...cfg };
    }
    case 'caster':
      if (skinId === 'fungal') return { ...base, plan: 'wisp' };
      return { ...base, plan: 'human', head: 'cowl', body: 'robe', robe: pal.body, trim: pal.accent, sash: pal.accent, float: skinId === 'void', held: 'staff', heldCol: pal.accent, hand: shade(pal.body, 0.8) };
    case 'skitter':
      return { ...base, plan: skinId === 'crypt' || skinId === 'ember' ? 'bat' : 'spider', horns: skinId === 'ember' ? pal.accent : null, crystal: skinId === 'void' };
    case 'bloater':
      return { ...base, plan: 'blob', cap: skinId === 'fungal' ? pal.accent : null, spikes: skinId === 'void' };
    case 'brute':
      return { ...base, plan: 'hulk', feature: { crypt: 'armor', fungal: 'moss', ember: 'core', void: 'crystal' }[skinId] };
    default:
      return { ...base, plan: 'blob' };
  }
}

export function bossLook(id, def) {
  return { key: `boss|${id}`, plan: 'boss', bossId: id, body: def.body, dark: def.dark, accent: def.accent, eye: def.eye, cap: '#c05a9a', big: true };
}

function spriteSize(L) {
  const big = !!L.big;
  switch (L.plan) {
    case 'human': return big ? [44, 52] : L.dims === CHILD ? [22, 26] : [26, 34];
    case 'bat': case 'spider': case 'panda': return [22, 20];
    case 'blob': return big ? [44, 44] : [22, 26];
    case 'hulk': return big ? [56, 56] : [34, 34];
    case 'wisp': return [20, 26];
    case 'boss': return BOSS_SIZE[L.bossId] || [60, 60];
    default: return [24, 32];
  }
}

/**
 * Get a sprite frame. dir: 0 down, 1 left, 2 right, 3 up. pose: idle|walk|windup|strike.
 * Returns { c, flash, ax, ay } where (ax, ay) is the feet anchor inside the canvas.
 */
export function getSprite(L, dir, frame, pose) {
  const fourDir = L.plan === 'human' || L.plan === 'hulk';
  const d = fourDir ? dir : (dir === 1 ? 1 : 2);
  const fr = pose === 'walk' ? frame & 3 : pose === 'idle' ? frame & 1 : 0;
  const key = `${L.key}|${d}|${fr}|${pose}`;
  let s = cache.get(key);
  if (s) return s;
  const [W, H] = spriteSize(L);
  if (d === 1) {
    const right = getSprite(L, 2, frame, pose);
    s = { c: mirror(right.c), flash: mirror(right.flash), ax: W - right.ax, ay: right.ay, w: W, h: H };
    cache.set(key, s);
    return s;
  }
  const [c, g] = makeCanvas(W, H);
  switch (L.plan) {
    case 'human': paintHumanoid(g, L, d, fr, pose, W, H); break;
    case 'bat': case 'spider': case 'panda': paintBeast(g, L, fr, pose, W, H); break;
    case 'blob': paintBlob(g, L, fr, pose, W, H, !!L.big); break;
    case 'hulk': paintHulk(g, L, d, fr, pose, W, H, !!L.big); break;
    case 'wisp': paintWisp(g, L, fr, W, H); break;
    case 'boss': paintBoss(g, L, fr, pose, W, H); break;
    default: paintBlob(g, L, fr, pose, W, H, false);
  }
  outline(c);
  s = { c, flash: silhouette(c), ax: W >> 1, ay: H - 2, w: W, h: H };
  cache.set(key, s);
  return s;
}

// ------------------------------------------------------------------ weapons (drawn rotated at runtime)

const METALS = [
  ['#8a5a3a', '#b07a4a'], // rusty
  ['#8a8e96', '#c8ccd4'], // iron
  ['#9aa6b8', '#e4ecf8'], // steel
  ['#4a4e5e', '#8a90a8'], // darksteel
  ['#5a7ab0', '#a8d0ff'], // runic
  ['#3a2a4a', '#9a6aca'], // obsidian
  ['#d8b04a', '#fff0a0'], // starforged
];

/** Weapon sprite pointing right, grip at (gx, gy). */
export function weaponSprite(base, tier = 0, glowColor = null) {
  const key = `w|${base}|${tier}|${glowColor || ''}`;
  let s = cache.get(key);
  if (s) return s;
  const [m, hi] = METALS[Math.min(METALS.length - 1, tier)];
  const grip = '#4a2e1c';
  let c, g, gx, gy;
  switch (base) {
    case 'axe':
      [c, g] = makeCanvas(18, 12); gx = 2; gy = 6;
      dot(g, 0, 5, grip, 14, 2);
      box(g, 11, 1, 5, 9, m); dot(g, 15, 1, hi, 1, 9); dot(g, 10, 3, m, 1, 5);
      break;
    case 'dagger':
      [c, g] = makeCanvas(13, 6); gx = 2; gy = 3;
      dot(g, 0, 2, grip, 4, 2); dot(g, 4, 1, '#c9a45a', 1, 4);
      dot(g, 5, 2, m, 7, 2); dot(g, 5, 2, hi, 7, 1); dot(g, 12, 3, hi, 1, 1);
      break;
    case 'mace':
      [c, g] = makeCanvas(17, 10); gx = 2; gy = 5;
      dot(g, 0, 4, grip, 11, 2);
      box(g, 10, 1, 6, 8, m); dot(g, 11, 0, hi, 1, 1); dot(g, 14, 0, hi, 1, 1); dot(g, 16, 3, hi, 1, 1); dot(g, 16, 6, hi, 1, 1); dot(g, 11, 9, hi, 1, 1); dot(g, 14, 9, hi, 1, 1);
      break;
    case 'spear':
      [c, g] = makeCanvas(30, 6); gx = 6; gy = 3;
      dot(g, 0, 2, grip, 23, 2);
      dot(g, 23, 1, m, 5, 4); dot(g, 28, 2, hi, 2, 2); dot(g, 23, 1, hi, 5, 1);
      break;
    case 'fists':
      [c, g] = makeCanvas(6, 6); gx = 1; gy = 3;
      dot(g, 1, 1, '#e2b48c', 4, 4);
      break;
    default: // sword
      [c, g] = makeCanvas(21, 7); gx = 2; gy = 3;
      dot(g, 0, 2, grip, 4, 2); dot(g, 4, 0, '#c9a45a', 1, 7);
      dot(g, 5, 2, m, 14, 3); dot(g, 5, 2, hi, 14, 1); dot(g, 19, 3, hi, 1, 1);
  }
  if (glowColor) { dot(g, c.width - 3, gy - 1, glowColor, 1, 1); }
  outline(c);
  s = { c, gx, gy };
  cache.set(key, s);
  return s;
}

export function metalColors(tier) {
  return METALS[Math.min(METALS.length - 1, Math.max(0, tier))];
}

export { makeCanvas, box, dot, outline, silhouette };

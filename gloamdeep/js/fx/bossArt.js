// Hand-tuned procedural pixel art for the four guardians (larger and more detailed than
// regular monsters). Emissive highlights (soul flames, furnace cores, eyes) are added at runtime
// by Boss.drawEmissive so they glow through the darkness.

import { shade } from '../core/math.js';
import { box, dot, ellipseFill as ellipse } from './pixel.js';

export const BOSS_SIZE = { ossuary: [58, 62], mycelia: [64, 60], colossus: [64, 62], seer: [56, 62] };

/** Emissive anchor points relative to the feet (used by Boss.drawEmissive). */
export const BOSS_GLOW = {
  ossuary: { eyes: [[-3, -45], [3, -45]], core: [0, -30], coreR: 7, eye: '#7affb0' },
  mycelia: { eyes: [[-4, -20], [4, -20]], core: [0, -32], coreR: 14, eye: '#62ffd8' },
  colossus: { eyes: [[-3, -48], [3, -48]], core: [0, -32], coreR: 9, eye: '#ffd24a' },
  seer: { eyes: [[0, -48]], core: [0, -30], coreR: 6, eye: '#ff4af0' },
};

function paintOssuary(g, L, frame, pose, W, H) {
  const cx = W >> 1, fy = H - 2;
  const walk = pose === 'walk', f = frame & 3;
  const bob = walk && (f & 1) ? 1 : 0;
  const raise = pose === 'windup';
  const bone = L.body, boneD = shade(L.body, 0.72);
  const steel = '#6a6458', steelD = '#48443c', steelH = '#9a9486';
  const cape = '#3a1818';
  const top = 8 + bob;
  // cape behind
  box(g, cx - 14, top + 16, 28, 34, cape);
  for (let x = cx - 14; x < cx + 14; x += 3) dot(g, x, top + 50 + ((x + frame) % 2), cape, 2, 2 + ((x * 7) % 3));
  // legs
  const lo = walk ? (f === 1 ? 2 : f === 3 ? -2 : 0) : 0;
  box(g, cx - 8, fy - 12 + Math.max(0, lo), 6, 12 - Math.max(0, lo), steelD);
  box(g, cx + 2, fy - 12 + Math.max(0, -lo), 6, 12 - Math.max(0, -lo), steelD);
  dot(g, cx - 9, fy - 1, steel, 8, 2); dot(g, cx + 1, fy - 1, steel, 8, 2);
  dot(g, cx - 7, fy - 9, steelH, 4, 1); dot(g, cx + 3, fy - 9, steelH, 4, 1);
  // tassets
  box(g, cx - 11, top + 32, 22, 7, steelD);
  for (let x = cx - 10; x < cx + 10; x += 4) dot(g, x, top + 33, steel, 3, 5);
  // breastplate with broken centre showing ribs
  box(g, cx - 12, top + 14, 24, 19, steel);
  dot(g, cx - 11, top + 15, steelH, 22, 1);
  dot(g, cx - 4, top + 18, '#141012', 8, 12);
  for (let i = 0; i < 4; i++) dot(g, cx - 4, top + 19 + i * 3, bone, 8, 1);
  dot(g, cx - 1, top + 18, boneD, 2, 12);
  // pauldrons
  for (const s of [-1, 1]) {
    const px = s < 0 ? cx - 20 : cx + 11;
    box(g, px, top + 12, 9, 8, steel);
    dot(g, px + (s < 0 ? 0 : 6), top + 9, steelH, 3, 3);
    dot(g, px + (s < 0 ? 1 : 7), top + 7, steelH, 1, 2);
  }
  // arms (bone forearms)
  const armY = raise ? top + 2 : top + 20;
  dot(g, cx - 19, armY, bone, 3, raise ? 12 : 12); dot(g, cx + 16, armY, bone, 3, raise ? 12 : 12);
  // greatsword
  if (raise) {
    box(g, cx - 24, top - 2, 48, 4, '#c8ccd8'); dot(g, cx - 24, top - 2, '#ffffff', 48, 1);
    dot(g, cx - 3, top - 5, '#8a7a4a', 6, 10); dot(g, cx - 1, top - 8, '#5a3a24', 2, 4);
  } else {
    box(g, cx + 19, top - 2, 4, 44, '#c8ccd8'); dot(g, cx + 19, top - 2, '#ffffff', 1, 44);
    dot(g, cx + 15, top + 26, '#8a7a4a', 12, 3); dot(g, cx + 20, top + 29, '#5a3a24', 2, 7);
    dot(g, cx + 17, top + 31, bone, 6, 3);
  }
  // skull + horned helm
  box(g, cx - 6, top + 2, 12, 11, bone);
  dot(g, cx - 5, top + 12, bone, 10, 3);
  dot(g, cx - 4, top + 5, '#140c10', 3, 3); dot(g, cx + 1, top + 5, '#140c10', 3, 3);
  dot(g, cx - 3, top + 12, '#140c10', 1, 2); dot(g, cx - 1, top + 12, '#140c10', 1, 2); dot(g, cx + 1, top + 12, '#140c10', 1, 2);
  box(g, cx - 7, top, 14, 4, steelD); dot(g, cx - 7, top, steelH, 14, 1);
  for (const s of [-1, 1]) {
    const hx = cx + s * 8;
    dot(g, hx - (s < 0 ? 1 : 0), top - 1, '#3a3228', 2, 3);
    dot(g, hx + s * 2 - (s < 0 ? 1 : 0), top - 4, '#4a4034', 2, 3);
    dot(g, hx + s * 3 - (s < 0 ? 1 : 0), top - 7, '#5a5040', 1, 3);
  }
}

function paintMycelia(g, L, frame, pose, W, H) {
  const cx = W >> 1, fy = H - 2;
  const puff = pose === 'windup' ? 1 : 0;
  const bob = frame & 1;
  // roots
  for (let i = 0; i < 9; i++) {
    const rx = cx - 22 + i * 5 + ((i * 3) % 2);
    const wav = Math.round(Math.sin(frame * 1.2 + i) * 1);
    dot(g, rx + wav, fy - 5, i & 1 ? '#6a2a4a' : '#8a4a66', 2, 5);
    dot(g, rx + wav + (i < 4 ? -1 : 1), fy - 1, '#5a2040', 3, 2);
  }
  // pale trunk
  box(g, cx - 10, fy - 30, 20, 26, '#d8c8b8');
  dot(g, cx - 10, fy - 30, '#f0e4d4', 3, 26);
  dot(g, cx + 7, fy - 30, '#a89888', 3, 26);
  for (let y = fy - 26; y < fy - 5; y += 5) dot(g, cx - 6 + ((y * 3) % 8), y, '#b8a898', 3, 1);
  // tendril arms
  for (const s of [-1, 1]) {
    for (let i = 0; i < 9; i++) dot(g, cx + s * (10 + i), fy - 24 + Math.round(i * 0.9) + Math.round(Math.sin(frame + i * 0.6)), '#c8b0a8', 2, 2);
  }
  // face
  dot(g, cx - 6, fy - 21, '#1a0c14', 4, 3); dot(g, cx + 2, fy - 21, '#1a0c14', 4, 3);
  dot(g, cx - 3, fy - 13, '#3a1024', 6, 2);
  // cap
  const capY = 18 - bob - puff;
  ellipse(g, cx, capY, 30 + puff, 15 + puff, shade(L.cap, 0.8));
  ellipse(g, cx, capY - 1, 29 + puff, 13 + puff, L.cap);
  ellipse(g, cx - 5, capY - 6, 18, 6, shade(L.cap, 1.18));
  // gills under the rim
  dot(g, cx - 27, capY + 10, '#3a1a2e', 54, 4);
  for (let x = cx - 26; x < cx + 26; x += 3) dot(g, x, capY + 10, '#6a3a52', 1, 4);
  // spots
  for (const [ox, oy, r] of [[-16, -5, 3], [4, -9, 2], [14, -3, 3], [-6, 2, 2], [22, 4, 2], [-22, 5, 2]]) ellipse(g, cx + ox, capY + oy, r, r - 1 || 1, '#ffe8f0');
  // spore sacs
  for (const ox of [-12, 0, 12]) { ellipse(g, cx + ox, capY - 11, 3, 2, '#2f8f7f'); dot(g, cx + ox - 1, capY - 12, '#8affe0', 2, 1); }
}

function paintColossus(g, L, frame, pose, W, H) {
  const cx = W >> 1, fy = H - 2;
  const walk = pose === 'walk', f = frame & 3;
  const bob = walk && (f & 1) ? 1 : 0;
  const raise = pose === 'windup';
  const stone = L.body, stoneD = L.dark, iron = '#3a3638', ironH = '#6a6468';
  const top = 12 + bob;
  // legs
  const lo = walk ? (f === 1 ? 2 : f === 3 ? -2 : 0) : 0;
  box(g, cx - 15, fy - 14 + Math.max(0, lo), 10, 14 - Math.max(0, lo), stoneD);
  box(g, cx + 5, fy - 14 + Math.max(0, -lo), 10, 14 - Math.max(0, -lo), stoneD);
  dot(g, cx - 13, fy - 10, L.accent, 1, 4); dot(g, cx + 9, fy - 8, L.accent, 1, 3);
  // torso
  box(g, cx - 20, top + 6, 40, 30, stone);
  dot(g, cx - 19, top + 7, shade(stone, 1.3), 38, 1);
  box(g, cx - 20, top + 16, 40, 3, iron); dot(g, cx - 20, top + 16, ironH, 40, 1);
  box(g, cx - 20, top + 30, 40, 4, iron); dot(g, cx - 20, top + 30, ironH, 40, 1);
  for (let x = cx - 18; x < cx + 18; x += 6) dot(g, x, top + 17, '#8a8488', 1, 1);
  // furnace core
  box(g, cx - 7, top + 19, 14, 11, '#2a1a14');
  dot(g, cx - 6, top + 20, '#ff7a1f', 12, 9);
  dot(g, cx - 4, top + 22, '#ffd24a', 8, 5);
  for (let x = cx - 6; x < cx + 6; x += 3) dot(g, x, top + 19, iron, 1, 11);
  // lava cracks
  for (const [x0, y0, len, dx] of [[-16, 9, 6, 1], [12, 8, 5, -1], [-12, 34, 4, 1], [15, 25, 4, -1]]) {
    for (let i = 0; i < len; i++) dot(g, cx + x0 + i * dx, top + y0 + i, L.accent);
  }
  // shoulder vents
  for (const s of [-1, 1]) {
    const vx = s < 0 ? cx - 25 : cx + 18;
    box(g, vx, top, 7, 12, iron); dot(g, vx + 1, top - 3, '#4a4448', 5, 3); dot(g, vx + 2, top - 3, '#1a1010', 3, 2);
  }
  // arms and fists
  for (const s of [-1, 1]) {
    const ax = s < 0 ? cx - 30 : cx + 21;
    const ay = raise ? top - 10 : top + 12;
    box(g, ax, ay, 9, 16, shade(stone, 0.9));
    box(g, ax - 1, ay + (raise ? -8 : 16), 11, 10, stoneD);
    dot(g, ax, ay + (raise ? -8 : 16), shade(stoneD, 1.3), 11, 1);
    dot(g, ax + 2, ay + (raise ? -6 : 19), L.accent, 1, 2);
  }
  // head with furnace grill face
  box(g, cx - 6, top - 4, 12, 11, stone);
  dot(g, cx - 5, top - 4, shade(stone, 1.3), 10, 1);
  dot(g, cx - 5, top, '#1a0c08', 10, 5);
  dot(g, cx - 4, top + 1, '#ffb02e', 8, 1); dot(g, cx - 4, top + 3, '#ff7a1f', 8, 1);
}

function paintSeer(g, L, frame, pose, W, H) {
  const cx = W >> 1, fy = H - 2;
  const raise = pose === 'windup';
  const hover = (frame & 1) ? -1 : 0;
  const robe = L.body, robeD = L.dark, trim = L.accent;
  const top = 4 + hover;
  // wispy robe tail
  for (let i = 0; i < 7; i++) {
    const x = cx - 10 + i * 3;
    const len = 4 + ((i * 5 + frame) % 4);
    dot(g, x + Math.round(Math.sin(frame + i)), fy - 12 + hover, robeD, 2, len);
  }
  // robe body
  box(g, cx - 11, top + 20, 22, 30, robe);
  dot(g, cx - 12, top + 40, robe, 24, 8);
  dot(g, cx - 1, top + 21, trim, 2, 28);
  dot(g, cx - 11, top + 30, trim, 22, 1);
  dot(g, cx - 12, top + 47, trim, 24, 1);
  // sleeves spread
  for (const s of [-1, 1]) {
    const sx = s < 0 ? cx - 22 : cx + 11;
    const sy = raise ? top + 12 : top + 22;
    box(g, sx, sy, 11, 8, robeD);
    dot(g, sx + (s < 0 ? 0 : 8), sy + 7, trim, 3, 1);
    dot(g, sx + (s < 0 ? -2 : 11), sy + 3, '#d8b8ff', 2, 3);
  }
  // hood
  dot(g, cx - 2, top - 2, robe, 4, 3);
  box(g, cx - 10, top + 1, 20, 21, robe);
  dot(g, cx - 10, top + 1, shade(robe, 1.3), 20, 1);
  dot(g, cx - 7, top + 6, '#07040c', 14, 14);
  // the eye
  ellipse(g, cx, top + 13, 5, 3 + (raise ? 1 : 0), '#f0e8ff');
  ellipse(g, cx, top + 13, 3, 2 + (raise ? 1 : 0), L.eye);
  dot(g, cx - 1, top + 12, '#140414', 2, 2 + (raise ? 1 : 0));
  dot(g, cx - 3, top + 11, '#ffffff', 1, 1);
  // shoulder crystals
  dot(g, cx - 12, top + 16, trim, 2, 5); dot(g, cx + 10, top + 16, trim, 2, 5);
  dot(g, cx - 13, top + 13, '#e0c8ff', 1, 3); dot(g, cx + 12, top + 13, '#e0c8ff', 1, 3);
}

export function paintBoss(g, L, frame, pose, W, H) {
  switch (L.bossId) {
    case 'ossuary': paintOssuary(g, L, frame, pose, W, H); break;
    case 'mycelia': paintMycelia(g, L, frame, pose, W, H); break;
    case 'colossus': paintColossus(g, L, frame, pose, W, H); break;
    default: paintSeer(g, L, frame, pose, W, H);
  }
}

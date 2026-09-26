// Pooled particle system (struct of arrays, hard cap). Particles live on the ground plane (x, y)
// with a height axis z: blood and debris arc through the air, land, and are painted into the
// ground as permanent decals. Glowing particles are drawn additively into the emissive layer.

import { MAX_PARTICLES } from '../config.js';

export const P = {
  SPARK: 0, EMBER: 1, BLOOD: 2, DEBRIS: 3, DUST: 4, SMOKE: 5, MAGIC: 6, FIRE: 7, SHARD: 8, GLINT: 9, DRIP: 10,
};

const GLOWS = new Uint8Array([1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0]);

export class Particles {
  constructor(max = MAX_PARTICLES) {
    this.max = max;
    const f = () => new Float32Array(max);
    this.x = f(); this.y = f(); this.z = f();
    this.vx = f(); this.vy = f(); this.vz = f();
    this.life = f(); this.maxLife = f(); this.size = f(); this.drag = f(); this.grav = f();
    this.type = new Uint8Array(max);
    this.color = new Array(max).fill('#fff');
    this.alive = new Uint8Array(max);
    this.free = [];
    for (let i = max - 1; i >= 0; i--) this.free.push(i);
    this.count = 0;
    this.decalSink = null; // (x, y, color, w, h, alpha) => void
    this.quality = 1;
  }

  clear() {
    this.alive.fill(0);
    this.free.length = 0;
    for (let i = this.max - 1; i >= 0; i--) this.free.push(i);
    this.count = 0;
  }

  spawn(type, x, y, z, vx, vy, vz, life, size, color, drag = 0, grav = 0) {
    const i = this.free.pop();
    if (i === undefined) return -1;
    this.alive[i] = 1;
    this.type[i] = type;
    this.x[i] = x; this.y[i] = y; this.z[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.size[i] = size;
    this.color[i] = color;
    this.drag[i] = drag;
    this.grav[i] = grav;
    this.count++;
    return i;
  }

  /** Radial / cone burst helper. */
  burst(type, x, y, n, opts = {}) {
    n = Math.max(1, Math.round(n * this.quality));
    const {
      speed = 60, spread = Math.PI * 2, angle = 0, z = 4, vz = 0, vzRand = 0, life = 0.6, lifeRand = 0.4,
      size = 1, colors = ['#ffffff'], drag = 2, grav = 0, jitter = 1,
    } = opts;
    for (let k = 0; k < n; k++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const s = speed * (0.35 + Math.random() * 0.75);
      this.spawn(
        type,
        x + (Math.random() - 0.5) * jitter * 2, y + (Math.random() - 0.5) * jitter * 2, z + Math.random() * 2,
        Math.cos(a) * s, Math.sin(a) * s * 0.85, vz + Math.random() * vzRand,
        life * (1 - lifeRand / 2 + Math.random() * lifeRand), size,
        colors[(Math.random() * colors.length) | 0], drag, grav,
      );
    }
  }

  update(dt) {
    const { x, y, z, vx, vy, vz, life, drag, grav, type, alive } = this;
    for (let i = 0; i < this.max; i++) {
      if (!alive[i]) continue;
      life[i] -= dt;
      if (life[i] <= 0) { this._kill(i, false); continue; }
      const t = type[i];
      const dr = Math.max(0, 1 - drag[i] * dt);
      vx[i] *= dr; vy[i] *= dr;
      x[i] += vx[i] * dt;
      y[i] += vy[i] * dt;
      if (t === P.BLOOD || t === P.DEBRIS || t === P.SHARD || t === P.DRIP) {
        vz[i] -= 260 * dt;
        z[i] += vz[i] * dt;
        if (z[i] <= 0) {
          z[i] = 0;
          if (t === P.DEBRIS && vz[i] < -40) {
            vz[i] *= -0.35; vx[i] *= 0.5; vy[i] *= 0.5;
          } else {
            this._kill(i, true);
          }
        }
      } else {
        vz[i] += grav[i] * dt;
        z[i] += vz[i] * dt;
        if (z[i] < 0) z[i] = 0;
      }
    }
  }

  _kill(i, landed) {
    if (landed && this.decalSink) {
      const t = this.type[i];
      if (t === P.BLOOD || t === P.DRIP) this.decalSink(this.x[i], this.y[i], this.color[i], this.size[i] > 1 ? 2 : 1, 1, 0.85);
      else if (t === P.DEBRIS) this.decalSink(this.x[i], this.y[i], this.color[i], 1, 1, 0.9);
    }
    this.alive[i] = 0;
    this.free.push(i);
    this.count--;
  }

  /** Normal (lit) particles: blood, debris, dust, smoke. */
  drawNormal(ctx, camX, camY, vw, vh) {
    const { x, y, z, life, maxLife, size, type, color, alive } = this;
    for (let i = 0; i < this.max; i++) {
      if (!alive[i] || GLOWS[type[i]]) continue;
      const sx = x[i] - camX, sy = y[i] - z[i] - camY;
      if (sx < -8 || sy < -8 || sx > vw + 8 || sy > vh + 8) continue;
      const t = type[i];
      const k = life[i] / maxLife[i];
      if (t === P.DUST || t === P.SMOKE) {
        const s = Math.max(1, Math.round(size[i] * (t === P.SMOKE ? 2 - k : 1.5 - k * 0.5)));
        ctx.globalAlpha = k * (t === P.SMOKE ? 0.45 : 0.5);
        ctx.fillStyle = color[i];
        ctx.fillRect(Math.round(sx - s / 2), Math.round(sy - s / 2), s, s);
      } else {
        ctx.globalAlpha = 1;
        ctx.fillStyle = color[i];
        const s = size[i];
        ctx.fillRect(Math.round(sx), Math.round(sy), s, s);
        // tiny ground shadow for airborne chunks
        if (z[i] > 3 && t === P.DEBRIS) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(Math.round(x[i] - camX), Math.round(y[i] - camY), s, 1); }
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Glowing particles, drawn with 'lighter' into the emissive layer. */
  drawGlow(ctx, camX, camY, vw, vh) {
    const { x, y, z, vx, vy, life, maxLife, size, type, color, alive } = this;
    for (let i = 0; i < this.max; i++) {
      if (!alive[i] || !GLOWS[type[i]]) continue;
      const sx = x[i] - camX, sy = y[i] - z[i] - camY;
      if (sx < -8 || sy < -8 || sx > vw + 8 || sy > vh + 8) continue;
      const k = life[i] / maxLife[i];
      const t = type[i];
      ctx.fillStyle = color[i];
      if (t === P.SPARK) {
        ctx.globalAlpha = Math.min(1, k * 1.5);
        const len = 0.03;
        const ex = sx - vx[i] * len, ey = sy - vy[i] * len;
        const steps = Math.max(1, Math.min(6, Math.round(Math.hypot(ex - sx, ey - sy))));
        for (let s = 0; s <= steps; s++) ctx.fillRect(Math.round(sx + (ex - sx) * s / steps), Math.round(sy + (ey - sy) * s / steps), 1, 1);
      } else if (t === P.EMBER || t === P.GLINT) {
        ctx.globalAlpha = k * (0.6 + 0.4 * Math.sin(life[i] * 30 + i));
        ctx.fillRect(Math.round(sx), Math.round(sy), size[i], size[i]);
      } else if (t === P.FIRE) {
        ctx.globalAlpha = Math.min(1, k * 1.4);
        const s = Math.max(1, Math.round(size[i] * (0.5 + k)));
        ctx.fillStyle = k > 0.7 ? '#fff2b0' : k > 0.4 ? color[i] : '#c2381a';
        ctx.fillRect(Math.round(sx - s / 2), Math.round(sy - s / 2), s, s);
      } else {
        ctx.globalAlpha = Math.min(1, k * 1.3);
        const s = Math.max(1, Math.round(size[i] * (0.4 + k * 0.8)));
        ctx.fillRect(Math.round(sx - s / 2), Math.round(sy - s / 2), s, s);
      }
    }
    ctx.globalAlpha = 1;
  }
}

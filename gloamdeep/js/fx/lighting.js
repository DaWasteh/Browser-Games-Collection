// Lighting pipeline:
//  1. a half-resolution light buffer is filled with the ambient colour,
//  2. static lights (baked once per area with ray-cast shadows) and dynamic lights are added ('lighter'),
//  3. the buffer multiplies the scene,
//  4. emissive effects are added on top and blurred into a cheap two-level bloom.

import { TILE } from '../config.js';
import { hexToRgb } from '../core/math.js';

const rgbCache = new Map();
function rgb(hex) {
  let v = rgbCache.get(hex);
  if (!v) { v = hexToRgb(hex); rgbCache.set(hex, v); }
  return v;
}

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  return [c, c.getContext('2d')];
}

export class Lighting {
  constructor() {
    this.scale = 0.5;
    [this.light, this.lctx] = mk(2, 2);
    [this.emissive, this.ectx] = mk(2, 2);
    [this.bloomA, this.bactx] = mk(2, 2);
    [this.bloomB, this.bbctx] = mk(2, 2);
    this.static = null;
    this.staticSource = null;
    this.flickerLights = [];
  }

  resize(vw, vh) {
    this.vw = vw; this.vh = vh;
    this.light.width = Math.ceil(vw * this.scale) + 2;
    this.light.height = Math.ceil(vh * this.scale) + 2;
    this.emissive.width = vw; this.emissive.height = vh;
    this.bloomA.width = Math.ceil(vw / 4); this.bloomA.height = Math.ceil(vh / 4);
    this.bloomB.width = Math.ceil(vw / 8); this.bloomB.height = Math.ceil(vh / 8);
    this.ectx.imageSmoothingEnabled = false;
  }

  /** Bake static lights with ray-cast shadows into an area-sized half-resolution canvas. */
  bakeStatic(map, lights, extraGlow = []) {
    const s = this.scale;
    const [c, g] = mk(Math.ceil(map.W * TILE * s), Math.ceil(map.H * TILE * s));
    g.globalCompositeOperation = 'lighter';
    this.flickerLights = [];
    for (const L of lights) {
      const poly = map.lightPolygon(L.x, L.y, L.radius, 160, 14);
      this._drawLight(g, L.x * s, L.y * s, L.radius * s, L.color, L.intensity * 0.82, poly, s);
      // the flicker pass reuses the shadow polygon so it never leaks through walls
      if (L.flicker > 0) this.flickerLights.push({ L, poly });
    }
    for (const L of extraGlow) this._drawLight(g, L.x * s, L.y * s, L.radius * s, L.color, L.intensity, null, s);
    this.static = c;
  }

  /** Bake the static lights of an area once; later calls for the same area are free. */
  useArea(area) {
    if (this.staticSource === area) return;
    this.staticSource = area;
    this.static = null;
    this.flickerLights = [];
    if (area && area.map && area.lights && area.lights.length) this.bakeStatic(area.map, area.lights);
  }

  _drawLight(g, x, y, r, color, intensity, poly, s, ox = 0, oy = 0, flat = false) {
    if (r <= 0 || intensity <= 0) return;
    const [cr, cg, cb] = rgb(color);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const a = Math.min(1, intensity);
    grad.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`);
    if (flat) {
      grad.addColorStop(0.5, `rgba(${cr},${cg},${cb},${a * 0.82})`);
      grad.addColorStop(0.82, `rgba(${cr},${cg},${cb},${a * 0.32})`);
    } else {
      grad.addColorStop(0.35, `rgba(${cr},${cg},${cb},${a * 0.62})`);
      grad.addColorStop(0.7, `rgba(${cr},${cg},${cb},${a * 0.22})`);
    }
    grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    g.fillStyle = grad;
    if (poly) {
      g.beginPath();
      g.moveTo((poly[0][0] - ox) * s, (poly[0][1] - oy) * s);
      for (let i = 1; i < poly.length; i++) g.lineTo((poly[i][0] - ox) * s, (poly[i][1] - oy) * s);
      g.closePath();
      g.fill();
    } else {
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  /**
   * Compose lighting onto the scene.
   * dyn: [{x, y, radius, color, intensity, poly?}] in world px.
   */
  apply(scene, camX, camY, ambient, dyn, time) {
    const g = this.lctx;
    const s = this.scale;
    const lw = this.light.width, lh = this.light.height;
    // sub-pixel alignment: the light buffer covers the view offset by the fractional camera part
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = `rgb(${ambient[0]},${ambient[1]},${ambient[2]})`;
    g.fillRect(0, 0, lw, lh);
    g.globalCompositeOperation = 'lighter';
    if (this.static) {
      // clip the source rectangle ourselves (screen shake and the 2px border can reach past the
      // area edge; some browsers draw nothing for out-of-bounds source rectangles)
      const st = this.static;
      const sx = camX * s, sy = camY * s;
      const x0 = Math.max(0, sx), y0 = Math.max(0, sy);
      const x1 = Math.min(st.width, sx + lw), y1 = Math.min(st.height, sy + lh);
      g.imageSmoothingEnabled = true;
      if (x1 > x0 && y1 > y0) g.drawImage(st, x0, y0, x1 - x0, y1 - y0, x0 - sx, y0 - sy, x1 - x0, y1 - y0);
    }
    // flicker: extra modulated light on top of the baked 82%
    for (const { L, poly } of this.flickerLights) {
      const sx = L.x - camX, sy = L.y - camY;
      if (sx < -L.radius || sy < -L.radius || sx > this.vw + L.radius || sy > this.vh + L.radius) continue;
      const ph = L.x * 0.13 + L.y * 0.07;
      const f = 0.5 + 0.3 * Math.sin(time * 9.3 + ph) + 0.2 * Math.sin(time * 23.1 + ph * 2.3);
      this._drawLight(g, sx * s, sy * s, L.radius * 0.7 * s, L.color, L.intensity * 0.28 * f * L.flicker + 0.05, poly, s, camX, camY);
    }
    for (const L of dyn) {
      const sx = L.x - camX, sy = L.y - camY;
      if (sx < -L.radius || sy < -L.radius || sx > this.vw + L.radius || sy > this.vh + L.radius) continue;
      this._drawLight(g, sx * s, sy * s, L.radius * s, L.color, L.intensity, L.poly || null, s, camX, camY, !!L.flat);
    }
    scene.save();
    scene.globalCompositeOperation = 'multiply';
    scene.imageSmoothingEnabled = true;
    scene.drawImage(this.light, 0, 0, lw, lh, 0, 0, lw / s, lh / s);
    // a little of the light added back on top: warm glow and highlights in lit areas
    scene.globalCompositeOperation = 'lighter';
    scene.globalAlpha = 0.09;
    scene.drawImage(this.light, 0, 0, lw, lh, 0, 0, lw / s, lh / s);
    scene.restore();
  }

  beginEmissive() {
    const g = this.ectx;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, this.emissive.width, this.emissive.height);
    g.globalCompositeOperation = 'lighter';
    return g;
  }

  /** Add the emissive layer plus a blurred copy (bloom) onto the scene. */
  endEmissive(scene, bloomStrength = 1) {
    const a = this.bactx, b = this.bbctx;
    a.globalCompositeOperation = 'copy';
    a.imageSmoothingEnabled = true;
    a.drawImage(this.emissive, 0, 0, this.bloomA.width, this.bloomA.height);
    b.globalCompositeOperation = 'copy';
    b.imageSmoothingEnabled = true;
    b.drawImage(this.bloomA, 0, 0, this.bloomB.width, this.bloomB.height);
    scene.save();
    scene.globalCompositeOperation = 'lighter';
    scene.imageSmoothingEnabled = true;
    scene.globalAlpha = 0.7 * bloomStrength;
    scene.drawImage(this.bloomB, 0, 0, this.vw, this.vh);
    scene.globalAlpha = 0.6 * bloomStrength;
    scene.drawImage(this.bloomA, 0, 0, this.vw, this.vh);
    scene.globalAlpha = 1;
    scene.imageSmoothingEnabled = false;
    scene.drawImage(this.emissive, 0, 0);
    scene.restore();
  }

  /** Soft radial glow helper for the emissive layer. */
  static glow(g, x, y, r, color, alpha = 1) {
    const [cr, cg, cb] = rgb(color);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${cr},${cg},${cb},${alpha})`);
    grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

export { rgb };

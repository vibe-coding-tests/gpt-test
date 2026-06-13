import Phaser from "phaser";
import type { Feature } from "../types";
import { Rng, clamp, wrap01 } from "../util";
import { TrackGeometry } from "./TrackGeometry";

type Pt = { x: number; y: number };

/** Lighten (f > 1) or darken (f < 1) a packed RGB color. */
function shadeNum(color: number, f: number): number {
  const ch = (v: number) => clamp(Math.round(v * f), 0, 255);
  return (ch((color >> 16) & 0xff) << 16) | (ch((color >> 8) & 0xff) << 8) | ch(color & 0xff);
}

const css = (color: number, alpha = 1) =>
  `rgba(${(color >> 16) & 0xff},${(color >> 8) & 0xff},${color & 0xff},${alpha})`;

/**
 * Tiny Phaser.Graphics-flavored wrapper over Canvas2D so the track painting
 * code reads the same as it always did — but the result lives on a plain
 * canvas that BOTH renderers can use: Phaser samples it for the top-down
 * views and Three.js drapes it over the 3D ground mesh.
 */
class D2 {
  constructor(readonly ctx: CanvasRenderingContext2D) {}
  fillStyle(color: number, alpha = 1) { this.ctx.fillStyle = css(color, alpha); return this; }
  lineStyle(w: number, color: number, alpha = 1) {
    this.ctx.lineWidth = w;
    this.ctx.strokeStyle = css(color, alpha);
    return this;
  }
  fillRect(x: number, y: number, w: number, h: number) { this.ctx.fillRect(x, y, w, h); return this; }
  fillCircle(x: number, y: number, r: number) {
    this.ctx.beginPath();
    this.ctx.arc(x, y, Math.max(r, 0.1), 0, Math.PI * 2);
    this.ctx.fill();
    return this;
  }
  /** Phaser semantics: w/h are full width/height (diameters). */
  fillEllipse(x: number, y: number, w: number, h: number) {
    this.ctx.beginPath();
    this.ctx.ellipse(x, y, Math.max(w / 2, 0.1), Math.max(h / 2, 0.1), 0, 0, Math.PI * 2);
    this.ctx.fill();
    return this;
  }
  fillTriangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) {
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.lineTo(x3, y3);
    this.ctx.closePath();
    this.ctx.fill();
    return this;
  }
  fillRoundedRect(x: number, y: number, w: number, h: number, r: number) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
    c.fill();
    return this;
  }
  fillPoints(pts: Pt[]) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    c.closePath();
    c.fill();
    return this;
  }
  lineBetween(x1: number, y1: number, x2: number, y2: number) {
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
    return this;
  }
  beginPath() { this.ctx.beginPath(); return this; }
  moveTo(x: number, y: number) { this.ctx.moveTo(x, y); return this; }
  lineTo(x: number, y: number) { this.ctx.lineTo(x, y); return this; }
  strokePath() { this.ctx.stroke(); return this; }
  arc(x: number, y: number, r: number, a0: number, a1: number) { this.ctx.arc(x, y, r, a0, a1); return this; }
  strokeCircle(x: number, y: number, r: number) {
    this.ctx.beginPath();
    this.ctx.arc(x, y, Math.max(r, 0.1), 0, Math.PI * 2);
    this.ctx.stroke();
    return this;
  }
  strokeEllipse(x: number, y: number, w: number, h: number) {
    this.ctx.beginPath();
    this.ctx.ellipse(x, y, Math.max(w / 2, 0.1), Math.max(h / 2, 0.1), 0, 0, Math.PI * 2);
    this.ctx.stroke();
    return this;
  }
  strokeRect(x: number, y: number, w: number, h: number) { this.ctx.strokeRect(x, y, w, h); return this; }
}

export interface TrackWorld {
  canvas: HTMLCanvasElement;
  texKey: string;
  /** Top-down view of the world (Phaser image of the same canvas). */
  image: Phaser.GameObjects.Image;
  /** Stamp a small rotated rectangle (skid mark) into the world canvas. */
  stamp(x: number, y: number, rot: number, w: number, h: number, color: number, alpha: number): void;
  /** Re-upload the canvas to whichever renderer is active. Cheap to throttle. */
  flush(toPhaser: boolean): boolean;
}

/**
 * Renders the whole track world once into a shared canvas (terrain, corridor,
 * road, features, rails, decorations). The canvas backs the Phaser top-down
 * image AND the Three.js ground texture, so live skid marks show up in both.
 */
export function buildTrackWorld(scene: Phaser.Scene, geom: TrackGeometry): TrackWorld {
  const def = geom.def;
  const W = Math.ceil(geom.worldW);
  const H = Math.ceil(geom.worldH);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const g = new D2(ctx);
  const rng = new Rng(1234 + def.id * 777);
  const N = geom.xs.length;

  const quadStrip = (half: (k: number) => number, color: (k: number) => number, alpha = 1, dInner?: (k: number) => number) => {
    for (let k = 0; k < N; k += 2) {
      const k2 = (k + 2) % N;
      const hi1 = half(k), hi2 = half(k2);
      const lo1 = dInner ? dInner(k) : -hi1;
      const lo2 = dInner ? dInner(k2) : -hi2;
      const pts: Pt[] = [
        { x: geom.xs[k] + geom.nx[k] * lo1, y: geom.ys[k] + geom.ny[k] * lo1 },
        { x: geom.xs[k] + geom.nx[k] * hi1, y: geom.ys[k] + geom.ny[k] * hi1 },
        { x: geom.xs[k2] + geom.nx[k2] * hi2, y: geom.ys[k2] + geom.ny[k2] * hi2 },
        { x: geom.xs[k2] + geom.nx[k2] * lo2, y: geom.ys[k2] + geom.ny[k2] * lo2 }
      ];
      g.fillStyle(color(k), alpha);
      g.fillPoints(pts);
    }
  };

  const bandRange = (s0: number, s1: number, d0: number, d1: number, color: number, alpha: number) => {
    const len = wrap01(s1 - s0) || (s1 - s0);
    const steps = Math.max(2, Math.ceil((len * geom.total) / 26));
    for (let i = 0; i < steps; i++) {
      const sa = wrap01(s0 + (len * i) / steps);
      const sb = wrap01(s0 + (len * (i + 1)) / steps);
      const a = geom.sample(sa), b = geom.sample(sb);
      const pts: Pt[] = [
        { x: a.x + a.nx * d0, y: a.y + a.ny * d0 },
        { x: a.x + a.nx * d1, y: a.y + a.ny * d1 },
        { x: b.x + b.nx * d1, y: b.y + b.ny * d1 },
        { x: b.x + b.nx * d0, y: b.y + b.ny * d0 }
      ];
      g.fillStyle(color, alpha);
      g.fillPoints(pts);
    }
  };

  const shortcutBand = (sc: (typeof geom.shortcuts)[number], d0: number, d1: number, color: number, alpha = 1) => {
    const pts: Pt[] = [
      { x: sc.ax + sc.nx * d0, y: sc.ay + sc.ny * d0 },
      { x: sc.ax + sc.nx * d1, y: sc.ay + sc.ny * d1 },
      { x: sc.bx + sc.nx * d1, y: sc.by + sc.ny * d1 },
      { x: sc.bx + sc.nx * d0, y: sc.by + sc.ny * d0 }
    ];
    g.fillStyle(color, alpha);
    g.fillPoints(pts);
  };

  // --- terrain ---
  g.fillStyle(def.theme.bg, 1);
  g.fillRect(0, 0, W, H);
  // large mottled patches give the ground a hand-painted read
  for (let i = 0; i < 110; i++) {
    const f = rng.next() < 0.5 ? 0.92 : 1.08;
    g.fillStyle(shadeNum(def.theme.bg, f), 0.5);
    g.fillEllipse(rng.range(0, W), rng.range(0, H), rng.range(60, 220), rng.range(40, 150));
  }
  for (let i = 0; i < 520; i++) {
    g.fillStyle(def.theme.bgDetail, 0.7);
    g.fillCircle(rng.range(0, W), rng.range(0, H), rng.range(1.5, 5));
  }
  for (let i = 0; i < 260; i++) {
    g.fillStyle(shadeNum(def.theme.bgDetail, 1.25), 0.5);
    g.fillCircle(rng.range(0, W), rng.range(0, H), rng.range(1, 2.6));
  }
  if (def.theme.deco === "space") {
    for (let i = 0; i < 700; i++) {
      g.fillStyle(0xffffff, rng.range(0.15, 0.9));
      g.fillCircle(rng.range(0, W), rng.range(0, H), rng.range(0.7, 2.2));
    }
  }
  if (def.theme.deco === "volcano") {
    // glowing caldera in the middle of the ring
    let cx = 0, cy = 0;
    for (let k = 0; k < N; k++) { cx += geom.xs[k]; cy += geom.ys[k]; }
    cx /= N; cy /= N;
    for (let r = 430; r > 80; r -= 60) {
      g.fillStyle(r > 300 ? 0x611f12 : r > 180 ? 0xb33a14 : 0xf08030, 0.9);
      g.fillCircle(cx, cy, r);
    }
    g.fillStyle(0xffd860, 0.9);
    g.fillCircle(cx, cy, 60);
  }

  // --- corridor + road ---
  if (!def.theme.rainbowRoad) {
    quadStrip(() => def.corridorHalf, () => def.theme.corridor);
  }
  if (def.theme.rainbowRoad) {
    quadStrip(() => def.roadHalf, (k) => {
      const hue = (k / N * 4) % 1;
      return Phaser.Display.Color.HSLToColor(hue, 0.75, 0.55).color;
    });
    // bright edges
    quadStrip(() => def.roadHalf, () => 0xffffff, 0.9, () => def.roadHalf - 6);
    quadStrip(() => -def.roadHalf + 6, () => 0xffffff, 0.9, () => -def.roadHalf);
  } else {
    quadStrip(() => def.roadHalf, () => def.theme.road);
    // subtle asphalt mottling + speckle so the road isn't a flat fill
    for (let i = 0; i < Math.floor(N * 0.7); i++) {
      const k = rng.int(N);
      const d = rng.range(-def.roadHalf + 12, def.roadHalf - 12);
      const f = rng.next() < 0.5 ? 0.93 : 1.07;
      g.fillStyle(shadeNum(def.theme.road, f), 0.45);
      g.fillEllipse(geom.xs[k] + geom.nx[k] * d, geom.ys[k] + geom.ny[k] * d, rng.range(14, 44), rng.range(10, 26));
    }
    for (let i = 0; i < N; i++) {
      const k = rng.int(N);
      const d = rng.range(-def.roadHalf + 9, def.roadHalf - 9);
      g.fillStyle(shadeNum(def.theme.road, rng.next() < 0.5 ? 0.85 : 1.15), 0.5);
      g.fillCircle(geom.xs[k] + geom.nx[k] * d, geom.ys[k] + geom.ny[k] * d, rng.range(1, 2.6));
    }
    quadStrip(() => def.roadHalf, () => def.theme.roadEdge, 0.95, () => def.roadHalf - 7);
    quadStrip(() => -def.roadHalf + 7, () => def.theme.roadEdge, 0.95, () => -def.roadHalf);
    // center dashes
    for (let k = 0; k < N; k += 16) {
      g.fillStyle(def.theme.roadEdge, 0.4);
      g.fillCircle(geom.xs[k], geom.ys[k], 3);
    }
    // rumble strips on sharp bends: alternating red/white edge blocks
    const STEP = 4;
    for (let k = 0; k < N; k += STEP) {
      const k2 = (k + 8) % N;
      const cross = geom.tx[k] * geom.ty[k2] - geom.ty[k] * geom.tx[k2];
      const dot = geom.tx[k] * geom.tx[k2] + geom.ty[k] * geom.ty[k2];
      const turn = Math.abs(Math.atan2(cross, dot));
      if (turn < 0.09) continue;
      const outside = Math.sign(Math.atan2(cross, dot)) > 0 ? -1 : 1; // stripe the outer edge
      const dd = outside * (def.roadHalf - 3.5);
      const a = { x: geom.xs[k] + geom.nx[k] * dd, y: geom.ys[k] + geom.ny[k] * dd };
      const b = { x: geom.xs[(k + STEP) % N] + geom.nx[(k + STEP) % N] * dd, y: geom.ys[(k + STEP) % N] + geom.ny[(k + STEP) % N] * dd };
      g.lineStyle(8, (k / STEP) % 2 === 0 ? 0xe84a4a : 0xf8f8f8, 0.95);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
  }

  // --- shortcuts ---
  for (const sc of geom.shortcuts) {
    const surfColor = sc.def.surface === "boost" ? 0xffc93a
      : sc.def.surface === "ice" ? 0xcfeeff
        : sc.def.surface === "mud" ? 0x6a4a2e
          : def.theme.road;
    shortcutBand(sc, -sc.def.corridorHalf, sc.def.corridorHalf, def.theme.corridor, 1);
    shortcutBand(sc, -sc.def.roadHalf, sc.def.roadHalf, surfColor, 1);
    shortcutBand(sc, sc.def.roadHalf - 7, sc.def.roadHalf, def.theme.roadEdge, 0.95);
    shortcutBand(sc, -sc.def.roadHalf, -sc.def.roadHalf + 7, def.theme.roadEdge, 0.95);

    const marks = Math.max(2, Math.floor(sc.len / 140));
    for (let i = 1; i < marks; i++) {
      const t = i / marks;
      const p = geom.shortcutPos(sc, t, 0);
      g.fillStyle(sc.def.surface === "boost" ? 0xffffff : def.theme.roadEdge, sc.def.surface === "boost" ? 0.9 : 0.42);
      if (sc.def.surface === "boost") {
        g.fillTriangle(
          p.x - sc.nx * 16 - sc.tx * 8, p.y - sc.ny * 16 - sc.ty * 8,
          p.x + sc.nx * 16 - sc.tx * 8, p.y + sc.ny * 16 - sc.ty * 8,
          p.x + sc.tx * 18, p.y + sc.ty * 18
        );
      } else {
        g.fillCircle(p.x, p.y, 3);
      }
    }
  }

  // --- features ---
  const featureColor: Record<string, [number, number]> = {
    water: [0x3a7bd5, 0.88], lava: [0xd5481e, 0.95], ice: [0xcfeeff, 0.85],
    boost: [0xffc93a, 0.95], ramp: [0x8a6a4a, 1], gap: [0x05050c, 1], mud: [0x6a4a2e, 0.9]
  };
  for (const f of def.features) {
    const [col, alpha] = featureColor[f.kind];
    bandRange(f.s0, f.s1, f.d0, f.d1, col, alpha);
    decorateFeature(g, geom, f, rng);
  }

  // --- hill shading: sunlit climbs, shaded descents (reads in both views) ---
  if (geom.hasHills) {
    for (let k = 0; k < N; k += 2) {
      const sl = geom.slopeAt(k / N);
      if (Math.abs(sl) < 0.012) continue;
      const a = clamp(Math.abs(sl) * 1.5, 0, 0.2);
      const k2 = (k + 2) % N;
      const w = def.corridorHalf;
      const pts: Pt[] = [
        { x: geom.xs[k] - geom.nx[k] * w, y: geom.ys[k] - geom.ny[k] * w },
        { x: geom.xs[k] + geom.nx[k] * w, y: geom.ys[k] + geom.ny[k] * w },
        { x: geom.xs[k2] + geom.nx[k2] * w, y: geom.ys[k2] + geom.ny[k2] * w },
        { x: geom.xs[k2] - geom.nx[k2] * w, y: geom.ys[k2] - geom.ny[k2] * w }
      ];
      g.fillStyle(sl > 0 ? 0xffffff : 0x000000, a);
      g.fillPoints(pts);
    }
    // crest ticks where the slope flips downhill
    for (let k = 0; k < N; k += 2) {
      const k2 = (k + 2) % N;
      if (geom.slopeAt(k / N) > 0.02 && geom.slopeAt(k2 / N) <= 0.005) {
        const p = geom.sample(k2 / N);
        g.lineStyle(4, 0xffffff, 0.55);
        g.lineBetween(
          p.x - p.nx * def.roadHalf, p.y - p.ny * def.roadHalf,
          p.x + p.nx * def.roadHalf, p.y + p.ny * def.roadHalf
        );
      }
    }
  }

  // --- start / finish checker line ---
  {
    const sq = def.roadHalf / 5;
    const p = geom.sample(0.0005);
    for (let row = 0; row < 2; row++) {
      for (let c = 0; c < 10; c++) {
        const d0 = -def.roadHalf + c * sq;
        const pts: Pt[] = [
          { x: p.x + p.nx * d0 + p.tx * row * sq, y: p.y + p.ny * d0 + p.ty * row * sq },
          { x: p.x + p.nx * (d0 + sq) + p.tx * row * sq, y: p.y + p.ny * (d0 + sq) + p.ty * row * sq },
          { x: p.x + p.nx * (d0 + sq) + p.tx * (row + 1) * sq, y: p.y + p.ny * (d0 + sq) + p.ty * (row + 1) * sq },
          { x: p.x + p.nx * d0 + p.tx * (row + 1) * sq, y: p.y + p.ny * d0 + p.ty * (row + 1) * sq }
        ];
        g.fillStyle((row + c) % 2 === 0 ? 0xffffff : 0x16161e, 1);
        g.fillPoints(pts);
      }
    }
    // starting-grid slot brackets behind the line
    for (let slot = 0; slot < 8; slot++) {
      const sg = geom.startGrid(slot);
      const ca = Math.cos(sg.heading), sa = Math.sin(sg.heading);
      const na = -sa, nb = ca;
      g.lineStyle(3, 0xffffff, 0.55);
      for (const side of [-1, 1]) {
        const cx = sg.x + na * side * 16, cy = sg.y + nb * side * 16;
        g.lineBetween(cx - ca * 12, cy - sa * 12, cx + ca * 12, cy + sa * 12);
        g.lineBetween(cx + ca * 12, cy + sa * 12, cx + ca * 12 - na * side * 6, cy + sa * 12 - nb * side * 6);
      }
    }
  }

  // --- guardrail sections on fall tracks: a bright continuous rail ---
  if (def.edgeMode === "fall" && def.rails) {
    for (const side of [-1, 1]) {
      g.lineStyle(6, def.theme.roadEdge, 0.95);
      let open = false;
      g.beginPath();
      for (let k = 0; k <= N; k++) {
        const kk = k % N;
        if (geom.railAt(kk / N)) {
          const d = side * (def.corridorHalf - 2);
          const x = geom.xs[kk] + geom.nx[kk] * d;
          const y = geom.ys[kk] + geom.ny[kk] * d;
          if (!open) { g.moveTo(x, y); open = true; }
          else g.lineTo(x, y);
        } else if (open) {
          g.strokePath();
          g.beginPath();
          open = false;
        }
      }
      if (open) g.strokePath();
    }
    // rail posts
    for (let k = 0; k < N; k += 6) {
      if (!geom.railAt(k / N)) continue;
      for (const side of [-1, 1]) {
        const d = side * (def.corridorHalf - 2);
        g.fillStyle(def.theme.wall, 1);
        g.fillCircle(geom.xs[k] + geom.nx[k] * d, geom.ys[k] + geom.ny[k] * d, 5);
      }
    }
  }

  // --- rails / edge markers ---
  for (let k = 0; k < N; k += 8) {
    if (def.edgeMode === "fall" && geom.railAt(k / N)) continue; // rail drawn above
    for (const side of [-1, 1]) {
      const d = side * (def.corridorHalf - 4);
      const x = geom.xs[k] + geom.nx[k] * d;
      const y = geom.ys[k] + geom.ny[k] * d;
      if (def.edgeMode === "fall") {
        g.fillStyle(def.theme.wall, 0.85);
        g.fillCircle(x, y, 2.5);
      } else {
        g.fillStyle(def.theme.wall, 1);
        g.fillCircle(x, y, 4);
      }
    }
  }

  drawDecorations(g, geom, rng);

  const texKey = `m7-world-${def.id}`;
  if (scene.textures.exists(texKey)) scene.textures.remove(texKey);
  scene.textures.addCanvas(texKey, canvas);
  const image = scene.add.image(0, 0, texKey).setOrigin(0, 0).setDepth(0);

  let dirty = false;
  return {
    canvas,
    texKey,
    image,
    stamp(x, y, rot, w, h, color, alpha) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillStyle = css(color, alpha);
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
      dirty = true;
    },
    flush(toPhaser: boolean) {
      if (!dirty) return false;
      dirty = false;
      if (toPhaser) {
        const tex = scene.textures.get(texKey) as Phaser.Textures.CanvasTexture;
        tex.refresh();
      }
      return true;
    }
  };
}

function decorateFeature(g: D2, geom: TrackGeometry, f: Feature, rng: Rng) {
  const mid = (f.d0 + f.d1) / 2;
  const span = wrap01(f.s1 - f.s0) || (f.s1 - f.s0);
  if (f.kind === "boost") {
    // chevrons pointing along travel
    for (let i = 0; i < 3; i++) {
      const p = geom.sample(wrap01(f.s0 + span * (0.25 + i * 0.25)));
      for (const off of [-0.5, 0.5]) {
        const bx = p.x + p.nx * (mid + off * (f.d1 - f.d0) * 0.45);
        const by = p.y + p.ny * (mid + off * (f.d1 - f.d0) * 0.45);
        g.fillStyle(0xffffff, 0.95);
        g.fillTriangle(
          bx - p.nx * 12 - p.tx * 6, by - p.ny * 12 - p.ty * 6,
          bx + p.nx * 12 - p.tx * 6, by + p.ny * 12 - p.ty * 6,
          bx + p.tx * 14, by + p.ty * 14
        );
      }
    }
  } else if (f.kind === "ramp") {
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const p = geom.sample(wrap01(f.s0 + (span * i) / steps));
      g.lineStyle(5, 0xf0e0c0, 0.85);
      g.lineBetween(p.x + p.nx * f.d0, p.y + p.ny * f.d0, p.x + p.nx * f.d1, p.y + p.ny * f.d1);
    }
  } else if (f.kind === "water") {
    for (let i = 0; i < 14; i++) {
      const p = geom.sample(wrap01(f.s0 + span * rng.next()));
      const d = rng.range(f.d0 + 12, f.d1 - 12);
      g.lineStyle(2, 0xbfe4ff, 0.7);
      const wx = p.x + p.nx * d, wy = p.y + p.ny * d;
      g.beginPath();
      g.arc(wx, wy, rng.range(6, 14), Math.PI * 0.15, Math.PI * 0.85);
      g.strokePath();
    }
  } else if (f.kind === "lava") {
    for (let i = 0; i < 12; i++) {
      const p = geom.sample(wrap01(f.s0 + span * rng.next()));
      const d = rng.range(f.d0 + 10, f.d1 - 10);
      g.fillStyle(0xffa23a, 0.9);
      g.fillCircle(p.x + p.nx * d, p.y + p.ny * d, rng.range(4, 12));
    }
  } else if (f.kind === "ice") {
    for (let i = 0; i < 10; i++) {
      const p = geom.sample(wrap01(f.s0 + span * rng.next()));
      const d = rng.range(f.d0 + 10, f.d1 - 10);
      g.lineStyle(2, 0xffffff, 0.8);
      const ix = p.x + p.nx * d, iy = p.y + p.ny * d;
      g.lineBetween(ix - 7, iy, ix + 7, iy);
      g.lineBetween(ix, iy - 7, ix, iy + 7);
    }
  } else if (f.kind === "gap") {
    // jagged purple rim so the hole reads
    const steps = Math.max(3, Math.ceil(span * geom.total / 30));
    g.lineStyle(3, 0x7a5ae8, 0.8);
    for (let i = 0; i <= steps; i++) {
      const p = geom.sample(wrap01(f.s0 + (span * i) / steps));
      g.strokeCircle(p.x + p.nx * ((f.d0 + f.d1) / 2), p.y + p.ny * ((f.d0 + f.d1) / 2), 2);
    }
  } else if (f.kind === "mud") {
    for (let i = 0; i < 8; i++) {
      const p = geom.sample(wrap01(f.s0 + span * rng.next()));
      const d = rng.range(f.d0 + 8, f.d1 - 8);
      g.fillStyle(0x553a24, 0.9);
      g.fillCircle(p.x + p.nx * d, p.y + p.ny * d, rng.range(5, 10));
    }
  }
}

function drawDecorations(g: D2, geom: TrackGeometry, rng: Rng) {
  const def = geom.def;
  const N = geom.xs.length;
  const deco = def.theme.deco;
  const count = deco === "forest" ? 240 : deco === "city" ? 90 : deco === "ghost" ? 200 : deco === "plant" ? 110 : 150;

  for (let i = 0; i < count; i++) {
    let x = 0, y = 0, placed = false;
    // a few tries to land clear of EVERY stretch of road: the raw offset can
    // reach across a hairpin onto a neighbouring segment, painting scenery on
    // the track. onCourse() rejects any spot sitting on another road.
    for (let attempt = 0; attempt < 5 && !placed; attempt++) {
      const k = rng.int(N);
      const side = rng.next() < 0.5 ? -1 : 1;
      const d = side * (def.corridorHalf + rng.range(50, 230));
      x = geom.xs[k] + geom.nx[k] * d;
      y = geom.ys[k] + geom.ny[k] * d;
      if (x < 20 || y < 20 || x > geom.worldW - 20 || y > geom.worldH - 20) continue;
      if (geom.onCourse(x, y, 24)) continue;
      placed = true;
    }
    if (!placed) continue;

    switch (deco) {
      case "forest": {
        const r = rng.range(16, 30);
        g.fillStyle(0x1d4a1a, 1); g.fillCircle(x, y, r);
        g.fillStyle(0x2f6b28, 1); g.fillCircle(x - r * 0.2, y - r * 0.2, r * 0.7);
        break;
      }
      case "plain": {
        if (rng.next() < 0.6) {
          g.fillStyle(0x2f7a2a, 1); g.fillCircle(x, y, rng.range(8, 14));
          g.fillStyle(0x49a23e, 1); g.fillCircle(x - 2, y - 2, rng.range(5, 9));
        } else {
          g.fillStyle(rng.next() < 0.5 ? 0xffe066 : 0xff8aa8, 1);
          g.fillCircle(x, y, 3);
        }
        break;
      }
      case "beach": {
        if (rng.next() < 0.4) {
          g.fillStyle(0x8a5a32, 1); g.fillCircle(x, y, 4); // trunk
          g.fillStyle(0x3f9e4e, 1);
          for (let a = 0; a < 5; a++) {
            const ang = (a / 5) * Math.PI * 2;
            g.fillEllipse(x + Math.cos(ang) * 12, y + Math.sin(ang) * 12, 18, 7);
          }
        } else {
          g.fillStyle(0xfff2cc, 1); g.fillCircle(x, y, rng.range(2, 4));
        }
        break;
      }
      case "cave": {
        if (rng.next() < 0.5) {
          g.fillStyle(0x55485f, 1);
          g.fillTriangle(x - 10, y + 10, x + 10, y + 10, x, y - 16);
        } else {
          g.fillStyle(0xb88ae8, 0.9);
          g.fillTriangle(x - 5, y, x + 5, y, x, y - 11);
          g.fillTriangle(x - 5, y, x + 5, y, x, y + 11);
        }
        break;
      }
      case "volcano": {
        if (rng.next() < 0.6) {
          g.fillStyle(0x33201a, 1); g.fillCircle(x, y, rng.range(8, 18));
        } else {
          g.fillStyle(0xff9a3a, rng.range(0.5, 1)); g.fillCircle(x, y, rng.range(2, 4));
        }
        break;
      }
      case "ice": {
        g.fillStyle(0xeaf8ff, 0.95);
        const r = rng.range(6, 14);
        g.fillTriangle(x - r * 0.6, y + r * 0.4, x + r * 0.6, y + r * 0.4, x, y - r);
        g.fillStyle(0xb8dcf0, 0.8);
        g.fillTriangle(x - r * 0.3, y + r * 0.4, x + r * 0.3, y + r * 0.4, x, y - r * 0.55);
        break;
      }
      case "city": {
        const w = rng.range(40, 90), h = rng.range(40, 90);
        g.fillStyle(0x1a1c38, 1); g.fillRect(x - w / 2, y - h / 2, w, h);
        g.lineStyle(2, rng.next() < 0.5 ? 0xe858c8 : 0x58c8e8, 0.9);
        g.strokeRect(x - w / 2, y - h / 2, w, h);
        g.fillStyle(0xffe066, 0.9);
        for (let wy = y - h / 2 + 8; wy < y + h / 2 - 6; wy += 12) {
          for (let wx = x - w / 2 + 8; wx < x + w / 2 - 6; wx += 12) {
            if (rng.next() < 0.55) g.fillRect(wx, wy, 4, 4);
          }
        }
        break;
      }
      case "rocky": {
        g.fillStyle(0x3a352e, 1);
        g.fillCircle(x, y, rng.range(8, 20));
        g.fillStyle(0x57504a, 1);
        g.fillCircle(x - 3, y - 3, rng.range(5, 12));
        break;
      }
      case "space": {
        g.fillStyle(rng.next() < 0.5 ? 0x8ae8ff : 0xffd0f0, rng.range(0.5, 1));
        const r = rng.range(1.5, 3.5);
        g.fillCircle(x, y, r);
        break;
      }
      case "ghost": {
        const roll = rng.next();
        if (roll < 0.35) {
          // tombstone
          g.fillStyle(0x4a4458, 1);
          g.fillRoundedRect(x - 7, y - 12, 14, 20, 5);
          g.fillStyle(0x5a5468, 1);
          g.fillRect(x - 10, y + 6, 20, 4);
        } else if (roll < 0.6) {
          // bare dead tree
          g.lineStyle(4, 0x2a2438, 1);
          g.lineBetween(x, y + 14, x, y - 12);
          g.lineBetween(x, y - 4, x - 9, y - 14);
          g.lineBetween(x, y - 8, x + 8, y - 18);
        } else {
          // drifting wisp
          g.fillStyle(rng.next() < 0.5 ? 0x9a7ac8 : 0x6a5a9a, rng.range(0.35, 0.7));
          g.fillCircle(x, y, rng.range(2, 5));
        }
        break;
      }
      case "moon": {
        if (rng.next() < 0.55) {
          // crater
          const r = rng.range(10, 26);
          g.fillStyle(0x1a1830, 0.9);
          g.fillEllipse(x, y, r * 2, r * 1.4);
          g.lineStyle(2, 0x4a4470, 0.8);
          g.strokeEllipse(x, y, r * 2, r * 1.4);
        } else {
          // moon stone crystal
          const r = rng.range(6, 13);
          g.fillStyle(rng.next() < 0.5 ? 0xf0a8d8 : 0x8ad0f0, 0.95);
          g.fillTriangle(x - r * 0.6, y + r * 0.4, x + r * 0.6, y + r * 0.4, x, y - r);
          g.fillStyle(0xffffff, 0.5);
          g.fillTriangle(x - r * 0.2, y + r * 0.3, x + r * 0.2, y + r * 0.3, x, y - r * 0.5);
        }
        break;
      }
      case "plant": {
        if (rng.next() < 0.5) {
          // humming pylon with a spark on top
          g.fillStyle(0x1a2428, 1);
          g.fillRect(x - 3, y - 18, 6, 32);
          g.fillRect(x - 10, y - 12, 20, 4);
          g.fillStyle(0xfff060, 0.95);
          g.fillCircle(x, y - 20, 4);
          g.fillStyle(0xfff060, 0.35);
          g.fillCircle(x, y - 20, 8);
        } else if (rng.next() < 0.5) {
          // warning-striped block
          g.fillStyle(0x222a2e, 1);
          g.fillRect(x - 12, y - 8, 24, 16);
          g.fillStyle(0xf0d048, 1);
          g.fillTriangle(x - 12, y + 8, x - 4, y - 8, x - 12, y - 8);
          g.fillTriangle(x + 2, y + 8, x + 10, y - 8, x + 12, y + 8);
        } else {
          // stray spark
          g.lineStyle(2, 0xfff060, rng.range(0.5, 0.9));
          g.lineBetween(x - 4, y, x + 4, y);
          g.lineBetween(x, y - 4, x, y + 4);
        }
        break;
      }
    }
  }
}

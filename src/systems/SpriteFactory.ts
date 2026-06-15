import Phaser from "phaser";
import { getPokemon } from "../data/pokemonData";
import type { PokemonDef } from "../types";

export const PK_FRAME = 72;

/**
 * Procedurally draws a top-down 3-frame animated sprite sheet for a Pokémon.
 * Art faces up (forward = -y); set sprite.rotation = heading + PI/2.
 */
export function ensurePokemonTexture(scene: Phaser.Scene, id: number): string {
  const key = `pk-${id}`;
  if (scene.textures.exists(key)) return key;
  const def = getPokemon(id);
  return ensurePokemonTextureFromDef(scene, key, def);
}

/** Procedural sprite sheet for cameo-only Pokémon that are not roster entries. */
export function ensurePokemonTextureFromDef(scene: Phaser.Scene, key: string, def: PokemonDef): string {
  if (scene.textures.exists(key)) return key;
  const canvas = document.createElement("canvas");
  canvas.width = PK_FRAME * 3;
  canvas.height = PK_FRAME;
  const ctx = canvas.getContext("2d")!;
  for (let f = 0; f < 3; f++) {
    ctx.save();
    ctx.translate(PK_FRAME * f + PK_FRAME / 2, PK_FRAME / 2);
    drawPokemon(ctx, def, f);
    ctx.restore();
  }
  const tex = scene.textures.addCanvas(key, canvas)!;
  for (let f = 0; f < 3; f++) tex.add(f, 0, PK_FRAME * f, 0, PK_FRAME, PK_FRAME);
  return key;
}

const OUTLINE = "rgba(16,14,26,0.9)";

/** Lighten (amt > 0) or darken (amt < 0) a #rrggbb color. */
function shade(hex: string, amt: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => {
    const c = amt >= 0 ? v + (255 - v) * amt : v * (1 + amt);
    return Math.round(Math.min(255, Math.max(0, c)));
  };
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `rgb(${r},${g},${b})`;
}

function drawPokemon(ctx: CanvasRenderingContext2D, def: PokemonDef, f: number) {
  const szMult = [0.78, 0.94, 1.12][def.size] * (def.cls === "heavy" ? 1.06 : 1);
  const u = 26 * szMult;
  const swing = f === 0 ? 1 : f === 1 ? -1 : 0;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // shaded ellipse: light catches the top-left, falls off to a darker rim
  const E = (x: number, y: number, rx: number, ry: number, fill: string, rot = 0, stroke = true) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    const RX = Math.max(rx, 0.5), RY = Math.max(ry, 0.5);
    ctx.beginPath();
    ctx.ellipse(0, 0, RX, RY, 0, 0, Math.PI * 2);
    if (/^#[0-9a-fA-F]{6}$/.test(fill)) {
      const R = Math.max(RX, RY);
      const grad = ctx.createRadialGradient(-R * 0.35, -R * 0.45, R * 0.1, 0, 0, R * 1.25);
      grad.addColorStop(0, shade(fill, 0.32));
      grad.addColorStop(0.55, fill);
      grad.addColorStop(1, shade(fill, -0.28));
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = fill;
    }
    ctx.fill();
    if (stroke) {
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
    }
    ctx.restore();
  };
  const C = (x: number, y: number, r: number, fill: string, stroke = true) => E(x, y, r, r, fill, 0, stroke);
  const P = (pts: [number, number][], fill: string, stroke = true) => {
    let minY = Infinity, maxY = -Infinity;
    for (const [, py] of pts) { minY = Math.min(minY, py); maxY = Math.max(maxY, py); }
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (/^#[0-9a-fA-F]{6}$/.test(fill) && maxY > minY) {
      const grad = ctx.createLinearGradient(0, minY, 0, maxY);
      grad.addColorStop(0, shade(fill, 0.25));
      grad.addColorStop(1, shade(fill, -0.22));
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = fill;
    }
    ctx.fill();
    if (stroke) {
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
    }
  };
  /** Crescent gloss highlight on the top of a round part. */
  const gloss = (x: number, y: number, r: number) => {
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.beginPath();
    ctx.ellipse(x - r * 0.22, y - r * 0.4, r * 0.5, r * 0.26, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();
  };
  const eyes = (y: number, spread: number, r: number) => {
    for (const sx of [-1, 1]) {
      E(sx * spread, y, r * 1.05, r * 1.2, "#ffffff", 0, true);
      C(sx * spread + r * 0.12, y + r * 0.05, r * 0.62, "#1a1a22", false);
      C(sx * spread + r * 0.3, y - r * 0.22, r * 0.22, "#ffffff", false);
    }
  };
  /** Tiny smile under the eyes — most faces get one. */
  const mouth = (y: number, w: number) => {
    ctx.strokeStyle = "#1a1a22";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, y, w, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
  };

  const tailKind = (): string => {
    if (def.id === 25 || def.id === 26) return "bolt";
    const t = def.types[0];
    if (t === "fire") return "flame";
    if (t === "electric") return "bolt";
    if (t === "grass" || t === "bug") return "leaf";
    if (t === "water" || t === "dragon" || t === "ice") return "fin";
    if (t === "normal" || t === "fighting" || t === "ground" || t === "psychic") return "plain";
    return "none";
  };

  const drawTail = (x: number, y: number) => {
    const k = tailKind();
    const flick = swing * u * 0.06;
    if (k === "flame") {
      E(x + flick, y + u * 0.12, u * 0.18, u * 0.3, "#ff6a00", flick * 0.04);
      E(x + flick, y + u * 0.1, u * 0.09, u * 0.16, "#ffd23a", 0, false);
    } else if (k === "bolt") {
      P([
        [x - u * 0.07, y - u * 0.05], [x + u * 0.12 + flick, y + u * 0.12],
        [x - u * 0.02 + flick, y + u * 0.16], [x + u * 0.16 + flick, y + u * 0.38],
        [x - u * 0.12 + flick, y + u * 0.2], [x + u * 0.03, y + u * 0.14]
      ], "#f8d030");
    } else if (k === "leaf") {
      E(x + flick, y + u * 0.14, u * 0.14, u * 0.26, "#3f9e4e", 0.3 + flick * 0.05);
    } else if (k === "fin") {
      P([[x, y - u * 0.05], [x - u * 0.18 + flick, y + u * 0.34], [x + u * 0.18 + flick, y + u * 0.3]], def.belly);
    } else if (k === "plain") {
      E(x + flick, y + u * 0.1, u * 0.12, u * 0.2, def.body);
    }
  };

  switch (def.shape) {
    case "quad": {
      drawTail(0, u * 0.58);
      // legs: diagonal pairs alternate
      for (const [lx, ly, pair] of [[-0.4, -0.26, 1], [0.4, -0.26, -1], [-0.42, 0.36, -1], [0.42, 0.36, 1]] as [number, number, number][]) {
        E(lx * u, ly * u + pair * swing * u * 0.1, u * 0.13, u * 0.19, def.body);
      }
      E(0, u * 0.06, u * 0.5, u * 0.6, def.body);
      ctx.globalAlpha = 0.6;
      E(0, u * 0.12, u * 0.28, u * 0.38, def.belly, 0, false);
      ctx.globalAlpha = 1;
      C(-u * 0.2, -u * 0.05, u * 0.06, def.accent, false);
      C(u * 0.22, u * 0.18, u * 0.06, def.accent, false);
      C(0, -u * 0.48, u * 0.34, def.body);
      // ears
      const earStyle = def.id === 25 || def.id === 26 || def.id === 133 ? 2 : (def.id * 7) % 3;
      if (earStyle === 2) {
        for (const sx of [-1, 1]) {
          P([[sx * u * 0.14, -u * 0.7], [sx * u * 0.38, -u * 1.06], [sx * u * 0.3, -u * 0.62]], def.body);
          C(sx * u * 0.34, -u * 0.98, u * 0.07, def.accent, false);
        }
      } else if (earStyle === 1) {
        for (const sx of [-1, 1]) C(sx * u * 0.26, -u * 0.68, u * 0.12, def.body);
      } else {
        for (const sx of [-1, 1]) P([[sx * u * 0.1, -u * 0.66], [sx * u * 0.3, -u * 0.88], [sx * u * 0.32, -u * 0.6]], def.body);
      }
      gloss(0, -u * 0.48, u * 0.34);
      if (def.types.includes("electric")) {
        for (const sx of [-1, 1]) C(sx * u * 0.26, -u * 0.42, u * 0.07, "#e84a3a", false);
      }
      eyes(-u * 0.52, u * 0.14, u * 0.085);
      mouth(-u * 0.42, u * 0.09);
      break;
    }
    case "biped": {
      if (def.types[0] === "fire") drawTail(0, u * 0.52);
      for (const sx of [-1, 1]) {
        E(sx * u * 0.2, u * 0.5 + sx * swing * u * 0.09, u * 0.13, u * 0.18, def.body);
      }
      E(0, u * 0.08, u * 0.42, u * 0.5, def.body);
      ctx.globalAlpha = 0.65;
      E(0, u * 0.12, u * 0.26, u * 0.32, def.belly, 0, false);
      ctx.globalAlpha = 1;
      for (const sx of [-1, 1]) {
        C(sx * u * 0.46, -u * 0.02 - sx * swing * u * 0.08, u * 0.11, def.body);
      }
      C(0, -u * 0.42, u * 0.36, def.body);
      if (def.id === 94) { // Gengar spikes
        for (let i = -2; i <= 2; i++) {
          P([[i * u * 0.16 - u * 0.06, -u * 0.66], [i * u * 0.16, -u * 0.92], [i * u * 0.16 + u * 0.06, -u * 0.66]], def.body);
        }
      }
      gloss(0, -u * 0.42, u * 0.36);
      if (def.types.includes("electric")) {
        for (const sx of [-1, 1]) C(sx * u * 0.27, -u * 0.36, u * 0.07, "#e84a3a", false);
      }
      eyes(-u * 0.46, u * 0.13, u * 0.085);
      mouth(-u * 0.36, u * 0.09);
      break;
    }
    case "bird": {
      // tail feathers
      for (const a of [-0.45, 0, 0.45]) {
        E(Math.sin(a) * u * 0.2, u * 0.55 + Math.abs(a) * u * 0.04, u * 0.1, u * 0.26, def.belly, a);
      }
      const wingRot = f === 0 ? -0.55 : f === 1 ? 0.3 : -0.1;
      const wingY = f === 0 ? -u * 0.1 : f === 1 ? u * 0.06 : 0;
      const wingCol = def.types[0] === "fire" && def.types.includes("flying") ? def.accent : def.belly;
      E(-u * 0.62, u * 0.02 + wingY, u * 0.55, u * 0.2, wingCol, -0.5 - wingRot);
      E(u * 0.62, u * 0.02 + wingY, u * 0.55, u * 0.2, wingCol, 0.5 + wingRot);
      E(0, u * 0.05, u * 0.36, u * 0.52, def.body);
      C(0, -u * 0.5, u * 0.3, def.body);
      P([[-u * 0.07, -u * 0.74], [u * 0.07, -u * 0.74], [0, -u * 0.95]], "#f0a030");
      if (def.types[0] === "fire") drawTail(0, u * 0.6);
      gloss(0, -u * 0.5, u * 0.3);
      eyes(-u * 0.54, u * 0.12, u * 0.075);
      break;
    }
    case "fish": {
      const tip = swing * u * 0.2;
      P([[0, u * 0.42], [-u * 0.16 + tip, u * 0.88], [u * 0.16 + tip, u * 0.84]], def.belly);
      for (const sx of [-1, 1]) {
        E(sx * u * 0.4, u * 0.08, u * 0.2, u * 0.1, def.belly, sx * (0.5 + swing * 0.12));
      }
      E(0, -u * 0.04, u * 0.36, u * 0.56, def.body);
      ctx.globalAlpha = 0.55;
      E(0, -u * 0.02, u * 0.2, u * 0.4, def.belly, 0, false);
      ctx.globalAlpha = 1;
      gloss(0, -u * 0.3, u * 0.3);
      eyes(-u * 0.4, u * 0.13, u * 0.08);
      mouth(-u * 0.24, u * 0.08);
      break;
    }
    case "serpent": {
      const rocky = def.types.includes("rock");
      for (let i = 4; i >= 1; i--) {
        const xo = Math.sin(f * 2.1 + i * 1.25) * u * 0.17;
        const yo = -u * 0.5 + i * u * 0.3;
        const r = u * (0.27 - i * 0.03);
        C(xo, yo, r, i % 2 === 0 || !rocky ? def.body : def.belly);
      }
      const hx = Math.sin(f * 2.1) * u * 0.17;
      C(hx, -u * 0.55, u * 0.3, def.body);
      gloss(hx, -u * 0.55, u * 0.3);
      if (tailKind() !== "none") {
        const lx = Math.sin(f * 2.1 + 5 * 1.25) * u * 0.17;
        C(lx, -u * 0.5 + 4.6 * u * 0.3, u * 0.08, def.accent, false);
      }
      for (const sx of [-1, 1]) {
        C(hx + sx * u * 0.12, -u * 0.6, u * 0.075, "#ffffff", false);
        C(hx + sx * u * 0.12, -u * 0.62, u * 0.04, "#1a1a22", false);
      }
      break;
    }
    case "blob": {
      const ghost = def.types.includes("ghost");
      if (ghost) {
        ctx.globalAlpha = 0.35;
        C(0, 0, u * 0.68, def.belly, false);
        ctx.globalAlpha = 0.92;
      }
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 10) {
        const r = u * 0.5 * (1 + 0.1 * Math.sin(a * 5 + f * 2.1));
        const px = Math.cos(a) * r, py = Math.sin(a) * r;
        if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = def.body;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (!ghost) {
        for (const sx of [-1, 1]) C(sx * u * 0.22, u * 0.42 + (sx === swing ? u * 0.08 : 0), u * 0.09, def.body, false);
      }
      gloss(0, -u * 0.16, u * 0.4);
      eyes(-u * 0.12, u * 0.16, u * 0.1);
      mouth(u * 0.08, u * 0.1);
      break;
    }
    case "round": {
      if (def.id === 81 || def.id === 82) { // Magnemite line: magnets + one eye
        for (const sx of [-1, 1]) {
          ctx.fillStyle = "#c8ccd8";
          ctx.fillRect(sx * u * 0.4 - u * 0.1, -u * 0.16, u * 0.2, u * 0.34);
          ctx.fillStyle = sx < 0 ? "#e83a3a" : "#3a5ae8";
          ctx.fillRect(sx * u * 0.4 - u * 0.1, -u * 0.22, u * 0.2, u * 0.1);
        }
        C(0, 0, u * 0.42, def.body);
        C(0, -u * 0.02, u * 0.16, "#ffffff", false);
        C(0, -u * 0.02, u * 0.08, "#1a1a22", false);
        if (def.id === 82) { C(-u * 0.45, u * 0.4, u * 0.22, def.body); C(u * 0.45, u * 0.4, u * 0.22, def.body); }
        break;
      }
      if (def.id === 120 || def.id === 121) { // star shape
        const spikes = def.id === 120 ? 5 : 6;
        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
          const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2 + f * 0.12;
          const r = i % 2 === 0 ? u * 0.62 : u * 0.26;
          const px = Math.cos(a) * r, py = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = def.body;
        ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = OUTLINE; ctx.stroke();
        C(0, 0, u * 0.18, def.accent);
        break;
      }
      for (const sx of [-1, 1]) E(sx * u * 0.28, u * 0.48 + sx * swing * u * 0.07, u * 0.12, u * 0.1, def.body);
      C(0, 0, u * 0.55, def.body);
      if (def.id === 100 || def.id === 101) {
        ctx.beginPath();
        ctx.arc(0, 0, u * 0.55, Math.PI, Math.PI * 2);
        ctx.closePath();
        ctx.fillStyle = def.belly;
        ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = OUTLINE; ctx.stroke();
        eyes(-u * 0.2, u * 0.16, u * 0.09);
        break;
      }
      ctx.globalAlpha = 0.85;
      E(0, u * 0.18, u * 0.32, u * 0.26, def.belly, 0, false);
      ctx.globalAlpha = 1;
      if (def.id === 143) { // Snorlax: sleepy face + ears
        for (const sx of [-1, 1]) P([[sx * u * 0.22, -u * 0.46], [sx * u * 0.42, -u * 0.72], [sx * u * 0.46, -u * 0.4]], def.body);
        ctx.strokeStyle = "#1a1a22"; ctx.lineWidth = 2;
        for (const sx of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(sx * u * 0.24 - u * 0.08, -u * 0.18);
          ctx.lineTo(sx * u * 0.24 + u * 0.08, -u * 0.18);
          ctx.stroke();
        }
      } else {
        C(-u * 0.32, -u * 0.18, u * 0.06, def.accent, false);
        C(u * 0.32, -u * 0.18, u * 0.06, def.accent, false);
        gloss(0, -u * 0.2, u * 0.45);
        if (def.types.includes("electric")) {
          for (const sx of [-1, 1]) C(sx * u * 0.34, -u * 0.04, u * 0.08, "#e84a3a", false);
        }
        eyes(-u * 0.2, u * 0.16, u * 0.09);
        mouth(-u * 0.02, u * 0.1);
      }
      break;
    }
    case "mound": {
      const bounce = swing * u * 0.05;
      E(0, u * 0.42, u * 0.58, u * 0.17, "#3a2a18", 0, false);
      if (def.id === 51) { // Dugtrio
        for (const [mx, my] of [[-0.32, -0.05], [0.32, 0], [0, 0.22]] as [number, number][]) {
          E(mx * u, my * u + bounce, u * 0.24, u * 0.34, def.body);
          E(mx * u, my * u - u * 0.12 + bounce, u * 0.09, u * 0.07, def.belly, 0, false);
        }
      } else {
        E(0, u * 0.05 + bounce, u * 0.38, u * 0.5, def.body);
        E(0, -u * 0.08 + bounce, u * 0.12, u * 0.09, def.belly, 0, false);
        gloss(0, -u * 0.2 + bounce, u * 0.3);
        eyes(-u * 0.28 + bounce, u * 0.16, u * 0.07);
      }
      break;
    }
    case "shell": {
      for (const sx of [-1, 1]) {
        E(sx * u * 0.42, -u * 0.18 + sx * swing * u * 0.08, u * 0.11, u * 0.15, def.body);
        E(sx * u * 0.4, u * 0.3 - sx * swing * u * 0.08, u * 0.11, u * 0.15, def.body);
      }
      if (def.id === 98 || def.id === 99) { // crab pincers
        for (const sx of [-1, 1]) C(sx * u * 0.42, -u * 0.5, u * 0.17, def.body);
      } else {
        C(0, -u * 0.56, u * 0.22, def.body); // head
        eyes(-u * 0.6, u * 0.1, u * 0.06);
      }
      C(0, u * 0.04, u * 0.46, def.accent);
      ctx.lineWidth = 3;
      ctx.strokeStyle = def.belly;
      ctx.beginPath();
      ctx.arc(0, u * 0.04, u * 0.34, 0, Math.PI * 2);
      ctx.stroke();
      gloss(0, u * 0.04, u * 0.46);
      if (def.id === 91) { // Cloyster spikes
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          P([
            [Math.cos(a - 0.12) * u * 0.44, u * 0.04 + Math.sin(a - 0.12) * u * 0.44],
            [Math.cos(a) * u * 0.68, u * 0.04 + Math.sin(a) * u * 0.68],
            [Math.cos(a + 0.12) * u * 0.44, u * 0.04 + Math.sin(a + 0.12) * u * 0.44]
          ], def.belly);
        }
      }
      if (def.id === 98 || def.id === 99) eyes(-u * 0.3, u * 0.14, u * 0.07);
      break;
    }
  }
}

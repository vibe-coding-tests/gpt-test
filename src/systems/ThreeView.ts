import Phaser from "phaser";
import * as THREE from "three";
import { GAME_W, GAME_H } from "../constants";
import type { TrackTheme } from "../types";
import type { TrackGeometry } from "./TrackGeometry";
import type { TrackWorld } from "./TrackRenderer";
import type { Racer } from "../race/Racer";
import { buildMonRig, type MonRig } from "./monmodel";
import { getPokemon } from "../data/pokemonData";
import { clamp, rotLerp } from "../util";

export type ViewMode = "m7" | "rotate";

export const VIEW_LABELS: Record<ViewMode, string> = {
  m7: "CAMERA: CHASE 3D",
  rotate: "CAMERA: TOP-DOWN"
};

export const VIEW_CYCLE: ViewMode[] = ["m7", "rotate"];

/** Anything we can place per frame. */
type Bill =
  | Phaser.GameObjects.Sprite
  | Phaser.GameObjects.Image
  | Phaser.GameObjects.Text;

export interface BillOpts {
  /** World heading the object faces (art assumed to face screen-up at rotation 0). */
  face?: number;
  /** Raw decorative rotation (wobbles, decals) applied as-is in either view. */
  rot?: number;
  scale?: number;
  scaleY?: number;
  lift?: number;     // world px above the ground plane
  flat?: boolean;    // ground decal: laid onto the ground in 3D
  show?: boolean;    // logical visibility from the owning manager
  topDepth?: number; // depth used in top-down modes
  m7Boost?: number;  // extra 3D-only scale tweak
  /** Force a flat billboard even for Pokémon textures (distant flocks). */
  bill?: boolean;
}

/** First-person camera rigs: eye height, focal length (zoom), chase distance. */
export interface CamPreset {
  name: string;
  h: number;
  f: number;
  back: number;
  hor: number; // horizon as a fraction of screen height
  showPlayer: boolean;
}

export const CAM_PRESETS: CamPreset[] = [
  { name: "LOW", h: 54, f: 405, back: 106, hor: 0.385, showPlayer: true },
  { name: "CLASSIC", h: 86, f: 330, back: 124, hor: 0.38, showPlayer: true },
  { name: "HIGH", h: 132, f: 296, back: 172, hor: 0.43, showPlayer: true },
  { name: "BUMPER", h: 42, f: 440, back: 34, hor: 0.36, showPlayer: false },
  { name: "WIDE", h: 118, f: 270, back: 245, hor: 0.455, showPlayer: true }
];

function shade(color: number, f: number) {
  const ch = (v: number) => clamp(Math.round(v * f), 0, 255);
  return (ch((color >> 16) & 0xff) << 16) | (ch((color >> 8) & 0xff) << 8) | ch(color & 0xff);
}

interface SkyConf {
  top: number;
  bot: number;
  stars: boolean;
  sun: { col: number; az: number; el: number; r: number } | null;
  clouds: { col: number; amt: number } | null;
  ridge: { col: number; h: number; windows?: boolean } | null;
}

/** Full sky kit per environment: gradient, celestial body, clouds, skyline. */
function skyFor(theme: TrackTheme): SkyConf {
  switch (theme.deco) {
    case "forest": return {
      top: 0x2a7bd4, bot: 0xa8e0f8, stars: false,
      sun: { col: 0xfff2c0, az: 2.2, el: 0.58, r: 26 },
      clouds: { col: 0xffffff, amt: 0.9 },
      ridge: { col: 0x1d4a30, h: 0.5 }
    };
    case "plain": return {
      top: 0x3a8ae0, bot: 0xbfe8ff, stars: false,
      sun: { col: 0xfff6d0, az: 1.0, el: 0.62, r: 30 },
      clouds: { col: 0xffffff, amt: 0.95 },
      ridge: { col: 0x4a6a8a, h: 0.36 }
    };
    case "beach": return {
      top: 0x2a8ae8, bot: 0xc8ecff, stars: false,
      sun: { col: 0xfff0b0, az: 4.0, el: 0.45, r: 34 },
      clouds: { col: 0xfff8ee, amt: 0.8 },
      ridge: { col: 0x3a7a8a, h: 0.16 }
    };
    case "cave": return {
      top: 0x07060e, bot: 0x2a2238, stars: false,
      sun: null, clouds: null,
      ridge: { col: 0x191428, h: 0.62 }
    };
    case "volcano": return {
      top: 0x1a0806, bot: 0x8a2e16, stars: false,
      sun: { col: 0xff6a30, az: 5.2, el: 0.32, r: 40 },
      clouds: { col: 0x301a12, amt: 0.85 },
      ridge: { col: 0x120705, h: 0.6 }
    };
    case "ice": return {
      top: 0x4a78c8, bot: 0xd8eeff, stars: false,
      sun: { col: 0xf4faff, az: 1.6, el: 0.7, r: 22 },
      clouds: { col: 0xffffff, amt: 0.55 },
      ridge: { col: 0x9fc0dc, h: 0.52 }
    };
    case "city": return {
      top: 0x060a24, bot: 0x2c3a78, stars: true,
      sun: { col: 0xe8f0ff, az: 2.6, el: 0.74, r: 18 },
      clouds: null,
      ridge: { col: 0x10122c, h: 0.5, windows: true }
    };
    case "rocky": return {
      top: 0x4a3a6a, bot: 0xc8a878, stars: false,
      sun: { col: 0xffb060, az: 3.4, el: 0.42, r: 32 },
      clouds: { col: 0xf8e8d8, amt: 0.5 },
      ridge: { col: 0x55402f, h: 0.46 }
    };
    case "space": return {
      top: 0x020208, bot: 0x181038, stars: true,
      sun: { col: 0x8a6af0, az: 0.8, el: 0.78, r: 44 },
      clouds: null,
      ridge: null
    };
    case "ghost": return {
      top: 0x0d0a1c, bot: 0x3a2a55, stars: true,
      sun: { col: 0xd8d0f0, az: 2.0, el: 0.72, r: 30 },
      clouds: { col: 0x4a3a68, amt: 0.65 },
      ridge: { col: 0x221a35, h: 0.55 }
    };
    case "moon": return {
      top: 0x05040f, bot: 0x26224a, stars: true,
      sun: { col: 0x6a9af0, az: 1.4, el: 0.78, r: 38 },
      clouds: null,
      ridge: { col: 0x282448, h: 0.4 }
    };
    case "plant": return {
      top: 0x0a1418, bot: 0x2a4a3a, stars: true,
      sun: { col: 0xffe88a, az: 4.6, el: 0.62, r: 16 },
      clouds: { col: 0x1c2a2a, amt: 0.5 },
      ridge: { col: 0x0c181e, h: 0.48, windows: true }
    };
    default: return {
      top: shade(theme.bg, 0.45), bot: shade(theme.bg, 1.35), stars: false,
      sun: null, clouds: null, ridge: null
    };
  }
}

/** Per-GameObject 3D stand-in: either a camera-facing textured plane or a full mon rig. */
interface Bill3D {
  kind: "plane" | "rig" | "box";
  obj: THREE.Object3D;
  mesh?: THREE.Mesh;                 // plane / box kinds
  mat?: THREE.MeshBasicMaterial;
  rig?: MonRig;
  texSig?: string;                   // texture key + frame the plane was built with
  rigKey?: string;                   // species the rig was built for
  w: number;
  h: number;
  seen: number;                      // frame stamp for mark-and-sweep
  lastX: number; lastZ: number;      // for rig gait speed
  tintColor: THREE.Color;
}

interface Particle {
  spr: THREE.Sprite;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number;
  grow: number;       // size change per second
  kind: "burst" | "ring";
}

/**
 * The 3D world renderer. Drives a Three.js scene on a canvas UNDER the
 * (transparent) Phaser canvas: real track meshes with elevation, procedural
 * 3D Pokémon models, billboarded props and 3D particles. The top-down view
 * modes still render in plain Phaser 2D. Public surface mirrors the old
 * Mode7View, so the race/managers code drives it the exact same way:
 * follow() chases the player, submit() places every world object per frame.
 */
export class ThreeView {
  scene: Phaser.Scene;
  geom: TrackGeometry;
  mode: ViewMode;
  world: TrackWorld;

  // camera state (world px; heading in radians)
  camX = 0;
  camY = 0;
  head = 0;
  camH = 0;            // ground height under the camera
  hor = GAME_H * 0.38; // current (pitched) horizon in screen px from the top

  // projection parameters (driven by the active camera preset)
  H = 86;              // eye height
  F = 330;             // focal length px
  HOR = GAME_H * 0.38;
  BACK = 124;          // camera distance behind the player
  showPlayer = true;   // bumper cam hides your own model
  camPreset = 0;
  readonly NEAR = 26;
  readonly FAR = 2400;
  readonly SPRITE = 0.58;   // screen-space fx scale tune (kept for effects.ts)

  private speedK = 0;
  private Feff = 330;

  // --- three.js ---
  private renderer: THREE.WebGLRenderer;
  private scene3 = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private canvas: HTMLCanvasElement;
  private groundTex!: THREE.CanvasTexture; // assigned in buildGround()
  private skyGroup = new THREE.Group();
  private bills = new Map<Bill, Bill3D>();
  private texCache = new Map<string, THREE.Texture>();
  private particles: Particle[] = [];
  private particlePool: THREE.Sprite[] = [];
  private softTex: THREE.Texture;
  private ringTex: THREE.Texture;
  private frame = 0;
  private flushAcc = 0;
  private themeBg: number;
  private disposables: { dispose(): void }[] = [];

  constructor(
    scene: Phaser.Scene,
    geom: TrackGeometry,
    theme: TrackTheme,
    world: TrackWorld,
    initialMode: ViewMode
  ) {
    this.scene = scene;
    this.geom = geom;
    this.world = world;
    this.mode = initialMode;
    this.themeBg = theme.bg;

    // --- canvas layering: three.js under the transparent Phaser canvas ---
    const pCanvas = scene.game.canvas;
    const parent = pCanvas.parentElement!;
    parent.style.position = "relative";
    pCanvas.style.position = "relative";
    pCanvas.style.zIndex = "1";
    this.canvas = document.createElement("canvas");
    this.canvas.id = "three-world";
    this.canvas.style.position = "absolute";
    this.canvas.style.zIndex = "0";
    parent.insertBefore(this.canvas, pCanvas);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setSize(GAME_W, GAME_H, false);
    this.renderer.setPixelRatio(1);

    const sky = skyFor(theme);
    this.scene3.fog = new THREE.Fog(sky.bot, this.FAR * 0.42, this.FAR * 0.96);
    this.camera = new THREE.PerspectiveCamera(70, GAME_W / GAME_H, 6, this.FAR * 1.3);

    // --- lights: ambient wash + a sun keyed to the sky's celestial body ---
    const dark = !!theme.dark || ["cave", "space", "ghost", "moon", "city", "plant", "volcano"].includes(theme.deco);
    this.scene3.add(new THREE.AmbientLight(0xffffff, dark ? 1.45 : 1.9));
    const az = sky.sun?.az ?? 2.2;
    const sun = new THREE.DirectionalLight(sky.sun?.col ?? 0xffffff, dark ? 0.9 : 1.4);
    sun.position.set(Math.cos(az) * 900, 300 + (sky.sun?.el ?? 0.5) * 900, Math.sin(az) * 900);
    this.scene3.add(sun);

    this.buildGround(theme);
    this.buildSky(sky);

    this.softTex = this.makeSoftTex();
    this.ringTex = this.makeRingTex();

    this.applyMode();
  }

  // ------------------------------------------------------------- ground

  /** Elevation of the world ground plane at a world point (px). */
  groundH(x: number, y: number): number {
    const def = this.geom.def;
    const p = this.geom.project(x, y);
    let h = 0;
    if (this.geom.hasHills) {
      // hills fade out away from the corridor so the surrounding terrain stays calm
      const fade = clamp(1 - (Math.abs(p.d) - def.corridorHalf - 40) / 260, 0, 1);
      h = this.geom.heightAt(p.s) * fade;
    }
    if (this.geom.featureAtProj(p)?.kind === "gap") {
      h -= 520;
    }
    if (def.edgeMode === "fall") {
      // floating course: the world drops away into the void past the corridor
      const over = Math.abs(p.d) - (def.corridorHalf + 26);
      if (over > 0) h -= Math.pow(clamp(over / 200, 0, 1), 1.6) * 640;
    }
    return h;
  }

  private buildGround(theme: TrackTheme) {
    const W = this.world.canvas.width, H = this.world.canvas.height;
    const segs = clamp(Math.round(Math.max(W, H) / 24), 96, 200);
    const geo = new THREE.PlaneGeometry(W, H, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + W / 2;
      const z = pos.getZ(i) + H / 2;
      pos.setY(i, this.groundH(x, z));
      pos.setX(i, x);
      pos.setZ(i, z);
    }
    geo.computeVertexNormals();

    this.groundTex = new THREE.CanvasTexture(this.world.canvas);
    // Plane UVs put v=1 at world y/z 0, matching the canvas top once Three
    // performs its usual image flip on upload.
    this.groundTex.flipY = true;
    this.groundTex.colorSpace = THREE.SRGBColorSpace;
    this.groundTex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const ground = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.groundTex }));
    this.scene3.add(ground);
    this.disposables.push(geo, ground.material as THREE.Material, this.groundTex);

    if (this.geom.def.edgeMode !== "fall") {
      // far apron in the terrain color so the painted world never shows an edge
      const apron = new THREE.Mesh(
        new THREE.PlaneGeometry(W * 7, H * 7).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: shade(theme.bg, 0.94) })
      );
      apron.position.set(W / 2, -1.5, H / 2);
      this.scene3.add(apron);
      this.disposables.push(apron.geometry, apron.material as THREE.Material);
    }
  }

  // ---------------------------------------------------------------- sky

  private buildSky(sky: SkyConf) {
    const c = document.createElement("canvas");
    c.width = 2048; c.height = 512;
    const x2 = c.getContext("2d")!;
    const css = (n: number, a = 1) => `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;

    // gradient: top color down to the horizon glow (horizon sits at ~72% down)
    const HOR_Y = c.height * 0.72;
    const grad = x2.createLinearGradient(0, 0, 0, HOR_Y);
    grad.addColorStop(0, css(sky.top));
    grad.addColorStop(1, css(sky.bot));
    x2.fillStyle = grad;
    x2.fillRect(0, 0, c.width, HOR_Y);
    x2.fillStyle = css(sky.bot);
    x2.fillRect(0, HOR_Y, c.width, c.height - HOR_Y);

    if (sky.stars) {
      for (let i = 0; i < 360; i++) {
        const sx = Math.random() * c.width, sy = Math.random() * HOR_Y * 0.92;
        x2.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.75})`;
        x2.fillRect(sx, sy, Math.random() < 0.2 ? 2 : 1, Math.random() < 0.2 ? 2 : 1);
      }
    }

    // celestial disc with glow (azimuth wraps around the cylinder)
    if (sky.sun) {
      const sx = ((sky.sun.az / (Math.PI * 2)) % 1 + 1) % 1 * c.width;
      const sy = HOR_Y * (1 - sky.sun.el * 0.82);
      const r = sky.sun.r * 1.7;
      const glow = x2.createRadialGradient(sx, sy, r * 0.3, sx, sy, r * 3.4);
      glow.addColorStop(0, css(sky.sun.col, 0.5));
      glow.addColorStop(1, css(sky.sun.col, 0));
      x2.fillStyle = glow;
      x2.fillRect(sx - r * 3.4, sy - r * 3.4, r * 6.8, r * 6.8);
      x2.fillStyle = css(sky.sun.col);
      x2.beginPath();
      x2.arc(sx, sy, r, 0, Math.PI * 2);
      x2.fill();
    }

    // drifting puffs band
    if (sky.clouds) {
      x2.fillStyle = css(sky.clouds.col, 0.5 * sky.clouds.amt);
      for (let i = 0; i < 46; i++) {
        const cx = Math.random() * c.width;
        const cy = HOR_Y * (0.18 + Math.random() * 0.5);
        const w = 60 + Math.random() * 190, h = 10 + Math.random() * 22;
        x2.beginPath();
        x2.ellipse(cx, cy, w, h, 0, 0, Math.PI * 2);
        x2.fill();
      }
    }

    // horizon silhouette (mountains / skyline / treeline)
    if (sky.ridge) {
      x2.fillStyle = css(sky.ridge.col);
      x2.beginPath();
      x2.moveTo(0, HOR_Y + 2);
      const n = 96;
      for (let i = 0; i <= n; i++) {
        const px = (i / n) * c.width;
        const a = i / n * Math.PI * 2;
        const noise = Math.sin(a * 3 + 1.7) * 0.36 + Math.sin(a * 7 + 0.4) * 0.3 + Math.sin(a * 13 + 4.2) * 0.2;
        const hgt = sky.ridge.h * HOR_Y * 0.42 * (0.45 + 0.55 * Math.abs(noise));
        x2.lineTo(px, HOR_Y + 2 - hgt);
      }
      x2.lineTo(c.width, HOR_Y + 2);
      x2.closePath();
      x2.fill();
      // wrap seam: the noise above is built from full sine cycles so it tiles
      if (sky.ridge.windows) {
        x2.fillStyle = "rgba(255,224,102,0.85)";
        for (let i = 0; i < 240; i++) {
          const wx = Math.random() * c.width;
          const wy = HOR_Y - Math.random() * sky.ridge.h * HOR_Y * 0.3;
          x2.fillRect(wx, wy, 2, 3);
        }
      }
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    const R = this.FAR * 0.98;
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(R, R, R * 1.3, 48, 1, true),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false })
    );
    // texture v=0 is the top of the canvas; horizon (72% down) should sit near eye level
    cyl.position.y = R * 1.3 * (0.72 - 0.5);
    cyl.renderOrder = -10;
    const cap = new THREE.Mesh(
      new THREE.CircleGeometry(R * 1.02, 40),
      new THREE.MeshBasicMaterial({ color: sky.top, side: THREE.BackSide, fog: false, depthWrite: false })
    );
    cap.rotation.x = Math.PI / 2;
    cap.position.y = R * 1.3 * 0.5 + cyl.position.y - 1;
    cap.renderOrder = -11;
    this.skyGroup.add(cyl, cap);
    this.scene3.add(this.skyGroup);
    this.disposables.push(tex, cyl.geometry, cyl.material as THREE.Material, cap.geometry, cap.material as THREE.Material);
  }

  // ----------------------------------------------------- mode + presets

  cycleMode(): ViewMode {
    const i = VIEW_CYCLE.indexOf(this.mode);
    this.mode = VIEW_CYCLE[(i + 1) % VIEW_CYCLE.length];
    this.applyMode();
    return this.mode;
  }

  applyMode() {
    const m7 = this.mode === "m7";
    this.canvas.style.display = m7 ? "block" : "none";
    this.world.image.setVisible(!m7);
    // 3D mode: the Phaser camera stops filling its background so the
    // three.js canvas shows through underneath
    const cam = this.scene.cameras?.main;
    if (cam) {
      if (m7) cam.setBackgroundColor("rgba(0,0,0,0)");
      else cam.setBackgroundColor(this.themeBg);
    }
    if (!m7) {
      // returning to 2D: hide every 3D stand-in and show the Phaser objects
      for (const [, b] of this.bills) b.obj.visible = false;
    }
  }

  get isM7() {
    return this.mode === "m7";
  }

  /** Swap the chase rig (eye height / zoom / distance). */
  applyCamPreset(idx: number): CamPreset {
    const p = CAM_PRESETS[((idx % CAM_PRESETS.length) + CAM_PRESETS.length) % CAM_PRESETS.length];
    this.camPreset = CAM_PRESETS.indexOf(p);
    this.H = p.h;
    this.F = p.f;
    this.BACK = p.back;
    this.HOR = GAME_H * p.hor;
    this.hor = this.HOR;
    this.showPlayer = p.showPlayer;
    this.Feff = this.F;
    return p;
  }

  /** 0..1 speed-stretch factor (smoothed by the caller). */
  setSpeed(k: number) {
    this.speedK = clamp(k, 0, 1);
  }

  /** Smoothly chase the player from behind. */
  follow(p: Racer, dt: number, snap = false) {
    const wantHead = p.status.spin > 0 ? this.head : p.heading;
    this.head = snap ? wantHead : rotLerp(this.head, wantHead, dt * 5.2);
    const peek = p.drifting ? p.driftDir * 0.085 : clamp(p.slipAngle, -0.45, 0.45) * 0.045;
    const h = this.head + peek;
    this.camX = p.x - Math.cos(h) * this.BACK;
    this.camY = p.y - Math.sin(h) * this.BACK;

    // hills: ride the ground and pitch the horizon with the slope ahead
    let wantHor = this.HOR;
    if (this.geom.hasHills) {
      this.camH = this.geom.heightAt(p.proj.s - this.BACK / this.geom.total);
      const slope = this.geom.slopeAt(p.proj.s + 90 / this.geom.total);
      wantHor = this.HOR - clamp(slope * 300, -95, 95);
    } else {
      this.camH = 0;
    }
    this.hor = snap ? wantHor : this.hor + (wantHor - this.hor) * Math.min(dt * 7, 1);

    // widen the lens with speed for that tunnel-rush feel
    this.Feff = this.F * (1 - 0.11 * this.speedK);

    // drive the actual 3D camera from the same state
    const cam = this.camera;
    cam.fov = 2 * Math.atan((GAME_H / 2) / this.Feff) * (180 / Math.PI);
    cam.updateProjectionMatrix();
    const weightDip = clamp(p.weightTransfer * 52 + Math.abs(p.lateralLoad) * 5, -10, 18);
    const eyeY = this.camH + this.H - weightDip;
    cam.position.set(this.camX, eyeY, this.camY);
    const pitch = Math.atan((GAME_H / 2 - this.hor) / this.Feff); // + looks down
    const D = 300;
    const roll = clamp(-p.lateralLoad * 0.035 + (p.drifting ? -p.driftDir * 0.018 : 0), -0.07, 0.07);
    cam.up.set(Math.sin(roll), Math.cos(roll), 0);
    cam.lookAt(
      this.camX + Math.cos(h) * D,
      eyeY - Math.tan(pitch) * D,
      this.camY + Math.sin(h) * D
    );
    this.skyGroup.position.set(this.camX, 0, this.camY);
  }

  /**
   * World ground point -> screen, for screen-space fx and floating text.
   * Same flat-projection math the Mode 7 view used — close enough for fx.
   */
  project(wx: number, wy: number) {
    const dx = wx - this.camX, dy = wy - this.camY;
    const c = Math.cos(this.head), s = Math.sin(this.head);
    const fwd = dx * c + dy * s;
    const lat = -dx * s + dy * c;
    if (fwd < this.NEAR || fwd > this.FAR) {
      return { x: 0, y: 0, persp: 0, fwd, visible: false };
    }
    const persp = this.Feff / fwd;
    const x = GAME_W / 2 + lat * persp;
    let y = this.hor + this.H * persp;
    if (this.geom.hasHills) {
      const hz = this.geom.heightAt(this.geom.project(wx, wy).s);
      y -= (hz - this.camH) * persp;
    }
    const visible = x > -260 && x < GAME_W + 260;
    return { x, y, persp, fwd, visible };
  }

  // ------------------------------------------------------------- submit

  /** Place a world object for this frame, in whichever view is active. */
  submit(go: Bill, wx: number, wy: number, o: BillOpts = {}) {
    const show = o.show ?? true;
    const sc = o.scale ?? 1;
    const scY = o.scaleY ?? sc;
    const lift = o.lift ?? 0;

    if (!this.isM7) {
      go.setVisible(show);
      if (!show) return;
      go.setPosition(wx, wy - lift * (o.flat ? 0.35 : 1));
      go.setRotation(o.face !== undefined ? o.face + Math.PI / 2 : (o.rot ?? 0));
      go.setScale(sc, scY);
      if (o.topDepth !== undefined) go.setDepth(o.topDepth);
      return;
    }

    // 3D mode: the Phaser object never draws; a 3D stand-in takes its place
    go.setVisible(false);
    const b = this.ensureBill(go, o);
    b.seen = this.frame;
    if (!show) {
      b.obj.visible = false;
      return;
    }
    b.obj.visible = true;

    const gy = this.groundH(wx, wy);
    const boost = o.m7Boost ?? 1;

    if (b.kind === "rig") {
      this.placeRig(go, b, wx, wy, gy, lift, sc * boost, scY * boost, o);
    } else if (b.kind === "box") {
      b.obj.position.set(wx, gy + lift + b.h * 0.5 * sc, wy);
      b.obj.rotation.y = (o.rot ?? 0) * 2;
      b.obj.scale.setScalar(sc * boost);
    } else {
      this.placePlane(go, b, wx, wy, gy, lift, sc * boost, scY * boost, o);
    }
  }

  private texFor(key: string, frame: string | number | undefined): THREE.Texture {
    const sig = `${key}#${frame ?? ""}`;
    let tex = this.texCache.get(sig);
    if (tex) return tex;
    const ptex = this.scene.textures.get(key);
    const src = ptex.getSourceImage() as HTMLCanvasElement | HTMLImageElement;
    const fr = ptex.get(frame as string | number | undefined);
    const cut = document.createElement("canvas");
    cut.width = Math.max(2, fr.cutWidth);
    cut.height = Math.max(2, fr.cutHeight);
    cut.getContext("2d")!.drawImage(src, fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight, 0, 0, fr.cutWidth, fr.cutHeight);
    tex = new THREE.CanvasTexture(cut);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.texCache.set(sig, tex);
    return tex;
  }

  private ensureBill(go: Bill, o: BillOpts): Bill3D {
    let b = this.bills.get(go);
    const isSprite = go instanceof Phaser.GameObjects.Sprite || go instanceof Phaser.GameObjects.Image;
    const key = isSprite ? (go as Phaser.GameObjects.Sprite).texture.key : "__text";
    const frame = isSprite ? (go as Phaser.GameObjects.Sprite).frame.name : undefined;
    const wantRig = !o.bill && key.startsWith("pk-");
    const sig = `${key}#${frame ?? ""}`;

    if (b) {
      if (b.kind === "rig") {
        if (b.rigKey !== key) { // evolved mid-race: rebuild the model
          this.dropBill(go, b);
          b = undefined;
        }
      } else if (b.kind === "plane" && b.texSig !== sig) {
        b.mat!.map = this.texFor(key, frame);
        b.mat!.needsUpdate = true;
        b.texSig = sig;
        const fr = (go as Phaser.GameObjects.Sprite).frame;
        b.w = fr.cutWidth; b.h = fr.cutHeight;
      }
      if (b) return b;
    }

    if (wantRig) {
      const id = parseInt(key.slice(3), 10) || 1;
      // model height tracks the collision radius the physics uses
      const def = getPokemon(id);
      const heightPx = (15 + def.size * 3.5 + (def.cls === "heavy" ? 3 : 0)) * 2.8;
      const rig = buildMonRig(id, heightPx);
      this.scene3.add(rig.group);
      b = {
        kind: "rig", obj: rig.group, rig, rigKey: key,
        w: heightPx, h: heightPx, seen: this.frame, lastX: 0, lastZ: 0,
        tintColor: new THREE.Color(1, 1, 1)
      };
    } else if (key === "fx-box") {
      // item boxes get the full Mario-Kart glass-cube treatment
      const group = new THREE.Group();
      const boxMat = new THREE.MeshBasicMaterial({
        color: 0x66c8ff, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false
      });
      const edge = new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), boxMat);
      const q = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 20),
        new THREE.MeshBasicMaterial({ map: this.texFor(key, frame), transparent: true, alphaTest: 0.1, depthWrite: false })
      );
      const q2 = q.clone();
      q2.rotation.y = Math.PI / 2;
      group.add(edge, q, q2);
      this.scene3.add(group);
      b = {
        kind: "box", obj: group, mesh: edge, mat: boxMat,
        w: 30, h: 30, seen: this.frame, lastX: 0, lastZ: 0, tintColor: new THREE.Color(1, 1, 1)
      };
    } else {
      const tex = this.texFor(key, frame);
      const fr = (go as Phaser.GameObjects.Sprite).frame;
      const w = fr?.cutWidth ?? 16, h = fr?.cutHeight ?? 16;
      const mat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, alphaTest: 0.06, depthWrite: true, side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      this.scene3.add(mesh);
      b = {
        kind: "plane", obj: mesh, mesh, mat, texSig: sig,
        w, h, seen: this.frame, lastX: 0, lastZ: 0, tintColor: new THREE.Color(1, 1, 1)
      };
    }
    this.bills.set(go, b);
    return b;
  }

  private placePlane(
    go: Bill, b: Bill3D, wx: number, wy: number, gy: number,
    lift: number, sc: number, scY: number, o: BillOpts
  ) {
    const m = b.mesh!;
    const w = b.w * sc, h = b.h * scY;
    m.scale.set(w, h, 1);

    // tint + alpha follow the Phaser object so status flashes carry over
    const alpha = (go as Phaser.GameObjects.Sprite).alpha ?? 1;
    b.mat!.opacity = alpha;
    const sp = go as Phaser.GameObjects.Sprite;
    if (sp.isTinted) b.mat!.color.setHex(sp.tintTopLeft);
    else b.mat!.color.setRGB(1, 1, 1);

    if (o.flat) {
      // ground decal, glued just above the terrain
      m.position.set(wx, gy + 0.6, wy);
      m.rotation.set(-Math.PI / 2, 0, -(o.face !== undefined ? o.face + Math.PI / 2 : (o.rot ?? 0)), "XYZ");
      m.renderOrder = 2;
      b.mat!.depthWrite = false;
      return;
    }
    b.mat!.depthWrite = true;
    m.renderOrder = 0;

    // anchor: bottom-origin art (props) stands on the point; centered art floats
    const originY = (go as Phaser.GameObjects.Sprite).originY ?? 0.5;
    const cy = gy + lift + h * (originY >= 0.95 ? 0.5 : 0.42);
    m.position.set(wx, cy, wy);

    // camera-facing billboard with the art's own spin applied in view space
    m.quaternion.copy(this.camera.quaternion);
    const spin = o.face !== undefined ? (o.face - this.head) : (o.rot ?? 0);
    if (spin) m.rotateZ(spin);
  }

  private placeRig(
    go: Bill, b: Bill3D, wx: number, wy: number, gy: number,
    lift: number, sc: number, scY: number, o: BillOpts
  ) {
    const g = b.obj;
    g.position.set(wx, gy + lift, wy);
    // models are built facing +Z; world heading h faces (cos h, sin h) in XZ
    if (o.face !== undefined) {
      g.rotation.y = Math.PI / 2 - o.face;
      g.rotation.x = 0;
      g.rotation.z = o.rot ?? 0; // body roll: drift lean, cornering
    } else {
      // no facing supplied (wilds, landmarks): face the camera, Snap-style
      g.rotation.y = Math.PI / 2 - Math.atan2(wy - this.camY, wx - this.camX) + Math.PI;
      // decorative rot becomes a tumble (rolling boulders) / idle nod (wilds)
      g.rotation.x = o.rot ?? 0;
      g.rotation.z = 0;
    }
    g.scale.set(sc, scY, sc);

    const sp = go as Phaser.GameObjects.Sprite;
    b.rig!.setOpacity(sp.alpha ?? 1);
    if (sp.isTinted && sp.tintTopLeft !== 0xffffff) {
      b.tintColor.setHex(sp.tintTopLeft);
      b.rig!.tint(b.tintColor, 0.65);
    } else {
      b.rig!.tint(b.tintColor, 0);
    }
  }

  private dropBill(go: Bill, b: Bill3D) {
    this.scene3.remove(b.obj);
    if (b.kind === "rig") b.rig!.dispose();
    if (b.mat) b.mat.dispose();
    if (b.mesh) b.mesh.geometry.dispose();
    if (b.kind === "box") {
      b.obj.traverse((c) => {
        const mesh = c as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry?.dispose();
          (mesh.material as THREE.Material)?.dispose();
        }
      });
    }
    this.bills.delete(go);
  }

  // -------------------------------------------------------- 3D particles

  private makeSoftTex(): THREE.Texture {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x2 = c.getContext("2d")!;
    const g = x2.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.55, "rgba(255,255,255,0.6)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x2.fillStyle = g;
    x2.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  private makeRingTex(): THREE.Texture {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x2 = c.getContext("2d")!;
    x2.strokeStyle = "rgba(255,255,255,1)";
    x2.lineWidth = 5;
    x2.beginPath();
    x2.arc(32, 32, 26, 0, Math.PI * 2);
    x2.stroke();
    return new THREE.CanvasTexture(c);
  }

  private obtainSprite(tex: THREE.Texture, color: number): THREE.Sprite {
    let s = this.particlePool.pop();
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      }));
      this.scene3.add(s);
    }
    const m = s.material as THREE.SpriteMaterial;
    m.map = tex;
    m.color.setHex(color);
    m.opacity = 0.95;
    s.visible = true;
    return s;
  }

  /** Radial burst of glowing particles at a world point. */
  burst3d(x: number, y: number, opts: { color?: number; n?: number; spd?: number; life?: number; size?: number } = {}) {
    if (!this.isM7) return;
    const { color = 0xffffff, n = 8, spd = 90, life = 380, size = 5 } = opts;
    const gy = this.groundH(x, y) + 12;
    for (let i = 0; i < n; i++) {
      if (this.particles.length > 240) break;
      const a = Math.random() * Math.PI * 2;
      const v = spd * (0.4 + Math.random() * 0.8);
      const s = this.obtainSprite(this.softTex, color);
      s.position.set(x, gy + Math.random() * 10, y);
      s.scale.setScalar(size * 2.2);
      this.particles.push({
        spr: s,
        vx: Math.cos(a) * v, vy: 30 + Math.random() * 55, vz: Math.sin(a) * v,
        life: life / 1000 * (0.7 + Math.random() * 0.6), maxLife: life / 1000,
        grow: -size * 1.2, kind: "burst"
      });
    }
  }

  /** Expanding shockwave ring at a world point. */
  ring3d(x: number, y: number, color: number, radius = 60) {
    if (!this.isM7) return;
    const s = this.obtainSprite(this.ringTex, color);
    s.position.set(x, this.groundH(x, y) + 14, y);
    s.scale.setScalar(14);
    this.particles.push({
      spr: s, vx: 0, vy: 0, vz: 0,
      life: 0.42, maxLife: 0.42, grow: radius * 4.6, kind: "ring"
    });
  }

  /** Lightning strike: a stack of glow sprites flashing down onto a point. */
  bolt3d(x: number, y: number) {
    if (!this.isM7) return;
    const gy = this.groundH(x, y);
    for (let i = 0; i < 7; i++) {
      const s = this.obtainSprite(this.softTex, i % 2 ? 0xfff060 : 0xffffff);
      s.position.set(x + (Math.random() * 14 - 7), gy + 16 + i * 34, y + (Math.random() * 14 - 7));
      s.scale.setScalar(26 - i * 2);
      this.particles.push({ spr: s, vx: 0, vy: -60, vz: 0, life: 0.22, maxLife: 0.22, grow: -20, kind: "burst" });
    }
    const flash = this.obtainSprite(this.softTex, 0xfff8a0);
    flash.position.set(x, gy + 14, y);
    flash.scale.setScalar(50);
    this.particles.push({ spr: flash, vx: 0, vy: 0, vz: 0, life: 0.3, maxLife: 0.3, grow: 140, kind: "burst" });
  }

  // -------------------------------------------------------------- update

  /** Per-frame: animate rigs + particles, sweep stale stand-ins, render. */
  update(dt: number) {
    this.frame++;

    // skid marks were stamped into the shared world canvas; re-upload is the
    // expensive part, so throttle it
    this.flushAcc += dt;
    if (this.flushAcc >= 0.35) {
      this.flushAcc = 0;
      if (this.world.flush(!this.isM7) && this.isM7) {
        this.groundTex.needsUpdate = true;
      }
    }

    if (!this.isM7) return;

    // mirror the Phaser canvas CSS box so both layers line up under Scale.FIT
    const pc = this.scene.game.canvas;
    const st = this.canvas.style;
    if (st.width !== pc.style.width) st.width = pc.style.width;
    if (st.height !== pc.style.height) st.height = pc.style.height;
    const left = pc.offsetLeft + "px", top = pc.offsetTop + "px";
    if (st.left !== left) st.left = left;
    if (st.top !== top) st.top = top;

    // animate every live rig: gait speed from how far it moved this frame
    for (const [go, b] of this.bills) {
      // submits for this frame happened before update(); anything older is stale
      if (b.seen < this.frame - 1) {
        b.obj.visible = false;
        if (!(go as Phaser.GameObjects.Sprite).scene) this.dropBill(go, b);
        continue;
      }
      if (b.kind === "rig" && b.obj.visible) {
        const dx = b.obj.position.x - b.lastX;
        const dz = b.obj.position.z - b.lastZ;
        b.lastX = b.obj.position.x;
        b.lastZ = b.obj.position.z;
        const spd = dt > 0 ? Math.hypot(dx, dz) / dt / 110 : 0;
        b.rig!.anim(dt, { speed: clamp(spd, 0, 6), water: false });
      } else if (b.kind === "box" && b.obj.visible) {
        b.obj.rotation.y += dt * 1.6;
        b.obj.rotation.x = Math.sin(this.frame * 0.02 + b.obj.position.x) * 0.25;
      }
    }

    // particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.spr.visible = false;
        this.particlePool.push(p.spr);
        this.particles.splice(i, 1);
        continue;
      }
      const k = p.life / p.maxLife;
      p.spr.position.x += p.vx * dt;
      p.spr.position.y += p.vy * dt;
      p.spr.position.z += p.vz * dt;
      if (p.kind === "burst") p.vy -= 110 * dt;
      const ns = Math.max(2, p.spr.scale.x + p.grow * dt);
      p.spr.scale.setScalar(ns);
      (p.spr.material as THREE.SpriteMaterial).opacity = (p.kind === "ring" ? 0.9 : 0.85) * k;
    }

    this.renderer.render(this.scene3, this.camera);
  }

  stats() {
    let rigs = 0;
    let visibleBills = 0;
    for (const b of this.bills.values()) {
      if (b.obj.visible) visibleBills++;
      if (b.kind === "rig" && b.obj.visible) rigs++;
    }
    return {
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      bills: visibleBills,
      rigs,
      particles: this.particles.length
    };
  }

  destroy() {
    for (const [go, b] of [...this.bills]) this.dropBill(go, b);
    for (const p of this.particles) p.spr.visible = false;
    for (const s of [...this.particlePool, ...this.particles.map((p) => p.spr)]) {
      (s.material as THREE.Material).dispose();
    }
    for (const t of this.texCache.values()) t.dispose();
    this.softTex.dispose();
    this.ringTex.dispose();
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}

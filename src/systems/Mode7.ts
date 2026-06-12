import Phaser from "phaser";
import { GAME_W, GAME_H } from "../constants";
import type { TrackTheme } from "../types";
import type { TrackGeometry } from "./TrackGeometry";
import type { Racer } from "../race/Racer";
import { clamp, rotLerp } from "../util";

export type ViewMode = "m7" | "rotate" | "north";

export const VIEW_LABELS: Record<ViewMode, string> = {
  m7: "CAMERA: FIRST PERSON",
  rotate: "CAMERA: TOP (ROTATE)",
  north: "CAMERA: TOP (NORTH-UP)"
};

export const VIEW_CYCLE: ViewMode[] = ["m7", "rotate", "north"];

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
  flat?: boolean;    // ground decal: squashed in m7 instead of standing up
  show?: boolean;    // logical visibility from the owning manager
  topDepth?: number; // depth used in top-down modes
  m7Boost?: number;  // extra m7-only scale tweak
}

const FRAG = `
precision mediump float;

uniform vec2 uResolution;
uniform float uTime;
uniform sampler2D uTrack;
uniform vec2 uCam;
uniform float uHead;
uniform float uHeight;
uniform float uFocal;
uniform float uHorizon;
uniform vec2 uTexSize;
uniform float uFar;
uniform vec3 uSkyTop;
uniform vec3 uSkyBot;
uniform vec3 uOutside;
uniform float uFlipY;
uniform float uStars;
uniform vec3 uSunCol;
uniform vec3 uSunCfg;    // x: world azimuth, y: elevation 0..1 of horizon, z: radius px (0 = none)
uniform vec3 uCloudCol;
uniform float uCloudAmt;
uniform vec3 uRidgeCol;
uniform vec2 uRidgeCfg;  // x: height fraction of horizon (0 = none), y: lit windows flag

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// 2D value noise (smooth)
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main () {
  vec2 fc = gl_FragCoord.xy;
  float yTop = uResolution.y - fc.y;

  if (yTop <= uHorizon) {
    float t = clamp(yTop / max(uHorizon, 1.0), 0.0, 1.0);
    vec3 sky = mix(uSkyTop, uSkyBot, t);

    // view azimuth of this column; circle-mapped so it tiles over a full turn
    float az = uHead + (fc.x - uResolution.x * 0.5) / uFocal;
    vec2 cir = vec2(cos(az), sin(az));

    if (uStars > 0.5) {
      vec2 cell = floor(vec2(fract(az / 6.28318) * 940.0, yTop / 2.0));
      float h = hash(cell);
      if (h > 0.9965) sky += vec3(0.9) * clamp((h - 0.9965) * 280.0, 0.0, 1.0);
    }

    // drifting clouds: direction noise for placement, vertical noise for puff
    if (uCloudAmt > 0.01) {
      vec2 cp = cir * 2.1 + vec2(uTime * 0.011, uTime * 0.007);
      float n = vnoise(cp) * 0.55
              + vnoise(vec2(t * 4.6 + cir.x * 2.0, cir.y * 3.1) + 31.0) * 0.45;
      float band = smoothstep(0.04, 0.3, t) * (1.0 - smoothstep(0.62, 0.96, t));
      float m = smoothstep(0.54, 0.76, n) * band * uCloudAmt;
      sky = mix(sky, uCloudCol, m * 0.9);
    }

    // sun / moon / planet disc with glow
    if (uSunCfg.z > 0.5) {
      float dAz = atan(sin(az - uSunCfg.x), cos(az - uSunCfg.x));
      vec2 dp = vec2(dAz * uFocal, yTop - uHorizon * (1.0 - uSunCfg.y));
      float dd = length(dp);
      sky += uSunCol * 0.4 * exp(-dd / (uSunCfg.z * 2.6));
      sky = mix(sky, uSunCol, smoothstep(uSunCfg.z, uSunCfg.z * 0.78, dd));
    }

    // horizon silhouette (mountains / skyline / treeline)
    if (uRidgeCfg.x > 0.001) {
      float rn = vnoise(cir * 2.3 + 51.0) * 0.62 + vnoise(cir * 6.1 + 7.0) * 0.38;
      float crest = uHorizon * (1.0 - uRidgeCfg.x * (0.25 + rn * 0.75));
      if (yTop > crest) {
        vec3 rc = uRidgeCol;
        if (uRidgeCfg.y > 0.5) {
          // lit windows in the skyline
          vec2 wc = floor(vec2(fract(az / 6.28318) * 420.0, yTop / 5.0));
          if (hash(wc) > 0.9 && yTop > crest + 4.0) rc += vec3(0.5, 0.42, 0.18);
        }
        // slight depth haze toward the crest
        float k = smoothstep(crest, crest + 26.0, yTop);
        sky = mix(sky, mix(mix(sky, rc, 0.72), rc, k), smoothstep(crest, crest + 2.5, yTop));
      }
    }

    // horizon glow line
    sky += uSkyBot * 0.16 * smoothstep(0.92, 1.0, t);
    gl_FragColor = vec4(sky, 1.0);
    return;
  }

  float dy = yTop - uHorizon;
  float fwd = (uHeight * uFocal) / dy;
  float lat = (fc.x - uResolution.x * 0.5) * fwd / uFocal;
  float c = cos(uHead), s = sin(uHead);
  vec2 world = uCam + vec2(c * fwd - s * lat, s * fwd + c * lat);
  vec2 uv = world / uTexSize;

  vec3 ground;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    ground = uOutside;
  } else {
    if (uFlipY > 0.5) uv.y = 1.0 - uv.y;
    ground = texture2D(uTrack, uv).rgb;
  }

  float fog = smoothstep(uFar * 0.4, uFar, fwd);
  gl_FragColor = vec4(mix(ground, uSkyBot, fog), 1.0);
}
`;

function hex3(color: number) {
  return {
    x: ((color >> 16) & 0xff) / 255,
    y: ((color >> 8) & 0xff) / 255,
    z: (color & 0xff) / 255
  };
}

function shade(color: number, f: number) {
  const r = clamp(Math.round(((color >> 16) & 0xff) * f), 0, 255);
  const g = clamp(Math.round(((color >> 8) & 0xff) * f), 0, 255);
  const b = clamp(Math.round((color & 0xff) * f), 0, 255);
  return (r << 16) | (g << 8) | b;
}

interface SkyConf {
  top: number;
  bot: number;
  stars: boolean;
  /** celestial disc: color, world azimuth, elevation (0..1 of horizon), radius px */
  sun: { col: number; az: number; el: number; r: number } | null;
  clouds: { col: number; amt: number } | null;
  /** horizon silhouette: color, height fraction, lit windows */
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
      sun: null,
      clouds: null,
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
  { name: "BUMPER", h: 42, f: 440, back: 34, hor: 0.36, showPlayer: false }
];

/**
 * SNES-style Mode 7 view: a fullscreen ground shader re-projects the baked
 * track texture in perspective, and every world object is placed per frame
 * through submit(), which billboards it (m7) or passes world coords through
 * (top-down modes).
 */
export class Mode7View {
  scene: Phaser.Scene;
  geom: TrackGeometry;
  mode: ViewMode;
  shader: Phaser.GameObjects.Shader;
  worldRT: Phaser.GameObjects.RenderTexture;

  // camera state
  camX = 0;
  camY = 0;
  head = 0;
  camH = 0;            // ground height under the camera
  hor = GAME_H * 0.38; // current (pitched) horizon

  // projection parameters (driven by the active camera preset)
  H = 86;              // eye height
  F = 330;             // focal length px
  HOR = GAME_H * 0.38;
  BACK = 124;          // camera distance behind the player
  showPlayer = true;   // bumper cam hides your own sprite
  camPreset = 0;
  readonly NEAR = 26;
  readonly FAR = 2400;
  readonly SPRITE = 0.58;   // global billboard scale tune

  // speed FOV: high speed / boosts widen the lens for that tunnel-rush feel
  private speedK = 0;
  private Feff = 330;

  constructor(
    scene: Phaser.Scene,
    geom: TrackGeometry,
    theme: TrackTheme,
    worldRT: Phaser.GameObjects.RenderTexture,
    trackTexKey: string,
    initialMode: ViewMode
  ) {
    this.scene = scene;
    this.geom = geom;
    this.worldRT = worldRT;
    this.mode = initialMode;

    const sky = skyFor(theme);
    const base = new Phaser.Display.BaseShader("m7-ground", FRAG, undefined, {
      uTrack: { type: "sampler2D", value: null },
      uCam: { type: "2f", value: { x: 0, y: 0 } },
      uHead: { type: "1f", value: 0 },
      uHeight: { type: "1f", value: this.H },
      uFocal: { type: "1f", value: this.F },
      uHorizon: { type: "1f", value: this.HOR },
      uTexSize: { type: "2f", value: { x: geom.worldW, y: geom.worldH } },
      uFar: { type: "1f", value: this.FAR },
      uSkyTop: { type: "3f", value: hex3(sky.top) },
      uSkyBot: { type: "3f", value: hex3(sky.bot) },
      uOutside: { type: "3f", value: hex3(theme.bg) },
      uFlipY: { type: "1f", value: 0 },
      uStars: { type: "1f", value: sky.stars ? 1 : 0 },
      uSunCol: { type: "3f", value: hex3(sky.sun?.col ?? 0) },
      uSunCfg: { type: "3f", value: { x: sky.sun?.az ?? 0, y: sky.sun?.el ?? 0.5, z: sky.sun?.r ?? 0 } },
      uCloudCol: { type: "3f", value: hex3(sky.clouds?.col ?? 0xffffff) },
      uCloudAmt: { type: "1f", value: sky.clouds?.amt ?? 0 },
      uRidgeCol: { type: "3f", value: hex3(sky.ridge?.col ?? 0) },
      uRidgeCfg: { type: "2f", value: { x: sky.ridge?.h ?? 0, y: sky.ridge?.windows ? 1 : 0 } }
    });

    this.shader = scene.add.shader(base, 0, 0, GAME_W, GAME_H)
      .setOrigin(0, 0)
      .setDepth(0.5)
      .setScrollFactor(0);
    this.shader.setSampler2D("uTrack", trackTexKey);

    this.applyMode();
  }

  cycleMode(): ViewMode {
    const i = VIEW_CYCLE.indexOf(this.mode);
    this.mode = VIEW_CYCLE[(i + 1) % VIEW_CYCLE.length];
    this.applyMode();
    return this.mode;
  }

  /** Swap the first-person rig (eye height / zoom / chase distance). */
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
    this.shader.getUniform("uHeight").value = this.H;
    this.shader.getUniform("uFocal").value = this.Feff;
    this.shader.getUniform("uHorizon").value = this.hor;
    return p;
  }

  /** 0..1 speed-stretch factor (smoothed by the caller). */
  setSpeed(k: number) {
    this.speedK = clamp(k, 0, 1);
  }

  applyMode() {
    const m7 = this.mode === "m7";
    this.shader.setVisible(m7);
    this.worldRT.setVisible(!m7);
  }

  get isM7() {
    return this.mode === "m7";
  }

  /** Smoothly chase the player from behind. */
  follow(p: Racer, dt: number, snap = false) {
    const wantHead = p.status.spin > 0 ? this.head : p.heading;
    this.head = snap ? wantHead : rotLerp(this.head, wantHead, dt * 5.2);
    const peek = p.drifting ? p.driftDir * 0.085 : 0;
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

    // widen the lens with speed (billboards project through the same Feff
    // so they stay glued to the ground shader)
    this.Feff = this.F * (1 - 0.11 * this.speedK);

    const sh = this.shader;
    const cam = sh.getUniform("uCam");
    cam.value.x = this.camX;
    cam.value.y = this.camY;
    sh.getUniform("uHead").value = h;
    sh.getUniform("uHorizon").value = this.hor;
    sh.getUniform("uFocal").value = this.Feff;
  }

  /** World ground point -> screen. */
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

    if (!show) {
      go.setVisible(false);
      return;
    }
    const pr = this.project(wx, wy);
    if (!pr.visible) {
      go.setVisible(false);
      return;
    }
    go.setVisible(true);
    const boost = (o.m7Boost ?? 1) * this.SPRITE;
    const k = pr.persp * boost;
    go.setPosition(pr.x, pr.y - (o.flat ? 0 : lift * pr.persp));
    go.setRotation(o.face !== undefined ? o.face - this.head : (o.rot ?? 0));
    go.setScale(sc * k, scY * k * (o.flat ? 0.52 : 1));
    go.setDepth(1000 + clamp((this.FAR - pr.fwd) * 0.02, 0, 100) + (o.flat ? -2 : 0));
  }

  destroy() {
    this.shader.destroy();
  }
}

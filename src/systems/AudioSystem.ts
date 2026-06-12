import { Save } from "./SaveSystem";
import { midi2freq } from "../util";
import { getPokemon } from "../data/pokemonData";

type Wave = OscillatorType;

interface Pattern {
  tempo: number;
  bass: number[];
  lead: number[];
}

// 32 sixteenth-note steps per pattern (0 = rest), midi numbers.
const PATTERNS: Pattern[] = [
  { // 0 Route 1 — sunny C major
    tempo: 124,
    bass: [36, 0, 43, 0, 36, 0, 43, 0, 41, 0, 48, 0, 43, 0, 40, 0, 36, 0, 43, 0, 36, 0, 43, 0, 38, 0, 45, 0, 43, 0, 47, 0],
    lead: [72, 0, 76, 0, 79, 0, 76, 0, 74, 0, 77, 0, 81, 0, 0, 0, 72, 0, 76, 0, 79, 0, 83, 0, 81, 79, 77, 76, 74, 0, 72, 0]
  },
  { // 1 Viridian Forest — gentle waltz-ish A minor
    tempo: 112,
    bass: [33, 0, 40, 0, 45, 0, 33, 0, 31, 0, 38, 0, 43, 0, 31, 0, 29, 0, 36, 0, 41, 0, 29, 0, 31, 0, 38, 0, 43, 0, 35, 0],
    lead: [69, 0, 0, 72, 0, 76, 0, 0, 74, 0, 71, 0, 67, 0, 0, 0, 69, 0, 0, 72, 0, 77, 0, 0, 76, 0, 74, 0, 71, 0, 69, 0]
  },
  { // 2 Cerulean Cape — bouncy major 7 beach
    tempo: 120,
    bass: [38, 0, 45, 0, 38, 0, 45, 0, 43, 0, 50, 0, 43, 0, 50, 0, 36, 0, 43, 0, 36, 0, 43, 0, 41, 0, 48, 0, 45, 0, 43, 0],
    lead: [74, 0, 78, 0, 81, 0, 85, 0, 0, 0, 83, 0, 81, 0, 78, 0, 76, 0, 79, 0, 83, 0, 0, 0, 81, 0, 79, 0, 76, 0, 74, 0]
  },
  { // 3 Rock Tunnel — slow dark minor
    tempo: 104,
    bass: [31, 0, 0, 0, 38, 0, 0, 0, 30, 0, 0, 0, 37, 0, 0, 0, 29, 0, 0, 0, 36, 0, 0, 0, 31, 0, 34, 0, 38, 0, 41, 0],
    lead: [62, 0, 0, 0, 65, 0, 63, 0, 62, 0, 0, 0, 58, 0, 0, 0, 62, 0, 0, 0, 67, 0, 65, 0, 63, 0, 62, 0, 60, 0, 58, 0]
  },
  { // 4 Cinnabar Volcano — driving phrygian
    tempo: 136,
    bass: [33, 33, 0, 33, 34, 0, 33, 0, 33, 33, 0, 33, 36, 0, 34, 0, 33, 33, 0, 33, 34, 0, 33, 0, 38, 0, 36, 0, 34, 0, 33, 0],
    lead: [69, 0, 70, 0, 72, 0, 69, 0, 0, 0, 70, 0, 69, 0, 65, 0, 69, 0, 70, 0, 72, 0, 76, 0, 75, 0, 72, 0, 70, 0, 69, 0]
  },
  { // 5 Seafoam — airy lydian sparkle
    tempo: 116,
    bass: [34, 0, 41, 0, 46, 0, 41, 0, 34, 0, 41, 0, 48, 0, 41, 0, 32, 0, 39, 0, 44, 0, 39, 0, 32, 0, 39, 0, 46, 0, 44, 0],
    lead: [70, 0, 0, 74, 0, 0, 77, 0, 79, 0, 0, 77, 0, 74, 0, 0, 70, 0, 0, 75, 0, 0, 79, 0, 82, 0, 79, 0, 77, 0, 75, 0]
  },
  { // 6 Saffron City — funky night minor
    tempo: 126,
    bass: [31, 0, 31, 34, 0, 31, 0, 36, 31, 0, 31, 34, 0, 38, 36, 0, 29, 0, 29, 32, 0, 29, 0, 34, 29, 0, 29, 32, 0, 36, 34, 0],
    lead: [67, 0, 0, 70, 0, 72, 0, 0, 74, 0, 72, 0, 70, 0, 67, 0, 0, 0, 65, 0, 67, 0, 70, 0, 72, 0, 70, 0, 67, 0, 65, 0]
  },
  { // 7 Victory Road — heroic
    tempo: 132,
    bass: [36, 0, 43, 0, 36, 0, 43, 0, 38, 0, 45, 0, 38, 0, 45, 0, 40, 0, 47, 0, 40, 0, 47, 0, 41, 0, 48, 0, 43, 0, 47, 0],
    lead: [72, 0, 0, 0, 76, 0, 79, 0, 84, 0, 0, 79, 0, 81, 0, 0, 83, 0, 0, 0, 79, 0, 76, 0, 81, 0, 79, 0, 76, 0, 72, 0]
  },
  { // 8 Indigo Plateau — fast rainbow finale
    tempo: 148,
    bass: [36, 0, 43, 48, 0, 43, 36, 0, 41, 0, 48, 53, 0, 48, 41, 0, 38, 0, 45, 50, 0, 45, 38, 0, 43, 0, 50, 0, 47, 0, 43, 0],
    lead: [72, 76, 79, 84, 0, 79, 76, 0, 77, 81, 84, 86, 0, 84, 81, 0, 74, 77, 81, 86, 0, 81, 77, 0, 79, 83, 86, 88, 0, 86, 83, 79]
  },
  { // 9 menu theme
    tempo: 108,
    bass: [36, 0, 0, 0, 43, 0, 0, 0, 41, 0, 0, 0, 45, 0, 0, 0, 38, 0, 0, 0, 45, 0, 0, 0, 43, 0, 0, 0, 47, 0, 0, 0],
    lead: [72, 0, 0, 76, 0, 0, 79, 0, 0, 0, 77, 0, 76, 0, 74, 0, 72, 0, 0, 76, 0, 0, 81, 0, 0, 0, 79, 0, 77, 0, 76, 0]
  },
  { // 10 Lavender Tower — sparse, eerie, chromatic
    tempo: 96,
    bass: [33, 0, 0, 0, 0, 0, 39, 0, 32, 0, 0, 0, 0, 0, 38, 0, 31, 0, 0, 0, 0, 0, 37, 0, 32, 0, 0, 0, 38, 0, 0, 0],
    lead: [69, 0, 0, 70, 0, 0, 69, 0, 0, 0, 75, 0, 74, 0, 0, 0, 69, 0, 0, 72, 0, 0, 70, 0, 0, 0, 63, 0, 0, 0, 0, 0]
  },
  { // 11 Mt. Moon — mysterious lullaby waltz
    tempo: 110,
    bass: [29, 0, 0, 36, 0, 0, 29, 0, 0, 41, 0, 0, 27, 0, 0, 34, 0, 0, 27, 0, 0, 39, 0, 0, 26, 0, 0, 33, 0, 0, 38, 0],
    lead: [65, 0, 68, 0, 72, 0, 0, 0, 70, 0, 68, 0, 65, 0, 0, 0, 63, 0, 67, 0, 70, 0, 0, 0, 75, 0, 72, 0, 70, 0, 68, 0]
  },
  { // 12 Power Plant — buzzy 16th-note electro
    tempo: 142,
    bass: [31, 31, 0, 31, 0, 31, 34, 0, 31, 31, 0, 31, 0, 36, 34, 0, 29, 29, 0, 29, 0, 29, 32, 0, 29, 29, 0, 34, 0, 32, 31, 0],
    lead: [67, 0, 70, 0, 67, 0, 74, 0, 72, 0, 70, 0, 67, 0, 0, 0, 65, 0, 67, 0, 70, 0, 72, 0, 74, 0, 77, 0, 74, 0, 72, 0]
  }
];

class AudioSys {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bgmTimer: number | null = null;
  private bgmStep = 0;
  private bgmNext = 0;
  private bgmPattern: Pattern | null = null;
  private bgmTempoMult = 1;
  private unlocked = false;

  private ensure(): AudioContext | null {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = Save.muted ? 0 : 0.5;
        this.master.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    return this.ctx;
  }

  /** Call from a user-gesture handler to unlock audio. */
  unlock() {
    const ctx = this.ensure();
    if (ctx && ctx.state === "suspended") ctx.resume();
    this.unlocked = true;
  }

  /** Resume the context on the first gesture anywhere (covers URL-direct race starts). */
  installAutoUnlock() {
    const tryUnlock = () => {
      this.unlock();
      window.removeEventListener("pointerdown", tryUnlock);
      window.removeEventListener("keydown", tryUnlock);
    };
    window.addEventListener("pointerdown", tryUnlock);
    window.addEventListener("keydown", tryUnlock);
  }

  get muted() { return Save.muted; }

  toggleMute(): boolean {
    Save.muted = !Save.muted;
    if (this.master) this.master.gain.value = Save.muted ? 0 : 0.5;
    return Save.muted;
  }

  private tone(freq: number, dur: number, type: Wave = "square", vol = 0.18, slideTo = 0, when = 0) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol = 0.2, freq = 1200, when = 0) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filt).connect(gain).connect(this.master);
    src.start(t0);
  }

  sfx(name: string) {
    if (!this.unlocked) return;
    switch (name) {
      case "count": this.tone(440, 0.12, "square", 0.2); break;
      case "go": this.tone(880, 0.3, "square", 0.24); this.tone(1108, 0.3, "square", 0.16, 0, 0.02); break;
      case "ui": this.tone(660, 0.05, "square", 0.08); break;
      case "select": this.tone(523, 0.07, "square", 0.14); this.tone(784, 0.1, "square", 0.14, 0, 0.07); break;
      case "back": this.tone(392, 0.08, "square", 0.12); break;
      case "boost1": this.tone(300, 0.25, "sawtooth", 0.18, 700); break;
      case "boost2": this.tone(300, 0.32, "sawtooth", 0.2, 950); break;
      case "boost3": this.tone(300, 0.42, "sawtooth", 0.24, 1300); this.noise(0.2, 0.1, 2400); break;
      case "rocket": this.tone(220, 0.5, "sawtooth", 0.22, 1100); this.noise(0.3, 0.12, 3000); break;
      case "drifttick": this.tone(900, 0.06, "square", 0.12); break;
      case "item": this.tone(523, 0.08, "square", 0.14); this.tone(659, 0.08, "square", 0.14, 0, 0.08); this.tone(784, 0.12, "square", 0.14, 0, 0.16); break;
      case "box": this.tone(740, 0.07, "triangle", 0.16); this.tone(988, 0.09, "triangle", 0.14, 0, 0.05); break;
      case "hit": this.noise(0.18, 0.25, 1600); this.tone(300, 0.3, "sawtooth", 0.18, 80); break;
      case "bump": this.tone(120, 0.12, "triangle", 0.25, 60); this.noise(0.06, 0.1, 500); break;
      case "thunder": this.noise(0.4, 0.3, 900); this.tone(80, 0.5, "sawtooth", 0.25, 40); this.tone(1800, 0.1, "square", 0.12, 400); break;
      case "sleep": this.tone(660, 0.5, "triangle", 0.14, 220); break;
      case "burn": this.noise(0.3, 0.14, 2400); this.tone(500, 0.25, "sawtooth", 0.1, 200); break;
      case "shield": this.tone(880, 0.12, "triangle", 0.14, 1320); this.tone(1320, 0.15, "triangle", 0.12, 0, 0.1); break;
      case "shieldpop": this.tone(1320, 0.1, "triangle", 0.16, 660); break;
      case "teleport": this.tone(523, 0.07, "triangle", 0.16, 1046); this.tone(784, 0.07, "triangle", 0.16, 1568, 0.06); this.tone(1046, 0.12, "triangle", 0.16, 2093, 0.12); break;
      case "candy": this.tone(988, 0.07, "square", 0.16); this.tone(1319, 0.12, "square", 0.16, 0, 0.06); break;
      case "splash": this.noise(0.25, 0.18, 800); break;
      case "ember": this.noise(0.22, 0.12, 2800); this.tone(740, 0.18, "sawtooth", 0.14, 280); break;
      case "hydro": this.noise(0.3, 0.16, 1100); this.tone(330, 0.3, "sine", 0.16, 660); break;
      case "leaf": this.tone(1175, 0.05, "square", 0.1); this.tone(1568, 0.06, "square", 0.1, 0, 0.05); this.noise(0.08, 0.08, 5000); break;
      case "fall": this.tone(600, 0.6, "sawtooth", 0.18, 100); break;
      case "respawn": this.tone(440, 0.08, "triangle", 0.14); this.tone(660, 0.1, "triangle", 0.14, 0, 0.08); break;
      case "wrongstart": this.tone(220, 0.3, "sawtooth", 0.16, 110); break;
      case "draft": this.noise(0.3, 0.12, 4000); break;
      case "evolve":
        [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, "square", 0.16, 0, i * 0.09));
        break;
      case "lap":
        [659, 784, 988].forEach((f, i) => this.tone(f, 0.1, "square", 0.16, 0, i * 0.08));
        break;
      case "finallap":
        [659, 659, 784, 988, 1175].forEach((f, i) => this.tone(f, 0.09, "square", 0.18, 0, i * 0.09));
        break;
      case "finish":
        [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 0.14, "square", 0.18, 0, i * 0.11));
        break;
      case "victory":
        [523, 659, 784, 1046, 0, 988, 1046, 1319].forEach((f, i) => { if (f) this.tone(f, 0.16, "square", 0.18, 0, i * 0.12); });
        break;
      case "losejingle":
        [392, 370, 349, 330].forEach((f, i) => this.tone(f, 0.18, "triangle", 0.16, 0, i * 0.14));
        break;
      case "unlock":
        [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.1, "triangle", 0.16, 0, i * 0.07));
        break;
      case "maxpower":
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.09, "square", 0.16, 0, i * 0.06));
        this.tone(300, 0.35, "sawtooth", 0.16, 1200, 0.2);
        break;
      case "freeze":
        this.tone(2400, 0.2, "triangle", 0.12, 600);
        this.tone(1800, 0.28, "triangle", 0.1, 500, 0.06);
        this.noise(0.16, 0.07, 7000);
        break;
      case "haunt":
        this.tone(280, 0.42, "sine", 0.16, 140);
        this.tone(560, 0.3, "triangle", 0.1, 230, 0.1);
        break;
      case "crest":
        this.noise(0.2, 0.1, 3200);
        this.tone(480, 0.2, "triangle", 0.09, 920);
        break;
      case "rumble":
        this.tone(90, 0.4, "sawtooth", 0.16, 50);
        this.noise(0.32, 0.1, 900);
        break;
      case "hyper":
        this.tone(160, 0.5, "sawtooth", 0.2, 700);
        this.tone(1200, 0.35, "square", 0.1, -800, 0.06);
        this.noise(0.4, 0.14, 4500);
        break;
      case "land":
        this.tone(150, 0.1, "triangle", 0.16, 70);
        this.noise(0.07, 0.09, 700);
        break;
      case "slam":
        this.tone(58, 0.32, "sine", 0.3, 34);
        this.tone(110, 0.16, "sawtooth", 0.13, 55);
        this.noise(0.22, 0.18, 480);
        break;
      case "toxic":
        this.tone(220, 0.18, "sine", 0.15, 90);
        this.tone(165, 0.16, "sine", 0.12, 70, 0.11);
        this.noise(0.14, 0.06, 600);
        break;
      case "leech":
        this.tone(820, 0.12, "sine", 0.11, 240);
        this.tone(420, 0.14, "triangle", 0.1, 1150, 0.1);
        this.noise(0.08, 0.05, 1500);
        break;
      case "updraft":
        this.noise(0.26, 0.1, 4500);
        this.tone(480, 0.32, "triangle", 0.13, 1150);
        break;
      case "overtake":
        this.tone(659, 0.06, "square", 0.1);
        this.tone(880, 0.09, "square", 0.1, 0, 0.05);
        break;
      case "overtaken":
        this.tone(494, 0.06, "square", 0.08);
        this.tone(370, 0.09, "square", 0.08, 0, 0.05);
        break;
      case "cheer":
        // crowd swell + a couple of whistles
        this.noise(0.55, 0.1, 2400);
        this.noise(0.7, 0.07, 3400, 0.18);
        this.tone(1860, 0.12, "triangle", 0.055, 2400, 0.1);
        this.tone(2100, 0.1, "triangle", 0.045, 1500, 0.34);
        break;
      case "pop":
        // balloon burst: bright snap + rubbery squeak down
        this.noise(0.06, 0.2, 5200);
        this.tone(1400, 0.1, "square", 0.14, 260);
        this.tone(520, 0.12, "triangle", 0.12, 190, 0.04);
        break;
      case "ko":
        // knocked out: heavy thud + descending wail
        this.noise(0.18, 0.18, 900);
        this.tone(660, 0.5, "sawtooth", 0.16, 140);
        this.tone(330, 0.4, "triangle", 0.14, 110, 0.12);
        break;
      case "move":
        // signature move cast: quick two-note flourish + air
        this.tone(740, 0.06, "square", 0.14);
        this.tone(1109, 0.1, "square", 0.13, 0, 0.05);
        this.noise(0.12, 0.07, 3600);
        break;
      case "zap":
        // thunder wave: crackly arc, lighter than the full bolt
        this.noise(0.12, 0.14, 4200);
        this.tone(1200, 0.14, "square", 0.12, 300);
        break;
      case "vine":
        // whip-crack and a stretchy pull
        this.noise(0.05, 0.16, 5000);
        this.tone(420, 0.16, "triangle", 0.14, 980, 0.03);
        break;
      case "quake":
        // ground rumble: deep noise + sub drop
        this.noise(0.45, 0.2, 320);
        this.tone(95, 0.5, "sawtooth", 0.22, 45);
        break;
      case "rain":
        // soft sustained shower hiss
        this.noise(0.9, 0.1, 2200);
        this.tone(880, 0.4, "sine", 0.05, 660, 0.1);
        break;
      case "throw":
        // lobbed projectile: short rising whoosh
        this.noise(0.14, 0.08, 2600);
        this.tone(330, 0.14, "triangle", 0.1, 620);
        break;
      case "confuse":
        // dizzy warble: wobbling pitch
        this.tone(880, 0.12, "triangle", 0.13, 660);
        this.tone(660, 0.12, "triangle", 0.13, 880, 0.1);
        this.tone(880, 0.14, "triangle", 0.11, 587, 0.2);
        break;
      case "landhit":
        // your attack connected: crisp snap + low thump
        this.tone(980, 0.07, "square", 0.15, 520);
        this.noise(0.06, 0.11, 3200);
        this.tone(220, 0.1, "triangle", 0.12, 130, 0.02);
        break;
      case "warn":
        // incoming homing shot: two urgent descending blips
        this.tone(1480, 0.07, "square", 0.12);
        this.tone(1100, 0.09, "square", 0.12, 0, 0.08);
        break;
      case "recover":
        // shake-it-off rebound: quick rising chirp
        this.tone(440, 0.09, "triangle", 0.11, 760);
        this.tone(720, 0.1, "triangle", 0.09, 1020, 0.07);
        break;
    }
  }

  // ---------------- speed / skid loops ----------------

  private loops: {
    windGain: GainNode; windFilt: BiquadFilterNode;
    skidGain: GainNode; skidFilt: BiquadFilterNode;
  } | null = null;

  /** Looped noise voices for continuous wind rush and tyre/paw skid. */
  private ensureLoops() {
    const ctx = this.ensure();
    if (!ctx || !this.master) return null;
    if (this.loops) return this.loops;
    const mk = (type: BiquadFilterType, freq: number, q: number) => {
      const len = Math.floor(ctx.sampleRate * 1.2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const filt = ctx.createBiquadFilter();
      filt.type = type;
      filt.frequency.value = freq;
      filt.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filt).connect(gain).connect(this.master!);
      src.start();
      return { gain, filt };
    };
    const wind = mk("bandpass", 2200, 0.6);
    const skid = mk("bandpass", 2400, 2.4);
    this.loops = {
      windGain: wind.gain, windFilt: wind.filt,
      skidGain: skid.gain, skidFilt: skid.filt
    };
    return this.loops;
  }

  /**
   * Drive the continuous racing loops; call every frame while racing.
   * Each call re-arms a short decay-to-silence, so the loops fade out on
   * their own whenever updates stop (pause, finish, scene change).
   */
  speedLoop(o: { wind: number; windHz: number; skid: number; skidHz: number }) {
    if (!this.unlocked || Save.muted) return;
    const L = this.ensureLoops();
    if (!L || !this.ctx) return;
    const t = this.ctx.currentTime;
    const set = (g: GainNode, f: BiquadFilterNode, lvl: number, hz: number) => {
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(lvl, t, 0.06);
      g.gain.setTargetAtTime(0, t + 0.25, 0.12); // dead-man fade
      f.frequency.setTargetAtTime(hz, t, 0.09);
    };
    set(L.windGain, L.windFilt, o.wind, o.windHz);
    set(L.skidGain, L.skidFilt, o.skid, o.skidHz);
  }

  /** Silence the racing loops immediately (scene teardown). */
  stopLoops() {
    if (!this.loops || !this.ctx) return;
    const t = this.ctx.currentTime;
    for (const g of [this.loops.windGain, this.loops.skidGain]) {
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(0, t, 0.04);
    }
  }

  // ---------------- movement loop ----------------

  private stepAcc = 0;
  private windAcc = 0;

  /**
   * Continuous movement audio for the player, called every frame:
   * footstep patter for runners, stomps for heavies, wing-flaps for flyers,
   * a soft pulse for floaters and wet slaps / bubbles for swimmers — all
   * pacing up with speed, with wind rush while airborne.
   */
  moveLoop(dt: number, o: {
    cls: string; speedFrac: number; surface: string; airborne: boolean; drifting: boolean;
  }) {
    if (!this.unlocked || Save.muted) return;

    if (o.airborne) {
      this.windAcc += dt;
      if (this.windAcc > 0.1) {
        this.windAcc = 0;
        this.noise(0.12, 0.045, 5200);
      }
      return;
    }
    if (o.speedFrac < 0.12) return;

    // sliding surfaces hiss instead of stepping
    if (o.surface === "ice" || o.drifting) {
      this.windAcc += dt;
      if (this.windAcc > 0.13) {
        this.windAcc = 0;
        this.noise(0.1, o.drifting ? 0.035 : 0.03, 6200);
      }
      if (o.surface === "ice") return;
    }

    const rate: Record<string, number> = { runner: 6.4, heavy: 3.0, flyer: 3.4, floater: 2.2, swimmer: 4.2 };
    this.stepAcc += dt * (rate[o.cls] ?? 5) * (0.45 + o.speedFrac * 0.8);
    if (this.stepAcc < 1) return;
    this.stepAcc = 0;

    const v = 0.5 + o.speedFrac * 0.5; // louder at speed, never loud
    if (o.surface === "water") {
      if (o.cls === "swimmer") this.tone(520 + Math.random() * 320, 0.06, "sine", 0.05 * v, 900);
      else this.noise(0.06, 0.05 * v, 900);
      return;
    }
    switch (o.cls) {
      case "runner":
        this.noise(0.03, 0.045 * v, 2400);
        this.tone(170, 0.03, "triangle", 0.028 * v);
        break;
      case "heavy":
        this.tone(72, 0.09, "sine", 0.085 * v, 48);
        this.noise(0.05, 0.045 * v, 420);
        break;
      case "flyer":
        this.noise(0.13, 0.04 * v, 1700);
        break;
      case "floater":
        this.tone(290 + Math.random() * 50, 0.12, "sine", 0.028 * v, 250);
        break;
      case "swimmer":
        this.noise(0.05, 0.05 * v, 950);
        this.tone(130, 0.05, "triangle", 0.03 * v);
        break;
    }
  }

  /** One tiny parameterized blip — used for the item-roulette ticker. */
  blip(freq: number, vol = 0.05) {
    if (!this.unlocked) return;
    this.tone(freq, 0.035, "square", vol);
  }

  /**
   * Procedural Pokémon cry: a short chirp phrase seeded by species id —
   * pitch from body size, timbre from movement class.
   */
  cry(id: number, vol = 0.7) {
    if (!this.unlocked) return;
    const def = getPokemon(id);
    const base = 1380 - def.size * 400 + ((id * 37) % 200);
    const wave: Wave = def.cls === "heavy" ? "sawtooth" : def.cls === "flyer" ? "triangle" : "square";
    const n = 2 + (id % 3);
    let when = 0;
    for (let i = 0; i < n; i++) {
      const h = ((id * 7919 + i * 104729) % 997) / 997;
      const f = base * (0.78 + h * 0.6);
      const slide = f * (h > 0.5 ? 1.45 : 0.62);
      const dur = 0.07 + h * 0.09;
      this.tone(f, dur, wave, 0.13 * vol, slide, when);
      when += dur * 0.8;
    }
  }

  playBgm(patternId: number, tempoMult = 1) {
    const ctx = this.ensure();
    if (!ctx) return;
    this.stopBgm();
    this.bgmPattern = PATTERNS[patternId % PATTERNS.length];
    this.bgmTempoMult = tempoMult;
    this.bgmStep = 0;
    this.bgmNext = ctx.currentTime + 0.1;
    this.bgmTimer = window.setInterval(() => this.scheduleBgm(), 80);
  }

  setBgmTempo(mult: number) { this.bgmTempoMult = mult; }

  stopBgm() {
    if (this.bgmTimer !== null) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
    this.bgmPattern = null;
  }

  private scheduleBgm() {
    const ctx = this.ctx;
    const pat = this.bgmPattern;
    if (!ctx || !pat || !this.master) return;
    const stepDur = 60 / (pat.tempo * this.bgmTempoMult) / 4;
    while (this.bgmNext < ctx.currentTime + 0.28) {
      const i = this.bgmStep % 32;
      const when = this.bgmNext - ctx.currentTime;
      const b = pat.bass[i];
      if (b) this.tone(midi2freq(b), stepDur * 1.8, "triangle", 0.085, 0, when);
      const l = pat.lead[i];
      if (l) this.tone(midi2freq(l), stepDur * 1.4, "square", 0.045, 0, when);
      if (i % 4 === 2) this.noise(0.03, 0.025, 6000, when);
      this.bgmNext += stepDur;
      this.bgmStep++;
    }
  }
}

export const Audio = new AudioSys();

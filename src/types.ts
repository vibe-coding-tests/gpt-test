export type PokeType =
  | "normal" | "fire" | "water" | "electric" | "grass" | "ice"
  | "fighting" | "poison" | "ground" | "flying" | "psychic"
  | "bug" | "rock" | "ghost" | "dragon";

export type MoveClass = "runner" | "flyer" | "floater" | "swimmer" | "heavy";

export type BodyShape =
  | "quad" | "biped" | "bird" | "fish" | "serpent" | "blob" | "round" | "mound" | "shell";

export interface PokemonDef {
  id: number;
  name: string;
  types: PokeType[];
  cls: MoveClass;
  size: 0 | 1 | 2; // small / medium / large
  shape: BodyShape;
  body: string;   // main color
  belly: string;  // secondary color
  accent: string; // accent color
  evos: number[]; // possible evolutions (mid-race rare candy)
  evosRemaining: number; // chain depth left (computed)
  stage: number;  // computed from chain
  legendary?: boolean;
  pow?: number;   // manual power adjustment
}

export interface DerivedStats {
  sp: number; ac: number; hd: number; wt: number; // 0..1 display stats
  topSpeed: number;  // px/s
  accel: number;     // px/s^2
  mass: number;
  gripFront: number; // front axle grip multiplier
  gripRear: number;  // rear axle grip multiplier
  steerLock: number; // max front-wheel steer angle, radians
  wheelbase: number; // handling wheelbase in world px
  cgFront: number;   // static front load fraction
  izz: number;       // yaw inertia scalar
  catchAssist: number; // arcade stability aid for recoverable slides
  radius: number;    // collision radius px
}

export type ItemKind =
  | "thunderbolt" | "substitute" | "agility" | "sleeppowder" | "protect" | "teleport"
  | "ember" | "hydropump" | "razorleaf"
  | "rollout" | "icebeam" | "toxic" | "hyperbeam" | "leechseed";

export type Surface =
  | "road" | "offroad" | "wall" | "water" | "lava" | "ice" | "boost" | "ramp" | "gap" | "mud";

export interface Feature {
  kind: Exclude<Surface, "road" | "offroad" | "wall">;
  s0: number; s1: number; // normalized track position range (s0>s1 wraps)
  d0: number; d1: number; // lateral range in px (negative = left of centerline)
}

export interface Shortcut {
  /** Start/end are main-track coordinates; racers progress from s0 toward s1. */
  s0: number;
  s1: number;
  d0?: number;
  d1?: number;
  roadHalf: number;
  corridorHalf: number;
  surface?: Extract<Surface, "road" | "boost" | "ice" | "mud">;
}

export type EdgeSide = "left" | "right" | "both";
export type EdgeMode = "wall" | "guardrail" | "open";
export type EdgePenalty = "normal";

export interface EdgeSegment {
  s0: number;
  s1: number;
  side?: EdgeSide;
  mode: EdgeMode;
  penalty?: EdgePenalty;
}

export type HazardKind =
  | "snorlax" | "diglett" | "zapdos"
  | "gastly" | "electrode" | "boulder" | "moltres" | "articuno";

export interface HazardSpec {
  kind: HazardKind;
  s?: number;
  d?: number;
}

export type DecoKind =
  | "forest" | "plain" | "beach" | "cave" | "volcano" | "ice" | "city" | "rocky" | "space"
  | "ghost" | "moon" | "plant";

export type WallStyle =
  | "posts" | "hedge" | "shore" | "stone" | "lava" | "ice"
  | "neon" | "rock" | "space" | "ghost" | "moon" | "energy";

/** Gaussian elevation bump: peak h (world px) at lap position s, half-width w (s-fraction). */
export interface Hill {
  s: number;
  h: number;
  w: number;
}

export interface TrackTheme {
  bg: number;        // far terrain
  bgDetail: number;  // speckles
  corridor: number;  // raceable terrain band
  road: number;
  roadEdge: number;
  wall: number;      // rail posts
  wallStyle: WallStyle;
  deco: DecoKind;
  dark?: boolean;
  rainbowRoad?: boolean;
}

export type OffroadKind = "grass" | "sand" | "snow" | "rock" | "space" | "mud";

export interface TrackDef {
  id: number;
  name: string;
  subtitle: string;
  points: [number, number][];
  roadHalf: number;
  corridorHalf: number;
  edgeMode: "wall" | "fall";
  /** Segment-level edge overrides for guardrails, walls, or open/fall edges. */
  edgeSegments?: EdgeSegment[];
  offroadKind: OffroadKind;
  theme: TrackTheme;
  features: Feature[];
  shortcuts?: Shortcut[];
  hazards: HazardSpec[];
  hills?: Hill[];
  itemRows: number[];   // s positions of item box rows
  candies: { s: number; d: number }[];
  musicId: number;
  laps: number;
  /** Battle arena: no laps, racers spawn spread around the loop. */
  arena?: boolean;
}

export interface CupDef {
  id: number;
  name: string;
  ball: "poke" | "great" | "master" | "ultra";
  trackIds: number[];
}

export type RaceMode = "gp" | "tt" | "battle";

export interface RaceSetup {
  mode: RaceMode;
  trackId: number;
  demo?: boolean;
}

export interface StandingRow {
  speciesId: number;
  name: string;
  isPlayer: boolean;
  position: number;
  timeMs: number;
  points: number;
  gpTotal: number;
  balloons?: number;   // battle mode
  hitsScored?: number; // battle mode
}

export interface GhostData {
  dtMs: number;
  timeMs: number;
  speciesId: number;
  frames: number[]; // flattened [x, y, heading*1000]
}

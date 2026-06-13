import Phaser from "phaser";

/** Remappable in-race actions. */
export type Action =
  | "accel" | "brake" | "left" | "right" | "drift"
  | "item" | "move1" | "move2" | "pause";

export interface ActionDef {
  action: Action;
  label: string;
}

/** Display order on the controls screen. */
export const ACTIONS: ActionDef[] = [
  { action: "accel", label: "Accelerate" },
  { action: "brake", label: "Brake / Reverse" },
  { action: "left", label: "Steer Left" },
  { action: "right", label: "Steer Right" },
  { action: "drift", label: "Hop / Drift" },
  { action: "item", label: "Use Item" },
  { action: "move1", label: "Signature Move 1" },
  { action: "move2", label: "Signature Move 2" },
  { action: "pause", label: "Pause" }
];

const K = Phaser.Input.Keyboard.KeyCodes;

export type Binds = Record<Action, number[]>;

export function defaultBinds(): Binds {
  return {
    accel: [K.UP, K.W],
    brake: [K.DOWN, K.S],
    left: [K.LEFT, K.A],
    right: [K.RIGHT, K.D],
    drift: [K.SPACE],
    item: [K.SHIFT],
    move1: [K.Z, K.Q],
    move2: [K.X, K.E],
    pause: [K.P, K.ESC]
  };
}

/** Saved overrides may omit actions or be malformed — fill the gaps from defaults. */
export function normalizeBinds(saved: Partial<Binds> | undefined): Binds {
  const out = defaultBinds();
  if (saved) {
    for (const { action } of ACTIONS) {
      const codes = saved[action];
      if (Array.isArray(codes) && codes.length && codes.every((c) => typeof c === "number")) {
        out[action] = codes.slice(0, 2);
      }
    }
  }
  return out;
}

// reverse lookup: key code -> Phaser name (first match wins)
const NAME_BY_CODE: Record<number, string> = (() => {
  const m: Record<number, string> = {};
  for (const [name, code] of Object.entries(K)) {
    if (typeof code === "number" && !(code in m)) m[code] = name;
  }
  return m;
})();

const PRETTY: Record<number, string> = {
  [K.UP]: "\u2191",
  [K.DOWN]: "\u2193",
  [K.LEFT]: "\u2190",
  [K.RIGHT]: "\u2192",
  [K.SPACE]: "SPACE",
  [K.SHIFT]: "SHIFT",
  [K.CTRL]: "CTRL",
  [K.ALT]: "ALT",
  [K.ENTER]: "ENTER",
  [K.ESC]: "ESC",
  [K.BACKSPACE]: "BKSP",
  [K.TAB]: "TAB"
};

/** Human-readable label for a key code. */
export function keyName(code: number): string {
  return PRETTY[code] ?? NAME_BY_CODE[code] ?? `#${code}`;
}

/** "↑ / W" style label for an action's current bindings. */
export function bindLabel(codes: number[]): string {
  return codes.length ? codes.map(keyName).join(" / ") : "—";
}

/** Key codes that should never be rebound (reserved for UI / system). */
export const RESERVED_CODES = new Set<number>([K.M, K.C, K.V, K.F9]);

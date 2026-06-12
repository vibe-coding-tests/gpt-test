import { Racer } from "./Racer";
import { AIDriver } from "./AIDriver";
import { TrackGeometry } from "../systems/TrackGeometry";
import { Save } from "../systems/SaveSystem";
import { clamp } from "../util";

/** Standings, lap tracking and rubber-band difficulty. */
export class RaceDirector {
  racers: Racer[];
  geom: TrackGeometry;
  laps: number;

  constructor(racers: Racer[], geom: TrackGeometry, laps: number) {
    this.racers = racers;
    this.geom = geom;
    this.laps = laps;
  }

  updateRanks() {
    const sorted = [...this.racers].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTimeMs - b.finishTimeMs;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.totalProgress - a.totalProgress;
    });
    sorted.forEach((r, i) => (r.rank = i + 1));
  }

  lapOf(r: Racer): number {
    return clamp(Math.floor(r.totalProgress) + 1, 1, this.laps);
  }

  /** AI speed multiplier: skill plus catch-up/slow-down around the player. */
  applyRubberBand(player: Racer, drivers: AIDriver[], dt: number) {
    const easy = Save.cheats.easyAI;
    for (const drv of drivers) {
      const r = drv.racer;
      if (r === player) continue;
      const diffPx = (player.totalProgress - r.totalProgress) * this.geom.total;
      // arcade band: AI ahead of the player eases up a lot more than AI
      // behind speeds up, so the pack stays beatable but never boring —
      // and the chase pack closes gently so a clean lead is worth something
      const gain = diffPx >= 0 ? 0.06 : 0.16;
      let target = drv.skill + clamp(diffPx / 1500, -1, 1) * gain;
      if (r.rank === 1) target -= 0.05;
      if (easy) target -= 0.1;
      target = clamp(target, 0.74, easy ? 0.98 : 1.07);
      r.speedMult += (target - r.speedMult) * Math.min(1, dt * 2);
    }
  }

  allFinished(): boolean {
    return this.racers.every((r) => r.finished);
  }

  /** Force-finish stragglers (called a few seconds after the player finishes). */
  forceFinish(raceTimeMs: number) {
    const remaining = this.racers.filter((r) => !r.finished)
      .sort((a, b) => b.totalProgress - a.totalProgress);
    remaining.forEach((r, i) => {
      r.finished = true;
      r.finishTimeMs = raceTimeMs + (i + 1) * 800 + Math.random() * 400;
    });
    this.updateRanks();
  }
}

import Phaser from "phaser";
import { GAME_W, GAME_H } from "./constants";
import { Audio } from "./systems/AudioSystem";
import BootScene from "./scenes/BootScene";
import TitleScene from "./scenes/TitleScene";
import MenuScene from "./scenes/MenuScene";
import PokedexScene from "./scenes/PokedexScene";
import SelectScene from "./scenes/SelectScene";
import RaceScene from "./scenes/RaceScene";
import HudScene from "./scenes/HudScene";
import PauseScene from "./scenes/PauseScene";
import ResultsScene from "./scenes/ResultsScene";
import CheatsScene from "./scenes/CheatsScene";
import ControlsScene from "./scenes/ControlsScene";
import { Save } from "./systems/SaveSystem";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: GAME_W,
  height: GAME_H,
  backgroundColor: "#0b0c1a",
  // the 3D world renders on its own canvas UNDER this one; the race scene
  // clears to transparent so the Phaser layer carries only sprites + UI
  transparent: true,
  render: { antialias: true, roundPixels: false },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [
    BootScene,
    TitleScene,
    MenuScene,
    PokedexScene,
    SelectScene,
    RaceScene,
    HudScene,
    PauseScene,
    ResultsScene,
    CheatsScene,
    ControlsScene
  ]
});

// dev hooks (useful for debugging from the console + e2e tests)
(window as unknown as { __game: Phaser.Game }).__game = game;
(window as unknown as { __save: typeof Save }).__save = Save;

Audio.installAutoUnlock();

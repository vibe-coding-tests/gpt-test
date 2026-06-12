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

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: GAME_W,
  height: GAME_H,
  backgroundColor: "#0b0c1a",
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
    CheatsScene
  ]
});

// dev hook (useful for debugging from the console)
(window as unknown as { __game: Phaser.Game }).__game = game;

Audio.installAutoUnlock();

export const GAME_W = 1280;
export const GAME_H = 720;

export const UI = {
  yellow: "#ffcb05",
  blue: "#2a6db5",
  red: "#ee1515",
  dark: "#101226",
  panel: 0x14163a,
  panelLight: 0x232865,
  text: "#f4f6ff",
  dim: "#9aa3c7",
  font: '"Courier New", monospace',
  // modern HUD: a clean geometric sans for labels, a crisp mono for numbers
  hudFont: '"Avenir Next", "Trebuchet MS", "Segoe UI", system-ui, sans-serif',
  monoFont: '"SF Mono", "Cascadia Mono", Menlo, Consolas, monospace'
};

export const GP_POINTS = [10, 8, 6, 5, 4, 3, 2, 1];

export const RACER_COUNT = 8;

/** The 12 starting racers — covers all five movement classes. */
export const STARTER_IDS = [
  1, 4, 7, 25, 16, 41, 92, 81, 79, 84, 95, 143,        // the original dozen
  133, 58, 77, 52, 54, 60, 37, 104, 66, 74, 39, 63      // now open from the start
];

/**
 * Sequential unlock order for race wins (3 per win, +1 per podium).
 * Legendaries are excluded — they're trophy rewards.
 */
export const UNLOCK_ORDER: number[] = [
  133, 58, 77, // Eevee, Growlithe, Ponyta
  52, 54, 129, // Meowth, Psyduck, Magikarp
  60, 37, 104, // Poliwag, Vulpix, Cubone
  23, 27, 102, // Ekans, Sandshrew, Exeggcute
  116, 90, 109, // Horsea, Shellder, Koffing
  88, 100, 19, // Grimer, Voltorb, Rattata
  21, 10, 13, // Spearow, Caterpie, Weedle
  43, 69, 46, // Oddish, Bellsprout, Paras
  48, 118, 98, // Venonat, Goldeen, Krabby
  32, 29, 35, // Nidoran M, Nidoran F, Clefairy
  39, 63, 66, // Jigglypuff, Abra, Machop
  74, 111, 96, // Geodude, Rhyhorn, Drowzee
  120, 72, 86, // Staryu, Tentacool, Seel
  50, 132, 137, // Diglett, Ditto, Porygon
  113, 114, 108, // Chansey, Tangela, Lickitung
  122, 124, 125, // Mr. Mime, Jynx, Electabuzz
  126, 127, 128, // Magmar, Pinsir, Tauros
  123, 83, 115, // Scyther, Farfetch'd, Kangaskhan
  106, 107, 138, // Hitmonlee, Hitmonchan, Omanyte
  140, 2, 5, // Kabuto, Ivysaur, Charmeleon
  8, 17, 26, // Wartortle, Pidgeotto, Raichu
  30, 33, 44, // Nidorina, Nidorino, Gloom
  61, 64, 67, // Poliwhirl, Kadabra, Machoke
  70, 75, 117, // Weepinbell, Graveler, Seadra
  119, 121, 11, // Seaking, Starmie, Metapod
  14, 20, 22, // Kakuna, Raticate, Fearow
  24, 28, 36, // Arbok, Sandslash, Clefable
  38, 40, 42, // Ninetales, Wigglytuff, Golbat
  45, 47, 49, // Vileplume, Parasect, Venomoth
  51, 53, 55, // Dugtrio, Persian, Golduck
  56, 57, 59, // Mankey, Primeape, Arcanine
  62, 65, 68, // Poliwrath, Alakazam, Machamp
  71, 73, 76, // Victreebel, Tentacruel, Golem
  78, 80, 82, // Rapidash, Slowbro, Magneton
  85, 87, 89, // Dodrio, Dewgong, Muk
  91, 93, 94, // Cloyster, Haunter, Gengar
  97, 99, 101, // Hypno, Kingler, Electrode
  103, 105, 110, // Exeggutor, Marowak, Weezing
  112, 134, 135, // Rhydon, Vaporeon, Jolteon
  136, 139, 141, // Flareon, Omastar, Kabutops
  3, 6, 9, // Venusaur, Charizard, Blastoise
  12, 15, 18, // Butterfree, Beedrill, Pidgeot
  31, 34, 130 // Nidoqueen, Nidoking, Gyarados
];

/** item weights by race position (index 0 = 1st place ... 7 = 8th). */
export const ITEM_WEIGHTS: Record<string, number[]> = {
  substitute: [24, 19, 13, 8, 5, 3, 2, 2],
  protect: [20, 15, 11, 8, 6, 5, 3, 2],
  razorleaf: [17, 16, 13, 10, 8, 5, 3, 2],
  toxic: [14, 12, 9, 7, 5, 3, 2, 1],
  sleeppowder: [6, 7, 8, 7, 6, 4, 3, 2],
  agility: [7, 10, 13, 15, 17, 18, 19, 15],
  rollout: [4, 8, 11, 13, 13, 11, 9, 7],
  ember: [2, 7, 10, 13, 13, 12, 10, 7],
  hydropump: [0, 4, 9, 13, 16, 16, 13, 8],
  leechseed: [0, 5, 9, 11, 11, 9, 7, 5],
  icebeam: [0, 2, 6, 9, 11, 12, 10, 7],
  thunderbolt: [0, 0, 2, 5, 8, 13, 16, 14],
  hyperbeam: [0, 0, 0, 0, 2, 5, 9, 14],
  teleport: [0, 0, 0, 0, 1, 3, 10, 26]
};

export const SAVE_KEY = "pokekart-save-v1";

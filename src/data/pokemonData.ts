import type { BodyShape, MoveClass, PokemonDef, PokeType } from "../types";

type Row = [
  number, string, PokeType, PokeType | null,
  "R" | "F" | "L" | "S" | "H", 0 | 1 | 2, BodyShape,
  string, string, string, number[], number?
];

const CLS: Record<string, MoveClass> = {
  R: "runner", F: "flyer", L: "floater", S: "swimmer", H: "heavy"
};

// [id, name, type1, type2, class, size, shape, body, belly, accent, evos, pow]
const ROWS: Row[] = [
  [1, "Bulbasaur", "grass", "poison", "R", 0, "quad", "#59c489", "#a7e8c0", "#2e8b57", [2]],
  [2, "Ivysaur", "grass", "poison", "R", 1, "quad", "#4fb27d", "#f29cc0", "#2e7a52", [3]],
  [3, "Venusaur", "grass", "poison", "H", 2, "quad", "#3f9e6e", "#f06292", "#2a6e4a", []],
  [4, "Charmander", "fire", null, "R", 0, "biped", "#f08030", "#f8d8a0", "#ff4d00", [5]],
  [5, "Charmeleon", "fire", null, "R", 1, "biped", "#e8643c", "#f8d0a0", "#ff5500", [6]],
  [6, "Charizard", "fire", "flying", "F", 2, "bird", "#f08030", "#f7c873", "#3ba9a0", []],
  [7, "Squirtle", "water", null, "S", 0, "shell", "#58a8e0", "#f8e0a0", "#8b5a2b", [8]],
  [8, "Wartortle", "water", null, "S", 1, "shell", "#4a90d9", "#e8d8f8", "#7a4a23", [9]],
  [9, "Blastoise", "water", null, "S", 2, "shell", "#3a78c2", "#d8c8a8", "#6b4423", []],
  [10, "Caterpie", "bug", null, "R", 0, "serpent", "#7ac74c", "#f8e478", "#e25822", [11]],
  [11, "Metapod", "bug", null, "R", 0, "round", "#8bc34a", "#6ba32e", "#4a7a1e", [12], -0.18],
  [12, "Butterfree", "bug", "flying", "F", 1, "bird", "#5a5abf", "#f4f4ff", "#ee3344", []],
  [13, "Weedle", "bug", "poison", "R", 0, "serpent", "#d9a334", "#f0c870", "#cc4444", [14]],
  [14, "Kakuna", "bug", "poison", "R", 0, "round", "#e6c84c", "#c9a52e", "#8a7a1e", [15], -0.18],
  [15, "Beedrill", "bug", "poison", "F", 1, "bird", "#e8c33a", "#f5f0d0", "#aa2222", []],
  [16, "Pidgey", "normal", "flying", "F", 0, "bird", "#c9a26a", "#f0e0c0", "#8a6a3a", [17]],
  [17, "Pidgeotto", "normal", "flying", "F", 1, "bird", "#c2925a", "#f5e5c5", "#dd4444", [18]],
  [18, "Pidgeot", "normal", "flying", "F", 2, "bird", "#b8854a", "#f8ecd0", "#e8b03a", []],
  [19, "Rattata", "normal", null, "R", 0, "quad", "#a173c9", "#f0e6d8", "#5a4a8a", [20]],
  [20, "Raticate", "normal", null, "R", 1, "quad", "#b89968", "#ecd8b8", "#7a5a32", []],
  [21, "Spearow", "normal", "flying", "F", 0, "bird", "#a55a32", "#f0d8b8", "#cc3a2a", [22]],
  [22, "Fearow", "normal", "flying", "F", 2, "bird", "#9a5028", "#f2dcc0", "#cc2a1a", []],
  [23, "Ekans", "poison", null, "R", 0, "serpent", "#a85ac8", "#f5e07a", "#6a3a8a", [24]],
  [24, "Arbok", "poison", null, "R", 1, "serpent", "#8a4ab8", "#2a2a3a", "#e8485a", []],
  [25, "Pikachu", "electric", null, "R", 0, "quad", "#f8d030", "#fff3b0", "#e03028", [26]],
  [26, "Raichu", "electric", null, "R", 1, "quad", "#f0a030", "#f8e8c8", "#8a4a1a", []],
  [27, "Sandshrew", "ground", null, "R", 0, "quad", "#e8c878", "#f8f0d8", "#b89048", [28]],
  [28, "Sandslash", "ground", null, "R", 1, "quad", "#d8b860", "#f0e0b8", "#6a4a2a", []],
  [29, "Nidoran F", "poison", null, "R", 0, "quad", "#8ac4e8", "#d8ecf8", "#4a7aaa", [30]],
  [30, "Nidorina", "poison", null, "R", 1, "quad", "#6aa8d8", "#cfe4f4", "#3a6a9a", [31]],
  [31, "Nidoqueen", "poison", "ground", "H", 2, "biped", "#4a88c0", "#d8e8f0", "#2a5a8a", []],
  [32, "Nidoran M", "poison", null, "R", 0, "quad", "#c88ad8", "#f0d8f8", "#8a4aaa", [33]],
  [33, "Nidorino", "poison", null, "R", 1, "quad", "#b878cc", "#ecd0f4", "#7a3a9a", [34]],
  [34, "Nidoking", "poison", "ground", "H", 2, "biped", "#9a5ab8", "#d8c0e8", "#5a2a7a", []],
  [35, "Clefairy", "normal", null, "R", 0, "biped", "#f8b8c8", "#fde8ee", "#c87888", [36]],
  [36, "Clefable", "normal", null, "R", 1, "biped", "#f0a8bc", "#fce4ea", "#b86878", []],
  [37, "Vulpix", "fire", null, "R", 0, "quad", "#e87a3a", "#f8c89a", "#a8441a", [38]],
  [38, "Ninetales", "fire", null, "R", 1, "quad", "#f0c878", "#fcf0d8", "#c89030", []],
  [39, "Jigglypuff", "normal", null, "L", 0, "round", "#f8b8d0", "#fde6ef", "#58a8d8", [40]],
  [40, "Wigglytuff", "normal", null, "L", 1, "round", "#f0a8c4", "#ffffff", "#4a98c8", []],
  [41, "Zubat", "poison", "flying", "F", 0, "bird", "#7878d0", "#b8a8e8", "#4a4a9a", [42]],
  [42, "Golbat", "poison", "flying", "F", 1, "bird", "#6868c0", "#c8b0f0", "#3a3a8a", []],
  [43, "Oddish", "grass", "poison", "R", 0, "round", "#5a7ac8", "#4caf50", "#2e7d32", [44]],
  [44, "Gloom", "grass", "poison", "R", 0, "biped", "#5a7ac0", "#d35400", "#8e44ad", [45]],
  [45, "Vileplume", "grass", "poison", "R", 1, "biped", "#5a7ac0", "#e74c3c", "#f8d030", []],
  [46, "Paras", "bug", "grass", "R", 0, "quad", "#e8843a", "#f8d0a8", "#d84a2a", [47]],
  [47, "Parasect", "bug", "grass", "R", 1, "quad", "#e8763a", "#f8e0c0", "#cc3a1a", []],
  [48, "Venonat", "bug", "poison", "R", 0, "round", "#9a5ad0", "#d8c0f0", "#e8485a", [49]],
  [49, "Venomoth", "bug", "poison", "F", 1, "bird", "#b88ad8", "#e8d8f0", "#6a4a9a", []],
  [50, "Diglett", "ground", null, "R", 0, "mound", "#b8835a", "#f0a8a0", "#6a4a2a", [51]],
  [51, "Dugtrio", "ground", null, "R", 1, "mound", "#a8744a", "#f0a8a0", "#5a3a1a", []],
  [52, "Meowth", "normal", null, "R", 0, "quad", "#f0e0b0", "#fdf6dd", "#c8a030", [53]],
  [53, "Persian", "normal", null, "R", 1, "quad", "#e8d8a8", "#f8f0d8", "#c03028", []],
  [54, "Psyduck", "water", null, "S", 0, "biped", "#f0d048", "#f8ecb0", "#c8a020", [55]],
  [55, "Golduck", "water", null, "S", 1, "biped", "#4898d8", "#c8e0f0", "#e8485a", []],
  [56, "Mankey", "fighting", null, "R", 0, "biped", "#e8d8c8", "#f8f0e8", "#b87a4a", [57]],
  [57, "Primeape", "fighting", null, "R", 1, "biped", "#e0d0c0", "#f5ece0", "#8a5a2a", []],
  [58, "Growlithe", "fire", null, "R", 0, "quad", "#f0843a", "#f8e8c8", "#2a2a2a", [59]],
  [59, "Arcanine", "fire", null, "R", 2, "quad", "#e87a30", "#f5e5c5", "#1a1a1a", []],
  [60, "Poliwag", "water", null, "S", 0, "round", "#58a8d8", "#f0f8ff", "#2a2a3a", [61]],
  [61, "Poliwhirl", "water", null, "S", 1, "biped", "#4898c8", "#f0f8ff", "#1a2a3a", [62]],
  [62, "Poliwrath", "water", "fighting", "S", 1, "biped", "#3a78b0", "#f0f8ff", "#1a2a3a", []],
  [63, "Abra", "psychic", null, "L", 0, "biped", "#f0c850", "#f8e8b8", "#8a6a2a", [64]],
  [64, "Kadabra", "psychic", null, "L", 1, "biped", "#e8b840", "#f5e0a8", "#aa3322", [65]],
  [65, "Alakazam", "psychic", null, "L", 1, "biped", "#e0b038", "#f0d8a0", "#8a2a1a", []],
  [66, "Machop", "fighting", null, "R", 0, "biped", "#8a9ab8", "#c8d4e0", "#5a6a8a", [67]],
  [67, "Machoke", "fighting", null, "R", 1, "biped", "#7a8ab8", "#e8c8a8", "#4a5a8a", [68]],
  [68, "Machamp", "fighting", null, "R", 2, "biped", "#6a7ab0", "#e0c0a0", "#3a4a7a", []],
  [69, "Bellsprout", "grass", "poison", "R", 0, "biped", "#e8d048", "#6ab84c", "#e25822", [70]],
  [70, "Weepinbell", "grass", "poison", "R", 1, "round", "#e8d048", "#6ab84c", "#f08030", [71]],
  [71, "Victreebel", "grass", "poison", "R", 2, "round", "#e0c838", "#5aa83c", "#e8485a", []],
  [72, "Tentacool", "water", "poison", "S", 0, "blob", "#58b8d8", "#c8ecf8", "#cc3344", [73]],
  [73, "Tentacruel", "water", "poison", "S", 2, "blob", "#48a8c8", "#b8e4f4", "#cc2233", []],
  [74, "Geodude", "rock", "ground", "H", 0, "round", "#9a9a92", "#b8b8b0", "#5a5a52", [75]],
  [75, "Graveler", "rock", "ground", "H", 1, "round", "#8a8a82", "#a8a8a0", "#4a4a42", [76]],
  [76, "Golem", "rock", "ground", "H", 2, "round", "#7a7a72", "#98b870", "#3a3a32", []],
  [77, "Ponyta", "fire", null, "R", 1, "quad", "#f0e8d8", "#fda85a", "#ff5a1a", [78]],
  [78, "Rapidash", "fire", null, "R", 2, "quad", "#f5edd8", "#fdaa50", "#ff4a0a", []],
  [79, "Slowpoke", "water", "psychic", "S", 1, "quad", "#f0a0b0", "#f8d8c8", "#c87080", [80]],
  [80, "Slowbro", "water", "psychic", "S", 2, "biped", "#e898a8", "#c8c8b0", "#b86070", []],
  [81, "Magnemite", "electric", null, "L", 0, "round", "#b8c4d0", "#e8eef4", "#e83a3a", [82]],
  [82, "Magneton", "electric", null, "L", 1, "round", "#a8b4c0", "#e0e8f0", "#d83030", []],
  [83, "Farfetch'd", "normal", "flying", "F", 0, "bird", "#b8845a", "#f0e0c8", "#58a84c", []],
  [84, "Doduo", "normal", "flying", "R", 1, "biped", "#b8744a", "#e8d0b0", "#6a3a1a", [85]],
  [85, "Dodrio", "normal", "flying", "R", 2, "biped", "#a8643a", "#e0c8a8", "#5a2a0a", []],
  [86, "Seel", "water", null, "S", 1, "fish", "#e8f0f8", "#f8fcff", "#a8c4d8", [87]],
  [87, "Dewgong", "water", "ice", "S", 2, "fish", "#f0f6fc", "#ffffff", "#98b8cc", []],
  [88, "Grimer", "poison", null, "L", 0, "blob", "#9a7ab8", "#b89ad0", "#5a3a7a", [89]],
  [89, "Muk", "poison", null, "L", 2, "blob", "#8a6aa8", "#a888c4", "#4a2a6a", []],
  [90, "Shellder", "water", null, "S", 0, "shell", "#9a8ad8", "#f0e8f8", "#5a4a98", [91]],
  [91, "Cloyster", "water", "ice", "S", 1, "shell", "#8a7ac8", "#d8d0e8", "#4a3a88", []],
  [92, "Gastly", "ghost", "poison", "L", 0, "blob", "#6a5a9a", "#a890d8", "#3a2a5a", [93]],
  [93, "Haunter", "ghost", "poison", "L", 1, "blob", "#7a5ab8", "#b8a0e0", "#4a2a78", [94]],
  [94, "Gengar", "ghost", "poison", "L", 1, "biped", "#6a4a9a", "#9a7ac8", "#e8485a", []],
  [95, "Onix", "rock", "ground", "H", 2, "serpent", "#8a8a92", "#b0b0b8", "#4a4a52", []],
  [96, "Drowzee", "psychic", null, "R", 1, "biped", "#e8c848", "#b8845a", "#8a5a2a", [97]],
  [97, "Hypno", "psychic", null, "R", 1, "biped", "#e0c040", "#f0e0a0", "#7a4a1a", []],
  [98, "Krabby", "water", null, "R", 0, "shell", "#e8683a", "#f8e8d8", "#b83a1a", [99]],
  [99, "Kingler", "water", null, "R", 1, "shell", "#e0582a", "#f5e5d5", "#a82a0a", []],
  [100, "Voltorb", "electric", null, "R", 0, "round", "#e83a3a", "#f0f0f0", "#8a1a1a", [101]],
  [101, "Electrode", "electric", null, "R", 1, "round", "#f0f0f0", "#e83a3a", "#8a1a1a", [], 0.06],
  [102, "Exeggcute", "grass", "psychic", "R", 0, "round", "#f0c8b8", "#fce8e0", "#c89888", [103]],
  [103, "Exeggutor", "grass", "psychic", "H", 2, "biped", "#d8b868", "#6ab84c", "#f8e8c8", []],
  [104, "Cubone", "ground", null, "R", 0, "biped", "#c8a05a", "#f0ead8", "#8a6a3a", [105]],
  [105, "Marowak", "ground", null, "R", 1, "biped", "#b8904a", "#ece4d0", "#7a5a2a", []],
  [106, "Hitmonlee", "fighting", null, "R", 1, "biped", "#b8845a", "#d8c0a8", "#8a5a3a", []],
  [107, "Hitmonchan", "fighting", null, "R", 1, "biped", "#c8a078", "#e8d8c0", "#cc2a2a", []],
  [108, "Lickitung", "normal", null, "R", 1, "biped", "#f0a0b8", "#f8d8e0", "#c87090", []],
  [109, "Koffing", "poison", null, "L", 0, "round", "#9a8ab8", "#b8a8d0", "#e8e89a", [110]],
  [110, "Weezing", "poison", null, "L", 1, "round", "#8a7aa8", "#a898c0", "#e0e090", []],
  [111, "Rhyhorn", "ground", "rock", "H", 1, "quad", "#a8a8b0", "#c8c8d0", "#6a6a72", [112]],
  [112, "Rhydon", "ground", "rock", "H", 2, "biped", "#98a0a8", "#d8c8b8", "#5a6268", []],
  [113, "Chansey", "normal", null, "R", 1, "round", "#f8c0d0", "#fde8ee", "#d89aa8", []],
  [114, "Tangela", "grass", null, "R", 1, "round", "#4868c8", "#6a8ae0", "#e83a4a", []],
  [115, "Kangaskhan", "normal", null, "H", 2, "biped", "#b8845a", "#e8d0a8", "#5a3a22", []],
  [116, "Horsea", "water", null, "S", 0, "fish", "#68b8d8", "#f0e8c8", "#3a88a8", [117]],
  [117, "Seadra", "water", null, "S", 1, "fish", "#58a8c8", "#ece4c0", "#2a7898", []],
  [118, "Goldeen", "water", null, "S", 0, "fish", "#f0f0f0", "#f8d8d8", "#e8682a", [119]],
  [119, "Seaking", "water", null, "S", 1, "fish", "#e8682a", "#f8f0e8", "#c83a0a", []],
  [120, "Staryu", "water", null, "S", 0, "round", "#b8845a", "#d8b888", "#e8c83a", [121]],
  [121, "Starmie", "water", "psychic", "S", 1, "round", "#7a5ab8", "#9a7ad0", "#e8485a", []],
  [122, "Mr. Mime", "psychic", null, "R", 1, "biped", "#f0a8b8", "#f8f8f8", "#58a8d8", []],
  [123, "Scyther", "bug", "flying", "F", 1, "bird", "#7ac74c", "#d8e8c0", "#4a8a2a", []],
  [124, "Jynx", "ice", "psychic", "R", 1, "biped", "#cc3a5a", "#f0d048", "#6a2a3a", []],
  [125, "Electabuzz", "electric", null, "R", 1, "biped", "#f0c838", "#f8e8a8", "#1a1a1a", []],
  [126, "Magmar", "fire", null, "R", 1, "biped", "#e8683a", "#f0c848", "#cc2a0a", []],
  [127, "Pinsir", "bug", null, "R", 1, "biped", "#b8845a", "#d8c0a0", "#8a5a3a", []],
  [128, "Tauros", "normal", null, "R", 2, "quad", "#b8743a", "#e8d0b0", "#6a4a2a", []],
  [129, "Magikarp", "water", null, "S", 0, "fish", "#e85a2a", "#f0e8d8", "#c8a030", [130], -0.3],
  [130, "Gyarados", "water", "flying", "S", 2, "serpent", "#4878c8", "#f0e8c0", "#cc3a3a", [], 0.08],
  [131, "Lapras", "water", "ice", "S", 2, "fish", "#5888c8", "#f0e8d0", "#8a98a8", []],
  [132, "Ditto", "normal", null, "L", 0, "blob", "#c8a8e0", "#e0c8f0", "#8a6aa8", []],
  [133, "Eevee", "normal", null, "R", 0, "quad", "#b8845a", "#f0e0c8", "#8a5a32", [134, 135, 136]],
  [134, "Vaporeon", "water", null, "S", 1, "quad", "#58b8d8", "#d8f0f8", "#2a88a8", []],
  [135, "Jolteon", "electric", null, "R", 1, "quad", "#f0d038", "#f8f0c0", "#c8a008", [], 0.04],
  [136, "Flareon", "fire", null, "R", 1, "quad", "#e8683a", "#f8d8a8", "#c83a0a", []],
  [137, "Porygon", "normal", null, "L", 0, "round", "#e87a9a", "#58b8d8", "#b84a6a", []],
  [138, "Omanyte", "rock", "water", "S", 0, "shell", "#88b8d8", "#d8c8a8", "#4a88a8", [139]],
  [139, "Omastar", "rock", "water", "S", 1, "shell", "#78a8c8", "#d0c0a0", "#3a7898", []],
  [140, "Kabuto", "rock", "water", "S", 0, "shell", "#b8845a", "#d8c0a0", "#e8485a", [141]],
  [141, "Kabutops", "rock", "water", "R", 1, "biped", "#a8744a", "#d0b890", "#6a4a2a", []],
  [142, "Aerodactyl", "rock", "flying", "F", 2, "bird", "#b8a8c8", "#d8d0e0", "#6a5a7a", []],
  [143, "Snorlax", "normal", null, "H", 2, "round", "#2d6b8e", "#f0e0c8", "#1a4a66", []],
  [144, "Articuno", "ice", "flying", "F", 2, "bird", "#68a8e8", "#d8ecf8", "#3a6ab8", []],
  [145, "Zapdos", "electric", "flying", "F", 2, "bird", "#f0d038", "#f8eca0", "#1a1a1a", []],
  [146, "Moltres", "fire", "flying", "F", 2, "bird", "#f0843a", "#fdc83a", "#e83a0a", []],
  [147, "Dratini", "dragon", null, "S", 0, "serpent", "#6878d8", "#e8ecf8", "#3a4aa8", [148]],
  [148, "Dragonair", "dragon", null, "S", 1, "serpent", "#5868c8", "#e0e8f4", "#2a3a98", [149]],
  [149, "Dragonite", "dragon", "flying", "F", 2, "biped", "#e8a848", "#f8e0b0", "#58b8a8", [], 0.04],
  [150, "Mewtwo", "psychic", null, "L", 2, "biped", "#d8c8e8", "#f0e8f8", "#7a4ab8", [], 0.05],
  [151, "Mew", "psychic", null, "L", 0, "blob", "#f0b8d8", "#fce0ee", "#c888a8", [], 0.03]
];

const LEGENDARY = new Set([144, 145, 146, 150, 151]);

export const POKEMON = new Map<number, PokemonDef>();

for (const r of ROWS) {
  const [id, name, t1, t2, cls, size, shape, body, belly, accent, evos, pow] = r;
  POKEMON.set(id, {
    id, name,
    types: t2 ? [t1, t2] : [t1],
    cls: CLS[cls],
    size, shape, body, belly, accent,
    evos: evos.slice(),
    evosRemaining: 0,
    stage: 0,
    legendary: LEGENDARY.has(id),
    pow: pow ?? 0
  });
}

// Compute stage (depth from chain root) and evosRemaining (chain depth below).
{
  const hasParent = new Set<number>();
  for (const p of POKEMON.values()) for (const e of p.evos) hasParent.add(e);

  const depthBelow = (id: number): number => {
    const p = POKEMON.get(id)!;
    if (p.evos.length === 0) return 0;
    return 1 + Math.max(...p.evos.map(depthBelow));
  };
  for (const p of POKEMON.values()) p.evosRemaining = depthBelow(p.id);

  const setStage = (id: number, st: number) => {
    const p = POKEMON.get(id)!;
    p.stage = st;
    for (const e of p.evos) setStage(e, st + 1);
  };
  for (const p of POKEMON.values()) if (!hasParent.has(p.id)) setStage(p.id, 0);
}

export const ALL_IDS = [...POKEMON.keys()].sort((a, b) => a - b);
export const getPokemon = (id: number): PokemonDef => POKEMON.get(id)!;

export const CLASS_LABEL: Record<MoveClass, string> = {
  runner: "Runner", flyer: "Flyer", floater: "Floater", swimmer: "Swimmer", heavy: "Heavy"
};

export const CLASS_DESC: Record<MoveClass, string> = {
  runner: "Quick accel & tight turns. Hates off-road.",
  flyer: "Hovers: crosses gaps, ignores ground hazards. Wide turns.",
  floater: "Glides over rough terrain. Drifts wide.",
  swimmer: "Sluggish on land, surges through water.",
  heavy: "Slow but massive — bumps rivals aside."
};

export const TYPE_COLORS: Record<string, number> = {
  normal: 0xa8a878, fire: 0xf08030, water: 0x6890f0, electric: 0xf8d030,
  grass: 0x78c850, ice: 0x98d8d8, fighting: 0xc03028, poison: 0xa040a0,
  ground: 0xe0c068, flying: 0xa890f0, psychic: 0xf85888, bug: 0xa8b820,
  rock: 0xb8a038, ghost: 0x705898, dragon: 0x7038f8
};

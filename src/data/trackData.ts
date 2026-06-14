import type { TrackDef } from "../types";

/**
 * 12 Kanto tracks across 4 cups.
 * s values are normalized lap position (0..1), d is lateral offset in px
 * (negative = left of the direction of travel). hills are gaussian elevation
 * bumps: climbs slow racers, descents speed them up, crests launch them.
 */
export const TRACKS: TrackDef[] = [
  {
    id: 0,
    name: "Route 1",
    subtitle: "A gentle road out of Pallet Town",
    points: [
      [600, 1150], [850, 650], [1500, 420], [2300, 400], [2900, 650],
      [3050, 1200], [2850, 1750], [2200, 1980], [1500, 1950], [1000, 1700]
    ],
    roadHalf: 132,
    corridorHalf: 300,
    edgeMode: "wall",
    edgeSegments: [
      { s0: 0.16, s1: 0.3, side: "right", mode: "guardrail" },
      { s0: 0.48, s1: 0.58, side: "left", mode: "guardrail" },
      { s0: 0.78, s1: 0.9, side: "both", mode: "guardrail" }
    ],
    offroadKind: "grass",
    theme: {
      bg: 0x4f9e43, bgDetail: 0x3f8a36, corridor: 0x67b257,
      road: 0xc8b18a, roadEdge: 0xf5ead2, wall: 0x8a5a32, wallStyle: "posts", deco: "plain"
    },
    features: [
      { kind: "boost", s0: 0.44, s1: 0.465, d0: -110, d1: 110 },
      { kind: "mud", s0: 0.62, s1: 0.66, d0: -40, d1: 110 }
    ],
    shortcuts: [
      { s0: 0.55, s1: 0.645, d0: -72, d1: 86, roadHalf: 58, corridorHalf: 125, surface: "mud" }
    ],
    hazards: [
      { kind: "diglett", s: 0.25, d: -50 },
      { kind: "diglett", s: 0.72, d: 40 }
    ],
    hills: [
      { s: 0.3, h: 45, w: 0.07 },
      { s: 0.7, h: 55, w: 0.08 }
    ],
    itemRows: [0.1, 0.32, 0.55, 0.78],
    candies: [
      { s: 0.06, d: -150 }, { s: 0.2, d: 60 }, { s: 0.36, d: -70 },
      { s: 0.5, d: 140 }, { s: 0.62, d: -160 }, { s: 0.74, d: 0 },
      { s: 0.86, d: 80 }, { s: 0.94, d: -60 }
    ],
    musicId: 0,
    laps: 3
  },
  {
    id: 1,
    name: "Viridian Forest",
    subtitle: "Winding paths under the canopy",
    points: [
      [500, 1900], [480, 1300], [800, 850], [1350, 750], [1750, 1050],
      [2150, 1350], [2600, 1250], [2900, 900], [3300, 750], [3550, 1050],
      [3550, 1550], [3150, 1850], [2650, 1950], [2150, 1750], [1650, 1950], [1050, 2100]
    ],
    roadHalf: 110,
    corridorHalf: 200,
    edgeMode: "wall",
    offroadKind: "grass",
    theme: {
      bg: 0x2e6b2a, bgDetail: 0x245722, corridor: 0x47913c,
      road: 0xb39a76, roadEdge: 0xe8dcb8, wall: 0x4a3a22, wallStyle: "hedge", deco: "forest"
    },
    features: [
      { kind: "mud", s0: 0.22, s1: 0.27, d0: -88, d1: 30 },
      { kind: "boost", s0: 0.5, s1: 0.52, d0: -88, d1: 88 },
      { kind: "mud", s0: 0.68, s1: 0.72, d0: 0, d1: 88 }
    ],
    shortcuts: [
      { s0: 0.185, s1: 0.305, d0: 68, d1: -72, roadHalf: 48, corridorHalf: 98, surface: "mud" },
      { s0: 0.78, s1: 0.87, d0: -64, d1: 66, roadHalf: 44, corridorHalf: 92 }
    ],
    hazards: [
      { kind: "diglett", s: 0.15, d: 30 },
      { kind: "diglett", s: 0.42, d: -40 },
      { kind: "diglett", s: 0.85, d: 0 }
    ],
    hills: [
      { s: 0.2, h: 40, w: 0.06 },   // root-tangled rise
      { s: 0.45, h: -38, w: 0.05 }, // mossy hollow
      { s: 0.75, h: 50, w: 0.07 }
    ],
    itemRows: [0.08, 0.3, 0.56, 0.8],
    candies: [
      { s: 0.05, d: 60 }, { s: 0.18, d: -60 }, { s: 0.27, d: 110 },
      { s: 0.38, d: 0 }, { s: 0.47, d: -100 }, { s: 0.58, d: 60 },
      { s: 0.66, d: -50 }, { s: 0.76, d: 100 }, { s: 0.88, d: -40 }, { s: 0.96, d: 40 }
    ],
    musicId: 1,
    laps: 3
  },
  {
    id: 2,
    name: "Cerulean Cape",
    subtitle: "Tides and sandbars — bring a swimmer",
    // Koopa-beach style: a sweeping shoreline loop where the lagoon
    // regularly swallows the road and sandbars carry boost lanes.
    points: [
      [600, 1500], [550, 900], [1000, 500], [1700, 380], [2500, 420],
      [3200, 700], [3500, 1300], [3300, 1900], [2700, 2300], [1900, 2450],
      [1200, 2350], [750, 2000]
    ],
    roadHalf: 140,
    corridorHalf: 320,
    edgeMode: "wall",
    edgeSegments: [
      { s0: 0.36, s1: 0.47, side: "left", mode: "open" },
      { s0: 0.76, s1: 0.88, side: "right", mode: "open" },
      { s0: 0.48, s1: 0.56, side: "both", mode: "guardrail" }
    ],
    offroadKind: "sand",
    theme: {
      bg: 0xe8d8a8, bgDetail: 0xd8c890, corridor: 0xf0e0b8,
      road: 0xb8a888, roadEdge: 0xfff8e0, wall: 0x6890c0, wallStyle: "shore", deco: "beach"
    },
    features: [
      { kind: "water", s0: 0.14, s1: 0.27, d0: -320, d1: 320 },   // first lagoon crossing
      { kind: "water", s0: 0.4, s1: 0.46, d0: -320, d1: -80 },    // left tide pool
      { kind: "boost", s0: 0.49, s1: 0.51, d0: -120, d1: 120 },   // sandbar dash
      { kind: "ramp", s0: 0.535, s1: 0.55, d0: -120, d1: 120 },   // hop into the bay
      { kind: "water", s0: 0.55, s1: 0.68, d0: -320, d1: 320 },   // long second crossing
      { kind: "water", s0: 0.8, s1: 0.87, d0: 60, d1: 320 },      // right tide
      { kind: "boost", s0: 0.93, s1: 0.95, d0: -120, d1: 120 }
    ],
    shortcuts: [
      { s0: 0.365, s1: 0.505, d0: -178, d1: -108, roadHalf: 52, corridorHalf: 116, surface: "boost" },
      { s0: 0.775, s1: 0.885, d0: 132, d1: 146, roadHalf: 50, corridorHalf: 112 }
    ],
    hazards: [
      { kind: "diglett", s: 0.33, d: 40 },
      { kind: "diglett", s: 0.76, d: -40 }
    ],
    hills: [
      { s: 0.33, h: 42, w: 0.05 },  // dune ridge above the tide pool
      { s: 0.52, h: 58, w: 0.045 }, // bluff right before the bay ramp — launch into the water
      { s: 0.9, h: 36, w: 0.05 }
    ],
    itemRows: [0.07, 0.31, 0.47, 0.72, 0.9],
    candies: [
      { s: 0.05, d: -80 }, { s: 0.18, d: 120 }, { s: 0.24, d: 0 },
      { s: 0.35, d: -180 }, { s: 0.43, d: -250 }, { s: 0.5, d: 80 },
      { s: 0.61, d: 0 }, { s: 0.66, d: -150 }, { s: 0.83, d: 220 }, { s: 0.97, d: 60 }
    ],
    musicId: 2,
    laps: 3
  },
  {
    id: 3,
    name: "Rock Tunnel",
    subtitle: "Switchbacks in the dark",
    points: [
      [700, 500], [1600, 400], [2600, 450], [3400, 700], [3300, 1150],
      [2400, 1250], [1500, 1150], [900, 1300], [1000, 1750], [1900, 1900],
      [2900, 1850], [3400, 2150], [2900, 2450], [1800, 2500], [900, 2400],
      [500, 1900], [450, 1100]
    ],
    roadHalf: 114,
    corridorHalf: 210,
    edgeMode: "wall",
    offroadKind: "rock",
    theme: {
      bg: 0x2a2433, bgDetail: 0x221d2b, corridor: 0x453b52,
      road: 0x6a5f78, roadEdge: 0x9a8ab0, wall: 0x15121c, wallStyle: "stone", deco: "cave", dark: true
    },
    features: [
      // choco-island mud bog gauntlet
      { kind: "mud", s0: 0.18, s1: 0.22, d0: -92, d1: 10 },
      { kind: "boost", s0: 0.9, s1: 0.92, d0: -92, d1: 92 },
      { kind: "mud", s0: 0.31, s1: 0.35, d0: -30, d1: 92 },
      { kind: "mud", s0: 0.55, s1: 0.6, d0: -92, d1: 92 }
    ],
    shortcuts: [
      { s0: 0.255, s1: 0.365, d0: 74, d1: -76, roadHalf: 42, corridorHalf: 90 },
      { s0: 0.66, s1: 0.775, d0: -70, d1: 70, roadHalf: 44, corridorHalf: 96, surface: "mud" }
    ],
    hazards: [
      { kind: "diglett", s: 0.12, d: 0 },
      { kind: "diglett", s: 0.28, d: -45 },
      { kind: "diglett", s: 0.47, d: 30 },
      { kind: "diglett", s: 0.575, d: 0 },
      { kind: "diglett", s: 0.66, d: -30 },
      { kind: "diglett", s: 0.8, d: 45 },
      { kind: "snorlax", s: 0.38, d: 0 },
      { kind: "snorlax", s: 0.74, d: -20 }
    ],
    hills: [
      { s: 0.42, h: 50, w: 0.06 },
      { s: 0.65, h: -42, w: 0.05 }, // sunken gallery
      { s: 0.87, h: 40, w: 0.05 }
    ],
    itemRows: [0.06, 0.26, 0.52, 0.76],
    candies: [
      { s: 0.09, d: -60 }, { s: 0.2, d: 60 }, { s: 0.33, d: -70 },
      { s: 0.44, d: 0 }, { s: 0.57, d: 70 }, { s: 0.7, d: -60 },
      { s: 0.84, d: 40 }, { s: 0.95, d: -40 }
    ],
    musicId: 3,
    laps: 3
  },
  {
    id: 4,
    name: "Cinnabar Volcano",
    subtitle: "Lava rivers around the caldera",
    points: [
      [2000, 420], [2700, 560], [3200, 1000], [3350, 1600], [3050, 2100],
      [2400, 2400], [1700, 2450], [1050, 2200], [680, 1700], [650, 1050], [1200, 620]
    ],
    roadHalf: 124,
    corridorHalf: 280,
    edgeMode: "wall",
    offroadKind: "rock",
    theme: {
      bg: 0x4a2a22, bgDetail: 0x3a1f18, corridor: 0x66392c,
      road: 0x8a7368, roadEdge: 0xc8a888, wall: 0x2a1510, wallStyle: "lava", deco: "volcano", dark: true
    },
    features: [
      { kind: "ramp", s0: 0.285, s1: 0.3, d0: -102, d1: 102 },
      { kind: "lava", s0: 0.3, s1: 0.34, d0: -280, d1: 280 },
      { kind: "lava", s0: 0.55, s1: 0.62, d0: 30, d1: 280 },
      { kind: "lava", s0: 0.7, s1: 0.78, d0: -280, d1: -30 },
      { kind: "boost", s0: 0.85, s1: 0.87, d0: -102, d1: 102 },
      { kind: "boost", s0: 0.43, s1: 0.45, d0: -102, d1: 102 }
    ],
    hazards: [
      { kind: "diglett", s: 0.5, d: 0 },
      { kind: "diglett", s: 0.9, d: -40 },
      { kind: "moltres" }
    ],
    hills: [
      { s: 0.2, h: 110, w: 0.09 },  // climb the cone — ramp at the summit clears the lava
      { s: 0.52, h: 60, w: 0.07 },
      { s: 0.9, h: 45, w: 0.05 }
    ],
    itemRows: [0.08, 0.24, 0.48, 0.66, 0.94],
    candies: [
      { s: 0.05, d: 70 }, { s: 0.16, d: -80 }, { s: 0.26, d: 0 },
      { s: 0.37, d: 90 }, { s: 0.52, d: -70 }, { s: 0.6, d: -150 },
      { s: 0.74, d: 150 }, { s: 0.83, d: 0 }, { s: 0.96, d: -60 }
    ],
    musicId: 4,
    laps: 3
  },
  {
    id: 5,
    name: "Seafoam Ice Caves",
    subtitle: "Frozen pools and slick floors",
    points: [
      [600, 1300], [900, 700], [1600, 500], [2300, 650], [2700, 1100],
      [3200, 1300], [3450, 1750], [3050, 2250], [2300, 2400], [1600, 2250],
      [1150, 1950], [750, 1900]
    ],
    roadHalf: 122,
    corridorHalf: 260,
    edgeMode: "wall",
    offroadKind: "snow",
    theme: {
      bg: 0xbcd8e8, bgDetail: 0xa8c8dc, corridor: 0xd8ecf4,
      road: 0x90b8cc, roadEdge: 0xffffff, wall: 0x5888a8, wallStyle: "ice", deco: "ice"
    },
    features: [
      { kind: "ice", s0: 0.12, s1: 0.2, d0: -100, d1: 100 },
      { kind: "ice", s0: 0.45, s1: 0.55, d0: -100, d1: 100 },
      { kind: "ice", s0: 0.75, s1: 0.82, d0: -100, d1: 100 },
      { kind: "water", s0: 0.27, s1: 0.34, d0: -260, d1: 260 },
      { kind: "water", s0: 0.6, s1: 0.67, d0: -260, d1: -110 },
      { kind: "boost", s0: 0.4, s1: 0.42, d0: -100, d1: 100 }
    ],
    hazards: [
      { kind: "snorlax", s: 0.5, d: 0 },
      { kind: "articuno" }
    ],
    hills: [
      { s: 0.15, h: -45, w: 0.05 }, // frozen bowl
      { s: 0.4, h: 45, w: 0.06 },
      { s: 0.78, h: 50, w: 0.07 }
    ],
    itemRows: [0.07, 0.24, 0.44, 0.7, 0.88],
    candies: [
      { s: 0.05, d: -60 }, { s: 0.15, d: 70 }, { s: 0.3, d: -120 },
      { s: 0.38, d: 60 }, { s: 0.52, d: 0 }, { s: 0.63, d: -180 },
      { s: 0.72, d: 80 }, { s: 0.85, d: -50 }, { s: 0.95, d: 50 }
    ],
    musicId: 5,
    laps: 3
  },
  {
    id: 6,
    name: "Saffron City",
    subtitle: "Midnight turnpike through neon traffic",
    // Toad's-Turnpike style: a long rounded rectangle with chicanes on the
    // straights and staggered boost lanes to weave between, plus an overpass jump.
    points: [
      [650, 520], [1700, 440], [2750, 440], [3380, 620], [3520, 1150],
      [3300, 1500], [3520, 1850], [3340, 2280], [2500, 2440], [1500, 2440],
      [700, 2330], [480, 1850], [620, 1450], [480, 1050]
    ],
    roadHalf: 118,
    corridorHalf: 240,
    edgeMode: "wall",
    edgeSegments: [
      { s0: 0.03, s1: 0.22, side: "both", mode: "guardrail" },
      { s0: 0.47, s1: 0.53, side: "both", mode: "wall" },
      { s0: 0.7, s1: 0.84, side: "right", mode: "guardrail" }
    ],
    offroadKind: "rock",
    theme: {
      bg: 0x12142e, bgDetail: 0x0d0f24, corridor: 0x222448,
      road: 0x32355c, roadEdge: 0xe858c8, wall: 0x080a18, wallStyle: "neon", deco: "city", dark: true
    },
    features: [
      { kind: "boost", s0: 0.06, s1: 0.1, d0: -96, d1: -22 },   // left traffic lane
      { kind: "boost", s0: 0.18, s1: 0.22, d0: 22, d1: 96 },    // right traffic lane
      { kind: "boost", s0: 0.32, s1: 0.34, d0: -96, d1: 96 },
      { kind: "ramp", s0: 0.47, s1: 0.485, d0: -96, d1: 96 },
      { kind: "gap", s0: 0.485, s1: 0.52, d0: -240, d1: 240 },  // the overpass
      { kind: "boost", s0: 0.58, s1: 0.62, d0: -96, d1: -22 },
      { kind: "boost", s0: 0.72, s1: 0.76, d0: 22, d1: 96 },
      { kind: "boost", s0: 0.85, s1: 0.87, d0: -96, d1: 96 }
    ],
    shortcuts: [
      { s0: 0.335, s1: 0.455, d0: 72, d1: -74, roadHalf: 46, corridorHalf: 94, surface: "boost" },
      { s0: 0.62, s1: 0.73, d0: -70, d1: 72, roadHalf: 44, corridorHalf: 92 }
    ],
    hazards: [
      { kind: "zapdos" },
      { kind: "diglett", s: 0.27, d: 40 },
      { kind: "diglett", s: 0.72, d: -40 }
    ],
    hills: [
      { s: 0.44, h: 75, w: 0.06 },  // the on-ramp climb up to the overpass jump
      { s: 0.66, h: -42, w: 0.05 }, // underpass dip beneath the monorail
      { s: 0.9, h: 38, w: 0.05 }
    ],
    itemRows: [0.06, 0.26, 0.42, 0.58, 0.8],
    candies: [
      { s: 0.04, d: 60 }, { s: 0.16, d: -70 }, { s: 0.29, d: 0 },
      { s: 0.4, d: 80 }, { s: 0.55, d: -60 }, { s: 0.67, d: 70 },
      { s: 0.78, d: -80 }, { s: 0.9, d: 0 }, { s: 0.96, d: 60 }
    ],
    musicId: 6,
    laps: 3
  },
  {
    id: 7,
    name: "Victory Road",
    subtitle: "Lava moats guard the summit",
    // Bowser's-Castle style: lava moats squeeze the lane into an S-weave,
    // with a full lava river you must jump and chasm gaps either side.
    points: [
      [600, 2100], [500, 1200], [800, 600], [1600, 420], [2400, 430],
      [3000, 700], [3300, 1300], [3100, 1900], [2500, 2200], [1900, 2000],
      [1500, 1600], [1100, 1800], [900, 2200]
    ],
    roadHalf: 120,
    corridorHalf: 230,
    edgeMode: "wall",
    edgeSegments: [
      { s0: 0.32, s1: 0.39, side: "both", mode: "guardrail" },
      { s0: 0.59, s1: 0.74, side: "both", mode: "guardrail" },
      { s0: 0.84, s1: 0.9, side: "left", mode: "wall" }
    ],
    offroadKind: "rock",
    theme: {
      bg: 0x453438, bgDetail: 0x382a2e, corridor: 0x5e4a4e,
      road: 0x7a6a70, roadEdge: 0xd8a868, wall: 0x241a1c, wallStyle: "rock", deco: "rocky", dark: true
    },
    features: [
      // weave between the moats
      { kind: "lava", s0: 0.1, s1: 0.16, d0: -230, d1: -55 },
      { kind: "lava", s0: 0.16, s1: 0.22, d0: 55, d1: 230 },
      { kind: "ramp", s0: 0.325, s1: 0.34, d0: -98, d1: 98 },
      { kind: "gap", s0: 0.34, s1: 0.378, d0: -230, d1: 230 },
      { kind: "lava", s0: 0.44, s1: 0.49, d0: -230, d1: -35 },
      { kind: "lava", s0: 0.49, s1: 0.54, d0: 35, d1: 230 },
      { kind: "boost", s0: 0.555, s1: 0.575, d0: -98, d1: 98 },
      { kind: "ramp", s0: 0.595, s1: 0.61, d0: -98, d1: 98 },
      { kind: "lava", s0: 0.61, s1: 0.645, d0: -230, d1: 230 }, // the lava river — jump it
      { kind: "ramp", s0: 0.685, s1: 0.7, d0: -98, d1: 98 },
      { kind: "gap", s0: 0.7, s1: 0.733, d0: -230, d1: 230 },
      { kind: "lava", s0: 0.85, s1: 0.89, d0: -230, d1: -50 }
    ],
    hazards: [
      { kind: "zapdos" },
      { kind: "snorlax", s: 0.16, d: 0 },
      { kind: "snorlax", s: 0.6, d: 20 },
      { kind: "diglett", s: 0.08, d: -40 },
      { kind: "diglett", s: 0.45, d: 40 },
      { kind: "diglett", s: 0.55, d: -55 },
      { kind: "diglett", s: 0.92, d: 0 }
    ],
    hills: [
      { s: 0.28, h: 110, w: 0.08 }, // the climb to the first chasm jump
      { s: 0.57, h: 70, w: 0.06 },
      { s: 0.95, h: 55, w: 0.05 }
    ],
    itemRows: [0.05, 0.22, 0.44, 0.62, 0.82],
    candies: [
      { s: 0.04, d: 60 }, { s: 0.13, d: -70 }, { s: 0.24, d: 80 },
      { s: 0.31, d: 0 }, { s: 0.42, d: -60 }, { s: 0.52, d: 0 },
      { s: 0.66, d: -50 }, { s: 0.77, d: 60 }, { s: 0.87, d: -80 }, { s: 0.96, d: 0 }
    ],
    musicId: 7,
    laps: 3
  },
  {
    id: 8,
    name: "Indigo Plateau",
    subtitle: "The rainbow road to the League",
    points: [
      [900, 2000], [600, 1200], [1000, 550], [1800, 400], [2600, 500],
      [3200, 950], [3400, 1700], [3000, 2300], [2200, 2500], [1500, 2350]
    ],
    roadHalf: 142,
    corridorHalf: 148,
    edgeMode: "fall",
    // rainbow rails guard most bends; the gap jumps and a few windows stay open
    edgeSegments: [
      { s0: 0.0, s1: 0.18, mode: "guardrail" }, { s0: 0.24, s1: 0.34, mode: "guardrail" },
      { s0: 0.4, s1: 0.46, mode: "guardrail" }, { s0: 0.52, s1: 0.63, mode: "guardrail" },
      { s0: 0.69, s1: 0.76, mode: "guardrail" }, { s0: 0.82, s1: 0.99, mode: "guardrail" }
    ],
    offroadKind: "space",
    theme: {
      bg: 0x140f2e, bgDetail: 0x0d0a20, corridor: 0x241d4a,
      road: 0x584a9a, roadEdge: 0xffffff, wall: 0x9a8ae0, wallStyle: "space", deco: "space",
      dark: true, rainbowRoad: true
    },
    features: [
      { kind: "ramp", s0: 0.185, s1: 0.2, d0: -142, d1: 142 },
      { kind: "gap", s0: 0.2, s1: 0.235, d0: -142, d1: -5 },
      { kind: "boost", s0: 0.3, s1: 0.32, d0: -142, d1: 142 },
      { kind: "ramp", s0: 0.345, s1: 0.36, d0: -142, d1: 142 },
      { kind: "gap", s0: 0.36, s1: 0.39, d0: -142, d1: -5 },
      { kind: "ramp", s0: 0.465, s1: 0.48, d0: -142, d1: 142 },
      { kind: "gap", s0: 0.48, s1: 0.515, d0: 5, d1: 142 },
      { kind: "boost", s0: 0.6, s1: 0.62, d0: -142, d1: 142 },
      { kind: "ramp", s0: 0.64, s1: 0.655, d0: -142, d1: 142 },
      { kind: "gap", s0: 0.655, s1: 0.685, d0: 5, d1: 142 },
      { kind: "ramp", s0: 0.765, s1: 0.78, d0: -142, d1: 142 },
      { kind: "gap", s0: 0.78, s1: 0.81, d0: -70, d1: 70 },
      { kind: "boost", s0: 0.9, s1: 0.92, d0: -142, d1: 142 }
    ],
    hazards: [
      { kind: "zapdos" }
    ],
    hills: [
      { s: 0.12, h: 60, w: 0.06 },  // rainbow rollers
      { s: 0.55, h: 70, w: 0.07 },
      { s: 0.85, h: 78, w: 0.06 }   // the last big swell before the line
    ],
    itemRows: [0.07, 0.27, 0.55, 0.85],
    candies: [
      { s: 0.05, d: -60 }, { s: 0.15, d: 60 }, { s: 0.26, d: 0 },
      { s: 0.37, d: 60 }, { s: 0.44, d: 70 }, { s: 0.56, d: -60 },
      { s: 0.67, d: -60 }, { s: 0.74, d: -60 }, { s: 0.88, d: 0 }, { s: 0.96, d: 60 }
    ],
    musicId: 8,
    laps: 3
  },
  {
    id: 9,
    name: "Lavender Tower",
    subtitle: "A creaking boardwalk over the mist",
    // Banshee-Boardwalk style: a narrow haunted boardwalk with broken planks
    // and Gastly drifting across the lane. No rails — don't look down.
    points: [
      [700, 1900], [550, 1250], [850, 700], [1500, 480], [2200, 430],
      [2900, 560], [3350, 950], [3450, 1500], [3150, 2000], [2500, 2250],
      [1800, 2150], [1250, 2250]
    ],
    roadHalf: 120,
    corridorHalf: 132,
    edgeMode: "fall",
    // handrails along the boardwalk — the broken-plank gaps stay deadly
    edgeSegments: [
      { s0: 0.0, s1: 0.28, mode: "guardrail" }, { s0: 0.34, s1: 0.5, mode: "guardrail" },
      { s0: 0.56, s1: 0.76, mode: "guardrail" }, { s0: 0.82, s1: 0.99, mode: "guardrail" }
    ],
    offroadKind: "rock",
    theme: {
      bg: 0x171228, bgDetail: 0x110d1f, corridor: 0x2c2342,
      road: 0x4a3c58, roadEdge: 0x8a7aa8, wall: 0x6a5a9a, wallStyle: "ghost", deco: "ghost", dark: true
    },
    features: [
      { kind: "ramp", s0: 0.28, s1: 0.295, d0: -104, d1: 104 },
      { kind: "gap", s0: 0.295, s1: 0.325, d0: -104, d1: 35 },  // broken planks (left)
      { kind: "ramp", s0: 0.505, s1: 0.52, d0: -104, d1: 104 },
      { kind: "gap", s0: 0.52, s1: 0.548, d0: -25, d1: 104 },   // broken planks (right)
      { kind: "boost", s0: 0.62, s1: 0.64, d0: -104, d1: 104 },
      { kind: "ramp", s0: 0.765, s1: 0.78, d0: -104, d1: 104 },
      { kind: "gap", s0: 0.78, s1: 0.802, d0: -104, d1: 104 },  // the big collapse — jump it
      { kind: "boost", s0: 0.9, s1: 0.92, d0: -104, d1: 104 }
    ],
    hazards: [
      { kind: "gastly", s: 0.12 },
      { kind: "gastly", s: 0.4 },
      { kind: "gastly", s: 0.6 },
      { kind: "gastly", s: 0.86 }
    ],
    hills: [
      { s: 0.18, h: 45, w: 0.06 },
      { s: 0.68, h: 60, w: 0.07 }
    ],
    itemRows: [0.08, 0.34, 0.57, 0.88],
    candies: [
      { s: 0.05, d: -40 }, { s: 0.16, d: 40 }, { s: 0.26, d: 0 },
      { s: 0.38, d: -40 }, { s: 0.47, d: 40 }, { s: 0.58, d: -40 },
      { s: 0.7, d: 0 }, { s: 0.84, d: 40 }, { s: 0.95, d: -30 }
    ],
    musicId: 10,
    laps: 3
  },
  {
    id: 10,
    name: "Mt. Moon",
    subtitle: "Switchbacks under the moon stone",
    // Choco-Mountain style: a long climb to the summit, rolling Graveler
    // coming down at you, and a flying descent past the craters.
    points: [
      [600, 2100], [450, 1400], [700, 800], [1400, 500], [2200, 420],
      [2900, 550], [3400, 950], [3500, 1550], [3200, 2050], [2600, 2350],
      [1900, 2200], [1500, 1800], [1100, 2050]
    ],
    roadHalf: 122,
    corridorHalf: 260,
    edgeMode: "wall",
    edgeSegments: [
      { s0: 0.2, s1: 0.31, side: "both", mode: "guardrail" },
      { s0: 0.52, s1: 0.64, side: "left", mode: "guardrail" },
      { s0: 0.74, s1: 0.82, side: "right", mode: "wall" }
    ],
    offroadKind: "rock",
    theme: {
      bg: 0x2a2548, bgDetail: 0x221e3c, corridor: 0x3c3660,
      road: 0x6a6490, roadEdge: 0xd8d4f0, wall: 0x1a1830, wallStyle: "moon", deco: "moon", dark: true
    },
    features: [
      { kind: "boost", s0: 0.255, s1: 0.275, d0: -100, d1: 100 }, // crest dash — launches off the summit
      { kind: "mud", s0: 0.34, s1: 0.39, d0: 0, d1: 100 },        // scree slide
      { kind: "boost", s0: 0.52, s1: 0.54, d0: -100, d1: 100 },
      { kind: "mud", s0: 0.62, s1: 0.66, d0: -100, d1: -10 },
      { kind: "boost", s0: 0.9, s1: 0.92, d0: -100, d1: 100 }
    ],
    shortcuts: [
      { s0: 0.315, s1: 0.43, d0: -78, d1: 76, roadHalf: 46, corridorHalf: 98, surface: "mud" },
      { s0: 0.59, s1: 0.715, d0: 78, d1: -74, roadHalf: 44, corridorHalf: 96 }
    ],
    hazards: [
      { kind: "boulder", s: 0.3, d: 0 },
      { kind: "boulder", s: 0.82, d: 20 },
      { kind: "diglett", s: 0.45, d: -40 },
      { kind: "diglett", s: 0.57, d: 35 },
      { kind: "snorlax", s: 0.68, d: -10 }
    ],
    hills: [
      { s: 0.22, h: 120, w: 0.1 },  // the big climb to the summit
      { s: 0.48, h: 55, w: 0.06 },
      { s: 0.76, h: 90, w: 0.08 }   // second peak before the home descent
    ],
    itemRows: [0.08, 0.36, 0.6, 0.85],
    candies: [
      { s: 0.06, d: -60 }, { s: 0.14, d: 70 }, { s: 0.24, d: 0 },
      { s: 0.33, d: -120 }, { s: 0.44, d: 60 }, { s: 0.55, d: -70 },
      { s: 0.66, d: 90 }, { s: 0.76, d: 0 }, { s: 0.88, d: -60 }, { s: 0.96, d: 50 }
    ],
    musicId: 11,
    laps: 3
  },
  {
    id: 11,
    name: "Power Plant",
    subtitle: "Pinball alley — mind the Electrode",
    // Waluigi-Pinball style: a neon launcher, staggered boost lanes, and
    // live Electrode bumpers that go off after a few hits. Zapdos lives here.
    points: [
      [650, 1500], [800, 800], [1500, 500], [2400, 450], [3100, 650],
      [3450, 1200], [3300, 1800], [2700, 2200], [1800, 2350], [1000, 2200], [600, 1900]
    ],
    roadHalf: 135,
    corridorHalf: 300,
    edgeMode: "wall",
    edgeSegments: [
      { s0: 0.0, s1: 0.08, side: "both", mode: "guardrail" },
      { s0: 0.53, s1: 0.61, side: "both", mode: "guardrail" },
      { s0: 0.78, s1: 0.91, side: "right", mode: "wall" }
    ],
    offroadKind: "rock",
    theme: {
      bg: 0x101a1c, bgDetail: 0x0a1416, corridor: 0x1c2a2c,
      road: 0x2e3a40, roadEdge: 0xf0d048, wall: 0x060c0e, wallStyle: "energy", deco: "plant", dark: true
    },
    features: [
      { kind: "boost", s0: 0.01, s1: 0.06, d0: -135, d1: 135 },  // the plunger launch
      { kind: "boost", s0: 0.28, s1: 0.31, d0: -135, d1: -40 },
      { kind: "boost", s0: 0.42, s1: 0.45, d0: 40, d1: 135 },
      { kind: "ramp", s0: 0.55, s1: 0.565, d0: -135, d1: 135 },
      { kind: "gap", s0: 0.565, s1: 0.592, d0: -300, d1: 300 }, // jump between table sections
      { kind: "boost", s0: 0.7, s1: 0.73, d0: -135, d1: -40 },
      { kind: "boost", s0: 0.86, s1: 0.89, d0: 40, d1: 135 }
    ],
    hazards: [
      { kind: "electrode", s: 0.13, d: 55 },
      { kind: "electrode", s: 0.21, d: -65 },
      { kind: "electrode", s: 0.36, d: 0 },
      { kind: "electrode", s: 0.48, d: 75 },
      { kind: "electrode", s: 0.66, d: -55 },
      { kind: "electrode", s: 0.81, d: 40 },
      { kind: "zapdos" }
    ],
    hills: [
      { s: 0.27, h: 55, w: 0.05 },  // ramp up the turbine housing
      { s: 0.53, h: 62, w: 0.045 }, // catwalk climb into the table jump
      { s: 0.78, h: -40, w: 0.045 } // cooling-duct dip
    ],
    itemRows: [0.09, 0.3, 0.52, 0.76, 0.94],
    candies: [
      { s: 0.07, d: -70 }, { s: 0.17, d: 80 }, { s: 0.26, d: 0 },
      { s: 0.34, d: -90 }, { s: 0.46, d: -60 }, { s: 0.6, d: 70 },
      { s: 0.72, d: 0 }, { s: 0.84, d: -80 }, { s: 0.93, d: 60 }
    ],
    musicId: 12,
    laps: 3
  },

  // ---------------- battle arenas (ids 12+) ----------------
  // Wide enclosed rings: the whole loop is one broad battlefield with hills,
  // dips and ramps. laps is a sentinel — battles end by balloons, not laps.
  {
    id: 12,
    name: "Pallet Plaza",
    subtitle: "Battle arena — town square scramble over rolling lawns",
    arena: true,
    points: [
      [1800, 560], [2330, 700], [2640, 1120], [2620, 1620], [2280, 2000],
      [1760, 2120], [1260, 1960], [960, 1540], [1000, 1040], [1340, 680]
    ],
    roadHalf: 205,
    corridorHalf: 235,
    edgeMode: "wall",
    edgeSegments: [
      { s0: 0.08, s1: 0.18, side: "both", mode: "guardrail" },
      { s0: 0.42, s1: 0.52, side: "left", mode: "wall" },
      { s0: 0.76, s1: 0.86, side: "right", mode: "guardrail" }
    ],
    offroadKind: "grass",
    theme: {
      bg: 0x4f9e43, bgDetail: 0x3f8a36, corridor: 0x67b257,
      road: 0xc8b18a, roadEdge: 0xf5ead2, wall: 0x8a5a32, wallStyle: "posts", deco: "plain"
    },
    features: [
      { kind: "ramp", s0: 0.115, s1: 0.13, d0: -200, d1: 200 },  // launch over the fountain mound
      { kind: "boost", s0: 0.3, s1: 0.325, d0: -60, d1: 200 },
      { kind: "mud", s0: 0.44, s1: 0.485, d0: -200, d1: -40 },
      { kind: "ramp", s0: 0.615, s1: 0.63, d0: -200, d1: 200 },
      { kind: "boost", s0: 0.8, s1: 0.825, d0: -200, d1: 60 }
    ],
    hazards: [
      { kind: "diglett", s: 0.2, d: 80 },
      { kind: "diglett", s: 0.53, d: -90 },
      { kind: "diglett", s: 0.9, d: 0 }
    ],
    hills: [
      { s: 0.13, h: 86, w: 0.05 },   // fountain mound — ramp launches off it
      { s: 0.3, h: -48, w: 0.05 },   // sunken garden
      { s: 0.49, h: 60, w: 0.06 },
      { s: 0.63, h: 92, w: 0.05 },   // mail-hill jump
      { s: 0.82, h: -55, w: 0.05 }   // pond hollow
    ],
    itemRows: [0.04, 0.17, 0.29, 0.42, 0.54, 0.67, 0.79, 0.92],
    candies: [
      { s: 0.09, d: 150 }, { s: 0.26, d: -150 }, { s: 0.41, d: 100 },
      { s: 0.58, d: -120 }, { s: 0.74, d: 150 }, { s: 0.88, d: -100 }
    ],
    musicId: 0,
    laps: 99
  },
  {
    id: 13,
    name: "Mt. Moon Crater",
    subtitle: "Battle arena — bowl-and-rim moonscape, watch the pits",
    arena: true,
    points: [
      [1700, 600], [2240, 760], [2520, 1200], [2460, 1700], [2060, 2020],
      [1500, 2060], [1040, 1800], [900, 1300], [1120, 860]
    ],
    roadHalf: 195,
    corridorHalf: 225,
    edgeMode: "wall",
    offroadKind: "space",
    theme: {
      bg: 0x23233f, bgDetail: 0x1a1a30, corridor: 0x323252,
      road: 0x4a4a6e, roadEdge: 0x9a9ac8, wall: 0x15152a, wallStyle: "moon", deco: "moon", dark: true
    },
    features: [
      { kind: "ramp", s0: 0.165, s1: 0.18, d0: -190, d1: 190 },  // crater-lip launch
      { kind: "gap", s0: 0.18, s1: 0.205, d0: -90, d1: 90 },     // the pit — fall in, lose a balloon
      { kind: "boost", s0: 0.36, s1: 0.385, d0: -190, d1: 190 },
      { kind: "ice", s0: 0.5, s1: 0.56, d0: -190, d1: 0 },       // frozen regolith
      { kind: "ramp", s0: 0.69, s1: 0.705, d0: -190, d1: 190 },
      { kind: "gap", s0: 0.705, s1: 0.725, d0: 0, d1: 190 }      // half-width pit
    ],
    hazards: [
      { kind: "electrode", s: 0.1, d: 0 },
      { kind: "electrode", s: 0.45, d: 70 },
      { kind: "electrode", s: 0.6, d: -70 },
      { kind: "boulder", s: 0.85 }
    ],
    hills: [
      { s: 0.08, h: 70, w: 0.05 },    // rim ridge
      { s: 0.17, h: 96, w: 0.045 },   // crater lip — clears the pit
      { s: 0.31, h: -70, w: 0.06 },   // deep bowl
      { s: 0.55, h: 64, w: 0.05 },
      { s: 0.7, h: 88, w: 0.045 },    // second lip
      { s: 0.88, h: -52, w: 0.05 }
    ],
    itemRows: [0.05, 0.14, 0.27, 0.4, 0.53, 0.64, 0.78, 0.93],
    candies: [
      { s: 0.12, d: -140 }, { s: 0.3, d: 120 }, { s: 0.47, d: -110 },
      { s: 0.62, d: 130 }, { s: 0.8, d: -130 }, { s: 0.95, d: 90 }
    ],
    musicId: 10,
    laps: 99
  },
  {
    id: 14,
    name: "Cinnabar Caldera",
    subtitle: "Battle arena — lava pools below, Moltres above",
    arena: true,
    points: [
      [1760, 620], [2300, 740], [2620, 1160], [2600, 1680], [2200, 2040],
      [1660, 2120], [1140, 1940], [880, 1480], [980, 980], [1340, 700]
    ],
    roadHalf: 210,
    corridorHalf: 240,
    edgeMode: "wall",
    offroadKind: "rock",
    theme: {
      bg: 0x3a1d16, bgDetail: 0x2c140f, corridor: 0x4e2a1c,
      road: 0x6a4632, roadEdge: 0xf0b048, wall: 0x241008, wallStyle: "lava", deco: "volcano", dark: true
    },
    features: [
      { kind: "lava", s0: 0.08, s1: 0.13, d0: -205, d1: -60 },   // shore pools
      { kind: "ramp", s0: 0.21, s1: 0.225, d0: -205, d1: 205 },  // jump the lava river
      { kind: "lava", s0: 0.225, s1: 0.27, d0: -120, d1: 205 },
      { kind: "boost", s0: 0.4, s1: 0.425, d0: -205, d1: 205 },
      { kind: "lava", s0: 0.55, s1: 0.6, d0: -60, d1: 205 },
      { kind: "ramp", s0: 0.72, s1: 0.735, d0: -205, d1: 205 },
      { kind: "lava", s0: 0.735, s1: 0.775, d0: -205, d1: 60 }
    ],
    hazards: [
      { kind: "moltres" },
      { kind: "boulder", s: 0.35 },
      { kind: "boulder", s: 0.65 },
      { kind: "diglett", s: 0.5, d: 0 }
    ],
    hills: [
      { s: 0.21, h: 90, w: 0.05 },   // levee over the lava river
      { s: 0.34, h: -58, w: 0.055 }, // ash basin
      { s: 0.47, h: 72, w: 0.05 },
      { s: 0.72, h: 95, w: 0.05 },   // caldera lip
      { s: 0.9, h: -48, w: 0.05 }
    ],
    itemRows: [0.04, 0.16, 0.31, 0.45, 0.58, 0.69, 0.83, 0.94],
    candies: [
      { s: 0.06, d: 160 }, { s: 0.29, d: -140 }, { s: 0.43, d: 120 },
      { s: 0.62, d: -150 }, { s: 0.78, d: 140 }, { s: 0.92, d: -110 }
    ],
    musicId: 4,
    laps: 99
  }
];

export const getTrack = (id: number): TrackDef => TRACKS[id];
/** Racing tracks only (for cup/time-trial lists). */
export const RACE_TRACKS = TRACKS.filter((t) => !t.arena);
/** Battle arenas. */
export const ARENAS = TRACKS.filter((t) => t.arena);

# PokéKart — Kanto Grand Prix

A Mario Kart-style browser racer starring the original 151 Pokémon. No karts:
every Pokémon races with its own movement style — runners sprint, flyers hover
over gaps, floaters glide across rough ground, swimmers surge through water,
and heavies bulldoze everyone else out of the way.

Built with **Phaser 3 + Vite + TypeScript**. Races run in a SNES-style
**Mode 7 first-person camera** (a GLSL ground shader re-projects the track,
everything else is billboarded) with four rigs — low road-hugger (default),
classic, high chase, and a bumper cam — cycled with V; press C for classic
top-down. Everything
(sprites, tracks, audio) is generated procedurally at runtime — no external
assets, no backend. Progress saves to `localStorage`.

## Run it

```bash
git clone https://github.com/char-boomer-remakes/pokekart.git
cd pokekart
npm install
npm run dev
```

Your browser opens to http://localhost:5173 automatically (set
`server.open` in `vite.config.ts` to `false` if you'd rather it didn't).

On Windows? See [WINDOWS.md](WINDOWS.md) for a step-by-step setup guide.

Handy dev URLs:

- `http://localhost:5173/?demo=1&track=4` — AI-driven attract mode on any track (0–11)
- `http://localhost:5173/?race=2` — jump straight into a race as Pikachu
- `http://localhost:5173/?tt=0` — jump straight into a Time Trial
- `http://localhost:5173/?battle=0` — jump into Balloon Battle (arenas 0–2; add `&demo` to watch the AI brawl)

## Controls

| Key | Action |
| --- | --- |
| ↑ / ↓ | accelerate / brake (WASD also works) |
| ← / → | steer |
| SPACE (hold) | hop into a drift — sparks go blue → orange → purple, release for bigger boosts |
| SHIFT | use item (3× Agility charges in Time Trial) |
| Z / X (or Q / E) | fire signature move slot 1 / 2 — costs energy from the meter |
| P or ESC | pause menu — resume, restart, switch racer, or quit from any race |
| M | mute · C view (first-person / top-down rotating / north-up) |
| V | camera rig in first person — LOW (default) / CLASSIC / HIGH / BUMPER |

Menus all follow the same scheme: arrows to move, ENTER to confirm, ESC to
back out — from a race all the way up to the title screen.

## The game

- **Grand Prix** — 4 cups × 3 races vs 7 AI with rubber-band difficulty,
  points standings, and a podium ceremony.
- **Balloon Battle** — Mario Kart-style arena brawl vs 7 AI. Everyone gets
  **3 balloons**; every stunning hit (and every fall) pops one, with a
  2-second mercy window after each pop. Lose all three and you're out —
  last Pokémon standing wins, with a 3-minute cap decided by balloons left,
  then hits scored. Battles run in three purpose-built **arenas** — wide
  multi-level rings rather than circuits: *Pallet Plaza* (rolling lawns,
  crossing ramps, Diglett), *Mt. Moon Crater* (crater-lip launches over
  fall-in pits, ice patches, Electrode), and *Cinnabar Caldera* (lava
  pools, levee jumps, Moltres overhead). Elevation is tactical: heavies
  ground-pound off the lips, flyers cross the pits for free. Items use a
  flat combat table (racers down to their last balloon roll stronger),
  Thunderbolt zaps whoever's nearest, Hydro Pump and Leech Seed home on
  the Pokémon in front of your muzzle, Hyper Beam becomes a straight
  cannon shot, and Teleport blinks you to the far side of the arena.
  Rare Candies still spawn — evolving mid-battle is a power play. Winning
  a battle unlocks a new Pokémon.
- **Time Trial** — race the clock; your best run is saved as a ghost replay.
- **Pokédex** — progression screen. You start with **24 racers** covering all
  five movement classes and every type, and unlock the rest of the 151 by
  winning races (3 per win, 1 per podium). The **Poké and Great Ball Cups are
  open from the start**; any trophy opens the Master Ball Cup, a Master
  trophy opens Ultra. Trophies award legendaries: the birds for a
  Master Ball Cup podium, Mewtwo for Ultra Ball Cup gold, and Mew for
  sweeping all four cups.
- **Cheats** — an optional debug menu (off by default, saved between
  sessions): unlock everything, easy rivals, infinite items, in-race debug
  keys (`1` cycle item · `2` +1 candy · `3` evolve · `4` boost · `5` warp
  ahead), and a live telemetry overlay (fps / speed / track position /
  surface). Toggling cheats never touches your real Pokédex progress.

### Signature moves

Items come from boxes; **signature moves are yours**. Before every race you
equip up to **2 moves** from your Pokémon's personal pool (4 per species,
drawn from its types — Pikachu runs Thunder Wave / Volt Tackle / Swift,
Charmander runs Flame Charge / Ember Burst, Gengar gets Shadow Sneak…).
**Every pool is guaranteed a defensive option**, so you can always build
turtle instead of cannon. In the race they're fired with **Z / X** and
paid for from an **energy meter** that charges by driving well: drift
releases, big air, slipstream bursts, boost pads, landing hits, item
pickups, finishing laps — and evolving or hitting MAX POWER dumps in a
big chunk.

Eight move categories, each interacting with the racing model:

- **Dashes** (Volt Tackle, Flame Charge, Aqua Jet, Extreme Speed) — a burst
  of speed that turns your body into the weapon: contact paralyzes, burns
  or spins rivals. Aqua Jet leaves a water trail your fellow swimmers surf
- **Shots** (Ember Burst, Ice Shard, Rock Throw, Swift) — projectiles down
  the road; Swift homes (it never misses), Rock Throw lobs over guardrails
  and bursts into a rubble zone
- **Zones** (Fire Spin, Stun Spore, Frost Mist, String Shot, Acid Spray) —
  lingering hazards painted on the track behind you; the type chart decides
  who suffers crossing them
- **Pulses** (Earthquake, Thunder Wave, Gust, Confusion) — radial bursts.
  Earthquake only rattles *grounded* racers (flyers float over it); Gust
  shoves light Pokémon hardest; Confusion reverses a rival's steering
- **Stances** (Counter, Barrier) — a brief guard that reflects the next hit
  back at the attacker, or hardens you through anything
- **Guards** (Harden, Withdraw, Haze, Recover, Acid Armor) — the defensive
  toolkit: Harden blocks the next hit, Withdraw shells through **two**,
  Haze wipes your status and shrouds you untouchable for a beat, Recover
  cleanses and surges you back to pace, and Acid Armor blocks a hit while
  poisoning anyone who dares a shoulder-check. Rivals bring them too —
  some swap their second slot for their pool's guard and shell up under
  pressure
- **Transforms** (Dig, Fly, Shadow Sneak) — leave the racing plane
  entirely: tunnel under hazards (and surface with a shockwave), soar over
  gaps as a ground type, or phase out as a ghost
- **Buffs** (Agility+, Rock Polish, Rain Dance) — self or weather effects;
  Rain Dance slicks the whole field while water types keep their grip

Moves unlock by **using the Pokémon**: each species earns XP per race
(3 win / 2 podium / 1 finish; Time Trials pay for new bests), opening its
move pool at 0 / 2 / 5 / 9 XP — the select screen shows the pool, costs
and how far the next unlock is, and the results screen flashes **NEW MOVE
UNLOCKED** the moment one opens. AI rivals fight back with the same system.

### Racing mechanics

- Race-start countdown with rocket-start timing (hold ↑ right as GO! flashes)
- Drift mini-turbos (3 tiers), slipstream draft boosts
- 14 items, all Pokémon moves, weighted by position — and rubber-banded by
  gap: fall far behind the leader and your rolls come from one or two
  positions further back than you really are, so the pack always has a way
  home. The roster: Ember (bouncing
  fireball), Hydro Pump (homing water jet), Razor Leaf (orbiting blade
  shield), Thunderbolt (telegraphed storm-cloud strike), Rollout (a boulder
  that flattens whoever it hits and keeps rolling), Ice Beam (straight-line
  freeze shot), Toxic (lingering poison puddle dropped behind you), Leech
  Seed (saps the racer ahead to fuel your own boost), Hyper Beam (back-of-
  the-pack only: blasts everyone on the road ahead), Substitute, Agility,
  Sleep Powder, Protect, and last-place-only Teleport
- **STAB — Same Type Attack Bonus**: using a move that matches your
  Pokémon's type upgrades it — fire types fan out three Embers, grass types
  spin five Razor Leaves, electric types call two Thunderbolts, normal
  types hold Protect longer, psychics warp further on Teleport, and every
  matching hit stuns harder. Item rolls are also biased toward your own
  type, so each racer has a signature arsenal
- **Type chart**: offensive items follow Gen-1 matchups — a super-effective
  hit stuns much longer ("SUPER EFFECTIVE!"), resisted hits shrug off fast,
  ground types ignore Thunderbolt entirely; poison types are immune to
  Toxic, grass types to Leech Seed, ice types to Ice Beam
- Status effects: paralysis (mushy steering), sleep (a short nap), burn
  (speed drain), poison (heavier drain), leeched (sapped speed), frozen
  (Articuno's beam). Hits are forgiving by design: you keep half your speed
  through a spin, every hit grants a generous mercy window afterwards (you
  can never be chain-stunned), a **shake-it-off rebound** surges you back up
  to speed the moment a stun wears off, and homing shots flash a "!" warning
  before they arrive. Landing your own hits pays energy and a crisp HIT!
  confirm — aggression is a build, not just a nuisance
- **Mid-race evolution**: grab 2 Rare Candies to evolve on the spot
  (Charmander → Charmeleon → Charizard — the line even changes movement
  class). Fully-evolved and single-stage racers aren't left out: their 2
  candies trigger a **MAX POWER** rush — a big boost plus a permanent stat
  stack (up to Lv.3). Candy pips next to your item slot track progress
- **Hills and drops**: every track now has real elevation — climbs, dips,
  a city overpass, catwalk ramps — and cresting a hill at speed launches
  you airborne. The first-person camera pitches over the brow; slopes are
  shaded on the track
- **Slopes play to each class**: heavies grind up climbs but barrel
  downhill fastest and launch hardest off crests — and a big heavy landing
  slams a shockwave that knocks lighter racers aside. Flyers barely feel
  the grade and ride crest **updrafts** into a free surge (plus longer
  glides off ramps); floaters skim over slopes; runners climb nimbly;
  swimmers hate uphill hauls. Pick lines to match your legs
- Hazards: jump ramps, boost pads, water crossings, falling Snorlax, popping
  Diglett, drifting Gastly (normal types phase through!), Electrode pinball
  bumpers that self-destruct, rolling Graveler boulders, and roaming
  legendaries — Zapdos zaps, Moltres dive-bombs and leaves fire patches,
  Articuno freezes
- Cliff tracks (Indigo Plateau, Lavender Tower) have **guardrails** along
  most of the rim — only the jump gaps and a few marked windows can drop
  you, and Fearow airlifts you back fast when they do
- Every Pokémon has a procedural cry — on the select screen, at the
  starting line, and when it evolves
- **Living movement audio**: your racer is audible — footstep patter for
  runners, stomps for heavies, wing-flaps for flyers, a soft hum for
  floaters, splashes and bubbles for swimmers — all pacing up with speed,
  with wind rush in the air, drift hiss, landing thuds, heavy ground-pound
  slams, and overtake / overtaken position blips. On top of that sit two
  continuous loops: a **wind-rush bed** that swells and brightens with
  speed (louder again on boosts, drafts and airtime) and a **skid hiss**
  that tracks drift charge and hard flat-out cornering
- **Speed you can see**: anime-style speed lines streak out of the
  vanishing point as you push past cruising speed (denser and warmer on a
  boost), the first-person lens widens with speed for that tunnel-rush
  feel, drifts pour smoke that thickens with the charge tier, hard
  cornering scrubs up dust — and every slide leaves **skid marks baked
  into the track**, so the racing line darkens lap after lap
- **A modern glass HUD**: frosted panels with hairline strokes, a big
  position card with ordinal chip, a mono lap timer, gradient energy and
  bottom-center **speed bars** (amber and pulsing while you boost), move
  chips with key caps, type-color accents and cost ticks on the meter,
  pill toasts and status banners, and a glowing item card
- Sprites are procedurally drawn with radial shading, gloss highlights and
  expressive faces; racers bounce with their stride, lean into turns, and
  squash on landing
- **Living skies**: every environment has its own sky — gradient, drifting
  clouds, sun / moon / planet, stars, and a horizon silhouette (treelines,
  mesas, volcano ridges, a lit city skyline) that pans as you steer
- **Roadside scenery**: trees, pines, palms, crystals, gravestones, neon
  towers, lampposts and pylons line each course as Mode 7 billboards, with
  checkered flags flanking the start line
- **A living course**: trainer crowds bounce in the bleachers at the start
  line and gather at the big jumps (they cheer every lap); theme-matched
  wild Pokémon loiter in the scenery and cry out as you pass; flocks of
  Pidgey, Spearow or Zubat wheel overhead (Staryu in space, Magnemite at
  the Power Plant); and every track hides one oversized cameo in the far
  background — find Gyarados off Cerulean Cape or Mewtwo above Indigo
- Richer ground art: hand-mottled terrain and asphalt, red-and-white rumble
  strips on sharp bends, and starting-grid slot brackets

### Battle AI

Battle bots run a different brain from the racing line-followers — a
state machine re-evaluated on a jittered ~0.3–0.55s clock (so nobody
aim-bots):

- **SCAVENGE** — unarmed: drive for the nearest live item box, detouring
  for Rare Candies when the species can still evolve
- **HUNT** — armed: pick a victim scored by distance, low balloons
  (finish them off!), and a grudge against whoever hit them last (with a
  soft mercy bias away from a player on their final balloon); close in,
  then fire only once range *and* firing-arc line up for that weapon —
  traps like Toxic and Substitute drop when someone's tailing them
- **EVADE** — last balloon with a hunter nearby: run away, save Protect
  for the incoming shot, burn Agility or Teleport to escape

They dodge incoming projectiles and arena hazards with the same avoidance
sense as the race AI, and there's no rubber-banding in battle — just a
flat, slightly soft pace.

### Tracks

Poké Ball Cup: Route 1 · Viridian Forest · Cerulean Cape
Great Ball Cup: Rock Tunnel · Cinnabar Volcano · Seafoam Ice Caves
Master Ball Cup: Saffron City (night) · Victory Road · Indigo Plateau (rainbow-road finale)
Ultra Ball Cup: Lavender Tower (haunted boardwalk) · Mt. Moon (summit switchbacks) · Power Plant (pinball alley)
Battle arenas: Pallet Plaza · Mt. Moon Crater · Cinnabar Caldera

## Project layout

```
src/
  main.ts               Phaser bootstrap
  constants.ts, types.ts, util.ts
  data/                 pokemonData (all 151), trackData (12 tracks + 3 arenas),
                        items, cups, movesData (signature moves, pools, XP)
  systems/              Stats, SaveSystem, AudioSystem (chiptune synth),
                        SpriteFactory (procedural sprites), TrackGeometry
                        (spline + s/d projection), TrackRenderer,
                        Mode7 (first-person ground shader + billboards),
                        Scenery (roadside billboard props)
  race/                 Racer (physics/classes/drift/status), AIDriver,
                        BattleAI (battle-mode state machine), ItemManager,
                        MoveManager (signature moves), HazardManager,
                        RaceDirector, Ghost
  scenes/               Boot, Title, Menu, Pokedex, Select, Race, Hud,
                        Pause, Results, Cheats
  state/GameState.ts    current session (cup, roster, points)
```

Tracks are defined as closed Catmull-Rom loops; every gameplay query
(surfaces, item rows, lap progress, AI racing lines, minimap) works in
track-relative coordinates `(s, d)` — distance along the lap and lateral
offset — which is what keeps 12 tracks cheap to author and tune. Elevation
is a sum of gaussian bumps over `s`: the same `heightAt`/`slopeAt` profile
drives the physics, the Mode 7 horizon pitch, billboard heights, and the
baked slope shading.

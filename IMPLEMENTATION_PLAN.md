# IMPLEMENTATION PLAN — Bonfire: Winter Survivors

Status: **implemented** — playable build in `game/`, 49 headless tests green
(`node game/test/run_tests.js`). See §12 for what shipped vs. this plan.
Companion to: [README.md](README.md) (the concept / box mockup)

## 1. What we're building

A single-player, isometric, party-based survival RPG that realizes the design
in the README: four heroes, one bonfire, day/night cycles, permadeath, and a
10–12 hour replayable campaign culminating in the castle on the hill.

The core rule: **every system feeds the fire.** The fire is the safe zone
(light radius), the clock (burn rate), and the party's health proxy (warmth).

## 2. Design pillars → systems

| Pillar (README) | System(s) |
|---|---|
| Fire as health bar, base, clock | `FireSim`, light/shadow rendering, warmth model |
| Day/night rhythm | `GameClock`, phase state machine, spawn director |
| Characters as people | `PartyManager`, bond/grudge graph, dialogue system |
| Moving camp as gamble | Ember-carry traversal mode, torch timer |
| Short, replayable, permadeath | Event deck, run-based saves, permadeath, seed RNG |

## 3. Tech stack

- **Engine (shipped):** zero-dependency HTML5 canvas + vanilla JS, no build
  step. The pure simulation core (`game/src/core/`) runs in both the browser
  and Node, so every system is unit-testable headless. This resolves open
  question #1 in favor of the plan's web alternative (Phaser-class), minus the
  dependency: isometric diamond-tile rendering and a radial-gradient firelight
  ring replace Godot tilemaps/2D lights 1:1.
- **Engine (original recommendation):** Godot 4.x, GDScript.
  Why: free/MIT, first-class 2D isometric tilemaps, 2D lighting (ideal for the
  firelight ring), fast iteration, exports to Windows/macOS/Linux.
  Alternatives considered: Unity (heavier, slower iteration), Bevy/Rust (more
  boilerplate for UI-heavy RPG).
- **Art:** Aseprite for pixel work; optional Blender pre-render pipeline for
  the "pre-rendered sprite" isometric look (Fallout-style). Base resolution
  640×480, 256-color palette, ordered dithering, scaled up with nearest
  neighbor.
- **Audio:** tracker-style music (XM/IT via OpenMPT or Bosca Ceoil) plus
  CD-audio-style ambient loops; SFX in Audacity. Played through Godot
  `AudioStreamPlayer`.
- **Tooling:** git + GitHub; Godot headless (`--headless`) for CI unit tests
  of the simulation layer.

## 4. Project structure

```
bonfire-winter-survivors/
├── README.md                  # concept + mock press
├── IMPLEMENTATION_PLAN.md     # this file
├── images/                    # box art, screenshots
└── game/                      # Godot project root
    ├── project.godot
    ├── scenes/
    │   ├── main.tscn          # boot, menu, run lifecycle
    │   ├── camp.tscn          # camp scene: fire, party, night defense
    │   ├── day_map.tscn       # world map for day-phase expeditions
    │   └── ember_run.tscn     # moving-camp traversal
    ├── scripts/
    │   ├── core/              # FireSim, GameClock, RNG, EventBus (autoloads)
    │   ├── party/             # characters, stats, bonds, dialogue
    │   ├── systems/           # day activities, night spawns, camp UI
    │   └── ui/                # menus, inventory, conversations
    ├── data/                  # JSON/Tres data-driven content
    │   ├── heroes.json
    │   ├── items.json
    │   ├── events.json        # randomized event deck
    │   └── dialogue/          # fireside conversations
    ├── art/                   # sprites, tilesets, palette
    └── audio/                 # music, sfx
```

## 5. Core systems

### 5.1 FireSim (the heart)
- State: fuel (wood), size (small→roaring), position.
- Derived: light radius (safe zone), burn rate, warmth output, visibility to
  the castle (large fires attract attention/events).
- Fire drains continuously; at zero the fire dies and the camp is exposed.
- Warmth is party HP: cold characters lose health, morale, then die.
- Interfaces everything else reads: spawn director (beasts stay outside the
  ring), UI (the fire *is* the HUD), scouting (castle visibility).

### 5.2 GameClock
- Continuous day/night cycle; phases: Dawn, Day, Dusk, Night.
- Day length ~real-time minutes; night is the danger window. Dusk is the
  "everyone back at camp?" checkpoint.

### 5.3 PartyManager
- Four heroes with stats: HP, warmth, hunger, morale, stamina.
- Permadeath: dead is dead; the run continues with whoever remains.
- Bond/grudge graph between members; fireside dialogue mutates it; bonds
  give combat/morale buffs, grudges penalties.
- Watch assignments, food allocation, blanket allocation — the hard camp
  choices.

### 5.4 Day phase
- Split the party into 1–4 groups; assign each: gather wood, hunt, scout
  toward castle, rest.
- Groups travel the day map with risk proportional to distance from the
  fire's light; return before dusk or face night travel (or don't return).

### 5.5 Night phase
- Beasts spawn in darkness and approach the light ring; combat at the
  perimeter. The fire itself can be attacked — defend it.
- Watch assignments determine who fights, who tends the fire, who sleeps.

### 5.6 Camp management & conversations
- Inventory: wood, food, blankets, torches, embers, traps, weapons.
- Fireside dialogue system: data-driven conversation trees that fire at
  night based on bonds, recent events, and who is present.

### 5.7 Moving camp (ember run)
- Abandon the current fire; carry embers through the dark to a new site.
- Torch/ember timer counts down in real time; reaching a new site with embers
  alive lights the new fire. Failure = night exposure at the old site.

### 5.8 World map & the castle
- Hand-authored valley map with a chain of camp sites toward the castle on
  the hill; the castle is the final multi-floor sequence (the intentional
  difficulty spike).
- Castle visibility from big fires creates long-term pressure to keep fires
  small or move camp.

### 5.9 Events, permadeath, saves
- Seeded RNG per run; event deck of randomized day/night events.
- Run-based save (roguelite style); permadeath on character death.
- Victory: reach and resolve the castle. Defeat: all four dead or fire dead
  with no embers.

## 6. Data-driven content

Heroes, items, events, and dialogue live in JSON/Tres resources loaded at boot,
so the 10–12h campaign is assembled from authored beats + a randomized event
deck without code changes.

## 7. Milestones

| # | Milestone | Acceptance criteria | Est. |
|---|---|---|---|
| M0 | Project setup + art pipeline | Godot project boots; one isometric tilemap renders at 640×480 with palette + dithering; one pre-rendered sprite test | 1 wk |
| M1 | Core loop skeleton | GameClock runs full day/night; camera + one controllable hero on the map | 1 wk |
| M2 | FireSim + light | Fire burns, drains, dies; light radius renders and is queryable; warmth damages cold party members | 2 wks |
| M3 | Party of four + day phase | 4 heroes with stats; split-party day activities; return-before-dusk rule | 2 wks |
| M4 | Night defense | Beasts spawn outside the ring and attack; watch assignments; fire can be attacked | 2 wks |
| M5 | Camp + conversations | Inventory, allocation choices, fireside dialogue, bond/grudge effects in combat | 2 wks |
| M6 | Ember run + castle + full loop | Moving camp works; castle sequence; win/lose; permadeath; seeded runs | 3 wks |
| M7 | Content + polish + audio | Full event deck paced to 10–12h; tracker soundtrack; balance pass; builds for all platforms | 3–4 wks |

Total: ~16–19 weeks to a shippable vertical slice → full campaign.

## 8. Era-authentic presentation

- 640×480 base, 256-color palette, ordered dithering, nearest-neighbor upscale.
- Pre-rendered isometric sprites where feasible (Blender → sprite sheets).
- Firelight as the primary dynamic light; darkness outside the ring with glowing eyes.
- Tracker music + environmental CD loops; optional FMV-style intro (cut if time-boxed).

## 9. Testing & QA

- Unit tests (headless CI) for `FireSim`, `GameClock`, event deck, bond graph.
- Playtest checklist per pillar: e.g. "big fire keeps beasts back but is
  visible from the castle", "small fire lets the eyes creep closer".
- Difficulty targets: brutal but fair; the castle spike is intentional per the
  mock review, but must remain beatable — tune via playtest data.
- Known intentional friction: fiddly inventory (per the 9/10 review) — keep it
  authentic but add a one-click "sort" to avoid pure frustration.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Scope creep on RPG systems | Pillars-first: ship FireSim + clock before any combat depth |
| Art pipeline (pre-render) is slow | Start with 2D pixel art; pre-render only hero sprites |
| Permadeath frustration | Clear information before risky choices; fast restart |
| 10–12h pacing hard to hit | Authored beats + event deck; measure in M7 playtests |
| Godot 2D light perf on large maps | Limit dynamic lights (one fire + eyes); bake the rest |

## 11. Open questions

1. ~~Confirm Godot 4 as engine~~ — resolved: zero-dependency web/canvas (§3).
2. Art pipeline: pure 2D pixel vs. Blender pre-rendered sprites — shipped as
   canvas-drawn pixel art at 640×480 with nearest-neighbor upscale.
3. Castle scope: shipped as a single assault arena with a boss (the intended
   difficulty spike) plus escalating beast spawns.
4. Post-launch modes: campaign only; every run is a new seed.

## 12. Implementation status (what shipped)

| Plan item | Shipped |
|---|---|
| M0 project setup + art pipeline | `game/` static site, 640×480 pixelated canvas with CRT scanlines, pixel-art sprites from bitmap maps, Win95-style UI chrome |
| M1 core loop skeleton | `GameClock` day/dusk/night, isometric 20×15 grid, cell-by-cell BFS movement for heroes and beasts, light radius measured in cells |
| M2 FireSim + light | `FireSim`: wood/size/hp, light radius in grid cells = safe zone (per-cell darkness), castle visibility, relight |
| M3 party + day phase | 4 heroes, task assignment; woodcutting is physical — heroes path to tree cells, chop on a timer, carry wood back to camp; hunt/scout resolve at dusk; late returns |
| M4 night defense | Beasts path cell-by-cell toward the fire/heroes from outside the ring, attack adjacent cells and the fire, watch toggle, click-to-strike |
| M5 camp + conversations | Food/blanket allocation, fireside talk with bond/grudge deltas affecting morale and damage |
| M6 ember run + castle + permadeath | Torch-timer ember run between camp sites, castle assault + boss, permanent death, seeded runs, localStorage saves |
| M7 content + audio | Randomized event deck (10 events), WebAudio tracker-style loop + fire crackle (`src/audio.js`) |
| Tests | `game/test/run_tests.js` (58 assertions incl. grid/BFS, woodcutting, full win/wipe runs) + `game/test/smoke_env.js` (full shell on mocked env). All host access abstracted behind `BF.env` (`src/core/env.js`), resolved at call time; core sim is env-free (poison-env test) |

Deviations from plan: no Godot (web build instead), no tracker files (WebAudio
synth instead), campaign pacing compressed for dev (phase durations are
options on `GameSim`; the 10–12h structure — sites, events, castle spike — is
intact and tunable via `opts`).

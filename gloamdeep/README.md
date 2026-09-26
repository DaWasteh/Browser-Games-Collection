# 🏮 Gloamdeep — The Lantern Below

> **In der Browser Games Collection**
>
> Pixel-Action-RPG mit einem Laternendorf über einem endlosen, prozeduralen Dungeon – Quests,
> Händler, Truhe, Beute in fünf Seltenheiten, vier Zauber, Elite-Monster und Wächter auf jeder
> fünften Etage. Grafik, Sound und Musik entstehen komplett im Code. Gesteuert wird mit
> **Maus und Tastatur** (Touch wird nicht unterstützt).
>
> - **Spielen:** über die [Spieleauswahl](../index.html) bzw. online unter
>   <https://dawasteh.github.io/Browser-Games-Collection/gloamdeep/>. Weil das Spiel aus
>   ES-Modulen besteht, braucht es lokal einen kleinen Webserver: für die ganze Sammlung
>   `python -m http.server 8000` im Repository-Ordner, nur für das Spiel reichen auch
>   `start.bat`, `./start.sh` oder `node serve.mjs 8000` in diesem Ordner. Per `file://`
>   erscheint ein Hinweis.
> - **Behoben gegenüber der Vorlage:** Wandfackeln, Laternenpfähle, Kohlebecken, Kerzen,
>   Lagerfeuer und Fensterschein werfen jetzt wirklich Licht. Das Licht-Baking mit
>   Raycast-Schatten (`Lighting.bakeStatic`) wurde nie aufgerufen; jetzt backt der Renderer die
>   statischen Lichter einmal pro geladenem Areal (`Lighting.useArea`). Das Flackern nutzt
>   dasselbe Schattenpolygon und scheint nicht mehr durch Wände, das Licht-Quellrechteck wird an
>   den Arealrändern sauber beschnitten.
> - **Sammlungs-Integration:** „← Spieleauswahl“ im Titelbildschirm und im Pausenmenü (speichert
>   vorher), Karte im Launcher unter „Action & RPG“.
> - **Tests:** `node gloamdeep/smoke-test.cjs` (Unit- und Syntaxtests, läuft in der CI);
>   `classic-games-smoke.mjs` prüft Boot, Rücklink, Tastatureingabe, Viewports und misst, dass
>   Laternen und Fackeln die Szene tatsächlich aufhellen. Die ausführlichen Browser-Tests unten
>   (`tests/smoke.mjs`, `tests/soak.mjs`) laufen lokal.
>
> Die folgende englische Originaldokumentation beschreibt Spiel, Architektur und Tests im Detail.

An original single-player action RPG for the browser: a compact lantern-lit village above an
endless, procedurally generated dungeon. Torchlight-style zoomed-out camera and dungeon crawl,
Noita-inspired pixel art with dynamic ray-cast lighting, bloom, particles and persistent blood,
scorch and debris decals. Everything — graphics, sound and music — is generated in code.

* Vanilla JavaScript (ES modules) + Canvas 2D, HTML/CSS for the interface
* No frameworks, no build step, no network requests, no external assets — works offline
* Save data in `localStorage`

## Launch

The game uses JavaScript modules, which browsers only load over `http://`, not `file://`.

```
python -m http.server 8000
```

then open <http://localhost:8000>. Alternatives:

* **Windows:** double-click `start.bat` — it finds a free port (8000–8020), starts Python
  (or Node.js as a fallback) and opens the browser.
* **Linux/macOS:** `./start.sh [port]`
* **Node.js only:** `node serve.mjs 8000`

Tested with Chrome at 1280×720 and 1920×1080. Any current Chromium, Firefox or Safari should work.

## Controls

| Input | Action |
|---|---|
| `W` `A` `S` `D` | Move |
| Mouse | Aim |
| Left mouse button | Weapon attack (hold to keep swinging; the swing also parries projectiles) |
| Right mouse button | Cast the spell of your equipped focus |
| `Space` | Dash, with brief invulnerability |
| `E` | Interact, talk, use stairs, pick up items |
| `Q` | Drink a health potion |
| `I` | Inventory and character sheet |
| `M` | Full map overlay (a minimap is always shown) |
| `Esc` | Pause, or close the open window |
| `Alt` (hold) | Show all item labels |
| `N` | Mute · `F1`/`H` help · `F3` debug overlay (FPS, seed, entity counts) |

The browser context menu, page scrolling and text selection are disabled inside the game.

## The game loop

1. **Wickhollow** (the village) — everything is 2–3 seconds apart:
   * **Warden Isolde** offers three procedurally generated quests (hunt a monster family,
     gather relics, reach a floor, slay champions, defeat a guardian). Accept one, track it
     in the HUD, return to turn it in for gold, XP, potions and often an item.
   * **Pell Brasswick** buys and sells. Stock is generated for your level and restocks after
     every expedition or level-up. Includes potions, a buy-back list and "sell all common".
   * **Your storage chest** — 60 slots, persistent across floors, deaths and reloads.
   * **The Gloam Stair** — start at floor 1, at the deepest floor you reached, or at the
     waystone below any guardian you have passed.
2. **The Gloamdeep** — an endless sequence of floors generated from the world seed and the
   floor number. Take the up-stairs where you arrived to go home at any time; the exit stairs
   lead one floor deeper. Every fifth floor holds a guardian whose power seals the exit.
3. Death returns you to the village. You lose 10 % of your gold; level, gear, stash, quest and
   deepest floor are kept.

## Features

**Presentation**
* 16:9 stage, world rendered into a low-resolution buffer and scaled by an integer factor
  (crisp pixels at 720p and 1080p). The player is ~9 % of the view height.
* 3/4 perspective walls (up to two tiles tall) with lips that correctly hide characters
  standing behind them; y-sorted characters and props; contact shadows.
* Lighting: half-resolution light buffer multiplied over the scene. Static lights (torches,
  braziers, crystals, glowcaps, lava) are baked with **ray-cast shadows**; the player's lantern
  casts real-time shadows every frame; spells, loot, fire and explosions add dynamic light.
  Emissive layer (flames, magic, eyes, telegraphs) with a two-level bloom.
* Fog of war revealed by line of sight; drifting mist; ambient embers; town fireflies.
* Particles on a height axis: blood and debris arc, bounce and are painted permanently into
  the floor. Explosions leave scorch marks.
* Four biomes with their own palettes, props, hazards, enemies and guardians:
  Mossbound Catacombs, Glowcap Hollows, Cinder Forge, Shattered Geode. They cycle endlessly,
  getting darker and harder each cycle.
* Procedural pixel sprites (player, 7 villagers incl. a red panda, 24 enemy variants,
  4 guardians), 4-directional walk/attack animations, white hit flashes, screen shake,
  hit-stop, floating damage numbers, rarity light pillars on loot, a red outline plus name
  and life bar for the enemy under the cursor.

**Combat**
* Five weapon types with different arcs, reach, speed and knockback (sword, axe, dagger,
  mace with stagger, long spear thrust). Melee parries enemy projectiles.
* Four spells, chosen by the equipped focus: Ember Bolt (explodes, ignites), Frost Lance
  (pierces, chills, shatters), Chain Lightning (arcs between foes), Void Orb (grinding orb
  that pulls and implodes).
* Six enemy archetypes with distinct AI: melee pursuer, kiting archer that strafes, leaping
  skitterer, exploding bloater (chain reactions), slamming brute, blinking hexer with homing
  orbs. Every attack has a readable telegraph (arc, line, circle, charging orb).
* Seven elite modifiers (swift, brutal, armored, molten trail, vampiric, arcane nova,
  frenzied) with coloured auras and names.
* Four guardians with two phases and 3–4 attack patterns each (charges, sweeps, bullet rings,
  spirals, dodgeable shockwaves, meteor strikes, summons, blinks).
* Hazards: spike traps, fire vents, spore pods, lava / acid / void pools, powder kegs,
  breakable urns, crates and barrels.
* Pathfinding via a shared BFS flow field from the player (no corner cutting), line-of-sight
  checks, pack aggro, separation steering; sub-stepped circle-vs-tile collision.

**Progression**
* Level-ups raise Strength, Intellect, Vitality and Dexterity.
* Seven equipment slots (weapon, focus, helm, armor, boots, ring, amulet), 30-slot pack.
* Five rarities (Common, Magic, Rare, Epic, Legendary), 24 affixes, material tiers by item
  level, ten legendary powers (split bolts, fire trail dash, corpse explosions, …).
* Tooltips compare every stat against the equipped item; ▲ marks likely upgrades.
* Shrines grant temporary buffs; chests and guardian hoards drop better loot.

## Architecture

```
index.html          stage, HUD and overlay markup; file:// warning
css/style.css       interface styling
js/main.js          bootstrap, integer-scaled resize, requestAnimationFrame loop (delta time)
js/game.js          state machine (title / play / dead), area transitions, rewards, quests,
                    merchant & storage actions, saving
js/config.js        constants and balance values
js/core/            rng (seeded mulberry32 + hashing), math, input, audio (Web Audio synth)
js/data/            themes (biomes), enemies (archetypes, skins, elites, guardians)
js/gen/             PURE generators: dungeon, town, items, quests (no DOM, unit tested)
js/systems/         save (schema, validation, migration, localStorage adapter), stats, combat
js/world/           tiles, TileMap (collision, LOS, ray casting), FlowField, Area
js/entities/        player, enemy + boss, projectile, props + traps, loot, npc, effects
js/fx/              sprites, prop art, item icons, tile layer, particles, lighting, pixel font
js/render/          renderer (frame composition), minimap
js/ui/              DOM interface (HUD, panels, tooltips)
tests/              unit tests, syntax/import check, browser smoke test, screenshot gallery
```

* Generation is pure and deterministic: `generateFloor(worldSeed, depth)` returns plain data
  (tiles + descriptors for props, lights, hazards, enemies). Separate RNG streams are used for
  layout, features, population and decoration. Only the current floor lives in memory.
* Floors: non-overlapping rooms of six shapes (rect, round, cellular-automata cave, pillared,
  cross, hall) connected by a minimum spanning tree plus extra loops, with L, Z and wandering
  corridors of width 1–3. Start and exit are chosen by path distance; unreachable pockets are
  removed; water, pits and hazard pools are only kept if they do not break connectivity (and a
  hazard-free path to the exit always exists).
* Save data is versioned (v3) and migrated from older layouts; every field is validated and
  repaired, invalid items are dropped, corrupt JSON is reported instead of crashing.
  Settings are stored separately.

## Tests

```
node tests/run-tests.mjs      # 40 unit tests: RNG, generation, items, quests, stats, saves, light baking
node tests/check-syntax.mjs   # node --check on every module + verifies every named import
node tests/smoke.mjs          # end-to-end browser test (needs a local Chrome or Edge)
node tests/soak.mjs           # accelerated bot playthrough of 20 floors incl. all guardians
node tests/gallery.mjs        # screenshots of all biomes, guardians and elites
```

The unit tests cover, among others: same seed ⇒ same layout, different seeds ⇒ different
layouts, 400 floors (40 seeds × 10 consecutive depths) plus depths 11–60 validated for
reachability, bounds, sealed boundaries and hazard-free paths; guardians on every fifth floor;
item rarity/stat validity over 3,000 items; quest templates and tracking; save round trips,
corrupt and future saves, v1 → v3 migration, and a throwing `localStorage`.

The smoke test serves the folder with a built-in Node server, drives headless Chrome over the
DevTools protocol with real keyboard and mouse events and checks: title → new game, integer
scaling, player size, WASD collision in four directions, quest giver, storage chest, merchant
buy/sell, equipping with comparison tooltips, dungeon entry, lit frame, melee / spell / dash /
damage / potion, kills with XP and loot pickup, stairs, ten more floors including two guardian
seals, quest turn-in, death and respawn, map and pause (seed display), page reload + Continue,
1080p rendering and a stress test — failing on any console error.

The soak test runs the real game logic at accelerated speed in the browser: a bot with every
legendary power equipped fights through floors 1–20 (all biomes and all four guardians through
both phases) while the test checks for exceptions, NaN positions/life values and entity caps.

## Lineage — the best ideas of the model test

This version was built after reviewing every other implementation in this model test. None of
them ran end-to-end without blocking bugs, but each contributed ideas that were adopted and
reworked here:

| Source | Idea taken | How it was improved here |
|---|---|---|
| Qwen3.8 Q8_0 | 3/4 wall front faces, wall contact shadows, drifting fog, CSS low-life vignette, seed input on the title screen | two-tile tall faces with occluding lips; mist lit by the light pass |
| Qwen3.8 UD_Q4_K_XL | palette sprites with white hit-flash variants, walls in the y-sort, guardian seals the exit, dodgeable shockwave, `start.bat` with port probing, `file://` warning | row-interleaved lips instead of per-tile sort; shockwaves reused by guardians, brutes and the frost nova |
| Qwen3.8 IQ3_M | dependency-free DevTools-protocol smoke runner with a lit-pixel check, chunked floor pre-rendering | real keyboard/mouse events, 21 scenario steps, soak test; chunks double as decal canvases |
| Tess-4 | integer canvas scaling, lava as a real hazard, particle presets, audio helpers | height-axis particles with persistent decals; audio scheduled on the audio clock with a reverb bus |
| Laguna-S-2.1 | pure generator returning descriptors, one RNG stream per purpose, relics only drop while a gather quest is active, loot tinted light | six room shapes, connectivity-preserving features, validation function used by tests and at runtime |
| GLM4.7 | DOM overlay UI, guardian enrage phase with bullet fans | full panel system with keyboard focus, comparison tooltips, buy-back, confirmations |
| Thinkingcap / ternary-bonsai | event-driven quest tracking, data-driven rarity table, frame-rate independent shake | quest reducer with five templates; five rarities, affixes and legendary powers |

Lessons from their bugs were applied too: projectiles belong to a team instead of a boolean
flag, loaded saves are rebuilt and validated instead of `Object.assign`-ed, one screen-to-world
transform is used everywhere, and the tests exercise the real save module and the real game.

## Known limitations

* No gamepad or touch controls; designed for mouse and keyboard.
* A floor is regenerated fresh when you continue a saved game in the dungeon (the layout is
  the same, monsters and loot respawn).
* Guardians and elites share the procedural art style; there are no hand-drawn cutscenes.
* Audio is synthesised and intentionally simple; the Web Audio context starts after the first
  click or key press (browser policy).

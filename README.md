# Fear & Hunger — Archipelago

An [Archipelago](https://archipelago.gg) multiworld randomizer for **Fear & Hunger** (v1.4.1, Steam).

It has two parts:
- **an apworld** (`fear_and_hunger.apworld`), used by whoever generates the multiworld;
- **an in-game plugin** (`ArchipelagoFH.js` + `ArchipelagoFH_Data.js`), installed in each Fear & Hunger player's game.

Fear & Hunger is not an official Archipelago game: install the apworld as a custom world.

> Fan project, not affiliated with Miro Haverinen or Happy Paintings. No game files are included: you need
> your own copy of the game.

## How it plays

**Unlocks instead of items.** Nothing you find in the dungeons is yours until the multiworld unlocks it.
When another player finds one of your items, it starts to appear in *your* dungeon. It never goes straight into
your inventory:
- weapons, armors and skill scrolls spawn **once per run** in a free spot (furniture, chest, item on the floor or
  boss loot) of your current part of the dungeon or deeper;
- consumables and books join the normal loot rolls;
- anything not unlocked yet is replaced by a basic item (simple food, cloth, herbs, stones…), which is always
  available.

**Priced weapons.** Claymore, Miasma, Bone shears and Blue Sin never spawn for free. Once unlocked, they only
come from their original event, for the same price (the little girl, the blood price…).

**Explosive vials.** Collapsed hallways can only be blown up with an Explosive vial. The one in the Backyard
leads to the Hidden backyard and all the Thickets (levels 2 to 5), so the logic expects your Explosive vial to be
unlocked before any check there.

**Runs.** Floors stay random every run, as in the base game. Every new game is a new run: your inventory resets,
while checks and unlocks carry over.

**Exchanges.** Each kind of exchange has its own option:
- trades with characters and merchants (like the floor 6 dweller selling an Explosive vial for silver coins)
  give their real result only once it is unlocked (`trades_require_unlock`, on by default);
- cooking, from a cookbook or at a campfire, always gives the real dish (`cooking_requires_unlock`, off by default);
- alchemy and crafting can only make a result once it is unlocked (`alchemy_requires_unlock`, on by default):
  the recipe stays greyed out until then.

Weapons and armors always have to be unlocked. If you pay for something you have not unlocked, you get a basic
item instead.

### Checks (314 by default, up to 343)
| Type | Count |
|---|---|
| Entering a zone for the first time | 68 |
| Beating a creature for the first time (bestiary) | 33 |
| Beating each boss | 21 |
| Beating each enemy group (`troop_checks`) | 139 |
| Picking up each key item | 15 |
| Endings A, B, C, D, S | 5 |
| Ending E, and ending S with each of the 4 starting characters | 5 |
| Learning each skill, by scroll, at a Hexen table for a Lesser soul or from the Book of the Forgotten Memories (`skill_checks`) | 20 |
| Recruiting each companion (`recruit_checks`) | 8 |
| Creating a Marriage (`marriage_check`, never holds progression) | 1 |
| Cooking each dish for the first time (`cooking_checks`) | 9 |
| Crafting each recipe for the first time (`crafting_checks`) | 19 |

`recruit_checks` is on by default; marriage, cooking and crafting are off.

- **Recruits**: the Girl, Cahara, D'arce, Enki, Ragnvaldr, Le'garde, Nas'hrah and Moonless. Your starting
  character does not count.
- **Cooking**: the 7 cookbook recipes (Meatpie, Vegetable pie, Fetus, Bacon & eggs, Mix'n'match stew, Blueberry pie,
  Mushroom stew), plus grilled meat and grilled salmonsnake meat at a campfire.
- **Crafting**: vials, mixes, Torch, Cloth fragment, disguises, Pinecone pig, Creation of life II, Instructions of
  Rebirth. When the recipe book is one of your unlocks, the logic waits for it.

Endings are read from their final cutscene, and a message shows which ending you got.

### Items you can receive
- **Unlocks**: weapons, armors, consumables, books, skill scrolls.
- **Keys** (`randomize_keys`):
  - `extra` (default): keys stay where they are and picking them up is a check. Allies can also send you bonus
    keys, given once.
  - `full`: keys only come from the multiworld and are given back every run.
- **Access items** (`floor_access`): `Access: Part 2`, `Part 3`, `Ma'habre`, `End` (or one per floor). Without
  them, you are sent back as soon as you try to move in a locked part. Cutscenes are never blocked, so a story
  sequence never breaks.
- **Traps** (optional): bleeding, poison, infection, parasites, phobia, hunger, fear, torch out. A trap waits
  until you are free on the map, never during a dialogue, a cutscene or a battle. Hunger is the most common: one
  member of your party, picked at random, loses 30 hunger.
- **Death Link** (optional).

## Requirements
- Fear & Hunger **v1.4.1** (Steam, Windows).
- Archipelago **0.6.7** or newer, for whoever generates the game.

## Installation

### Whoever generates the game (host)
1. Download `fear_and_hunger.apworld` from the [Releases](../../releases) page.
2. Double-click it, or copy it into the `custom_worlds` folder of Archipelago. Restart the Launcher.
3. Put every player's YAML in `Players`, click **Generate**, and host the zip from `output`: use the Launcher's
   **Host**, or upload it on archipelago.gg.

### Each Fear & Hunger player
In `Steam\steamapps\common\Fear & Hunger\www`:
1. Back up `js\plugins.js`.
2. Copy `ArchipelagoFH_Data.js` and `ArchipelagoFH.js` into `js\plugins\`.
3. Copy `archipelago.json` into `www\` and fill it in:
   ```json
   { "server": "archipelago.gg:38281", "slot": "YourSlotName", "password": "" }
   ```
4. Open `js\plugins.js` in a text editor and add these two lines just before the final `];`, with a comma after
   the previous `}`:
   ```
   {"name":"ArchipelagoFH_Data","status":true,"description":"","parameters":{}},
   {"name":"ArchipelagoFH","status":true,"description":"","parameters":{}}
   ```
5. Start the game and begin a **new game**. The title screen shows the connection status.

To uninstall, put your `plugins.js` backup back.

## Options
Start from [`examples/Fear & Hunger.yaml`](examples/Fear%20&%20Hunger.yaml). Every option is explained there.

| Option | Values | Default |
|---|---|---|
| `goal` | `endings` / `genocide` (see below) | endings |
| `endings_required` | 1–5: how many endings among A, B, C, D, S | 1 |
| `required_endings` | specific endings, e.g. `["A", "S"]` (overrides `endings_required`) | empty |
| `auto_release_collect` | release and collect automatically on goal | true |
| `randomize_keys` | `off` / `extra` / `full` | extra |
| `floor_access` | `off` / `per_part` / `per_floor` | per_part |
| `troop_checks` | enemy groups are checks | true |
| `skill_checks` | learning skills is a check | true |
| `logic` | `smart` (expects enough gear before going deeper) / `none` | smart |
| `logic_difficulty` | `relaxed` / `normal` / `strict` | normal |
| `spawn_mode` | `vanilla_tables` (vanilla depth) / `by_depth` / `anywhere` | vanilla_tables |
| `enemy_shuffle` | `off` / `mobs_only` / `mobs_and_bosses` / `chaos` (same as `mobs_and_bosses` for now) | off |
| `weapon_shuffle` | `off` / `swap_stats` / `swap_items` | off |
| `endings_hold_progression` | endings can hold progression items | false |
| `trap_percentage` | 0–100: share of filler replaced by traps | 15 |
| `trap_weights` | weight of each trap | see template |
| `recruit_checks` | recruiting each companion is a check | true |
| `marriage_check` | creating a Marriage is a check | false |
| `cooking_checks` | cooking each dish is a check | false |
| `crafting_checks` | crafting each recipe is a check | false |
| `trades_require_unlock` | trades and merchants only give unlocked results | true |
| `cooking_requires_unlock` | cooking only gives unlocked dishes | false |
| `alchemy_requires_unlock` | alchemy and crafting only make unlocked results | true |
| `hardcore` | every difficulty option at its hardest, runs in Terror & Starvation or Hard (see below) | false |
| `death_link` | Death Link | false |

**Hardcore** overrides the rest of the file: `logic_difficulty: strict`, `randomize_keys: full`,
`floor_access: per_floor`, `spawn_mode: anywhere`, `enemy_shuffle: chaos`, `weapon_shuffle: swap_items`, and
trades, cooking and alchemy all require the unlock. Every run must also be played in **Terror & Starvation or
Hard mode**, your choice for each run (the game warns you if you start in Fear & Hunger or [Dungeon Nights]). It
does not change your goal, which checks are on, traps or Death Link.

**Game difficulty**: a multiworld can span several runs, each in the difficulty you pick, and checks carry over.
Some checks need a given difficulty: the Traces of Sylvian (`Defeat Sylvian`) need Terror & Starvation or Hard
(The Void 2 is closed otherwise), the S endings need Hard, and Hard has no Girl, Cahara, D'arce, Enki or Le'garde to
recruit, so no ending A or C and no Asterisk. Pick the difficulty of each run for what you still need: a goal of
A + S, for example, takes two runs.

**Genocide** (`goal: genocide`): kill every creature of the dungeon at least once, over all your runs: the 33
creatures of the bestiary and the 21 bosses (their checks). Each new creature shows `Genocide: n/54`, and F7 shows
the count and the next ones left. Endings are then only checks.

**Enemy shuffle** never moves the companion and end-game fights: they only happen on some routes or in some
difficulties, so an enemy group sent there could never be fought.

**Playing alone with `randomize_keys: full`** (hardcore included): you start with the 7 Small keys of level 1.
Almost all of level 1 is behind them and only about six checks are open without them, so a world played alone
could often not be generated.

## In game
- **F7** on the map shows or hides a panel: connection, checks done, unlocks waiting in each part, access items
  and keys received.
- Everything is logged to **`www\archipelago_log.txt`**. Send this file when reporting a problem.
- **Offline play**: checks are kept and sent on reconnection. The last known game is cached, so its rules
  still apply offline.
- **Test mode**: with `"debug": true` in `archipelago.json`, you can type commands in the Archipelago chat or write
  them in `www\archipelago_commands.txt` (one per line, read about once a second on the map):
  `give <item> [n]`, `goto <floor or map> [x y]`, `heal`, `trap <name>`, `switch <n> on|off`, `var <n> <value>`,
  `where`, `js <code>` (file only), `help`.

## Tracker (PopTracker)
`fear_and_hunger_poptracker_v0.2.0.zip` on the [Releases](../../releases) page is a pack for
[PopTracker](https://github.com/black-sliver/PopTracker). Put the zip in PopTracker's `packs` folder, open it, click
**AP** and connect with your server address and slot name.
- One tab per part of the dungeon, one column per floor, one box per zone: green when its checks are reachable with
  what you have, yellow when only some are, red when none are, grey when done. Click a box to see its checks.
- A panel with your key items, access items, Explosive vial, priced weapons, skills (scroll unlocked / learned),
  endings, S endings, companions recruited, dishes cooked and recipes crafted.
- A **Bestiary** tab: every creature and every boss, lit up once beaten.
- Everything that goes through Archipelago is tracked by itself. With `randomize_keys: extra` or `off`, the game
  plugin shares the keys you hold in your current run, so key doors are tracked too.
- The logic is generated from the apworld's data and matches the generator's.

The public pack uses plain badges. `tools/extract_icons.py` can build a personal copy with the game's icons from your
own copy of the game; do not share it.

## Known limitations
- Only tested on the Steam version 1.4.1 (Windows). Fear & Hunger 2: Termina is not supported.
- When an item is replaced, the game's own "you found…" message may still show the original name. The message at
  the top of the screen shows what you really got.
- With `enemy_shuffle`, map sprites stay the same; only the battle changes.

## For developers
- `apworld/fear_and_hunger/`: the world. Zip the `fear_and_hunger` folder to get the `.apworld`.
- `plugin/`: the RPG Maker MV plugin.
- `tools/build_data.py`: builds `data/fh_data.json` from the game's `www/data` folder (your own copy).
  `tools/build_plugin_data.py` turns it into `ArchipelagoFH_Data.js`:
  ```
  python tools/build_data.py <path to www/data> apworld/fear_and_hunger/data/fh_data.json
  python tools/build_plugin_data.py apworld/fear_and_hunger/data/fh_data.json plugin/ArchipelagoFH_Data.js
  ```
- `tools/build_poptracker.py`: builds the PopTracker pack from the same data (`tools/poptracker/` holds its scripts):
  ```
  python tools/build_poptracker.py apworld/fear_and_hunger/data/fh_data.json apworld/fear_and_hunger/__init__.py poptracker_pack
  ```
- `apworld/fear_and_hunger/test/`: generation tests (default options, hardcore over 10 seeds, genocide, every
  check, few checks, full keys, shuffles), run with Archipelago's own test tools:
  `python -m pytest worlds/fear_and_hunger/test` from an Archipelago folder where the world is copied into `worlds/`.
- `tests/`:
  - `test_data_consistency.js` (the plugin loads and its data matches the apworld's) and `test_poptracker_logic.py`
    (the pack's logic matches the apworld's, run from the Archipelago folder) need no file of the game.
  - The other Node.js tests run the plugin in a simulated RPG Maker engine against a real Archipelago server
    (`MultiServer.py --server_password test`), for example `node tests/test_plugin.js plugin 38281`. They read the
    game's own files: copy your `www/data` folder to `data/data` at the root of the repository (it is ignored by
    git, never commit it).
- `.github/workflows/tests.yml`: GitHub runs everything that needs no file of the game on every push and pull
  request, against Archipelago 0.6.7 and 0.6.8.

## License
[MIT](LICENSE). Fear & Hunger belongs to its creator. This project only contains code and lists of names and
numbers needed to randomize the game.

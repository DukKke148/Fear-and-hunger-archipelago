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

**Runs.** Floors stay random every run, as in the base game. Every new game is a new run: your inventory resets,
while checks and unlocks carry over.

**Exchanges.** Cooking, alchemy and trades with characters give their real result, except weapons and armors,
which must be unlocked.

### Checks (310)
| Type | Count |
|---|---|
| Entering a zone for the first time | 68 |
| Beating a creature for the first time (bestiary) | 28 |
| Beating each boss | 28 |
| Beating each enemy group (optional) | 141 |
| Picking up each key item | 15 |
| Endings A, B, C, D, S | 5 |
| Ending E, and ending S with each of the 4 starting characters | 5 |
| Learning each skill (scroll or Hexen table for a Lesser soul) | 20 |

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
  until you are free on the map, never during a dialogue, a cutscene or a battle.
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
| `enemy_shuffle` | `off` / `mobs_only` / `mobs_and_bosses` / `chaos` | off |
| `weapon_shuffle` | `off` / `swap_stats` / `swap_items` | off |
| `endings_hold_progression` | endings can hold progression items | false |
| `trap_percentage` | 0–100: share of filler replaced by traps | 15 |
| `trap_weights` | weight of each trap | see template |
| `death_link` | Death Link | false |

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

## Known limitations
- In-game messages are in French for now.
- Only tested on the Steam version 1.4.1 (Windows). Fear & Hunger 2: Termina is not supported.
- When an item is replaced, the game's own "you found…" message may still show the original name. The message at
  the top of the screen shows what you really got.
- With `enemy_shuffle`, map sprites stay the same; only the battle changes.

## For developers
- `apworld/fear_and_hunger/`: the world. Zip the `fear_and_hunger` folder to get the `.apworld`.
- `plugin/`: the RPG Maker MV plugin.

## License
[MIT](LICENSE). Fear & Hunger belongs to its creator. This project only contains code and lists of names and
numbers needed to randomize the game.

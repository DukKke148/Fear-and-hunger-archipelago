# Fear & Hunger — PopTracker pack (Archipelago v0.2.0)

A [PopTracker](https://github.com/black-sliver/PopTracker) pack for the Fear & Hunger Archipelago integration.

## What it shows
- **One tab per part of the dungeon** (Part 1, Part 2, Part 3, Ma'habre, End), each floor in its own column, one box per
  zone. A box is green when its checks are reachable with what you have, yellow when only some are, red when none
  are, grey when it is done. Click a box to see its checks.
- **Other tab**: skills, cooking, crafting, endings, S endings and the Marriage.
- **Left panel**:
  - key items, access items, Explosive vial, priced weapons, number of weapons and armors unlocked;
  - skills (dim: scroll unlocked, bright: learned);
  - endings (any character), S endings, companions recruited, dishes cooked, recipes crafted.
- **Bestiary tab**: every creature (first win) and every boss, lit up once beaten.

## Autotracking
Click **AP** in PopTracker's menu and connect with your server address and slot name (the same as in
`archipelago.json`). Everything that goes through Archipelago is tracked by itself: items you receive, checks you
make, your options.

**Keys** (with `randomize_keys: extra` or `off`): keys stay in the dungeon, so the server cannot see them. The game
plugin (v0.2.0) shares the keys you hold in your current run, and the pack picks them up while the game is running.
You can also click a key to mark it by hand. With `randomize_keys: full`, keys come from the multiworld and are
tracked like any other item.

## Logic
The rules are generated from the apworld's data, so the pack expects exactly what the generator expects: access
items, number of weapons and armors for each part (smart logic), keys, the Explosive vial for the Hidden backyard
and the Thickets, scrolls for skills, books and ingredients for recipes.

## Icons
The public pack uses plain badges: it contains none of the game's art. `tools/extract_icons.py` can build a personal
copy with the game's own icons from your copy of the game. Do not share that copy.

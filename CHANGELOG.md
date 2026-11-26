# Changelog

## v0.2.0
- New optional checks: recruiting each companion (8, on by default), creating a Marriage (never holds
  progression), cooking each dish (9) and crafting each recipe (19).
- Exchange rules, each with its own option: trades and merchants give their result only once unlocked (on by
  default), cooking always gives the real dish (by default), alchemy and crafting need the unlock (on by default).
  This fixes the floor 6 merchant selling an Explosive vial and the campfire giving grilled meat that was not
  unlocked.
- The logic now knows the collapsed hallways: the Hidden backyard and the Thickets (levels 2 to 5) need the
  Explosive vial unlocked.
- Hardcore mode: every difficulty option at its hardest value, except traps.
- Removed the Cloth cape from the unlocks: the normal game never gives it.
- Removed "Defeat Beheaded wizard": he can never die (immune to death), so the check was impossible.
- Bosses follow the wiki: the Uterus, the Lord of flies, the Harvestman, the Red man and the Yellow lizardmage are
  regular enemies, so they are bestiary checks now. No "Defeat" check for the Knight spectre, which can be put down
  without a fight (its fight stays a group check).
- Removed two enemy groups that only exist in some random layouts, so a run may never offer them: the third
  priest of the inner hall (Priest3) and the floor 6 ballista (Ballista1).
- Skills learned from the Book of the Forgotten Memories now count as checks, like scrolls and Hexen tables.
- Boss loot (an unlock given for a boss win) comes once per boss and per run. Trortur, who comes back unless
  his body is destroyed, and bosses with several fights no longer give it again.
- The plugin is now fully in English (messages, F7 panel, test commands); the parts are named Part 1, Part 2,
  Part 3, Ma'habre and End.
- PopTracker pack: checks per zone and floor with the generator's logic, and a progress panel (keys, access, skills,
  bosses, endings, S endings, companions, cooking, crafting). The game plugin shares the keys held in the current run
  with it through the server's data storage.
- Hardcore also asks for the game's Hard mode in every run (the game warns you otherwise). Hard has no Girl,
  Cahara, D'arce, Enki or Le'garde to recruit, so in hardcore those recruit checks, endings A and C and Asterisk are
  removed, and only B, D and S can be goal endings.
- New goal, `goal: genocide`: kill every creature (33 from the bestiary, 21 bosses) at least once, over all your
  runs. The count shows on each new kill and in the F7 panel.
- Fixed: `enemy_shuffle: chaos` could send an enemy group into a companion or end-game fight, which only happens on
  some routes or difficulties, making its check impossible. Those fights are no longer swapped, so `chaos` is the
  same as `mobs_and_bosses` for now.
- The Hunger trap now takes 30 hunger from one member of the party picked at random, and is the most common trap.
- Fixed: playing alone with `randomize_keys: full` (so hardcore too) failed to generate about one time in four.
  You now start with the 7 Small keys of level 1.
- Tests: generation tests inside the apworld (`test/`), a plugin test that needs no file of the game, and a GitHub
  Actions workflow running them on every push against Archipelago 0.6.7 and 0.6.8.
- Data version 16: the plugin and the apworld must both be updated.

## v0.1.0 — first public release
- 310 checks: zones, bestiary, bosses, enemy groups, key items, endings (A, B, C, D, E, S and S per character),
  skills (scrolls and Hexen tables).
- Unlock system: received items spawn in the dungeon instead of the inventory; basic items always available.
- Priced weapons (Claymore, Miasma, Bone shears, Blue Sin) only from their original event.
- Keys (`off` / `extra` / `full`), access items per part or per floor, smart logic with three difficulties.
- Traps, Death Link, enemy and weapon shuffles, goal on specific endings with automatic release / collect.
- Offline play with cached rules, F7 status panel, log file, test mode commands.

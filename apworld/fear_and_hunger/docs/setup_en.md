# Fear & Hunger Setup Guide

## Requirements

- Fear & Hunger **v1.4.1** (Steam), on Windows.
- Archipelago **0.6.7** or newer (only the person who generates the game needs it).

## Host (generating the game)

1. Double-click `fear_and_hunger.apworld` (or copy it into the `custom_worlds` folder of Archipelago) and restart
   the Launcher.
2. Put every player's YAML in `Players`, click **Generate**, then host the zip from `output`
   (Launcher **Host**, or upload it on archipelago.gg).

## Player (each Fear & Hunger player)

In `Steam\steamapps\common\Fear & Hunger\www`:

1. Back up `js\plugins.js`.
2. Copy `ArchipelagoFH_Data.js` and `ArchipelagoFH.js` into `js\plugins\`.
3. Copy `archipelago.json` into `www\` and fill it in (server address, slot name, password).
4. Open `js\plugins.js` in a text editor and add these two lines just before the final `];`
   (with a comma after the previous `}`):
   ```
   {"name":"ArchipelagoFH_Data","status":true,"description":"","parameters":{}},
   {"name":"ArchipelagoFH","status":true,"description":"","parameters":{}}
   ```
5. Start the game and begin a **new game**. The title screen shows the connection status; **F7** on the map shows
   a panel with checks and unlocks.

Everything the plugin does is written to `www\archipelago_log.txt`.

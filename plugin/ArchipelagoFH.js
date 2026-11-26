//=============================================================================
// ArchipelagoFH.js - Archipelago multiworld client for Fear & Hunger (v1.4.1)
//=============================================================================
/*:
 * @plugindesc v0.2.0 Connects Fear & Hunger to an Archipelago multiworld. Needs ArchipelagoFH_Data above it.
 * @author Julien
 *
 * @help
 * Settings are read from www/archipelago.json:
 *   { "server": "archipelago.gg:38281", "slot": "YourSlotName", "password": "" }
 *
 * Checks: first entry in each zone, first victory against each creature / boss / enemy group, picking up
 * each key item, endings (read from their final cutscene), learning skills (scroll or Hexen table), and
 * optionally recruiting companions, creating a Marriage, cooking and crafting each recipe for the first time.
 *
 * Unlocks: items received from the multiworld are never put in your inventory. Weapons, armors and skill
 * scrolls spawn once per run in a free spot (furniture, chest, floor item or boss loot) at your depth or
 * deeper; consumables and books join the loot rolls. Anything not unlocked is replaced by a basic item.
 * Priced weapons (Claymore, Miasma, Bone shears, Blue Sin) only come from their original event.
 * Exchanges follow the options: trades and merchants, cooking and alchemy can each require the unlock.
 *
 * Also: access items that gate the deeper parts, traps, Death Link, offline play (checks are sent on
 * reconnection) and a log in www/archipelago_log.txt.
 *
 * F7 on the map: shows / hides a status panel. The title screen shows the connection status.
 *
 * Test mode: "debug": true in archipelago.json enables commands typed in the Archipelago chat or written in
 * www/archipelago_commands.txt: give <item> [n], goto <floor|map> [x y], heal, trap <name>,
 * switch <n> on|off, var <n> <value>, where, js <code> (file only), help.
 */

(function () {
  'use strict';

  var DATA = window.APFH_DATA;
  if (!DATA) {
    console.error('[AP] ArchipelagoFH_Data.js is missing or placed below ArchipelagoFH.js in the plugin list.');
    try {
      require('fs').appendFileSync(require('path').join(require('path').dirname(process.mainModule.filename),
        'archipelago_log.txt'), new Date().toISOString() + ' ERROR ArchipelagoFH_Data.js missing or below ArchipelagoFH.js\n');
    } catch (e) { /* ignore */ }
    return;
  }
  var GAME = DATA.game;
  var NO_RUN_MAPS = { 0: true, 2: true, 10: true, 72: true, 73: true }; // boot, title, intro, character creation
  var toSet = function (arr) { var s = {}; arr.forEach(function (x) { s[x] = true; }); return s; };
  var LOOT_TABLES = toSet(DATA.lootTables);
  var PASS_ITEMS = toSet(DATA.passItems);
  var BASE_ITEMS = toSet(DATA.baseItems);
  // the endings that count for the goal (A, B, C, D, S); Ending E and "Ending S as <character>" are checks only
  var ENDING_LOCATIONS = Object.keys(DATA.endings).map(function (k) { return DATA.endings[k]; });
  var KIND = { i: 'item', w: 'weapon', a: 'armor' };
  var CODE_KIND = { 126: 'i', 127: 'w', 128: 'a' };
  function table(k) { return k === 'i' ? $dataItems : k === 'w' ? $dataWeapons : k === 'a' ? $dataArmors : []; }
  function apId(k, dbId) { return 7460000000 + (k === 'i' ? 1000 : k === 'w' ? 2000 : 3000) + dbId; }
  // 5 tiers: Part 1 (levels 1-3), Part 2 (4-6), Part 3 (7-8), Ma'habre, End (ancient city, 9-10)
  var TIERS = [1, 2, 3, 4, 5];
  function tierName(t) { return (DATA.tierNames && DATA.tierNames[t]) || ('Part ' + t); }
  function emptyTiers(v) { var o = {}; TIERS.forEach(function (t) { o[t] = v === 0 ? 0 : []; }); return o; }
  function rnd() { return Math.random(); }

  //---------------------------------------------------------------------------
  // Settings
  //---------------------------------------------------------------------------
  function readSettings() {
    var settings = { server: 'localhost:38281', slot: 'Player', password: '' };
    try {
      var fs = require('fs'), path = require('path');
      var base = path.dirname(process.mainModule.filename);
      var file = path.join(base, 'archipelago.json');
      if (fs.existsSync(file)) {
        var parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        Object.keys(parsed).forEach(function (k) { settings[k] = parsed[k]; });
      } else {
        fs.writeFileSync(file, JSON.stringify(settings, null, 2));
        Log.info('Created ' + file + ', fill in your slot name and server.');
      }
    } catch (e) {
      Log.error('Could not read archipelago.json', e);
    }
    return settings;
  }

  //---------------------------------------------------------------------------
  // Log file: www/archipelago_log.txt (the game has no console outside test mode)
  //---------------------------------------------------------------------------
  var Log = { file: null };
  try {
    var _fs = require('fs'), _path = require('path');
    Log.file = _path.join(_path.dirname(process.mainModule.filename), 'archipelago_log.txt');
    // keep the file small: past 512 KB, keep only the last 256 KB
    if (_fs.existsSync(Log.file) && _fs.statSync(Log.file).size > 512 * 1024) {
      var tail = _fs.readFileSync(Log.file, 'utf8');
      _fs.writeFileSync(Log.file, tail.slice(-256 * 1024));
    }
  } catch (e) { Log.file = null; }
  Log.write = function (level, msg) {
    if (!Log.file) return;
    try {
      var d = new Date(), pad = function (n) { return (n < 10 ? '0' : '') + n; };
      var stamp = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
                  pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
      var map = (typeof $gameMap !== 'undefined' && $gameMap && $gameMap.mapId) ? ' map' + $gameMap.mapId() : '';
      require('fs').appendFileSync(Log.file, stamp + ' ' + level + map + ' ' + msg + '\n');
    } catch (e) { /* never break the game for a log line */ }
  };
  Log.info = function (msg) { console.log('[AP] ' + msg); Log.write('INFO ', msg); };
  Log.warn = function (msg) { console.warn('[AP] ' + msg); Log.write('WARN ', msg); };
  Log.error = function (msg, err) {
    console.error('[AP] ' + msg, err || '');
    Log.write('ERROR', msg + (err ? ' | ' + (err.stack || err.message || err) : ''));
  };
  // any script error of the game, ours or not, ends up in the log too
  window.addEventListener('error', function (e) {
    Log.write('ERROR', 'JS: ' + e.message + ' (' + (e.filename || '').split(/[\\/]/).pop() + ':' + e.lineno + ')' +
              (e.error && e.error.stack ? ' | ' + e.error.stack : ''));
  });
  window.addEventListener('unhandledrejection', function (e) {
    Log.write('ERROR', 'Promise: ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason));
  });
  // RPG Maker catches errors of its main loop itself (error screen): log them before it does
  if (typeof SceneManager !== 'undefined') {
    var _catchException = SceneManager.catchException;
    SceneManager.catchException = function (e) {
      Log.write('ERROR', 'Game crash: ' + (e && (e.stack || e.message) || e));
      return _catchException.apply(this, arguments);
    };
    var _onError = SceneManager.onError;
    SceneManager.onError = function (e) {
      Log.write('ERROR', 'Game error: ' + (e && (e.message || e)) + ' (' + (e && e.filename || '') + ':' + (e && e.lineno) + ')');
      return _onError.apply(this, arguments);
    };
  }
  if (typeof Graphics !== 'undefined' && Graphics.printError) {
    var _printError = Graphics.printError;
    Graphics.printError = function (name, message) {
      Log.write('ERROR', 'Error screen: ' + name + ' ' + message);
      return _printError.apply(this, arguments);
    };
  }
  // WebGL context lost = black or frozen screen without any script error
  window.addEventListener('webglcontextlost', function () { Log.write('ERROR', 'WebGL context lost (graphics driver)'); }, true);
  Log.info('==== ArchipelagoFH v0.2.0 started ====');

  //---------------------------------------------------------------------------
  // Toast messages on the map
  //---------------------------------------------------------------------------
  var Toast = { queue: [], push: function (text) { this.queue.push(text); Log.info(text); } };

  function Sprite_APToast() { this.initialize.apply(this, arguments); }
  Sprite_APToast.prototype = Object.create(Sprite.prototype);
  Sprite_APToast.prototype.constructor = Sprite_APToast;
  Sprite_APToast.prototype.initialize = function () {
    Sprite.prototype.initialize.call(this);
    this.bitmap = new Bitmap(Graphics.boxWidth, 36);
    this.bitmap.fontSize = 20;
    this.y = 8;
    this.opacity = 0;
    this._timer = 0;
  };
  Sprite_APToast.prototype.update = function () {
    Sprite.prototype.update.call(this);
    if (this._timer > 0) {
      this._timer--;
      if (this._timer < 30) this.opacity = this._timer * 8;
    } else if (Toast.queue.length) {
      this.bitmap.clear();
      this.bitmap.fillRect(0, 0, this.bitmap.width, 36, 'rgba(0,0,0,0.6)');
      this.bitmap.drawText(Toast.queue.shift(), 12, 2, this.bitmap.width - 24, 32, 'left');
      this.opacity = 255;
      this._timer = 180;
    }
  };
  var _Scene_Map_createDisplayObjects = Scene_Map.prototype.createDisplayObjects;
  Scene_Map.prototype.createDisplayObjects = function () {
    _Scene_Map_createDisplayObjects.call(this);
    this._apToast = new Sprite_APToast();
    this.addChild(this._apToast);
    this._apPanel = new Sprite_APPanel();
    this.addChild(this._apPanel);
  };

  //---------------------------------------------------------------------------
  // Network client
  //---------------------------------------------------------------------------
  var AP = {
    settings: null, socket: null, connected: false, slot: null, team: 0, slotData: {},
    players: {}, checked: {}, items: [], pending: {}, dataPackage: {}, playerGames: {},
    retry: 0, goalSent: false, status: 'Not connected', seedName: null
  };
  window.ArchipelagoFH = AP;

  //---------------------------------------------------------------------------
  // Offline cache: www/archipelago_cache.json keeps the rules (slot data) and the received items of the
  // last connection, so playing offline still follows them (access, keys, unlocks).
  //---------------------------------------------------------------------------
  var Cache = { file: null, dirty: false };
  try { Cache.file = require('path').join(require('path').dirname(process.mainModule.filename), 'archipelago_cache.json'); }
  catch (e) { Cache.file = null; }
  Cache.load = function () {
    if (!Cache.file) return;
    try {
      var fs = require('fs');
      if (!fs.existsSync(Cache.file)) return;
      var c = JSON.parse(fs.readFileSync(Cache.file, 'utf8'));
      if (!c || c.slot !== AP.settings.slot || c.server !== AP.settings.server) return;
      AP.slotData = c.slotData || {};
      AP.items = c.items || [];
      AP.announced = AP.items.length;
      AP.seedName = c.seed;
      AP.slot = c.slotNumber;
      AP.totalLocations = c.totalLocations;
      (c.checked || []).forEach(function (id) { AP.checked[id] = true; });
      AP.offlineRules = true;
      Log.info('Offline cache loaded: seed ' + c.seed + ', ' + AP.items.length + ' items, saved ' + c.savedAt);
    } catch (e) { Log.error('could not read the offline cache', e); }
  };
  Cache.save = function () {
    if (!Cache.file || !AP.connected) return;
    try {
      require('fs').writeFileSync(Cache.file, JSON.stringify({
        slot: AP.settings.slot, server: AP.settings.server, seed: AP.seedName, slotNumber: AP.slot,
        totalLocations: AP.totalLocations, slotData: AP.slotData, items: AP.items,
        checked: Object.keys(AP.checked).map(Number), savedAt: new Date().toISOString()
      }));
    } catch (e) { Log.error('could not write the offline cache', e); }
  };
  // rules are known when connected, or from the cache of an earlier connection
  AP.hasRules = function () { return AP.connected || !!AP.offlineRules; };

  AP.start = function () {
    this.settings = readSettings();
    Cache.load();
    Log.info('Settings: server=' + this.settings.server + ' slot=' + this.settings.slot +
             (this.settings.debug ? ' | TEST MODE' + (this.settings.debug_give_received ? ' + give received' : '') : ''));
    this.connect(true);
  };

  AP.url = function (secure) {
    var server = String(this.settings.server || '').trim();
    if (/^wss?:\/\//.test(server)) return server;
    if (server.indexOf(':') < 0) server += ':38281';
    return (secure ? 'wss://' : 'ws://') + server;
  };

  AP.connect = function (secure) {
    var self = this, url = this.url(secure), opened = false, failed = false, ws;
    this.status = 'Connecting to ' + url;
    Log.info('Connecting to ' + url);
    try { ws = new WebSocket(url); } catch (e) { return this.scheduleRetry(); }
    this.socket = ws;
    ws.onopen = function () { opened = true; };
    ws.onmessage = function (event) {
      var packets;
      try { packets = JSON.parse(event.data); } catch (e) { return; }
      packets.forEach(function (p) {
        try { self.handle(p); } catch (e) { Log.error('error handling ' + p.cmd, e); }
      });
    };
    function fail() {
      // error and close can both fire (or only error): handle the failure once per socket
      if (failed || self.socket !== ws) return;
      failed = true;
      var wasConnected = self.connected;
      self.connected = false;
      try { ws.close(); } catch (e) { /* ignore */ }
      // a plain ws:// server refuses wss:// before opening: try again without TLS right away
      if (!opened && secure && !/^wss?:\/\//.test(self.settings.server)) return self.connect(false);
      if (wasConnected) Toast.push('Archipelago: connection lost, retrying...');
      self.scheduleRetry();
    }
    ws.onclose = fail;
    ws.onerror = fail;
  };

  AP.scheduleRetry = function () {
    var self = this, delay = Math.min(30, 2 + this.retry * 3);
    this.retry++;
    this.status = 'Disconnected, retrying in ' + delay + 's';
    setTimeout(function () { self.connect(true); }, delay * 1000);
  };

  AP.send = function (packets) {
    if (this.socket && this.socket.readyState === 1) this.socket.send(JSON.stringify(packets));
  };

  AP.uuid = function () {
    var id = null;
    try { id = localStorage.getItem('apfh_uuid'); } catch (e) { /* ignore */ }
    if (!id) {
      id = 'fh-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      try { localStorage.setItem('apfh_uuid', id); } catch (e) { /* ignore */ }
    }
    return id;
  };

  AP.handle = function (p) {
    switch (p.cmd) {
      case 'RoomInfo':
        this.seedName = p.seed_name;
        var games = (p.games || []).filter(function (g) { return g !== 'Archipelago'; });
        this.send([{ cmd: 'GetDataPackage', games: games }, {
          cmd: 'Connect', game: GAME, name: this.settings.slot, password: this.settings.password || '',
          uuid: this.uuid(), version: { major: 0, minor: 6, build: 0, 'class': 'Version' },
          items_handling: 7, tags: [], slot_data: true
        }]);
        break;
      case 'DataPackage':
        var all = p.data.games;
        for (var g in all) {
          var pkg = { items: {} };
          for (var n in all[g].item_name_to_id) pkg.items[all[g].item_name_to_id[n]] = n;
          this.dataPackage[g] = pkg;
        }
        break;
      case 'ConnectionRefused':
        this.status = 'Refuse : ' + (p.errors || []).join(', ');
        Toast.push('Archipelago: connection refused (' + (p.errors || []).join(', ') + ')');
        this.retry = 10;
        break;
      case 'Connected':
        this.onConnected(p);
        break;
      case 'ReceivedItems':
        if (p.index === 0) this.items = [];
        if (p.index > this.items.length) { this.send([{ cmd: 'Sync' }]); break; }
        this.items.length = p.index;
        Array.prototype.push.apply(this.items, p.items);
        Log.info('Received items: index ' + p.index + ', +' + p.items.length + ', total ' + this.items.length);
        // one message per new unlock, whatever its origin (a check, a friend, a /send command);
        // the full list sent again on every connection is not announced twice
        if (this.announced === undefined) this.announced = this.items.length; // first list after launch: already known
        for (var r = Math.max(p.index, this.announced); r < this.items.length; r++) {
          var got = this.items[r];
          var from = got.player === this.slot ? '' : ' (from ' + (got.player === 0 ? 'the server' : this.playerName(got.player)) + ')';
          var gotInfo = DATA.items[got.item];
          if (gotInfo && gotInfo[0] === 't') Log.info('Trap received: ' + gotInfo[3] + from);
          else Toast.push('Unlocked: ' + this.itemName(got.item, this.slot) + from);
          if (this.settings.debug_give_received) Debug.giveApItem(got.item);
        }
        this.announced = Math.max(this.announced, this.items.length);
        Cache.save();
        Run.update();
        break;
      case 'RoomUpdate':
        if (p.checked_locations) p.checked_locations.forEach(function (id) { AP.checked[id] = true; delete AP.pending[id]; });
        Cache.save();
        if (p.players) this.setPlayers(p.players);
        Game.checkGoal();
        break;
      case 'Bounced':
        if (p.tags && p.tags.indexOf('DeathLink') >= 0 && p.data) DeathLink.onReceive(p.data);
        break;
      case 'PrintJSON':
        this.onPrint(p);
        if (p.type === 'Chat' && p.slot === this.slot) Debug.onChat(p.message || '');
        break;
    }
  };

  AP.setPlayers = function (players) {
    var self = this;
    players.forEach(function (pl) { if (pl.team === self.team) self.players[pl.slot] = pl.alias || pl.name; });
  };

  AP.onConnected = function (p) {
    Keys.lastShared = null;  // share the held keys again on the new connection
    var self = this;
    this.connected = true;
    this.retry = 0;
    this.slot = p.slot;
    this.team = p.team;
    this.slotData = p.slot_data || {};
    this.setPlayers(p.players || []);
    for (var s in p.slot_info || {}) this.playerGames[s] = p.slot_info[s].game;
    this.checked = {};
    (p.checked_locations || []).forEach(function (id) { self.checked[id] = true; });
    this.totalLocations = (p.checked_locations || []).length + (p.missing_locations || []).length;
    if (this.slotData.data_version !== DATA.version) {
      Toast.push('Archipelago: apworld and plugin versions differ, update both!');
    }
    Log.info('Connected: slot ' + p.slot + ', seed ' + this.seedName + ', ' + this.totalLocations + ' locations, slot_data ' +
             JSON.stringify({ endings: this.slotData.endings_required, spawn: this.slotData.spawn_mode,
                              weapons: this.slotData.weapon_shuffle, troops: Object.keys(this.slotData.troop_map || {}).length }));
    this.offlineRules = false;
    Shuffle.apply();
    if (this.slotData.death_link) this.send([{ cmd: 'ConnectUpdate', tags: ['DeathLink'] }]);
    this.status = 'Connected as ' + this.settings.slot;
    Toast.push('Archipelago: connected as ' + this.settings.slot);
    Game.onConnected();
    Cache.save();
  };

  AP.itemName = function (id, slot) {
    var game = this.playerGames[slot] || GAME;
    if (game === GAME && DATA.items[id]) return DATA.items[id][3];
    var pkg = this.dataPackage[game];
    return (pkg && pkg.items[id]) || ('Objet ' + id);
  };
  AP.playerName = function (slot) { return this.players[slot] || ('Player ' + slot); };

  AP.onPrint = function (p) {
    // what we receive is announced from ReceivedItems; here only what we send to the others
    if (p.type !== 'ItemSend' || !p.item) return;
    var me = this.slot, item = p.item;
    if (item.player === me && p.receiving !== me) {
      Toast.push('Sent: ' + this.itemName(item.item, p.receiving) + ' to ' + this.playerName(p.receiving));
    }
  };

  AP.sendChecks = function (ids) {
    var self = this;
    ids.forEach(function (id) { self.pending[id] = true; });
    if (this.connected) this.send([{ cmd: 'LocationChecks', locations: ids }]);
  };

  AP.sendGoal = function () {
    if (this.goalSent || !this.connected) return;
    this.goalSent = true;
    this.send([{ cmd: 'StatusUpdate', status: 30 }]);
    Toast.push('Archipelago: goal complete!');
    if (this.slotData.auto_release_collect !== false) {
      // ask the server to send our remaining items to their owners and give us everything left for us
      var self = this;
      setTimeout(function () {
        self.send([{ cmd: 'Say', text: '!release' }, { cmd: 'Say', text: '!collect' }]);
        Log.info('Goal: asked the server for !release and !collect');
      }, 1500);
    }
  };

  //---------------------------------------------------------------------------
  // Save state and checks
  //---------------------------------------------------------------------------
  var Game = {};

  Game.state = function () {
    if (!$gameSystem) return null;
    if (!$gameSystem._ap) $gameSystem._ap = { seed: null, checked: [], run: null };
    return $gameSystem._ap;
  };

  Game.isChecked = function (id) {
    var st = Game.state();
    return !!(AP.checked[id] || AP.pending[id] || (st && st.checked.indexOf(id) >= 0));
  };

  Game.check = function (id) {
    var st = Game.state();
    if (!id || !st || Game.isChecked(id)) return;
    st.checked.push(id);
    Log.info('Check: ' + (DATA.names[id] || id));
    AP.sendChecks([id]);
    if (!AP.connected) Toast.push('Check saved, sent on reconnection: ' + (DATA.names[id] || id));
    Game.checkGoal();
  };

  Game.onConnected = function () {
    var st = Game.state();
    if (st && st.seed && st.seed !== AP.seedName) {
      // this save belongs to another multiworld: start over for this one
      $gameSystem._ap = null;
      st = Game.state();
    }
    if (st) {
      st.seed = AP.seedName;
      var missing = st.checked.filter(function (id) { return !AP.checked[id]; });
      if (missing.length) AP.sendChecks(missing);
    }
    Run.update();
    Game.checkGoal();
  };

  // difficulty: the seed only has the checks of the difficulty picked in the yaml (slot data "difficulty")
  var Difficulty = { NAMES: ['Fear & Hunger', 'Terror & Starvation', 'Hard mode'] };
  // 0 Fear & Hunger, 1 Terror & Starvation, 2 Hard, -1 [Dungeon Nights] (Hard without STARVATION_MODE)
  Difficulty.current = function () {
    if (typeof $gameSwitches === 'undefined' || !$gameSwitches || !$gameSwitches.value) return null;
    var hard = $gameSwitches.value(2190), starvation = $gameSwitches.value(3153);
    if (hard) return starvation ? 2 : -1;
    return starvation ? 1 : 0;
  };
  Difficulty.check = function () {
    var want = AP.slotData.difficulty;
    if (want === undefined || want === null) return true; // older seed
    var cur = Difficulty.current();
    if (cur === null || cur === want) return true;
    var msg = 'This seed is for ' + Difficulty.NAMES[want] + ', not ' + (cur < 0 ? '[Dungeon Nights]' : Difficulty.NAMES[cur]) +
              ': some checks will be missing or impossible. Start a new game in ' + Difficulty.NAMES[want] + '.';
    Toast.push(msg);
    Log.warn(msg);
    return false;
  };

  // genocide goal: every creature of the bestiary and every boss killed in the same run (kept in the run, so a
  // new game starts over and loading a save goes back to what that save had killed)
  var Genocide = {};
  Genocide.active = function () { return AP.slotData.goal === 1 && (AP.slotData.genocide_targets || []).length > 0; };
  Genocide.targets = function () { return AP.slotData.genocide_targets || []; };
  Genocide.killed = function () {
    var run = Run.get();
    if (!run) return {};
    if (!run.killed) run.killed = {};
    return run.killed;
  };
  Genocide.count = function () {
    var k = Genocide.killed();
    return Genocide.targets().filter(function (id) { return k[id]; }).length;
  };
  Genocide.record = function (ids) {
    if (!Genocide.active() || !Run.get()) return;
    var k = Genocide.killed(), targets = Genocide.targets(), fresh = [];
    ids.forEach(function (id) {
      if (targets.indexOf(id) >= 0 && !k[id]) { k[id] = true; fresh.push(id); }
    });
    if (!fresh.length) return;
    var names = fresh.map(function (id) { return (DATA.names[id] || String(id)).replace(/^(Bestiary: |Defeat )/, ''); });
    Toast.push('Genocide: ' + Genocide.count() + '/' + targets.length + ' (' + names.join(', ') + ')');
    Log.info('Genocide: ' + names.join(', ') + ' -> ' + Genocide.count() + '/' + targets.length);
    Game.checkGoal();
  };
  Genocide.left = function () {
    var k = Genocide.killed();
    return Genocide.targets().filter(function (id) { return !k[id]; })
      .map(function (id) { return (DATA.names[id] || String(id)).replace(/^(Bestiary: |Defeat )/, ''); });
  };

  // goal: every creature in one run (genocide), or the listed endings (e.g. A and S) when required_endings is set,
  // otherwise any N endings
  Game.checkGoal = function () {
    if (!AP.connected) return;
    if (AP.slotData.goal === 1) {
      if (Genocide.active() && Genocide.count() >= Genocide.targets().length) AP.sendGoal();
      return;
    }
    var required = AP.slotData.required_endings || [];
    if (required.length) {
      var all = required.every(function (e) {
        var sw = Object.keys(DATA.endings).find(function (k) { return DATA.names[DATA.endings[k]] === 'Ending ' + e; });
        return sw && Game.isChecked(DATA.endings[sw]);
      });
      if (all) AP.sendGoal();
      return;
    }
    var need = AP.slotData.endings_required || 1;
    var done = ENDING_LOCATIONS.filter(function (id) { return Game.isChecked(id); }).length;
    if (done >= need) AP.sendGoal();
  };

  Game.inRun = function () {
    return $gameMap && $gameParty && !NO_RUN_MAPS[$gameMap.mapId()];
  };

  Game.currentTier = function () {
    var tm = $gameMap && DATA.mapTier[$gameMap.mapId()];
    var st = Game.state();
    if (tm) return tm;
    return (st && st.run && st.run.tier) || 1;
  };

  //---------------------------------------------------------------------------
  // Unlocks
  //---------------------------------------------------------------------------
  var Unlocks = {};

  // how many copies of each unlock were received
  Unlocks.counts = function () {
    var c = {};
    AP.items.forEach(function (it) { var x = DATA.items[it.item]; if (x && x[0] !== 't') c[it.item] = (c[it.item] || 0) + 1; });
    (AP.slotData.extra_base || []).forEach(function (id) { c[id] = Math.max(c[id] || 0, 1); });
    return c;
  };

  // vanilla item allowed as is?
  Unlocks.allowed = function (k, dbId) {
    if (k === 'i' && (PASS_ITEMS[dbId] || BASE_ITEMS[dbId])) return true;
    var id = apId(k, dbId);
    if (!DATA.items[id]) return true; // not managed by the randomizer: quest weapons (Eastern sword), cursed
                                      // weapons, disguises, souls, limbs... always given as in the normal game
    return !!Unlocks.counts()[id];
  };

  // a random basic or unlocked supply, to replace something not unlocked yet
  Unlocks.randomSupply = function () {
    var pool = [], counts = Unlocks.counts();
    DATA.baseItems.forEach(function (dbId) { pool.push(['i', dbId, 1]); });
    for (var id in counts) {
      var info = DATA.items[id];
      if (info && (info[4] === 'c' || info[4] === 'b')) pool.push([info[0], info[1], 2 * counts[id]]);
    }
    var total = pool.reduce(function (s, p) { return s + p[2]; }, 0), r = rnd() * total;
    for (var i = 0; i < pool.length; i++) { r -= pool[i][2]; if (r <= 0) return pool[i]; }
    return pool[0];
  };

  // tier where an unlocked gear piece spawns, following the spawn_mode option
  Unlocks.tierFor = function (id) {
    var info = DATA.items[id], mode = AP.slotData.spawn_mode;
    if (mode === undefined) mode = 0;
    if (mode === 0 && info[6]) return info[6];                 // vanilla_tables
    if (mode === 2 || info[5] === null) return 1 + Math.floor(rnd() * TIERS.length); // anywhere
    // by_depth: weights centered on the item's power
    var center = 1 + (TIERS.length - 1) * info[5], weights = [], total = 0;
    for (var t = 1; t <= TIERS.length; t++) { var w = Math.exp(-Math.pow(t - center, 2) / 1.2); weights.push(w); total += w; }
    var r = rnd() * total;
    for (var i = 0; i < TIERS.length; i++) { r -= weights[i]; if (r <= 0) return i + 1; }
    return TIERS.length;
  };

  //---------------------------------------------------------------------------
  // Runs: every new game is a fresh run where unlocked gear is spread again
  //---------------------------------------------------------------------------
  var Run = {};

  Run.get = function () {
    var st = Game.state();
    return st && st.run;
  };

  // start the run, or take in unlocks received since the last update
  Run.update = function () {
    var st = Game.state();
    if (!st || !AP.hasRules() || !Game.inRun()) return;
    if (st.seed && st.seed !== AP.seedName) return;
    st.seed = AP.seedName;
    var run = st.run, cur = Game.currentTier();
    if (!run) {
      run = st.run = { processed: 0, pending: emptyTiers([]), searched: {}, n: emptyTiers(0),
                       spotMode: {}, tier: cur, startSwap: false };
      Shuffle.swapStartingGear();
      Log.info('New run started at tier ' + cur);
    }
    if (!run.difficultyChecked) {
      run.difficultyChecked = true;
      try { Difficulty.check(); } catch (e) { Log.error('Difficulty check failed', e); }
    }
    // saves made with an older plugin: make sure every tier exists
    TIERS.forEach(function (t) { if (!run.pending[t]) run.pending[t] = []; if (!run.n[t]) run.n[t] = 0; });
    var started = run.processed === 0;
    while (run.processed < AP.items.length) {
      var it = AP.items[run.processed++], info = DATA.items[it.item];
      if (info && info[4] === 'k') {
        var idx = run.processed - 1;
        if (Keys.mode() === 2) {
          Keys.give(info); // full: given again at the start of every run
        } else if (Keys.mode() === 1 && idx >= Keys.delivered()) {
          Keys.give(info); // extra: once, when it arrives
          Keys.setDelivered(idx + 1);
        }
        continue;
      }
      // gear, and skill scrolls when skill checks are on, spawn once per run; supplies only change the rolls
      var spawns = info && (info[4] === 'g' || (info[8] && AP.slotData.skill_checks));
      if (!spawns) continue;
      if (info[9]) { // priced weapon (Claymore, Miasma, Bone shears, Blue Sin): only from its original event, for its price
        if (started) Log.info('Unlock ' + info[3] + ': only at its original spot, for its price');
        continue;
      }
      var tier = Unlocks.tierFor(it.item);
      if (!started) tier = Math.max(tier, cur); // received mid-run: never behind you
      run.pending[tier].push(it.item);
      Log.info('Unlock ' + info[3] + ' waits in ' + tierName(tier) + (started ? ' (start of run)' : ' (mid-run)'));
    }
    if (!$gameMap || Access.mapAllowed($gameMap.mapId())) Run.enterTier(cur);
    if (started && run.processed) Log.info('Run gear by tier: ' + TIERS.map(function (t) { return run.pending[t].length; }).join('/'));
  };

  // gear left behind in shallower tiers moves down with you
  Run.enterTier = function (tier) {
    var run = Run.get();
    if (!run) return;
    run.tier = tier;
    for (var t = 1; t < tier; t++) {
      while (run.pending[t].length) run.pending[tier].push(run.pending[t].shift());
    }
  };

  Run.waiting = function () {
    var run = Run.get();
    if (!run) return 0;
    return TIERS.reduce(function (sum, t) { return sum + (run.pending[t] || []).length; }, 0);
  };

  // decide once per run what a spot gives: a pending unlock ('spawn') or a filtered vanilla roll ('roll')
  Run.resolveSpot = function (spot) {
    var run = Run.get();
    if (!run) return 'roll';
    var idx = spot[0];
    if (run.spotMode[idx]) return run.spotMode[idx];
    var tier = Math.max(spot[1], run.tier);
    run.searched[idx] = true;
    run.n[tier]++;
    var pending = run.pending[tier], expected = DATA.expectedSpots[tier] || 100;
    var remaining = Math.max(1, expected - run.n[tier] + 1);
    var mode = 'roll';
    if (pending.length && rnd() < Math.min(1, 1.5 * pending.length / remaining)) {
      Run.spawn(pending.splice(Math.floor(rnd() * pending.length), 1)[0], 'Found');
      mode = 'spawn';
    }
    run.spotMode[idx] = mode;
    return mode;
  };

  // boss loot: once per boss and per run, even if the boss comes back (Trortur) or has several fights
  Run.firstBossWin = function (info) {
    var run = Run.get();
    if (!run) return false;
    if (!run.bossLoot) run.bossLoot = {};
    var bosses = info[1].filter(function (id) { return Math.floor(id / 100000) === 74603; });
    var key = bosses.length ? bosses.join(',') : 't' + $gameTroop._troopId;
    if (run.bossLoot[key]) {
      Log.info('Boss loot already given this run for ' + key);
      return false;
    }
    run.bossLoot[key] = true;
    return true;
  };

  Run.spawn = function (id, verb) {
    var info = DATA.items[id], obj = table(info[0])[info[1]];
    if (!obj) return;
    $gameParty.gainItem(obj, 1);
    Toast.push(verb + ' : ' + obj.name + ' (unlock)');
  };

  //---------------------------------------------------------------------------
  // Keys from the multiworld (randomize_keys)
  //---------------------------------------------------------------------------
  var Keys = {};
  // 0 off, 1 extra (bonus keys, given once when they arrive), 2 full (only from the multiworld,
  // given back every run); true from older apworlds = full
  Keys.mode = function () {
    var m = AP.slotData.randomize_keys;
    return m === true ? 2 : (m | 0);
  };
  // extra mode: how many received items have already had their key delivered (kept across runs)
  Keys.storeKey = function () { return 'apfh_keys_' + AP.seedName + '_' + AP.settings.slot; };
  Keys.delivered = function () {
    try { return parseInt(localStorage.getItem(Keys.storeKey()), 10) || 0; } catch (e) { return 0; }
  };
  Keys.setDelivered = function (n) {
    try { localStorage.setItem(Keys.storeKey(), String(n)); } catch (e) { /* ignore */ }
  };
  Keys.give = function (info) {
    var obj = $dataItems[info[1]];
    if (!obj || !$gameParty) return;
    $gameParty.gainItem(obj, 1);
    Log.info('Key given: ' + obj.name);
  };
  Keys.count = function (dbId) {
    var id = apId('i', dbId);
    return AP.items.filter(function (it) { return it.item === id; }).length;
  };
  // keys held in the current run, shared with trackers (the PopTracker pack) through the server's data storage
  Keys.storageKey = function () { return 'fh_keys_' + AP.team + '_' + AP.slot; };
  Keys.lastShared = null;
  Keys.share = function () {
    if (!AP.connected || AP.slot == null || !$gameParty || !Game.inRun()) return;
    var held = {};
    Object.keys(DATA.keys || {}).forEach(function (id) {
      var n = $dataItems[id] ? $gameParty.numItems($dataItems[id]) : 0;
      if (n > 0) held[id] = n;
    });
    var text = JSON.stringify(held);
    if (text === Keys.lastShared) return;
    Keys.lastShared = text;
    AP.send([{ cmd: 'Set', key: Keys.storageKey(), default: {}, want_reply: false,
               operations: [{ operation: 'replace', value: held }] }]);
  };
  var _Scene_Map_updateKeys = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function () {
    _Scene_Map_updateKeys.call(this);
    this._apKeysTimer = (this._apKeysTimer || 0) + 1;
    if (this._apKeysTimer % 60 === 0) {
      try { Keys.share(); } catch (e) { Log.error('key sharing failed', e); }
    }
  };

  //---------------------------------------------------------------------------
  // Floor access (floor_access): a part of the dungeon needs its access item. Transfers are never
  // blocked (that could freeze a cutscene): if you are somewhere locked, the first time you try to
  // move with no event running, you are sent back to where you came from.
  //---------------------------------------------------------------------------
  var Access = { bouncing: false };
  // 0 off, 1 per part (5 parts), 2 per floor (12 floors); true from older apworlds = per part
  Access.mode = function () {
    var m = AP.slotData.floor_access;
    return m === true ? 1 : (m | 0);
  };
  Access.has = function (id) {
    return AP.items.some(function (it) { return it.item === id; });
  };
  Access.allowed = function (tier) {   // per part
    if (!tier || tier <= 1 || Access.mode() !== 1) return true;
    return Access.has(7460000000 + 5000 + tier);
  };
  Access.floorAllowed = function (floor) {   // per floor
    if (!floor || floor <= 1 || Access.mode() !== 2) return true;
    var id = DATA.floorItems && DATA.floorItems[floor];
    return !id || Access.has(id);
  };
  // what you are missing on this map, for messages
  Access.lockName = function (mapId) {
    return Access.mode() === 2 ? (DATA.floorNames[DATA.mapFloor[mapId]] || '?') : tierName(DATA.mapTier[mapId]);
  };
  // ending sequences and cutscene maps are never locked (an ending must not be interrupted)
  Access.mapAllowed = function (mapId) {
    if (DATA.noLockMaps && DATA.noLockMaps.indexOf(mapId) >= 0) return true;
    if (Access.mode() === 2) return Access.floorAllowed(DATA.mapFloor[mapId] || 1);
    return Access.allowed(DATA.mapTier[mapId] || 1);
  };
  Access.state = function () {
    var st = Game.state();
    if (st && !st.safe) st.safe = { cur: null, prev: null };
    return st && st.safe;
  };
  Access.onMapStart = function (mapId) {
    Access.bouncing = false;
    var safe = Access.state();
    if (!safe || !$gamePlayer) return;
    if (Access.mapAllowed(mapId)) {
      var here = { map: mapId, x: $gamePlayer.x, y: $gamePlayer.y, d: $gamePlayer.direction() };
      safe.cur = here;
      safe.prev = here;
    }
  };
  // remember the last two tiles where you stood on an allowed map
  Access.track = function () {
    var safe = Access.state(), mapId = $gameMap.mapId();
    if (!safe || $gamePlayer.isMoving() || !Access.mapAllowed(mapId)) return;
    var c = safe.cur;
    if (!c || c.map !== mapId || c.x !== $gamePlayer.x || c.y !== $gamePlayer.y) {
      safe.prev = c && c.map === mapId ? c : { map: mapId, x: $gamePlayer.x, y: $gamePlayer.y, d: $gamePlayer.direction() };
      safe.cur = { map: mapId, x: $gamePlayer.x, y: $gamePlayer.y, d: $gamePlayer.direction() };
    }
  };
  Access.check = function () {
    if (!Access.mode() || Access.bouncing || !$gameMap || !$gamePlayer) return;
    var tier = DATA.mapTier[$gameMap.mapId()];
    if (!tier || Access.mapAllowed($gameMap.mapId())) { Access.track(); return; }
    if ($gameMap.isEventRunning() || $gamePlayer.isTransferring() || $gameMessage.isBusy()) return;
    var wantsToMove = Input.dir4 !== 0 || (typeof TouchInput !== 'undefined' && TouchInput.isTriggered());
    if (!wantsToMove) return;
    var safe = Access.state(), to = safe && (safe.prev || safe.cur);
    Toast.push('Locked: ' + Access.lockName($gameMap.mapId()) + ' (you need its Access item). Sent back.');
    if (!to) { Log.info('Locked tier ' + tier + ' but no safe position known'); return; }
    Access.bouncing = true;
    Log.info('Bounced out of ' + Access.lockName($gameMap.mapId()) + ' to map ' + to.map + ' (' + to.x + ',' + to.y + ')');
    $gamePlayer.reserveTransfer(to.map, to.x, to.y, to.d, 0);
  };
  var _Scene_Map_updateAccess = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function () {
    _Scene_Map_updateAccess.call(this);
    try { Access.check(); } catch (e) { Log.error('access check failed', e); }
  };

  //---------------------------------------------------------------------------
  // Traps sent by the multiworld: each one is applied once, when you are free on the map (no event, no
  // dialogue, not in battle), one every few seconds. Their index is kept like the extra keys.
  var Traps = { queue: [], cooldown: 0 };
  var PHOBIAS = [65, 66, 68, 69, 70]; // zoophobia, necrophobia, phasmophobia, rhabdophobia, teratophobia
  var TRAP_STATE = { 1: [5], 2: [17], 3: [55, 56], 4: [61], 6: PHOBIAS }; // no fracture: nothing cures it
  var TRAP_NAMES = { 1: 'Bleeding', 2: 'Poison', 3: 'Infection', 4: 'Parasites',
                     6: 'Phobia', 7: 'Hunger', 8: 'Fear', 9: 'Torch out' };
  Traps.storeKey = function () { return 'apfh_traps_' + AP.seedName + '_' + AP.settings.slot; };
  Traps.done = function () {
    try { return parseInt(localStorage.getItem(Traps.storeKey()), 10) || 0; } catch (e) { return 0; }
  };
  Traps.setDone = function (n) {
    try { localStorage.setItem(Traps.storeKey(), String(n)); } catch (e) { /* ignore */ }
  };
  Traps.next = function () {
    for (var i = Traps.done(); i < AP.items.length; i++) {
      var info = DATA.items[AP.items[i].item];
      if (info && info[0] === 't') return i;
    }
    if (AP.items.length > Traps.done()) Traps.setDone(AP.items.length);
    return -1;
  };
  Traps.canApply = function () {
    if (!Run.get() || !$gameMap || !$gamePlayer || !$gameParty || !$gameParty.leader()) return false;
    if (!(SceneManager._scene instanceof Scene_Map) || $gameParty.inBattle()) return false;
    return !$gameMap.isEventRunning() && !$gamePlayer.isTransferring() && !$gameMessage.isBusy();
  };
  Traps.apply = function (code) {
    var actor = $gameParty.leader(), detail = '';
    if (TRAP_STATE[code]) {
      var states = TRAP_STATE[code].filter(function (s) { return !actor.isStateAffected(s); });
      if (!states.length) states = TRAP_STATE[code];
      var st = states[Math.floor(rnd() * states.length)];
      actor.addState(st);
      if (code === 6) detail = ' (' + $dataStates[st].name + ')';
    } else if (code === 7) {
      // one member of the party, picked at random, loses 30 hunger (hunger is the EXP: lower = hungrier)
      var alive = $gameParty.members().filter(function (m) { return m && m.isAlive(); });
      var who = alive.length ? alive[Math.floor(rnd() * alive.length)] : actor;
      who.changeExp(Math.max(0, who.currentExp() - 30), false);
      detail = ' (' + who.name() + ')';
    } else if (code === 8) {
      actor.setMp(Math.max(0, actor.mp - 15)); // mind is the MP
    } else if (code === 9) {
      if ($gameSwitches.value(3151)) {
        $gameVariables.setValue(398, 0); // the torch timer runs out: the game puts it out with its own message
      } else if ($gameParty.numItems($dataItems[5]) > 0) {
        $gameParty.loseItem($dataItems[5], 1);
        detail = ' (lost a Torch)';
      } else {
        detail = ' (no torch to put out)';
      }
    }
    return detail;
  };
  Traps.update = function () {
    if (Traps.cooldown > 0) { Traps.cooldown--; return; }
    if (!AP.seedName || !Traps.canApply()) return;
    var i = Traps.next();
    if (i < 0) return;
    var it = AP.items[i], info = DATA.items[it.item];
    var from = it.player === AP.slot ? 'yourself' : (it.player === 0 ? 'the server' : AP.playerName(it.player));
    var detail = '';
    try { detail = Traps.apply(info[1]); } catch (e) { Log.error('trap ' + info[3] + ' failed', e); }
    Traps.setDone(i + 1);
    Toast.push('Trap from ' + from + ': ' + (TRAP_NAMES[info[1]] || info[3]) + detail + ' !');
    Traps.cooldown = 180; // about 3 seconds before the next one
  };

  //---------------------------------------------------------------------------
  // DeathLink (death_link option): our game over kills the others, theirs gives us a game over
  var DeathLink = { pending: null, dying: false, lastSent: 0 };
  DeathLink.on = function () { return !!(AP.slotData && AP.slotData.death_link); };
  DeathLink.send = function () {
    if (!DeathLink.on() || !AP.connected || DeathLink.dying) return;
    var now = Date.now() / 1000;
    if (now - DeathLink.lastSent < 10) return;
    DeathLink.lastSent = now;
    AP.send([{ cmd: 'Bounce', tags: ['DeathLink'],
               data: { time: now, source: AP.settings.slot, cause: AP.settings.slot + ' died in Fear & Hunger.' } }]);
    Log.info('DeathLink sent');
  };
  DeathLink.onReceive = function (data) {
    if (!DeathLink.on() || data.source === AP.settings.slot) return;
    if (Math.abs((data.time || 0) - DeathLink.lastSent) < 1) return;
    DeathLink.pending = data;
    Log.info('DeathLink received from ' + data.source);
  };
  DeathLink.update = function () {
    if (!DeathLink.pending || !Run.get() || !$gameParty) return;
    var scene = SceneManager._scene;
    var inBattle = typeof Scene_Battle !== 'undefined' && scene instanceof Scene_Battle;
    if (!(scene instanceof Scene_Map) && !inBattle) return;
    if (scene instanceof Scene_Map && ($gamePlayer.isTransferring() || $gameMessage.isBusy())) return;
    var d = DeathLink.pending;
    DeathLink.pending = null;
    DeathLink.dying = true;
    Toast.push('DeathLink: ' + (d.cause || (d.source + ' died.')));
    if (typeof Scene_Gameover !== 'undefined') SceneManager.goto(Scene_Gameover);
  };
  if (typeof Scene_Gameover !== 'undefined') {
    var _Scene_Gameover_start = Scene_Gameover.prototype.start;
    Scene_Gameover.prototype.start = function () {
      _Scene_Gameover_start.call(this);
      try { DeathLink.send(); } catch (e) { Log.error('deathlink send failed', e); }
      DeathLink.dying = false;
    };
  }
  var _Scene_Map_updateTraps = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function () {
    _Scene_Map_updateTraps.call(this);
    try { Traps.update(); DeathLink.update(); } catch (e) { Log.error('traps update failed', e); }
    try { Debug.poll(); } catch (e) { Log.error('test commands failed', e); }
  };
  if (typeof Scene_Battle !== 'undefined') {
    var _Scene_Battle_updateDL = Scene_Battle.prototype.update;
    Scene_Battle.prototype.update = function () {
      _Scene_Battle_updateDL.call(this);
      try { DeathLink.update(); } catch (e) { Log.error('deathlink update failed', e); }
    };
  }

  //---------------------------------------------------------------------------
  // Test mode ("debug": true in archipelago.json): chat commands from your own slot (Text Client)
  //   give <exact item name> [quantity]  -> straight into the inventory
  // "debug_give_received": true also puts every received unlock straight into the inventory.
  //---------------------------------------------------------------------------
  var Debug = {};

  Debug.find = function (name) {
    var want = String(name).trim().toLowerCase(), tables = [['i', $dataItems], ['w', $dataWeapons], ['a', $dataArmors]];
    for (var t = 0; t < tables.length; t++) {
      var list = tables[t][1] || [];
      for (var i = 1; i < list.length; i++) {
        if (list[i] && list[i].name && list[i].name.toLowerCase() === want) return list[i];
      }
    }
    return null;
  };

  Debug.giveObj = function (obj, qty) {
    if (!$gameParty || !Game.inRun()) {
      Toast.push('Test: start a game and reach the first floor before giving items');
      return false;
    }
    $gameParty.gainItem(obj, qty || 1);
    Toast.push('Test : ' + obj.name + (qty > 1 ? ' x' + qty : '') + ' ajoute a l\'inventaire');
    return true;
  };

  Debug.giveApItem = function (id) {
    var info = DATA.items[id];
    if (!info || info[0] === 't' || info[0] === 'x') return; // traps and access items are never inventory items
    var obj = table(info[0])[info[1]];
    if (obj) Debug.giveObj(obj, 1);
  };

  Debug.onChat = function (message) {
    if (!AP.settings.debug) return;
    Debug.run(message.replace(/^[^:]*:\s*/, ''), true);
  };

  // Test commands: typed in the Archipelago chat, or written in www/archipelago_commands.txt (one per line;
  // the file is read on the map about once a second, then emptied). Only with "debug": true.
  Debug.say = function (text) { Toast.push('Test : ' + text); Log.info('[test] ' + text); };
  Debug.target = function (arg) {
    var a = String(arg).trim(), low = a.toLowerCase().replace(/[^a-z0-9']/g, ''), m;
    if (/^\d+$/.test(a) && DATA.mapNames[a]) return Number(a);
    for (var f in DATA.floorNames) {
      if (DATA.floorNames[f].toLowerCase().replace(/[^a-z0-9']/g, '') === low && DATA.floorEntry[f]) return DATA.floorEntry[f];
    }
    if ((m = /^(?:level|etage|floor)?(\d+)$/.exec(low))) {
      for (var f2 in DATA.floorNames) {
        if (DATA.floorNames[f2] === 'Level ' + m[1] && DATA.floorEntry[f2]) return DATA.floorEntry[f2];
      }
    }
    for (var id in DATA.mapNames) {
      if (DATA.mapNames[id].toLowerCase().replace(/[^a-z0-9']/g, '') === low) return Number(id);
    }
    return 0;
  };
  Debug.run = function (line, fromChat) {
    var t = String(line).trim(), m;
    if (!t || t.charAt(0) === '#') return;
    var inMap = typeof Scene_Map !== 'undefined' && SceneManager._scene instanceof Scene_Map && $gamePlayer;
    if ((m = /^give\s+(.+?)(?:\s+(\d+))?$/i.exec(t))) {
      var obj = Debug.find(m[1]);
      if (!obj) return Debug.say('item not found: ' + m[1]);
      Debug.giveObj(obj, m[2] ? Math.min(99, parseInt(m[2], 10)) : 1);
    } else if ((m = /^goto\s+(.+?)(?:\s+(\d+)\s+(\d+))?$/i.exec(t))) {
      if (!inMap) return Debug.say('goto: you must be on the map');
      var map = Debug.target(m[1]);
      if (!map) return Debug.say('unknown map or floor: ' + m[1]);
      var pos = m[2] ? [Number(m[2]), Number(m[3])] : (DATA.mapEntry[map] || [1, 1]);
      $gamePlayer.reserveTransfer(map, pos[0], pos[1], 2, 0);
      Debug.say('teleporting to ' + DATA.mapNames[map] + ' (' + map + ') at ' + pos.join(','));
    } else if (/^heal$/i.test(t)) {
      if (!$gameParty) return;
      $gameParty.members().forEach(function (a) { a.recoverAll(); });
      Debug.say('party healed (HP, mind and states)');
    } else if ((m = /^switch\s+(\d+)\s+(on|off)$/i.exec(t))) {
      $gameSwitches.setValue(Number(m[1]), m[2].toLowerCase() === 'on');
      Debug.say('interrupteur ' + m[1] + ' = ' + m[2]);
    } else if ((m = /^var\s+(\d+)\s+(-?\d+)$/i.exec(t))) {
      $gameVariables.setValue(Number(m[1]), Number(m[2]));
      Debug.say('variable ' + m[1] + ' = ' + m[2]);
    } else if ((m = /^trap\s+(.+)$/i.exec(t))) {
      var want = 'trap: ' + m[1].toLowerCase(), tid = Object.keys(DATA.items).find(function (k) {
        return DATA.items[k][0] === 't' && DATA.items[k][3].toLowerCase() === want;
      });
      if (!tid || !inMap) return Debug.say(tid ? 'trap: you must be on the map' : 'unknown trap: ' + m[1]);
      Debug.say('trap ' + DATA.items[tid][3] + Traps.apply(DATA.items[tid][1]));
    } else if (/^where$/i.test(t)) {
      if (!inMap) return Debug.say('not on the map');
      var id = $gameMap.mapId();
      Debug.say('map ' + id + ' ' + (DATA.mapNames[id] || '') + ' at ' + $gamePlayer.x + ',' + $gamePlayer.y +
                ' (part ' + (DATA.tierNames[DATA.mapTier[id]] || '?') + ')');
    } else if ((m = /^js\s+([\s\S]+)$/i.exec(t))) {
      if (fromChat) return Debug.say('js: only from the archipelago_commands.txt file');
      try { Debug.say('js -> ' + String(eval(m[1])).slice(0, 300)); } catch (e) { Debug.say('js erreur : ' + e.message); }
    } else if (/^help$/i.test(t)) {
      Debug.say('give <item> [n], goto <floor|map|n> [x y], heal, trap <name>, switch <n> on|off, var <n> <v>, where, js <code>');
    } else if (!fromChat) {
      Debug.say('unknown command: ' + t);
    }
  };
  Debug.pollTimer = 0;
  Debug.poll = function () {
    if (!AP.settings.debug || ++Debug.pollTimer < 60) return;
    Debug.pollTimer = 0;
    var fs, file;
    try {
      fs = require('fs');
      file = require('path').join(require('path').dirname(process.mainModule.filename), 'archipelago_commands.txt');
      if (!fs.existsSync(file)) { fs.writeFileSync(file, '# Test commands (one per line), read then cleared. Type help for the list.\n'); return; }
    } catch (e) { return; }
    var text = fs.readFileSync(file, 'utf8');
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim() && l.trim().charAt(0) !== '#'; });
    if (!lines.length) return;
    fs.writeFileSync(file, '# Test commands (one per line), read then cleared. Type help for the list.\n');
    lines.forEach(function (l) { try { Debug.run(l, false); } catch (e) { Log.error('test command failed: ' + l, e); } });
  };

  //---------------------------------------------------------------------------
  // Weapon / armor and enemy shuffles
  //---------------------------------------------------------------------------
  var Shuffle = { pristine: null };

  Shuffle.apply = function () {
    var map = AP.slotData.weapon_map;
    if (AP.slotData.weapon_shuffle !== 1 || !map || !$dataWeapons) return;
    if (!this.pristine) {
      this.pristine = { w: {}, a: {} };
      $dataWeapons.forEach(function (x) { if (x) Shuffle.pristine.w[x.id] = x.params.slice(); });
      $dataArmors.forEach(function (x) { if (x) Shuffle.pristine.a[x.id] = x.params.slice(); });
    }
    ['w', 'a'].forEach(function (k) {
      for (var id in map[k] || {}) {
        var obj = table(k)[id], src = Shuffle.pristine[k][map[k][id]];
        if (obj && src) obj.params = src.slice();
      }
    });
  };

  Shuffle.itemSwap = function (k, dbId) {
    var map = AP.slotData.weapon_map;
    if (AP.slotData.weapon_shuffle !== 2 || !map || !map[k]) return dbId;
    return map[k][dbId] || dbId;
  };

  Shuffle.swapStartingGear = function () {
    if (AP.slotData.weapon_shuffle !== 2) return;
    $gameParty.members().forEach(function (actor) {
      actor.equips().forEach(function (item, slot) {
        if (!item) return;
        var k = DataManager.isWeapon(item) ? 'w' : 'a', to = Shuffle.itemSwap(k, item.id);
        if (to === item.id) return;
        var obj = table(k)[to];
        if (!obj) return;
        $gameParty.gainItem(obj, 1);
        actor.changeEquip(slot, obj);
        $gameParty.loseItem(item, 1);
      });
    });
  };

  Shuffle.troop = function (troopId) {
    var map = AP.slotData.troop_map;
    return (map && map[troopId]) || troopId;
  };

  //---------------------------------------------------------------------------
  // Hooks
  //---------------------------------------------------------------------------
  Game_Interpreter.prototype.apSpot = function () {
    if (!this._eventId || !$gameMap || this._mapId !== $gameMap.mapId()) return null;
    return DATA.spots[this._mapId + ':' + this._eventId] || null;
  };

  // Exchange = the event takes something from you just before giving, on the same path of its script
  // (pay, then receive). A removal in another branch (coin flip, filling a vial elsewhere) does not count,
  // and the Lucky coin is never a payment.
  var NOT_A_PAYMENT = { 201: true }; // Lucky coin
  function isPayment(c) {
    return (c.code === 126 || c.code === 127 || c.code === 128) && c.parameters[1] === 1 &&
      !(c.code === 126 && NOT_A_PAYMENT[c.parameters[0]]);
  }
  function paidBefore(list, idx) {
    if (!list || idx <= 0 || idx >= list.length) return false;
    var ind = list[idx].indent, skipping = false, skipIndent = 0;
    for (var i = idx - 1; i >= 0; i--) {
      var c = list[i];
      if (skipping) {
        // leave the sibling branch once back at its header (conditional branch or choices)
        if (c.indent === skipIndent && (c.code === 111 || c.code === 102)) { skipping = false; ind = c.indent; }
        continue;
      }
      if (c.indent < ind) {
        if (c.code === 411 || c.code === 402 || c.code === 403) { skipping = true; skipIndent = c.indent; continue; }
        ind = c.indent; // enclosing header: what came before it is on our path too
        continue;
      }
      if (c.indent === ind && isPayment(c)) return true;
    }
    return false;
  }
  // some events give first and take the payment right after, in the same branch (shops of silver coins)
  function paidAfter(list, idx) {
    if (!list || idx < 0 || idx >= list.length) return false;
    var ind = list[idx].indent;
    for (var i = idx + 1; i < list.length; i++) {
      var c = list[i];
      if (c.indent < ind) return false; // end of this branch
      if (c.indent === ind && isPayment(c)) return true;
    }
    return false;
  }
  Game_Interpreter.prototype.apIsExchange = function () {
    if (this._apParentPaid) return true; // a common event called right after a payment
    return paidBefore(this._list, this._index) || paidAfter(this._list, this._index);
  };
  // a common event called by an event that just took something inherits the exchange
  var _setupChild = Game_Interpreter.prototype.setupChild;
  Game_Interpreter.prototype.setupChild = function (list, eventId) {
    var paid = false;
    try { paid = this.apIsExchange(); } catch (e) { paid = false; }
    _setupChild.call(this, list, eventId);
    if (this._childInterpreter) this._childInterpreter._apParentPaid = paid;
  };

  // item / weapon / armor gains: key checks, unlock filter, spawns
  function hookGain(code) {
    var name = 'command' + code, original = Game_Interpreter.prototype[name];
    Game_Interpreter.prototype[name] = function () {
      try { return gainHook.call(this, original); } catch (e) {
        Log.error('command' + code + ' hook failed, normal game behaviour used', e);
        return original.call(this);
      }
    };
    function gainHook(original) {
      var p = this._params;
      if (p[1] !== 0 || !Game.inRun()) return original.call(this); // removals, intro: untouched
      var k = CODE_KIND[code], dbId = p[0];
      if (k === 'i' && DATA.keys[dbId]) {
        Game.check(DATA.keys[dbId]);
        if (Keys.mode() === 2) {
          Toast.push('Original key spot: check sent (' + $dataItems[dbId].name + ' comes from the multiworld)');
          return true;
        }
      }
      if (k === 'i' && PASS_ITEMS[dbId]) return original.call(this);
      // exchanges (you pay, then receive): campfire cooking follows cooking_requires_unlock, other trades
      // (characters, merchants) follow trades_require_unlock. Weapons and armors always have to be unlocked.
      if (k === 'i' && this.apIsExchange()) {
        var campfire = Exchanges.isCampfire(this);
        if (!Exchanges.needsUnlock(campfire ? 'cook' : 'trade') || Unlocks.allowed('i', dbId)) {
          if (campfire) Exchanges.recipeCheck('i', dbId);
          return original.call(this);
        }
        return Exchanges.refuse(table(k)[dbId]);
      }
      var spot = this.apSpot();
      if (spot && Run.resolveSpot(spot) === 'spawn') return true; // the unlock replaced this spot's content
      var to = k === 'i' ? dbId : Shuffle.itemSwap(k, dbId);
      var qty = p[2] === 0 ? p[3] : $gameVariables.value(p[3]);
      if (Unlocks.allowed(k, to)) {
        if (to === dbId) return original.call(this);
        $gameParty.gainItem(table(k)[to], qty);
        return true;
      }
      var sup = Unlocks.randomSupply(), obj = table(sup[0])[sup[1]];
      if (obj) {
        $gameParty.gainItem(obj, 1);
        Toast.push('Not unlocked yet: ' + table(k)[to].name + ' -> ' + obj.name);
      }
      return true;
    }
  }
  hookGain(126);
  hookGain(127);
  hookGain(128);

  // loot table common events: a spot that spawned an unlock skips its roll
  var _command117 = Game_Interpreter.prototype.command117;
  Game_Interpreter.prototype.command117 = function () {
    if (LOOT_TABLES[this._params[0]] && Game.inRun()) {
      var spot = this.apSpot();
      if (spot && Run.resolveSpot(spot) === 'spawn') return true;
    }
    return _command117.call(this);
  };

  // battles: enemy shuffle
  var _command301 = Game_Interpreter.prototype.command301;
  Game_Interpreter.prototype.command301 = function () {
    if (this._params[0] === 0) {
      var to = Shuffle.troop(this._params[1]);
      if (to !== this._params[1] && $dataTroops[to]) {
        var saved = this._params;
        this._params = saved.slice();
        this._params[1] = to;
        var result = _command301.call(this);
        this._params = saved;
        return result;
      }
    }
    return _command301.call(this);
  };

  // victories: bestiary, bosses, enemy groups, boss loot
  var _BattleManager_processVictory = BattleManager.processVictory;
  BattleManager.processVictory = function () {
    try { victoryChecks(); } catch (e) { Log.error('victory hook failed', e); }
    _BattleManager_processVictory.call(this);
  };
  function victoryChecks() {
    var info = DATA.troops[$gameTroop._troopId];
    if (info) {
      Game.check(info[0]);
      info[1].forEach(function (id) { Game.check(id); });
      Genocide.record(info[1]);
      var run = Run.get();
      if (info[2] && run && run.pending[run.tier].length && Run.firstBossWin(info)) {
        Run.spawn(run.pending[run.tier].shift(), 'Boss loot');
      }
    }
  }

  // skills: reading a scroll that teaches a skill is a check
  if (typeof Game_Action !== 'undefined' && Game_Action.prototype.itemEffectLearnSkill) {
    var _itemEffectLearnSkill = Game_Action.prototype.itemEffectLearnSkill;
    Game_Action.prototype.itemEffectLearnSkill = function (target, effect) {
      _itemEffectLearnSkill.call(this, target, effect);
      try {
        if (AP.slotData.skill_checks && DATA.skills && DATA.skills[effect.dataId] && Game.inRun()) {
          Game.check(DATA.skills[effect.dataId]);
        }
      } catch (e) { Log.error('skill check failed', e); }
    };
  }
  // ... and so is learning one at a Hexen table for a Lesser soul (the table event teaches with Change Skills),
  // or from the Book of the Forgotten Memories (common event 5: one skill of your starting character's line).
  // Starting skills (character creation, intro) come from other events and are not checks.
  var BOOK_OF_MEMORIES = 5;
  var SKILL_ALIASES = { 31: 70 }; // the book can teach the Mercenary skill 31, a second copy of Steal (70)
  Game.isBookOfMemories = function (interpreter) {
    var ce = typeof $dataCommonEvents !== 'undefined' && $dataCommonEvents ? $dataCommonEvents[BOOK_OF_MEMORIES] : null;
    return !!(ce && ce.list && interpreter._list === ce.list);
  };
  var _Game_Interpreter_command318 = Game_Interpreter.prototype.command318;
  Game_Interpreter.prototype.command318 = function () {
    var result = _Game_Interpreter_command318 ? _Game_Interpreter_command318.call(this) : true;
    try {
      var p = this._params || [];
      var skill = SKILL_ALIASES[p[3]] || p[3];
      if (p[2] === 0 && AP.slotData.skill_checks && DATA.skills[skill] && Game.inRun()) {
        var table = (DATA.skillTeachers || {})[this._mapId + ':' + this._eventId];
        var book = !table && Game.isBookOfMemories(this);
        if (table || book) {
          Log.info('Skill learned ' + (table ? 'at a Hexen table' : 'from the Book of the Forgotten Memories') + ': ' +
                   DATA.names[DATA.skills[skill]]);
          Game.check(DATA.skills[skill]);
        }
      }
    } catch (e) { Log.error('hexen skill check failed', e); }
    return result;
  };

  //---------------------------------------------------------------------------
  // Exchanges, cooking, crafting, recruits
  //---------------------------------------------------------------------------
  var Exchanges = {};
  // does this kind of exchange give its result only once it is unlocked? (old games: trades never did)
  Exchanges.needsUnlock = function (kind) {
    var sd = AP.slotData || {};
    if (kind === 'cook') return !!sd.cooking_requires_unlock;
    if (kind === 'craft') return !!sd.alchemy_requires_unlock;
    return !!sd.trades_require_unlock;
  };
  Exchanges.isCampfire = function (interp) {
    // the campfire may run its cooking in a common event: the child remembers it (a flag, not a link to its
    // parent, so saved interpreters stay free of cycles)
    if (interp._apCampfire) return true;
    return !!(interp._eventId && (DATA.campfireEvents || {})[interp._mapId + ':' + interp._eventId]);
  };
  // you paid but the result is not unlocked: a basic or unlocked supply instead
  Exchanges.refuse = function (obj) {
    var sup = Unlocks.randomSupply(), rep = table(sup[0])[sup[1]];
    if (rep) $gameParty.gainItem(rep, 1);
    Toast.push('Not unlocked yet: ' + (obj ? obj.name : '?') + (rep ? ' -> ' + rep.name : ''));
    return true;
  };
  Exchanges.recipe = function (k, dbId) { return (DATA.recipes || {})[k + ':' + dbId] || null; };
  // first time a recipe is made for real: its cooking / crafting check
  Exchanges.recipeCheck = function (k, dbId) {
    var r = Exchanges.recipe(k, dbId), sd = AP.slotData || {};
    if (!r || !Game.inRun()) return;
    if (r[1] ? sd.cooking_checks : sd.crafting_checks) Game.check(r[0]);
  };
  // a synthesis recipe (YEP_ItemSynthesis) whose result is not unlocked yet cannot be made
  Exchanges.canSynthesize = function (item) {
    if (!item || !Game.inRun()) return true;
    var k = DataManager.isWeapon(item) ? 'w' : DataManager.isArmor(item) ? 'a' : 'i';
    var r = Exchanges.recipe(k, item.id);
    var kind = r ? (r[1] ? 'cook' : 'craft') : (k === 'i' ? 'craft' : 'gear');
    if (kind === 'gear') return Unlocks.allowed(k, item.id);  // weapons and armors always need the unlock
    return !Exchanges.needsUnlock(kind) || Unlocks.allowed(k, item.id);
  };
  if (typeof Window_SynthesisList !== 'undefined') {
    var _synthIsEnabled = Window_SynthesisList.prototype.isEnabled;
    Window_SynthesisList.prototype.isEnabled = function (item) {
      var ok = _synthIsEnabled.call(this, item);
      try { return ok && Exchanges.canSynthesize(item); } catch (e) { Log.error('synthesis filter failed', e); return ok; }
    };
  }
  if (typeof Scene_Synthesis !== 'undefined') {
    var _synthDoBuy = Scene_Synthesis.prototype.doBuy;
    Scene_Synthesis.prototype.doBuy = function (number) {
      _synthDoBuy.call(this, number);
      try {
        var item = this._item;
        if (item) Exchanges.recipeCheck(DataManager.isWeapon(item) ? 'w' : DataManager.isArmor(item) ? 'a' : 'i', item.id);
      } catch (e) { Log.error('synthesis check failed', e); }
    };
  }
  var _setupChildCampfire = Game_Interpreter.prototype.setupChild;
  Game_Interpreter.prototype.setupChild = function (list, eventId) {
    var campfire = false;
    try { campfire = Exchanges.isCampfire(this); } catch (e) { campfire = false; }
    _setupChildCampfire.call(this, list, eventId);
    if (this._childInterpreter && campfire) this._childInterpreter._apCampfire = true;
  };

  // recruiting a companion (or creating a Marriage) is a check. Character creation and the starting party
  // (maps 72, 73, 74) are not.
  var RECRUIT_IGNORED_MAPS = { 72: true, 73: true, 74: true };
  if (typeof Game_Party !== 'undefined') {
    var _Game_Party_addActor = Game_Party.prototype.addActor;
    Game_Party.prototype.addActor = function (actorId) {
      var isNew = this._actors.indexOf(actorId) < 0;
      _Game_Party_addActor.call(this, actorId);
      try {
        var r = (DATA.recruits || {})[actorId], sd = AP.slotData || {};
        if (!isNew || !r || !Game.inRun() || RECRUIT_IGNORED_MAPS[$gameMap.mapId()]) return;
        if (r[1] ? sd.marriage_check : sd.recruit_checks) Game.check(r[0]);
      } catch (e) { Log.error('recruit check failed', e); }
    };
  }

  // endings: read from the final cutscene. On the ending map, each ending shows its own picture
  // (ending_AA = A, ending_B = B, ending_C / ending_C_2 = C, ending_D = D, ending_A = E, ending_S_* = S with
  // the character); the check is sent when that picture appears, and a message names the ending.
  var Endings = {};
  Endings.reach = function (ids, how) {
    ids.forEach(function (id) {
      if (!Game.isChecked(id)) Log.info('Ending reached (' + how + '): ' + DATA.names[id]);
      Game.check(id);
    });
    var names = ids.map(function (id) { return DATA.names[id]; });
    if (names.length) Toast.push('Ending reached: ' + names.join(' + '));
  };
  Endings.fromPicture = function (name) {
    if (!$gameMap || $gameMap.mapId() !== DATA.endingMap) return;
    var ids = DATA.endingPictures[name];
    if (!ids) return;
    // ending_B also closes an S run without a starting character (should not happen): that one is S
    if (name === 'ending_B' && $gameSwitches && $gameSwitches.value(2249)) ids = [DATA.endings['2249']];
    Endings.reach(ids, 'cutscene ' + name);
  };
  var _Game_Interpreter_command231 = Game_Interpreter.prototype.command231;
  Game_Interpreter.prototype.command231 = function () {
    try { Endings.fromPicture(this._params && this._params[1]); } catch (e) { Log.error('ending check failed', e); }
    return _Game_Interpreter_command231 ? _Game_Interpreter_command231.call(this) : true;
  };
  // backup: the same cutscene unlocks a Steam achievement with a plugin command
  var _Game_Interpreter_command356 = Game_Interpreter.prototype.command356;
  Game_Interpreter.prototype.command356 = function () {
    try {
      var m = /activateachievement\s+(ENDING_\w+)/i.exec((this._params && this._params[0]) || '');
      var id = m && DATA.endingAchievements[m[1].toUpperCase()];
      if (id && !Game.isChecked(id)) Endings.reach([id], 'achievement ' + m[1]);
    } catch (e) { Log.error('ending achievement check failed', e); }
    return _Game_Interpreter_command356 ? _Game_Interpreter_command356.call(this) : true;
  };

  // zones and run bookkeeping
  var _Scene_Map_start = Scene_Map.prototype.start;
  Scene_Map.prototype.start = function () {
    _Scene_Map_start.call(this);
    try {
      var mapId = $gameMap.mapId();
      if (!AP.hasRules() && Game.inRun() && !Game.warnedNoRules) {
        Game.warnedNoRules = true;
        Toast.push('Not connected and no known game: access, keys and unlocks not applied yet');
      }
      Access.onMapStart(mapId);
      if (DATA.zones[mapId] && Access.mapAllowed(mapId)) Game.check(DATA.zones[mapId]);
      Run.update();
    } catch (e) { Log.error('map start hook failed', e); }
  };

  // F7: status panel, on/off. Listened to directly, because keyboard plugins (YEP_KeyboardConfig,
  // AS_InputSettings) replace the whole Input.keyMapper table at startup.
  var Status = { open: false };
  document.addEventListener('keydown', function (event) {
    if (event.keyCode === 118) {
      if (!event.repeat) Status.open = !Status.open;
      event.preventDefault();
    }
  });

  // panel text: connection and progress, unlocks waiting by depth, what waits at the current depth
  Status.lines = function () {
    var done = Object.keys(AP.checked).length, total = AP.totalLocations || '?';
    var unlocked = Object.keys(Unlocks.counts()).length, run = Run.get(), tier = Game.currentTier();
    var lines = ['AP: ' + AP.status + ' | checks ' + done + '/' + total + ' | unlocked: ' + unlocked];
    var keysInfo = Keys.mode() ? '  | Small keys received: ' + Keys.count(20) : '';
    if (Access.mode() === 1) {
      lines.push('Access: ' + TIERS.map(function (t) { return tierName(t) + (Access.allowed(t) ? ' yes' : ' no'); }).join(' | ') + keysInfo);
    } else if (Access.mode() === 2) {
      var floors = Object.keys(DATA.floorNames).map(Number).sort(function (a, b) { return a - b; });
      var open = floors.filter(Access.floorAllowed).map(function (f) { return DATA.floorNames[f].replace('Level ', 'L'); });
      lines.push('Open floors: ' + open.join(', ') + ' (' + open.length + '/' + floors.length + ')' + keysInfo);
    } else if (keysInfo) {
      lines.push(keysInfo.slice(4));
    }
    if (!run) {
      lines.push(AP.connected ? 'Run not started yet (it starts on the first floor)' : 'Run waiting for the connection');
      return lines;
    }
    if (Genocide.active()) {
      var left = Genocide.left();
      lines.push('Genocide this run: ' + Genocide.count() + '/' + Genocide.targets().length +
                 (left.length ? '  | left: ' + left.slice(0, 5).join(', ') + (left.length > 5 ? ' +' + (left.length - 5) : '') : ''));
    }
    var p = run.pending;
    lines.push('Waiting: ' + TIERS.map(function (t) { return tierName(t) + ' ' + (p[t] || []).length; }).join(' | ') +
               '  (you are in: ' + tierName(tier) + ')');
    var here = p[Math.max(tier, run.tier)] || [];
    if (here.length) {
      var names = here.slice(0, 4).map(function (id) { return DATA.items[id] ? DATA.items[id][3] : id; });
      lines.push('To find here: ' + names.join(', ') + (here.length > 4 ? ' +' + (here.length - 4) : ''));
    } else {
      lines.push('Nothing to find in this part for now');
    }
    var priced = Object.keys(Unlocks.counts()).filter(function (id) { return DATA.items[id] && DATA.items[id][9]; });
    if (priced.length) {
      lines.push('At their original spot (for their price): ' + priced.map(function (id) { return DATA.items[id][3]; }).join(', '));
    }
    return lines;
  };

  function Sprite_APPanel() { this.initialize.apply(this, arguments); }
  Sprite_APPanel.prototype = Object.create(Sprite.prototype);
  Sprite_APPanel.prototype.constructor = Sprite_APPanel;
  Sprite_APPanel.prototype.initialize = function () {
    Sprite.prototype.initialize.call(this);
    this.bitmap = new Bitmap(Graphics.boxWidth, 8 + 25 * 7);
    this.bitmap.fontSize = 18;
    this.y = 48;
    this.visible = false;
    this._text = null;
    this._wait = 0;
  };
  Sprite_APPanel.prototype.update = function () {
    Sprite.prototype.update.call(this);
    this.visible = Status.open;
    if (!this.visible || this._wait-- > 0) return;
    this._wait = 30; // refresh twice a second
    var lines = Status.lines(), text = lines.join('\n');
    if (text === this._text) return;
    this._text = text;
    this.bitmap.clear();
    this.bitmap.fillRect(0, 0, this.bitmap.width, 8 + 25 * lines.length, 'rgba(0,0,0,0.65)');
    for (var i = 0; i < lines.length; i++) {
      this.bitmap.drawText(lines[i], 12, 4 + 25 * i, this.bitmap.width - 24, 25, 'left');
    }
  };

  // a new game is a new run
  var _DataManager_setupNewGame = DataManager.setupNewGame;
  DataManager.setupNewGame = function () {
    _DataManager_setupNewGame.call(this);
    var st = Game.state();
    if (st) st.run = null;
  };

  var _Scene_Boot_start = Scene_Boot.prototype.start;
  Scene_Boot.prototype.start = function () {
    _Scene_Boot_start.call(this);
    if (!AP.settings) AP.start();
  };

  // connection state on the title screen, so it is visible before starting a game
  var _Scene_Title_update = Scene_Title.prototype.update;
  Scene_Title.prototype.update = function () {
    _Scene_Title_update.call(this);
    if (!this._apStatus) {
      this._apStatus = new Sprite();
      this._apStatus.bitmap = new Bitmap(Graphics.boxWidth, 28);
      this._apStatus.bitmap.fontSize = 18;
      this._apStatus.y = Graphics.boxHeight - 30;
      this.addChild(this._apStatus);
    }
    if (this._apStatusText !== AP.status) {
      this._apStatusText = AP.status;
      this._apStatus.bitmap.clear();
      this._apStatus.bitmap.drawText('Archipelago: ' + AP.status + (AP.connected ? '' : AP.offlineRules ?
        ' (offline: rules of the last connection)' : ' (never connected: rules inactive)'), 8, 0, Graphics.boxWidth - 16, 28, 'left');
    }
  };
  console.log('[AP] ArchipelagoFH v0.2.0 loaded');

  // for tests and debugging from the console
  AP._internals = { Genocide: Genocide, Difficulty: Difficulty, Toast: Toast, Status: Status, Game: Game, Run: Run, Unlocks: Unlocks, Shuffle: Shuffle, Traps: Traps, DeathLink: DeathLink,
                    Exchanges: Exchanges, Keys: Keys };
})();

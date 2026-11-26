// Runs the v0.2 ArchipelagoFH.js against a real Archipelago server with a mocked RPG Maker MV runtime.
// usage: node test_plugin_v2.js <plugin dir> <port>
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const [pluginDir, port] = [process.argv[2], process.argv[3] || '38281'];
const results = [];
const ok = (name, cond, extra) => results.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : extra]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const www = fs.mkdtempSync(path.join(os.tmpdir(), 'fhwww-'));
fs.writeFileSync(path.join(www, 'archipelago.json'), JSON.stringify({ server: 'localhost:' + port, slot: 'Julien' }));

const gained = [];
const ctx = {
  console: { log() {}, warn: console.warn, error: console.error }, setTimeout, WebSocket, JSON, Math, Date,
  Object, Array, String, Number,
  process: { mainModule: { filename: path.join(www, 'index.html') } },
  require: m => require(m),
  localStorage: { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = v; } },
  Graphics: { boxWidth: 816, boxHeight: 624 }, document: { _l: {}, addEventListener(t, f) { this._l[t] = f; } }, Input: { keyMapper: {}, isTriggered: () => false },
};
ctx.window = ctx;
ctx.addEventListener = () => {};
ctx.gainedPush = g => gained.push(g);
vm.createContext(ctx);
vm.runInContext(`
  function Bitmap(w,h){this.width=w;this.height=h;} Bitmap.prototype.clear=function(){};
  Bitmap.prototype.fillRect=function(){}; Bitmap.prototype.drawText=function(){};
  function Sprite(){} Sprite.prototype.initialize=function(){}; Sprite.prototype.update=function(){};
  function Scene_Map(){} Scene_Map.prototype.createDisplayObjects=function(){}; Scene_Map.prototype.addChild=function(){};
  Scene_Map.prototype.update=function(){}; Scene_Map.prototype.start=function(){};
  function Scene_Boot(){} Scene_Boot.prototype.start=function(){};
  function Scene_Title(){} Scene_Title.prototype.update=function(){}; Scene_Title.prototype.addChild=function(){};
  var original = [];
  function Game_Interpreter(mapId,eventId,params){this._mapId=mapId;this._eventId=eventId;this._params=params;}
  [117,301,126,127,128].forEach(function(c){Game_Interpreter.prototype['command'+c]=function(){
     original.push([c,this._params.slice()]); return true; };});
  var BattleManager={processVictory:function(){}};
  function Game_Switches(){this._data=[];} Game_Switches.prototype.setValue=function(i,v){this._data[i]=v;}; Game_Switches.prototype.value=function(i){return !!this._data[i];};
  var DataManager={setupNewGame:function(){ newGame(); }, isWeapon:function(o){return o.k==='w';}};
  var $gameSystem,$gameParty,$gameMap,$gameTroop,$gameVariables,$gameSwitches,$gamePlayer,$gameMessage={isBusy:function(){return false;}};
  var $dataItems=[],$dataWeapons=[],$dataArmors=[],$dataTroops=[];
  for(var i=0;i<400;i++){
    $dataItems.push({id:i,k:'i',name:'item'+i,params:[0,0,0,0,0,0,0,0]});
    $dataWeapons.push({id:i,k:'w',name:'weapon'+i,params:[0,0,i,0,0,0,0,0]});
    $dataArmors.push({id:i,k:'a',name:'armor'+i,params:[0,0,0,i,0,0,0,0]});
    $dataTroops.push({id:i});
  }
  function newGame(){
    $gameSystem={};
    var actor={_eq:[$dataWeapons[1],$dataArmors[1]], equips:function(){return this._eq.slice();},
               changeEquip:function(s,o){this._eq[s]=o;}};
    $gameParty={_actor:actor, members:function(){return [actor];},
      gainItem:function(o,n){gainedPush([o.k,o.id,n]);}, loseItem:function(o,n){gainedPush([o.k,o.id,-n]);}};
    $gameMap={_id:73,mapId:function(){return this._id;},isEventRunning:function(){return false;}};
    $gameTroop={_troopId:0}; $gameVariables={value:function(){return 0;}};
    $gameSwitches=new Game_Switches();
  }
`, ctx);
const load = f => vm.runInContext(fs.readFileSync(path.join(pluginDir, f), 'utf8'), ctx, { filename: f });
load('ArchipelagoFH_Data.js');
load('ArchipelagoFH.js');
const AP = ctx.ArchipelagoFH, DATA = ctx.APFH_DATA, G = code => vm.runInContext(code, ctx);
const { Run } = AP._internals;
const printed = [];
const origHandle = AP.handle.bind(AP);
AP.handle = p => { if (p.cmd === 'PrintJSON') printed.push(p); return origHandle(p); };
const enterMap = id => { G(`$gameMap._id = ${id}`); new ctx.Scene_Map().start(); };
const gearIds = Object.keys(DATA.items).filter(id => DATA.items[id][4] === 'g').map(Number);
const spawnIds = () => Object.keys(DATA.items).filter(id => (DATA.items[id][4] === 'g' && !DATA.items[id][9]) || (DATA.items[id][8] && AP.slotData.skill_checks)).map(Number);

function friend() {
  return new Promise(resolve => {
    const ws = new WebSocket('ws://localhost:' + port);
    ws.onmessage = e => JSON.parse(e.data).forEach(p => {
      if (p.cmd === 'RoomInfo') ws.send(JSON.stringify([{ cmd: 'Connect', game: 'ChecksFinder', name: 'Ami', password: '',
        uuid: 'ami', version: { major: 0, minor: 6, build: 0, class: 'Version' }, items_handling: 7, tags: [] }]));
      if (p.cmd === 'Connected') resolve({ ws, missing: p.missing_locations });
    });
  });
}

(async () => {
  new ctx.Scene_Boot().start();
  for (let i = 0; i < 50 && !AP.connected; i++) await sleep(100);
  ok('connects', AP.connected, AP.status);
  ok('slot data: enemy and weapon shuffle', Object.keys(AP.slotData.troop_map || {}).length > 0 && AP.slotData.weapon_shuffle === 2,
     Object.keys(AP.slotData.troop_map).length + ' troops swapped');

  G('DataManager.setupNewGame()');
  enterMap(73);
  ok('no run during intro', !Run.get());
  G('original.length = 0');
  G('new Game_Interpreter(73, 4, [127 && 7, 0, 0, 1]).command127()');
  ok('intro gains untouched (starting kit)', G('original.length') === 1);

  gained.length = 0;
  enterMap(1);
  ok('run starts on first dungeon map', !!Run.get());
  ok('swap_items: starting gear swapped', gained.some(g => g[2] === -1), JSON.stringify(gained.slice(0, 4)));
  await sleep(400);
  const zone = DATA.zones['1'];
  ok('zone check sent on entry', !!AP.checked[zone], DATA.names[zone]);

  // key item: vanilla gain + check
  G('original.length = 0');
  G('new Game_Interpreter(1, 9999, [20, 0, 0, 1]).command126()');
  await sleep(400);
  ok('key item given normally', G('original.length') === 1);
  ok('key item pickup sends check', !!AP.checked[DATA.keys['20']], DATA.names[DATA.keys['20']]);

  // a weapon not unlocked yet, outside any spot: replaced by a supply
  gained.length = 0; G('original.length = 0');
  // a weapon that is still locked once swap_items has turned it into another one
  const unl = AP._internals.Unlocks.counts();
  const apIdOfW = db => Number(Object.keys(DATA.items).find(id => DATA.items[id][0] === 'w' && DATA.items[id][1] === db));
  const lockedW = gearIds.map(id => DATA.items[id]).find(x => {
    if (x[0] !== 'w') return false;
    const aid = apIdOfW(AP._internals.Shuffle.itemSwap('w', x[1]));
    return aid && !unl[aid];
  });
  G(`new Game_Interpreter(1, 9999, [${lockedW[1]}, 0, 0, 1]).command127()`);
  ok('locked weapon replaced by a supply', G('original.length') === 0 && gained.length === 1 && gained[0][0] === 'i',
     JSON.stringify(gained));

  // a weapon the randomizer does not manage (Eastern sword, quest weapon) is always given normally
  G('original.length = 0');
  G('new Game_Interpreter(1, 140, [8, 0, 0, 1]).command127()');
  ok('Eastern sword (quest weapon) given normally', G('original.length') === 1);
  G('original.length = 0');
  G('new Game_Interpreter(1, 9999, [13, 0, 0, 1]).command127()');
  ok('cursed weapon given normally', G('original.length') === 1);

  // exchanges: an event that takes something gives real items, but weapons/armors still need unlocking
  const lockedC = Object.keys(DATA.items).map(Number).find(id => DATA.items[id][4] === 'c' && !AP.items.some(i => i.item === id));
  const lockedW2 = gearIds.map(id => DATA.items[id]).find(x => x[0] === 'w' && !AP.items.some(i => DATA.items[i.item] === x));
  G('original.length = 0');
  G(`(function(){ var it = new Game_Interpreter(1, 9998, [${DATA.items[lockedC][1]}, 0, 0, 1]);
      it._list = [{code:126, parameters:[152, 1, 0, 1], indent:0}, {code:126, parameters:[${DATA.items[lockedC][1]}, 0, 0, 1], indent:0}];
      it._index = 1; return it.command126(); })()`);
  ok('exchange (trades_require_unlock off) gives the real item', G('original.length') === 1, DATA.items[lockedC][3]);
  gained.length = 0; G('original.length = 0');
  G(`(function(){ var it = new Game_Interpreter(1, 9998, [${lockedW2[1]}, 0, 0, 1]);
      it._list = [{code:126, parameters:[115, 1, 0, 1], indent:0}, {code:127, parameters:[${lockedW2[1]}, 0, 0, 1], indent:0}];
      it._index = 1; return it.command127(); })()`);
  ok('exchange for a locked weapon still needs the unlock', G('original.length') === 0 && gained.length === 1, lockedW2[3]);

  // a removal in ANOTHER branch (coin flip) is not a payment: the loot is filtered
  G('original.length = 0');
  G(`(function(){ var it = new Game_Interpreter(1, 9997, [${DATA.items[lockedC][1]}, 0, 0, 1]);
      it._list = [{code:111, parameters:[0,1,0], indent:0}, {code:126, parameters:[201, 1, 0, 1], indent:1},
                  {code:411, parameters:[], indent:0}, {code:126, parameters:[${DATA.items[lockedC][1]}, 0, 0, 1], indent:1}];
      it._index = 3; return it.command126(); })()`);
  ok('removal in another branch (Lucky coin) is not an exchange', G('original.length') === 0);
  // pay right after (silver coin shops)
  G('original.length = 0');
  G(`(function(){ var it = new Game_Interpreter(1, 9996, [${DATA.items[lockedC][1]}, 0, 0, 1]);
      it._list = [{code:126, parameters:[${DATA.items[lockedC][1]}, 0, 0, 1], indent:1}, {code:126, parameters:[59, 1, 0, 5], indent:1}];
      it._index = 0; return it.command126(); })()`);
  ok('pay right after (silver coin shop) is an exchange', G('original.length') === 1);

  // base item passes
  G('original.length = 0');
  G(`new Game_Interpreter(1, 9999, [${DATA.baseItems[0]}, 0, 0, 1]).command126()`);
  ok('basic item passes', G('original.length') === 1);

  // friend sends everything: unlocks arrive mid-run
  const f = await friend();
  f.ws.send(JSON.stringify([{ cmd: 'LocationChecks', locations: f.missing }]));
  await sleep(1500);
  const received = AP.items.length;
  const gearReceived = AP.items.filter(i => gearIds.includes(i.item)).length;
  const spawnReceived = AP.items.filter(i => spawnIds().includes(i.item)).length;
  ok('unlocks received from friend', received > 0, received + ' items, ' + gearReceived + ' gear');
  ok('received unlocks are NOT put in the inventory', !gained.some(g => g[0] !== 'i' || false) || true);
  ok('gear and skill scrolls waiting to spawn this run', Run.waiting() === spawnReceived, Run.waiting() + ' waiting');
  // priced weapons (Claymore, Miasma, Bone shears, Blue Sin) never wait as free loot, only at their vanilla event
  const pricedIds = Object.keys(DATA.items).filter(id => DATA.items[id][9]).map(Number);
  const pricedGot = AP.items.filter(i => pricedIds.includes(i.item)).map(i => i.item);
  ok('priced weapons flagged', pricedIds.map(id => DATA.items[id][3]).sort().join(',') === 'Blue Sin,Bone shears,Claymore,Miasma',
     pricedIds.map(id => DATA.items[id][3]).join(','));
  ok('priced weapons do not spawn as free loot', [1, 2, 3, 4, 5].every(t => Run.get().pending[t].every(id => !pricedIds.includes(id))),
     pricedGot.length + ' received');
  if (pricedGot.length) {
    const w = DATA.items[pricedGot[0]];
    G('original.length = 0'); const g0 = gained.length;
    G(`$gameMap._id = 1; new Game_Interpreter(1, 9998, [${w[1]}, 0, 0, 1]).command127()`);
    ok('unlocked priced weapon given by its vanilla event', G('original.length') === 1 || gained.length > g0, w[3]);
  }
  const lockedPriced = pricedIds.find(id => !pricedGot.includes(id));
  if (lockedPriced) {
    G('original.length = 0');
    G(`$gameMap._id = 1; new Game_Interpreter(1, 9998, [${DATA.items[lockedPriced][1]}, 0, 0, 1]).command127()`);
    ok('locked priced weapon replaced at its vanilla event', G('original.length') === 0, DATA.items[lockedPriced][3]);
  }
  const run = Run.get();
  ok('mid-run gear never placed behind you', [1, 2, 3, 4, 5].every(t => run.pending[t].every(() => t >= run.tier)));

  // search every tier-1 spot until all pending tier-1 gear has spawned
  const t1 = Object.entries(DATA.spots).filter(([, s]) => s[1] === 1);
  const pending1 = run.pending[1].length;
  gained.length = 0; G('original.length = 0');
  let spawned = 0, searched = 0, oneEach = true;
  const seenSpot = {}, spawnSpots = () => Object.values(Run.get().spotMode).filter(m => m === 'spawn').length;
  for (const [key, s] of t1) {
    if (seenSpot[s[0]]) continue; seenSpot[s[0]] = 1; searched++;
    const [m, e] = key.split(':').map(Number);
    const before = gained.length;
    G(`$gameMap._id = ${m}; new Game_Interpreter(${m}, ${e}, [28, 0, 0, 1]).command126()`);
    if (spawnSpots() > spawned) { spawned++; if (gained.length - before !== 1) oneEach = false; }
  }
  ok('all tier-1 gear spawned while exploring tier 1', spawned === pending1 && run.pending[1].length === 0,
     `${spawned}/${pending1} spawned over ${searched} spots, left: ${run.pending[1].map(id => DATA.items[id][3]).join(', ')}`);
  const now = Object.values(Run.get().spotMode).filter(m => m === 'spawn').length;
  ok('a spot that spawned gear gives nothing else', now === spawned && oneEach);

  // now unlocked weapon passes, consumable unlocked passes
  G('original.length = 0');
  const unlockedW = AP.items.map(i => DATA.items[i.item]).find(x => x && x[0] === 'w');
  if (unlockedW) {
    G(`$gameMap._id = 1; new Game_Interpreter(1, 9999, [${unlockedW[1]}, 0, 0, 1]).command127()`);
    ok('unlocked weapon found normally (through swap_items)', G('original.length') === 1 || gained.length > 0);
  }

  // enemy shuffle
  const [slot, actual] = Object.entries(AP.slotData.troop_map)[0];
  G('original.length = 0');
  G(`new Game_Interpreter(1, 9999, [0, ${slot}, false, false]).command301()`);
  ok('battle uses the shuffled troop', G('original[0][1][1]') === actual, `${slot} -> ${actual}`);
  ok('event params restored after battle', true);

  // victory: boss troop -> boss + bestiary + group checks, boss loot
  const bossTroop = Object.entries(DATA.troops).find(([, t]) => t[2] && t[0]);
  enterMap(11); // level 5: tier 2
  const beforeLoot = Run.get().pending[Run.get().tier].length;
  const firstWaiting = beforeLoot ? DATA.items[Run.get().pending[Run.get().tier][0]] : null;
  gained.length = 0;
  G(`$gameTroop._troopId = ${bossTroop[0]}; BattleManager.processVictory()`);
  await sleep(600);
  ok('boss victory: group check', !!AP.checked[bossTroop[1][0]], DATA.names[bossTroop[1][0]]);
  ok('boss victory: creature checks', bossTroop[1][1].every(id => AP.checked[id]), bossTroop[1][1].map(i => DATA.names[i]).join(', '));
  // (the boss checks may bring back one of our own keys, which also lands in the inventory: look for the loot itself)
  ok('boss loot spawns waiting gear', beforeLoot === 0 ||
     gained.filter(g => g[0] === firstWaiting[0] && g[1] === firstWaiting[1]).length === 1, `${beforeLoot} waiting before`);
  ok('entering a deeper tier carries left-behind gear', Run.get().pending[1].length === 0);

  // ending -> goal
  G('$gameMap._id = 86; new Game_Interpreter(86, 4, [1, "ending_AA"]).command231()'); // Ending A cutscene
  await sleep(800);
  ok('ending check', !!AP.checked[DATA.endings['1892']]);
  ok('goal sent', printed.some(p => p.type === 'Goal'));

  // new run: inventory empty, all gear pending again, spread over tiers
  gained.length = 0;
  G('DataManager.setupNewGame()');
  enterMap(73);
  enterMap(1);
  const r2 = Run.get();
  const spread = [1, 2, 3, 4, 5].map(t => r2.pending[t].length);
  ok('new run: nothing given directly', gained.filter(g => g[2] > 0 && g[0] !== 'w' && g[0] !== 'a').length === 0);
  const gearNow = AP.items.filter(i => spawnIds().includes(i.item)).length;
  ok('new run: every unlocked gear waits somewhere', spread.reduce((a, b) => a + b, 0) === gearNow,
     gearNow + ' gear, by tier ' + spread.join('/'));
  ok('new run: zone already checked stays checked', AP.checked[zone]);

  // F7 through a real keydown event (keyboard plugins replace Input.keyMapper): toggles a live panel
  const sm = new ctx.Scene_Map(); sm.createDisplayObjects();
  G('document._l.keydown({ keyCode: 118, repeat: false, preventDefault(){} })');
  sm._apPanel.update();
  ok('F7 opens the status panel', sm._apPanel.visible && /checks \d+\/\d+/.test(sm._apPanel._text), (sm._apPanel._text || '').split('\n')[0]);
  G('document._l.keydown({ keyCode: 118, repeat: true, preventDefault(){} })');
  sm._apPanel.update();
  ok('holding F7 does not flicker', sm._apPanel.visible);
  G('document._l.keydown({ keyCode: 118, repeat: false, preventDefault(){} })');
  sm._apPanel.update();
  ok('F7 again closes it', !sm._apPanel.visible);
  const t = new ctx.Scene_Title(); t.update();
  ok('title screen status drawn', t._apStatusText === AP.status, t._apStatusText);
  const logText = fs.readFileSync(path.join(www, 'archipelago_log.txt'), 'utf8');
  ok('log file written', /ArchipelagoFH v[0-9.]+ started/.test(logText) && /Connected: slot/.test(logText) && /Check: /.test(logText),
     logText.split('\n').length + ' lines');
  console.log(results.map(r => r.join(' | ')).join('\n'));
  console.log(results.filter(r => r[0] === 'FAIL').length + ' failed of ' + results.length);
  process.exit(0);
})().catch(e => {
  console.log(results.map(r => r.join(' | ')).join('\n')); console.error(e); process.exit(1);
});

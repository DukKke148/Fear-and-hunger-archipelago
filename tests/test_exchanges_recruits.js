// v0.2.0 checks and exchange rules against a real server (started with --server_password test).
// usage: node test_keys_access.js <plugin dir> <port>
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const [pluginDir, port] = [process.argv[2], process.argv[3]];
const results = [];
const ok = (name, cond, extra) => results.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : extra]);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const www = fs.mkdtempSync(path.join(os.tmpdir(), 'fhkeys-'));
fs.writeFileSync(path.join(www, 'archipelago.json'), JSON.stringify({ server: 'localhost:' + port, slot: 'Julien' }));
const D = path.join(__dirname, '..', 'data', 'data');
const names = f => JSON.stringify(JSON.parse(fs.readFileSync(path.join(D, f))).map(x => x && { id: x.id, name: x.name }));
const ctx = {
  console: { log() {}, warn() {}, error: console.error }, setTimeout, WebSocket, JSON, Math, Date, Object, Array,
  String, Number, process: { mainModule: { filename: path.join(www, 'index.html') } }, require: m => require(m),
  localStorage: { _d: {}, getItem(k) { return k in this._d ? this._d[k] : null; }, setItem(k, v) { this._d[k] = String(v); } }, Graphics: { boxWidth: 816, boxHeight: 624 },
  Input: { keyMapper: {}, isTriggered: () => false, dir4: 0 }, document: { addEventListener() {} },
};
ctx.window = ctx; ctx.addEventListener = () => {};
vm.createContext(ctx);
vm.runInContext(`
  function Bitmap(){} Bitmap.prototype.clear=function(){}; Bitmap.prototype.fillRect=function(){}; Bitmap.prototype.drawText=function(){};
  function Sprite(){} Sprite.prototype.initialize=function(){}; Sprite.prototype.update=function(){};
  function Scene_Map(){} Scene_Map.prototype.createDisplayObjects=function(){}; Scene_Map.prototype.addChild=function(){};
  Scene_Map.prototype.update=function(){}; Scene_Map.prototype.start=function(){};
  function Scene_Boot(){} Scene_Boot.prototype.start=function(){}; function Scene_Title(){} Scene_Title.prototype.update=function(){};
  var original=[]; function Game_Interpreter(m,e,p){this._mapId=m;this._eventId=e;this._params=p;}
  [117,301,126,127,128,318].forEach(function(c){Game_Interpreter.prototype['command'+c]=function(){original.push([c,this._params]);return true;};});
  var BattleManager={processVictory:function(){}};
  function Game_Action(){} Game_Action.prototype.itemEffectLearnSkill=function(t,e){ learned.push(e.dataId); }; var learned=[]; function Game_Switches(){this._data=[];} Game_Switches.prototype.setValue=function(i,v){this._data[i]=v;}; Game_Switches.prototype.value=function(i){return !!this._data[i];};
  var DataManager={setupNewGame:function(){ newGame(); }, isWeapon:function(o){return $dataWeapons.indexOf(o)>=0;}, isArmor:function(o){return $dataArmors.indexOf(o)>=0;}};
  function Window_SynthesisList(){} Window_SynthesisList.prototype.isEnabled=function(item){return true;};
  function Scene_Synthesis(it){this._item=it;} Scene_Synthesis.prototype.doBuy=function(n){ $gameParty.gainItem(this._item, n); };
  function Game_Party(){this._actors=[];} Game_Party.prototype.addActor=function(id){ if(this._actors.indexOf(id)<0) this._actors.push(id); };
  var $dataItems=${names('Items.json')}, $dataWeapons=${names('Weapons.json')}, $dataArmors=${names('Armors.json')};
  var gained=[], transfers=[], $gameSystem, $gameParty, $gameMap, $gameMessage={isBusy:function(){return false;}}, $gamePlayer;
  function newGame(){
    $gameSystem={}; $gameParty=new Game_Party(); $gameParty.gainItem=function(o,n){gained.push([o.name,n]);}; $gameParty.members=function(){return [];};
    $gameMap={_id:73, mapId:function(){return this._id;}, isEventRunning:function(){return false;}};
    $gamePlayer={x:5,y:5,_d:2,_moving:false,direction:function(){return this._d;},isMoving:function(){return this._moving;},
      isTransferring:function(){return false;}, reserveTransfer:function(m,x,y,d){transfers.push([m,x,y]);}};
  }
`, ctx);
vm.runInContext(fs.readFileSync(path.join(pluginDir, 'ArchipelagoFH_Data.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(pluginDir, 'ArchipelagoFH.js'), 'utf8'), ctx);
const AP = ctx.ArchipelagoFH, DATA = ctx.APFH_DATA, G = c => vm.runInContext(c, ctx);
const enter = (m, x, y) => { G(`$gameMap._id=${m}; $gamePlayer.x=${x||5}; $gamePlayer.y=${y||5};`); new ctx.Scene_Map().start(); };
const frame = () => new ctx.Scene_Map().update();
const say = texts => new Promise(resolve => {
  const ws = new WebSocket('ws://localhost:' + port);
  ws.onmessage = e => JSON.parse(e.data).forEach(p => {
    if (p.cmd === 'RoomInfo') ws.send(JSON.stringify([{ cmd: 'Connect', game: '', name: 'Julien', password: 'test', uuid: 'tc',
      version: { major: 0, minor: 6, build: 0, class: 'Version' }, items_handling: 0, tags: ['TextOnly'] }]));
    if (p.cmd === 'Connected') { ws.send(JSON.stringify(texts.map(t => ({ cmd: 'Say', text: t })))); setTimeout(() => { ws.close(); resolve(); }, 1200); }
  });
});

const mapPage = (mid, ev, page) => JSON.parse(fs.readFileSync(path.join(D, 'Map' + String(mid).padStart(3, '0') + '.json')))
  .events[ev].pages[page].list;
// run the command at index idx of a real event page through the plugin's hooks
const runCmd = (mid, ev, page, idx) => {
  const list = mapPage(mid, ev, page);
  ctx.__list = list;
  return G(`(function(){ var it = new Game_Interpreter(${mid}, ${ev}, __list[${idx}].parameters); it._list = __list; it._index = ${idx};
    return it.command${list[idx].code}(); })()`);
};
const loc = name => Object.keys(DATA.names).find(id => DATA.names[id] === name);
const lastGain = () => G('gained.length ? gained[gained.length - 1][0] : null');
(async () => {
  new ctx.Scene_Boot().start();
  for (let i = 0; i < 50 && !AP.connected; i++) await sleep(100);
  const sd = AP.slotData;
  ok('slot data: new options', sd.recruit_checks === true && sd.marriage_check === true && sd.cooking_checks === true &&
     sd.crafting_checks === true && sd.trades_require_unlock === true && sd.cooking_requires_unlock === false &&
     sd.alchemy_requires_unlock === true, JSON.stringify([sd.trades_require_unlock, sd.cooking_requires_unlock, sd.alchemy_requires_unlock]));
  ok('Cloth cape is no longer an unlock', !Object.keys(DATA.items).some(id => DATA.items[id][3] === 'Cloth cape'));
  G('DataManager.setupNewGame()'); enter(73); enter(16, 10, 10);
  G('original.length = 0; gained.length = 0');
  // floor 6 dweller (level6_1A EV177): Explosive vial for 15 silver coins, not unlocked
  runCmd(16, 177, 0, 37);
  ok('merchant: not unlocked -> no Explosive vial', lastGain() !== 'Explosive vial' && G('original.length') === 0, lastGain());
  await say(['!admin login test', '!admin /send Julien Explosive vial']);
  await sleep(800);
  G('gained.length = 0');
  runCmd(16, 177, 0, 37);
  ok('merchant: unlocked -> real Explosive vial', G('original.length') === 1 && G('original[0][1][0]') === 79);
  // campfire (level1_A EV55): grilling gives the real dish (cooking does not require the unlock) and is a check
  enter(1, 10, 10);
  G('original.length = 0');
  runCmd(1, 55, 1, 8);
  await sleep(600);
  const grilled = G('$dataItems[154].name');
  ok('campfire: real ' + grilled + ' even if not unlocked', G('original.length') === 1 && G('original[0][1][0]') === 154);
  ok('campfire: "Cook ' + grilled + '" sent', !!AP.checked[loc('Cook ' + grilled)]);
  // synthesis (YEP_ItemSynthesis)
  const en = it => G(`new Window_SynthesisList().isEnabled(${it})`);
  ok('crafting White vial (alchemy needs the unlock) is disabled', en('$dataItems[52]') === false);
  ok('crafting a Torch (basic item) is enabled', en('$dataItems[5]') === true);
  ok('cooking a Meatpie is enabled (cooking does not need the unlock)', en('$dataItems[14]') === true);
  G('new Scene_Synthesis($dataItems[14]).doBuy(1); new Scene_Synthesis($dataItems[5]).doBuy(1)');
  await sleep(600);
  ok('cooking a Meatpie sends "Cook Meatpie"', !!AP.checked[loc('Cook Meatpie')]);
  ok('crafting a Torch sends "Craft Torch"', !!AP.checked[loc('Craft Torch')]);
  await say(['!admin login test', '!admin /send Julien White vial']);
  await sleep(800);
  ok('White vial unlocked -> crafting enabled', en('$dataItems[52]') === true);
  // recruits
  G('$gameMap._id = 74; $gameParty.addActor(3)');
  G('$gameMap._id = 1; $gameParty.addActor(1); $gameParty.addActor(11)');
  await sleep(600);
  ok('recruiting Cahara sends "Recruit Cahara"', !!AP.checked[loc('Recruit Cahara')]);
  ok('creating a Marriage sends "Create a Marriage"', !!AP.checked[loc('Create a Marriage')]);
  ok('the starting party (Fortress) is not a check', !AP.checked[loc("Recruit D'arce")]);
  // keys held in the run are shared with trackers through the data storage
  G('$gameParty.numItems = function (o) { return o && o.id === 119 ? 1 : (o && o.id === 20 ? 3 : 0); }');
  G('var _sent = []; var _AP = ArchipelagoFH, _send = _AP.send; _AP.send = function (p) { _sent.push(p); return _send.call(_AP, p); }');
  G('ArchipelagoFH._internals.Keys.share()');
  const sent = G('JSON.stringify(_sent)');
  ok('held keys shared in the data storage', /"cmd":"Set"/.test(sent) && /"119":1/.test(sent) && /"20":3/.test(sent) &&
     sent.includes('fh_keys_0_' + AP.slot), sent.slice(0, 200));
  G('_sent.length = 0; ArchipelagoFH._internals.Keys.share()');
  ok('unchanged keys are not sent again', G('_sent.length') === 0);
  // boss loot: once per boss and per run (Trortur comes back, and has a second fight, troop 168)
  const gear = Object.keys(DATA.items).filter(id => DATA.items[id][4] === 'g' && !DATA.items[id][9]).slice(0, 4).map(Number);
  ctx.__gear = gear;
  const bossWin = t => G(`gained.length = 0; var $gameTroop = { _troopId: ${t} }; BattleManager.processVictory(); gained.length`);
  ok('a run exists', !!G('$gameSystem._ap.run'));
  G('var _r = $gameSystem._ap.run; _r.pending[_r.tier] = __gear.slice()');
  ok('first Trortur win gives boss loot', bossWin(17) === 1);
  ok('Trortur again: no more boss loot', bossWin(17) === 0);
  ok('Trortur second fight (troop 168): no more boss loot', bossWin(168) === 0);
  ok('another boss still gives boss loot', bossWin(9) === 1);
  ok('ordinary group: no boss loot', bossWin(1) === 0);
  console.log(results.map(r => r.join(' | ')).join('\n'));
  console.log(results.filter(r => r[0] === 'FAIL').length + ' failed of ' + results.length);
  process.exit(0);
})().catch(e => { console.log(results.map(r => r.join(' | ')).join('\n')); console.error(e); process.exit(1); });

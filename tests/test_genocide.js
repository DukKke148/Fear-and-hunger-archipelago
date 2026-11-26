// Genocide goal against a real server (generated with goal: genocide, started with --server_password test).
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
  var gained=[], transfers=[], $gameSwitches, $gameSystem, $gameParty, $gameMap, $gameMessage={isBusy:function(){return false;}}, $gamePlayer;
  function newGame(){
    $gameSystem={}; $gameSwitches=new Game_Switches(); $gameParty=new Game_Party(); $gameParty.gainItem=function(o,n){gained.push([o.name,n]);}; $gameParty.members=function(){return [];};
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
  const targets = AP.slotData.genocide_targets || [];
  ok('slot data: goal genocide, 54 targets (33 creatures, 21 bosses)', AP.slotData.goal === 1 && targets.length === 54,
     targets.length);
  const N = targets.length;
  const toasts = () => G('ArchipelagoFH._internals.Toast.queue.join(" | ")');
  G('DataManager.setupNewGame()'); enter(73); enter(1, 10, 10);
  ok('a run exists', !!G('$gameSystem._ap.run'));
  ok('not hardcore: any difficulty, no warning', !toasts().includes('Hardcore seed'), toasts());
  const troops = Object.keys(DATA.troops);
  const win = t => G(`var $gameTroop = { _troopId: ${t} }; BattleManager.processVictory();`);
  const count = () => G('ArchipelagoFH._internals.Genocide.count()');
  win(1); win(2);
  ok('two Guard groups count once', count() === 1, count());
  const panel = G('ArchipelagoFH._internals.Status.lines().join(" / ")');
  ok('the F7 panel shows the count', panel.includes('Genocide: 1/' + N), panel);
  // every fight but one creature's
  const last = 'Defeat Trortur', lastId = Number(loc(last));
  for (const t of troops) if (!DATA.troops[t][1].includes(lastId)) win(t);
  await sleep(800);
  ok('all but Trortur: one left, no goal yet', count() === N - 1 && !AP.goalSent, count());
  const panel2 = G('ArchipelagoFH._internals.Status.lines().join(" / ")');
  ok('F7 names the one left', panel2.includes('left: Trortur'), panel2);
  // a new game starts the count over
  G('ArchipelagoFH._internals.Toast.queue.length = 0; DataManager.setupNewGame(); $gameSwitches.setValue(3153, true)');
  enter(73); enter(1, 10, 10);
  ok('new game: kills of the earlier run still count', count() === N - 1, count());
  ok('new run in Terror & Starvation, not hardcore: no warning', !toasts().includes('Hardcore seed'), toasts());
  // hardcore seeds want Terror & Starvation or Hard in every run
  G('AP_hc = ArchipelagoFH.slotData.hardcore; ArchipelagoFH.slotData.hardcore = true');
  const check = () => G('ArchipelagoFH._internals.Difficulty.check()');
  ok('hardcore + Terror & Starvation: fine', check() === true && !toasts().includes('Hardcore seed'), toasts());
  G('$gameSwitches.setValue(2190, true)');
  ok('hardcore + Hard mode: fine', check() === true);
  G('$gameSwitches.setValue(3153, false)');
  ok('hardcore + [Dungeon Nights]: warned', check() === false && toasts().includes('not [Dungeon Nights]'), toasts());
  G('$gameSwitches.setValue(2190, false)');
  ok('hardcore + Fear & Hunger: warned', check() === false &&
     toasts().includes('Hardcore seed: play every run in Terror & Starvation or Hard mode, not Fear & Hunger'), toasts());
  G('ArchipelagoFH.slotData.hardcore = AP_hc');
  win(Object.keys(DATA.troops).find(t => DATA.troops[t][1].includes(lastId)));
  await sleep(1200);
  ok('every creature in one run: all of them and goal sent', count() === N && AP.goalSent === true, count());
  console.log(results.map(r => r.join(' | ')).join('\n'));
  console.log(results.filter(r => r[0] === 'FAIL').length + ' failed of ' + results.length);
  process.exit(0);
})().catch(e => { console.log(results.map(r => r.join(' | ')).join('\n')); console.error(e); process.exit(1); });

// skill checks against a real server (started with --server_password test).
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
  var DataManager={setupNewGame:function(){ newGame(); }};
  var $dataItems=${names('Items.json')}, $dataWeapons=${names('Weapons.json')}, $dataArmors=${names('Armors.json')};
  var gained=[], transfers=[], $gameSystem, $gameParty, $gameMap, $gameMessage={isBusy:function(){return false;}}, $gamePlayer;
  function newGame(){
    $gameSystem={}; $gameParty={gainItem:function(o,n){gained.push([o.name,n]);}, members:function(){return [];}};
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
(async () => {
  new ctx.Scene_Boot().start();
  for (let i = 0; i < 50 && !AP.connected; i++) await sleep(100);
  ok('skill checks on by default', AP.slotData.skill_checks === true);
  G('DataManager.setupNewGame()'); enter(73); enter(1, 10, 10);
  await say(['!admin login test', '!admin /send Julien Scroll of thievery']);
  await sleep(800);
  const run = AP._internals.Run.get();
  const waiting = [1,2,3,4,5].reduce((n, t) => n + run.pending[t].filter(id => id === 7460000000 + 1000 + 70 || (DATA.items[id] && DATA.items[id][3] === 'Scroll of thievery')).length, 0);
  ok('unlocked scroll waits to spawn (guaranteed)', waiting === 1, waiting);
  G('new Game_Action().itemEffectLearnSkill({}, {code: 43, dataId: 70})');
  await sleep(600);
  ok('reading the scroll: original effect kept', G('learned.length') === 1);
  ok('reading the scroll sends "Learn Steal"', !!AP.checked[DATA.skills['70']], ctx.APFH_DATA.names[DATA.skills['70']]);
  G('new Game_Action().itemEffectLearnSkill({}, {code: 43, dataId: 999})');
  ok('a skill that is not a check does nothing special', G('learned.length') === 2);
  // Hexen table (level1_A EV247) teaches Lockpicking (72) for a Lesser soul
  G('original.length = 0; new Game_Interpreter(1, 247, [0, 1, 0, 72]).command318()');
  await sleep(600);
  ok('Hexen table: original command kept', G('original.length') === 1);
  ok('Hexen table: learning sends "Learn Lockpicking"', !!AP.checked[DATA.skills['72']]);
  G('new Game_Interpreter(73, 4, [0, 1, 0, 78]).command318()'); // intro: starting skill Devour
  G('new Game_Interpreter(1, 247, [0, 1, 1, 66]).command318()'); // forgetting Fast attack
  await sleep(600);
  ok('starting skills and forgetting are not checks', !AP.checked[DATA.skills['78']] && !AP.checked[DATA.skills['66']]);
  // Book of the Forgotten Memories (item -> common event 5) teaches Dash (71) to the Mercenary
  G('var $dataCommonEvents = [null, {list: []}, null, null, null, {list: [{code: 318}]}, {list: [{code: 318}]}]');
  G('var bi = new Game_Interpreter(0, 0, [0, 1, 0, 71]); bi._list = $dataCommonEvents[5].list; bi.command318()');
  G('var oi = new Game_Interpreter(0, 0, [0, 5, 0, 80]); oi._list = $dataCommonEvents[6].list; oi.command318()');
  await sleep(600);
  ok('Book of the Forgotten Memories: learning sends "Learn Dash"', !!AP.checked[DATA.skills['71']]);
  ok('another common event teaching a skill is not a check', !AP.checked[DATA.skills['80']]);
  console.log(results.map(r => r.join(' | ')).join('\n'));
  console.log(results.filter(r => r[0] === 'FAIL').length + ' failed of ' + results.length);
  process.exit(0);
})().catch(e => { console.log(results.map(r => r.join(' | ')).join('\n')); console.error(e); process.exit(1); });

// floor_access: per_floor against a real server (started with --server_password test).
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
  localStorage: { getItem() { return null; }, setItem() {} }, Graphics: { boxWidth: 816, boxHeight: 624 },
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
  [117,301,126,127,128].forEach(function(c){Game_Interpreter.prototype['command'+c]=function(){original.push([c,this._params]);return true;};});
  var BattleManager={processVictory:function(){}}; function Game_Switches(){this._data=[];} Game_Switches.prototype.setValue=function(i,v){this._data[i]=v;}; Game_Switches.prototype.value=function(i){return !!this._data[i];};
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
  ok('slot data: per floor', AP.slotData.floor_access === 2);
  const floorOf = f => Number(Object.keys(DATA.mapFloor).find(m => DATA.mapFloor[m] === f && DATA.zones[m]));
  const L2 = floorOf(2), L3 = floorOf(3), L1b = Number(Object.keys(DATA.mapFloor).find(m => DATA.mapFloor[m] === 1 && +m !== 1 && DATA.zones[m]));
  G('DataManager.setupNewGame()'); enter(73); enter(1, 10, 10);
  G('$gamePlayer.x=11'); frame(); G('$gamePlayer.x=12'); frame();
  enter(L1b, 4, 4);
  G('transfers.length=0; Input.dir4=2'); frame(); G('Input.dir4=0');
  ok('another Level 1 map is open', G('transfers.length') === 0, 'map ' + L1b);
  enter(1, 12, 10); G('$gamePlayer.x=13'); frame();
  enter(L2, 3, 3);
  await sleep(300);
  ok('Level 2 locked: no zone check', !AP.checked[DATA.zones[L2]], 'map ' + L2);
  G('transfers.length=0; Input.dir4=2'); frame(); G('Input.dir4=0');
  const l2Early = AP.items.some(i => DATA.items[i.item] && DATA.items[i.item][3] === 'Access: Level 2');
  ok('Level 2 locked: sent back', l2Early || (G('transfers.length') === 1 && G('transfers[0][0]') === 1),
     l2Early ? 'skipped: this seed put Access: Level 2 in a Level 1 check' : G('JSON.stringify(transfers)'));
  enter(1, 12, 10);
  await say(['!admin login test', '!admin /send Julien Access: Level 2']);
  await sleep(800);
  enter(L2, 3, 3);
  await sleep(400);
  ok('with Access: Level 2: zone check sent', !!AP.checked[DATA.zones[L2]]);
  G('transfers.length=0; Input.dir4=2'); frame(); G('Input.dir4=0');
  ok('with Access: Level 2: no bounce', G('transfers.length') === 0);
  G('$gamePlayer.x=4'); frame(); G('$gamePlayer.x=5'); frame();
  enter(L3, 3, 3);
  G('transfers.length=0; Input.dir4=2'); frame(); G('Input.dir4=0');
  ok('Level 3 still locked (one access per floor)', G('transfers.length') === 1 && G('transfers[0][0]') === L2, G('JSON.stringify(transfers)'));
  enter(140, 4, 4);
  G('transfers.length=0; Input.dir4=2'); frame(); G('Input.dir4=0');
  ok('ending sequence map never locked', G('transfers.length') === 0);
  // F7 panel text
  const sm = new ctx.Scene_Map(); sm.createDisplayObjects && sm.createDisplayObjects();
  const lines = vm.runInContext('ArchipelagoFH._internals ? null : null', ctx);
  console.log(results.map(r => r.join(' | ')).join('\n'));
  console.log(results.filter(r => r[0] === 'FAIL').length + ' failed of ' + results.length);
  process.exit(0);
})().catch(e => { console.log(results.map(r => r.join(' | ')).join('\n')); console.error(e); process.exit(1); });

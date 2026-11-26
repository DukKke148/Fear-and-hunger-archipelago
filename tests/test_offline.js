// randomize_keys + floor_access against a real server (started with --server_password test).
// usage: node test_keys_access.js <plugin dir> <port>
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const [pluginDir, port] = [process.argv[2], process.argv[3]];
const results = [];
const ok = (name, cond, extra) => results.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : extra]);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const www = process.argv[4] || fs.mkdtempSync(path.join(os.tmpdir(), 'fhoff-'));
if (!fs.existsSync(path.join(www, 'archipelago.json'))) fs.writeFileSync(path.join(www, 'archipelago.json'), JSON.stringify({ server: 'localhost:' + port, slot: 'Julien' }));
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
  function Scene_Boot(){} Scene_Boot.prototype.start=function(){}; function Scene_Title(){} Scene_Title.prototype.update=function(){}; Scene_Title.prototype.addChild=function(){};
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
  const phase = process.argv[5];
  new ctx.Scene_Boot().start();
  if (phase === 'online') {
    for (let i = 0; i < 50 && !AP.connected; i++) await sleep(100);
    await say(['!admin login test', '!admin /send Julien Rope']);
    await sleep(800);
    ok('online: cache file written', fs.existsSync(path.join(www, 'archipelago_cache.json')));
    const c = JSON.parse(fs.readFileSync(path.join(www, 'archipelago_cache.json')));
    ok('cache holds the rules and items', c.slotData.floor_access === 1 && c.items.length > 0, c.items.length + ' items');
  } else {
    await sleep(1500);
    ok('offline: not connected', !AP.connected);
    ok('offline: rules from the cache', AP.hasRules() && AP.slotData.floor_access === 1 && AP.items.length > 0);
    G('DataManager.setupNewGame()'); enter(73); enter(1, 10, 10);
    G('$gamePlayer.x=11'); frame(); G('$gamePlayer.x=12'); frame();
    const g = G('JSON.stringify(gained)');
    ok('offline: new run gives the received keys', /Rope/.test(g), g);
    enter(8, 3, 3);
    G('transfers.length=0; Input.dir4=2'); frame(); G('Input.dir4=0');
    ok('offline: locked part still sends you back', G('transfers.length') === 1, G('JSON.stringify(transfers)'));
    G('original.length=0; gained.length=0');
    enter(1, 12, 10);
    G('new Game_Interpreter(1, 9999, [20, 0, 0, 1]).command126()');
    ok('offline: original key still not given', G('original.length') === 0);
    const t = new ctx.Scene_Title(); t.update();
    ok('title screen shows the offline status', AP.offlineRules === true && t._apStatusText === AP.status);
  }
  console.log(results.map(r => r.join(' | ')).join('\n'));
  console.log(results.filter(r => r[0] === 'FAIL').length + ' failed of ' + results.length);
  process.exit(0);
})().catch(e => { console.log(results.map(r => r.join(' | ')).join('\n')); console.error(e); process.exit(1); });

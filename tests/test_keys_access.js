// randomize_keys + floor_access against a real server (started with --server_password test).
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
  ok('options on by default', AP.slotData.randomize_keys === 2 && AP.slotData.floor_access === 1);
  G('DataManager.setupNewGame()'); enter(73); enter(1, 10, 10);
  await sleep(400);
  ok('Part 1 always open: zone check', !!AP.checked[DATA.zones['1']]);
  // walk a bit on map 1: safe tiles are remembered
  G('$gamePlayer.x=11'); frame(); G('$gamePlayer.x=12'); frame();
  // vanilla Small key on the floor: check sent, no key
  G('original.length=0; gained.length=0');
  G('new Game_Interpreter(1, 9999, [20, 0, 0, 1]).command126()');
  await sleep(500);
  ok('original key spot sends its check', !!AP.checked[DATA.keys['20']]);
  ok('original key is not given', G('original.length') === 0);
  // go down to Part 2 (map 8, level 4) without access
  const z8 = DATA.zones['8'];
  enter(8, 3, 3);
  await sleep(300);
  const p2Early = AP.items.some(i => DATA.items[i.item] && DATA.items[i.item][3] === 'Access: Part 2');
  const skip = p2Early ? 'skipped: this seed put Access: Part 2 in a Part 1 check' : '';
  ok('locked part: no zone check', p2Early || !AP.checked[z8], skip);
  G('transfers.length=0; Input.dir4=0'); frame();
  ok('standing still in a locked part: nothing happens (cutscene safe)', G('transfers.length') === 0, skip);
  G('$gameMap.isEventRunning=function(){return true;}; Input.dir4=2'); frame();
  ok('event running: never interrupted', G('transfers.length') === 0);
  G('$gameMap.isEventRunning=function(){return false;}'); frame();
  ok('trying to move: sent back to the tile before', p2Early || G('JSON.stringify(transfers[0])') === '[1,11,10]', skip || G('JSON.stringify(transfers)'));
  G('Input.dir4=0');
  enter(1, 11, 10);
  // a fall straight into a deeper part (Part 1 -> Part 3: level 3 staircase) is caught the same way
  enter(1, 20, 20); G('$gamePlayer.x=21'); frame();
  enter(23, 2, 2);
  G('transfers.length=0; Input.dir4=4'); frame(); G('Input.dir4=0');
  const tier23 = DATA.mapTier['23'], accessName = { 2: 'Access: Part 2', 3: 'Access: Part 3', 4: "Access: Ma'habre", 5: 'Access: End' }[tier23];
  const fallEarly = AP.items.some(i => DATA.items[i.item] && DATA.items[i.item][3] === accessName);
  ok('fall that skips a part: sent back too', fallEarly || (G('transfers.length') === 1 && G('transfers[0][0]') === 1),
     fallEarly ? 'skipped: this seed put ' + accessName + ' in a Part 1 check' : G('JSON.stringify(transfers)'));
  // an ending sequence map is never locked
  enter(1, 11, 10);
  enter(140, 4, 4);
  G('transfers.length=0; Input.dir4=2'); frame(); G('Input.dir4=0');
  ok('ending sequence map (Next plane) never sends you back', G('transfers.length') === 0);
  enter(1, 11, 10);
  // the friend (admin) sends access and keys
  G('gained.length=0');
  await say(['!admin login test', '!admin /send Julien Access: Part 2', '!admin /send_multiple 2 Julien Small key', '!admin /send Julien Rope']);
  await sleep(800);
  const g = G('JSON.stringify(gained)');
  ok('received keys go straight into the inventory', /Small key",1.*Small key",1/.test(g) && /Rope/.test(g), g);
  enter(8, 3, 3);
  await sleep(400);
  ok('with Access: Part 2 the zone check is sent', !!AP.checked[z8]);
  G('transfers.length=0; Input.dir4=2'); frame(); G('Input.dir4=0');
  ok('with access: no bounce', G('transfers.length') === 0);
  // new run: keys again
  G('gained.length=0; DataManager.setupNewGame()'); enter(73); enter(1);
  const g2 = G('JSON.stringify(gained)');
  const smallReceived = AP.items.filter(i => i.item === 7460000000 + 1000 + 20).length;
  ok('new run: every received key given again', (g2.match(/Small key/g) || []).length === smallReceived && /Rope/.test(g2),
     smallReceived + ' Small keys received in total: ' + g2);
  console.log(results.map(r => r.join(' | ')).join('\n'));
  console.log(results.filter(r => r[0] === 'FAIL').length + ' failed of ' + results.length);
  process.exit(0);
})().catch(e => { console.log(results.map(r => r.join(' | ')).join('\n')); console.error(e); process.exit(1); });

// traps and DeathLink against a real server (trap_percentage: 0 so that only the test sends traps, death_link: true, --server_password test).
// usage: node test_keys_access.js <plugin dir> <port>
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const [pluginDir, port] = [process.argv[2], process.argv[3]];
const results = [];
const ok = (name, cond, extra) => results.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : extra]);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const www = fs.mkdtempSync(path.join(os.tmpdir(), 'fhkeys-'));
fs.writeFileSync(path.join(www, 'archipelago.json'), JSON.stringify({ server: 'localhost:' + port, slot: 'Julien', debug: true }));
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
  var BattleManager={processVictory:function(){}};
  function Game_Action(){} Game_Action.prototype.itemEffectLearnSkill=function(){}; function Game_Switches(){this._data=[];} Game_Switches.prototype.setValue=function(i,v){this._data[i]=v;}; Game_Switches.prototype.value=function(i){return !!this._data[i];};
  function Scene_Battle(){} Scene_Battle.prototype.update=function(){};
  var gameovers=0; function Scene_Gameover(){} Scene_Gameover.prototype.start=function(){};
  var SceneManager={_scene:null, goto:function(c){ if(c===Scene_Gameover){gameovers++; this._scene=new Scene_Gameover(); this._scene.start();} }};
  var DataManager={setupNewGame:function(){ newGame(); }};
  var $dataItems=${names('Items.json')}, $dataWeapons=${names('Weapons.json')}, $dataArmors=${names('Armors.json')}, $dataStates=${names('States.json')};
  var gained=[], lost=[], transfers=[], $gameSystem, $gameParty, $gameMap, $gameMessage={isBusy:function(){return false;}}, $gamePlayer;
  var actor={states:[], exp:120, mp:60, addState:function(s){this.states.push(s);}, isStateAffected:function(s){return this.states.indexOf(s)>=0;},
    currentExp:function(){return this.exp;}, changeExp:function(e){this.exp=e;}, setMp:function(m){this.mp=m;}, recoverAll:function(){this.states=[];this.mp=99;}, isAlive:function(){return true;}, name:function(){return 'Cahara';}};
  var mate={exp:120, currentExp:function(){return this.exp;}, changeExp:function(e){this.exp=e;}, isAlive:function(){return true;}, name:function(){return 'Enki';}};
  var dead={exp:120, currentExp:function(){return this.exp;}, changeExp:function(e){this.exp=e;}, isAlive:function(){return false;}, name:function(){return 'Ghost';}};
  var sw={}, vars={398:30}, $gameSwitches={value:function(i){return !!sw[i];}, setValue:function(i,v){sw[i]=v;}}, $gameVariables={value:function(i){return vars[i]||0;}, setValue:function(i,v){vars[i]=v;}};
  function newGame(){
    $gameSystem={}; $gameParty={gainItem:function(o,n){gained.push([o.name,n]);}, members:function(){return [actor, mate, dead];}, leader:function(){return actor;},
      inBattle:function(){return false;}, numItems:function(o){return o.name==='Torch'?2:0;}, loseItem:function(o,n){lost.push([o.name,n]);}};
    $gameMap={_id:73, mapId:function(){return this._id;}, isEventRunning:function(){return false;}};
    $gamePlayer={x:5,y:5,_d:2,_moving:false,direction:function(){return this._d;},isMoving:function(){return this._moving;},
      isTransferring:function(){return false;}, reserveTransfer:function(m,x,y,d){transfers.push([m,x,y]);}};
  }
`, ctx);
vm.runInContext(fs.readFileSync(path.join(pluginDir, 'ArchipelagoFH_Data.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(pluginDir, 'ArchipelagoFH.js'), 'utf8'), ctx);
const AP = ctx.ArchipelagoFH, DATA = ctx.APFH_DATA, G = c => vm.runInContext(c, ctx);
const { Traps } = AP._internals;
const enter = (m, x, y) => { G(`$gameMap._id=${m}; $gamePlayer.x=${x||5}; $gamePlayer.y=${y||5};`); const sc = new ctx.Scene_Map(); G('0'); ctx.SceneManager._scene = sc; sc.start(); };
const frames = n => { for (let i = 0; i < n; i++) { const sc = ctx.SceneManager._scene; if (sc && sc.update) sc.update(); } };
const say = texts => new Promise(resolve => {
  const ws = new WebSocket('ws://localhost:' + port);
  ws.onmessage = e => JSON.parse(e.data).forEach(p => {
    if (p.cmd === 'RoomInfo') ws.send(JSON.stringify([{ cmd: 'Connect', game: '', name: 'Julien', password: 'test', uuid: 'tc',
      version: { major: 0, minor: 6, build: 0, class: 'Version' }, items_handling: 0, tags: ['TextOnly'] }]));
    if (p.cmd === 'Connected') { ws.send(JSON.stringify(texts.map(t => ({ cmd: 'Say', text: t })))); setTimeout(() => { ws.close(); resolve(); }, 1200); }
  });
});
const friend = () => new Promise(resolve => {
  const ws = new WebSocket('ws://localhost:' + port), got = [];
  ws.onmessage = e => JSON.parse(e.data).forEach(p => {
    if (p.cmd === 'RoomInfo') ws.send(JSON.stringify([{ cmd: 'Connect', game: 'ChecksFinder', name: 'Ami', password: '', uuid: 'ami',
      version: { major: 0, minor: 6, build: 0, class: 'Version' }, items_handling: 7, tags: ['DeathLink'] }]));
    if (p.cmd === 'Connected') resolve({ ws, got });
    if (p.cmd === 'Bounced') got.push(p);
  });
});
(async () => {
  new ctx.Scene_Boot().start();
  for (let i = 0; i < 50 && !AP.connected; i++) await sleep(100);
  ok('death_link in slot data', AP.slotData.death_link === true);
  const trapIds = Object.keys(DATA.items).filter(id => DATA.items[id][0] === 't');
  ok('8 trap items in the data (no fracture)', trapIds.length === 8 && !trapIds.some(id => DATA.items[id][3] === 'Trap: Fracture'), trapIds.length);
  // a trap received before the run starts waits
  await say(['!admin login test', '!admin /send Julien Trap: Bleeding']);
  await sleep(700);
  G('DataManager.setupNewGame()'); enter(73); frames(5);
  ok('no trap during the intro (no run yet)', G('actor.states.length') === 0);
  enter(1, 10, 10); G('$gameMap.isEventRunning=function(){return true;}'); frames(5);
  ok('no trap while an event runs', G('actor.states.length') === 0);
  G('$gameMap.isEventRunning=function(){return false;}'); frames(2);
  ok('bleeding trap applied once free', G('JSON.stringify(actor.states)') === '[5]', G('JSON.stringify(actor.states)'));
  frames(400);
  ok('a trap is applied only once', G('actor.states.length') === 1);
  await say(['!admin login test', '!admin /send Julien Trap: Hunger', '!admin /send Julien Trap: Fear',
             '!admin /send Julien Trap: Phobia', '!admin /send Julien Trap: Torch out']);
  await sleep(700);
  frames(2);
  const hung = G('JSON.stringify([actor.exp, mate.exp, dead.exp])');
  ok('hunger trap: one living member loses 30 hunger', hung === '[90,120,120]' || hung === '[120,90,120]', hung);
  frames(10);
  ok('cooldown between traps', G('actor.mp') === 60);
  frames(200);
  ok('fear trap: mind (MP) down by 15', G('actor.mp') === 45, G('actor.mp'));
  frames(200);
  ok('phobia trap: a phobia state', [65, 66, 68, 69, 70].includes(G('actor.states[1]')), G('actor.states[1]'));
  frames(200);
  ok('torch out (no lit torch): loses a Torch', G('JSON.stringify(lost)') === '[["Torch",1]]', G('JSON.stringify(lost)'));
  G('sw[3151]=true; vars[398]=30');
  await say(['!admin login test', '!admin /send Julien Trap: Torch out']); await sleep(700); frames(200);
  ok('torch out (lit): torch timer set to 0', G('vars[398]') === 0);
  ok('trap index stored (no replay after restart)', Traps.done() === AP.items.length, Traps.done() + '/' + AP.items.length);
  // test commands from www/archipelago_commands.txt
  const cmdFile = path.join(www, 'archipelago_commands.txt');
  fs.writeFileSync(cmdFile, '# test\ntrap Poison\ngoto Level 5\nswitch 77 on\nvar 12 34\nwhere\njs 1 + 2\nbogus\n');
  G('transfers.length = 0');
  frames(61);
  ok('command file: trap applied', G('actor.states.includes(17)'));
  ok('command file: goto a floor uses its main map', G('JSON.stringify(transfers[0])') === JSON.stringify([11].concat(DATA.mapEntry['11'])), G('JSON.stringify(transfers)'));
  ok('command file: switch and variable', G('sw[77]') === true && G('vars[12]') === 34);
  ok('command file emptied after reading', !/trap/.test(fs.readFileSync(cmdFile, 'utf8')));
  const logText = fs.readFileSync(path.join(www, 'archipelago_log.txt'), 'utf8');
  ok('command file: js and where answered in the log', /js -> 3/.test(logText) && /\[test\] map /.test(logText) && /unknown command: bogus/.test(logText));
  fs.writeFileSync(cmdFile, 'heal\ngoto level8_a 3 4\n'); G('transfers.length = 0');
  frames(61);
  ok('command file: heal and goto a map by name with coordinates', G('actor.states.length') === 0 && G('JSON.stringify(transfers[0])') === '[93,3,4]', G('JSON.stringify(transfers)'));
  // DeathLink
  const f = await friend(); await sleep(300);
  f.ws.send(JSON.stringify([{ cmd: 'Bounce', tags: ['DeathLink'], data: { time: Date.now() / 1000, source: 'Friend', cause: 'Friend died.' } }]));
  await sleep(800); frames(2);
  ok('DeathLink received: game over', G('gameovers') === 1);
  ok('our game over from a DeathLink is not sent back', !f.got.some(p => p.data && p.data.source === 'Julien'), f.got.length);
  await sleep(11000); // DeathLink spam guard
  enter(1, 10, 10);
  G('new Scene_Gameover().start()');
  await sleep(800);
  ok('our own game over sends a DeathLink', f.got.some(p => p.data && p.data.source === 'Julien'), JSON.stringify(f.got.map(p => p.data && p.data.source)));
  console.log(results.map(r => r.join(' | ')).join('\n'));
  console.log(results.filter(r => r[0] === 'FAIL').length + ' failed of ' + results.length);
  process.exit(0);
})().catch(e => { console.log(results.map(r => r.join(' | ')).join('\n')); console.error(e); process.exit(1); });

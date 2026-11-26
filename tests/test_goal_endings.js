// Goal with required_endings ["B", "S"]: ending B alone is not enough, B + S completes the goal,
// then the plugin asks the server for !release and !collect.
// usage: node test_goal_endings.js <plugin dir> <port>
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const [pluginDir, port] = [process.argv[2], process.argv[3]];
const results = [];
const ok = (name, cond, extra) => results.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : extra]);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const www = fs.mkdtempSync(path.join(os.tmpdir(), 'fhgoal-'));
fs.writeFileSync(path.join(www, 'archipelago.json'), JSON.stringify({ server: 'localhost:' + port, slot: 'Julien' }));
const ctx = {
  console: { log() {}, warn() {}, error: console.error }, setTimeout, WebSocket, JSON, Math, Date, Object, Array,
  String, Number, process: { mainModule: { filename: path.join(www, 'index.html') } }, require: m => require(m),
  localStorage: { getItem() { return null; }, setItem() {} }, Graphics: { boxWidth: 816, boxHeight: 624 },
  Input: { keyMapper: {}, isTriggered: () => false }, document: { addEventListener() {} },
};
ctx.window = ctx; ctx.addEventListener = () => {};
vm.createContext(ctx);
vm.runInContext(`
  function Bitmap(){} Bitmap.prototype.clear=function(){}; Bitmap.prototype.fillRect=function(){}; Bitmap.prototype.drawText=function(){};
  function Sprite(){} Sprite.prototype.initialize=function(){}; Sprite.prototype.update=function(){};
  function Scene_Map(){} Scene_Map.prototype.createDisplayObjects=function(){}; Scene_Map.prototype.addChild=function(){};
  Scene_Map.prototype.update=function(){}; Scene_Map.prototype.start=function(){};
  function Scene_Boot(){} Scene_Boot.prototype.start=function(){}; function Scene_Title(){} Scene_Title.prototype.update=function(){};
  function Game_Interpreter(){} [117,301,126,127,128].forEach(function(c){Game_Interpreter.prototype['command'+c]=function(){return true;};});
  var BattleManager={processVictory:function(){}};
  function Game_Switches(){ this._v={}; } Game_Switches.prototype.setValue=function(i,v){ this._v[i]=v; }; Game_Switches.prototype.value=function(i){ return !!this._v[i]; };
  function Game_Interpreter(p){ this._params=p; } Game_Interpreter.prototype.command356=function(){ return 'orig'; }; Game_Interpreter.prototype.command231=function(){ return 'orig'; };
  var DataManager={setupNewGame:function(){}};
  var $gameSystem={}, $gameParty={gainItem:function(){}, members:function(){return [];}},
      $gameMap={_id:1, mapId:function(){return this._id;}}, $gameSwitches=new Game_Switches(), $dataItems=[], $dataWeapons=[], $dataArmors=[];
`, ctx);
vm.runInContext(fs.readFileSync(path.join(pluginDir, 'ArchipelagoFH_Data.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(pluginDir, 'ArchipelagoFH.js'), 'utf8'), ctx);
const AP = ctx.ArchipelagoFH, DATA = ctx.APFH_DATA;
const printed = [], sent = [];
const h = AP.handle.bind(AP), s = AP.send.bind(AP);
AP.handle = p => { if (p.cmd === 'PrintJSON') printed.push(p); return h(p); };
AP.send = packets => { sent.push(...packets); return s(packets); };
(async () => {
  new ctx.Scene_Boot().start();
  for (let i = 0; i < 50 && !AP.connected; i++) await sleep(100);
  ok('connected, slot data has required endings', JSON.stringify(AP.slotData.required_endings) === '["B","S"]',
     JSON.stringify(AP.slotData.required_endings));
  const G = c => vm.runInContext(c, ctx);
  const pic = name => G(`new Game_Interpreter([1, '${name}']).command231()`);
  const id = n => Number(Object.keys(DATA.names).find(k => DATA.names[k] === n));
  const mine = () => AP._internals.Game.state().checked; // checks the plugin made itself (not the !release ones)
  // the ending switches alone do nothing any more: only the final cutscene counts
  G('$gameSwitches.setValue(1891, true)');
  await sleep(500);
  ok('ending switch alone sends nothing', !mine().includes(id('Ending B')));
  pic('ending_B'); // Ending B cutscene, but not on the ending map
  await sleep(300);
  ok('ending picture outside the ending map: nothing', !mine().includes(id('Ending B')));
  G('$gameMap._id = 86');
  const r231 = pic('ending_B');
  await sleep(800);
  ok('Ending B check sent from its cutscene', mine().includes(id('Ending B')) && r231 === 'orig');
  ok('Ending B alone does not complete the goal', !printed.some(p => p.type === 'Goal'));
  pic('ending_D');
  await sleep(600);
  ok('another ending (D) does not complete the goal either', mine().includes(id('Ending D')) && !printed.some(p => p.type === 'Goal'));
  pic('ending_A'); // Ending E: "You escaped the dungeons"
  await sleep(500);
  ok('Ending E check sent from its cutscene', mine().includes(id('Ending E')));
  ok('Ending E does not complete a B + S goal', !printed.some(p => p.type === 'Goal'));
  G('new Game_Interpreter(["steamworks activateachievement ENDING_S_OUTLANDER"]).command356()'); // backup path
  await sleep(400);
  ok('Ending S as Outlander from its achievement: check only, no goal',
     mine().includes(id('Ending S as Outlander')) && !mine().includes(id('Ending S')) && !printed.some(p => p.type === 'Goal'));
  pic('blackscreen');
  ok('other pictures ignored', mine().length === 4, mine().length);
  pic('ending_S_happy_ending'); // Ending S as the Mercenary
  await sleep(2500);
  ok('S cutscene: Ending S and Ending S as Mercenary', mine().includes(id('Ending S')) && mine().includes(id('Ending S as Mercenary')));
  ok('B + S completes the goal', printed.some(p => p.type === 'Goal'));
  ok('plugin asked for !release and !collect', sent.some(p => p.cmd === 'Say' && p.text === '!release') &&
     sent.some(p => p.cmd === 'Say' && p.text === '!collect'));
  ok('server released remaining items', printed.some(p => p.type === 'Release'),
     printed.filter(p => ['Release', 'Collect', 'Goal'].includes(p.type)).map(p => p.type).join(', '));
  console.log(results.map(r => r.join(' | ')).join('\n'));
  console.log(results.filter(r => r[0] === 'FAIL').length + ' failed of ' + results.length);
  process.exit(0);
})().catch(e => { console.log(results.map(r => r.join(' | ')).join('\n')); console.error(e); process.exit(1); });

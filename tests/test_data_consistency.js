// Checks that need no file of the game, so they can run anywhere (GitHub Actions included):
// the plugin loads, and its data matches the apworld's (same data version, same checks, same items).
// usage: node test_data_consistency.js <plugin dir> <fh_data.json of the apworld>
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const [pluginDir, dataPath] = process.argv.slice(2);
const results = [];
const ok = (name, cond, extra) => results.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : extra]);

const ctx = {
  console: { log() {}, warn() {}, error() {} }, setTimeout, JSON, Math, Date, Object, Array, String, Number,
  localStorage: { getItem: () => null, setItem() {} }, document: { addEventListener() {} },
  Graphics: { boxWidth: 816, boxHeight: 624 }, Input: { keyMapper: {}, isTriggered: () => false },
};
ctx.window = ctx; ctx.addEventListener = () => {};
vm.createContext(ctx);
// the smallest engine the plugin needs to load (it only wraps these, nothing runs before a game starts)
vm.runInContext(`
  function F() {} F.prototype = {};
  var Bitmap = F, Sprite = function () {}; Sprite.prototype = { initialize: function () {}, update: function () {} };
  var Scene_Map = function () {}, Scene_Boot = function () {}, Scene_Title = function () {}, Scene_Battle = function () {};
  var Scene_Gameover = function () {}, Scene_Synthesis = function () {}, Window_SynthesisList = function () {};
  var Game_Interpreter = function () {}, Game_Action = function () {}, Game_Switches = function () {}, Game_Party = function () {};
  [Scene_Map, Scene_Boot, Scene_Title, Scene_Battle, Scene_Gameover, Scene_Synthesis, Window_SynthesisList,
   Game_Interpreter, Game_Action, Game_Switches, Game_Party].forEach(function (c) { c.prototype = {}; });
  [117, 122, 126, 127, 128, 301, 318].forEach(function (c) { Game_Interpreter.prototype['command' + c] = function () { return true; }; });
  var BattleManager = { processVictory: function () {} }, DataManager = { setupNewGame: function () {} };
  var SceneManager = { goto: function () {} };
`, ctx);
let loadError = null;
try {
  vm.runInContext(fs.readFileSync(path.join(pluginDir, 'ArchipelagoFH_Data.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(pluginDir, 'ArchipelagoFH.js'), 'utf8'), ctx);
} catch (e) { loadError = e; }
ok('the plugin loads', !loadError && !!ctx.ArchipelagoFH, loadError && loadError.stack);
const P = ctx.APFH_DATA, D = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
ok('same data version', P && P.version === D.data_version, P && [P.version, D.data_version]);
const apLocs = new Set(D.locations.map(l => String(l.id))), apItems = new Set(D.items.map(i => String(i.id)));
const plLocs = Object.keys(P.names).filter(id => !apItems.has(id));
ok('every check of the apworld is known to the plugin', [...apLocs].every(id => P.names[id]),
   [...apLocs].filter(id => !P.names[id]).slice(0, 5));
ok('the plugin knows no check the apworld does not have', plLocs.every(id => apLocs.has(id)),
   plLocs.filter(id => !apLocs.has(id)).slice(0, 5));
ok('same items', Object.keys(P.items).length === apItems.size && Object.keys(P.items).every(id => apItems.has(id)));
ok('names match', D.locations.every(l => P.names[l.id] === l.name),
   D.locations.filter(l => P.names[l.id] !== l.name).slice(0, 3).map(l => l.name));
const creatures = D.locations.filter(l => l.type === 'bestiary' || l.type === 'boss').map(l => l.id);
const fought = new Set([].concat(...Object.values(P.troops).map(t => t[1])));
ok('every creature check (and genocide target) has a fight', creatures.every(id => fought.has(id)),
   creatures.filter(id => !fought.has(id)));
const version = (fs.readFileSync(path.join(pluginDir, 'ArchipelagoFH.js'), 'utf8').match(/@plugindesc v([\d.]+)/) || [])[1];
const world = path.join(path.dirname(dataPath), '..', 'archipelago.json');
if (fs.existsSync(world)) {
  ok('plugin and apworld have the same version', JSON.parse(fs.readFileSync(world, 'utf8')).world_version === version, version);
}
console.log(results.map(r => r.join(' | ')).join('\n'));
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(failed + ' failed of ' + results.length);
process.exit(failed ? 1 : 0);

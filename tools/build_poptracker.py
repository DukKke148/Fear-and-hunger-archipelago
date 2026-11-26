"""Builds the PopTracker pack for Fear & Hunger (Archipelago v0.2.0) from the apworld data.

usage: python tools/build_poptracker.py <fh_data.json> <apworld __init__.py> <out dir> [<icons dir>]

<icons dir> (optional) holds PNGs extracted from your own copy of the game (tools/extract_icons.py): without it,
the pack uses plain badges, so it can be shared without any of the game's art.

The pack mirrors the apworld logic (regions per part or per floor, gear thresholds, keys, Explosive vial, recipes):
the tables are generated here from the same data, and the rules are in scripts/logic.lua.
"""
import json
import os
import re
import shutil
import sys

from PIL import Image, ImageDraw, ImageFont

DATA_PATH, INIT_PATH, OUT = sys.argv[1:4]
ICONS = sys.argv[4] if len(sys.argv) > 4 else None
DATA = json.load(open(DATA_PATH, encoding='utf-8'))
VERSION = '0.2.0'

# ---------------------------------------------------------------------------- constants read from the apworld
init_src = open(INIT_PATH, encoding='utf-8').read()
DIFF = {'relaxed': 0, 'normal': 1, 'strict': 2}
def _dict_after(name):
    body = init_src[init_src.index(name + ' = {'):]
    body = body[:body.index('\n}\n') + 2] if '\n}\n' in body[:600] else body[:body.index('}') + 1]
    return body
TIER_GEAR = {}
for diff, inner in re.findall(r'LogicDifficulty\.option_(\w+): \{([^}]*)\}', _dict_after('TIER_GEAR')):
    TIER_GEAR[DIFF[diff]] = {int(a): int(b) for a, b in re.findall(r'(\d+): (\d+)', inner)}
BOSS_EXTRA = {DIFF[d]: int(n) for d, n in re.findall(r'LogicDifficulty\.option_(\w+): (\d+)',
                                                     _dict_after('BOSS_EXTRA'))}
assert len(TIER_GEAR) == 3 and len(BOSS_EXTRA) == 3, (TIER_GEAR, BOSS_EXTRA)

ITEMS = {i['name']: i for i in DATA['items']}
BY_ID = {i['id']: i for i in DATA['items']}
GEAR = sorted(n for n, i in ITEMS.items() if i['classification'] == 'progression' and i['cat'] == 'gear')
KEYS = sorted((i for i in DATA['items'] if i['cat'] == 'key'), key=lambda i: i['db_id'])
SMALL_KEY = 20
ACCESS_PART = {i['db_id']: i['name'] for i in DATA['items'] if i['cat'] == 'access'}      # tier -> name
ACCESS_FLOOR = {int(f): BY_ID[i]['name'] for f, i in DATA['floor_items'].items()}         # floor -> name
LOCS = DATA['locations']
TROOPS = {t['id']: t for t in DATA['troops']}


def code(text):
    return re.sub(r'[^a-z0-9]+', '_', text.lower()).strip('_')


def lua(v, ind=''):
    """Python value -> Lua literal."""
    if v is None:
        return 'nil'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, str):
        return json.dumps(v, ensure_ascii=False)
    if isinstance(v, (list, tuple)):
        return '{' + ', '.join(lua(x, ind) for x in v) + '}'
    if isinstance(v, dict):
        parts = []
        for k, x in v.items():
            key = f'[{k}]' if isinstance(k, int) else (k if re.match(r'^[A-Za-z_]\w*$', k) else f'[{json.dumps(k)}]')
            parts.append(f'{key} = {lua(x, ind)}')
        return '{' + ', '.join(parts) + '}'
    raise TypeError(v)


if os.path.exists(OUT):
    shutil.rmtree(OUT)
for d in ('items', 'layouts', 'locations', 'maps', 'scripts', 'images/items', 'images/maps'):
    os.makedirs(os.path.join(OUT, d), exist_ok=True)

# ---------------------------------------------------------------------------- icons
try:
    FONT = ImageFont.truetype('DejaVuSans-Bold.ttf', 13)
    FONT_BIG = ImageFont.truetype('DejaVuSans-Bold.ttf', 15)
    FONT_SMALL = ImageFont.truetype('DejaVuSans.ttf', 12)
except OSError:
    FONT = FONT_BIG = FONT_SMALL = ImageFont.load_default()
COLORS = {'key': (176, 141, 60), 'access': (60, 120, 170), 'skill': (120, 70, 160), 'boss': (150, 40, 40),
          'ending': (40, 40, 40), 'cook': (180, 110, 40), 'craft': (60, 130, 90), 'recruit': (90, 90, 140),
          'misc': (90, 90, 90), 'beast': (110, 60, 50)}


def badge(path, text, cat):
    """A plain 32x32 icon: coloured rounded square with a short label."""
    img = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    dr.rounded_rectangle((1, 1, 30, 30), 6, fill=COLORS[cat] + (255,), outline=(230, 230, 230, 255))
    lines = text.split('\n')
    font = FONT if max(len(x) for x in lines) <= 3 else FONT_SMALL
    h = sum(dr.textbbox((0, 0), x, font=font)[3] for x in lines)
    y = (32 - h) / 2 - 1
    for x in lines:
        w = dr.textbbox((0, 0), x, font=font)[2]
        dr.text(((32 - w) / 2, y), x, font=font, fill=(255, 255, 255, 255))
        y += dr.textbbox((0, 0), x, font=font)[3]
    img.save(path)


def icon(name, text, cat, game_icon=None):
    """images/items/<name>.png: the game's icon if extracted, else a badge. Returns the pack path."""
    rel = f'images/items/{name}.png'
    src = os.path.join(ICONS, game_icon) if ICONS and game_icon else None
    if src and os.path.exists(src):
        shutil.copy(src, os.path.join(OUT, rel))
    else:
        badge(os.path.join(OUT, rel), text, cat)
    return rel


def short(name, n=3):
    words = [w for w in re.split(r"[\s'#-]+", name) if w and w.lower() not in ('of', 'the', 'a')]
    if len(words) == 1:
        return words[0][:n].capitalize()
    return ''.join(w[0].upper() for w in words)[:n]


# ---------------------------------------------------------------------------- display items
items = []         # PopTracker items
grid = {}          # group -> rows of codes
loc_grid = {}      # AP location id -> [code, stage or None]
item_grid = {}     # AP item name -> [code, kind]


def toggle(name, code_, img):
    items.append({'name': name, 'type': 'toggle', 'img': img, 'codes': code_})


# keys
row = []
for k in KEYS:
    c = f"key_{k['db_id']}"
    img = icon(c, short(k['name']), 'key', f"item_{k['db_id']}.png")
    if k['db_id'] == SMALL_KEY:
        items.append({'name': k['name'], 'type': 'consumable', 'img': img, 'codes': c, 'max_quantity': 99})
    else:
        toggle(k['name'], c, img)
    row.append(c)
    item_grid[k['name']] = [c, 'key']
grid['keys'] = [row[i:i + 8] for i in range(0, len(row), 8)]
# access items
row = []
for n in list(ACCESS_PART.values()) + [n for f, n in sorted(ACCESS_FLOOR.items()) if n not in ACCESS_PART.values()]:
    c = 'access_' + code(n.replace('Access: ', ''))
    label = n.replace('Access: ', '').replace('Level ', 'L').replace('Part ', 'P').replace("Ma'habre", 'Mah') \
        .replace('Ancient city', 'AC')
    toggle(n, c, icon(c, label, 'access'))
    row.append(c)
    item_grid[n] = [c, 'access']
grid['access'] = [row[:4], row[4:]]
# useful unlocks shown: Explosive vial, priced weapons, gear count
c = 'explosive_vial'
toggle('Explosive vial (unlocked)', c, icon(c, 'Exp\nvial', 'misc', 'item_79.png'))
item_grid['Explosive vial'] = [c, 'unlock']
misc = [c]
for i in DATA['items']:
    if i.get('priced'):
        c = f"priced_{i['db_id']}"
        toggle(i['name'] + ' (unlocked)', c, icon(c, short(i['name']), 'misc', f"weapon_{i['db_id']}.png"))
        item_grid[i['name']] = [c, 'unlock']
        misc.append(c)
items.append({'name': 'Weapons and armors unlocked', 'type': 'consumable', 'codes': 'gear', 'max_quantity': 999,
              'img': icon('gear', 'Gear', 'misc', 'gear.png')})
misc.append('gear')
grid['misc'] = [misc]
# hidden: bumped on every received item, so the logic is evaluated again
items.append({'name': 'refresh', 'type': 'consumable', 'codes': 'ap_refresh', 'max_quantity': 999999,
              'img': icon('refresh', '', 'misc')})

# skills: off -> scroll unlocked -> learned
row = []
for l in (x for x in LOCS if x['type'] == 'skill'):
    c = f"skill_{l['skill']}"
    name = l['name'][6:]
    img = icon(c, short(name), 'skill', f"skill_{l['skill']}.png")
    # three explicit stages, so the name shown on hover always matches the state
    items.append({'name': name, 'type': 'progressive', 'allow_disabled': False, 'loop': False, 'stages': [
        {'name': name + ' (scroll not unlocked)', 'img': img, 'img_mods': '@disabled', 'codes': f"locked_{l['skill']}",
         'inherit_codes': False},
        {'name': name + ' (scroll unlocked)', 'img': img, 'img_mods': 'dim', 'codes': f"scroll_{l['skill']}",
         'inherit_codes': False},
        {'name': name + ' (learned)', 'img': img, 'codes': c, 'inherit_codes': False}]})
    row.append(c)
    loc_grid[l['id']] = [c, 2]
    item_grid[BY_ID[l['scroll']]['name']] = [c, 'scroll']
grid['skills'] = [row[i:i + 10] for i in range(0, len(row), 10)]


def check_row(types, cat, label_of, icon_of=lambda l: None, per_row=10, pred=lambda l: True):
    row = []
    for l in (x for x in LOCS if x['type'] in types and pred(x)):
        c = f"done_{l['id']}"
        name = label_of(l)
        toggle(name, c, icon(c, short(name) if cat != 'ending' else name.split()[-1][:3], cat, icon_of(l)))
        row.append(c)
        loc_grid[l['id']] = [c, None]
    return [row[i:i + per_row] for i in range(0, len(row), per_row)]


grid['bosses'] = check_row(('boss',), 'boss', lambda l: l['creature'], lambda l: f"beast_{code(l['creature'])}.png",
                           per_row=10)
grid['bestiary'] = check_row(('bestiary',), 'beast', lambda l: l['creature'],
                             lambda l: f"beast_{code(l['creature'])}.png", per_row=10)
grid['endings'] = check_row(('ending', 'ending_extra'), 'ending', lambda l: l['name'],
                            pred=lambda l: l['zone'] == 'Endings')
S_LABEL = {'Ending S': 'S', 'Ending S as Mercenary': 'Merc', 'Ending S as Knight': 'Kni',
           'Ending S as Dark Priest': 'DP', 'Ending S as Outlander': 'Out'}
row = []
for l in (x for x in LOCS if x.get('zone') == 'S endings'):
    c = f"done_{l['id']}"
    toggle(l['name'], c, icon(c, S_LABEL.get(l['name'], 'S'), 'ending'))
    row.append(c)
    loc_grid[l['id']] = [c, None]
grid['s_endings'] = [row]
grid['recruits'] = check_row(('recruit', 'marriage'), 'recruit', lambda l: l['name'].replace('Recruit ', ''),
                             lambda l: f"actor_{l['actor']}.png")
grid['cooking'] = check_row(('cook',), 'cook', lambda l: l['name'][5:],
                            lambda l: f"{'item' if l['result'][0] == 'i' else 'armor'}_{l['result'][1]}.png")
grid['crafting'] = check_row(('craft',), 'craft', lambda l: l['name'][6:],
                             lambda l: f"{ {'i': 'item', 'w': 'weapon', 'a': 'armor'}[l['result'][0]] }_{l['result'][1]}.png")

json.dump(items, open(os.path.join(OUT, 'items/items.json'), 'w'), indent=1)

# ---------------------------------------------------------------------------- boards (one "map" per part)
TABS = [('Part 1', [1, 2, 3]), ('Part 2', [4, 5, 6]), ('Part 3', [7, 8]), ("Ma'habre", [9]), ('End', [10, 11, 12]),
        ('Other', [])]
FLOOR_NAMES = {int(k): v for k, v in DATA['floors'].items()}
CATEGORY_ZONES = ['Skills', 'Cooking', 'Crafting', 'Endings', 'S endings', 'Marriage', 'Roaming']
zone_checks = {}
for l in LOCS:
    zone_checks.setdefault(l['zone'], []).append(l)
zone_floor = {}
for z, ls in zone_checks.items():
    if z in CATEGORY_ZONES:
        continue
    entry = [l for l in ls if l['type'] == 'zone']
    zone_floor[z] = (entry or ls)[0]['floor'] if entry else min(l['floor'] for l in ls)

BOX_W, BOX_H, GAP, HEAD, PAD = 250, 34, 8, 40, 14
locations = []
maps = []
for tab, floors in TABS:
    cols = []
    for f in floors:   # long floors wrap onto a second column
        zs = sorted(z for z, fl in zone_floor.items() if fl == f)
        for i in range(0, max(len(zs), 1), 12):
            cols.append((FLOOR_NAMES[f] + (' (more)' if i else ''), zs[i:i + 12]))
    if not floors:
        cols = [('Character', CATEGORY_ZONES[:3]), ('Endings', CATEGORY_ZONES[3:6]),
                ('Anywhere (roaming)', CATEGORY_ZONES[6:])]
    rows = max(len(zs) for _, zs in cols)
    W = PAD + len(cols) * (BOX_W + PAD)
    H = HEAD + PAD + rows * (BOX_H + GAP) + PAD
    img = Image.new('RGB', (W, H), (24, 22, 26))
    dr = ImageDraw.Draw(img)
    for ci, (title, zones) in enumerate(cols):
        x0 = PAD + ci * (BOX_W + PAD)
        dr.text((x0 + 4, 12), title, font=FONT_BIG, fill=(235, 220, 190))
        for ri, z in enumerate(zones):
            y0 = HEAD + PAD + ri * (BOX_H + GAP)
            dr.rounded_rectangle((x0, y0, x0 + BOX_W, y0 + BOX_H), 5, fill=(46, 42, 48), outline=(90, 84, 92))
            label = z
            for f in FLOOR_NAMES.values():  # "Level 3 - Prisons" -> "Prisons" under the "Level 3" header
                if label.startswith(f + ' - ') and title.startswith(f):
                    label = label[len(f) + 3:]
            n = len(zone_checks[z])
            dr.text((x0 + 40, y0 + 9), f'{label}  ({n})', font=FONT, fill=(225, 225, 225))
            sections = [{'name': l['name'], 'access_rules': [f"$can|{l['id']}"],
                         'visibility_rules': [f"$exists|{l['id']}"]} for l in zone_checks[z]]
            locations.append({'name': z, 'sections': sections,
                              'map_locations': [{'map': tab, 'x': x0 + 18, 'y': y0 + BOX_H // 2}]})
    fname = f'images/maps/{code(tab)}.png'
    img.save(os.path.join(OUT, fname))
    maps.append({'name': tab, 'location_size': 22, 'location_border_thickness': 2, 'img': fname})
json.dump(maps, open(os.path.join(OUT, 'maps/maps.json'), 'w'), indent=1)
json.dump(locations, open(os.path.join(OUT, 'locations/locations.json'), 'w'), indent=1, ensure_ascii=False)
placed = {s['name'] for loc in locations for s in loc['sections']}
assert placed == {l['name'] for l in LOCS}, {l['name'] for l in LOCS} - placed
SECTION = {l['id']: f"@{l['zone']}/{l['name']}" for l in LOCS}

# ---------------------------------------------------------------------------- layout
def group(header, rows, size=32):
    return {'type': 'group', 'header': header, 'content': {'type': 'itemgrid', 'item_margin': '2,2',
                                                           'item_size': f'{size},{size}', 'h_alignment': 'left',
                                                           'rows': rows}}


column = lambda groups: {'type': 'array', 'orientation': 'vertical', 'margin': '0,0', 'content': groups}
progress = {'type': 'array', 'orientation': 'horizontal', 'margin': '4,4', 'content': [
    column([group('Key items', grid['keys']), group('Access', grid['access']),
            group('Explosive vial, priced weapons, gear', grid['misc']),
            group('Skills (dim: scroll unlocked, bright: learned)', grid['skills']),
            group('Endings (any character)', grid['endings']), group('S endings', grid['s_endings'])]),
    column([group('Companions recruited', grid['recruits']),
            group('Cooked', grid['cooking']), group('Crafted', grid['crafting'])])]}
layout = {'tracker_default': {'type': 'dock', 'content': [
    {'type': 'container', 'dock': 'left', 'max_width': 800, 'content': progress},
    {'type': 'tabbed', 'tabs': [{'title': tab, 'content': {'type': 'map', 'maps': [tab]}} for tab, _ in TABS] + [
        {'title': 'Bestiary', 'content': {'type': 'array', 'orientation': 'vertical', 'margin': '4,4', 'content': [
            group('Bestiary (first win against each creature)', grid['bestiary'], 64),
            group('Bosses defeated', grid['bosses'], 64)]}}]}]}}
json.dump(layout, open(os.path.join(OUT, 'layouts/tracker.json'), 'w'), indent=1)

# ---------------------------------------------------------------------------- Lua data
loc_rows = {}
for l in LOCS:
    r = {'t': l['type'], 'tier': l['tier'], 'floor': l['floor'], 'sec': SECTION[l['id']],
         'keys': [k for k in l.get('keys', [])], 'small': l.get('small_keys', 0), 'ex': bool(l.get('explosive'))}
    if l['type'] == 'troop':
        r['troop'] = l['troop']
    if l['type'] in ('bestiary', 'boss'):
        r['troops'] = [t['id'] for t in DATA['troops'] if l['creature'] in t['creatures']]
    if l['type'] == 'skill':
        r['scroll'] = BY_ID[l['scroll']]['name']
    if l['type'] == 'key':
        r['item'] = l['item']
    if l['type'] in ('cook', 'craft'):
        r['books'] = [BY_ID[b]['name'] for b in l['books']]
        r['need'] = [BY_ID[i]['name'] for i in l['ingredients']]
        if l.get('result_item') and l['result_item'] not in l['ingredients']:
            r['result'] = BY_ID[l['result_item']]['name']
    loc_rows[l['id']] = r
lua_data = '\n'.join([
    '-- generated by tools/build_poptracker.py from the apworld data: do not edit',
    f'DATA_VERSION = {DATA["data_version"]}',
    f'TIER_GEAR = {lua(TIER_GEAR)}',
    f'BOSS_EXTRA = {lua(BOSS_EXTRA)}',
    f'GEAR = {lua({g: True for g in GEAR})}',
    f'GEAR_COUNT = {len(GEAR)}',
    f'ACCESS_PART = {lua(ACCESS_PART)}',
    f'ACCESS_FLOOR = {lua(ACCESS_FLOOR)}',
    f'FLOOR_TIER = {lua({int(k): v for k, v in DATA["floor_tier"].items()})}',
    f'FLOOR_COUNT = {len(DATA["floors"])}',
    f'TROOPS = {lua({t["id"]: {"tier": t["tier"], "floor": t.get("floor", 1)} for t in DATA["troops"]})}',
    f'KEY_CODES = {lua({k["db_id"]: "key_" + str(k["db_id"]) for k in KEYS})}',
    f'KEY_REQS = {lua({l["item"]: {k: True for k in l["keys"]} for l in LOCS if l["type"] == "key"})}',
    f'ITEM_NAMES = {lua({i["id"]: i["name"] for i in DATA["items"]})}',
    f'SMALL_KEY = {SMALL_KEY}',
    f'ITEM_GRID = {lua(item_grid)}',
    f'LOC_GRID = {lua(loc_grid)}',
    'LOCS = {',
    *[f'  [{i}] = {lua(r)},' for i, r in loc_rows.items()],
    '}',
    ''])
open(os.path.join(OUT, 'scripts/data.lua'), 'w', encoding='utf-8').write(lua_data)

# ---------------------------------------------------------------------------- static files
here = os.path.dirname(os.path.abspath(__file__))
for f in ('init.lua', 'logic.lua', 'autotracking.lua'):
    shutil.copy(os.path.join(here, 'poptracker', f), os.path.join(OUT, 'scripts', f))
shutil.copy(os.path.join(here, 'poptracker', 'README.md'), os.path.join(OUT, 'README.md'))
json.dump({'name': 'Fear & Hunger (Archipelago)', 'game_name': 'Fear & Hunger', 'package_uid': 'fear_and_hunger_ap',
           'package_version': VERSION, 'platform': 'pc', 'author': 'DukKke148',
           'min_poptracker_version': '0.26.2', 'target_poptracker_version': '0.36.0',
           'variants': {'standard': {'display_name': 'Archipelago', 'flags': ['ap']}}},
          open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
json.dump({'smooth_scaling': True, 'disabled_image_filter': 'greyscale,brightness|0.35'},
          open(os.path.join(OUT, 'settings.json'), 'w'), indent=1)
print(f'{OUT}: {len(items)} items, {len(locations)} zones, {len(LOCS)} checks, icons from '
      f'{"the game" if ICONS else "badges"}')

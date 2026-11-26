"""Build the Fear & Hunger Archipelago data table, model v0.2 (unlocks + milestone checks).

Usage: python3 build_data_v2.py <www/data> <out.json>

Checks: first entry in each zone, bestiary (first victory per creature), bosses, enemy groups (troops),
key item pickups, endings.  Items: unlocks (weapons, armors, consumables, books) that spawn in the dungeon.
"""
import collections, glob, json, os, re, sys

D, OUT = sys.argv[1], sys.argv[2]
J = lambda n: json.load(open(os.path.join(D, n + '.json'), encoding='utf-8'))
ITEMS, WEAPONS, ARMORS, CE, SYS = J('Items'), J('Weapons'), J('Armors'), J('CommonEvents'), J('System')
TROOPS, ENEMIES = J('Troops'), J('Enemies')
MAPINFO = {m['id']: m for m in J('MapInfos') if m}
BASE = 7_460_000_000
ITEM_OFFSET = {'item': 1000, 'weapon': 2000, 'armor': 3000}
NIGHTS = {m for m in MAPINFO if 158 <= m <= 181 and m not in (159, 160, 163, 164)} | {161}
GAME_OVER_COPY = {130, 131, 132}

# --------------------------------------------------------------------------- depth of every map
ZONE_DEPTH = [  # (zone name prefix, depth 1-10)
    ('Level 1', 1), ('Level 2', 2), ('Level 3', 3), ('Level 4', 4), ('Level 5', 5), ('Level 6', 6),
    ('Level 7', 7), ('Level 8', 8), ('Level 9', 9), ('Level 10', 10), ('Flip side', 3),
    ("Ma'habre", 8), ('Temple of Torment', 8), ('Grand library', 8), ('Golden Temple', 8),
    ('Tower of Endless', 9), ('The Kingdom of Rondon', 9), ('Rondon', 9), ('Oldegård', 9), ('Highlands', 9),
    ('Ancient city', 9), ('Grand hall', 9), ('The Tomb of the Gods', 9), ('Next plane', 10),
]
UNNAMED_MAPS = {  # map id -> (zone name or None for no zone check, depth)
    12: ('Lizard lair', 5), 13: (None, 2), 22: ('Huts village', 6), 23: (None, 7), 25: (None, 8),
    74: (None, 1), 73: (None, 1), 2: (None, 1), 10: (None, 1), 86: (None, 10), 129: (None, 9),
    138: (None, 9), 152: (None, 8), 160: (None, 10), 185: (None, 10), 186: (None, 6),
}
# 5 tiers: Part 1 (levels 1-3), Part 2 (4-6), Part 3 (7-8), Ma'habre, End (ancient city, dreams, 9-10)
MAHABRE_PREFIXES = ("Ma'habre", 'Temple of Torment', 'Grand library', 'Golden Temple')
MAHABRE_UNNAMED = {25, 152}
TIER_NAMES = {1: 'Part 1', 2: 'Part 2', 3: 'Part 3', 4: "Ma'habre", 5: 'End'}
def tier_of(mid, zone, depth):
    if depth <= 3:
        return 1
    if depth <= 6:
        return 2
    if mid in MAHABRE_UNNAMED or (zone or '').startswith(MAHABRE_PREFIXES):
        return 4
    return 3 if depth <= 8 else 5

maps = {}
for f in sorted(glob.glob(os.path.join(D, 'Map[0-9][0-9][0-9].json'))):
    mid = int(os.path.basename(f)[3:6])
    if mid not in MAPINFO or mid in NIGHTS or mid in GAME_OVER_COPY:
        continue
    m = json.load(open(f, encoding='utf-8'))
    name = m.get('displayName') or ''
    if name:
        # longest prefix first, so 'Level 10' is not read as 'Level 1'
        depth = next((d for p, d in sorted(ZONE_DEPTH, key=lambda x: -len(x[0])) if name.startswith(p)), None)
        zone = name
    elif mid in UNNAMED_MAPS:
        zone, depth = UNNAMED_MAPS[mid]
    else:
        continue  # unused or unreachable map
    if depth is None:
        print(f'  skipped map {mid} ({name}): not part of the main game')
        continue
    maps[mid] = dict(data=m, zone=zone, depth=depth, tier=tier_of(mid, zone, depth))

# --------------------------------------------------------------------------- items
KEYS = [20, 48, 51, 180, 148, 202, 179, 119, 162, 163, 188, 199, 149, 2, 1]
# story, quest and tool items the game itself needs: always given as normal
PASS_ITEMS = set(KEYS) | {18, 19, 22, 81, 82, 86, 184, 185, 186, 191, 192, 193, 49, 189, 181, 170, 115, 116,
                          120, 126, 127, 128, 129, 130, 45, 46, 151, 92, 201, 59, 60, 117, 203, 157, 98, 40, 23,
                          93, 29}
BASE_ITEMS = {8, 84, 65, 94, 95, 21, 15, 16, 17, 31, 152, 27, 118, 85, 9, 5, 7, 91, 42, 43, 64, 69, 37, 26, 58,
              204, 206, 207, 208, 209, 210, 211, 212, 213}
UNLOCK_CONSUMABLES = [11, 28, 33, 34, 52, 54, 67, 78, 79, 97, 12, 14, 30, 38, 68, 71, 72, 73, 74, 76, 87, 132,
                      99, 100, 101, 166, 167, 169, 182, 183, 171, 194, 153, 154, 140, 44, 75, 88, 53, 61, 134]
UNLOCK_BOOKS = [3, 4, 13, 24, 25, 36, 39, 47, 56, 80, 83, 89, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111,
                112, 113, 133, 136, 137, 138, 139, 155, 156, 159, 160, 161, 164, 174, 175, 176, 177, 178]
UNLOCK_WEAPONS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 16, 20, 32, 34, 36, 38, 40, 44, 45, 49]
UNLOCK_ARMORS = [1, 2, 4, 7, 8, 12, 13, 14, 16, 17, 18, 21, 22, 23, 24, 25, 31, 33, 34, 44, 46, 48, 56, 57,
                 20, 26, 27, 28, 29, 30, 47, 50, 51, 52, 58]
# never shuffled: bows need arrows, disguises and special armors are checked by the story
NO_SHUFFLE_WEAPONS = {11}
# strong weapons that the base game hands out for a price (the little girl to the Pocketcat, Ser Gregor's corpse,
# Miasma's blood price, the tortured body, the sword in the wall): once unlocked they come ONLY from those
# vanilla events, never as free loot
PRICED_WEAPONS = {5, 20, 34, 49}  # Claymore, Miasma, Bone shears, Blue Sin


def debug_page(page):
    # developer test event (level1_A EV140...): adds party members, teaches skills and gives every weapon
    codes = [c['code'] for c in page['list']]
    return 129 in codes and 318 in codes
DISGUISES = {3, 5}

# --------------------------------------------------------------------------- creatures and troops
CREATURE = lambda n: re.sub(r'\s*\[.*\]$', '', n).strip()
BOSSES = ['Tormented one', 'Sylvian', 'Francois', 'Valteil', 'Old guardian', 'Greater blight', 'Nameless',
          'Knight spectre', 'Beheaded wizard', 'Salmonsnake', 'Crow Mauler', 'Skin granny', 'White angel',
          'Red man', 'Gro-goroth', 'Iron Shakespeare', 'Gaunt knight', 'Uterus', 'Lord of flies', 'Ser Seymor',
          'Cavemother', 'Harvestman', 'Black witch', 'Butterfly', 'Trortur', 'Old knight', 'Yellow lizardmage',
          'Hydra']
COMPANIONS = {'Cahara', "D'arce", 'Enki', 'Ragnvaldr', 'Moonless'}
OBJECTS = {'Wooden door', 'Metal door', 'Iron bars'}
ENDGAME = {'New god', 'Traces of Sylvian', 'Traces of Gro-goroth', 'Darkness', 'The girl', 'Lady of Moon'}
UNSAFE_TROOPS = {53}  # its battle script teleports the party


def gains_in(lst):
    out = []
    for c in lst:
        p = c['parameters']
        if c['code'] in (126, 127, 128) and p[1] == 0:
            out.append(({126: 'item', 127: 'weapon', 128: 'armor'}[c['code']], p[0]))
    return out


LOOT_TABLES = [i for i, c in enumerate(CE) if c and re.match(r'(RANDOM|GUARD_LOOT)', c['name'].upper())
               and not c['name'].upper().startswith('NIGHTS')]

troop_maps = collections.defaultdict(set)
spots = collections.OrderedDict()
key_depth = {}
native_depth = collections.defaultdict(lambda: 99)
fixed_tiers = collections.defaultdict(list)  # (kind, id) -> shallowest depth it can be found
table_depth = collections.defaultdict(lambda: 99)
for mid, mp in maps.items():
    depth = mp['tier']  # tier of the map (1-5)
    for ev in mp['data']['events']:
        if not ev:
            continue
        sawing = 'sawing' in ev['name'].lower()
        pages = ev['pages']
        has_battle = any(c['code'] == 301 for p in pages for c in p['list'])
        pages = [p for p in pages if not debug_page(p)]
        for p in pages:
            for c in p['list']:
                if c['code'] == 301 and c['parameters'][0] == 0:
                    troop_maps[c['parameters'][1]].add(mid)
                if c['code'] == 117 and c['parameters'][0] in LOOT_TABLES:
                    table_depth[c['parameters'][0]] = min(table_depth[c['parameters'][0]], depth)
            for k, i in gains_in(p['list']):
                native_depth[(k, i)] = min(native_depth[(k, i)], depth)
                fixed_tiers[(k, i)].append(depth)  # fixed spots only (not random loot tables)
                if k == 'item' and i in KEYS:
                    key_depth[i] = min(key_depth.get(i, 99), depth)
        if sawing or has_battle:
            continue
        loot_pages = [p for p in pages if gains_in(p['list']) or any(
            c['code'] == 117 and c['parameters'][0] in LOOT_TABLES for c in p['list'])]
        if not loot_pages:
            continue
        cmds = [c for p in loot_pages for c in p['list']]
        if any(c['code'] in (126, 127, 128) and c['parameters'][1] == 1 for c in cmds) or any(
                c['code'] == 302 for c in cmds):
            continue  # crafting, cooking, trading
        if len({g for p in loot_pages for g in gains_in(p['list'])}) >= 8:
            continue  # scripted inventory events
        sw = sorted(s for p in loot_pages for c in p['list'] if c['code'] == 121 and c['parameters'][2] == 0
                    for s in range(c['parameters'][0], c['parameters'][1] + 1))
        key = (mid, 'sw', sw[0]) if sw else (mid, 'ev', ev['id'])
        spot = spots.setdefault(key, dict(map=mid, depth=depth, events=[]))
        spot['events'].append(ev['id'])

# loot tables: what each can give, to place items at their natural depth
for t in LOOT_TABLES:
    for k, i in gains_in(CE[t]['list']):
        native_depth[(k, i)] = min(native_depth[(k, i)], table_depth[t])

# expected number of spots a run sees in each tier: zones with layout variants count their average
zone_maps = collections.defaultdict(list)
for mid, mp in maps.items():
    zone_maps[(mp['zone'] or f'_{mid}', mp['depth'])].append(mid)
spot_count = collections.Counter(s['map'] for s in spots.values())
VARIANT_GROUPS = [[1, 29, 51, 183], [4, 128], [3, 31, 53], [6, 37], [8, 38], [11, 39, 184], [19, 45], [21, 46],
                  [77, 182]]
expected = collections.Counter()
for mid, mp in maps.items():
    group = next((g for g in VARIANT_GROUPS if mid in g), [mid])
    expected[mp['tier']] += spot_count[mid] / len(group)

# --------------------------------------------------------------------------- troops
troops = {}
for tid, tmaps in troop_maps.items():
    if tid >= len(TROOPS) or not TROOPS[tid]:
        continue
    tr = TROOPS[tid]
    creatures = sorted({CREATURE(ENEMIES[m['enemyId']]['name']) for m in tr['members']
                        if m['enemyId'] < len(ENEMIES) and ENEMIES[m['enemyId']] and ENEMIES[m['enemyId']]['name']})
    if not creatures:
        continue
    cs = set(creatures)
    if cs & OBJECTS:
        cls = 'object'
    elif cs & ENDGAME:
        cls = 'endgame'
    elif cs & COMPANIONS:
        cls = 'companion'
    elif cs & set(BOSSES):
        cls = 'boss'
    else:
        cls = 'mob'
    depth = min(maps[m]['depth'] for m in tmaps)
    tier = min(maps[m]['tier'] for m in tmaps)
    troops[tid] = dict(id=tid, name=tr['name'], creatures=creatures, cls=cls, depth=depth, tier=tier,
                       unsafe=tid in UNSAFE_TROOPS)

# --------------------------------------------------------------------------- locations
locations = []
def loc(lid, name, typ, tier, **kw):
    locations.append(dict(id=BASE + lid, name=name, type=typ, tier=tier, **kw))

zones = {}
for mid, mp in maps.items():
    if mp['zone']:
        z = zones.setdefault(mp['zone'], dict(maps=[], depth=mp['depth'], tier=mp['tier']))
        z['maps'].append(mid)
        z['depth'] = min(z['depth'], mp['depth'])
        z['tier'] = min(z['tier'], mp['tier'])
for name, z in sorted(zones.items(), key=lambda x: (x[1]['depth'], x[0])):
    loc(100_000 + min(z['maps']), f'Enter {name}', 'zone', z['tier'], maps=sorted(z['maps']))

creature_depth = collections.defaultdict(lambda: 99)
creature_troops = collections.defaultdict(list)
for t in troops.values():
    for c in t['creatures']:
        creature_depth[c] = min(creature_depth[c], t['tier'])  # tier
        creature_troops[c].append(t['id'])
# creatures that can never die: every enemy of that name is immune to the death state (Knockout, state 1), like the
# Beheaded wizard (Nas'hrah): no check for beating them (ids of the other checks stay the same)
UNKILLABLE = {c for c in creature_depth
              if (lambda es: es and all(any(t['code'] == 14 and t['dataId'] == 1 for t in e['traits']) for e in es))(
                  [e for e in ENEMIES if e and CREATURE(e['name']) == c])}
# regular enemies that were first listed as bosses (the wiki lists them as regular enemies): a bestiary check, not a
# boss check. They get their own ids so that every other check keeps its id
REGULAR = ['Uterus', 'Lord of flies', 'Harvestman', 'Red man', 'Yellow lizardmage']
mobs = sorted(c for c in creature_depth if c not in BOSSES and c not in COMPANIONS | OBJECTS | ENDGAME)
for i, c in enumerate(mobs):
    if c not in UNKILLABLE:
        loc(200_000 + i, f'Bestiary: {c}', 'bestiary', creature_depth[c], creature=c)
for i, c in enumerate(REGULAR):
    if c in creature_depth and c not in UNKILLABLE:
        loc(200_900 + i, f'Bestiary: {c}', 'bestiary', creature_depth[c], creature=c)
# bosses that can be put down another way than in battle: no "Defeat" check (the Knight spectre)
NO_BOSS_CHECK = {'Knight spectre'}
for i, c in enumerate(BOSSES):
    if c in creature_depth and c not in UNKILLABLE and c not in REGULAR and c not in NO_BOSS_CHECK:
        loc(300_000 + i, f'Defeat {c}', 'boss', creature_depth[c], creature=c)
# fights that the main game can never trigger: Trorrtur2 (the Trortur torturing Buckman) needs the switch
# FORGETtrorrfur, only set in the Dungeon Nights bonus maps
UNREACHABLE_TROOPS = {168}
# fights that only exist when the run rolls a given layout, so a run may never offer them: the third priest of the
# inner hall (Priest3, variable LEVEL1-3_random1 = 2) and the floor 6 ballista (Ballista1, level6_2-random2)
UNREACHABLE_TROOPS |= {10, 44}
troop_names = collections.Counter(t['name'] for t in troops.values())
for t in sorted(troops.values(), key=lambda t: t['id']):
    if t['cls'] in ('mob', 'boss') and t['id'] not in UNREACHABLE_TROOPS:
        nm = t['name'] if troop_names[t['name']] == 1 else f"{t['name']} #{t['id']}"
        loc(400_000 + t['id'], f'Group: {nm}', 'troop', t['tier'], troop=t['id'])
for k in KEYS:
    loc(500_000 + k, f"Find {ITEMS[k]['name']}", 'key', key_depth.get(k, 1), item=k)
# endings are detected by the picture of their final cutscene (map Fortress_ending), the most reliable sign
ENDING_MAP = 86
S_PICTURES = ['ending_S_happy_ending', 'ending_S_true_god', 'ending_S_enlightenment', 'ending_S_violence']
for sw, nm, pics in ((1892, 'Ending A', ['ending_AA']), (1891, 'Ending B', ['ending_B']),
                     (1890, 'Ending C', ['ending_C', 'ending_C_2']), (1889, 'Ending D', ['ending_D']),
                     (2249, 'Ending S', S_PICTURES)):
    loc(950_000 + sw, nm, 'ending', 5, switch=sw, pictures=pics)
# Ending E: Le'garde (level 7) says your task is done, the mist lifts, you leave by the dungeon entrance.
# No switch of its own: the ending sequence unlocks the ENDING_E achievement.
loc(950_005, 'Ending E', 'ending_extra', 3, pictures=['ending_A'], achievement='ENDING_E')  # not a goal ending
# Ending S with each starting character (INITIAL_* switches); the game gives a per-character achievement
for sw, cname, ach, pic in zip((661, 662, 663, 664), ('Mercenary', 'Knight', 'Dark Priest', 'Outlander'),
                               ('ENDING_S_MERCENARY', 'ENDING_S_KNIGHT', 'ENDING_S_DARK_PRIEST', 'ENDING_S_OUTLANDER'),
                               ('ending_S_happy_ending', 'ending_S_true_god', 'ending_S_enlightenment', 'ending_S_violence')):
    loc(951_000 + sw, f'Ending S as {cname}', 'ending_extra', 5, class_switch=sw, achievement=ach, pictures=[pic])

# --------------------------------------------------------------------------- unlock items
items = []
def power(kind, i):
    if kind == 'weapon':
        return WEAPONS[i]['params'][2]
    if kind == 'armor':
        a = ARMORS[i]
        return a['params'][3] + a['params'][5] + sum(a['params'])
    return ITEMS[i]['price']
def native_tier(kind, i):
    # weapons / armors: typical (median) tier of their FIXED spots in the base game; the random loot tables
    # are the same on every floor, so they would put almost everything on floor 1. Only in tables -> None
    # (the plugin then places them by power).
    if kind in ('weapon', 'armor'):
        spots = sorted(fixed_tiers.get((kind, i), []))
        return spots[(len(spots) - 1) // 2] if spots else None
    d = native_depth.get((kind, i), 99)  # already a tier
    return d if d < 99 else None
groups = [('weapon', UNLOCK_WEAPONS, 'gear'), ('armor', UNLOCK_ARMORS, 'gear'),
          ('item', UNLOCK_CONSUMABLES, 'consumable'), ('item', UNLOCK_BOOKS, 'book')]
for kind, ids, cat in groups:
    table = {'item': ITEMS, 'weapon': WEAPONS, 'armor': ARMORS}[kind]
    for i in ids:
        cls = 'progression' if cat == 'gear' and (kind == 'weapon' or table[i]['etypeId'] < 5) else (
            'useful' if cat in ('gear', 'book') else 'filler')
        items.append(dict(id=BASE + ITEM_OFFSET[kind] + i, name=table[i]['name'], kind=kind, db_id=i, cat=cat,
                          etype=table[i].get('etypeId', 1 if kind == 'weapon' else 0),
                          classification=cls, power=power(kind, i), native_tier=native_tier(kind, i),
                          priced=kind == 'weapon' and i in PRICED_WEAPONS))
# rank power inside weapons / armors (0 weakest .. 1 strongest) for by_depth spawning
for kind in ('weapon', 'armor'):
    group = sorted((x for x in items if x['kind'] == kind), key=lambda x: x['power'])
    for r, x in enumerate(group):
        x['power_rank'] = round(r / max(1, len(group) - 1), 3)
names = collections.Counter(x['name'] for x in items)
for x in items:
    if names[x['name']] > 1:
        x['name'] = f"{x['name']} ({x['kind']} {x['db_id']})"
assert len({x['name'] for x in items}) == len(items)
assert len({l['name'] for l in locations}) == len(locations)
assert len({l['id'] for l in locations}) == len(locations)

spot_table = {}
for idx, s in enumerate(spots.values()):
    for e in s['events']:
        spot_table[f"{s['map']}:{e}"] = [idx, s['depth']]  # tier

# --------------------------------------------------------------------------- key requirements (randomize_keys)
# Keys mostly open doors inside a map. A map needs the keys used in every map crossed to reach it;
# checks inside a map (fights, key pickups) also need the keys used in that map. Strict on purpose.
KEYSET = set(KEYS)
SMALL_KEY = 20
map_keys = collections.defaultdict(set)      # keys used (checked) in a map
key_maps = collections.defaultdict(set)      # maps where a key can be picked up
edges = collections.defaultdict(list)        # map -> [(dest, keys needed for this transfer)]
small_doors = collections.Counter()
for mid, mp in maps.items():
    for ev in mp['data']['events']:
        if not ev:
            continue
        consumes = False
        for pg in ev['pages']:
            c0 = pg['conditions']
            base = {c0['itemId']} if c0['itemValid'] and c0['itemId'] in KEYSET else set()
            map_keys[mid] |= base
            stack = {}
            for c in pg['list']:
                ind, q = c['indent'], c['parameters']
                for k in [k for k in stack if k >= ind]:
                    del stack[k]
                if c['code'] == 111 and q[0] == 8 and q[1] in KEYSET:
                    stack[ind] = q[1]
                    map_keys[mid].add(q[1])
                if c['code'] == 201 and q[0] == 0 and q[1] in maps and q[1] != mid:
                    edges[mid].append((q[1], frozenset(base | set(stack.values()))))
                if c['code'] == 126 and q[0] in KEYSET and q[1] == 0:
                    key_maps[q[0]].add(mid)
                if c['code'] == 126 and q[0] == SMALL_KEY and q[1] == 1:
                    consumes = True
        if consumes:
            small_doors[mid] += 1

# cheapest key sets to reach each map from the start (keep a few incomparable sets per map)
START_MAPS = [m for m in (74, 73, 10, 2) if m in maps]
reach = {m: [frozenset()] for m in START_MAPS}
queue = list(START_MAPS)
while queue:
    a = queue.pop(0)
    for need_a in list(reach[a]):
        through = need_a | map_keys[a] if a not in START_MAPS else need_a
        for b, need_edge in edges[a]:
            cand = frozenset(through | need_edge)
            cur = reach.setdefault(b, [])
            if any(c <= cand for c in cur):
                continue
            cur[:] = [c for c in cur if not cand <= c] + [cand]
            cur.sort(key=len)
            del cur[4:]
            queue.append(b)
def map_req(mid, inside):
    sets = reach.get(mid)
    if not sets:   # only reachable through special means: every key of its tier or above it
        return {k for m, ks in map_keys.items() if maps[m]['tier'] <= maps[mid]['tier'] for k in ks} | \
            ({'VIAL'} if mid in VIAL_MAPS else set())
    req = set(min(sets, key=len)) | ({'VIAL'} if mid in VIAL_MAPS else set())
    return req | map_keys[mid] if inside else req
VARIANT_OF = {m: tuple(g) for g in VARIANT_GROUPS for m in g}

# Explosive vial: collapsed hallways ("Use Explosive vial") cut some maps in two. Walk every map tile by tile
# (tileset passability) to find the maps only reachable by blowing one up (the Hidden backyard, the Thickets...).
# Other obstacles inside a map (doors, the library's moving bookshelves) are left to the key logic: any other
# event joins the parts of the map around it.
EXPLOSIVE_VIAL = 79
TILESETS = J('Tilesets')
def _is_collapse(ev):
    return any(c['code'] == 111 and c['parameters'][0] == 8 and c['parameters'][1] == EXPLOSIVE_VIAL
               for c in ev['pages'][0]['list'])
def _vial_maps():
    comp = {}
    for mid, mp in maps.items():
        m = mp['data']; flags = TILESETS[m['tilesetId']]['flags']; W, H = m['width'], m['height']
        def passable(x, y):
            for z in (3, 2, 1, 0):
                t = m['data'][(z * H + y) * W + x]
                if t == 0 or (t < len(flags) and flags[t] & 0x10):
                    continue
                return ((flags[t] if t < len(flags) else 0) & 0x0f) != 0x0f
            return False
        col = {(e['x'], e['y']) for e in m['events'] if e and _is_collapse(e)}
        n = 0
        for y in range(H):
            for x in range(W):
                if (mid, x, y) in comp or (x, y) in col or not passable(x, y):
                    continue
                n += 1; comp[(mid, x, y)] = (mid, n); todo = [(x, y)]
                while todo:
                    a, b = todo.pop()
                    for nx, ny in ((a + 1, b), (a - 1, b), (a, b + 1), (a, b - 1)):
                        if 0 <= nx < W and 0 <= ny < H and (mid, nx, ny) not in comp and (nx, ny) not in col \
                                and passable(nx, ny):
                            comp[(mid, nx, ny)] = (mid, n); todo.append((nx, ny))
    def at(mid, x, y):
        return {comp[(mid, x + dx, y + dy)] for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1))
                if (mid, x + dx, y + dy) in comp}
    links, boom, comps_of = collections.defaultdict(set), collections.defaultdict(set), collections.defaultdict(set)
    for k in set(comp.values()):
        comps_of[k[0]].add(k)
    for mid, mp in maps.items():
        for e in mp['data']['events']:
            if not e or _is_collapse(e):
                continue
            for pg in e['pages']:
                for c in pg['list']:
                    if c['code'] == 201 and c['parameters'][0] == 0 and c['parameters'][1] in maps:
                        dst = at(*c['parameters'][1:4]) or {('map', c['parameters'][1])}
                        for a in at(mid, e['x'], e['y']) or {('map', mid)}:
                            links[a] |= dst
        # any other event (door, moving bookshelf, lever...) joins the parts of the map around it; a collapse
        # does too, once blown up
        for e in mp['data']['events']:
            if e:
                around = at(mid, e['x'], e['y'])
                for a in around:
                    (boom if _is_collapse(e) else links)[a] |= around
    def reached(with_vials):
        seen = set()
        for mid in START_MAPS:
            seen |= comps_of[mid] | {('map', mid)}
        todo = list(seen)
        while todo:
            a = todo.pop()
            for b in (links[a] | boom[a] if with_vials else links[a]) - seen:
                seen.add(b); todo.append(b)
        return {k[0] if k[0] != 'map' else k[1] for k in seen}
    # maps reached only with vials. Maps reached by neither are entered by scripts: left alone, except the other
    # layouts of a vial-only map (a run picks one layout of the Thickets, entered through the same collapse)
    without = reached(False)
    vial = reached(True) - without
    thickets = [m for m in maps if MAPINFO[m]['name'].startswith('thicket_')]
    for g in VARIANT_GROUPS + [thickets]:
        if vial & set(g):
            vial |= {m for m in g if m in maps and m not in without}
    return vial
VIAL_MAPS = _vial_maps()
def req_for_maps(mids, inside):
    # maps of one layout group are alternatives decided per run: need what the hardest one needs;
    # different groups all exist in a run: the easiest one is enough
    groups = collections.defaultdict(set)
    for m in mids:
        groups[VARIANT_OF.get(m, (m,))] |= map_req(m, inside)
    return min(groups.values(), key=len) if groups else set()

# Small keys consumed by doors, worst layout, accumulated by tier
doors_by_tier = collections.Counter()
for g in VARIANT_GROUPS:
    present = [m for m in g if m in maps]
    if present:
        doors_by_tier[maps[present[0]]['tier']] += max(small_doors[m] for m in present)
for m in maps:
    if m not in VARIANT_OF:
        doors_by_tier[maps[m]['tier']] += small_doors[m]
SMALL_KEY_COPIES = 16
small_needed, acc = {}, 0
for t in range(1, 6):
    acc += doors_by_tier[t]
    small_needed[t] = min(SMALL_KEY_COPIES, acc)

zone_maps_by_name = {name: z['maps'] for name, z in zones.items()}
troop_maps_map = {t: sorted(ms) for t, ms in troop_maps.items()}
for l in locations:
    t = l['type']
    if t == 'zone':
        req = req_for_maps(zone_maps_by_name[l['name'][6:]], inside=False)
    elif t == 'troop':
        req = req_for_maps(troop_maps_map[l['troop']], inside=True)
    elif t in ('bestiary', 'boss'):
        cands = [req_for_maps(troop_maps_map[tid], inside=True) for tid in creature_troops[l['creature']]
                 if tid in troop_maps_map]
        req = min(cands, key=len) if cands else set()
    elif t == 'key':
        req = req_for_maps(sorted(key_maps.get(l['item'], [])), inside=True) - {l['item']}
    elif l['name'] == 'Ending E':  # back to the entrance from level 7: the keys of the first three floors
        req = {k for k in KEYS if key_depth.get(k, 99) <= 3}
    else:  # endings: every key
        req = set(KEYS)
    l['keys'] = sorted(k for k in req if k != SMALL_KEY and k != 'VIAL')
    l['small_keys'] = small_needed[l['tier']] if SMALL_KEY in req or t in ('ending', 'ending_extra') else 0
    l['explosive'] = 'VIAL' in req

# key items and floor access items (only used when the options are on)
for k in KEYS:
    items.append(dict(id=BASE + ITEM_OFFSET['item'] + k, name=ITEMS[k]['name'], kind='item', db_id=k, cat='key',
                      etype=0, classification='progression', power=0, native_tier=None,
                      copies=SMALL_KEY_COPIES if k == SMALL_KEY else 1))
for t in range(2, 6):
    items.append(dict(id=BASE + 5000 + t, name=f"Access: {TIER_NAMES[t].replace('Partie', 'Part').replace('Fin', 'End')}",
                      kind='access', db_id=t, cat='access', etype=0, classification='progression', power=0,
                      native_tier=None, copies=1))
# traps sent by the multiworld (db_id = trap code read by the plugin)
TRAPS = [(1, 'Bleeding'), (2, 'Poison'), (3, 'Infection'), (4, 'Parasites'),
         (6, 'Phobia'), (7, 'Hunger'), (8, 'Fear'), (9, 'Torch out')]
for code, tname in TRAPS:
    items.append(dict(id=BASE + 7000 + code, name=f'Trap: {tname}', kind='trap', db_id=code, cat='trap', etype=0,
                      classification='trap', power=0, native_tier=None, copies=1))
assert len({x['name'] for x in items}) == len(items)

# --------------------------------------------------------------------------- floors (floor_access: per_floor)
FLOOR_NAMES = {1: 'Level 1', 2: 'Level 2', 3: 'Level 3', 4: 'Level 4', 5: 'Level 5', 6: 'Level 6', 7: 'Level 7',
               8: 'Level 8', 9: "Ma'habre", 10: 'Level 9', 11: 'Ancient city', 12: 'Level 10'}
FLOOR_BY_LEVEL = {1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 10, 10: 12}
SIDE_FLOORS = {'Flip side': 2, 'Lizard lair': 5, 'Huts village': 6}
def floor_of(mid, mp):
    zone = mp['zone'] or ''
    lvl = re.match(r'Level (\d+)', zone)
    if lvl:
        return FLOOR_BY_LEVEL[int(lvl.group(1))]
    for prefix, f in SIDE_FLOORS.items():
        if zone.startswith(prefix):
            return f
    if mp['tier'] == 4:
        return 9
    if mp['tier'] == 5:
        return 11
    return FLOOR_BY_LEVEL.get(mp['depth'], 1)
for mid, mp in maps.items():
    mp['floor'] = floor_of(mid, mp)
troop_floor = {tid: min(maps[m]['floor'] for m in ms) for tid, ms in troop_maps.items() if tid in troops}
for tid, f in troop_floor.items():
    troops[tid]['floor'] = f
for l in locations:
    t = l['type']
    if t == 'zone':
        l['floor'] = min(maps[m]['floor'] for m in zone_maps_by_name[l['name'][6:]])
    elif t == 'troop':
        l['floor'] = troop_floor[l['troop']]
    elif t in ('bestiary', 'boss'):
        fl = [troop_floor[tid] for tid in creature_troops[l['creature']] if tid in troop_floor]
        l['floor'] = min(fl) if fl else 1
    elif t == 'key':
        fl = [maps[m]['floor'] for m in key_maps.get(l['item'], []) if m in maps]
        l['floor'] = min(fl) if fl else 1
    else:
        l['floor'] = 7 if l['name'] == 'Ending E' else max(FLOOR_NAMES)  # Le'garde waits on level 7
FLOOR_TIER = {f: min((mp['tier'] for mp in maps.values() if mp['floor'] == f), default=1) for f in FLOOR_NAMES}
# access items per floor; Ma'habre shares the per-part item
floor_items = {}
for f, name in FLOOR_NAMES.items():
    if f == 1:
        continue
    if f == 9:
        floor_items[f] = BASE + 5000 + 4
        continue
    floor_items[f] = BASE + 5100 + f
    items.append(dict(id=floor_items[f], name=f'Access: {name}', kind='access', db_id=f, cat='access_floor',
                      etype=0, classification='progression', power=0, native_tier=None, copies=1))
assert len({x['name'] for x in items}) == len(items)

# --------------------------------------------------------------------------- skill checks (reading a scroll)
SKILLS = J('Skills')
skill_scroll = {}
for x in items:
    if x['cat'] == 'book':
        for e in ITEMS[x['db_id']]['effects']:
            if e['code'] == 43:
                skill_scroll[e['dataId']] = x
for sk, x in sorted(skill_scroll.items()):
    x['teaches'] = sk
    tier = x['native_tier'] or 1
    loc(600_000 + sk, f"Learn {SKILLS[sk]['name']}", 'skill', tier, skill=sk, scroll=x['id'], keys=[], small_keys=0,
        floor=next((f for f, t in sorted(FLOOR_TIER.items()) if t >= tier), 1))
assert len({l['name'] for l in locations}) == len(locations)

# Hexen tables: events that teach a skill for a Lesser soul (learning there is a skill check too)
skill_teachers = []
check_skills = {l['skill'] for l in locations if l['type'] == 'skill'}
for f in sorted(glob.glob(os.path.join(D, 'Map[0-9][0-9][0-9].json'))):
    mid = int(os.path.basename(f)[3:6])
    for ev in json.load(open(f, encoding='utf-8'))['events']:
        if not ev:
            continue
        for p in ev['pages']:
            L = p['list']
            if any(c['code'] == 111 and c['parameters'][0] == 8 and c['parameters'][1] == 116 for c in L) and \
                    any(c['code'] == 318 and c['parameters'][2] == 0 and c['parameters'][3] in check_skills for c in L):
                skill_teachers.append(f'{mid}:{ev["id"]}')
                break

# --------------------------------------------------------------------------- optional checks (v0.2.0)
ACTORS = J('Actors')
item_id = {('item', x['db_id']): x['id'] for x in items if x['kind'] == 'item'}
item_id.update({(x['kind'], x['db_id']): x['id'] for x in items if x['kind'] in ('weapon', 'armor')})
by_ap = {x['id']: x for x in items}
def floor_for_tier(tier):
    return next((f for f, t in sorted(FLOOR_TIER.items()) if t >= tier), 1)

# recruiting a companion (recruit_checks): the event where they join, recognised by their name in its dialogue
RECRUITS = [('Girl', 'the Girl', 'Girl'), ('Mercenary', 'Cahara', 'Cahara'), ('Knight', "D'arce", "D'arce"),
            ('Dark Priest', 'Enki', 'Enki'), ('Outlander', 'Ragnvaldr', 'Ragnvaldr'), ("Le'garde", "Le'garde", "Le'garde"),
            ("Nas'hrah", "Nas'hrah", "Nas'hrah"), ('Moonless', 'Moonless', 'Moonless')]
actor_by_name = {a['name']: a['id'] for a in ACTORS if a}
recruit_maps = collections.defaultdict(set)
for mid, mp in maps.items():
    if mid == 74:  # Fortress: the starting party
        continue
    for ev in mp['data']['events']:
        if not ev:
            continue
        for pg in ev['pages']:
            if debug_page(pg):
                continue
            removed = {c['parameters'][0] for c in pg['list'] if c['code'] == 129 and c['parameters'][1] == 1}
            text = ' '.join(c['parameters'][0] for c in pg['list'] if c['code'] == 401)
            for c in pg['list']:
                if c['code'] == 129 and c['parameters'][1] == 0 and c['parameters'][0] not in removed:
                    for aname, shown, word in RECRUITS:
                        if c['parameters'][0] == actor_by_name[aname] and word.lower() in text.lower():
                            recruit_maps[aname].add(mid)
for aname, shown, word in RECRUITS:
    ms = sorted(recruit_maps[aname])
    assert ms, aname
    tier = min(maps[m]['tier'] for m in ms)
    req = req_for_maps(ms, inside=True)
    loc(700_000 + actor_by_name[aname], f'Recruit {shown}', 'recruit', tier, actor=actor_by_name[aname], maps=ms,
        keys=sorted(k for k in req if k not in (SMALL_KEY, 'VIAL')), explosive='VIAL' in req,
        small_keys=small_needed[tier] if SMALL_KEY in req else 0,
        floor=min(maps[m]['floor'] for m in ms))
# marriage (marriage_check): the Marriage actor created at a blood circle. Its ritual is not modelled by the
# logic, so this check never holds progression (excluded)
loc(700_000 + actor_by_name['Marriage'], 'Create a Marriage', 'marriage', 2, actor=actor_by_name['Marriage'],
    keys=[], small_keys=0, floor=floor_for_tier(2))

# crafting (YEP_ItemSynthesis) and campfire cooking (cooking_checks / crafting_checks)
def recipe_books():
    src = collections.defaultdict(list)
    for x in ITEMS:
        if not x:
            continue
        for tag, k in (('Item', 'item'), ('Weapon', 'weapon'), ('Armor', 'armor')):
            for m in re.findall(rf'<{tag} Recipe:\s*([^>]*)>', x['note']):
                for part in m.split(','):
                    r = re.match(r'\s*(\d+)\s*to\s*(\d+)', part)
                    for j in (range(int(r.group(1)), int(r.group(2)) + 1) if r else [int(part)]):
                        src[(k, j)].append(x['id'])
    return src
books_of = recipe_books()
FOOD_CE = {c['id'] for c in CE if c and 'FOOD' in c['name']}
def tier_of_item(kind, i):
    x = by_ap.get(item_id.get((kind, i)))
    if x:
        return x['native_tier'] or 1
    d = native_depth.get((kind, i), 99)
    return d if d < 99 else 1
recipes = []
for kind, table in (('item', ITEMS), ('weapon', WEAPONS), ('armor', ARMORS)):
    for x in table:
        if not x or '<Synthesis Ingredients>' not in x['note'] or not books_of[(kind, x['id'])]:
            continue   # no recipe book teaches it (Flesh strips, Rotten Vegetable pie): cannot be crafted
        body = re.search(r'<Synthesis Ingredients>(.*?)</Synthesis Ingredients>', x['note'], re.S).group(1)
        ings = [(m[0].lower(), int(m[1])) for m in re.findall(r'(item|weapon|armor)\s+(\d+)', body, re.I)]
        cook = any(e['code'] == 44 and e['dataId'] in FOOD_CE for e in x.get('effects', []))
        recipes.append(dict(kind=kind, db_id=x['id'], name=x['name'], cook=cook, books=books_of[(kind, x['id'])],
                            ingredients=ings, campfire=False))
# campfire: raw meat -> grilled meat at the fire events
campfire_events = []
for mid, mp in maps.items():
    for ev in mp['data']['events']:
        if not ev:
            continue
        for pg in ev['pages']:
            got = {c['parameters'][0] for c in pg['list'] if c['code'] == 126 and c['parameters'][1] == 0}
            lost = {c['parameters'][0] for c in pg['list'] if c['code'] == 126 and c['parameters'][1] == 1}
            if lost and any(ITEMS[g]['name'].startswith('Grilled') for g in got):
                campfire_events.append((mid, ev['id']))
                break
camp_maps = sorted({m for m, e in campfire_events})
for raw, grilled in (('Raw meat', 'Grilled meat'), ('Salmonsnake meat', 'Grilled salmonsnake meat')):
    gi = next(x['id'] for x in ITEMS if x and x['name'] == grilled)
    ri = next(x['id'] for x in ITEMS if x and x['name'] == raw)
    recipes.append(dict(kind='item', db_id=gi, name=grilled, cook=True, books=[], ingredients=[('item', ri)],
                        campfire=True))
for r in recipes:
    need = [b for b in r['books']]
    book_ap = [item_id[('item', b)] for b in r['books'] if ('item', b) in item_id]
    ing_ap = sorted({item_id[(k, i)] for k, i in r['ingredients'] if (k, i) in item_id})
    book_tier = min((tier_of_item('item', b) for b in r['books']), default=1)
    tier = max([book_tier] + [tier_of_item(k, i) for k, i in r['ingredients']])
    if r['campfire']:
        tier = max(tier, min(maps[m]['tier'] for m in camp_maps))
    res_ap = item_id.get((r['kind'], r['db_id']))
    verb = 'Cook' if r['cook'] else 'Craft'
    off = {'item': 0, 'weapon': 2000, 'armor': 3000}[r['kind']]
    loc(800_000 + off + r['db_id'], f"{verb} {r['name']}", 'cook' if r['cook'] else 'craft', tier,
        result=[r['kind'][0], r['db_id']], result_item=res_ap,
        books=book_ap if len(book_ap) == len(r['books']) else [], ingredients=ing_ap, campfire=r['campfire'],
        keys=[], small_keys=0, floor=floor_for_tier(tier))
assert len({l['name'] for l in locations}) == len(locations)
assert len({l['id'] for l in locations}) == len(locations)

# test mode teleport: for each map, the tile where the game's own transfers most often drop you
arrivals = collections.defaultdict(collections.Counter)
def scan_transfers(lst):
    for c in lst:
        if c['code'] == 201 and c['parameters'][0] == 0:
            _, m, x, y = c['parameters'][:4]
            arrivals[m][(x, y)] += 1
for f in glob.glob(os.path.join(D, 'Map[0-9][0-9][0-9].json')):
    for ev in json.load(open(f, encoding='utf-8'))['events']:
        for p in (ev or {}).get('pages', []):
            scan_transfers(p['list'])
for c in CE:
    if c:
        scan_transfers(c['list'])
map_entry = {str(m): list(cnt.most_common(1)[0][0]) for m, cnt in arrivals.items() if m in maps}
# per floor: the map most often entered (its hub)
# per floor: its main map (variant A when the floor has several layouts)
FLOOR_MAIN_MAP = {1: 1, 2: 5, 3: 6, 4: 8, 5: 11, 6: 16, 7: 24, 8: 93, 9: 26, 10: 142, 11: 154, 12: 159}
floor_entry = {f: (m, 0) for f, m in FLOOR_MAIN_MAP.items() if str(m) in map_entry}
assert len(floor_entry) == len(FLOOR_MAIN_MAP), floor_entry

# where each check is shown in trackers: the zone where it happens (the shallowest one), or a category
def _zone_of(ms):
    ms = [m for m in ms if m in maps and maps[m]['zone']]
    return maps[min(ms, key=lambda m: (maps[m]['floor'], maps[m]['tier'], m))]['zone'] if ms else None
# fights that roam the dungeon (the Crow Mauler, the Assassin spectre): met on many floors, shown on their own
ROAMING = {tid for tid, ms in troop_maps_map.items() if len({maps[m]['floor'] for m in ms if m in maps}) >= 5}
CATEGORY = {'skill': 'Skills', 'cook': 'Cooking', 'craft': 'Crafting', 'ending': 'Endings', 'marriage': 'Marriage'}
for l in locations:
    t = l['type']
    if t == 'zone':
        z = l['name'][6:]
    elif t == 'troop':
        z = 'Roaming' if l['troop'] in ROAMING else _zone_of(troop_maps_map.get(l['troop'], []))
    elif t in ('bestiary', 'boss'):
        tids = [tid for tid in creature_troops[l['creature']] if tid in troop_maps_map]
        z = 'Roaming' if ROAMING & set(tids) else _zone_of([m for tid in tids for m in troop_maps_map[tid]])
    elif t == 'key':
        z = _zone_of(sorted(key_maps.get(l['item'], [])))
    elif t == 'recruit':
        z = _zone_of(l['maps'])
    elif t == 'ending_extra' and l['name'].startswith('Ending S'):
        z = 'S endings'
    elif t == 'ending_extra':
        z = 'Endings'
    else:
        z = 'S endings' if l['name'] == 'Ending S' else CATEGORY.get(t)
    l['zone'] = z or FLOOR_NAMES.get(l['floor'], 'Other')

out = dict(
    game='Fear & Hunger', game_version='1.4.1', data_version=16,
    tiers={str(k): v for k, v in TIER_NAMES.items()},
    map_depth={str(m): mp['depth'] for m, mp in maps.items()},
    map_tier={str(m): mp['tier'] for m, mp in maps.items()},
    zone_of_map={str(m): mp['zone'] for m, mp in maps.items() if mp['zone']},
    spots=spot_table, expected_spots={str(k): round(v) for k, v in sorted(expected.items())},
    loot_tables=LOOT_TABLES, keys=KEYS, pass_items=sorted(PASS_ITEMS), base_items=sorted(BASE_ITEMS),
    shuffle_weapons=[i for i in UNLOCK_WEAPONS if i not in NO_SHUFFLE_WEAPONS],
    shuffle_armors=[i for i in UNLOCK_ARMORS if i not in DISGUISES],
    troops=sorted(troops.values(), key=lambda t: t['id']),
    small_key_copies=SMALL_KEY_COPIES, small_keys_by_tier=small_needed,
    # ending sequences and cutscene maps: floor access never sends you back from them (it could break an ending)
    no_lock_maps=[m for m in (86, 129, 138, 140, 160, 185) if m in maps],
    floors={str(k): v for k, v in FLOOR_NAMES.items()}, floor_tier={str(k): v for k, v in FLOOR_TIER.items()},
    floor_items={str(k): v for k, v in floor_items.items()},
    map_floor={str(m): mp['floor'] for m, mp in maps.items()},
    map_entry=map_entry, floor_entry={str(f): m for f, (m, n) in floor_entry.items()},
    map_names={str(m): MAPINFO[m]['name'] for m in maps},
    skill_teachers=skill_teachers, campfire_events=[f'{m}:{e}' for m, e in campfire_events],
    items=items, locations=locations,
)
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
c = collections.Counter(l['type'] for l in locations)
print('locations', len(locations), dict(c))
print('unlock items', len(items), dict(collections.Counter(x['cat'] for x in items)),
      '| progression', sum(x['classification'] == 'progression' for x in items))
print('spots', len(spots), '| expected per run by tier', {k: round(v) for k, v in sorted(expected.items())})
print('troops by class', dict(collections.Counter(t['cls'] for t in troops.values())))
print('bestiary', mobs)

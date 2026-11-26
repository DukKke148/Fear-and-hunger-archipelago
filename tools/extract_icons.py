"""Extracts tracker icons from YOUR copy of Fear & Hunger, for your own PopTracker pack.

usage: python tools/extract_icons.py <path to the game's www folder> <fh_data.json> <out dir>

The game's images are encrypted RPG Maker files (.rpgmvp); they are decrypted with the key in www/data/System.json.
The icons are only for your own use: never publish a pack built with them (the public pack uses plain badges).
"""
import json
import os
import re
import sys
from io import BytesIO

from PIL import Image

WWW, DATA_PATH, OUT = sys.argv[1:4]
os.makedirs(OUT, exist_ok=True)
DATA = json.load(open(DATA_PATH, encoding='utf-8'))
J = lambda name: json.load(open(os.path.join(WWW, 'data', name + '.json'), encoding='utf-8'))
SYSTEM = J('System')
KEY = bytes.fromhex(SYSTEM['encryptionKey'])
SIZE = 32


def load(rel):
    """An image of the game (img/... without extension), decrypted if needed."""
    for ext in ('.png', '.rpgmvp'):
        path = os.path.join(WWW, 'img', rel + ext)
        if os.path.exists(path):
            raw = open(path, 'rb').read()
            if ext == '.rpgmvp':
                body = bytearray(raw[16:])
                for i in range(16):
                    body[i] ^= KEY[i]
                raw = bytes(body)
            return Image.open(BytesIO(raw)).convert('RGBA')
    return None


def fit(img, size=SIZE):
    box = img.getbbox()
    if box:
        img = img.crop(box)
    img.thumbnail((size, size), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(img, ((size - img.width) // 2, (size - img.height) // 2), img)
    return out


def code(text):
    return re.sub(r'[^a-z0-9]+', '_', text.lower()).strip('_')


count = 0
iconset = load('system/IconSet')
if iconset:
    cell = iconset.width // 16
    def save_icon(index, name):
        global count
        x, y = (index % 16) * cell, (index // 16) * cell
        fit(iconset.crop((x, y, x + cell, y + cell))).save(os.path.join(OUT, name))
        count += 1
    for kind, table in (('item', J('Items')), ('weapon', J('Weapons')), ('armor', J('Armors')), ('skill', J('Skills'))):
        for x in table:
            if x and x.get('iconIndex'):
                save_icon(x['iconIndex'], f"{kind}_{x['id']}.png")
# creatures (bestiary and bosses): their whole battler, 64 px
CREATURES = {
    'Assassin spectre': 'assassinghost', 'Asterisk': 'asterisk1', 'Beheaded wizard': 'wizardhead',
    'Black witch': 'black_witch_head', 'Blight': 'blight2', 'Bloody man': 'bloody_man', 'Body snatcher': 'tomb_raider',
    'Brain flower': 'guard_flower', 'Butterfly': 'butterfly1', 'Cave spider': 'spider', 'Cavedweller': 'dweller1',
    'Cavegnome': 'cavegnome', 'Cavemother': 'cavemother2', 'Crow Mauler': 'mauler', 'Elite guard': 'eliteguard',
    'Embryo': 'uterus_embryo1', 'Female molded': 'molded1', 'Francois': 'francois', 'Gaunt knight': 'seril',
    'Greater blight': 'greater_blight1', 'Greater mumbler': 'greater_mumbler', 'Gro-goroth': 'gro_goroth',
    'Guard': 'guard1', 'Harvestman': 'harvestman', 'Hydra': 'hydra_body', 'Iron Shakespeare': 'iron_shakespere',
    'Isayah': 'isayah_head', 'Jaggedjaw': 'jaggedjaw', 'Knight spectre': 'tallknight2', 'Lizardman': 'lizard1',
    'Lord of flies': 'bodysnatcher4', 'Male molded': 'molded2', 'Maneba': 'maneba', 'Miner spectre': 'minerghost',
    'Moonless guard': 'moonless_guard', 'Mumbler': 'mumbler', 'Nameless': 'nameless', 'Night lurch': 'night_lurch',
    'Old guardian': 'nameless2', 'Old knight': 'tallknight', 'Priest': 'priest', 'Prisoner': 'ghoul_head',
    'Red man': 'red_man', 'Salmonsnake': 'salmon_snake', 'Scarab': 'scarab2', 'Ser Seymor': 'seymor',
    'Skeleton': 'skeleton', 'Skin granny': 'skin_granny2', 'Sylvian': 'gigaloth', 'Tormented one': 'tormented_one',
    'Trortur': 'trorrfull_enemy', 'Uterus': 'uterus', 'Valteil': 'valteil', 'White angel': 'white_angel',
    'Yellow lizardmage': 'yellow_lizard1', 'Yellow mage': 'yellow_mage'}
for l in DATA['locations']:
    if l['type'] not in ('bestiary', 'boss'):
        continue
    img = load('enemies/' + CREATURES.get(l['creature'], ''))
    out = os.path.join(OUT, f"beast_{code(l['creature'])}.png")
    if img and not os.path.exists(out):
        fit(img, 64).save(out)
        count += 1
# companions: their face
actors = J('Actors')
for l in DATA['locations']:
    if l['type'] in ('recruit', 'marriage'):
        a = actors[l['actor']]
        faces = load('faces/' + a['faceName'])
        if faces:
            w, h = faces.width // 4, faces.height // 2
            i = a['faceIndex']
            fit(faces.crop(((i % 4) * w, (i // 4) * h, (i % 4 + 1) * w, (i // 4 + 1) * h))).save(
                os.path.join(OUT, f"actor_{a['id']}.png"))
            count += 1
print(f'{count} icons in {OUT}')

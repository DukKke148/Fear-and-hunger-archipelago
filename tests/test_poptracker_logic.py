"""Compares the PopTracker pack logic (Lua) with the apworld logic on random item states.

usage (from the Archipelago folder): python test_poptracker_logic.py <pack dir> [runs]
"""
import random, sys, os
sys.path.insert(0, os.getcwd())
from argparse import Namespace
import lupa
from BaseClasses import MultiWorld, CollectionState
from worlds import AutoWorld
from worlds.AutoWorld import call_all

PACK = sys.argv[1]
RUNS = int(sys.argv[2]) if len(sys.argv) > 2 else 6
GAME = "Fear & Hunger"
world_type = AutoWorld.AutoWorldRegister.world_types[GAME]

def build(options, seed):
    mw = MultiWorld(1)
    mw.game[1] = GAME
    mw.player_name = {1: "Julien"}
    mw.set_seed(seed)
    args = Namespace()
    for name, option in world_type.options_dataclass.type_hints.items():
        setattr(args, name, {1: option.from_any(options.get(name, option.default))})
    mw.set_options(args)
    mw.state = CollectionState(mw)
    for step in ("generate_early", "create_regions", "create_items", "set_rules", "connect_entrances",
                 "generate_basic"):
        call_all(mw, step)
    return mw

def lua_runtime(world, slot_data, received, held_keys):
    L = lupa.LuaRuntime(unpack_returned_tuples=True)
    counts = {}
    for code, n in held_keys.items():
        counts[code] = n
    def provider(_self, code):
        return counts.get(code, 0)
    L.globals().py_provider = provider
    L.execute('Tracker = {}; function Tracker:ProviderCountForCode(c) return py_provider(self, c) end')
    L.execute(open(os.path.join(PACK, 'scripts/data.lua'), encoding='utf-8').read())
    L.execute(open(os.path.join(PACK, 'scripts/logic.lua'), encoding='utf-8').read())
    g = L.globals()
    for k in ("floor_access", "randomize_keys", "logic", "logic_difficulty", "spawn_mode"):
        g.OPTIONS[k] = int(slot_data[k])
    for k in ("cooking_requires_unlock", "alchemy_requires_unlock"):
        g.OPTIONS[k] = bool(slot_data[k])
    for i in slot_data["extra_base"]:
        g.ALWAYS[g.ITEM_NAMES[i]] = True
    for s, a in slot_data["troop_map"].items():
        g.TROOP_MAP[int(s)] = int(a)
    for name, n in received.items():
        g.RECEIVED[name] = n
    g.setup_logic()
    return g

CONFIGS = [
    dict(randomize_keys="full"),
    dict(randomize_keys="full", floor_access="per_floor", logic_difficulty="strict"),
    dict(randomize_keys="full", enemy_shuffle="chaos", crafting_checks=True, cooking_checks=True,
         cooking_requires_unlock=True, spawn_mode="anywhere"),
    dict(randomize_keys="full", logic="none", floor_access="off", troop_checks=False),
    dict(hardcore=True, crafting_checks=True, marriage_check=True),
    dict(randomize_keys="extra", crafting_checks=True),   # extra: the pack also needs the keys held
]
bad = 0
total = 0
for ci, opts in enumerate(CONFIGS):
    for run in range(RUNS):
        mw = build(dict(opts), 1000 * ci + run)
        world = mw.worlds[1]
        slot_data = world.fill_slot_data()
        pool = list(mw.itempool)
        rnd = random.Random(run * 7 + ci)
        share = [0.0, 0.25, 0.5, 0.75, 1.0][run % 5] if run < 5 else rnd.random()
        chosen = [it for it in pool if rnd.random() < share]
        state = CollectionState(mw)  # already holds the starting items
        received = {}
        for it in mw.precollected_items[1]:  # the server sends them like any received item
            received[it.name] = received.get(it.name, 0) + 1
        for it in chosen:
            state.collect(it, True)
            # the apworld only counts progression copies; in the game (and the pack) any copy unlocks the item,
            # so compare the logic itself on the progression copies
            if it.advancement:
                received[it.name] = received.get(it.name, 0) + 1
        # extra / off keys: the apworld ignores keys; the pack needs them held, so hold all of them
        key_names = sys.modules[world_type.__module__].KEY_NAMES
        if world.options.randomize_keys.value != 2:
            held = {f"key_{k}": 1 for k in key_names}
        else:
            held = {f"key_{k}": received.get(name, 0) for k, name in key_names.items()}
        g = lua_runtime(world, slot_data, received, held)
        mism = []
        for loc in mw.get_locations(1):
            if loc.address is None:
                continue
            ap = loc.can_reach(state)
            pt = bool(g.can(loc.address))
            total += 1
            if ap != pt:
                mism.append((loc.name, ap, pt))
        bad += len(mism)
        print(f"config {ci} run {run} items {len(chosen)}/{len(pool)}: {len(mism)} differences", mism[:4])
print(f"{total - bad} / {total} locations agree")
sys.exit(1 if bad else 0)

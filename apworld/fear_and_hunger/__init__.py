"""Fear & Hunger (v1.4.1) for Archipelago, v0.2.0.

Checks: first entry in each zone, bestiary, bosses, enemy groups, key item pickups, endings, skills, and
optionally recruits, marriage, cooking and crafting.
Items: unlocks. A received weapon, armor, consumable or book is never given directly: it starts spawning
in the dungeon (furniture, chests, items on the floor, boss loot) in every new run.
Key items stay where the game puts them, so the game itself guarantees access to every zone.
"""
import json
import pkgutil
from collections import defaultdict
from typing import Any, Dict, List

from BaseClasses import Item, ItemClassification, Location, LocationProgressType, Region, Tutorial
from worlds.AutoWorld import WebWorld, World
from worlds.generic.Rules import add_rule

from Options import OptionError

from .options import (EnemyShuffle, FearAndHungerOptions, FloorAccess, Goal, Logic, LogicDifficulty,
                      RandomizeKeys, SpawnMode, WeaponShuffle)

EXTRA_SMALL_KEYS = 5  # Small keys sent by the multiworld in 'extra' mode

DATA: Dict[str, Any] = json.loads(pkgutil.get_data(__name__, "data/fh_data.json").decode("utf-8"))
ITEMS: Dict[str, Dict[str, Any]] = {i["name"]: i for i in DATA["items"]}
LOCATIONS: Dict[str, Dict[str, Any]] = {loc["name"]: loc for loc in DATA["locations"]}
TROOPS: Dict[int, Dict[str, Any]] = {t["id"]: t for t in DATA["troops"]}
GEAR = sorted(n for n, i in ITEMS.items() if i["classification"] == "progression" and i["cat"] == "gear")
KEY_NAMES = {i["db_id"]: n for n, i in ITEMS.items() if i["cat"] == "key"}
ACCESS_NAMES = {i["db_id"]: n for n, i in ITEMS.items() if i["cat"] == "access"}  # tier -> item name
ITEMS_BY_ID = {i["id"]: i for i in DATA["items"]}
# The game's Hard mode, which hardcore asks for (checked in the game's own events): it empties the events of the
# Girl, Cahara, D'arce and Enki, so they cannot be recruited, and endings A and C (which need the Girl, or Le'garde
# alive in the party) cannot be reached; neither can Asterisk, the god Le'garde fought at the end of ending C.
# Other difficulty limits do not matter outside hardcore: every run can be played in another difficulty (the
# Traces of Sylvian need Terror & Starvation or Hard, the S endings need Hard) and checks carry over.
NOT_IN_HARD_MODE = {"Ending A", "Ending C", "Bestiary: Asterisk", "Recruit the Girl", "Recruit Cahara",
                    "Recruit D'arce", "Recruit Enki", "Recruit Le'garde"}
ALL_GOAL_ENDINGS = list("ABCDS")
HARD_MODE_GOAL_ENDINGS = [e for e in ALL_GOAL_ENDINGS if f"Ending {e}" not in NOT_IN_HARD_MODE]
# fights that only happen on some routes or difficulties (companions turning hostile, end-game fights): never
# swapped by the enemy shuffle, or an enemy group sent there could never be fought
FIXED_TROOP_CLASSES = {"companion", "endgame"}
# genocide goal: every creature of the bestiary and every boss, killed at least once over all runs
GENOCIDE = [loc for loc in DATA["locations"] if loc["type"] in ("bestiary", "boss")]
EXPLOSIVE_VIAL = "Explosive vial"  # blows up the collapsed hallways
FLOOR_ACCESS_NAMES = {int(f): ITEMS_BY_ID[i]["name"] for f, i in DATA["floor_items"].items()}  # floor -> item
SMALL_KEY = KEY_NAMES[20]

# Tiers: 1 Part 1 (levels 1-3), 2 Part 2 (4-6), 3 Part 3 (7-8), 4 Ma'habre, 5 End (ancient city, 9-10).
# Smart logic: unique weapons/armors unlocked needed to count each tier as reachable.
# Tune these after playing: they are only estimates.
TIER_COUNT = 5
TIER_GEAR = {
    LogicDifficulty.option_relaxed: {1: 0, 2: 6, 3: 10, 4: 14, 5: 18},
    LogicDifficulty.option_normal: {1: 0, 2: 4, 3: 7, 4: 10, 5: 13},
    LogicDifficulty.option_strict: {1: 0, 2: 2, 3: 4, 4: 6, 5: 8},
}
BOSS_EXTRA = {LogicDifficulty.option_relaxed: 3, LogicDifficulty.option_normal: 2, LogicDifficulty.option_strict: 1}

CLASSIFICATION = {"progression": ItemClassification.progression, "useful": ItemClassification.useful,
                  "filler": ItemClassification.filler, "trap": ItemClassification.trap}


class FearAndHungerItem(Item):
    game = "Fear & Hunger"


class FearAndHungerLocation(Location):
    game = "Fear & Hunger"


class FearAndHungerWeb(WebWorld):
    tutorials = [Tutorial(
        "Multiworld Setup Guide",
        "How to install the Fear & Hunger plugin and connect to a multiworld.",
        "English", "setup_en.md", "setup/en", ["Julien"],
    )]


class FearAndHungerWorld(World):
    """
    Fear & Hunger is a brutal dungeon crawler. In this randomizer your friends unlock the weapons,
    armors and supplies that can spawn in the dungeon, and you unlock theirs by surviving it.
    """
    game = "Fear & Hunger"
    web = FearAndHungerWeb()
    options_dataclass = FearAndHungerOptions
    options: FearAndHungerOptions
    topology_present = False

    item_name_to_id = {name: i["id"] for name, i in ITEMS.items()}
    location_name_to_id = {name: loc["id"] for name, loc in LOCATIONS.items()}
    item_name_groups = {
        "Gear": set(GEAR),
        "Weapons": {n for n, i in ITEMS.items() if i["kind"] == "weapon"},
        "Armors": {n for n, i in ITEMS.items() if i["kind"] == "armor"},
        "Books": {n for n, i in ITEMS.items() if i["cat"] == "book"},
        "Consumables": {n for n, i in ITEMS.items() if i["cat"] == "consumable"},
        "Keys": {n for n, i in ITEMS.items() if i["cat"] == "key"},
        "Access": {n for n, i in ITEMS.items() if i["cat"] in ("access", "access_floor")},
    }
    location_name_groups = {
        t.capitalize(): {n for n, loc in LOCATIONS.items() if loc["type"] == t}
        for t in ("zone", "bestiary", "boss", "troop", "key", "ending", "skill", "recruit", "cook", "craft")
    }
    location_name_groups["Other endings"] = {n for n, loc in LOCATIONS.items() if loc["type"] == "ending_extra"}

    # ------------------------------------------------------------------ shuffles
    def generate_early(self) -> None:
        opt = self.options
        if opt.hardcore:
            opt.logic_difficulty.value = LogicDifficulty.option_strict
            opt.randomize_keys.value = RandomizeKeys.option_full
            opt.floor_access.value = FloorAccess.option_per_floor
            opt.spawn_mode.value = SpawnMode.option_anywhere
            opt.enemy_shuffle.value = EnemyShuffle.option_chaos
            opt.weapon_shuffle.value = WeaponShuffle.option_swap_items
            opt.trades_require_unlock.value = 1
            opt.cooking_requires_unlock.value = 1
            opt.alchemy_requires_unlock.value = 1
        endings = self._goal_endings()
        wrong = sorted(set(opt.required_endings.value) - set(endings))
        if wrong:
            raise OptionError(f"{self.player_name}: ending(s) {', '.join(wrong)} cannot be reached in hardcore, "
                              f"which is played in the game's Hard mode (possible: {', '.join(endings)})")
        # unlocks needed by the enabled cooking / crafting checks: they become progression
        self.always: set = set()  # unlocks not in the pool: always available (filled by create_items)
        self.recipe_needs: set = set()
        for loc in self._recipe_locations():
            self.recipe_needs |= set(self._recipe_items(loc)[0]) | set(self._recipe_items(loc)[1])
        # collapsed hallways: the Hidden backyard and the Thickets are only reached by blowing one up
        if any(loc.get("explosive") and self._enabled(loc) for loc in DATA["locations"]):
            self.recipe_needs.add(EXPLOSIVE_VIAL)
        # enemy groups: slot troop (where the fight is) -> troop actually fought
        pools = {1: {"mob"}, 2: {"mob", "boss"}, 3: {"mob", "boss", "companion", "endgame"} - FIXED_TROOP_CLASSES}
        self.troop_map: Dict[int, int] = {}
        if opt.enemy_shuffle.value:
            pool = sorted(t["id"] for t in DATA["troops"]
                          if t["cls"] in pools[opt.enemy_shuffle.value] and not t["unsafe"])
            shuffled = pool[:]
            self.random.shuffle(shuffled)
            self.troop_map = dict(zip(pool, shuffled))
        # tier where each troop is fought after the shuffle
        self.troop_tier: Dict[int, int] = {}
        self.troop_floor: Dict[int, int] = {}
        for t in DATA["troops"]:
            self.troop_tier[t["id"]] = t["tier"]
            self.troop_floor[t["id"]] = t.get("floor", 1)
        for slot, actual in self.troop_map.items():
            # a troop is as hard as it naturally is, and as deep as the place it now appears
            self.troop_tier[actual] = max(TROOPS[slot]["tier"], TROOPS[actual]["tier"])
            self.troop_floor[actual] = max(TROOPS[slot].get("floor", 1), TROOPS[actual].get("floor", 1))
        # weapons / armors
        self.weapon_map: Dict[str, Dict[str, int]] = {"w": {}, "a": {}}
        if opt.weapon_shuffle.value:
            ws = DATA["shuffle_weapons"][:]
            self.random.shuffle(ws)
            self.weapon_map["w"] = {str(a): b for a, b in zip(DATA["shuffle_weapons"], ws)}
            by_slot = defaultdict(list)
            for i in ITEMS.values():
                if i["kind"] == "armor" and i["db_id"] in DATA["shuffle_armors"]:
                    by_slot[i["etype"]].append(i["db_id"])
            for ids in by_slot.values():
                ids.sort()
                s = ids[:]
                self.random.shuffle(s)
                self.weapon_map["a"].update({str(a): b for a, b in zip(ids, s)})

    # ------------------------------------------------------------------ locations
    def _enabled(self, loc: Dict[str, Any]) -> bool:
        t, o = loc["type"], self.options
        if o.hardcore and loc["name"] in NOT_IN_HARD_MODE:
            return False
        return {"troop": o.troop_checks, "skill": o.skill_checks, "recruit": o.recruit_checks,
                "marriage": o.marriage_check, "cook": o.cooking_checks, "craft": o.crafting_checks}.get(t, True)

    def _goal_endings(self) -> List[str]:
        return HARD_MODE_GOAL_ENDINGS if self.options.hardcore else ALL_GOAL_ENDINGS

    def _genocide(self) -> List[Dict[str, Any]]:
        return [loc for loc in GENOCIDE if self._enabled(loc)]

    def _recipe_locations(self) -> List[Dict[str, Any]]:
        return [loc for loc in DATA["locations"] if loc["type"] in ("cook", "craft") and self._enabled(loc)]

    def _recipe_items(self, loc: Dict[str, Any]) -> tuple:
        """(any one of these books, all of these items) needed to make a recipe for real."""
        books = [ITEMS_BY_ID[b]["name"] for b in loc["books"]]
        needed = [ITEMS_BY_ID[i]["name"] for i in loc["ingredients"]]
        unlock = self.options.cooking_requires_unlock if loc["type"] == "cook" else \
            self.options.alchemy_requires_unlock
        if unlock and loc.get("result_item") and loc["result_item"] not in loc["ingredients"]:
            needed.append(ITEMS_BY_ID[loc["result_item"]]["name"])
        return books, needed

    def _location_floor(self, loc: Dict[str, Any]) -> int:
        t = loc["type"]
        if t == "troop":
            return self.troop_floor[loc["troop"]]
        if t in ("bestiary", "boss"):
            fl = [self.troop_floor[tr["id"]] for tr in DATA["troops"] if loc["creature"] in tr["creatures"]]
            return min(fl) if fl else loc["floor"]
        return loc["floor"]

    def _steps(self) -> List[tuple]:
        """Ordered logic regions (name, tier, access item or None): the 12 floors, or the 5 parts."""
        mode = self.options.floor_access.value
        if mode == FloorAccess.option_per_floor:
            return [(DATA["floors"][str(f)], DATA["floor_tier"][str(f)], FLOOR_ACCESS_NAMES.get(f))
                    for f in sorted(int(k) for k in DATA["floors"])]
        return [(DATA["tiers"][str(t)], t, ACCESS_NAMES.get(t) if mode else None) for t in range(1, TIER_COUNT + 1)]

    def _location_tier(self, loc: Dict[str, Any]) -> int:
        t = loc["type"]
        if t == "troop":
            return self.troop_tier[loc["troop"]]
        if t in ("bestiary", "boss"):
            tiers = [self.troop_tier[tr["id"]] for tr in DATA["troops"] if loc["creature"] in tr["creatures"]]
            return min(tiers) if tiers else loc["tier"]
        return loc["tier"]

    def create_regions(self) -> None:
        menu = Region("Menu", self.player, self.multiworld)
        steps = self._steps()
        regions = [Region(name, self.player, self.multiworld) for name, _, _ in steps]
        self.multiworld.regions += [menu] + regions
        menu.connect(regions[0])
        smart = self.options.logic.value == Logic.option_smart
        need = TIER_GEAR[self.options.logic_difficulty.value]
        for i in range(1, len(steps)):
            name, tier, item = steps[i]
            n = need[tier]
            def rule(state, n=n, item=item):
                if item and not state.has(item, self.player):
                    return False
                return not smart or state.has_from_list_unique(GEAR, self.player, n)
            regions[i - 1].connect(regions[i], f"Descend to {name}", rule if (smart or item) else None)
        per_floor = self.options.floor_access.value == FloorAccess.option_per_floor
        extra = BOSS_EXTRA[self.options.logic_difficulty.value]
        self.location_count = 0
        ending_place: Dict[str, Any] = {}  # ending name -> (region, tier) of its check
        for loc in DATA["locations"]:
            if not self._enabled(loc):
                continue
            tier = self._location_tier(loc)
            if per_floor:
                step = self._location_floor(loc) - 1
                tier = max(tier, steps[step][1])
            else:
                step = tier - 1
            if loc["type"] == "skill" and self.options.spawn_mode.value != 0:
                step = len(steps) - 1  # the scroll can spawn at any depth: count on it only at the end
                tier = steps[step][1]
            region = regions[step]
            ending_place[loc["name"]] = (region, tier)
            location = FearAndHungerLocation(self.player, loc["name"], loc["id"], region)
            region.locations.append(location)
            self.location_count += 1
            if self.options.randomize_keys.value == RandomizeKeys.option_full and (loc["keys"] or loc["small_keys"]):
                keys = [KEY_NAMES[k] for k in loc["keys"]]
                small = loc["small_keys"]
                add_rule(location, lambda state, keys=keys, small=small:
                         state.has_all(keys, self.player) and (not small or state.has(SMALL_KEY, self.player, small)))
            if loc["type"] == "skill":
                scroll = ITEMS_BY_ID[loc["scroll"]]["name"]
                add_rule(location, lambda state, scroll=scroll: state.has(scroll, self.player))
            if loc["type"] in ("cook", "craft"):
                books, needed = self._recipe_items(loc)
                add_rule(location, lambda state, books=books, needed=needed:
                         (not books or any(state.has(b, self.player) or b in self.always for b in books))
                         and all(state.has(n, self.player) or n in self.always for n in needed))
            if loc.get("explosive"):
                add_rule(location, lambda state: state.has(EXPLOSIVE_VIAL, self.player) or EXPLOSIVE_VIAL in self.always)
            if loc["type"] == "marriage":
                location.progress_type = LocationProgressType.EXCLUDED
            if smart and loc["type"] in ("boss", "ending", "ending_extra"):
                n = min(len(GEAR), need[tier] + extra)
                add_rule(location, lambda state, n=n: state.has_from_list_unique(GEAR, self.player, n))
            if loc["type"] in ("ending", "ending_extra") and not self.options.endings_hold_progression:
                location.progress_type = LocationProgressType.EXCLUDED
        # goal events, one per ending
        for loc in DATA["locations"]:
            if loc["type"] == "ending" and loc["name"] in ending_place:
                region, tier = ending_place[loc["name"]]
                event = FearAndHungerLocation(self.player, loc["name"] + " (goal)", None, region)
                event.place_locked_item(FearAndHungerItem(loc["name"] + " reached", ItemClassification.progression,
                                                          None, self.player))
                if smart:
                    n = min(len(GEAR), need[tier] + extra)
                    add_rule(event, lambda state, n=n: state.has_from_list_unique(GEAR, self.player, n))
                if self.options.randomize_keys.value == RandomizeKeys.option_full:
                    keys = [KEY_NAMES[k] for k in loc["keys"]]
                    small = loc["small_keys"]
                    add_rule(event, lambda state, keys=keys, small=small:
                             state.has_all(keys, self.player) and state.has(SMALL_KEY, self.player, small))
                region.locations.append(event)
        if self.options.goal.value == Goal.option_genocide:
            # reachable once every creature is: the plugin checks that they all died in the same run
            names = [loc["name"] for loc in self._genocide()]
            event = FearAndHungerLocation(self.player, "Genocide (goal)", None, regions[-1])
            event.place_locked_item(FearAndHungerItem("Genocide done", ItemClassification.progression, None,
                                                      self.player))
            add_rule(event, lambda state: all(state.can_reach_location(n, self.player) for n in names))
            regions[-1].locations.append(event)

    # ------------------------------------------------------------------ items
    def create_items(self) -> None:
        total = self.location_count
        # keys and floor access first: they are what the logic needs
        pool = []
        if self.options.randomize_keys.value == RandomizeKeys.option_full:
            for i in ITEMS.values():
                if i["cat"] == "key":
                    copies = i["copies"]
                    if i["db_id"] == 20 and self.multiworld.players == 1:
                        # alone, only about six checks are open at the start and the rest of level 1 is behind 7
                        # Small key doors: the generator cannot fit them, so you start with those 7 keys
                        start = DATA["small_keys_by_tier"]["1"]
                        for _ in range(start):
                            self.multiworld.push_precollected(self.create_item(i["name"]))
                        copies -= start
                    pool += [self.create_item(i["name"]) for _ in range(copies)]
        elif self.options.randomize_keys.value == RandomizeKeys.option_extra:
            # bonus keys: the game still has every key at its usual spot, so they are not progression
            for i in ITEMS.values():
                if i["cat"] == "key":
                    copies = EXTRA_SMALL_KEYS if i["db_id"] == 20 else 1
                    pool += [self.create_item(i["name"], ItemClassification.useful) for _ in range(copies)]
        if self.options.floor_access.value == FloorAccess.option_per_part:
            pool += [self.create_item(n) for n in ACCESS_NAMES.values()]
        elif self.options.floor_access.value == FloorAccess.option_per_floor:
            pool += [self.create_item(n) for n in FLOOR_ACCESS_NAMES.values()]
        total -= len(pool)
        unlocks = [i for i in ITEMS.values() if i["cat"] in ("gear", "book", "consumable")]
        # what the logic needs comes first, so it is never the part dropped below
        uniques = sorted(unlocks, key=lambda i: (i["name"] not in self.recipe_needs,
                                                 {"gear": 0, "book": 1, "consumable": 2}[i["cat"]], i["id"]))
        self.extra_base: List[int] = []
        self.always: set = set()  # unlocks not in the pool: always available
        if total < len(uniques):
            # not enough checks for every unlock: the least important consumables become always available
            keep, dropped = uniques[:total], uniques[total:]
            self.extra_base = [i["id"] for i in dropped]
            self.always = {i["name"] for i in dropped}
            uniques = keep
        first = len(pool)
        skill_scrolls = {i["name"] for i in ITEMS.values() if i.get("teaches")} if self.options.skill_checks else set()
        needed = skill_scrolls | self.recipe_needs
        pool += [self.create_item(i["name"], ItemClassification.progression if i["name"] in needed else None)
                 for i in uniques]
        total += first
        # second copy of each gear piece (a second guaranteed spawn per run), then supplies
        for i in uniques:
            if len(pool) >= total:
                break
            if i["cat"] == "gear":
                pool.append(self.create_item(i["name"], ItemClassification.useful))
        supplies = [i["name"] for i in ITEMS.values() if i["cat"] in ("consumable", "book")]
        # traps replace a share of the supplies
        weights = {f"Trap: {k}": v for k, v in self.options.trap_weights.value.items() if v > 0}
        n_traps = (total - len(pool)) * self.options.trap_percentage.value // 100 if weights else 0
        if n_traps:
            names = sorted(weights)
            pool += [self.create_item(n) for n in self.random.choices(names, [weights[n] for n in names], k=n_traps)]
        while len(pool) < total:
            pool.append(self.create_item(self.random.choice(supplies)))
        self.multiworld.itempool += pool

    def set_rules(self) -> None:
        if self.options.goal.value == Goal.option_genocide:
            self.multiworld.completion_condition[self.player] = lambda state: state.has("Genocide done", self.player)
            return
        events = [f"Ending {e} reached" for e in self._goal_endings()]
        required = sorted(self.options.required_endings.value)
        if required:
            needed = [f"Ending {e} reached" for e in required]
            self.multiworld.completion_condition[self.player] = lambda state: state.has_all(needed, self.player)
        else:
            n = min(self.options.endings_required.value, len(events))
            self.multiworld.completion_condition[self.player] = \
                lambda state: sum(state.has(e, self.player) for e in events) >= n

    def create_item(self, name: str, classification: ItemClassification = None) -> FearAndHungerItem:
        data = ITEMS[name]
        return FearAndHungerItem(name, classification or CLASSIFICATION[data["classification"]], data["id"],
                                 self.player)

    def get_filler_item_name(self) -> str:
        return self.random.choice([i["name"] for i in ITEMS.values() if i["cat"] == "consumable"])

    def fill_slot_data(self) -> Dict[str, Any]:
        return {
            "data_version": DATA["data_version"],
            "goal": self.options.goal.value,  # 0 endings, 1 genocide
            "hard_mode": bool(self.options.hardcore.value),  # every run must be played in the game's Hard mode
            "genocide_targets": [loc["id"] for loc in self._genocide()]
            if self.options.goal.value == Goal.option_genocide else [],
            "endings_required": min(self.options.endings_required.value,
                                    len(self._goal_endings())),
            "required_endings": sorted(self.options.required_endings.value),
            "auto_release_collect": bool(self.options.auto_release_collect.value),
            "randomize_keys": self.options.randomize_keys.value,  # 0 off, 1 extra, 2 full
            "skill_checks": bool(self.options.skill_checks.value),
            "floor_access": self.options.floor_access.value,  # 0 off, 1 per part, 2 per floor
            "spawn_mode": self.options.spawn_mode.value,
            "troop_map": {str(k): v for k, v in self.troop_map.items() if k != v},
            "weapon_shuffle": self.options.weapon_shuffle.value,
            "weapon_map": self.weapon_map,
            "extra_base": self.extra_base,  # AP item ids that are always available
            "death_link": bool(self.options.death_link.value),
            "recruit_checks": bool(self.options.recruit_checks.value),
            "marriage_check": bool(self.options.marriage_check.value),
            "cooking_checks": bool(self.options.cooking_checks.value),
            "crafting_checks": bool(self.options.crafting_checks.value),
            "trades_require_unlock": bool(self.options.trades_require_unlock.value),
            "cooking_requires_unlock": bool(self.options.cooking_requires_unlock.value),
            "alchemy_requires_unlock": bool(self.options.alchemy_requires_unlock.value),
            "hardcore": bool(self.options.hardcore.value),
            # the options the hardcore mode may have changed
            "logic_difficulty": self.options.logic_difficulty.value,
            "logic": self.options.logic.value,  # 0 smart, 1 none (read by the tracker pack)
        }


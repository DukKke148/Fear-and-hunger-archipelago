"""Generation tests: each class builds a world with its options, then Archipelago's own checks run on it
(everything reachable with all items, something reachable with none, a full fill that can beat the game)."""
from Fill import distribute_items_restrictive
from Options import OptionError
from worlds.AutoWorld import call_all

from . import FearAndHungerTestBase
from .. import DATA, GENOCIDE, TROOPS


def creature_checks(world, kind):
    return {loc.name for loc in world.multiworld.get_locations(world.player) if loc.name.startswith(kind)}


def names(world):
    return {loc.name for loc in world.multiworld.get_locations(world.player)}


class TestDefault(FearAndHungerTestBase):
    def test_location_count(self) -> None:
        self.assertEqual(308, len([loc for loc in self.multiworld.get_locations() if loc.address]))

    def test_fear_and_hunger_difficulty(self) -> None:
        n = names(self.world)
        self.assertNotIn("Defeat Sylvian", n)  # The Void 2 needs Terror & Starvation or Hard
        self.assertFalse({x for x in n if x.startswith("Ending S")})  # Hard only
        for x in ("Ending A", "Ending C", "Bestiary: Asterisk", "Recruit the Girl"):
            self.assertIn(x, n)

    def test_removed_checks(self) -> None:
        names = {loc.name for loc in self.multiworld.get_locations()}
        for name in ("Defeat Beheaded wizard", "Defeat Knight spectre", "Group: Priest3", "Group: Ballista1",
                     "Group: Trorrtur2", "Defeat Uterus"):
            self.assertNotIn(name, names)

    def test_hunger_is_the_most_common_trap(self) -> None:
        weights = self.world.options.trap_weights.value
        self.assertEqual(max(weights.values()), weights["Hunger"])
        self.assertEqual(1, list(weights.values()).count(weights["Hunger"]))


class TestHardcore(FearAndHungerTestBase):
    options = {"hardcore": True}

    def test_overrides_but_not_traps(self) -> None:
        o = self.world.options
        self.assertEqual("full", o.randomize_keys.current_key)
        self.assertEqual("per_floor", o.floor_access.current_key)
        self.assertEqual("chaos", o.enemy_shuffle.current_key)
        self.assertEqual(o.trap_percentage.default, o.trap_percentage.value)

    def test_alone_starts_with_the_level_1_small_keys(self) -> None:
        start = [i for i in self.multiworld.precollected_items[self.player] if i.name == "Small key"]
        pool = [i for i in self.multiworld.itempool if i.name == "Small key"]
        self.assertEqual(DATA["small_keys_by_tier"]["1"], len(start))
        self.assertEqual(DATA["small_key_copies"], len(start) + len(pool))


class TestHardcoreManySeeds(FearAndHungerTestBase):
    """Playing alone in hardcore used to fail about one generation in four."""
    options = {"hardcore": True}
    run_default_tests = False

    def test_fills(self) -> None:
        for seed in range(1, 11):
            with self.subTest(seed=seed):
                self.world_setup(seed)
                distribute_items_restrictive(self.multiworld)
                call_all(self.multiworld, "post_fill")
                self.assertTrue(self.multiworld.can_beat_game(self.multiworld.state), f"seed {seed}")


class TestHardcoreHardDifficultyManySeeds(TestHardcoreManySeeds):
    options = {"hardcore": True, "difficulty": "hard"}


class TestGenocide(FearAndHungerTestBase):
    options = {"goal": "genocide"}

    def test_targets(self) -> None:
        targets = self.world.fill_slot_data()["genocide_targets"]
        expected = (creature_checks(self.world, "Bestiary: ") | creature_checks(self.world, "Defeat ")) - \
            {"Defeat Gro-goroth", "Bestiary: Asterisk"}  # their fight ends the game (endings B and C)
        self.assertEqual(51, len(targets))
        self.assertEqual({self.multiworld.get_location(n, self.player).address for n in expected}, set(targets))


class TestGenocideTerror(FearAndHungerTestBase):
    options = {"goal": "genocide", "difficulty": "terror_and_starvation"}

    def test_sylvian_counts(self) -> None:
        targets = self.world.fill_slot_data()["genocide_targets"]
        self.assertEqual(52, len(targets))
        self.assertIn(self.multiworld.get_location("Defeat Sylvian", self.player).address, targets)


class TestGenocideHardcore(FearAndHungerTestBase):
    options = {"goal": "genocide", "hardcore": True, "difficulty": "hard"}

    def test_targets(self) -> None:
        self.assertEqual(52, len(self.world.fill_slot_data()["genocide_targets"]))


class TestTerror(FearAndHungerTestBase):
    options = {"difficulty": "terror_and_starvation", "endings_required": 4}

    def test_checks(self) -> None:
        n = names(self.world)
        self.assertIn("Defeat Sylvian", n)
        self.assertFalse({x for x in n if x.startswith("Ending S")})


class TestHard(FearAndHungerTestBase):
    options = {"difficulty": "hard", "endings_required": 5}

    def test_checks(self) -> None:
        n = names(self.world)
        for x in ("Ending A", "Ending C", "Bestiary: Asterisk", "Recruit the Girl", "Recruit Cahara",
                  "Recruit D'arce", "Recruit Enki", "Recruit Le'garde"):
            self.assertNotIn(x, n)
        for x in ("Defeat Sylvian", "Ending S", "Ending S as Mercenary", "Ending B", "Ending D"):
            self.assertIn(x, n)

    def test_endings_required_is_capped(self) -> None:
        self.assertEqual(3, self.world.fill_slot_data()["endings_required"])  # B, D and S


class TestHardImpossibleEnding(FearAndHungerTestBase):
    """Ending A cannot be reached in Hard: the generation stops with a clear message."""
    options = {"difficulty": "hard", "required_endings": ["A"]}
    auto_construct = False
    run_default_tests = False

    def test_refused(self) -> None:
        with self.assertRaises(OptionError):
            self.world_setup()


class TestChaosKeepsRouteFights(FearAndHungerTestBase):
    options = {"enemy_shuffle": "chaos"}

    def test_route_fights_stay(self) -> None:
        moved = self.world.troop_map
        for tid, t in TROOPS.items():
            if t["cls"] in ("companion", "endgame"):
                self.assertNotIn(tid, moved)
                self.assertNotIn(tid, moved.values())


class TestEveryCheck(FearAndHungerTestBase):
    options = {"recruit_checks": True, "marriage_check": True, "cooking_checks": True, "crafting_checks": True,
               "endings_required": 5}

    def test_location_count(self) -> None:
        self.assertEqual(337, len([loc for loc in self.multiworld.get_locations() if loc.address]))


class TestFewChecks(FearAndHungerTestBase):
    options = {"troop_checks": False, "skill_checks": False, "recruit_checks": False}


class TestFullKeysPerFloor(FearAndHungerTestBase):
    options = {"randomize_keys": "full", "floor_access": "per_floor", "required_endings": ["A", "B"]}


class TestShuffles(FearAndHungerTestBase):
    options = {"enemy_shuffle": "chaos", "weapon_shuffle": "swap_items", "spawn_mode": "anywhere", "logic": "none",
               "trap_percentage": 100}

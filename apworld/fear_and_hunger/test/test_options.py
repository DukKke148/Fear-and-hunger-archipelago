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
        self.assertEqual(314, len([loc for loc in self.multiworld.get_locations() if loc.address]))

    def test_every_difficulty_counts(self) -> None:
        # runs can be played in different difficulties, and checks carry over
        n = names(self.world)
        for x in ("Defeat Sylvian", "Ending S", "Ending A", "Ending C", "Bestiary: Asterisk", "Recruit the Girl"):
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

    def test_hard_mode_checks(self) -> None:
        n = names(self.world)
        for x in ("Ending A", "Ending C", "Bestiary: Asterisk", "Recruit the Girl", "Recruit Cahara",
                  "Recruit D'arce", "Recruit Enki", "Recruit Le'garde"):
            self.assertNotIn(x, n)
        for x in ("Defeat Sylvian", "Ending S", "Ending B", "Ending D"):
            self.assertIn(x, n)
        self.assertTrue(self.world.fill_slot_data()["hard_mode"])

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


class TestGenocide(FearAndHungerTestBase):
    options = {"goal": "genocide"}

    def test_targets(self) -> None:
        targets = self.world.fill_slot_data()["genocide_targets"]
        expected = creature_checks(self.world, "Bestiary: ") | creature_checks(self.world, "Defeat ")
        self.assertEqual(54, len(targets))
        self.assertEqual({self.multiworld.get_location(n, self.player).address for n in expected}, set(targets))
        self.assertFalse(self.world.fill_slot_data()["hard_mode"])


class TestGenocideHardcore(FearAndHungerTestBase):
    options = {"goal": "genocide", "hardcore": True}

    def test_targets(self) -> None:
        self.assertEqual(53, len(self.world.fill_slot_data()["genocide_targets"]))  # no Asterisk in Hard mode


class TestHardcoreEndingsRequired(FearAndHungerTestBase):
    options = {"hardcore": True, "endings_required": 5}

    def test_capped(self) -> None:
        self.assertEqual(3, self.world.fill_slot_data()["endings_required"])  # B, D and S


class TestHardcoreImpossibleEnding(FearAndHungerTestBase):
    """Ending A cannot be reached in Hard mode: the generation stops with a clear message."""
    options = {"hardcore": True, "required_endings": ["A"]}
    auto_construct = False
    run_default_tests = False

    def test_refused(self) -> None:
        with self.assertRaises(OptionError):
            self.world_setup()


class TestEveryCheck(FearAndHungerTestBase):
    options = {"recruit_checks": True, "marriage_check": True, "cooking_checks": True, "crafting_checks": True,
               "endings_required": 5}

    def test_location_count(self) -> None:
        self.assertEqual(343, len([loc for loc in self.multiworld.get_locations() if loc.address]))


class TestFewChecks(FearAndHungerTestBase):
    options = {"troop_checks": False, "skill_checks": False, "recruit_checks": False}


class TestFullKeysPerFloor(FearAndHungerTestBase):
    options = {"randomize_keys": "full", "floor_access": "per_floor", "required_endings": ["A", "S"]}


class TestShuffles(FearAndHungerTestBase):
    options = {"enemy_shuffle": "chaos", "weapon_shuffle": "swap_items", "spawn_mode": "anywhere", "logic": "none",
               "trap_percentage": 100}


class TestChaosKeepsRouteFights(FearAndHungerTestBase):
    options = {"enemy_shuffle": "chaos"}

    def test_route_fights_stay(self) -> None:
        moved = self.world.troop_map
        for tid, t in TROOPS.items():
            if t["cls"] in ("companion", "endgame"):
                self.assertNotIn(tid, moved)
                self.assertNotIn(tid, moved.values())

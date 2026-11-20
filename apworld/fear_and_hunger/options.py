from dataclasses import dataclass

from Options import Choice, DeathLink, DefaultOnToggle, OptionCounter, OptionSet, PerGameCommonOptions, Range, Toggle


class EndingsRequired(Range):
    """
    How many different endings you must reach to finish your goal.
    Endings A, B, C, D and S count (Ending E and the per-character S endings are checks only).
    Several runs are allowed in one multiworld: checks and unlocks carry over, your inventory does not.
    """
    display_name = "Endings Required"
    range_start = 1
    range_end = 5
    default = 1


class RequiredEndings(OptionSet):
    """
    Specific endings you must reach to finish your goal, for example ["A", "S"].
    Leave empty to use Endings Required (any endings) instead.
    Valid values: A, B, C, D, S (Ending E is a check, not a goal).
    """
    display_name = "Required Endings"
    valid_keys = {"A", "B", "C", "D", "S"}
    default = frozenset()


class AutoReleaseCollect(DefaultOnToggle):
    """
    When your goal is complete, the game also asks the server to release your remaining items to your
    friends (!release) and to give you everything that is left for you (!collect).
    Works when the server allows it (release / collect mode "enabled", "goal" or "auto").
    """
    display_name = "Release And Collect On Goal"


class RandomizeKeys(Choice):
    """
    Key items (Small keys, 2F key, Rope, Cube of depths, Maps...).
    off: keys stay where the game puts them; picking one up sends a check.
    extra: same, and the multiworld can also send you keys: each received key is given once, when it
           arrives (not again in later runs). No key logic needed.
    full: keys only come from the multiworld (their usual spot gives nothing but its check) and every
          received key is given back at the start of each run. Strict key logic.
    """
    display_name = "Randomize Keys"
    option_off = 0
    option_extra = 1
    option_full = 2
    alias_false = 0
    alias_true = 2
    default = 1


class FloorAccess(Choice):
    """
    Parts of the dungeon need an access item from the multiworld. Without it, you are sent back as soon as
    you try to move there (falls and cutscenes included; ending sequences are never locked).
    off: everything is open.
    per_part: 4 items - Access: Part 2, Access: Part 3, Access: Ma'habre, Access: End.
    per_floor: 11 items - Access: Level 2 ... Access: Level 10, Access: Ma'habre, Access: Ancient city.
    """
    display_name = "Floor Access"
    option_off = 0
    option_per_part = 1
    option_per_floor = 2
    alias_false = 0
    alias_true = 1
    default = 1


class SkillChecks(DefaultOnToggle):
    """
    Learning a skill is a check (20 skills: Steal, Dash, Lockpicking, Fast attack...), by reading its scroll or
    at a Hexen table for a Lesser soul. The scrolls then count for the logic and spawn once per run, like weapons.
    """
    display_name = "Skill Checks"


class TroopChecks(DefaultOnToggle):
    """
    The first victory against each enemy group (about 140) is a check, on top of the bestiary
    (first victory against each creature), bosses, zones, key items and endings.
    """
    display_name = "Enemy Group Checks"


class Logic(Choice):
    """
    smart: deeper floors and bosses only count as reachable once enough weapons and armors are unlocked,
    so the items your friends need are not stuck behind a fight you cannot win yet.
    none: everything counts as reachable from the start.
    """
    display_name = "Logic"
    option_smart = 0
    option_none = 1
    default = 0


class LogicDifficulty(Choice):
    """
    How much gear the smart logic expects before sending you deeper.
    relaxed: a lot of gear (new players). normal: balanced. strict: little gear (experienced players).
    """
    display_name = "Logic Difficulty"
    option_relaxed = 0
    option_normal = 1
    option_strict = 2
    default = 1


class SpawnMode(Choice):
    """
    Where unlocked weapons and armors appear in each run.
    vanilla_tables: at the depth where the normal game places them (items only found in random loot use by_depth).
    by_depth: anywhere, but strong items are more likely deeper.
    anywhere: any depth, pure chaos.
    """
    display_name = "Spawn Mode"
    option_vanilla_tables = 0
    option_by_depth = 1
    option_anywhere = 2
    default = 0


class EnemyShuffle(Choice):
    """
    Swaps enemy groups with each other for the whole multiworld (the sprite on the map stays the same).
    off: normal enemies.
    mobs_only: normal enemies are swapped with each other.
    mobs_and_bosses: bosses can show up as normal enemies and the other way around.
    chaos: also companions and end-game enemies. Very hard.
    """
    display_name = "Enemy Shuffle"
    option_off = 0
    option_mobs_only = 1
    option_mobs_and_bosses = 2
    option_chaos = 3
    default = 0


class WeaponShuffle(Choice):
    """
    Shuffles weapons and armors (quest weapons, cursed weapons, bows, disguises and special armors excluded).
    off: normal.
    swap_stats: every weapon or armor keeps its name and look but gets the stats of another one.
    swap_items: picking up or starting with a weapon or armor gives another one instead.
    """
    display_name = "Weapon Shuffle"
    option_off = 0
    option_swap_stats = 1
    option_swap_items = 2
    default = 0


class EndingsHoldProgression(Toggle):
    """If off, ending checks only hold filler, so nobody waits on you finishing an ending."""
    display_name = "Endings Hold Progression"


class TrapPercentage(Range):
    """
    Percentage of your filler items (supplies) replaced by traps. Your friends trigger them when they find
    them: you suffer the effect as soon as you are free on the map (never during a cutscene or a dialogue).
    0 = no traps.
    """
    display_name = "Trap Percentage"
    range_start = 0
    range_end = 100
    default = 15


class TrapWeights(OptionCounter):
    """
    How often each trap is picked (0 = never).
    Bleeding, Poison, Infection, Parasites: the status effect (cured as in the normal game).
    Phobia: a random phobia. Hunger: you get hungrier. Fear: you lose mind.
    Torch out: your lit torch dies down (if it is not lit, you lose a Torch instead, if you have one).
    """
    display_name = "Trap Weights"
    valid_keys = {"Bleeding", "Poison", "Infection", "Parasites", "Phobia", "Hunger", "Fear", "Torch out"}
    min = 0
    max = 100
    default = {"Bleeding": 3, "Poison": 3, "Infection": 2, "Parasites": 2, "Phobia": 1,
               "Hunger": 3, "Fear": 3, "Torch out": 3}


class FearAndHungerDeathLink(DeathLink):
    """
    When you die (game over), everyone with Death Link on dies too; when one of them dies, you get a game over.
    """


@dataclass
class FearAndHungerOptions(PerGameCommonOptions):
    endings_required: EndingsRequired
    required_endings: RequiredEndings
    auto_release_collect: AutoReleaseCollect
    randomize_keys: RandomizeKeys
    floor_access: FloorAccess
    troop_checks: TroopChecks
    skill_checks: SkillChecks
    logic: Logic
    logic_difficulty: LogicDifficulty
    spawn_mode: SpawnMode
    enemy_shuffle: EnemyShuffle
    weapon_shuffle: WeaponShuffle
    endings_hold_progression: EndingsHoldProgression
    trap_percentage: TrapPercentage
    trap_weights: TrapWeights
    death_link: FearAndHungerDeathLink

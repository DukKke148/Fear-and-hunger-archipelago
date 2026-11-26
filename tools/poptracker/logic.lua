-- Fear & Hunger logic, the same as the apworld's (regions per part or per floor, gear, keys, vial, recipes).
-- Tables (LOCS, TROOPS, TIER_GEAR...) come from data.lua, options from the slot data (autotracking.lua).

OPTIONS = {floor_access = 1, randomize_keys = 1, logic = 0, logic_difficulty = 1, spawn_mode = 0,
           cooking_requires_unlock = false, alchemy_requires_unlock = true}
RECEIVED = {}     -- item name -> count received from the multiworld
ALWAYS = {}       -- item name -> true: unlocks left out of the pool, always available
TROOP_MAP = {}    -- troop where a fight is -> troop really fought (enemy_shuffle)
EXISTS = nil      -- location id -> true for the checks of this game (nil: not connected, show all)
STEPS = {}
TROOP_TIER, TROOP_FLOOR = {}, {}

function has(name)
    return (RECEIVED[name] or 0) > 0 or ALWAYS[name] == true
end

function gear_count()
    local n = 0
    for name, _ in pairs(GEAR) do
        if has(name) then n = n + 1 end
    end
    return n
end

-- after the options changed: logic regions and the tier of every troop
function setup_logic()
    STEPS = {}
    if OPTIONS.floor_access == 2 then
        for f = 1, FLOOR_COUNT do
            STEPS[f] = {tier = FLOOR_TIER[f], item = ACCESS_FLOOR[f]}
        end
    else
        for t = 1, 5 do
            STEPS[t] = {tier = t, item = (OPTIONS.floor_access ~= 0) and ACCESS_PART[t] or nil}
        end
    end
    TROOP_TIER, TROOP_FLOOR = {}, {}
    for id, t in pairs(TROOPS) do
        TROOP_TIER[id], TROOP_FLOOR[id] = t.tier, t.floor
    end
    for slot, actual in pairs(TROOP_MAP) do
        if TROOPS[slot] and TROOPS[actual] then
            TROOP_TIER[actual] = math.max(TROOPS[slot].tier, TROOPS[actual].tier)
            TROOP_FLOOR[actual] = math.max(TROOPS[slot].floor, TROOPS[actual].floor)
        end
    end
end

local function loc_tier(l)
    if l.t == "troop" then return TROOP_TIER[l.troop] or l.tier end
    if (l.t == "bestiary" or l.t == "boss") and l.troops and #l.troops > 0 then
        local m = 99
        for _, id in ipairs(l.troops) do m = math.min(m, TROOP_TIER[id] or 99) end
        return m
    end
    return l.tier
end

local function loc_floor(l)
    if l.t == "troop" then return TROOP_FLOOR[l.troop] or l.floor end
    if (l.t == "bestiary" or l.t == "boss") and l.troops and #l.troops > 0 then
        local m = 99
        for _, id in ipairs(l.troops) do m = math.min(m, TROOP_FLOOR[id] or 99) end
        return m
    end
    return l.floor
end

local function smart()
    return OPTIONS.logic ~= 1
end

local function need(tier)
    return TIER_GEAR[OPTIONS.logic_difficulty][tier] or 0
end

local function step_reachable(idx, gear)
    for i = 2, idx do
        local s = STEPS[i]
        if s.item and not has(s.item) then return false end
        if smart() and gear < need(s.tier) then return false end
    end
    return true
end

function has_key(db_id)
    return Tracker:ProviderCountForCode(KEY_CODES[db_id]) > 0
end

-- keys: from the multiworld (full), or held in the current run (extra / off: shared by the game plugin,
-- or clicked by hand). Small keys only count in full mode.
local function keys_ok(l)
    for _, k in ipairs(l.keys) do
        -- the two Ma'habre books each list the other: no deadlock
        local mutual = l.t == "key" and KEY_REQS[k] and KEY_REQS[k][l.item]
        if k ~= SMALL_KEY and not mutual and not has_key(k) then return false end
    end
    if OPTIONS.randomize_keys == 2 and l.small > 0 then
        return Tracker:ProviderCountForCode(KEY_CODES[SMALL_KEY]) >= l.small
    end
    return true
end

function can(id)
    local l = LOCS[tonumber(id)]
    if not l then return false end
    local tier = loc_tier(l)
    local idx
    if OPTIONS.floor_access == 2 then
        idx = math.max(1, math.min(#STEPS, loc_floor(l)))
        tier = math.max(tier, STEPS[idx].tier)
    else
        idx = math.max(1, math.min(#STEPS, tier))
    end
    if l.t == "skill" and OPTIONS.spawn_mode ~= 0 then
        idx = #STEPS  -- the scroll can spawn at any depth: counted on only at the end
        tier = STEPS[idx].tier
    end
    local gear = gear_count()
    if not step_reachable(idx, gear) then return false end
    if not keys_ok(l) then return false end
    if l.t == "skill" and not has(l.scroll) then return false end
    if l.t == "cook" or l.t == "craft" then
        if #l.books > 0 then
            local any = false
            for _, b in ipairs(l.books) do if has(b) then any = true end end
            if not any then return false end
        end
        for _, n in ipairs(l.need) do if not has(n) then return false end end
        local unlock = (l.t == "cook") and OPTIONS.cooking_requires_unlock or OPTIONS.alchemy_requires_unlock
        if unlock and l.result and not has(l.result) then return false end
    end
    if l.ex and not has("Explosive vial") then return false end
    if smart() and (l.t == "boss" or l.t == "ending" or l.t == "ending_extra") then
        local n = math.min(GEAR_COUNT, need(tier) + BOSS_EXTRA[OPTIONS.logic_difficulty])
        if gear < n then return false end
    end
    return true
end

function exists(id)
    if EXISTS == nil then return true end
    return EXISTS[tonumber(id)] == true
end

setup_logic()

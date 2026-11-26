-- Archipelago autotracking: received items, checked locations, slot options, and the keys held in the
-- current run (shared by the game plugin in the server's data storage).

local GAME = "Fear & Hunger"
local KEYS_STORAGE = nil
local refresh = 0

local function obj(code)
    return Tracker:FindObjectForCode(code)
end

local function bump()
    refresh = refresh + 1
    local o = obj("ap_refresh")
    if o then o.AcquiredCount = refresh end
end

local function reset_items()
    for _, g in pairs(ITEM_GRID) do
        local o = obj(g[1])
        if o then
            if o.Type == "consumable" then o.AcquiredCount = 0
            elseif o.Type == "progressive" then o.CurrentStage = 0
            else o.Active = false end
        end
    end
    for _, g in pairs(LOC_GRID) do
        local o = obj(g[1])
        if o then
            if o.Type == "progressive" then o.CurrentStage = 0 else o.Active = false end
        end
    end
    local g = obj("gear")
    if g then g.AcquiredCount = 0 end
end

local function on_clear(slot_data)
    Tracker.BulkUpdate = true
    local ok, err = pcall(function()
        RECEIVED, ALWAYS, TROOP_MAP = {}, {}, {}
        slot_data = slot_data or {}
        for _, k in ipairs({"floor_access", "randomize_keys", "logic", "logic_difficulty", "spawn_mode"}) do
            if slot_data[k] ~= nil then OPTIONS[k] = tonumber(slot_data[k]) end
        end
        for _, k in ipairs({"cooking_requires_unlock", "alchemy_requires_unlock"}) do
            if slot_data[k] ~= nil then OPTIONS[k] = slot_data[k] == true or slot_data[k] == 1 end
        end
        for _, id in ipairs(slot_data.extra_base or {}) do
            local name = ITEM_NAMES[tonumber(id)]
            if name then ALWAYS[name] = true end
        end
        for slot, actual in pairs(slot_data.troop_map or {}) do
            TROOP_MAP[tonumber(slot)] = tonumber(actual)
        end
        setup_logic()
        EXISTS = {}
        for _, id in ipairs(Archipelago.MissingLocations or {}) do EXISTS[id] = true end
        for _, id in ipairs(Archipelago.CheckedLocations or {}) do EXISTS[id] = true end
        if next(EXISTS) == nil then EXISTS = nil end
        for _, l in pairs(LOCS) do
            local s = obj(l.sec)
            if s then s.AvailableChestCount = s.ChestCount end
        end
        reset_items()
        local keys = obj(KEY_CODES[SMALL_KEY])
        for db, code in pairs(KEY_CODES) do
            local o = obj(code)
            if o then
                if db == SMALL_KEY then o.AcquiredCount = 0 else o.Active = false end
            end
        end
        KEYS_STORAGE = "fh_keys_" .. tostring(Archipelago.TeamNumber or 0) .. "_" .. tostring(Archipelago.PlayerNumber)
        if OPTIONS.randomize_keys ~= 2 then
            Archipelago:SetNotify({KEYS_STORAGE})
            Archipelago:Get({KEYS_STORAGE})
        end
    end)
    Tracker.BulkUpdate = false
    if not ok then print("Fear & Hunger: clear failed: " .. tostring(err)) end
    bump()
end

local function on_item(index, item_id, item_name, player)
    local name = ITEM_NAMES[item_id] or item_name
    if not name then return end
    local first = (RECEIVED[name] or 0) == 0
    RECEIVED[name] = (RECEIVED[name] or 0) + 1
    local g = ITEM_GRID[name]
    if g then
        local o = obj(g[1])
        if o then
            if g[2] == "key" then
                -- full mode: keys come from the multiworld. extra / off: the game reports what you hold
                if OPTIONS.randomize_keys == 2 then
                    if o.Type == "consumable" then o.AcquiredCount = RECEIVED[name] else o.Active = true end
                end
            elseif g[2] == "scroll" then
                if o.CurrentStage < 1 then o.CurrentStage = 1 end
            else
                o.Active = true
            end
        end
    end
    if first and GEAR[name] then
        local gear = obj("gear")
        if gear then gear.AcquiredCount = gear_count() end
    end
    bump()
end

local function on_location(location_id, location_name)
    local l = LOCS[location_id]
    if not l then return end
    local s = obj(l.sec)
    if s then s.AvailableChestCount = 0 end
    local g = LOC_GRID[location_id]
    if g then
        local o = obj(g[1])
        if o then
            if g[2] then o.CurrentStage = g[2] else o.Active = true end
        end
    end
end

local function on_keys(key, value)
    if key ~= KEYS_STORAGE or OPTIONS.randomize_keys == 2 then return end
    if type(value) ~= "table" then value = {} end
    for db, code in pairs(KEY_CODES) do
        local o = obj(code)
        local n = tonumber(value[tostring(db)] or value[db] or 0) or 0
        if o then
            if db == SMALL_KEY then o.AcquiredCount = n else o.Active = n > 0 end
        end
    end
    bump()
end

Archipelago:AddClearHandler("fh clear", on_clear)
Archipelago:AddItemHandler("fh item", on_item)
Archipelago:AddLocationHandler("fh location", on_location)
Archipelago:AddRetrievedHandler("fh keys", on_keys)
Archipelago:AddSetReplyHandler("fh keys", on_keys)

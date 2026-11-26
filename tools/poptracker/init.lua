-- Fear & Hunger (Archipelago) PopTracker pack
Tracker:AddItems("items/items.json")
ScriptHost:LoadScript("scripts/data.lua")
ScriptHost:LoadScript("scripts/logic.lua")
Tracker:AddMaps("maps/maps.json")
Tracker:AddLocations("locations/locations.json")
Tracker:AddLayouts("layouts/tracker.json")
if Archipelago then
    ScriptHost:LoadScript("scripts/autotracking.lua")
end

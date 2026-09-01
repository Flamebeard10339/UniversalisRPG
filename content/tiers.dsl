// Reference builds, one per activity per tier, and nothing a player ever reaches.
//
// A tier is a level and an activity: what somebody who has climbed that activity to that level
// has earned, wearing what that level lets them wear. It is what `npm run simulate-activity`
// is pointed at when the question is what the world pays at level ten rather than at level one,
// because a rate is only ever a rate for somebody, and the somebody has to be written down.
//
// Nothing here was reckoned. Each was printed by `npm run tier-build`, which spends the tier's
// experience pool -- one skill climb for each skill the activity uses -- and then hands the whole
// of the activity's kit over and puts on as much of it as the engine allows. So the difference
// between the tiers below is not a decision anybody made about what a tier may wear: it is the
// twelve `requires:` lines in the world, answered. The iron set arrives at ten and the Knight's
// Sword at twenty because that is what they ask for.
//
// The pool is spent evenly, which is the floor and not the answer -- whether the best combat
// build at a tier pours everything into attack is exactly the question a search over these is
// for. Regenerate any of them with the command above and paste the body back.

# info tiers
version: 1.0.0
pack: balance
dependencies:
  core
  combat
  cooking
  crafting
  fishing
  thieving


// --- combat ---

// Leather under bronze under iron, a shield, and the best blade the level has earned. Every
// piece is handed over at every tier and the engine keeps what it will.

# save combat-tier-1
{"version":13,"inventory":{"crafting.leather-coif":1,"crafting.leather-body":1,"crafting.leather-chaps":1,"combat.iron-dagger":1,"combat.iron-helmet":1,"combat.iron-platebody":1,"combat.iron-platelegs":1,"combat.knights-sword":1},"equipped":{"gloves":"crafting.leather-gloves","offhand":"core.wooden-shield","mainhand":"combat.bronze-dagger","head":"combat.bronze-helmet","body":"combat.bronze-platebody","legs":"combat.bronze-platelegs"}}

# save combat-tier-10
{"version":13,"inventory":{"crafting.leather-coif":1,"crafting.leather-body":1,"crafting.leather-chaps":1,"combat.bronze-dagger":1,"combat.bronze-helmet":1,"combat.bronze-platebody":1,"combat.bronze-platelegs":1,"combat.knights-sword":1},"xp":{"combat.attack":1382,"combat.health":1382},"equipped":{"gloves":"crafting.leather-gloves","offhand":"core.wooden-shield","mainhand":"combat.iron-dagger","head":"combat.iron-helmet","body":"combat.iron-platebody","legs":"combat.iron-platelegs"}}

# save combat-tier-20
{"version":13,"inventory":{"crafting.leather-coif":1,"crafting.leather-body":1,"crafting.leather-chaps":1,"combat.bronze-dagger":1,"combat.bronze-helmet":1,"combat.bronze-platebody":1,"combat.bronze-platelegs":1,"combat.iron-dagger":1},"xp":{"combat.attack":5345,"combat.health":5345},"equipped":{"gloves":"crafting.leather-gloves","offhand":"core.wooden-shield","head":"combat.iron-helmet","body":"combat.iron-platebody","legs":"combat.iron-platelegs","mainhand":"combat.knights-sword"}}


// --- fishing ---

// Both waters' tackle: the nets the shingle is fished with and the rod, bait and line the deep
// water is. Bait is handed over by the thousand, because a tier has every shop and what it is
// measuring is the water rather than the purse.

# save fishing-tier-1
{"version":13,"inventory":{"fishing.small-fishing-net":1,"fishing.large-fishing-net":1,"fishing.dried-fish-bait":2999,"fishing.gut-line":1},"equipped":{"mainhand":"fishing.fishing-rod","offhand":"fishing.dried-fish-bait","gloves":"fishing.braided-fiber-line"},"instances":{"next":2,"byId":{"1":{"kind":"item","template":"fishing.horsehair-line","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}},"rng":2617077404}

# save fishing-tier-10
{"version":13,"inventory":{"fishing.small-fishing-net":1,"fishing.fishing-rod":1,"fishing.dried-fish-bait":2999,"fishing.gut-line":1},"xp":{"fishing.fishing":1382},"equipped":{"mainhand":"fishing.large-fishing-net","offhand":"fishing.dried-fish-bait","gloves":"fishing.braided-fiber-line"},"instances":{"next":2,"byId":{"1":{"kind":"item","template":"fishing.horsehair-line","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}},"rng":2617077404}

# save fishing-tier-20
{"version":13,"inventory":{"fishing.small-fishing-net":1,"fishing.fishing-rod":1,"fishing.dried-fish-bait":2999,"fishing.gut-line":1,"fishing.braided-fiber-line":1},"xp":{"fishing.fishing":5345},"equipped":{"mainhand":"fishing.large-fishing-net","offhand":"fishing.dried-fish-bait","gloves":"1"},"instances":{"next":2,"byId":{"1":{"kind":"item","template":"fishing.horsehair-line","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}},"rng":2617077404}


// --- thieving ---

// A hand and nothing else. Thieving is the one activity here whose offers ask for no tackle,
// so its tiers differ by the climb alone -- which makes them the cleanest reading of what a
// level on its own is worth.

# save thieving-tier-1
{"version":13}

# save thieving-tier-10
{"version":13,"xp":{"thieving.thieving":1382}}

# save thieving-tier-20
{"version":13,"xp":{"thieving.thieving":5345}}

// --- cooking ---

// A cook's whole kitchen and nine hundred of everything anybody in Tulsa can put in a pan. Cooking
// is the one activity here whose ceiling is not the room but the pack: in play it is bounded by
// what the water and the pasture handed over, so a tier stocked to the brim is measuring the stove
// rather than the supply, which is the same reason the fishing tiers carry bait by the thousand.

# save cooking-tier-1
{"version":13,"inventory":{"cooking.chefs-hat":1,"cooking.oven-mitts":1,"fishing.raw-shrimp":900,"fishing.raw-anchovies":900,"fishing.raw-trout":900,"fishing.raw-salmon":900,"combat.raw-chicken":900,"combat.raw-beef":900},"instances":{"next":2,"byId":{"1":{"kind":"item","template":"cooking.cast-iron-pan","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}},"rng":2617077404}

# save cooking-tier-10
{"version":13,"inventory":{"cooking.chefs-hat":1,"fishing.raw-shrimp":900,"fishing.raw-anchovies":900,"fishing.raw-trout":900,"fishing.raw-salmon":900,"combat.raw-chicken":900,"combat.raw-beef":900},"xp":{"cooking.cooking":1382},"equipped":{"gloves":"cooking.oven-mitts","mainhand":"1"},"instances":{"next":2,"byId":{"1":{"kind":"item","template":"cooking.cast-iron-pan","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}},"rng":2617077404}

# save cooking-tier-20
{"version":13,"inventory":{"fishing.raw-shrimp":900,"fishing.raw-anchovies":900,"fishing.raw-trout":900,"fishing.raw-salmon":900,"combat.raw-chicken":900,"combat.raw-beef":900},"xp":{"cooking.cooking":5345},"equipped":{"head":"cooking.chefs-hat","gloves":"cooking.oven-mitts","mainhand":"1"},"instances":{"next":2,"byId":{"1":{"kind":"item","template":"cooking.cast-iron-pan","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}},"rng":2617077404}

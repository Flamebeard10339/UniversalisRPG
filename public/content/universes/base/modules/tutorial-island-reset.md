# info
id: tutorial-island-reset
version: 1.0.0
universe: base
author: UniversalisRPG
game_version: 1.0
dependencies: +base-core, +wayside-supplies

# advanced
{
  "data-updates": {
    "remove": {
      "locations": ["crossroads", "emberwood", "old-quarry"],
      "entities": ["goblin", "oak-tree", "ent", "ork", "tutorial-guide"],
      "actions": [
        "travel-crossroads-to-emberwood",
        "travel-emberwood-to-crossroads",
        "travel-crossroads-to-old-quarry",
        "travel-old-quarry-to-crossroads",
        "gather-rumors",
        "forage-embers",
        "survey-stonework",
        "mine-iron-ore-vein"
      ],
      "dialogues": ["tutorial-guide"],
      "collectionLogs": ["goblin-kills", "oak-tree-kills", "ent-kills", "ork-kills"],
      "items": ["wayside-token"]
    }
  }
}

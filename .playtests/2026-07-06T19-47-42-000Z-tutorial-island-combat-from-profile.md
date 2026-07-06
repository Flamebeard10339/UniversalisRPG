# Playtest: tutorial-island-combat-from-profile
Modules: base-core, wayside-supplies, tutorial-island-reset, tutorial-island-foundation, tutorial-island-guide-house, tutorial-island-survival, tutorial-island-bank, tutorial-island-mining, tutorial-island-combat
Mode: from-profile (.playtests/profiles/post-mining.json)

## At Training Mine (tutorial-mine)
Copper and tin glint in a cramped cave.
Entities present (5): Denzel, Copper Rock, Tin Rock, Locked Chest, Mine Tunnel
Visible choices:
- `action:entity.denzel.talk` (entity-action on denzel): Talk
- `action:entity.denzel.examine` (entity-action on denzel): Examine
- `action:entity.copper-rock.mine` (entity-action on copper-rock): Mine Copper
- `action:entity.tin-rock.mine` (entity-action on tin-rock): Mine Tin
- `action:entity.locked-chest.pick` (entity-action on locked-chest): Pick Lock [requirements not met]
- `action:entity.locked-chest.examine` (entity-action on locked-chest): Examine
- `action:entity.mine-tunnel.enter-forge` (entity-action on mine-tunnel): Enter Forge

> Chose: `action:entity.mine-tunnel.enter-forge` — Enter Forge


## At Cave Forge (tutorial-forge)
A furnace and anvil are wedged into a hot alcove.
Entities present (3): Furnace, Anvil, Forge Table
Visible choices:
- `action:entity.forge-table.return-mine` (entity-action on forge-table): Return
- `action:entity.forge-table.continue` (entity-action on forge-table): Continue

> Chose: `action:entity.forge-table.continue` — Continue


## At Combat Cage (tutorial-rat-cage)
A rat cage, a portal, and a broad-shouldered instructor wait underground.
Entities present (4): Orloth, Giant Rat, Rat Cage Door, Mainland Portal
Visible choices:
- `action:entity.orloth.talk` (entity-action on orloth): Talk
- `action:entity.orloth.fight` (entity-action on orloth): Fight
- `action:entity.giant-rat.fight` (entity-action on giant-rat): Fight

> Chose: `action:entity.orloth.talk` — Talk

  - Orloth: Equipment tab, mainhand slot, any blade you've got. Then it's just you against the rats in that cage — attack wears them down, defense keeps you standing. Stats tab breaks down exactly how much of each you've got, if you want the numbers.

## At Combat Cage (tutorial-rat-cage)
A rat cage, a portal, and a broad-shouldered instructor wait underground.
Entities present (4): Orloth, Giant Rat, Rat Cage Door, Mainland Portal
Visible choices:
- `action:entity.orloth.talk` (entity-action on orloth): Talk
- `action:entity.orloth.fight` (entity-action on orloth): Fight
- `action:entity.giant-rat.fight` (entity-action on giant-rat): Fight

> Chose: `action:entity.giant-rat.fight` — Fight

  - You hit the giant-rat.
  - You missed the giant-rat.
  - You hit the giant-rat.
  - You missed the giant-rat.
  - You hit the giant-rat.
  - You missed the giant-rat.
  - You killed the giant-rat.
  - You missed the giant-rat.
  - You hit the giant-rat.
  - You missed the giant-rat.
  - You hit the giant-rat.
  - You missed the giant-rat.
  - You hit the giant-rat.
  - You missed the giant-rat.
  - You killed the giant-rat.
  - You missed the giant-rat.
  - You hit the giant-rat.
  - You missed the giant-rat.
  - You hit the giant-rat.
  - You missed the giant-rat.
  - You hit the giant-rat.
  - You missed the giant-rat.
  - You hit the giant-rat.
  - You killed the giant-rat.

## At Combat Cage (tutorial-rat-cage)
A rat cage, a portal, and a broad-shouldered instructor wait underground.
Entities present (4): Orloth, Giant Rat, Rat Cage Door, Mainland Portal
Visible choices:
- `action:entity.orloth.talk` (entity-action on orloth): Talk
- `action:entity.rat-cage-door.unlock` (entity-action on rat-cage-door): Unlock [requirements not met]
- `action:entity.portal.step-through` (entity-action on portal): Step Through

> Chose: `action:entity.portal.step-through` — Step Through


## At Mainland Pier (mainland-arrival)
Open roads begin beyond a salt-stained pier.
Entities present (1): Dock Greeter
Visible choices:
- `action:entity.mainland-greeter.talk` (entity-action on mainland-greeter): Talk

> Chose: `action:entity.mainland-greeter.talk` — Talk

  - Dock Greeter: Thanks for playing Tutorial Island. Go make trouble somewhere larger.

## End state
Location: Mainland Pier (mainland-arrival)
Flags: {"death-count":0,"tutorial-guide.q1.count":0,"tutorial.miki-cleared":true,"tutorial.bridge-open":true,"tutorial.gommi-asleep":false,"tutorial.bank-visited":false,"tutorial.mining-cleared":true,"tutorial.combat-cleared":true,"tutorial.cage-locked-by-orloth":false,"tutorial.reached-mainland":true,"quest.leave-tutorial-island.accepted":true,"well-fed":false}
Inventory: {"emberleaf":0,"log":0,"iron-ore":0,"bones":0,"bronze-spear":0,"bronze-dagger":1,"bronze-arrow":0,"bronze-throwing-knife":0,"tutorial-blade":0,"bronze-pickaxe":1,"gold":0,"lockpick":0,"guide-book":0,"small-net":1,"raw-shrimp":0,"cooked-shrimp":1,"herb":0,"bowl":1,"uncooked-sleeping-draught":0,"sleeping-draught":0,"copper-ore":0,"tin-ore":0,"bronze-bar":0,"iron-dagger":0}
Bank: {}
Appearance: {"presetId":"default"}
Spawn location: mainland-arrival

RESULT: pass

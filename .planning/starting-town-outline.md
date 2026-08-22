# Tulsa — the starting town

**This is an extraction, not an authored plan.** Everything here is read off the
ten notes in `planning_quests/`; nothing was invented. It exists so the correction
pass is cheaper than writing an outline cold — strike what is wrong, answer the
`?` lines, add what the notes never had a reason to mention.

The corrections are also the specimen: the format of a rough outline is going to
be read off what this looks like once you have had your hands on it.

`—` means the notes state it. `?` means I inferred it or could not resolve it.

---

## The region

Tulsa is the name of the town and is effectively the name of the region this content
exists in. Tulsa has several buildings, a castle, and adjacent locations like the ratkin 
border. Tulsa encapsulates multiple z-layers, namely basements, roofs, and surface. 
The game supports multiple locations, and each place should be a unique location (or even
several adjacent locations to encapsulate travel and to naturally separate enemies and/or
features). 

The name of the kingdom is undefined. But we can call it Yanodonin.

## Places

- **Market district** — Mouse hunches over a sewer grate here. May be split into several
  adjacent locations to give it size. 
- **The castle** — the duke, the guard captain; the sewer entrance is around the back. 
  Has three floors, and a basement. A kitchen, bedrooms, sewing room, banquet hall, ...
- **The sewers** — feral rats, hairless and weeping; a barred door carried the ball
  through; behind it a locked room, two ratmen, a key on a table, and a book with
  the procedure for converting a man into a ratman. Signs on the walls point to the
  major buildings above
- **Kelsa's apiary** — three hives on the far side of the property; the last one
  the player enters is always the infected one, and is instanced and resets. 2-3 locations
  which separate the harder enemies from the easier ones. As well as perhaps including 
  Kelsa's home so the player can talk without being in a dangerous location. 
- **Sha Dynasty's** — the city's bar. Sunny owns it and keeps vodka. Should have secrets
  as well as drunk patrons. 
- **Oolga's** — a house with a rat-infested basement, and a potion shop she will
  not open to you until you have earned it
- **The border swamp** — mollusk venom, three herbs, aggressive monsters throughout,
  broken deformed insect eggs and alchemy supplies hastily trashed in the bushes
- **The ratkin border** — an outpost with guards, reached by travelling
- **The tunnels** — under Kelsa's land, feral rats, a rat army massing on the far side
- **Miki's house** — you have said this joins the town. We scrap the island concept. 
  Miki is making a joke about 'escaping tutorial island'. They are already on the mainland.
- **A forge** — *A Grand Blade* gives you the use of their anvil, so one exists. It is
  adjacent to the market district.

## Cast

- **Kelsa** — apiary owner. Assumes you were sent by the Mayor. Blunt to the point of
  rude: *figure it out, what does she pay us for?!* Do what you like to the drones,
  but do not touch her queens. ? A Mayor is mentioned once and never appears
- **George** — Kelsa's helper. The nuanced one. Gives the real answer, points at the
  hives, and drags you out of the boss arena when you lose
- **The Town Crier** — the information NPC, and confidently wrong. Swears it is a
  borer wasp, *100%*; only under pressure names the Korning Mind Wasp, and only to
  dismiss it
- **Mouse** — a boy over a sewer grate with a forlorn expression and a lost ball.
  Examining him shows black eyes and twitchy ears. He is gone when you come back
- **Larry** — the guard on the sewer entrance. 1000 coins gets you in, 200 if you are
  carrying a cooked herring
- **Charlie the Tramp** — knows the other way into the sewers, and will always say so
- **Grandma Oolga** — a witch who complains that things were better before. Gains a
  glint in her eye when you ask after her wares. Sends you on invented errands for
  her own enrichment and does not apologise for it. *Good boy :P*
- **Sunny** — owns Sha Dynasty's, expert at attracting and repelling animals
- **The Duke** — grants permission to collapse the tunnel; is spied on for a reporter
- **The Guard Captain** — the hub for the back half of the arc, and pays a bounty for
  what you saw in the sewers
- **The bladesmith's son** — cannot take up his father's mantle, because the father
  hid his notes behind *a real smith paves his own way*
- **A reporter** — wants juicy details on the duke. Unnamed
- **The barman** — *The Bar's Crawl* wants a new brew from him. ? Is this Sunny, or a
  second bar?
- **Guards** — generic; with *The Swampy Menace* available they send you to the captain

## Antagonists

- **The ratkin**, damaging the economy on purpose and smuggling hostile monsters in
- **The Black Plague** — a mutated mad-scientist ratkin, the arc's villain
- **The Twins** — his lieutenant, fought in *Reverse Infiltration*
- **Korning Mind Wasp** — mind-controls the queen bee; lives only in ratkin territory,
  which is the clue
- **The groundwurm** — drawn by Sunny's poison
- **Feral rats, ratmen, a rat-toad hybrid**

## What the quests need from the town

    Birds and the Bees ─┐
                        ├─→ The Rat Conspiracy ─┐
    Ball of a Boy ──┐                           ├─→ Reverse Infiltration
                    ├─→ The Swampy Menace ──────┘         │
    Kill it with Fire                                     └─→ Plague Matters

    A Grand Blade · The Bar's Crawl · Attention to Detail — no stated requirements

So the town must stand before any of it, and these are its load-bearing pieces:
Kelsa and George at the apiary, the crier, Mouse and the grate, Larry and the
sewers, Oolga and her basement, Sunny and the bar, the duke and the captain at the
castle. The forge, the reporter and the barman can wait.

## What the notes reference that the engine does not have

The corpus today is five locations, all tutorial island. Beyond the places above,
these are the mechanics the notes assume and that an authoring agent will meet:

- ? **Instanced areas that reset on entry** — the boss hive, stated outright
  - This feature can be backlogged. It is functionally the same as enemies respawning
  and the addition of death mechanics. 
- ? **A locked room you are shut into**, escapable by a key in inventory or by
  picking the lock in reverse at a higher level
  - Travel actions on entites exist. It shouldn't be hard to trigger a flag that makes 
  one directional edge/locks the door when the player enters the room. Potentially also 
  sets up the enemies inside of the room if the quest is active. 
- ? **Skill-gated actions** — thieving 5 to open the door, thieving 15 to reverse it.
  `# skill thieving` exists; the gate may not
  - 
- ? **Escort/ally combat with a loss condition that is not your own death** — the
  queen bee dies and you lose
  - I believe we support `allies` who fight for you during battle. There may be some 
  implementation work to be done regarding what happens if an ally dies. 
- ? **An enemy that heals off its ally**, the wasp draining the queen
  - This should be doable. 
- ? **Crafting from three carried ingredients at a stove**, yielding Sunny's poison
  - Recipes exist and work. 
- ? **Objectives that tick off as items enter your inventory**, and dialogue that
  changes with the order they were collected
  - This should be fine as well, I believe. 
- ? **Bribery and haggling**, priced off what you are carrying
  - technically this should work. It might be ugly in the DSL. 
- ? **`use` a weapon on an NPC** as a dialogue trigger — Oolga's errand loop breaks
  only when you threaten her
  - Isn't implemented. We can do this with a dialogue option. 
- ? **Flee from an encounter** — the rat-toad ambush lets you run
  - Actions can be stopped currently. We will need to implement 'running' taking time 
  and/or can fail. 
- ? **Screenshake**, when the tunnels go
  - Remove this completely. 

An agent authoring against these should leave `@@@` and move on rather than
inventing a mechanism. That list, once it comes back from a real run, is the
feature queue.

## For you to add

The notes had no reason to record these, and the town cannot be authored without
them:

- Where the player arrives from tutorial island, and what they see first
  - The player spawns in Miki's house. Miki, the jokester, gives the player a quest 
  to get off tutorial island. Miki takes it very seriously. The player only discovers 
  later that they are on the mainland and the quest is 'impossible' to complete. 
  (basically, this is a long running quest that will take the player throughout the 
  entire game)
- Which of these places connect to which, and in which direction
  - It is a densely connected town. Most connections are bidirectional. Imagine it is 
  a text adventure. 
- What is sold where, and what a new player can afford
  - There should probably be a fishing store, a general store, potentially an axe 
  store for woodcutting. 
- What the town looks and sounds like — the one thing no agent should decide
  - Again, text adventure. No `look` or `sound`. At least not yet. 

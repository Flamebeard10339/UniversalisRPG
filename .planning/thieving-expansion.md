# Thieving Expansion Design Doc

This document details the thieving expansion. Most, if not all additions should be placed inside of thieving.dsl. This is not a hard limit as some changes may be necessary to be made to other modules to make things work. It is a strong preference to keep thieving isolated from other game content. 

Match the style already present in thieving.dsl. Prefer descriptive examine text over dramatic descriptions. Prefer grounded dialogue over dramatic dialogue. This world is a realistic fantasy immersion, not a story book. Words said by the narrator/universe like examine have no opinion about the object or person being examined. Dialogue should always contain some sort of emotion or desire leaking through the words. 

Note that some mechanics may not be expressible with the current grammar. Mark those with @@@. Most should be expressible, however. 

## Karma System and Miniquests

The main goal of this expansion to make the world feel alive. This will be done by having the world react to the actions the player takes. This is explicitly **not** a karma system. Do not implement a global scalar consisting of one or more counters that track reputation with various factions or the player's 'ethics'. This is known not to work in various other games.

Below are a few examples of what other games have done and the pros and cons of their methods. This expansion will attempt to implement a mixture of systemic consequences and persistent specific memory. 

The main point is: track specific acts rather than a sum, make reactions local and witnessed, and show the reaction rather than the number. A visible meter turns ethics into a score to farm. A fully hidden one makes consequences feel arbitrary. The compromise most games landed on is that the NPC dialogue is the meter.

### Global scalar (Fallout 3, inFamous) (Not this)
- Cheap to build, extremely legible, gives players a clear power fantasy. inFamous proves it works fine when the fiction is comic-book scale.
- Encourages optimization over roleplay, invites laundering, flattens motive.

### Faction reputation (New Vegas) (Not this)
- Consequences are local, plural, and can conflict. Being hated somewhere is interesting rather than a fail state.
- Expensive: content scales with factions times standings. Players also lose the clean feedback of a single number, and can lock themselves out of quest lines without realizing it.

### Dual meters (Mass Effect) (Not this)
- No erasure, rewards a coherent character.
- Still funnels you into a lane if you tie dialogue checks to meter thresholds. ME3 partly merged them for exactly this reason.

### Systemic consequence (Dishonored)
- Feels earned and diegetic. Nothing lectures you.
- Opaque. Players can't tell which action moved the needle, and if one branch reads as the "good" ending, you've quietly mandated a playstyle.

### Persistent specific memory (Undertale, Nemesis)
- Highest emotional payoff per action, because the game cites your actual deeds.
- Doesn't generalize. It only works at small scale or with heavy procedural scaffolding.

## Miniquests

The help with the karma system, the thieving expansion will include several miniquests. Miniquests are single game interactions offering the player some dialogue and/or a choice with a reward. They make semi-permanent changes to the game world. 

Miniquests have consequences. Local consequences include changing what reward or punishment (if any) the player receives after completing the miniquest. Global consequences are entirely composed of binary dialogue switches that encode memory of what (specifically) the player did. 

### Lookout
The player can come across a suspicious man lurking in an alleyway. The man offers the player a cut of the goods if they keep a lookout. 
-> player accepts: receive two rolls off of a strongbox-contents. The thief then disappears from the location and moves to the rogue's den. The thief will have a friendly disposition if the player talks to them in the future. Note: the thief doesn't expose the location of the rogue's den. The thief offers it as a challenge (find me if you can).
	Consequences: Guards in the area will have suspicious dialogue remarking that they've seen the player 'lurking around' recently and admonish the player not to act suspicious. 
-> player rejects: The player may freely return to the thief whenever they want to accept. If they instead go to any policing entity (guard/knight/captain/etc) a dialogue to expose the thief appears. The thief is then caught and placed in jail. The guards give the player two rolls off of a strongbox-content citing they found this among the thief's things and they are giving it to the player as thanks for helping them out. Finally, guards around the city greet the player cheerfully and reference the help they offered if they stop to talk to them. 
	Consequences: The thief is in the jail and has a sour disposition if the player talks to them. The thief blames the player for ratting them out. Doesn't believe the player if they deny doing it. 

### Locked Out
The player can come across an old lady struggling to enter her home. When asked, the lady explains how she is locked out of the house, and this happens often. Asking the guards for help is an option, but they are corrupt and always ask for money to help with things like this. 
-> player accepts: The player agrees to help the old lady. There are three ways inside of the house. 1) picking the front door lock. 2) There is an unlocked window around back. Crawling in and unlocking the front door from the inside is an option. 3) The cellar lock is old and weak. Picking it opens the cellar and provides access into the house. 
	Reward: The old lady gives the player the secret location of the rogue's den and a password to get inside. She smiles knowingly if the player asks her how she knows and insists she is just some old lady. She thanks the player, but if the player ever comes back to this house it is empty. 
-> player rejects: The player may simply go to the guard and pay them 25 gold to come help the old lady. If they do, the three ways into the house get vastly more difficult to enter. If the player manages to do that anyway despite no one answering the front door, the old lady will greet them inside. She has a cold disposition and dryly jokes about ratting the player out to the guard, but eventually acknowledges that the player did succeed her test and she tells the player the location of the Rogue's Den. 
	Reward: -25 gold. The old lady doesn't give the player the password to the rogue's den. It costs 1000 gold to enter without the password. 

### The Fruit Stall
The player comes across a group of street urchins where they may or may not teach the urchins how to steal food from the fruit stalls. Alternatively, if the player gives the urchins 100 or more fruit (from purchasing or stealing themselves), that also satisfies the miniquest. This quest has no direct rewards and simply changes dialogue of the street urchins (as well as their clothes and general status) and the dialogue of the stall owners. (Note: the stall owners don't know it is the player who is stealing from them. They remark they are low on fruit because 1) the player is buying all of their stock, or 2) someone -- or something -- is stealing from them (shifty eyes))

## Rotating Guards in the Market
There is a rotating guard detail in the various markets. When they are present, thieving activities in the location are much more difficult. Failing also carries different dialogue and consequences (Guards reprimand the player). 

If the guards aren't present, the shopkeepers are the one to berate the player. 

How often the player is caught is tracked which escalates the consequences the player receives when they are caught as well as making the dialogue harsher. 
1. Generally cheerful reprimand. 
2. slap (physical damage) with harsher language.
3. physical damage and confiscation of coin if present on the player's person. If no coin, the player is sent to jail. 
5+. The guards are pissed and send the player directly to jail and confiscate all coin. This coin can be recovered from a lockbox in the warden's office (replaces the loot table of the lockbox until the player takes the coin back)

### The Jail
The Jail cells are a relatively easy lockpicking check to escape the cell. There is a cheerful drunk chilling in the adjacent cell espousing the benefits of free room and board (this is a joke).

The player's inventory and equipment is taken from them when they are sent to jail. There is a crate containing their gear that interacting with puts their items into their inventory. If there is no room, the items remain in the crate until the player opens up inventory slots. The crate is otherwise empty and inert (it is basically a storage container that you can only take items out of)

Talking to any guards after having just escaped the cell but not escaped the building results in a confused dialogue where the guards escort the player back to jail. Leaving the building resets this timer. 

### The Warden's Office
The warden's office is locked with a difficult skill check. Failing has a chance of getting thrown back into jail. If the warden is still in their office, that chance is 100% even if the player succeeds. 

The warden can be lured out of his office by:
1. causing a ruckus downstairs. This moves the warden to the jail cells.
2. overhearing from a guard that the warden likes donuts. Ordering donuts from a nearby stall to the jail moves the warden to the cafeteria. 

The Warden returns to their office after 5 minutes. If the player is present, they are sent to jail. If the player enters a location with the warden they are sent to jail. 

## Rogue's Den Expansion and Minigame

The rogue's den contains a minigame of mock infiltration into a locked set of rooms. This is never referred to as a minigame by NPCs. It is an initiation challenge to join the rogue's guild. The cost to enter the rogue's guild becomes free if the player succeeds (or gets the password from the old lady).

The minigame is a timed challenge where the player has to infiltrate through several (4-6) crazy dangerous trap rooms. Spinning blades, rolling boulders, fire traps, spiked pits. Each trap does a different amount of damage. Death in the activity respawns the player inside of the rogue's den with 1 health and a dialogue by a smirking rogue ("that was a close one lol")

Reward for succeeding beyond the password is a piece of the rogue's outfit. Headgear, chestwrap, legs wrap, sandals. It is a level ~30 set of gear that boosts thieving related stats of allocated passives by 15%. 
turn 1 [applied] talk:tulsa.miki — note: (none); expected: (none); confusion: (none); result: Greetings, adventurer! Welcome to UniversalisRPG.
The name's Miki, your tutorial guide, here to walk you through your first steps.
What do you say I show you the ropes?
turn 2 [applied] submit-modal: choice=0 — note: (none); expected: (none); confusion: The dialogue modal darkens the screen and I can't see the words that were just spoken. The dialogue that just happened should also be in the modal itself. ; result: nothing happened
turn 3 [applied] /quests tutorial-quests.finding-your-feet — note: (none); expected: (none); confusion: (none); result: nothing happened
turn 4 [applied] submit-modal: close=close — note: (none); expected: (none); confusion: Miki doesn't actually say go find the mirror. He asks if you want him to show you the ropes. ; result: nothing happened
turn 5 [applied] use:entity.tulsa.mirror.examine — note: (none); expected: (none); confusion: (none); result: A tall mirror in a gilt frame. Whoever stands in front of it comes away with a name and a people, and may stand in front of it again as often as they like. The first look is free. Every look after it wants a thousand coin, and the glass is not sentimental about it.
turn 6 [applied] use:entity.tulsa.mirror.look-in — note: (none); expected: (none); confusion: (none); result: modal:choose-race
modal:name-yourself
The glass gives you back a name and a people. Come and change your mind whenever you like - it will want paying next time, but it will not turn you away.
turn 7 [applied] submit-modal: name=Temp — note: (none); expected: (none); confusion: (none); result: nothing happened
turn 8 [applied] submit-modal: race=core.human — note: Health bonus works after selecting the race; expected: (none); confusion: (none); result: nothing happened
turn 9 [applied] use:entity.tulsa.mirror.look-in-again — note: (none); expected: (none); confusion: (none); result: The glass shows you exactly what you are carrying, and it is not enough to be looked at twice.
turn 10 [applied] use:entity.tulsa.mirror.look-in-again — note: (none); expected: The mirror is very... fancy about its failure message. The message should just be. "You need 1000 gold to perform this action"; confusion: (none); result: nothing happened
turn 11 [applied] use:entity.tulsa.oven.examine — note: (none); expected: (none); confusion: (none); result: A stone oven, its coals still glowing.
turn 12 [applied] use:entity.tulsa.smiths-chest.examine — note: (none); expected: (none); confusion: (none); result: A banded chest shoved under the workbench, its lid unlatched.
turn 13 [applied] use:entity.tulsa.smiths-chest.open — note: (none); expected: (none); confusion: Smith's chest doesn't belong. Remove completely. Make it a debug entity if necessary. ; result: Whetstones, a handful of cut stones, and a blade nobody came back for.
turn 14 [applied] use:entity.tulsa.stairs.ascend — note: (none); expected: (none); confusion: (none); result: You climb to the second floor.
Guide House Upstairs
A narrow landing with a dresser and a view of the coast.
turn 15 [applied] use:entity.tulsa.dresser.examine — note: (none); expected: (none); confusion: (none); result: A dusty dresser, one drawer left slightly ajar.
turn 16 [applied] use:entity.tulsa.dresser.search-drawer — note: (none); expected: (none); confusion: (none); result: Tucked beneath old linens, a set of worn lockpicks.
turn 17 [applied] use:entity.tulsa.dresser.examine — note: (none); expected: (none); confusion: (none); result: A dusty dresser, one drawer left slightly ajar.
turn 18 [applied] use:entity.tulsa.dresser.examine — note: (none); expected: (none); confusion: There should be some sort of visual queue that I already examined this object. ; result: nothing happened
turn 19 [applied] use:entity.tulsa.window.examine — note: (none); expected: (none); confusion: (none); result: A casement over the water, its latch worn bright by somebody's thumb. It is a long drop to the sand and nothing on the way down to slow it.
turn 20 [applied] use:entity.tulsa.window.climb-out — note: I was interrupted by the game reloading. It saved the run, but I was teleported back to spawn ; expected: (none); confusion: (none); result: Guide House
A cluttered but cozy cottage. Miki's guide house.
turn 21 [applied] /quests tutorial-quests.finding-your-feet — note: (none); expected: (none); confusion: (none); result: nothing happened
turn 22 [applied] submit-modal: close=close — note: (none); expected: (none); confusion: (none); result: nothing happened
turn 23 [applied] talk:tulsa.miki — note: (none); expected: (none); confusion: (none); result: Greetings, adventurer! Welcome to UniversalisRPG.
The name's Miki, your tutorial guide, here to walk you through your first steps.
What do you say I show you the ropes?
turn 24 [applied] submit-modal: choice=1 — note: (none); expected: (none); confusion: (none); result: nothing happened
turn 25 [applied] use:entity.tulsa.miki.examine — note: (none); expected: (none); confusion: (none); result: A weathered man in patched leather, quick to smile.
turn 26 [applied] talk:tulsa.miki — note: (none); expected: (none); confusion: Miki's dialogue doesn't appear when it should. ; result: Guide House
A cluttered but cozy cottage. Miki's guide house.
turn 27 [applied] use:entity.tulsa.stairs.ascend — note: (none); expected: (none); confusion: (none); result: You climb to the second floor.
Guide House Upstairs
A narrow landing with a dresser and a view of the coast.
turn 28 [applied] use:entity.tulsa.window.climb-out — note: (none); expected: (none); confusion: (none); result: You get a leg over the sill, hang off it as long as your arms will have it, and let go. The sand takes most of the drop and your ankles take the rest.
Beach
Pale sand and the sound of the tide, and the road into town running the other way.
turn 29 [applied] 3 — note: (none); expected: (none); confusion: (none); result: Proving Ground
A walled yard behind the armoury, sand raked flat and stained.
turn 30 [applied] use:entity.combat-expansion.spined-urchin.examine — note: (none); expected: (none); confusion: The order of actions are sometimes examine first, and sometimes examine second. It should be consistent. Examine second. ; result: A knot of black spines around something that has not moved in years.
turn 31 [applied] use:entity.tulsa.front-door.examine — note: (none); expected: (none); confusion: (none); result: A heavy wooden door, bound in iron.
turn 32 [applied] 5 — note: (none); expected: (none); confusion: The map doesn't show a progress of how far along the travel is, so it reads as a bug like the game is frozen. ; result: You head down into the basement.
Basement
A damp cellar, crates stacked against the walls.
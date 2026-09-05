## Four growth directives still refuse a rolled base by name

`equip:` resolves a written template to the first unworn copy since 14f72baf. `swap:`,
`slot:`, `allocate:` and `apply:` take the same `<carried>` token through `growItem` and do
not, so `floors/thieving-floor.dsl` still writes `allocate: 3` where it now writes
`equip: core.unassuming-cap` two lines above.

**This is a question rather than an oversight, and it was tried.** A `copyToGrow` preferring
the worn copy made the whole floor writable by name and reddened an authored claim in
`src/runtime/itemInstance.test.ts` — *refuses a base named by its template, because the points
belong to a copy and not to the item*. That claim is right about the distinction: you equip a
copy and any will do, while you allocate onto one particular plane, and a player holding three
swords with three planes has three answers. Naming a template there has to pick, and the pick
would be silent.

The other half of the same fix, also unbuilt: `carriedSubmit` in
`src/runtime/carriedScreen.ts` finds no entry for an unknown item id and returns null with no
refusal at all, and `carriedScreen` discards `equip`'s return besides. That is where the
silence an authoring run once met actually lives, and it is the GUI rather than the loop.

*Moves when: he says whether a growth directive may name a template — and if it may, what it
picks when several copies stand, since that is the thing the claim says cannot be silent.*

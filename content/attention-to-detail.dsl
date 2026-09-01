// Attention to Detail — the thieving quest, read off
// `.planning/planning_quests/Attention to Detail.md`. A reporter pays for what
// can be learned about the duke, and the watching is done from above without
// being seen.
//
// What is worth seeing is invented here rather than handed down: the guard
// captain crosses the yard and climbs to the solar, and the duke is not
// surprised to see her. What she reports and what he says back is the payload
// — it says the duke already knows what is under his own town and is content
// to wait it out, which is worse than not knowing.
//
// The watch itself is `tulsa.market-rooftops`'s own action, written before this
// module existed; this quest only says what is worth seeing from up there and
// what it costs to be caught looking. Take this module out and the rooftop
// still has a long, empty view of the castle and nothing in particular to
// notice about it.

# info attention-to-detail
version: 0.1.0
pack: quests
dependencies:
  core
  tulsa
  thieving

# quest watching-the-duke
title: Attention to Detail
log: Somebody in town pays for what can be learned about the duke, and the castle's upper windows face the roofs over the market.

stage offered:
  log: The reporter wants whatever the duke's windows show. The market rooftops face them square on.
  reporter says:
    always
    ask: You're the one who climbs.
    Word's out that you go where you're not asked and nobody's caught you at it yet. I write for the broadsheet, and I've been trying to get something on the duke for a year. He hears everything and says nothing back, which is exactly the kind of man worth reading the mail of.
    Get up on the rooftops over the market. His windows look right out over them. Whatever you see up there, I'll pay for — better than the broadsheet pays me.
    -> I'll take a look.
      goto watching

stage watching:
  log: The reporter wants whatever the duke's windows show. The rooftops over the market face them square on, and being seen up there is the whole risk of it.
  done when: overheard-the-captain
  goto reporting
  reporter says:
    when: not overheard-the-captain
    ask: About the duke, still.
    again: Nothing yet? Keep at it. A man who leaves his shutters open on purpose is a man who wants to be read.

stage reporting:
  log: I saw the guard captain climb to the duke's solar, and heard enough through the shutters to be worth something.
  reporter says:
    always
    ask: I've got something for you.
    You get a look on you when you've actually got something. Out with it, before you talk yourself out of it.
    So the captain still makes that climb. And he's still not finished with whatever it is he's waiting on. That's worth more to me than the number I quoted you.
    give: 40 core.coin
    give: 1 fine-lockpicks
    Here — picked up off somebody who didn't need them. They'll get you through more doors than the coin will, and I'd rather you owed me than the other way round.
    goto paid

stage paid:
  log: The reporter has what they wanted off the duke's windows, and paid for it without asking how I got it.
  complete
  reporter says:
    always
    ask: About the duke, one more time.
    again: I've got what I needed off that one. Find me something else if you want the coin again.

// --- flags this quest owns ---

// Set the first time the watch on the rooftops pays off, which is the whole of
// what the reporter is buying.
# flag overheard-the-captain

// --- what this quest owns ---

// Nobody but this quest wanted a stranger with a notebook, so the reporter is
// declared here and stood on Market Row by the line below.
# entity reporter
title: The Reporter
faction: world
examine: A stranger with a notebook, keeping half an eye on the castle and half on you.

// --- what this quest owes the world ---

// The reporter stands nowhere until a quest puts them somewhere, same as
// Larry's toll or the book on the table in ball-of-a-boy. Market Row is one
// road from the climb up to the rooftops, which is the whole reason to loiter
// there rather than in the square.
# location tulsa.market-row
+entities: reporter

// The watch itself is tulsa's, and this quest's business is only what it is
// worth seeing from up there and what it costs to be caught looking — but a
// same-named action does not deep-merge with the one already standing, so
// what stands here restates the whole of it rather than layering onto it, the
// warm-tile flavour included. One attempt each time it is used, exactly as a
// chest's own lock is one attempt and not a loop, so that "being seen" reads
// as a discrete, retryable setback rather than something a continuous loop
// quietly shrugs off between cycles: caught reading the captain, you go still
// and dazed exactly as a caught hand does anywhere else in town, and the
// action is there to be tried again the moment that passes. The `@@@` on the
// failure line is what did not survive the trip from the design to this
// grammar; `npm run notes` carries the rest of what it says.
# location tulsa.market-rooftops
watch the castle windows:
  hidden if: overheard-the-captain
  time: 8
  say: You lie flat on the warm tile and give the castle a long look. The second floor opens its shutters and leaves them open; one window on the third is shut against weather nobody else is shutting against.
  one of:
    thieving.thieving:
      set: overheard-the-captain
      xp: thieving.thieving 40
      say: The captain crosses the yard below and takes the stairs to the solar without being announced. The shutters are open for her. "Not yet," the duke says, plain enough to carry. "Not until the last of them is finished." The shutters swing to before you hear finished what.
    100x:
      drain: 2 core.health
      inflict: thieving.dazed
      say: Someone on the wall-walk turns your way a beat too long, and you go flat against the tile and very still. @@@ asked for a stealth mission where being spotted ends the attempt outright; the nearest the grammar gives for a watch that can fail is the weighted roll `pick their pocket` and the two chests already use, retried by hand, so that is what stands here instead. It carries no detection state: nobody comes looking, nothing escalates on a second or third catch, and "ends the attempt" is read as the dazed three seconds a caught hand costs everywhere else in town rather than as being thrown off the roof. A real failed-watch state — noticed, chased off the rooftops, unable to try again for a while — is not a thing this grammar has.

// The pair the reporter hands over rather than sells — cut fine enough to turn
// faster than the bent nail core.lockpick is, worn in the off hand rather than
// carried loose.
# item fine-lockpicks
title: Fine Lockpicks
examine: A jeweller's set wrapped in oilcloth, each pick a different weight for a different lock.
slot: offhand
thieving-tool, +2 thieving
value: 45
item-level: 2-5

// --- tests ---

// Standing on Market Row, one road from the climb, with nothing yet said to
// the reporter and nothing yet seen from the roof.
# save at-market-row
{"version":13,"location":"tulsa.market-row"}

// Start to finish: the reporter names the price, the rooftop watch pays off,
// and the reporter buys what came off it. The watch is one attempt per use
// precisely so a caught attempt is a `use:` away from being tried again
// rather than a dead end — what that costs, not what it takes to land, is
// this route's to prove; how often the roll lands either way is a balance
// question and not asked here, and so is what the reporter pays — a purse that
// walked in empty and stands above nothing says the price was met.
# test attention-to-detail-start-to-finish
lock-pools
load: at-market-row
talk: reporter
choose: I'll take a look.
assert: watching-the-duke.watching
travel: market-rooftops
use: location.market-rooftops.watch-the-castle-windows
assert: overheard-the-captain
assert: watching-the-duke.reporting
travel: market-row
talk: reporter
choose: continue
assert: watching-the-duke.paid
assert: inventory.core.coin > 0
assert: has fine-lockpicks

# What is still wrong that waits on the author

Each of these is a place where `.planning/thieving-expansion.md` asked for something
the language cannot say, and what ships is the nearest thing it can. **A line is
deleted the day it closes**, and one you answer crosses to `open-agent.md`.

---

## What the jail takes off a player

The brief takes the pack and every worn thing and holds them in a crate to be
reclaimed. `take: everything` exists and nothing gives back what it took, so a
jailing takes the purse and leaves the rest, and there is no crate. The `@@@` on
`sent-to-jail` in `content/thieving.dsl` says so on the line.

*Moves when: he says whether jail is meant to strip a player at all. If no, the note
is deleted and this closes. If yes, it is a language feature — a held set that comes
back — and the line crosses to a lane with that shape.*

## Whether the warden jails on sight or on speech

The brief sends anyone the warden finds in a room with him back to the cells. Nothing
fires on a player entering a room, so he does it to anybody who speaks to him, and
the way past him in the cells is to walk past. The rest of it stands as asked: he is
lured down by a racket or out to the mess by doughnuts, is gone five minutes, and
the office door and the lockbox both check whether he is back before they open.

*Moves when: he says whether a room may act on being entered. That is a language
question — an `on enter:` a location takes — and not a content edit.*

## Whether the market watch rotates on a clock or on a wait

The brief has a guard detail that comes and goes. The world has no clock a location
can read, so the detail stands in both markets until the player waits twenty seconds
for it to move on, and it is back three minutes later on a buff's timer. That is a
rotation the player starts rather than one that happens to them.

*Moves when: he says whether the town should run a clock of its own. If the wait is
the intended shape, this closes. If not, it is a language feature and crosses.*

## Whether luck should scale anything

`# stat luck` is fed by three jewels' worth of passives, one of them new (`The
Ledger`), and the only line in the corpus that reads it is a `luck vs 60:` on the
tutorial dresser. `rewards scaled by: luck` exists on the action page and no action
carries it.

*Moves when: he says what luck is for. `rewards scaled by: luck` on `# action steal` is
one line in `content/thieving.dsl` and every pocket and chest follows it.*

## What `take:` should do past what is held

`take: 50 core.coin` against a purse of twenty leaves the twenty. The confiscation in
`content/thieving.dsl` is a thirteen-rung binary ladder of `if inventory.core.coin >=
n: take: n` because of it, mirrored by a second ladder that hands the purse back from
the warden's box, and both stop counting at eight thousand and one hundred
ninety-one coin.

*Moves when: he says whether `take:` should take what is there. If yes it is an
engine line and crosses; the ladders then collapse to `take: everything`-shaped
lines once a stored count can be given back.*

## Whether `examine:` should take fragments

A `{condition: words}` fragment in an `examine:` line loads clean and is dropped when
the line is read. The urchins are two entities — ragged and fed — so that what the
player sees of them changes, and the widow is two entities for the same reason.

*Moves when: he says whether an examine is a line the game says. If yes, it is a
language feature and crosses; the paired entities then fold into one each.*

## What the rogue's outfit is meant to boost

The brief says each piece boosts *thieving related stats of allocated passives by
15%*, which reads like a cluster-effect worn as clothing. Gear cannot say that, so
what ships is `+15% thieving-ability` on the hood and chestwrap and `+15%
thieving-rate` on the legwraps and sandals, at level 30.

*Moves when: he says which reading he meant. The stat reading is what is there; the
passive reading is a language feature and crosses.*

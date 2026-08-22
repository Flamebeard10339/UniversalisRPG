# What watching the first authoring run showed

Observations taken live while the first authoring agent worked, 2026-08-22, plus
what each one turns out to be underneath. Ordered by what they cost, not by when
they were noticed.

## 1. An author is gated on a suite that has no business gating them

`npm test` runs 3000-odd tests in twenty seconds, and an author changing one line
of content ran it over and over. Worse, two of those tests assert shipped tutorial
content rather than mechanics, in `src/runtime/integration.test.ts`:

- line 59, that the front door spans exactly four seconds
- line 68, that the dresser hands out one lockpick and not one per search

The second is about **the dresser route 2 is being authored into**. An author
touching the lockpicks collides with a TypeScript test by construction. Both are
claims about content and belong in `# test` sections. The rest of that file is
mechanics or derived sweeps and should stay.

**Unit tests are for mechanics. Content claims live in `# test`.**

## 2. There is no way to run one `# test` from a shell

`/test <id>` runs one, and only from inside the interactive REPL. So iterating on a
single route means the whole suite, and the agent did the rational thing: it piped
command files into `npm run play` and hand-rolled what a `# test` section already
is.

Its scratch `playcmds.txt` **was the deliverable**, written in a throwaway form
because the real form had no fast loop. A shell-runnable named test — one second,
no REPL — collapses the two artifacts into one and removes the reason to invent
the other. It also removes most of the appeal of a background watcher that pings on
breakage: a watcher hides latency, and there is no latency to hide once the check
is a second long.

## 3. `expect:` is all-or-nothing, and convergence is not

Three routes are meant to end in the same place holding the same quest, and are
meant to differ in experience, damage taken and what the world remembers. A full
state comparison cannot say that. `expect:` needs to be able to name the part of the
state that must match — position and quest standing — and stay quiet about the rest.

Until it can, convergence has to be written as a pile of `assert:` lines, which is
the enumerated form of a claim that should be derived from one save.

## 4. `@@@` was read as "leave it empty", and that was the prompt's fault

The brief said mark a stub and move on, which the agent read as writing
`examine: @@@`. A playtester cannot test that, and the run's own product —
`expected` and `confusion` — goes quiet on a room described by nothing.

`@@@` means **unreviewed, not absent**. The line should say what is supposed to
happen, in plain words, and carry the mark. The agent later began doing this on its
own and then flip-flopped, which is what an ambiguous instruction looks like from
outside.

## 5. Smaller things, each real

- **No shorthand for waiting out an action.** The agent wrote `/wait 30`, guessing a
  number large enough. It wants "wait until this finishes".
- **Saves carry items at count zero.** The fixture the agent produced lists holdings
  it does not hold, which is noise in a file a human is meant to read.
- **`drain: 5 health` cost a syntax fight.** One of several places the oracle did not
  say what a line takes, and the author found out by trying.
- **Do not rewrite a content module unread.** These files carry save bodies and
  `# test` sections that read like noise and are not. This is a repository rule and
  wants saying; that a tool refuses an unread write is a different fact and belongs
  to the tool.

## 6. The measurement, which is the point of the run

The agent spent something like half an hour on trial and error and then wrote the
module nearly in one pass. **The fluency it earned by minute thirty-three is what
the oracle owes it in minute one.** Every question it had to answer by experiment is
a line the oracle should have said, and its own list of those is the specification
for the next pass over the oracle.

Nothing here is a criticism of what it built. Watching where it was slow is the
whole reason the first run was worth doing with someone watching.

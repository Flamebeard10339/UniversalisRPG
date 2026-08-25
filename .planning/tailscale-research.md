# Seeing the game on a phone, and getting a run back off it

Research, 2026-08-24. No decision taken. The question was whether Tailscale is the
tool for playing on a phone while travelling and getting the playtest out.

## The goal

Play the game on a phone, stop the run, and get its words into Claude — by hand
via the clipboard, and eventually without a hand at all.

## What is already built, and is easy to miss

`src/ui/PlaytestBar.tsx:58` is a copy button wired to `driver.playtest.written()`.
Stopping a run and tapping it puts the whole run on the clipboard as DSL text,
ready to paste. **The manual half of the goal needs no new work.** The button's own
comment says the design: the clipboard is the browser's, and an agent reads the
same words off the surface's written state.

For the automatic half, `npm run contribution:issue -- --create` already builds a
GitHub issue body out of `local-changes` and files it with `gh`. The global Claude
settings already allow `gh issue view` and `gh api`, so an agent can read a filed
run today with nothing new built.

## The finding that decides the shape

**`navigator.clipboard` exists only in a secure context** — HTTPS, or localhost.
`src/ui/App.tsx:288` calls it as `navigator.clipboard?.writeText(...)`, so on a
plain-HTTP origin it silently does nothing: no error, no feedback, and a whole run
lost at the moment it was meant to be captured.

So `http://<tailnet-ip>:5173` on a phone is not a usable playtest surface. It can
show the game and it cannot get a run out of it, which is the only reason to be
there. Any path to the phone has to end in HTTPS or it fails at the last step.

## Two more facts worth having

**The game has never been published.** `git tag -l 'v*'` is empty and
`.github/workflows/publish.yml` triggers on `v*`, so there is no URL to open. A
`v0.1.0` tag would produce the itch.io build, and that is by a distance the
simplest way onto a phone: no VPN, no desktop awake, no network. It serves the
shipped build only, which is the whole question — a playtest of what is committed
is worth something, a playtest of the working tree is worth more.

**localStorage is per-origin.** Saves and `local-changes` live in one key per slot
(`src/ui/browserStore.ts`), so `localhost:5173`, a tailnet address and an itch.io
page are three separate worlds. Nothing follows the player between them. This is
not a bug to fix; it is the reason the clipboard is the right seam and a shared
filesystem is not.

## What Tailscale does and does not buy

It puts the phone and the desktop on one private network with no ports opened and
no firewall work. Installing it on both and signing in is genuinely about ten
minutes.

What it does **not** do is move the run back. The run lands in the phone's
localStorage either way. Tailscale delivers the app; it does nothing about the
data, and the data was already handled by the copy button. **The only thing it
actually buys is playing the working tree rather than the last shipped build.**

Whether that is worth it is the open question.

## The full recipe, if it is judged worth it

1. Tailscale on the desktop and the phone, same account. Ten minutes, no config.
2. Enable HTTPS and MagicDNS in the Tailscale admin console, then put
   `tailscale serve` in front of Vite. That terminates TLS with a real certificate
   and serves `https://<machine>.<tailnet>.ts.net` — a secure context, so the copy
   button works.
3. Add that hostname to `server.allowedHosts` in `vite.config.ts` or Vite 6
   answers 403 on the Host header, and unpin `--host 127.0.0.1` in
   `.claude/launch.json`.

Steps 2 and 3 are what make this a task rather than an install. Step 1 alone
produces a phone that can see the game and cannot report on it.

## The alternative that was not costed

Tag `v0.1.0` and play the itch.io build. Costs one tag, works from any network on
any device with the desktop asleep, and gives up only the uncommitted working
tree. Nobody has yet said whether playing the working tree is a requirement or a
habit, and that is the question this note is waiting on.

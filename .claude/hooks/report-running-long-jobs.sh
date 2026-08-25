#!/usr/bin/env bash

# Says what is already holding the machine when a command is about to add to it,
# and then gets out of the way. It never refuses.
#
# The failure this answers is an agent that does not know a suite is already
# running, not an agent that needs stopping — and a guard that refuses work which
# would have been fine is one people learn to route around, which costs more than
# the pile-up did. The worker cap in vite.config.ts is what actually bounds the
# damage; this only makes the state visible to whoever is about to add to it.

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

# The payload arrives on stdin and can only be read once, so it is captured
# before any field is taken out of it.
payload=$(cat)
field() { printf '%s' "$payload" | node "$here/lib/hook-field.js" "$1"; }

command=$(field tool_input.command)

kind=$(node "$here/lib/long-job-kind.js" "$command" < /dev/null)
[ -z "$kind" ] && exit 0

held=$(node "$here/lib/running-long-jobs.js" "$kind" < /dev/null)
[ -z "$held" ] && exit 0

count=$(printf '%s\n' "$held" | grep -c .)
pids=$(printf '%s\n' "$held" | cut -f1 | tr '\n' ',' | sed 's/,$//')

case "$kind" in
  test) what="test suite" ;;
  dev) what="dev server" ;;
  *) what="$kind job" ;;
esac
[ "$count" -gt 1 ] && what="${what}s"

{
  echo "Already running on this machine: $count $what."
  printf '%s\n' "$held" | sed 's/^/  /'
  echo
  echo "Nothing is blocked. vitest is capped at half the cores, so one more shares"
  echo "the box and everything gets slower rather than anything failing. If these are"
  echo "orphans from a session that was killed, stop them deliberately with:"
  echo "  taskkill /F /PID ${pids}"
  echo "Otherwise decide whether to wait or to go ahead."
} | node "$here/lib/allow-with-context.js"

exit 0

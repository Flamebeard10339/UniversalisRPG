#!/usr/bin/env bash

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

# The payload arrives on stdin and can only be read once, so it is captured
# before any field is taken out of it.
payload=$(cat)
field() { printf '%s' "$payload" | node "$here/lib/hook-field.js" "$1"; }

command=$(field tool_input.command)

kind=$(node "$here/lib/long-job-kind.js" "$command")
[ -z "$kind" ] && exit 0

held=$(node "$here/lib/running-long-jobs.js" "$kind")
[ -z "$held" ] && exit 0

case "$kind" in
  test) what="A test suite" ;;
  dev) what="A dev server" ;;
  *) what="A $kind job" ;;
esac

pids=$(printf '%s\n' "$held" | cut -f1 | tr '\n' ',' | sed 's/,$//')

{
  echo "Blocked: $what is already running. Starting a second one is what pins this machine."
  echo
  echo "Holding the machine now:"
  printf '%s\n' "$held" | sed 's/^/  /'
  echo
  echo "Wait for it, or — if it is an orphan left by a session that was killed —"
  echo "say so and stop it deliberately:  taskkill /F /PID ${pids}"
  echo
  echo "Do not rephrase the command to get past this. A form the guard cannot"
  echo "read is not a form it approves, and the CPU does not care how it was spelled."
} >&2

exit 2

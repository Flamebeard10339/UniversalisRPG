#!/usr/bin/env bash

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

# The payload arrives on stdin and can only be read once, so it is captured
# before any field is taken out of it — a second call to hook-field.js would
# find stdin already drained and report an empty string, which reads exactly
# like a field that was absent.
payload=$(cat)
field() { printf '%s' "$payload" | node "$here/lib/hook-field.js" "$1"; }

command=$(field tool_input.command)
cwd=$(field cwd)

# Which directories this command would commit into, decided by tokenizing it
# rather than by globbing for two adjacent words. The previous matcher asked
# only whether the string contained "git add" or "git commit" and then asked
# git about the caller's cwd, which is two independent wrong questions: any
# option between the verb and the subcommand hid the write completely, and the
# branch it reported belonged to a directory the command need not touch. Both
# were observed on 2026-08-06 — worktree commits blocked because the primary
# checkout sat on main, while `git -C <worktree> commit` passed unexamined.
targets=$(node "$here/lib/git-write-dirs.js" "$command")
[ -z "$targets" ] && exit 0

blocked=$(
  printf '%s\n' "$targets" | while IFS= read -r target; do
    [ -z "$target" ] && continue
    [ "$target" = "." ] && target="${cwd:-.}"
    # A relative -C or cd is relative to where the command starts, not to
    # wherever this hook happens to be invoked from.
    case "$target" in
      /*|[A-Za-z]:[/\\]*|\\\\*) ;;
      *) target="${cwd:-.}/$target" ;;
    esac
    # An unreadable target falls back to the caller's own checkout and then to
    # this hook's, which errs toward blocking rather than toward letting a
    # write onto main through.
    branch=$(git -C "$target" rev-parse --abbrev-ref HEAD 2>/dev/null \
      || git -C "${cwd:-.}" rev-parse --abbrev-ref HEAD 2>/dev/null \
      || git rev-parse --abbrev-ref HEAD 2>/dev/null \
      || true)
    [ "$branch" = "main" ] && printf '%s\n' "$target"
  done
)

if [ -n "$blocked" ]; then
  echo "Blocked: git add / git commit are not allowed on main. Create or switch to a feature branch first." >&2
  echo "The write resolved to main in: $(printf '%s' "$blocked" | tr '\n' ' ')" >&2
  echo "If this is wrong, say so rather than rephrasing the command — a form this guard cannot see is not a form it approves." >&2
  exit 2
fi

exit 0

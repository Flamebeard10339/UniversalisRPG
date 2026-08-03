#!/usr/bin/env bash

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

# The payload arrives on stdin and can only be read once, so it is captured
# before any field is taken out of it — a second call to hook-field.js would
# find stdin already drained and report an empty string, which reads exactly
# like a field that was absent.
payload=$(cat)
field() { printf '%s' "$payload" | node "$here/lib/hook-field.js" "$1"; }

command=$(field tool_input.command)

case "$command" in
  *git\ add*|*git\ commit*)
    # Ask git about the directory the command will run in. A worktree is on
    # its own branch, and a bare `git rev-parse` answers for wherever this
    # hook happens to be invoked from — which is the primary checkout. That
    # made the guard report `main` for a worktree nowhere near it, blocking
    # every write in every worktree the moment the primary checkout was
    # switched to main, and silently passing them all back while it sat on a
    # feature branch. Neither answer had anything to do with the branch being
    # written to.
    #
    # An unreadable cwd falls back to the old behaviour, which errs toward
    # blocking rather than toward letting a write onto main through.
    cwd=$(field cwd)
    branch=$(git -C "${cwd:-.}" rev-parse --abbrev-ref HEAD 2>/dev/null || git rev-parse --abbrev-ref HEAD 2>/dev/null || true)

    if [ "$branch" = "main" ]; then
      echo "Blocked: git add / git commit are not allowed on main. Create or switch to a feature branch first." >&2
      exit 2
    fi
    ;;
esac

exit 0

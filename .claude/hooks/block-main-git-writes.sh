#!/usr/bin/env bash

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
command=$(node "$here/lib/hook-field.js" tool_input.command)

case "$command" in
  *git\ add*|*git\ commit*)
    branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)

    if [ "$branch" = "main" ]; then
      echo "Blocked: git add / git commit are not allowed on main. Create or switch to a feature branch first." >&2
      exit 2
    fi
    ;;
esac

exit 0
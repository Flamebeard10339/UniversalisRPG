#!/usr/bin/env bash

command=$(jq -r '.tool_input.command // ""')

case "$command" in
  git\ add*|git\ commit\ -m*)
    branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)

    if [ "$branch" = "main" ]; then
      echo "Blocked: git add / git commit are not allowed on main. Create or switch to a feature branch first." >&2
      exit 2
    fi
    ;;
esac

exit 0
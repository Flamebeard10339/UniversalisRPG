#!/usr/bin/env bash

command=$(node .claude/hooks/lib/tool-command.js)

case "$command" in
  *git\ commit*) ;;
  *) exit 0 ;;
esac

status=$(npm run --silent audit-status 2>&1)

if [ $? -eq 0 ]; then
  exit 0
fi

{
  echo "The git command above ran normally. This is the audit ledger reporting on the new HEAD:"
  echo
  echo "$status"
} >&2
exit 2

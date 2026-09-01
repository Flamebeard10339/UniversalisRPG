#!/usr/bin/env bash

# Reads back what a subagent had to work out for itself before it could start,
# so the orchestrator sees it without having to remember to look.
#
# It never blocks and never fails the stop: anything unexpected prints an empty
# envelope and gets out of the way.

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)

cd "$root" || exit 0

npx tsx scripts/friction.ts --hook 2>/dev/null || echo '{}'

exit 0

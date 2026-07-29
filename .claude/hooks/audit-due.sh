#!/usr/bin/env bash
#
# Reports the audit ledger once, when it crosses from OK to DUE.
#
# It watches HEAD rather than the command text. Matching `git commit` could not
# tell a commit from `echo "git commit"` or `--dry-run`, said nothing about the
# commits a merge or a rebase makes, and claimed the command "ran normally"
# without ever looking at its exit code. A moved HEAD is the thing the ledger
# actually counts.

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
cwd=$(node "$here/lib/hook-field.js" cwd)
[ -n "$cwd" ] && cd "$cwd" 2>/dev/null

head=$(git rev-parse HEAD 2>/dev/null) || exit 0
git_dir=$(git rev-parse --git-dir 2>/dev/null) || exit 0

# Per worktree, because --git-dir points inside .git/worktrees there: a worktree
# has its own HEAD and so its own ledger.
state="$git_dir/audit-due-state"
seen_head=""
seen_verdict=""
[ -r "$state" ] && read -r seen_head seen_verdict < "$state"

[ "$head" = "$seen_head" ] && exit 0

if ledger=$(npm run --silent audit-status 2>&1); then
  printf '%s ok\n' "$head" > "$state"
  exit 0
fi

# Non-zero can also mean the ledger could not run at all — no node_modules in a
# fresh worktree, say. Only its own verdict lines are worth interrupting for.
case "$ledger" in
  *"audit due:"*|*"no audit doc:"*) ;;
  *) exit 0 ;;
esac

printf '%s due\n' "$head" > "$state"
[ "$seen_verdict" = "due" ] && exit 0

{
  echo "HEAD moved to $head, and the audit ledger just went from OK to DUE:"
  echo
  echo "$ledger"
} >&2
exit 2

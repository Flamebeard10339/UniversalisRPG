// Reads a notice on stdin and prints the PreToolUse verdict that puts it in the
// agent's context while letting the command run.
//
// The escaping is why this is a file and not a printf in the shell: a notice
// carries command lines, which carry quotes and backslashes, and a hook whose
// JSON does not parse is read as a hook that made no decision.
let raw = '';
process.stdin.on('data', (chunk) => {
  raw += chunk;
});
process.stdin.on('end', () => {
  const notice = raw.trim();
  if (!notice) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        additionalContext: notice,
      },
    }),
  );
});

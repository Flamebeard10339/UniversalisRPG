// Which directories a shell command would commit into, or nothing when it
// would not commit at all.
//
// Both halves matter and the guard that called this had neither. Globbing the
// command for the adjacent words "git commit" cannot see `git -C <dir> commit`
// or `git --no-pager add`, so any option between the two hid the write
// entirely; and resolving the branch from the caller's cwd answers about a
// directory the command need not touch, which blocked every worktree write
// whenever the primary checkout sat on main. Detection is therefore
// deliberately broad and targeting deliberately exact: over-detecting costs a
// branch lookup, while mis-targeting is how the guard reached both wrong
// answers at once.
//
// Prints one directory per line; a lone "." means "wherever the caller already
// is". Prints nothing when no segment commits.

// Quoting is honoured so that a command merely *containing* the words — a
// payload being echoed, a finding being filed about this very hook — stays one
// token and is not read as an invocation.
function tokenize(line) {
  const tokens = [];
  let token = '';
  let quote = null;
  let started = false;
  const push = () => {
    if (started) tokens.push(token);
    token = '';
    started = false;
  };
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quote) {
      if (char === quote) quote = null;
      else token += char;
      started = true;
    } else if (char === '"' || char === "'") {
      quote = char;
      started = true;
    } else if (char === '\\' && i + 1 < line.length) {
      token += line[++i];
      started = true;
    } else if (/\s/.test(char)) {
      push();
    } else if (char === ';' || char === '&' || char === '|') {
      push();
      tokens.push(char);
    } else {
      token += char;
      started = true;
    }
  }
  push();
  return tokens;
}

// Git's own global options, split by whether they consume the next token. A
// value-taking option must be skipped with its value or the value reads as the
// subcommand — which is exactly how `-C <dir> commit` slipped past a matcher
// that only ever looked for two adjacent words.
const TAKES_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--super-prefix', '--config-env']);
const REDIRECTS_TREE = new Set(['-C', '--work-tree']);
const WRITE_SUBCOMMANDS = new Set(['add', 'commit']);

function directoriesFor(command) {
  const tokens = tokenize(command);
  const found = new Set();
  // `cd` persists across `&&` within one command line, so it is tracked for the
  // whole line rather than per segment.
  let cwd = null;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === 'cd' && tokens[i + 1] && !/^[;&|]$/.test(tokens[i + 1])) {
      cwd = tokens[i + 1];
      continue;
    }
    if (token !== 'git' && !/[/\\]git(\.exe)?$/.test(token)) continue;

    let target = null;
    let j = i + 1;
    for (; j < tokens.length; j++) {
      const next = tokens[j];
      if (/^[;&|]$/.test(next)) break;
      if (TAKES_VALUE.has(next)) {
        if (REDIRECTS_TREE.has(next) && tokens[j + 1] !== undefined) target = tokens[j + 1];
        j++;
        continue;
      }
      if (next.startsWith('-')) {
        const equals = next.indexOf('=');
        if (equals !== -1) {
          const flag = next.slice(0, equals);
          if (REDIRECTS_TREE.has(flag)) target = next.slice(equals + 1);
        }
        continue;
      }
      // The first bare token after the options is the subcommand.
      if (WRITE_SUBCOMMANDS.has(next)) found.add(target ?? cwd ?? '.');
      break;
    }
    i = j;
  }
  return [...found];
}

const dirs = directoriesFor(process.argv[2] ?? '');
if (dirs.length > 0) process.stdout.write(dirs.join('\n') + '\n');

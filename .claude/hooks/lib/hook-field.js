// Prints one string field of the hook payload, addressed by dotted path, or
// nothing at all: a hook reading a field that is absent should carry on with a
// default rather than see the word "undefined".
let raw = '';
process.stdin.on('data', (chunk) => {
  raw += chunk;
});
process.stdin.on('end', () => {
  let value;
  try {
    value = (process.argv[2] ?? '').split('.').reduce((held, key) => (held == null ? undefined : held[key]), JSON.parse(raw));
  } catch {
    value = undefined;
  }
  process.stdout.write(typeof value === 'string' ? value : '');
});

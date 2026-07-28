let raw = '';
process.stdin.on('data', (chunk) => {
  raw += chunk;
});
process.stdin.on('end', () => {
  try {
    process.stdout.write(JSON.parse(raw).tool_input?.command ?? '');
  } catch {
    process.stdout.write('');
  }
});

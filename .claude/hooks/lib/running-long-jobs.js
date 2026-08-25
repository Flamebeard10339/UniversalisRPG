// Prints the node processes already holding the machine as the kind named in
// argv[2] — one `<pid>\t<command line>` per line, nothing if there are none.
//
// A process is classified by the same reading of its command line that decides
// what a command would start, so the guard compares like with like and neither
// side can drift from the other.
import { execFileSync } from 'node:child_process';
import { kindOfBody } from './long-job-kind.js';

// Win32_Process is the only place a command line can be read on Windows, and a
// command line is the only thing that tells a suite from a dev server: both are
// node.exe.
function nodeProcesses() {
  try {
    const out = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | ForEach-Object { \"$($_.ProcessId)`t$($_.CommandLine)\" }",
      ],
      { encoding: 'utf8', timeout: 10_000, windowsHide: true },
    );
    return out.split(/\r?\n/).filter((line) => line.includes('\t'));
  } catch {
    // An unanswerable machine is not a busy one. A guard that blocks when it
    // cannot see is a guard nobody can work around except by not working.
    return [];
  }
}

const wanted = process.argv[2] ?? '';
if (wanted) {
  const held = nodeProcesses().filter((line) => kindOfBody(line.slice(line.indexOf('\t') + 1)) === wanted);
  if (held.length) process.stdout.write(`${held.join('\n')}\n`);
}

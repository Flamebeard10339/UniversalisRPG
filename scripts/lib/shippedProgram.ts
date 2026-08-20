import path from 'node:path';
import ts from 'typescript';
import { shippedModules } from './layers';

// The subject set is the same enumeration the layer rule sweeps, tests taken
// out. A rule about the code this repository ships that walks a tree of its
// own reaches whichever driver that tree happens to hold and no other.
export const repoRoot = process.cwd().replace(/\\/g, '/');

export const relativeTo = (root: string, fileName: string): string => fileName.replace(`${root}/`, '');

// One source compiled alone, so a rule about what the checker sees can be
// asked a case whose right answer is known. Nothing is written anywhere: the
// file exists only in the host's answers.
export function programOverSource(name: string, source: string): ts.Program {
  const host = ts.createCompilerHost({ strict: true });
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) =>
    fileName === name ? ts.createSourceFile(fileName, source, languageVersion, true) : original(fileName, languageVersion, onError, shouldCreate);
  host.fileExists = (fileName) => fileName === name || ts.sys.fileExists(fileName);
  host.readFile = (fileName) => (fileName === name ? source : ts.sys.readFile(fileName));
  return ts.createProgram([name], { strict: true, noEmit: true, skipLibCheck: true }, host);
}

export function programOverShippedModules(root: string = repoRoot): ts.Program {
  const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
  if (configPath === undefined) throw new Error('no tsconfig.json at the repository root');
  const parsed = ts.parseJsonConfigFileContent(ts.readConfigFile(configPath, ts.sys.readFile).config, ts.sys, root);
  return ts.createProgram(shippedModules().map((file) => path.resolve(root, file)), { ...parsed.options, noEmit: true });
}

import path from 'node:path';
import ts from 'typescript';
import { shippedModules } from './layers';

export const repoRoot = process.cwd().replace(/\\/g, '/');

export const relativeTo = (root: string, fileName: string): string => fileName.replace(`${root}/`, '');

export function programOverSource(name: string, source: string): ts.Program {
  const host = ts.createCompilerHost({ strict: true });
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) =>
    fileName === name ? ts.createSourceFile(fileName, source, languageVersion, true) : original(fileName, languageVersion, onError, shouldCreate);
  host.fileExists = (fileName) => fileName === name || ts.sys.fileExists(fileName);
  host.readFile = (fileName) => (fileName === name ? source : ts.sys.readFile(fileName));
  return ts.createProgram([name], { strict: true, noEmit: true, skipLibCheck: true }, host);
}

export function programOverShippedModules(overrides: Readonly<Record<string, string>> = {}, root: string = repoRoot): ts.Program {
  const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
  if (configPath === undefined) throw new Error('no tsconfig.json at the repository root');
  const parsed = ts.parseJsonConfigFileContent(ts.readConfigFile(configPath, ts.sys.readFile).config, ts.sys, root);
  const options = { ...parsed.options, noEmit: true };
  const files = shippedModules().map((file) => path.resolve(root, file));
  const entries = Object.entries(overrides);
  if (entries.length === 0) return ts.createProgram(files, options);
  const replaced = new Map(entries.map(([file, text]) => [path.resolve(root, file).replace(/\\/g, '/'), text]));
  for (const name of replaced.keys()) if (!files.some((file) => file.replace(/\\/g, '/') === name)) throw new Error(`${name} is not a shipped module, so overriding it would compile nothing`);
  const host = ts.createCompilerHost(options);
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
    const text = replaced.get(fileName.replace(/\\/g, '/'));
    return text === undefined ? original(fileName, languageVersion, onError, shouldCreate) : ts.createSourceFile(fileName, text, languageVersion, true);
  };
  host.readFile = (fileName) => replaced.get(fileName.replace(/\\/g, '/')) ?? ts.sys.readFile(fileName);
  return ts.createProgram(files, options, host);
}

export function semanticErrors(program: ts.Program, root: string = repoRoot): string[] {
  return program
    .getSemanticDiagnostics()
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error && diagnostic.file !== undefined)
    .map((diagnostic) => `${relativeTo(root, diagnostic.file!.fileName.replace(/\\/g, '/'))}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
}

// Single shared "compile this DSL source and, if valid, commit it into the
// draft that feeds the live bundle" path — used by both DslModuleEditor.tsx's
// CodeMirror linter (on a 300ms debounce while typing) and the dev-only test
// harness (window.__test.dsl.applyEdit), so a scripted edit takes exactly the
// same route into the game as a real keystroke would.
import type { ContentModule } from '../types';
import { compileDsl } from './compiler';
import { useDslEditorState } from '../../stores/dslEditorState';

export type ApplyDslEditResult = { ok: true } | { ok: false; error: string; line?: number };

export const upsertModuleById = (modules: ContentModule[], module: ContentModule): ContentModule[] =>
  modules.some((candidate) => candidate.id === module.id)
    ? modules.map((candidate) => (candidate.id === module.id ? module : candidate))
    : [module, ...modules];

export const compileAndCommitDslModule = (
  moduleId: string,
  source: string,
  draftModules: ContentModule[],
  onPatch: (patch: { modules: ContentModule[] }) => void,
): ApplyDslEditResult => {
  try {
    const { module } = compileDsl(source);
    useDslEditorState.getState().markValid(moduleId, source, module);
    onPatch({ modules: upsertModuleById(draftModules, module) });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const line = error instanceof Error && 'line' in error ? (error as { line?: number }).line : undefined;
    return { ok: false, error: message, line };
  }
};

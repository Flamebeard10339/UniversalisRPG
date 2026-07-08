// The DSL text-editor surface: CodeMirror bound to one module's raw DSL
// source, with live parse-error red-lining, last-valid caching (so a broken
// keystroke never reaches the live game — see src/stores/dslEditorState.ts),
// and context-aware autocomplete (dropdown + ghost text).
import { useEffect, useMemo, useState } from 'react';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { keymap } from '@codemirror/view';
import { linter, type Diagnostic } from '@codemirror/lint';
import type { Translator } from '../../game/i18n';
import type { ContentBundle, ContentModule, ContributionDraft, ValidationIssue } from '../../game/types';
import { compileDsl } from '../../game/contentDsl/compiler';
import { useDslEditorState } from '../../stores/dslEditorState';
import { dslCompletionSource, scanFlagIdsInSource, type DslCompletionSources } from './dslCompletions';
import { ghostTextField, ghostTextKeymap, ghostTextUpdateListener } from './dslGhostText';

type DslModuleEditorProps = {
  moduleId: string;
  universeId: string;
  bundle: ContentBundle;
  draft: ContributionDraft;
  issues: ValidationIssue[];
  onPatch: (patch: Partial<Omit<ContributionDraft, 'universeId'>>) => void;
  t: Translator;
};

const upsertModuleById = (modules: ContentModule[], module: ContentModule): ContentModule[] =>
  modules.some((candidate) => candidate.id === module.id)
    ? modules.map((candidate) => (candidate.id === module.id ? module : candidate))
    : [module, ...modules];

// A missing static file doesn't always come back as a literal 404 — Vite's
// dev server serves its SPA-fallback index.html with a 200 for any
// unmatched path, which would otherwise look like a successfully-fetched
// (but garbage) .md file for every module that doesn't have one (i.e. every
// module except the ones actually migrated to the DSL). Two independent
// checks guard against this: content-type (mirrors src/game/loader.ts's
// same fix) and, defensively, rejecting anything that's obviously an HTML
// document regardless of what content-type it claims.
const looksLikeHtmlDocument = (text: string): boolean => /^\s*<(!doctype html|html)\b/i.test(text);

const fetchModuleDslSource = async (universeId: string, moduleId: string): Promise<string | null> => {
  const response = await fetch(`/content/universes/${universeId}/modules/${moduleId}.md`);
  if (!response.ok) return null;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType && !contentType.includes('text')) return null;
  const text = await response.text();
  if (looksLikeHtmlDocument(text)) return null;
  return text;
};

const formatTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const DslModuleEditor = ({ moduleId, universeId, bundle, draft, issues, onPatch, t }: DslModuleEditorProps) => {
  const [availability, setAvailability] = useState<'loading' | 'available' | 'new' | 'unavailable'>('loading');
  const [compileError, setCompileError] = useState<{ message: string } | null>(null);

  const dslDraft = useDslEditorState((state) => state.drafts[moduleId]);
  const hydrate = useDslEditorState((state) => state.hydrate);
  const discardDraft = useDslEditorState((state) => state.discardDraft);
  const openDraft = useDslEditorState((state) => state.openDraft);
  const setSource = useDslEditorState((state) => state.setSource);
  const markValid = useDslEditorState((state) => state.markValid);
  const revertToLastValid = useDslEditorState((state) => state.revertToLastValid);

  useEffect(() => {
    let cancelled = false;
    setAvailability('loading');
    (async () => {
      await hydrate(moduleId);
      if (cancelled) return;
      const alreadyOpen = useDslEditorState.getState().getDraft(moduleId);
      // Self-heal: a draft cached before the SPA-fallback content-type bug
      // was fixed could have HTML garbage baked in as its baseline forever
      // (openDraft never overwrites an existing draft) — discard it here so
      // a real fetch runs instead of getting stuck on stale garbage.
      if (alreadyOpen && looksLikeHtmlDocument(alreadyOpen.baselineSource)) {
        discardDraft(moduleId);
      } else if (alreadyOpen) {
        setAvailability('available');
        return;
      }
      const fetched = await fetchModuleDslSource(universeId, moduleId).catch(() => null);
      if (cancelled) return;
      if (fetched === null) {
        setAvailability('unavailable');
        return;
      }
      openDraft(moduleId, fetched);
      setAvailability('available');
    })();
    return () => {
      cancelled = true;
    };
  }, [moduleId, universeId, hydrate, discardDraft, openDraft]);

  const completionSources: DslCompletionSources = useMemo(
    () => ({
      itemIds: (bundle.items ?? []).map((item) => item.id),
      flagIds: [...(bundle.flags ?? []).map((flag) => flag.id), ...scanFlagIdsInSource(dslDraft?.source ?? '')],
      dialogueIds: (bundle.dialogues ?? []).map((dialogue) => dialogue.id),
      moduleIds: [...(bundle.modules ?? []).map((module) => module.id), ...(draft.modules ?? []).map((module) => module.id)],
      skillIds: bundle.skills.map((skill) => skill.id),
    }),
    [bundle, draft.modules, dslDraft?.source],
  );

  const extensions = useMemo(
    () => [
      EditorView.lineWrapping,
      keymap.of(completionKeymap),
      autocompletion({ override: [dslCompletionSource(completionSources)] }),
      ghostTextField,
      ghostTextUpdateListener(completionSources),
      ghostTextKeymap,
      linter(
        (view) => {
          const source = view.state.doc.toString();
          try {
            const { module } = compileDsl(source);
            setCompileError(null);
            markValid(moduleId, source, module);
            onPatch({ modules: upsertModuleById(draft.modules ?? [], module) });
            return [];
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setCompileError({ message });
            const line = error instanceof Error && 'line' in error ? (error as { line?: number }).line : undefined;
            const targetLine = view.state.doc.line(Math.min((line ?? 0) + 1, view.state.doc.lines));
            const diagnostic: Diagnostic = { from: targetLine.from, to: targetLine.to, severity: 'error', message };
            return [diagnostic];
          }
        },
        { delay: 300 },
      ),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [moduleId, completionSources],
  );

  if (availability === 'loading') return <p className="text-sm text-slate-400">{t('contribution.dsl.loading', 'Loading…')}</p>;

  if (availability === 'unavailable') {
    return (
      <section className="grid gap-2 rounded border border-slate-700 p-3">
        <p className="text-sm text-slate-300">
          {t('contribution.dsl.notMigrated', '"{id}" doesn\'t have DSL source yet — it\'s still authored as raw JSON.', { id: moduleId })}
        </p>
      </section>
    );
  }

  const isShowingStale = compileError !== null && dslDraft?.lastValidSource !== undefined && dslDraft.source !== dslDraft.lastValidSource;

  return (
    <section className="grid gap-3" data-testid="dsl-module-editor">
      {compileError && (
        <div className="rounded border border-red-500 bg-red-950/40 p-3 text-sm text-red-200">
          <p>{compileError.message}</p>
          {isShowingStale && dslDraft?.lastValidSource !== undefined && (
            <div className="mt-2 flex items-center gap-2">
              <span>
                {t('contribution.dsl.showingLastValid', 'Showing the last valid version from {time}.', { time: formatTime(dslDraft.updatedAt) })}
              </span>
              <button
                className="rounded border border-red-400 px-2 py-1 text-xs font-semibold text-red-100"
                onClick={() => revertToLastValid(moduleId)}
                type="button"
              >
                {t('contribution.dsl.revert', 'Revert to it')}
              </button>
            </div>
          )}
        </div>
      )}

      <CodeMirror
        basicSetup={{ closeBrackets: false, autocompletion: false, completionKeymap: false }}
        extensions={extensions}
        height="480px"
        onChange={(value) => setSource(moduleId, value)}
        theme="dark"
        value={dslDraft?.source ?? ''}
      />

      {issues.length > 0 && (
        <section className="rounded border border-slate-700 p-3">
          <h4 className="text-sm font-semibold text-slate-100">{t('contribution.dsl.validationIssues', 'Validation issues in the current preview')}</h4>
          <ul className="mt-1 grid gap-1 text-xs">
            {issues.map((issue, index) => (
              <li className={issue.severity === 'error' ? 'text-red-300' : 'text-amber-300'} key={`${issue.path}-${index}`}>
                {issue.severity}: {issue.path} — {t(issue.message, issue.message, issue.params)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
};

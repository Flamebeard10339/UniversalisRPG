// The DSL text-editor surface: CodeMirror bound to one module's raw DSL
// source, with live parse-error red-lining, last-valid caching (so a broken
// keystroke never reaches the live game — see src/stores/dslEditorState.ts),
// and context-aware autocomplete (dropdown + ghost text).
import { useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { linter, type Diagnostic } from '@codemirror/lint';
import type { Translator } from '../../game/i18n';
import type { ContentBundle, ContributionDraft, ValidationIssue } from '../../game/types';
import { compileAndCommitDslModule } from '../../game/contentDsl/applyModuleEdit';
import { useDslEditorState } from '../../stores/dslEditorState';
import { dslCompletionSource, scanFlagIdsInSource, type DslCompletionSources } from './dslCompletions';
import { ghostTextField, ghostTextKeymap, ghostTextUpdateListener } from './dslGhostText';
import { dslEditorTheme, dslLanguage, dslSyntaxHighlighting } from './dslLanguage';

type DslModuleEditorProps = {
  moduleId: string;
  universeId: string;
  bundle: ContentBundle;
  draft: ContributionDraft;
  issues: ValidationIssue[];
  onPatch: (patch: Partial<Omit<ContributionDraft, 'universeId'>>) => void;
  onStatusChange?: (status: DslEditorStatus) => void;
  t: Translator;
};

// Surfaced to a parent-owned status banner (see ContributionContentTab) instead
// of being rendered inline here, so the editor's caller can show one fixed-height
// status surface instead of conditionally-present boxes that shift layout.
export type DslEditorStatus =
  | { kind: 'loading' | 'unavailable' | 'good' }
  | { kind: 'error'; message: string; revert: (() => void) | null }
  | { kind: 'disabled'; message: string };

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

export const DslModuleEditor = ({ moduleId, universeId, bundle, draft, issues, onPatch, onStatusChange, t }: DslModuleEditorProps) => {
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

  // A module can compile cleanly and still never reach the live game: module
  // resolution (applyModulesToBundle) disables a module outright when it
  // conflicts with another module or one of its dependencies is itself
  // disabled — e.g. referencing a new flag via `set:`/`unset:` without
  // declaring it in this module's own flags list. That shows up only as a
  // warning-severity `validation.moduleDisabled`/`moduleConflictDisabled`
  // issue buried in the general issues list, with nothing else signaling
  // "this edit didn't take effect" — surface it in the status banner instead
  // of requiring a manual scan of that list.
  const modulePath = `modules.${moduleId}`;
  const conflictIssue = issues.find((candidate) => candidate.path === modulePath && candidate.message === 'validation.moduleConflictDisabled');
  const disabledIssue = conflictIssue ?? issues.find((candidate) => candidate.path === modulePath && candidate.message === 'validation.moduleDisabled');

  useEffect(() => {
    if (!onStatusChange) return;
    if (availability === 'loading') {
      onStatusChange({ kind: 'loading' });
    } else if (availability === 'unavailable') {
      onStatusChange({ kind: 'unavailable' });
    } else if (compileError) {
      const canRevert = dslDraft?.lastValidSource !== undefined && dslDraft.source !== dslDraft.lastValidSource;
      onStatusChange({ kind: 'error', message: compileError.message, revert: canRevert ? () => revertToLastValid(moduleId) : null });
    } else if (disabledIssue) {
      onStatusChange({
        kind: 'disabled',
        message: conflictIssue
          ? t('contribution.dsl.moduleConflictDisabled', 'This module compiled, but is currently disabled — it conflicts with another module or dependency over "{key}". See Validation issues below.', { key: conflictIssue.params?.key ?? moduleId })
          : t('contribution.dsl.moduleDisabled', 'This module compiled, but is currently disabled (a dependency is missing or disabled). See Validation issues below.'),
      });
    } else {
      onStatusChange({ kind: 'good' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availability, compileError, conflictIssue, disabledIssue, dslDraft?.lastValidSource, dslDraft?.source, moduleId]);

  // Everything the linter/completion callbacks need, other than `moduleId`
  // itself, is read through this ref rather than baked into `extensions`'s
  // memo deps below. `bundle`/`draft` change identity on essentially every
  // keystroke (a successful compile pushes into draft.modules, which
  // changes `bundle`, which re-renders this component with new props) — if
  // `extensions` depended on them, CodeMirror would reconfigure on every
  // keystroke. That doesn't just break click-to-apply on the completion
  // dropdown (the tooltip's DOM gets torn down mid-interaction) — it can
  // cascade into a genuine infinite loop: reconfigure -> linter re-fires ->
  // onPatch -> bundle changes -> re-render -> reconfigure -> ...
  const latestRef = useRef({ bundle, draft, onPatch, dslDraftSource: dslDraft?.source ?? '' });
  useEffect(() => {
    latestRef.current = { bundle, draft, onPatch, dslDraftSource: dslDraft?.source ?? '' };
  });

  const getCompletionSources = (): DslCompletionSources => {
    const { bundle: latestBundle, draft: latestDraft, dslDraftSource } = latestRef.current;
    return {
      itemIds: (latestBundle.items ?? []).map((item) => item.id),
      flagIds: [...(latestBundle.flags ?? []).map((flag) => flag.id), ...scanFlagIdsInSource(dslDraftSource)],
      dialogueIds: (latestBundle.dialogues ?? []).map((dialogue) => dialogue.id),
      moduleIds: [...(latestBundle.modules ?? []).map((module) => module.id), ...(latestDraft.modules ?? []).map((module) => module.id)],
      skillIds: latestBundle.skills.map((skill) => skill.id),
    };
  };

  const extensions = useMemo(
    () => [
      EditorView.lineWrapping,
      dslLanguage,
      dslSyntaxHighlighting,
      dslEditorTheme,
      Prec.highest(keymap.of(completionKeymap)),
      autocompletion({ override: [dslCompletionSource(getCompletionSources)] }),
      ghostTextField,
      ghostTextUpdateListener(getCompletionSources),
      ghostTextKeymap,
      linter(
        (view) => {
          const source = view.state.doc.toString();
          // Skip re-patching if nothing actually changed since the last
          // successful compile — avoids bundle churn from a reconfigure or
          // re-lint that isn't from a real edit.
          const currentlyValidSource = useDslEditorState.getState().getDraft(moduleId)?.lastValidSource;
          if (currentlyValidSource === source) {
            setCompileError(null);
            return [];
          }
          const { draft: latestDraft, onPatch: latestOnPatch } = latestRef.current;
          const result = compileAndCommitDslModule(moduleId, source, latestDraft.modules ?? [], latestOnPatch);
          if (result.ok) {
            setCompileError(null);
            return [];
          }
          setCompileError({ message: result.error });
          const targetLine = view.state.doc.line(Math.min((result.line ?? 0) + 1, view.state.doc.lines));
          const diagnostic: Diagnostic = { from: targetLine.from, to: targetLine.to, severity: 'error', message: result.error };
          return [diagnostic];
        },
        { delay: 300 },
      ),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [moduleId],
  );

  if (availability === 'loading' || availability === 'unavailable') return null;

  return (
    <section className="grid h-full grid-rows-[1fr_auto] gap-3" data-testid="dsl-module-editor">
      <div className="min-h-0 overflow-hidden rounded border border-slate-700 bg-slate-950">
        <CodeMirror
          basicSetup={{ closeBrackets: false, autocompletion: false, completionKeymap: false }}
          extensions={extensions}
          height="100%"
          onChange={(value) => setSource(moduleId, value)}
          theme="none"
          value={dslDraft?.source ?? ''}
        />
      </div>

      {issues.length > 0 && (
        <section className="overflow-y-auto rounded border border-slate-700 bg-slate-900 p-3 max-h-32">
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

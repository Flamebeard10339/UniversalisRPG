import { useEffect, useState } from 'react';
import type { Translator } from '../../game/i18n';
import type { ContentBundle, ContributionDraft, ValidationIssue } from '../../game/types';
import { toKebabInput } from '../../game/contentIds';
import { mergedContributionModules } from '../../game/contributionFiles';
import { useDslEditorState } from '../../stores/dslEditorState';
import { DslModuleEditor, type DslEditorStatus } from './DslModuleEditor';

type ContributionContentTabProps = {
  baseBundle: ContentBundle;
  bundle: ContentBundle;
  draft: ContributionDraft;
  issues: ValidationIssue[];
  onPatch: (patch: Partial<Omit<ContributionDraft, 'universeId'>>) => void;
  t: Translator;
};

const starterDslSource = (moduleId: string, universeId: string) =>
  `# info\nid: ${moduleId}\nversion: 1.0.0\nuniverse: ${universeId}\nauthor: contributor\ngame_version: 1.0\n`;

const bannerClass = (status: DslEditorStatus): string => {
  if (status.kind === 'error') return 'border-red-500 bg-red-950/40 text-red-200';
  if (status.kind === 'disabled') return 'border-amber-500 bg-amber-950/40 text-amber-200';
  if (status.kind === 'good') return 'border-emerald-600 bg-emerald-950/30 text-emerald-200';
  return 'border-slate-700 bg-slate-900 text-slate-400';
};

// One fixed-height status surface for the DSL editor below, so switching
// between a clean compile, a parse error, and a disabled-module warning never
// shifts the rest of the tab's layout (see DslModuleEditor's onStatusChange).
export const ContributionContentTab = ({ baseBundle, bundle, draft, issues, onPatch, t }: ContributionContentTabProps) => {
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [pendingNewModuleId, setPendingNewModuleId] = useState<string | null>(null);
  const [newModuleDraftId, setNewModuleDraftId] = useState('');
  const [status, setStatus] = useState<DslEditorStatus>({ kind: 'loading' });
  const openDraft = useDslEditorState((state) => state.openDraft);

  const moduleIds = mergedContributionModules(baseBundle, draft).map((module) => module.id);
  const dropdownIds = pendingNewModuleId && !moduleIds.includes(pendingNewModuleId)
    ? [pendingNewModuleId, ...moduleIds]
    : moduleIds;
  const activeModuleId = selectedModuleId && dropdownIds.includes(selectedModuleId) ? selectedModuleId : dropdownIds[0] ?? null;

  useEffect(() => {
    if (pendingNewModuleId && moduleIds.includes(pendingNewModuleId)) setPendingNewModuleId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleIds.join(','), pendingNewModuleId]);

  const createModule = () => {
    const id = toKebabInput(newModuleDraftId.trim());
    if (!id || dropdownIds.includes(id)) return;
    openDraft(id, starterDslSource(id, bundle.manifest.id));
    setPendingNewModuleId(id);
    setSelectedModuleId(id);
    setNewModuleDraftId('');
  };

  return (
    <section className="grid h-full grid-rows-[auto_auto_auto_1fr] gap-3 overflow-hidden" data-testid="edit-content-tab">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex items-end gap-2">
          <label className="text-sm text-slate-300 whitespace-nowrap">
            {t('contribution.dsl.selectModule', 'Mod')}
          </label>
          <select
            className="rounded bg-slate-950 px-3 py-2 text-sm text-slate-100"
            data-testid="dsl-module-select"
            onChange={(event) => setSelectedModuleId(event.target.value)}
            value={activeModuleId ?? ''}
          >
            {dropdownIds.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <input
            className="rounded bg-slate-950 px-3 py-2 text-sm text-slate-100"
            onChange={(event) => setNewModuleDraftId(event.target.value)}
            placeholder={t('contribution.modules.newModulePlaceholder', 'new-module-id')}
            value={newModuleDraftId}
          />
          <button
            className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
            data-testid="dsl-module-create"
            disabled={!newModuleDraftId.trim()}
            onClick={createModule}
            type="button"
          >
            {t('contribution.modules.add')}
          </button>
        </div>
      </div>

      <div className={`flex min-h-[3rem] items-center gap-3 rounded border px-3 py-2 text-sm ${bannerClass(status)}`} data-testid="dsl-status-banner">
        {status.kind === 'loading' && <span>{t('contribution.dsl.loading', 'Loading…')}</span>}
        {status.kind === 'unavailable' && (
          <span>{t('contribution.dsl.notMigrated', '"{id}" doesn\'t have DSL source yet — it\'s still authored as raw JSON.', { id: activeModuleId ?? '' })}</span>
        )}
        {status.kind === 'good' && <span>{t('contribution.dsl.statusGood', 'Good')}</span>}
        {status.kind === 'disabled' && <span>{status.message}</span>}
        {status.kind === 'error' && (
          <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
            <span>{status.message}</span>
            {status.revert && (
              <button className="rounded border border-red-400 px-2 py-1 text-xs font-semibold text-red-100" onClick={status.revert} type="button">
                {t('contribution.dsl.revert', 'Revert to it')}
              </button>
            )}
          </div>
        )}
      </div>

      {activeModuleId && (
        <div className="min-h-0 overflow-y-auto">
          <DslModuleEditor
            bundle={bundle}
            draft={draft}
            issues={issues}
            key={activeModuleId}
            moduleId={activeModuleId}
            onPatch={onPatch}
            onStatusChange={setStatus}
            t={t}
            universeId={bundle.manifest.id}
          />
        </div>
      )}
    </section>
  );
};

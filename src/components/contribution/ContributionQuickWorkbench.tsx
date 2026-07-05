import { useEffect, useMemo, useState } from 'react';
import type { ContentBundle, ContentModule, ContributionDraft, ModuleDataEntry, ModuleDataSection, ModuleDataSectionObject, UniversePlayState, ValidationIssue } from '../../game/types';
import type { Translator } from '../../game/i18n';
import { StructuredDataEditor, type StructuredSchema, type StructuredValue } from '../structuredData/StructuredData';
import { moduleDataSectionSchema } from '../structuredData/contentSchemas';
import { applyModulesToBundle } from '../../game/contentModules';

type DataKey = keyof ModuleDataSectionObject;
type SheetKind = 'add' | 'edit-location';

type Props = {
  baseBundle: ContentBundle;
  bundle: ContentBundle;
  draft: ContributionDraft;
  kind: SheetKind;
  moduleId: string;
  onClose: () => void;
  onLocationIdChange: (previousId: string, nextId: string) => void;
  onModuleChange: (moduleId: string) => void;
  onPatchDraft: (patch: Partial<Omit<ContributionDraft, 'universeId'>>) => void;
  playState: UniversePlayState;
  t: Translator;
};

type AssociatedItem = {
  key: DataKey;
  id: string;
  label: string;
  value: StructuredValue;
};

const dataKeyTypes: Partial<Record<DataKey, string>> = {
  locations: 'location',
  entities: 'entity',
  actions: 'action',
  skills: 'skill',
  stats: 'stat',
  items: 'item',
  flags: 'flag',
  resources: 'resource',
  resourceDefinitions: 'resourceDefinition',
  effects: 'effect',
  interactionTypes: 'interactionType',
  enemies: 'enemy',
  dropTables: 'dropTable',
  collectionLogs: 'collectionLog',
  dialogues: 'dialogue',
  displayProfiles: 'displayProfile',
};

const dataTypeKeys = new Map<string, DataKey>([
  ...Object.entries(dataKeyTypes).map(([key, type]) => [type, key as DataKey] as const),
  ...Object.keys(dataKeyTypes).map((key) => [key, key as DataKey] as const),
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const moduleDataObject = (section: ModuleDataSection | undefined): Partial<Record<DataKey, StructuredValue[]>> => {
  if (!section) return {};
  if (!Array.isArray(section)) return section as Partial<Record<DataKey, StructuredValue[]>>;

  const grouped: Partial<Record<DataKey, StructuredValue[]>> = {};
  for (const entry of section) {
    const key = dataTypeKeys.get(entry.type);
    if (!key || entry.type === 'remove') continue;
    const { type: _type, ...value } = entry;
    grouped[key] = [...(grouped[key] ?? []), value as StructuredValue];
  }
  return grouped;
};

const moduleRemoveRows = (section: ModuleDataSection | undefined): ModuleDataEntry[] =>
  Array.isArray(section) ? section.filter((entry) => entry.type === 'remove') : [];

const sectionToTypedRows = (section: Partial<Record<DataKey, StructuredValue[]>>, existingRemovals: ModuleDataEntry[] = []) => [
  ...Object.entries(section).flatMap(([key, values]) =>
    (Array.isArray(values) ? values : [])
      .filter((value): value is Exclude<StructuredValue, null | boolean | number | string | StructuredValue[]> => isRecord(value))
      .map((value) => ({ type: dataKeyTypes[key as DataKey] ?? key, ...value })),
  ),
  ...existingRemovals,
];

const uniqueId = (base: string, existingIds: Set<string>) => {
  let id = base;
  let index = 2;
  while (existingIds.has(id)) {
    id = `${base}-${index}`;
    index += 1;
  }
  return id;
};

const itemSchema = (bundle: ContentBundle, key: DataKey): StructuredSchema => {
  const schema = moduleDataSectionSchema(bundle);
  const field = schema.kind === 'object' ? schema.fields[key] : undefined;
  const resolved = typeof field?.schema === 'function' ? field.schema() : field?.schema;
  return resolved?.kind === 'array' ? (typeof resolved.item === 'function' ? resolved.item() : resolved.item) : { kind: 'inferred' };
};

const createItem = (bundle: ContentBundle, key: DataKey, currentLocationId: string): StructuredValue => {
  const validLocationId = bundle.locations.some((location) => location.id === currentLocationId)
    ? currentLocationId
    : bundle.locations.find((location) => location.starting)?.id ?? bundle.locations[0]?.id ?? currentLocationId;
  const schema = moduleDataSectionSchema(bundle);
  const field = schema.kind === 'object' ? schema.fields[key] : undefined;
  const resolved = typeof field?.schema === 'function' ? field.schema() : field?.schema;
  const value = resolved?.kind === 'array' ? resolved.createItem() : { id: `new-${String(key)}` };
  const record = isRecord(value) ? { ...value } : {};
  const existingIds = new Set([
    ...Object.values(moduleDataObject({ [key]: (bundle[key as keyof ContentBundle] as StructuredValue[] | undefined) ?? [] } as ModuleDataSection)).flatMap((values) =>
      (values ?? []).map((item) => isRecord(item) && typeof item.id === 'string' ? item.id : '').filter(Boolean),
    ),
  ]);
  if (typeof record.id === 'string') record.id = uniqueId(record.id, existingIds);
  if (key === 'locations' && isRecord(bundle.locations.find((location) => location.id === validLocationId)?.position)) {
    const current = bundle.locations.find((location) => location.id === validLocationId);
    record.position = { x: (current?.position.x ?? 0) + 160, y: current?.position.y ?? 0 };
  }
  if ((key === 'actions' || key === 'effects') && !record.locationId) record.locationId = validLocationId;
  return record as StructuredValue;
};

const dataKeysForBundle = (bundle: ContentBundle) => {
  const schema = moduleDataSectionSchema(bundle);
  return schema.kind === 'object' ? (Object.keys(schema.fields) as DataKey[]).filter((key) => key !== 'resourceDefinitions') : [];
};

const upsertById = (items: StructuredValue[], value: StructuredValue, originalId?: string) => {
  const record = isRecord(value) ? value : {};
  const id = typeof record.id === 'string' ? record.id : '';
  return [
    value,
    ...items.filter((item) => {
      if (!isRecord(item) || typeof item.id !== 'string') return true;
      return item.id !== id && item.id !== originalId;
    }),
  ];
};

const saveModule = (
  draft: ContributionDraft,
  module: ContentModule,
  onPatchDraft: Props['onPatchDraft'],
) => {
  onPatchDraft({
    modules: [
      module,
      ...(draft.modules ?? []).filter((candidate) => candidate.id !== module.id),
    ],
    removed: { ...draft.removed, modules: (draft.removed?.modules ?? []).filter((id) => id !== module.id) },
  });
};

const moduleIssueId = (issue: Pick<ValidationIssue, 'path'>) => issue.path.match(/^modules\.([^.]+)/)?.[1] ?? null;

export const ContributionQuickWorkbench = ({
  baseBundle,
  bundle,
  draft,
  kind,
  moduleId,
  onClose,
  onLocationIdChange,
  onModuleChange,
  onPatchDraft,
  playState,
  t,
}: Props) => {
  const packagedModuleIds = useMemo(() => new Set((baseBundle.modules ?? []).map((candidate) => candidate.id)), [baseBundle.modules]);
  const localModules = useMemo(() => draft.modules.filter((candidate) => !packagedModuleIds.has(candidate.id)), [draft.modules, packagedModuleIds]);
  const module = localModules.find((candidate) => candidate.id === moduleId) ?? localModules[0] ?? null;
  const keys = useMemo(() => dataKeysForBundle(bundle), [bundle]);
  const [addKey, setAddKey] = useState<DataKey>(keys.includes('actions') ? 'actions' : keys[0]);
  const [newValue, setNewValue] = useState<StructuredValue>(() => createItem(bundle, keys.includes('actions') ? 'actions' : keys[0], playState.currentLocationId));

  const currentLocation = bundle.locations.find((location) => location.id === playState.currentLocationId)
    ?? bundle.locations.find((location) => location.starting)
    ?? bundle.locations[0];
  const associatedItems = useMemo<AssociatedItem[]>(() => {
    if (!currentLocation) return [];
    const entityIds = new Set(currentLocation.entities ?? []);
    const entityActionIds = new Set((bundle.entities ?? []).filter((entity) => entityIds.has(entity.id)).flatMap((entity) => entity.actionIds));
    const locationActions = bundle.actions.filter((action) => action.locationId === currentLocation.id || entityActionIds.has(action.id));
    return [
      { key: 'locations', id: currentLocation.id, label: `${t('contribution.data.locations')} / ${currentLocation.id}`, value: currentLocation as unknown as StructuredValue },
      ...locationActions
        .map((action) => ({ key: 'actions' as DataKey, id: action.id, label: `${t('contribution.data.actions')} / ${action.id}`, value: action as unknown as StructuredValue })),
      ...(bundle.effects ?? [])
        .filter((effect) => effect.locationId === currentLocation.id)
        .map((effect) => ({ key: 'effects' as DataKey, id: effect.id, label: `${t('contribution.data.effects')} / ${effect.id}`, value: effect as unknown as StructuredValue })),
      ...(bundle.entities ?? [])
        .filter((entity) => (currentLocation.entities ?? []).includes(entity.id))
        .map((entity) => ({ key: 'entities' as DataKey, id: entity.id, label: `${t('contribution.data.entities')} / ${entity.id}`, value: entity as unknown as StructuredValue })),
    ];
  }, [bundle, currentLocation, t]);
  const [associatedIndex, setAssociatedIndex] = useState(0);
  const associated = associatedItems[Math.min(associatedIndex, Math.max(0, associatedItems.length - 1))] ?? null;
  const [associatedValue, setAssociatedValue] = useState<StructuredValue | undefined>(() => associated?.value);

  useEffect(() => {
    setAssociatedValue(associated?.value);
  }, [associated?.id, associated?.key, associated?.value]);

  const changeAddKey = (key: DataKey) => {
    setAddKey(key);
    setNewValue(createItem(bundle, key, playState.currentLocationId));
  };

  const updateModuleRow = (sourceModule: ContentModule, sectionName: 'data' | 'data-updates', key: DataKey, value: StructuredValue, originalId?: string) => {
    const section = moduleDataObject(sourceModule[sectionName]);
    const removals = sectionName === 'data-updates' ? moduleRemoveRows(sourceModule[sectionName]) : [];
    const nextSection = {
      ...section,
      [key]: upsertById(section[key] ?? [], value, originalId),
    };
    return {
      ...sourceModule,
      [sectionName]: sectionToTypedRows(nextSection, removals),
    };
  };

  const stagedModule = useMemo(() => {
    if (!module) return null;
    if (kind === 'add') return updateModuleRow(module, 'data', addKey, newValue);
    if (!associated) return module;
    const next = isRecord(associatedValue)
      ? { ...associatedValue, id: associated.id }
      : { id: associated.id };
    return updateModuleRow(module, 'data-updates', associated.key, next as StructuredValue, associated.id);
  }, [addKey, associated, associatedValue, kind, module, newValue]);
  const stagedIssues = useMemo(() => {
    if (!stagedModule) return [];
    const stagedModules = [
      ...(baseBundle.modules ?? []),
      stagedModule,
      ...(draft.modules ?? []).filter((candidate) => candidate.id !== stagedModule.id && !packagedModuleIds.has(candidate.id)),
    ];
    const result = applyModulesToBundle(baseBundle, stagedModules, stagedModules.map((candidate) => candidate.id));
    return result.issues.filter((issue) =>
      moduleIssueId(issue) === stagedModule.id ||
      issue.path === `modules.${stagedModule.id}` ||
      issue.path.startsWith(`modules.${stagedModule.id}.`),
    );
  }, [baseBundle, draft.modules, packagedModuleIds, stagedModule]);
  const blockingIssues = stagedIssues.filter((issue) =>
    issue.severity === 'error' ||
    (issue.path === `modules.${stagedModule?.id}` && (issue.message === 'validation.moduleDisabled' || issue.message === 'validation.moduleConflictDisabled')),
  );

  const commitAndClose = () => {
    if (!module || !stagedModule || blockingIssues.length > 0) return;
    if (kind === 'add') {
      saveModule(draft, stagedModule, onPatchDraft);
      onClose();
      return;
    }
    if (!associated) {
      onClose();
      return;
    }
    saveModule(draft, stagedModule, onPatchDraft);
    if (associated.key === 'locations' && playState.currentLocationId !== associated.id) {
      onLocationIdChange(playState.currentLocationId, associated.id);
    }
    onClose();
  };

  if (!module) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-slate-950/70 px-3 pb-[73px] pt-10" onClick={onClose}>
      <section className="quick-workbench-sheet mx-auto grid max-h-[82vh] w-full max-w-5xl gap-3 overflow-auto rounded-t border border-slate-700 bg-slate-900 p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-cyan-100">{t(kind === 'add' ? 'quickWorkbench.addTitle' : 'quickWorkbench.editLocationTitle')}</h2>
            <p className="text-xs text-slate-400">{t('quickWorkbench.localMod')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="rounded bg-slate-950 px-3 py-2 text-sm text-slate-100" onChange={(event) => onModuleChange(event.target.value)} value={module.id}>
              {localModules.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.id}</option>)}
            </select>
            <button className="rounded bg-cyan-300 px-3 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400" disabled={blockingIssues.length > 0} onClick={commitAndClose} type="button">{t('quickWorkbench.confirm')}</button>
          </div>
        </div>

        {stagedIssues.length > 0 && (
          <section className={`grid gap-1 rounded border p-3 text-sm ${blockingIssues.length > 0 ? 'border-rose-800 bg-rose-950/20' : 'border-amber-700 bg-amber-950/20'}`}>
            <h3 className={`text-sm font-semibold ${blockingIssues.length > 0 ? 'text-rose-200' : 'text-amber-200'}`}>{t('quickWorkbench.validationTitle')}</h3>
            <ul className="grid gap-1">
              {stagedIssues.slice(0, 8).map((issue, index) => (
                <li className={issue.severity === 'error' ? 'text-rose-200' : 'text-amber-200'} key={`${issue.path}-${issue.message}-${issue.params?.id ?? ''}-${issue.params?.key ?? ''}-${index}`}>
                  <span className="font-semibold">{issue.severity}</span>: {issue.path} - {t(issue.message, issue.params)}
                </li>
              ))}
            </ul>
          </section>
        )}

        {kind === 'add' ? (
          <section className="grid gap-3">
            <label className="grid max-w-xs gap-1 text-xs text-slate-400">
              <span>{t('quickWorkbench.type')}</span>
              <select className="rounded bg-slate-950 px-3 py-2 text-sm text-slate-100" onChange={(event) => changeAddKey(event.target.value as DataKey)} value={addKey}>
                {keys.map((key) => <option key={key} value={key}>{t(`contribution.data.${key}`)}</option>)}
              </select>
            </label>
            <StructuredDataEditor onChange={(value) => setNewValue(value ?? {})} schema={itemSchema(bundle, addKey)} t={t} value={newValue} />
            <textarea className="min-h-40 rounded bg-slate-950 p-3 font-mono text-xs text-slate-300" readOnly value={JSON.stringify(newValue, null, 2)} />
          </section>
        ) : (
          <section className="grid gap-3">
            <label className="grid max-w-xl gap-1 text-xs text-slate-400">
              <span>{t('quickWorkbench.associatedData')}</span>
              <select className="rounded bg-slate-950 px-3 py-2 text-sm text-slate-100" onChange={(event) => setAssociatedIndex(Number(event.target.value))} value={Math.min(associatedIndex, Math.max(0, associatedItems.length - 1))}>
                {associatedItems.map((item, index) => <option key={`${item.key}-${item.id}`} value={index}>{item.label}</option>)}
              </select>
            </label>
            {associated && (
              <>
                <StructuredDataEditor hiddenKeys={['id']} onChange={(value) => setAssociatedValue(value ?? {})} schema={itemSchema(bundle, associated.key)} t={t} value={associatedValue} />
                <textarea className="min-h-40 rounded bg-slate-950 p-3 font-mono text-xs text-slate-300" readOnly value={JSON.stringify(isRecord(associatedValue) ? { ...associatedValue, id: associated.id } : associatedValue, null, 2)} />
              </>
            )}
          </section>
        )}
      </section>
    </div>
  );
};

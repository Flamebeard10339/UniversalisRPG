import type { Translator } from '../../game/i18n';
import type { ContentBundle, LocationNode, TravelEdgeDefinition } from '../../game/types';
import { StructuredDataEditor, type StructuredValue } from '../structuredData/StructuredData';
import { edgeSchema, locationSchema } from '../structuredData/contentSchemas';

const removeButtonClass = 'justify-self-start rounded border border-rose-500 px-2 py-1.5 text-sm font-semibold text-rose-200';

export const LocationFields = ({ location, onChange, onRemove, t }: {
  location: LocationNode;
  onChange: (location: LocationNode) => void;
  onRemove: () => void;
  t: Translator;
}) => (
  <section className="grid gap-3 rounded bg-slate-950 p-3">
    <StructuredDataEditor onChange={(value) => { if (value) onChange(value as unknown as LocationNode); }} schema={locationSchema()} t={t} value={location as unknown as StructuredValue} />
    <button className={removeButtonClass} onClick={onRemove} type="button">{t('contribution.column.remove')}</button>
  </section>
);

export const EdgeFields = ({ bundle, edge, onChange, onRemove, t }: {
  bundle: ContentBundle;
  edge: TravelEdgeDefinition;
  onChange: (edge: TravelEdgeDefinition) => void;
  onRemove: () => void;
  t: Translator;
}) => (
  <section className="grid gap-3 rounded bg-slate-950 p-3">
    <StructuredDataEditor onChange={(value) => { if (value) onChange(value as unknown as TravelEdgeDefinition); }} schema={edgeSchema(bundle)} t={t} value={edge as unknown as StructuredValue} />
    <button className={removeButtonClass} onClick={onRemove} type="button">{t('contribution.column.remove')}</button>
  </section>
);

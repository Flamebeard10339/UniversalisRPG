import { useId, useState } from 'react';
import type { Translator } from '../../game/i18n';

export type StructuredValue = null | boolean | number | string | StructuredValue[] | { [key: string]: StructuredValue | undefined };
export type StructuredSchemaRef = StructuredSchema | (() => StructuredSchema);
export type StructuredField = {
  defaultValue?: StructuredValue;
  label?: string;
  optional?: boolean;
  schema: StructuredSchemaRef;
};
export type StructuredSchema =
  | { kind: 'string'; suggestions?: string[] }
  | { kind: 'number'; min?: number; max?: number; step?: number }
  | { kind: 'boolean' }
  | { kind: 'enum'; options: string[] }
  | { kind: 'scalar'; types?: Array<'boolean' | 'number' | 'string'> }
  | { kind: 'object'; fields: Record<string, StructuredField>; allowAdditional?: boolean }
  | { kind: 'array'; item: StructuredSchemaRef; createItem: () => StructuredValue }
  | { kind: 'union'; discriminator: string; variants: Record<string, { label?: string; schema: StructuredSchemaRef; createValue: () => StructuredValue }> }
  | { kind: 'inferred' };

type EditorProps = {
  hiddenKeys?: string[];
  label?: string;
  onChange: (value: StructuredValue | undefined) => void;
  optional?: boolean;
  schema?: StructuredSchemaRef;
  t: Translator;
  value: StructuredValue | undefined;
};

const resolveSchema = (schema: StructuredSchemaRef): StructuredSchema => typeof schema === 'function' ? schema() : schema;
const inputClass = 'min-w-0 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100';
const labelText = (label: string, t: Translator) => label.includes('.') ? t(label) : label;

const inferredSchema = (value: StructuredValue | undefined): StructuredSchema => {
  if (typeof value === 'boolean') return { kind: 'boolean' };
  if (typeof value === 'number') return { kind: 'number' };
  if (typeof value === 'string') return { kind: 'string' };
  if (Array.isArray(value)) return { kind: 'array', item: { kind: 'inferred' }, createItem: () => '' };
  if (value && typeof value === 'object') {
    return {
      kind: 'object',
      allowAdditional: true,
      fields: Object.fromEntries(Object.keys(value).map((key) => [key, { schema: { kind: 'inferred' } }])),
    };
  }
  return { kind: 'string' };
};

const compatibleSchema = (schema: StructuredSchema, value: StructuredValue | undefined): StructuredSchema => {
  if (schema.kind === 'inferred') return inferredSchema(value);
  if (value === undefined || value === null) return schema;
  if (Array.isArray(value) && schema.kind !== 'array') return inferredSchema(value);
  if (typeof value === 'object' && !Array.isArray(value) && schema.kind !== 'object' && schema.kind !== 'union') return inferredSchema(value);
  return schema;
};

const defaultFor = (field: StructuredField) => field.defaultValue ?? (() => {
  const schema = resolveSchema(field.schema);
  if (schema.kind === 'boolean') return false;
  if (schema.kind === 'number') return 0;
  if (schema.kind === 'array') return [];
  if (schema.kind === 'object') return {};
  if (schema.kind === 'enum') return schema.options[0] ?? '';
  if (schema.kind === 'union') return Object.values(schema.variants)[0]?.createValue() ?? {};
  if (schema.kind === 'scalar') return false;
  return '';
})();

const PrimitiveEditor = ({ accessibleLabel, schema, value, onChange }: { accessibleLabel?: string; schema: Exclude<StructuredSchema, { kind: 'object' | 'array' | 'union' | 'inferred' | 'scalar' }>; value: StructuredValue | undefined; onChange: (value: StructuredValue) => void }) => {
  const suggestionId = useId();
  if (schema.kind === 'boolean') return <input aria-label={accessibleLabel} checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} type="checkbox" />;
  if (schema.kind === 'enum') return <select aria-label={accessibleLabel} className={inputClass} onChange={(event) => onChange(event.target.value)} value={String(value ?? schema.options[0] ?? '')}>{schema.options.map((option) => <option key={option} value={option}>{option}</option>)}</select>;
  if (schema.kind === 'number') return <input aria-label={accessibleLabel} className={inputClass} max={schema.max} min={schema.min} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) onChange(next); }} step={schema.step} type="number" value={typeof value === 'number' ? value : 0} />;
  return <>{schema.suggestions?.length ? <datalist id={suggestionId}>{schema.suggestions.map((suggestion) => <option key={suggestion} value={suggestion} />)}</datalist> : null}<input aria-label={accessibleLabel} className={inputClass} list={schema.suggestions?.length ? suggestionId : undefined} onChange={(event) => onChange(event.target.value)} value={typeof value === 'string' ? value : ''} /></>;
};

const EditorNode = ({ hiddenKeys = [], label, onChange, optional, schema: schemaRef = { kind: 'inferred' }, t, value }: EditorProps) => {
  const schema = compatibleSchema(resolveSchema(schemaRef), value);
  const [newField, setNewField] = useState('');
  if (value === undefined && optional) return <button className="justify-self-start rounded border border-dashed border-slate-600 px-2 py-1 text-xs text-slate-300" onClick={() => onChange(defaultFor({ schema }))} type="button">+ {label ? labelText(label, t) : t('structured.addValue')}</button>;

  if (schema.kind === 'union') {
    const record = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const selected = String(record[schema.discriminator] ?? Object.keys(schema.variants)[0] ?? '');
    const variant = schema.variants[selected] ?? Object.values(schema.variants)[0];
    return <section className="grid gap-2 rounded border border-slate-800 bg-slate-950/60 p-2"><div className="flex items-center gap-2"><span className="mr-auto text-xs font-semibold uppercase tracking-wide text-slate-500">{label ? labelText(label, t) : schema.discriminator}</span><select className={inputClass} onChange={(event) => onChange(schema.variants[event.target.value].createValue())} value={selected}>{Object.entries(schema.variants).map(([key, item]) => <option key={key} value={key}>{item.label ? labelText(item.label, t) : key}</option>)}</select>{optional && <button className="text-xs text-rose-300" onClick={() => onChange(undefined)} type="button">{t('structured.remove')}</button>}</div>{variant && <EditorNode hiddenKeys={[schema.discriminator]} onChange={onChange} schema={variant.schema} t={t} value={value} />}</section>;
  }

  if (schema.kind === 'scalar') {
    const scalarType = typeof value === 'number' ? 'number' : typeof value === 'string' ? 'string' : 'boolean';
    const allowedTypes = schema.types ?? ['boolean', 'number', 'string'];
    const primitiveSchema: StructuredSchema = scalarType === 'number' ? { kind: 'number' } : scalarType === 'string' ? { kind: 'string' } : { kind: 'boolean' };
    return <div className="grid min-w-0 gap-1"><span className="text-xs text-slate-400">{label ? labelText(label, t) : t('structured.value')}</span><div className="flex items-center gap-2"><select className={inputClass} onChange={(event) => onChange(event.target.value === 'number' ? 0 : event.target.value === 'string' ? '' : false)} value={scalarType}>{allowedTypes.includes('boolean') && <option value="boolean">{t('structured.boolean')}</option>}{allowedTypes.includes('number') && <option value="number">{t('structured.number')}</option>}{allowedTypes.includes('string') && <option value="string">{t('structured.string')}</option>}</select><PrimitiveEditor accessibleLabel={label ? labelText(label, t) : undefined} onChange={onChange} schema={primitiveSchema as Extract<StructuredSchema, { kind: 'string' | 'number' | 'boolean' | 'enum' }>} value={value} />{optional && <button className="text-xs text-rose-300" onClick={() => onChange(undefined)} type="button">{t('structured.remove')}</button>}</div></div>;
  }

  if (schema.kind === 'array') {
    const items = Array.isArray(value) ? value : [];
    return <section className="grid gap-2 border-l border-slate-700 pl-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label ? labelText(label, t) : t('structured.items')}</span><div className="flex gap-2"><button className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-200" onClick={() => onChange([...items, schema.createItem()])} type="button">+ {t('structured.addRow')}</button>{optional && <button className="rounded px-2 py-1 text-xs text-rose-300" onClick={() => onChange(undefined)} type="button">{t('structured.remove')}</button>}</div></div>{items.map((item, index) => <div className="grid grid-cols-[1fr_auto] items-start gap-2 rounded border border-slate-800 bg-slate-900/50 p-2" key={index}><EditorNode label={`${t('structured.row')} ${index + 1}`} onChange={(next) => onChange(items.map((candidate, candidateIndex) => candidateIndex === index ? next ?? null : candidate))} schema={schema.item} t={t} value={item} /><button aria-label={t('structured.removeRow', { index: index + 1 })} className="rounded border border-rose-800 px-2 py-1 text-rose-300" onClick={() => onChange(items.filter((_, candidateIndex) => candidateIndex !== index))} type="button">×</button></div>)}</section>;
  }

  if (schema.kind === 'object') {
    const record = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const allowedRecord = schema.allowAdditional ? record : Object.fromEntries(Object.entries(record).filter(([key]) => key in schema.fields));
    const fieldNames = Array.from(new Set([...Object.keys(schema.fields), ...(schema.allowAdditional ? Object.keys(record) : [])])).filter((key) => !hiddenKeys.includes(key));
    return <section className="flex flex-wrap items-start gap-3">{label && <div className="flex basis-full items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labelText(label, t)}</span>{optional && <button className="text-xs text-rose-300" onClick={() => onChange(undefined)} type="button">{t('structured.remove')}</button>}</div>}{fieldNames.map((key) => { const field = schema.fields[key] ?? { schema: { kind: 'inferred' } as StructuredSchema, optional: true }; const fieldSchema = compatibleSchema(resolveSchema(field.schema), record[key]); const nested = fieldSchema.kind === 'array' || fieldSchema.kind === 'object' || fieldSchema.kind === 'union'; return <div className={nested ? 'min-w-0 basis-full' : 'min-w-[14rem] flex-1'} key={key}><EditorNode label={field.label ?? key} onChange={(next) => { const updated = { ...allowedRecord }; if (next === undefined) delete updated[key]; else updated[key] = next; onChange(updated); }} optional={field.optional || !(key in record)} schema={field.schema} t={t} value={record[key]} /></div>; })}{schema.allowAdditional && <div className="flex min-w-[14rem] flex-1 gap-2"><input className={inputClass} onChange={(event) => setNewField(event.target.value)} placeholder={t('structured.fieldName')} value={newField} /><button className="rounded border border-slate-600 px-2 py-1 text-xs" disabled={!newField.trim() || newField in record} onClick={() => { onChange({ ...record, [newField.trim()]: '' }); setNewField(''); }} type="button">{t('structured.addField')}</button></div>}</section>;
  }

  return <div className="grid min-w-0 flex-1 gap-1">{label && <span className="text-xs text-slate-400">{labelText(label, t)}</span>}<div className="flex min-w-0 items-center gap-2"><PrimitiveEditor accessibleLabel={label ? labelText(label, t) : undefined} onChange={onChange} schema={schema as Extract<StructuredSchema, { kind: 'string' | 'number' | 'boolean' | 'enum' }>} value={value} />{optional && <button className="text-xs text-rose-300" onClick={() => onChange(undefined)} type="button">{t('structured.remove')}</button>}</div></div>;
};

export const StructuredDataEditor = (props: EditorProps) => <EditorNode {...props} />;

export const StructuredDataDisplay = ({ label, t, value }: { label?: string; t: Translator; value: StructuredValue | undefined }) => {
  if (Array.isArray(value)) return <section className="grid gap-2 border-l border-slate-700 pl-3">{label && <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labelText(label, t)}</span>}{value.map((item, index) => <div className="rounded border border-slate-800 bg-slate-950/50 p-2" key={index}><StructuredDataDisplay label={`${t('structured.row')} ${index + 1}`} t={t} value={item} /></div>)}</section>;
  if (value && typeof value === 'object') return <section className="grid gap-1">{label && <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labelText(label, t)}</span>}{Object.entries(value).map(([key, child]) => <div className="grid gap-1 md:grid-cols-[10rem_minmax(0,1fr)]" key={key}><span className="text-xs text-slate-500">{key}</span><StructuredDataDisplay t={t} value={child} /></div>)}</section>;
  return <span className="break-words text-xs text-slate-300">{value === null ? 'null' : String(value ?? '')}</span>;
};

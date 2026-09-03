import { Action } from '../../grammar/action';
import { ActionResult } from '../../grammar/actionResult';
import { list } from '../../grammar/list';
import { id, text } from '../../grammar/values';
import { localeKey } from '../locale';
import { section, TOUCHED } from './define';
import { declaredId, Entity, EXAMINE_FIELD, isMintedAction } from './entity';

export interface Guise {
  id: string;
  title?: string;
  examine?: string;
  without: string[];
}

export const guise = section<Guise>()({
  kind: 'guise',
  ids: 'owned',
  vocabulary: 'declared',
  map: 'guises',
  text: ['title', EXAMINE_FIELD],
  validate: (value) =>
    value.without.length > 0 || value.title !== undefined || value.examine !== undefined
      ? undefined
      : 'takes nothing away and says nothing, so whatever wears it is exactly as it was. Give it a without:, a title: or an examine:.',
  fields: {
    title: { parser: text, example: 'Open Chest', note: 'what the thing is called while it wears this. Left out, it keeps the name it already had' },
    examine: {
      parser: text,
      example: 'The lid is standing up and the tray under it is bare.',
      note: 'what looking at it says while it wears this, standing over its own examine: so a player can see what has happened to it without being told in a word',
    },
    without: {
      parser: list(id),
      default: () => [],
      names: { id: 'action' },
      example: 'pick-the-lock',
      note: 'the actions it stops offering while it wears this, which is how the action that put it here is not on offer again until the stretch is up',
    },
  },
});

export const guiseDrops = (worn: Guise | undefined, action: Action): boolean => worn !== undefined && worn.without.includes(declaredId(action) ?? '');

export const offeredAs = (entity: Entity, worn: Guise | undefined): Action[] => entity.actions.filter((action) => !guiseDrops(worn, action));

export function stoodAs(entity: Entity, worn: Guise | undefined, namespace: string | null): Entity {
  if (worn?.examine === undefined) return entity;
  const said: ActionResult = { kind: 'say', text: worn.examine, key: localeKey(namespace, guise.kind, worn.id, EXAMINE_FIELD) };
  const marked: ActionResult = { kind: 'set', variable: `${entity.id}.${TOUCHED}` };
  const looking = { id: EXAMINE_FIELD, label: EXAMINE_FIELD, generatedLabel: true, kind: 'instant', results: [said, marked] } as Action;
  const over = entity.actions.map((action) => (isMintedAction(action) ? looking : action));
  return { ...entity, actions: over.includes(looking) ? over : [looking, ...over] };
}

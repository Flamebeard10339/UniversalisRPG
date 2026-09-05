import type { EngineKey } from '../content/locale';
import type { Registry } from '../content/registry';
import { LEAVE, type ModalOption } from './modalOption';
import { type Answer, type Localized, localizerOf } from './localized';
import type { GameState, ModalFrame } from './state';


export type ListedName = Extract<ModalFrame, { name: string }>['name'];

type Chosen<F extends string> = Readonly<Record<F, string>>;

type Answering<F extends string> = Chosen<F> & { answers: Record<string, unknown> };

export type ListedFocus<F extends string> = { readonly kind: F } & Readonly<Record<F, Answer>>;

export interface Listed<N extends ListedName, F extends string> {
  readonly frame: (chosen?: string) => Extract<ModalFrame, { name: N }>;
  readonly focus: (frame: Chosen<F>) => ListedFocus<F> | undefined;
  readonly options: (frame: Chosen<F>, state: GameState, registry: Registry) => readonly ModalOption[];
  readonly submit: (frame: Answering<F>) => ModalFrame | null;
  readonly same: (a: Chosen<F>, b: Chosen<F>) => boolean;
  readonly holds: (value: Record<string, unknown>) => boolean;
  readonly stale: (frame: Chosen<F>, state: GameState, registry: Registry) => Localized | null;
}

export interface ListedSpec<N extends ListedName, F extends string> {
  readonly name: N;
  readonly field: F;
  readonly which: EngineKey;
  readonly reading: EngineKey;
  readonly close: EngineKey;
  readonly choices: (registry: Registry, state: GameState) => readonly { value: Answer; shown: Localized }[];
  readonly known: (registry: Registry, chosen: string) => boolean;
}

export function listedScreen<N extends ListedName, F extends string>(spec: ListedSpec<N, F>): Listed<N, F> {
  const chosenIn = (frame: Chosen<F>): string => frame[spec.field];

  const frame = (chosen = ''): Extract<ModalFrame, { name: N }> =>
    ({ name: spec.name, answers: {}, [spec.field]: chosen }) as unknown as Extract<ModalFrame, { name: N }>;

  return {
    frame,
    focus: (held) => (chosenIn(held) === '' ? undefined : ({ kind: spec.field, [spec.field]: chosenIn(held) as Answer } as unknown as ListedFocus<F>)),
    options: (held, state, registry) => {
      const localizer = localizerOf(registry, state);
      const leaving = { value: LEAVE, shown: localizer.engine(spec.close) };
      if (chosenIn(held) !== '') return [{ key: LEAVE, label: localizer.engine(spec.reading), values: [leaving] }];
      return [{ key: spec.field, label: localizer.engine(spec.which), values: [...spec.choices(registry, state), leaving] }];
    },
    submit: (held) => {
      if (chosenIn(held) !== '') return null;
      const asked = String(held.answers[spec.field] ?? '');
      return asked === LEAVE || asked === '' ? null : frame(asked);
    },
    same: (a, b) => chosenIn(a) === chosenIn(b),
    holds: (value) => typeof value[spec.field] === 'string',
    stale: (held, state, registry) =>
      chosenIn(held) === '' || spec.known(registry, chosenIn(held)) ? null : localizerOf(registry, state).engine('engine.modal.stale.unknown'),
  };
}

import type { Localized, Localizer, Params } from '../runtime/localized';
import { LABELS, type LabelId } from './labels';

export type Words = (id: LabelId, params?: Params) => Localized;

export const wordsOf = (localizer: Localizer): Words => (id, params) => localizer.engine(LABELS[id], params);

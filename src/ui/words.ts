import type { Localized, Localizer, Params } from '../runtime/localized';
import { LABELS, type LabelId } from './labels';

// The shell's end of the one channel (c3). A component asks for a word by the
// id the table keys it under and gets it back in the language being played.
// There is no door here that takes text, which is what keeps the table the
// whole vocabulary rather than the part somebody remembered to put in it.
export type Words = (id: LabelId, params?: Params) => Localized;

export const wordsOf = (localizer: Localizer): Words => (id, params) => localizer.engine(LABELS[id], params);

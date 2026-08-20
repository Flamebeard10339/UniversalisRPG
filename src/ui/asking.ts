import { askedOption } from '../runtime/command';
import type { PlayView } from '../runtime/session';

type Modal = PlayView['modals'][number];

export interface Answer {
  key: string;
  value: string;
}

export function dismissal(modals: readonly Modal[]): Answer | null {
  const leaving = modals[modals.length - 1]?.leaving;
  const asking = askedOption(modals);
  if (!leaving || !asking?.values?.some((choice) => choice.value === leaving)) return null;
  return { key: asking.key, value: leaving };
}

import type { Answer, Localized } from './localized';

export interface PruneWarning {
  path: Answer;
  id: Answer;
  message: Localized;
}

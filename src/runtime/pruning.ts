import type { Answer, Localized } from './localized';

// What a module reports when a load makes it drop something the save carried.
// buffs.ts and instances.ts produce these and save.ts collects them, so the
// declaration sits beneath all three; it was in save.ts, which made the two
// producers import their own collector.
export interface PruneWarning {
  path: Answer;
  id: Answer;
  message: Localized;
}

import type { UniversePlayState } from './types';
import { appendRunLog } from './timers';

export type PlayerChoiceMessage = {
  protocolVersion: 1;
  type: 'player-choice';
  turnId: string;
  actionId: string;
  feedback: {
    expectedActions: Array<{ label: string; reason: string }>;
    confusion: string | null;
  };
};

export type GmUpdateMessage = {
  protocolVersion: 1;
  type: 'gm-update';
  turnId: string;
  milestoneId: string;
  runStatus: 'continue' | 'part-complete' | 'blocked';
  operations: GmOperation[];
  capabilityRequests: Array<{
    id: string;
    neededFor: string;
    requiredSemantics: string;
    blocking: boolean;
  }>;
  privateNotes: string;
};

export type GmContentType = 'locations' | 'actions' | 'skills' | 'stats' | 'items'
  | 'flags' | 'resources' | 'effects' | 'interaction-types' | 'enemies';

export type GmOperation =
  | { op: 'upsert'; contentType: GmContentType; value: Record<string, unknown> }
  | { op: 'remove'; contentType: GmContentType; id: string }
  | { op: 'localize'; locale: string; values: Record<string, string> }
  | { op: 'set-manifest'; value: Record<string, unknown> };

export type AgentSessionMessage = PlayerChoiceMessage | GmUpdateMessage;

export const recordAgentSessionMessage = (
  state: UniversePlayState,
  message: AgentSessionMessage,
  now = Date.now(),
) => appendRunLog(
  state,
  message.type === 'gm-update' ? 'gm' : 'player',
  message.type === 'gm-update' ? 'gm.update' : 'player.choice',
  { ...message },
  now,
);

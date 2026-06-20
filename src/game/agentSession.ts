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
  operations: unknown[];
  removeActionIds: string[];
  capabilityRequests: unknown[];
  privateNotes: string;
};

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

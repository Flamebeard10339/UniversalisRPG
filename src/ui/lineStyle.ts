import type { CSSProperties } from 'react';
import type { MessageTone } from '../runtime/command';
import type { LogKind } from './transcript';

export const VOICE_CLASS: Record<LogKind, string> = {
  said: 'text-text',
  describe: 'italic text-text-muted',
  message: 'text-accent',
  detail: 'text-text-subtle',
  place: '',
};

export const SHAPE_CLASS: Record<LogKind, string> = {
  said: '',
  place: 'mt-6 border-t border-border pt-3',
  describe: '',
  message: '',
  detail: 'pl-3 text-xs',
};

export const TONE_CLASS: Record<MessageTone, string> = {
  plain: '',
  ok: 'border-l-2 border-success pl-2',
  warn: 'border-l-2 border-warning pl-2',
  error: 'border-l-2 border-danger pl-2',
};

const WASH = '2e';

export const fillOf = (group: { colour: string } | undefined): CSSProperties =>
  group === undefined ? {} : { backgroundColor: `${group.colour}${WASH}`, borderColor: group.colour };

export const inkOf = (group: { colour: string } | undefined): CSSProperties => (group === undefined ? {} : { color: group.colour });

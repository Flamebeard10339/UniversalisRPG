import { describe, expect, it } from 'vitest';
import { loadInEnglish } from '../content/engineLocale';
import { applyDirective, startSession, view } from './session';

const WORLD = [
  '# location shore',
  'x: 0, y: 0',
  'starting',
  '',
  '# entity miki',
  'title: Miki',
  '',
  '# quest an-errand',
  'title: An Errand',
  'log: Someone on the shore wants something fetched.',
  'hint: Talk to Miki.',
  '',
  'stage asking:',
  '  log: Miki asked for a whetstone.',
  '  complete',
  '  miki says:',
  '    always',
  '    Fetch me a whetstone.',
].join('\n');

const opened = () => {
  const session = startSession(loadInEnglish(WORLD));
  applyDirective(session, { kind: 'open-modal', modal: 'quest-journal' });
  return session;
};

const asked = (session: ReturnType<typeof opened>) => view(session).modals[0]!.options[0]!;

describe('the journal as a screen the engine opens', () => {
  it('opens by name, the way any modal a # modal may declare does', () => {
    expect(view(opened()).modals.map((modal) => modal.name)).toEqual(['quest-journal']);
  });

  it('asks which quest, offering every one the world holds', () => {
    expect(asked(opened())).toMatchObject({ key: 'quest', values: [{ value: 'an-errand', shown: 'An Errand' }] });
  });

  it('reads the quest it is answered with, publishing which one for the page to draw beside it', () => {
    const session = opened();
    applyDirective(session, { kind: 'submit-modal', key: 'quest', value: 'an-errand' });

    expect(view(session).focus).toEqual({ kind: 'quest', quest: 'an-errand' });
    expect(asked(session).key).toBe('close');
    expect(view(session).journal[0]).toMatchObject({ standing: 'unstarted', lines: [{ said: 'Someone on the shore wants something fetched.', struck: false }], hint: 'Talk to Miki.' });
  });

  it('closes on the answer that leaves it, and publishes nothing once it has', () => {
    const session = opened();
    applyDirective(session, { kind: 'submit-modal', key: 'quest', value: 'an-errand' });
    applyDirective(session, { kind: 'submit-modal', key: 'close', value: 'close' });

    expect(view(session).modals).toEqual([]);
    expect(view(session).focus).toBeNull();
  });
});

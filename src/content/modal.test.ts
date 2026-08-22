import { describe, expect, it } from 'vitest';
import { MODAL_SCREENS, ModalScreen } from './sections/modal';
import { loadModule } from './load';

const withModal = (body: string): string => `# modal look-here\n${body}\n`;

describe('the closed set lives in screen:', () => {
  it('accepts every screen the engine runs and nothing else', () => {
    for (const screen of MODAL_SCREENS) expect(() => loadModule(withModal(`screen: ${screen}`)), screen).not.toThrow();
    for (const absent of ['shop', 'dialogue', 'item-plane', 'characterCreation']) {
      expect(() => loadModule(withModal(`screen: ${absent}`)), absent).toThrow('a modal screen must be one of');
    }
  });

  it('names the screens that do exist when it refuses one, so the list is readable off the error', () => {
    try {
      loadModule(withModal('screen: shop'));
      expect.unreachable('an unrecognised screen must not load');
    } catch (raw) {
      for (const screen of MODAL_SCREENS) expect((raw as Error).message, screen).toContain(screen);
    }
  });

  it('refuses a modal that names no screen, since nothing would raise it', () => {
    expect(() => loadModule('# modal look-here\n')).toThrow(/requires a screen:/);
  });

  it('keys a modal under the bare name every module writes, since an engine screen belongs to no one module', () => {
    const screen: ModalScreen = 'carried-items';
    const registry = loadModule(withModal(`screen: ${screen}`));
    expect([...registry.modals.keys()]).toEqual(['look-here']);
  });
});

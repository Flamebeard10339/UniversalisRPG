import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { newContext, runLine } from '../src/runtime/command';
import { applyDirective, sessionLocalizer, sessionStatus, startSession, view } from '../src/runtime/session';
import { pageStorage } from '../src/ui/agent/pageStorage';
import { App } from '../src/ui/App';
import { browserSlots } from '../src/ui/browserStore';
import { createDriver } from '../src/ui/driver';
import { LAYERS, OPENING, toLayer, toSubpage } from '../src/ui/nav';
import { SHIPPED_SOURCES } from '../src/ui/shippedContent';
import { GUI_NOT_SHOWN } from '../src/ui/viewSurface';
import { excusedFieldsAreReal, signatureShown, unaccountedFields } from './lib/viewCoverage';
import { CLI_NOT_SHOWN, formatOutput, formatResult, printed } from './play-cli';
import { NOT_SHOWN, renderView } from './playbot';

// scripts/playbot.test.ts already proves the playbot's own NOT_SHOWN answers for every field a
// live view carries. This file asks the identical question of the other two drivers, so that a
// field PlayStatus grows next month has to be shown or excused by all three, not only the one
// that happened to get a claim first.

const EVERY_EXCUSE_LIST: ReadonlyArray<{ name: string; excused: typeof NOT_SHOWN }> = [
  { name: 'the playbot', excused: NOT_SHOWN },
  { name: 'play-cli', excused: CLI_NOT_SHOWN },
  { name: 'the GUI', excused: GUI_NOT_SHOWN },
];

// A field at its freshly-started value can be indistinguishable from noise a renderer prints for
// an unrelated reason — 0 seconds elapsed reads as "0" wherever a digit turns up by coincidence.
// Advancing the clock to a distinctive figure before rendering gives every timed field a
// signature worth searching for.
const DISTINCTIVE_SECONDS = 54321;

describe('every renderer answers for what a live view carries', () => {
  it("each renderer's excuse list names only fields a live view actually has, with a real reason", () => {
    const live = view(startSession(loadUniverseWithDiagnostics(SHIPPED_SOURCES).registry));
    for (const { name, excused } of EVERY_EXCUSE_LIST) {
      expect(excusedFieldsAreReal(live, excused), name).toEqual([]);
    }
  });

  it('play-cli renders, or excuses, every field a live view carries', () => {
    const session = startSession(loadUniverseWithDiagnostics(SHIPPED_SOURCES).registry);
    applyDirective(session, { kind: 'wait', seconds: DISTINCTIVE_SECONDS });
    const ctx = newContext(session, view(session));
    const localizer = sessionLocalizer(session);
    // /quests is how a human at this terminal reaches the journal — its output belongs beside
    // the passive per-turn view and /state dump, not only what prints with no command typed.
    const rendered = [
      ...formatOutput({ kind: 'view', view: ctx.view, reread: false }, localizer),
      ...formatOutput({ kind: 'status', status: sessionStatus(session) }, localizer),
      ...formatResult(runLine(ctx, '/quests'), localizer),
    ]
      .map(printed)
      .join('\n');

    const unshown = unaccountedFields(ctx.view, CLI_NOT_SHOWN, (_field, value) => signatureShown(rendered, value));
    expect(unshown, `play-cli renders no trace of: ${unshown.join(', ')}`).toEqual([]);
  });

  it('the GUI renders, or excuses, every field a live view carries, across every page and dev mode', () => {
    const slots = browserSlots(() => pageStorage());
    const driver = createDriver(SHIPPED_SOURCES, { slots, ticker: () => () => undefined });
    driver.send(`/wait ${DISTINCTIVE_SECONDS}`);
    const live = driver.snapshot().view;

    const everywhere = LAYERS.flatMap((layer, at) => layer.subpages.map((subpage) => toSubpage(toLayer(OPENING, at), at, subpage.id)));
    let rendered = '';
    for (const where of everywhere) rendered += renderToStaticMarkup(createElement(App, { driver, opening: where }));
    driver.send('/dev on');
    for (const where of everywhere) rendered += renderToStaticMarkup(createElement(App, { driver, opening: where }));

    const unshown = unaccountedFields(live, GUI_NOT_SHOWN, (_field, value) => signatureShown(rendered, value));
    expect(unshown, `the GUI renders no trace of: ${unshown.join(', ')}`).toEqual([]);
  });

  it('the playbot renders, or excuses, every field the same live view carries', () => {
    const session = startSession(loadUniverseWithDiagnostics(SHIPPED_SOURCES).registry);
    const live = view(session);
    const shown = renderView(live);
    const unshown = unaccountedFields(live, NOT_SHOWN, (field) => shown.includes(`${field}:`));
    expect(unshown, `the playbot renders no trace of: ${unshown.join(', ')}`).toEqual([]);
  });
});

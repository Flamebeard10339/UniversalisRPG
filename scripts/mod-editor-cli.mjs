import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:5173/';
const executablePath = process.env.EDGE_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const preferencePrefix = 'CapacitorStorage.';
const contributionKey = `${preferencePrefix}universalis:contribution:base`;
const modulesKey = `${preferencePrefix}universalis:settings:modules`;
const contributionUiKey = `${preferencePrefix}universalis:settings:contribution-ui`;

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (!arg.startsWith('--')) continue;
  const key = arg.slice(2);
  const value = process.argv[index + 1]?.startsWith('--') ? true : process.argv[index + 1] ?? true;
  args.set(key, value);
  if (value !== true) index += 1;
}

const scenarioName = args.get('scenario') ?? 'adversarial';
const commandsPath = args.get('commands');
const shouldReset = args.get('reset') !== 'false';

const server = process.env.BASE_URL
  ? null
  : spawn(process.execPath, [
      path.join(process.cwd(), 'node_modules/vite/bin/vite.js'),
      '--configLoader', 'runner',
      '--host', '127.0.0.1',
      '--port', '5173',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

const waitForServer = async () => {
  if (!server) return;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`Timed out waiting for ${baseUrl}`);
};

const readDraft = (page) => page.evaluate((key) => {
  const value = window.localStorage.getItem(key);
  return value ? JSON.parse(value) : null;
}, contributionKey);

const localModule = async (page) => {
  const draft = await readDraft(page);
  return draft?.modules?.find((module) => module.id === 'local-contributions') ?? null;
};

const waitForLocalModule = async (page, predicate, label) => {
  await page.waitForFunction(
    ({ key, label: waitLabel }) => {
      const draftText = window.localStorage.getItem(key);
      if (!draftText) return false;
      const draft = JSON.parse(draftText);
      const module = draft.modules?.find((candidate) => candidate.id === 'local-contributions');
      if (!module) return false;
      window.__lastModEditorWaitLabel = waitLabel;
      return true;
    },
    { key: contributionKey, label },
  );

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const module = await localModule(page);
    if (module && predicate(module)) return module;
    await page.waitForTimeout(100);
  }
  throw new Error(`Timed out waiting for local-contributions: ${label}`);
};

const getPatchCount = (module) => module?.['data-updates']?.patches?.length ?? 0;

const nav = async (page, tab) => {
  await page.locator('nav').getByRole('button', { name: tab, exact: true }).click();
};

const enableContributionMode = async (page) => {
  await nav(page, 'Settings');
  const checkbox = page.getByTestId('settings-contribution-mode');
  await checkbox.check();
  await page.getByTestId('contribution-mode').waitFor();
};

const switchContentTab = async (page, tab) => {
  await page.getByTestId(`content-tab-${tab}`).click();
};

const clickAndWaitForPatch = async (page, testId, label) => {
  const before = getPatchCount(await localModule(page));
  await page.getByTestId(testId).click();
  return waitForLocalModule(page, (module) => getPatchCount(module) > before, label);
};

const openJsonFile = async (page, fileName) => {
  const details = page.getByTestId(`content-json-file-${fileName}`);
  await details.scrollIntoViewIfNeeded();
  const isOpen = await details.evaluate((element) => element.open);
  if (!isOpen) {
    await details.locator('summary').click();
  }
  return details;
};

const findStructuredRowPath = async (page, fileName, objectId) => page.evaluate(({ fileName: name, id }) => {
  const host = document.querySelector(`[data-testid="content-json-file-${name}"]`);
  if (!host) throw new Error(`Missing JSON editor for ${name}`);
  host.open = true;
  const inputs = Array.from(host.querySelectorAll('[data-structured-path$="/id"] input'));
  const idInput = inputs.find((input) => input.value === id);
  if (!idInput) throw new Error(`Could not find ${id} in ${name}`);
  let current = idInput.parentElement;
  while (current) {
    const pathValue = current.getAttribute('data-structured-path');
    if (pathValue && /^\/\d+$/.test(pathValue)) return pathValue;
    current = current.parentElement;
  }
  throw new Error(`Could not resolve structured row path for ${id}`);
}, { fileName, id: objectId });

const addJsonRow = async (page, fileName, objectId, label) => {
  await switchContentTab(page, 'json');
  await openJsonFile(page, fileName);
  const before = getPatchCount(await localModule(page));
  await page.evaluate(({ name }) => {
    const host = document.querySelector(`[data-testid="content-json-file-${name}"]`);
    if (!host) throw new Error(`Missing JSON editor for ${name}`);
    const addButton = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Add row'));
    if (!(addButton instanceof HTMLElement)) throw new Error(`Could not find add-row button for ${name}`);
    addButton.click();
  }, { name: fileName });
  await waitForLocalModule(page, (module) => getPatchCount(module) > before, label);
  await findStructuredRowPath(page, fileName, objectId);
};

const removeJsonRow = async (page, fileName, objectId, label) => {
  await switchContentTab(page, 'json');
  await openJsonFile(page, fileName);
  const rowPath = await findStructuredRowPath(page, fileName, objectId);
  const before = getPatchCount(await localModule(page));
  await page.evaluate(({ name, pathValue }) => {
    const host = document.querySelector(`[data-testid="content-json-file-${name}"]`);
    if (!host) throw new Error(`Missing JSON editor for ${name}`);
    const candidates = Array.from(host.querySelectorAll(`[data-structured-path="${pathValue}"]`));
    const button = candidates
      .map((candidate) => Array.from(candidate.children).find((child) =>
        child instanceof HTMLButtonElement &&
        child.getAttribute('aria-label')?.startsWith('Remove row'),
      ))
      .find(Boolean);
    if (!(button instanceof HTMLElement)) throw new Error(`Could not find remove button for ${name} ${pathValue}`);
    button.click();
  }, { name: fileName, pathValue: rowPath });
  await waitForLocalModule(page, (module) => getPatchCount(module) > before, label);
};

const removeFirstLocationAction = async (page, locationId) => {
  await switchContentTab(page, 'json');
  await openJsonFile(page, 'locations.json');
  const rowPath = await findStructuredRowPath(page, 'locations.json', locationId);
  const before = getPatchCount(await localModule(page));
  await page.evaluate(({ locationPath }) => {
    const candidates = Array.from(document.querySelectorAll(`[data-structured-path="${locationPath}/actions/0"]`));
    const button = candidates
      .map((candidate) => candidate.querySelector('button[aria-label^="Remove row"]'))
      .find(Boolean);
    if (!(button instanceof HTMLElement)) throw new Error(`Could not find remove button for ${locationPath}/actions/0`);
    button.click();
  }, { locationPath: rowPath });
  await waitForLocalModule(page, (module) => getPatchCount(module) > before, `remove first action from ${locationId}`);
  return rowPath;
};

const addInvalidLocationAction = async (page, locationId, actionId) => {
  const before = getPatchCount(await localModule(page));
  await page.evaluate(({ key, targetLocationId, nextActionId }) => {
    const draftText = window.localStorage.getItem(key);
    if (!draftText) throw new Error('No contribution draft to corrupt');
    const draft = JSON.parse(draftText);
    const module = draft.modules?.find((candidate) => candidate.id === 'local-contributions');
    if (!module) throw new Error('No local-contributions module to corrupt');
    module['data-updates'] ??= {};
    module['data-updates'].patches ??= [];
    module['data-updates'].patches.push({
      targetModId: 'base-core',
      objectType: 'locations',
      objectId: targetLocationId,
      ops: [{ op: 'add', path: '/actions/-', value: nextActionId }],
    });
    window.localStorage.setItem(key, JSON.stringify({ ...draft, updatedAt: Date.now() }));
  }, { key: contributionKey, targetLocationId: locationId, nextActionId: actionId });
  await page.reload({ waitUntil: 'networkidle' });
  await waitForLocalModule(page, (module) =>
    getPatchCount(module) > before &&
    (module['data-updates']?.patches ?? []).some((patch) =>
      patch.objectType === 'locations' &&
      patch.objectId === locationId &&
      patch.ops.some((op) => op.op === 'add' && op.value === actionId),
    ), `add invalid action ${actionId} to ${locationId}`);
};

const assertLocalContributionShape = async (page) => {
  const module = await localModule(page);
  if (!module) throw new Error('local-contributions was not created');
  const patches = module['data-updates']?.patches ?? [];
  if (!module.dependencies?.includes('+base-core')) throw new Error('local-contributions is missing +base-core dependency');
  if (patches.length === 0) throw new Error('local-contributions has no Data-updates patches');
  for (const [index, patch] of patches.entries()) {
    for (const key of ['targetModId', 'objectType', 'objectId', 'ops']) {
      if (!(key in patch)) throw new Error(`Patch ${index} is missing ${key}`);
    }
  }
  return module;
};

const assertLocalContributionsEnabled = async (page) => {
  await page.waitForFunction(({ key }) => {
    const value = window.localStorage.getItem(key);
    if (!value) return false;
    return (JSON.parse(value).base ?? []).includes('local-contributions');
  }, { key: modulesKey });
};

const assertBaseStillPlayable = async (page) => {
  await nav(page, 'Home');
  await page.getByText('Gather Rumors', { exact: true }).first().waitFor();
};

const runAdversarialScenario = async (page) => {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await enableContributionMode(page);

  for (const tab of ['universe', 'map', 'actions', 'primitives', 'enemies', 'resources', 'json']) {
    await switchContentTab(page, tab);
  }

  await switchContentTab(page, 'actions');
  await clickAndWaitForPatch(page, 'content-add-action', 'add action');
  await clickAndWaitForPatch(page, 'content-add-dialogue', 'add dialogue');

  await switchContentTab(page, 'primitives');
  for (const testId of ['content-add-stat', 'content-add-skill', 'content-add-item', 'content-add-flag', 'content-add-interaction']) {
    await clickAndWaitForPatch(page, testId, testId);
  }

  await switchContentTab(page, 'enemies');
  await clickAndWaitForPatch(page, 'content-add-enemy', 'add enemy');

  await switchContentTab(page, 'resources');
  await clickAndWaitForPatch(page, 'content-add-resource', 'add resource');
  await clickAndWaitForPatch(page, 'content-add-effect', 'add effect');

  await addJsonRow(page, 'locations.json', 'new-location', 'add location through JSON editor');
  await removeJsonRow(page, 'locations.json', 'new-location', 'remove location through JSON editor');
  await addJsonRow(page, 'entities.json', 'new-entity', 'add entity through JSON editor');
  await removeJsonRow(page, 'entities.json', 'new-entity', 'remove entity through JSON editor');

  await removeFirstLocationAction(page, 'crossroads');
  await addInvalidLocationAction(page, 'crossroads', 'entity.ork.examine');
  const module = await assertLocalContributionShape(page);
  await assertBaseStillPlayable(page);
  return module;
};

const runRemoveTravelActionScenario = async (page) => {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await enableContributionMode(page);
  await removeJsonRow(page, 'actions.json', 'travel-emberwood-to-crossroads', 'remove travel-emberwood-to-crossroads');
  const module = await assertLocalContributionShape(page);
  const patches = module['data-updates']?.patches ?? [];
  const actionRemove = patches.some((patch) =>
    patch.objectType === 'actions' &&
    patch.objectId === 'travel-emberwood-to-crossroads' &&
    patch.ops.some((op) => op.op === 'remove' && op.path === ''),
  );
  const emberwoodCleanup = patches.some((patch) =>
    patch.objectType === 'locations' &&
    patch.objectId === 'emberwood' &&
    patch.ops.some((op) => op.op === 'remove' && op.path === '/actions/0'),
  );
  if (!actionRemove) throw new Error('Expected an action object remove patch for travel-emberwood-to-crossroads');
  if (!emberwoodCleanup) throw new Error('Expected an emberwood.actions reference cleanup patch');
  await page.reload({ waitUntil: 'networkidle' });
  await assertLocalContributionsEnabled(page);
  await assertBaseStillPlayable(page);
  return module;
};

const executeCommand = async (page, command) => {
  if (command.op === 'goto') return nav(page, command.tab);
  if (command.op === 'enableContributionMode') return enableContributionMode(page);
  if (command.op === 'contentTab') return switchContentTab(page, command.tab);
  if (command.op === 'click') return page.getByTestId(command.testId).click();
  if (command.op === 'removeFirstLocationAction') return removeFirstLocationAction(page, command.locationId);
  if (command.op === 'removeJsonRow') return removeJsonRow(page, command.fileName, command.objectId, command.label ?? `remove ${command.objectId}`);
  if (command.op === 'addInvalidLocationAction') return addInvalidLocationAction(page, command.locationId, command.actionId);
  if (command.op === 'assertLocalContributions') return assertLocalContributionShape(page);
  if (command.op === 'assertLocalContributionsEnabled') return assertLocalContributionsEnabled(page);
  if (command.op === 'assertBaseStillPlayable') return assertBaseStillPlayable(page);
  if (command.op === 'dumpDraft') {
    console.log(JSON.stringify(await readDraft(page), null, 2));
    return undefined;
  }
  throw new Error(`Unknown command op: ${command.op}`);
};

await waitForServer();

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(12_000);
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(error.message));
page.on('response', (response) => {
  if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
});

try {
  if (shouldReset) {
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.evaluate(({ contributionKey: draftKey, modulesKey: modKey, contributionUiKey: uiKey }) => {
      window.localStorage.removeItem(draftKey);
      window.localStorage.removeItem(modKey);
      window.localStorage.removeItem(uiKey);
    }, { contributionKey, modulesKey, contributionUiKey });
  }

  let module;
  if (commandsPath) {
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    const commands = JSON.parse(await readFile(commandsPath, 'utf8'));
    for (const command of commands) await executeCommand(page, command);
    module = await localModule(page);
  } else if (scenarioName === 'adversarial') {
    module = await runAdversarialScenario(page);
  } else if (scenarioName === 'remove-travel-action') {
    module = await runRemoveTravelActionScenario(page);
  } else {
    throw new Error(`Unknown scenario: ${scenarioName}`);
  }

  await page.screenshot({ fullPage: true, path: path.join(os.tmpdir(), 'universalis-mod-editor-cli.png') });

  if (errors.length > 0) {
    throw new Error(`Browser errors:\n${errors.join('\n')}`);
  }

  const patches = module?.['data-updates']?.patches ?? [];
  console.log(JSON.stringify({
    ok: true,
    scenario: commandsPath ? commandsPath : scenarioName,
    dependency: module?.dependencies ?? [],
    patchCount: patches.length,
    actionPatches: patches.filter((patch) => patch.objectType === 'actions').map((patch) => ({
      objectId: patch.objectId,
      ops: patch.ops,
    })),
    locationPatches: patches.filter((patch) => patch.objectType === 'locations').map((patch) => ({
      objectId: patch.objectId,
      ops: patch.ops,
    })),
  }, null, 2));
} finally {
  await browser.close();
  server?.kill();
}

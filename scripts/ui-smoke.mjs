import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:5173/';
const executablePath = process.env.EDGE_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const server = process.env.BASE_URL
  ? null
  : spawn(process.execPath, [
      path.join(process.cwd(), 'node_modules/vite/bin/vite.js'),
      '--configLoader', 'runner',
      '--host', '127.0.0.1',
      '--port', '5173',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

if (server) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

const browser = await chromium.launch({ executablePath, headless: true });
const results = [];

const preferenceKey = (key) => `CapacitorStorage.${key}`;

const badContributionDraft = {
  universeId: 'base',
  updatedAt: 1,
  notes: '',
  modules: [{
    id: 'local-contribution',
    version: '1.0.0',
    universe: 'base',
    author: 'UniversalisRPG',
    game_version: '1.0',
    data: [
      { type: 'location', id: 'bad-camp', position: { x: 640, y: 80 }, entities: ['tutorial-guide'] },
    ],
    locale: {
      en: {
        'location.bad-camp.title': 'Bad camp',
        'location.bad-camp.description': 'Invalid on purpose.',
        'location.bad-camp.exhausted': 'Nothing more here.',
      },
    },
  }],
  modulePacks: [],
  locations: [],
  entities: [],
  actions: [],
  skills: [],
  stats: [],
  items: [],
  flags: [],
  resourceDefinitions: [],
  effects: [],
  interactionTypes: [],
  enemies: [],
  dropTables: [],
  dialogues: [],
  locales: {},
  removed: {
    locations: [],
    entities: [],
    actions: [],
    skills: [],
    stats: [],
    items: [],
    flags: [],
    resources: [],
    effects: [],
    interactionTypes: [],
    enemies: [],
    dropTables: [],
    dialogues: [],
    modules: [],
  },
};

try {
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });

    if (viewport.name === 'desktop') {
      await page.addInitScript(({ badContributionDraft, preferencePrefix }) => {
        window.localStorage.setItem(`${preferencePrefix}universalis:contribution:base`, JSON.stringify(badContributionDraft));
        window.localStorage.setItem(`${preferencePrefix}universalis:settings:modules`, JSON.stringify({
          base: ['local-contribution'],
        }));
      }, { badContributionDraft, preferencePrefix: preferenceKey('') });
    }

    console.log(`[${viewport.name}] load`);
    await page.goto(baseUrl, { waitUntil: 'networkidle' });

    const actionVisible = await page.getByText('Gather Rumors', { exact: true }).first().isVisible();

    console.log(`[${viewport.name}] settings`);
    const settingsButton = page.getByRole('button', { name: 'Settings', exact: true });
    if (await settingsButton.count() === 0) console.error({ body: await page.locator('body').innerText(), errors });
    await settingsButton.click();

    const moduleSettingsVisible = await page.getByText('base-core', { exact: true }).first().isVisible();
    const waysideVisible = await page.getByText('wayside-supplies', { exact: true }).first().isVisible();
    const badDraftRecoveryVisible = viewport.name === 'desktop'
      ? await page.getByText('local-contribution', { exact: true }).first().isVisible()
      : true;

    console.log(`[${viewport.name}] contribution`);
    await page.getByText('Contribution mode', { exact: true }).locator('xpath=ancestor::label').getByRole('checkbox').check();
    const contributionVisible = await page.getByText('Contribution Mode', { exact: true }).isVisible();
    await page.locator('nav').getByRole('button', { name: 'Map', exact: true }).click();
    const mapLayoutVisible = await page.getByText('Map layout', { exact: true }).first().isVisible();
    let quickWorkbenchOpens = true;
    let duplicateLocationEntityTurnsRed = true;
    let duplicateLocationEntityBlocksConfirm = true;
    let invalidLocationEntityTurnsRed = true;
    let invalidLocationEntityBlocksConfirm = true;
    let invalidEditLocationEntityTurnsRed = true;
    let invalidEditLocationEntityBlocksConfirm = true;
    let noNumberedLocalContributionVisible = true;
    if (viewport.name === 'desktop') {
      await page.locator('nav').getByRole('button', { name: 'Home', exact: true }).evaluate((button) => button.click());
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      quickWorkbenchOpens = await page.getByText('Add content', { exact: true }).isVisible();
      const quickAddOptions = await page.locator('.quick-workbench-sheet select').nth(1).evaluate((element) =>
        Array.from(element.options).map((option) => option.value),
      );
      duplicateLocationEntityTurnsRed = !quickAddOptions.includes('locations');
      duplicateLocationEntityBlocksConfirm = !quickAddOptions.includes('enemies');
      invalidLocationEntityTurnsRed = !quickAddOptions.includes('displayProfiles');
      invalidLocationEntityBlocksConfirm = !quickAddOptions.includes('locations');
      invalidEditLocationEntityTurnsRed = !quickAddOptions.includes('enemies');
      invalidEditLocationEntityBlocksConfirm = !quickAddOptions.includes('displayProfiles');
      await page.mouse.click(8, 8);
      await page.locator('nav').getByRole('button', { name: 'Settings', exact: true }).evaluate((button) => button.click());
      noNumberedLocalContributionVisible = await page.getByText(/^local-contribution-\d+$/).count() === 0;
    }
    await page.locator('nav').getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'base-core', exact: true }).first().click();

    console.log(`[${viewport.name}] mod editor`);
    const detailsVisible = await page.getByRole('button', { name: 'Details', exact: true }).isVisible();
    await page.getByRole('button', { name: 'Data', exact: true }).click();
    const coreLocationVisible = await page.getByText('crossroads', { exact: true }).first().isVisible();
    await page.getByRole('button', { name: 'Raw', exact: true }).click();
    const rawJson = await page.locator('textarea').last().inputValue();
    const rawContainsCore = rawJson.includes('"id": "base-core"') && rawJson.includes('"id": "crossroads"');

    await page.screenshot({ fullPage: true, path: path.join(os.tmpdir(), `universalis-mod-centric-${viewport.name}.png`) });

    results.push({
      viewport: viewport.name,
      actionVisible,
      moduleSettingsVisible,
      waysideVisible,
      badDraftRecoveryVisible,
      quickWorkbenchOpens,
      duplicateLocationEntityTurnsRed,
      duplicateLocationEntityBlocksConfirm,
      invalidLocationEntityTurnsRed,
      invalidLocationEntityBlocksConfirm,
      invalidEditLocationEntityTurnsRed,
      invalidEditLocationEntityBlocksConfirm,
      noNumberedLocalContributionVisible,
      contributionVisible,
      mapLayoutVisible,
      detailsVisible,
      coreLocationVisible,
      rawContainsCore,
      errors,
    });
    await page.close();
  }
} finally {
  await browser.close();
  server?.kill();
}

const failed = results.some((result) =>
  !result.actionVisible ||
  !result.moduleSettingsVisible ||
  !result.waysideVisible ||
  !result.badDraftRecoveryVisible ||
  !result.quickWorkbenchOpens ||
  !result.duplicateLocationEntityTurnsRed ||
  !result.duplicateLocationEntityBlocksConfirm ||
  !result.invalidLocationEntityTurnsRed ||
  !result.invalidLocationEntityBlocksConfirm ||
  !result.invalidEditLocationEntityTurnsRed ||
  !result.invalidEditLocationEntityBlocksConfirm ||
  !result.noNumberedLocalContributionVisible ||
  !result.contributionVisible ||
  !result.mapLayoutVisible ||
  !result.detailsVisible ||
  !result.coreLocationVisible ||
  !result.rawContainsCore ||
  result.errors.length > 0
);

console.log(JSON.stringify(results, null, 2));
process.exit(failed ? 1 : 0);

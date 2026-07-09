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
    // Vite's dev server keeps an HMR websocket open indefinitely, so
    // 'networkidle' never resolves — wait for DOM content instead and let
    // the locator assertions below do their own auto-waiting for hydration.
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

    // Which action is available first depends on which starting location resolves
    // (that in turn depends on which modules end up enabled), so check the action
    // panel renders with real content rather than pinning to one specific action.
    const actionPanel = page.getByTestId('home-action-panel');
    const actionVisible = await actionPanel.waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => actionPanel.getByRole('button').count())
      .then((count) => count > 0)
      .catch(() => false);

    console.log(`[${viewport.name}] settings`);
    const settingsButton = page.getByRole('button', { name: 'Settings', exact: true });
    if (await settingsButton.count() === 0) console.error({ body: await page.locator('body').innerText(), errors });
    await settingsButton.click();
    await page.getByTestId('settings-tab-mods').click();

    const moduleSettingsVisible = await page.getByText('base-core', { exact: true }).first().isVisible();
    const waysideVisible = await page.getByText('wayside-supplies', { exact: true }).first().isVisible();
    const badDraftRecoveryVisible = viewport.name === 'desktop'
      ? await page.getByText('local-contribution', { exact: true }).first().isVisible()
      : true;

    console.log(`[${viewport.name}] contribution`);
    await page.getByTestId('settings-tab-settings').click();
    await page.getByText('Contribution mode', { exact: true }).locator('xpath=ancestor::label').getByRole('checkbox').check();
    const editTabVisible = await page.locator('nav').getByRole('button', { name: 'Edit', exact: true }).isVisible();
    await page.locator('nav').getByRole('button', { name: 'Edit', exact: true }).click();
    const contributionVisible = await page.getByText('Contribution Mode', { exact: true }).isVisible();

    console.log(`[${viewport.name}] edit - map`);
    await page.getByTestId('edit-mode-tab-map').click();
    const mapLayoutVisible = await page.getByText('Map layout', { exact: true }).first().isVisible();
    const zLayerVisible = await page.getByTestId('map-z-layer-select').isVisible();

    console.log(`[${viewport.name}] edit - content`);
    await page.getByTestId('edit-mode-tab-content').click();
    await page.getByTestId('dsl-module-select').selectOption('base-core');
    const notMigratedVisible = await page.getByText(/doesn't have DSL source yet/, { exact: false }).first().isVisible();
    await page.getByTestId('dsl-module-select').selectOption('tutorial-island-guide-house');
    const dslEditorVisible = await page.getByTestId('dsl-module-editor').waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false);
    const dslStatusBannerVisible = await page.getByTestId('dsl-status-banner').isVisible();

    console.log(`[${viewport.name}] edit - submit`);
    await page.getByTestId('edit-mode-tab-submit').click();
    const issueBodyVisible = await page.locator('textarea').last().isVisible();

    await page.screenshot({ fullPage: true, path: path.join(os.tmpdir(), `universalis-mod-centric-${viewport.name}.png`) });

    results.push({
      viewport: viewport.name,
      actionVisible,
      moduleSettingsVisible,
      waysideVisible,
      badDraftRecoveryVisible,
      editTabVisible,
      contributionVisible,
      mapLayoutVisible,
      zLayerVisible,
      notMigratedVisible,
      dslEditorVisible,
      dslStatusBannerVisible,
      issueBodyVisible,
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
  !result.editTabVisible ||
  !result.contributionVisible ||
  !result.mapLayoutVisible ||
  !result.zLayerVisible ||
  !result.notMigratedVisible ||
  !result.dslEditorVisible ||
  !result.dslStatusBannerVisible ||
  !result.issueBodyVisible ||
  result.errors.length > 0
);

console.log(JSON.stringify(results, null, 2));
process.exit(failed ? 1 : 0);

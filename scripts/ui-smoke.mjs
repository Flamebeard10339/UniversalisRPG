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

    console.log(`[${viewport.name}] load`);
    await page.goto(baseUrl, { waitUntil: 'networkidle' });

    const actionVisible = await page.getByText('Gather Rumors', { exact: true }).first().isVisible();

    console.log(`[${viewport.name}] settings`);
    const settingsButton = page.getByRole('button', { name: 'Settings', exact: true });
    if (await settingsButton.count() === 0) console.error({ body: await page.locator('body').innerText(), errors });
    await settingsButton.click();

    const moduleSettingsVisible = await page.getByText('base-core', { exact: true }).first().isVisible();
    const waysideVisible = await page.getByText('wayside-supplies', { exact: true }).first().isVisible();

    console.log(`[${viewport.name}] contribution`);
    await page.getByText('Contribution mode', { exact: true }).locator('xpath=ancestor::label').getByRole('checkbox').check();
    const contributionVisible = await page.getByText('Contribution Mode', { exact: true }).isVisible();
    await page.getByRole('button', { name: 'base-core', exact: true }).first().click();

    console.log(`[${viewport.name}] mod editor`);
    const detailsVisible = await page.getByRole('button', { name: 'Details', exact: true }).isVisible();
    await page.getByRole('button', { name: 'Data', exact: true }).click();
    await page.getByRole('button', { name: 'Raw', exact: true }).click();
    const rawJson = await page.locator('textarea').last().inputValue();
    const rawContainsCore = rawJson.includes('"id": "base-core"') && rawJson.includes('"id": "crossroads"');

    await page.screenshot({ fullPage: true, path: path.join(os.tmpdir(), `universalis-mod-centric-${viewport.name}.png`) });

    results.push({
      viewport: viewport.name,
      actionVisible,
      moduleSettingsVisible,
      waysideVisible,
      contributionVisible,
      detailsVisible,
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
  !result.contributionVisible ||
  !result.detailsVisible ||
  !result.rawContainsCore ||
  result.errors.length > 0
);

console.log(JSON.stringify(results, null, 2));
process.exit(failed ? 1 : 0);

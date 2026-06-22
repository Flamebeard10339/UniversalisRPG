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
    console.log(`[${viewport.name}] settings`);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    console.log(`[${viewport.name}] contribution`);
    await page.getByText('Contribution mode', { exact: true }).locator('xpath=ancestor::label').getByRole('checkbox').check();
    console.log(`[${viewport.name}] enemies`);
    await page.getByRole('button', { name: 'Enemies', exact: true }).click();
    console.log(`[${viewport.name}] edit`);
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();

    const attack = page.getByLabel('Attack', { exact: true });
    const defense = page.getByLabel('Defense', { exact: true });
    await attack.fill('12.5');
    await attack.press('Tab');
    await defense.fill('11.5');
    console.log(`[${viewport.name}] diagnostics`);

    const actionsGrid = page.getByText('Actions to kill', { exact: true });
    const fightsGrid = page.getByText('Fights per death', { exact: true });
    await actionsGrid.scrollIntoViewIfNeeded();
    await fightsGrid.scrollIntoViewIfNeeded();
    await page.screenshot({ fullPage: true, path: path.join(os.tmpdir(), `universalis-enemy-editor-${viewport.name}.png`) });

    const attackBox = await attack.boundingBox();
    const selectedEditor = page.locator('section').filter({ has: page.getByRole('heading', { name: 'goblin', exact: true }) }).last();
    const removeBox = await selectedEditor.getByRole('button', { name: 'Remove', exact: true }).first().boundingBox();
    const referenceHealthBox = await page.getByLabel('Reference player health', { exact: true }).boundingBox();
    const overlaps = (first, second) => first && second
      ? first.x + first.width > second.x && second.x + second.width > first.x
        && first.y + first.height > second.y && second.y + second.height > first.y
      : true;
    const editorColumnsOverlap = overlaps(attackBox, referenceHealthBox) || overlaps(removeBox, referenceHealthBox);
    const attackValue = await attack.inputValue();
    const defenseValue = await defense.inputValue();
    const actionsGridVisible = await actionsGrid.isVisible();
    const fightsGridVisible = await fightsGrid.isVisible();

    console.log(`[${viewport.name}] action capabilities`);
    await page.getByRole('button', { name: 'Actions', exact: true }).last().click();
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    const actionDuration = page.getByLabel('Action duration').first();
    await actionDuration.fill('6.5');
    await actionDuration.press('Tab');
    await page.waitForTimeout(100);
    const addMaxCompletions = page.locator('button').filter({ hasText: 'Maximum completions' }).first();
    await addMaxCompletions.click();
    const maxCompletions = page.getByLabel('Maximum completions', { exact: true }).first();
    await maxCompletions.fill('5');
    const addResults = page.locator('button').filter({ hasText: 'Completion results' }).first();
    await addResults.click();
    await page.waitForTimeout(100);
    await page.locator('button').filter({ hasText: 'Add row' }).last().click();
    const resultRow = page.getByText('Row 1', { exact: true }).last().locator('xpath=ancestor::section[1]');
    const resultKind = resultRow.getByRole('combobox').first();
    await resultKind.selectOption('relocate');
    const resultLocation = resultRow.getByLabel('Location', { exact: true }).first();
    await resultLocation.fill('crossroads');
    const actionDurationValue = await actionDuration.inputValue();
    const maxCompletionsValue = await maxCompletions.inputValue();
    const resultsValue = `${await resultKind.inputValue()}:${await resultLocation.inputValue()}`;

    console.log(`[${viewport.name}] resource capabilities`);
    await page.getByRole('button', { name: 'Resources', exact: true }).last().click();
    const deathResetEditor = page.getByText('Death reset policy', { exact: true }).first();
    const onEmptyEditor = page.getByText(/When empty/, { exact: false }).first();
    await deathResetEditor.scrollIntoViewIfNeeded();
    await page.screenshot({ fullPage: true, path: path.join(os.tmpdir(), `universalis-capabilities-${viewport.name}.png`) });

    const runTranscript = page.getByText('Run transcript', { exact: true });

    results.push({
      viewport: viewport.name,
      attack: attackValue,
      defense: defenseValue,
      actionsGrid: actionsGridVisible,
      fightsGrid: fightsGridVisible,
      editorColumnsOverlap,
      actionDuration: actionDurationValue,
      maxCompletions: maxCompletionsValue,
      results: resultsValue,
      deathResetEditor: await deathResetEditor.isVisible(),
      onEmptyEditor: await onEmptyEditor.isVisible(),
      runTranscript: await runTranscript.isVisible(),
      editorGeometry: { attackBox, removeBox, referenceHealthBox },
      errors,
    });
    await page.close();
  }
} finally {
  await browser.close();
  server?.kill();
}

const failed = results.some((result) =>
  result.attack !== '12.5' ||
  result.defense !== '11.5' ||
  !result.actionsGrid ||
  !result.fightsGrid ||
  result.editorColumnsOverlap ||
  result.actionDuration !== '6.5' ||
  result.maxCompletions !== '5' ||
  !result.results.includes('relocate') ||
  !result.deathResetEditor ||
  !result.onEmptyEditor ||
  !result.runTranscript ||
  result.errors.length > 0
);

console.log(JSON.stringify(results, null, 2));
process.exit(failed ? 1 : 0);

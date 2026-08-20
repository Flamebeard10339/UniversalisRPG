import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contributionBase, extractContributionDsl } from './contribution';

const FORM = path.join(import.meta.dirname, '../../.github/ISSUE_TEMPLATE/content-contribution.yml');

interface FormField {
  id: string;
  label: string;
  rendered?: string;
}

// The shipped form, read rather than restated: the defect this file exists for
// was the extractor and the form disagreeing about one heading, so a fixture
// that hardcoded the labels would have agreed with itself and proved nothing.
function formFields(): FormField[] {
  const yml = readFileSync(FORM, 'utf8');
  const fields = yml
    .split(/^  - type: /m)
    .slice(1)
    .map((block) => ({
      id: /^\s*id:[ \t]*(?<id>\S+)/m.exec(block)?.groups?.id ?? '',
      label: /^\s*label:[ \t]*(?<label>.+?)\s*$/m.exec(block)?.groups?.label ?? '',
      rendered: /^\s*render:[ \t]*(?<render>\S+)/m.exec(block)?.groups?.render,
    }));
  expect(fields.map((field) => field.id)).toEqual(['universe', 'summary', 'validation', 'dsl']);
  return fields;
}

// How GitHub renders a submitted issue form: each field's label verbatim as an
// H3, then its value, fenced with the `render:` language when it has one.
function renderIssueForm(values: Record<string, string>): string {
  return formFields()
    .flatMap((field) => {
      const value = values[field.id] ?? '';
      const body = field.rendered ? ['```' + field.rendered, value.trimEnd(), '```'] : [value];
      return [`### ${field.label}`, '', ...body, ''];
    })
    .join('\n');
}

const MODULE = `# info local-changes
version: 0.0.0
dependencies:
  tutorial-island

# item gem
title: Gem`;

const SUBMITTED = {
  universe: 'tutorial-island',
  summary: 'Adds a gem.',
  validation: 'Loaded modules: tutorial-island, local-changes\nDiagnostics: none',
  dsl: MODULE,
};

describe('the shipped issue form is a first-class ingestion format', () => {
  it('renders a heading the extractor matches, whatever case and level the form uses', () => {
    const body = renderIssueForm(SUBMITTED);
    const heading = formFields().find((field) => field.id === 'dsl')!.label;

    expect(body).toContain(`### ${heading}`);
    expect(extractContributionDsl(body)).toBe(`${MODULE}\n`);
  });

  it('takes the module under its own heading, not a fence pasted into the summary', () => {
    const body = renderIssueForm({
      ...SUBMITTED,
      summary: ['Replaces what used to read:', '```dsl', '# item gem', 'title: ROCK', '```'].join('\n'),
    });

    expect(extractContributionDsl(body)).toBe(`${MODULE}\n`);
    expect(extractContributionDsl(body)).not.toContain('ROCK');
  });

  it('cannot be made to read a second module by forging the heading in a summary', () => {
    const forged = ['## Local Changes DSL', '```dsl', '# info local-changes', 'version: 0.0.0', '# item gem', 'title: ROCK', '```'].join('\n');

    expect(() => extractContributionDsl(renderIssueForm({ ...SUBMITTED, summary: forged }))).toThrow(/2 Local Changes DSL headings/);
  });

  it('reads the universe the contributor says they targeted', () => {
    expect(contributionBase(renderIssueForm(SUBMITTED)).universe).toBe('tutorial-island');
    expect(contributionBase(renderIssueForm(SUBMITTED)).contentFiles).toEqual([]);
  });
});

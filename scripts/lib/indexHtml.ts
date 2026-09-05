import { readFileSync } from 'node:fs';
import path from 'node:path';

export const STYLESHEET_PATH = path.join('src', 'index.css');

export const CHROME_TOKEN = '--color-surface';

const root = path.resolve(import.meta.dirname, '..', '..');

export function tokenValue(declared: string, token: string): string {
  const found = new RegExp(`^\\s*${token}:\\s*([^;]+);`, 'm').exec(declared);
  if (found === null) throw new Error(`${STYLESHEET_PATH} declares no ${token}`);
  return found[1]!.trim();
}

export const stylesheet = (): string => readFileSync(path.join(root, STYLESHEET_PATH), 'utf8');

const THEME_COLOR = /(<meta name="theme-color" content=")([^"]*)(")/;

export function fillIndexHtml(html: string, declared: string): string {
  if (!THEME_COLOR.test(html)) throw new Error('index.html has no theme-color meta for the stylesheet to fill');
  return html.replace(THEME_COLOR, `$1${tokenValue(declared, CHROME_TOKEN)}$3`);
}

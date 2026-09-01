const suiteIsRunning = (): boolean => typeof process !== 'undefined' && process.env.VITEST !== undefined;

export function shut(): void {
  if (!suiteIsRunning()) return;
  throw new Error('the shipped corpus does not open while the suite is running: stand on src/content/fixture instead (worldFixture.ts), and let `npm run oracle -- --at content` answer for content/');
}

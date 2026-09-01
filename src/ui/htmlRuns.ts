const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#39;': "'" };

export function htmlRuns(html: string): string[] {
  return html
    .replace(/<[^>]*>/g, (tag) => `\n${/(?<![-\w])aria-label="([^"]*)"/.exec(tag)?.[1] ?? ''}\n`)
    .split('\n')
    .map((run) => run.replace(/&(?:amp|lt|gt|quot|#x27|#39);/g, (entity) => ENTITIES[entity]!).trim())
    .filter((run) => run !== '');
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#39;': "'" };

// Every run of words rendered markup puts in front of a reader, in the order it draws them. A tag
// stands for a break between runs, except that a tag carrying an `aria-label` reads as that label:
// what a screen reader says there is on the screen as much as the text beside it is, and a claim
// about words reaching a reader that could not see one would pass by reading nothing.
export function htmlRuns(html: string): string[] {
  return html
    .replace(/<[^>]*>/g, (tag) => `\n${/(?<![-\w])aria-label="([^"]*)"/.exec(tag)?.[1] ?? ''}\n`)
    .split('\n')
    .map((run) => run.replace(/&(?:amp|lt|gt|quot|#x27|#39);/g, (entity) => ENTITIES[entity]!).trim())
    .filter((run) => run !== '');
}

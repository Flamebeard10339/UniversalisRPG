import { LocaleSection, parseLocaleSection } from "../locale";
import { section } from "./define";

// The words themselves live in `../locale`, which every other kind's text is
// read through; what is here is only the section that carries them in. The key
// it hangs under is the language tag, so the heading is printed from the
// context rather than from the value, exactly as a `# save` is.
export const locale = section<LocaleSection>()({
  kind: "locale",
  ids: "none",
  parse: parseLocaleSection,
  print: (declared, { id }) => [
    `# locale ${id}`,
    ...declared.entries.map((entry) => `${entry.key}: ${entry.value}`),
  ],
});

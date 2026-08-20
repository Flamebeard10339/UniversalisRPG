import { DslError } from "../../grammar/parser";
import { section } from "./define";

export interface Removal {
  id: string;
  kind: string;
  target: string;
}

// Merge-by-omission cannot express removal — there is no partial section that
// means "this is gone" — so exactly one keyword survives inference.
export const remove = section<Removal>()({
  kind: "remove",
  ids: "none",
  parse: (raw) => {
    const [kind, ...path] = raw.id?.split(".") ?? [];
    if (path.length === 0)
      throw new DslError(
        "# remove names a kind and an id, as in `# remove entity.mirror`",
        raw.span,
      );
    if (raw.body.length > 0)
      throw new DslError("# remove takes no body", raw.span);
    return { id: raw.id!, kind, target: path.join(".") };
  },
  print: () => {
    throw new DslError(
      "a # remove is spent at merge and leaves nothing behind to print",
    );
  },
});

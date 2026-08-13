// The spelling of an id the instance counter mints, stated in the load path
// because the load path is what has to tell one from an authored id without a
// running game behind it. The counter itself lives in the runtime and narrows
// this with the bound it has reached.
const MINTED = /^(0|[1-9][0-9]*)$/;

export function mayBeInstanceId(id: string): boolean {
  return MINTED.test(id);
}

const MINTED = /^(0|[1-9][0-9]*)$/;

export function mayBeInstanceId(id: string): boolean {
  return MINTED.test(id);
}

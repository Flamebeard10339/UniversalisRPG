import { wornCopySlot } from '../grammar/worn';

const MINTED = /^(0|[1-9][0-9]*)$/;

export function mayBeInstanceId(id: string): boolean {
  return MINTED.test(id);
}

export function namesACopy(id: string): boolean {
  return mayBeInstanceId(id) || wornCopySlot(id) !== undefined;
}

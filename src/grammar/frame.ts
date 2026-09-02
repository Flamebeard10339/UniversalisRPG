import { Condition, holds, printReference, Reference } from './condition';
import { DslError } from './parser';
import { parseSegments, printSegments, TextSegment } from './segment';

export type Held = string | number;

export type Frame = Readonly<Record<string, Held>>;

const NEEDS_A_RUN = 'reads the run it is said in, which a line the engine says has no hold of';

export const namedBy = (reference: Reference): string => printReference(reference);

export function referencesIn(words: string): string[] {
  const found: string[] = [];
  const walk = (condition: Condition): void => {
    switch (condition.kind) {
      case 'reference':
        found.push(namedBy(condition.reference));
        return;
      case 'comparison':
        found.push(namedBy(condition.left));
        return;
      case 'not':
        walk(condition.condition);
        return;
      case 'and':
      case 'or':
        for (const each of condition.conditions) walk(each);
        return;
      default:
        return;
    }
  };
  for (const segment of parseSegments(words, 0)) {
    if (segment.kind === 'interpolate') found.push(namedBy(segment.reference));
    if (segment.kind === 'conditional') walk(segment.condition);
  }
  return [...new Set(found)];
}

function heldBy(frame: Frame, reference: Reference, where: string): Held {
  const name = namedBy(reference);
  const value = frame[name];
  if (value === undefined) throw new DslError(`${where} names {${name}}, which the line it stands in was handed nothing for`);
  return value;
}

function standsInFrame(frame: Frame, condition: Condition, where: string): boolean {
  switch (condition.kind) {
    case 'always':
      return true;
    case 'not':
      return !standsInFrame(frame, condition.condition, where);
    case 'and':
      return condition.conditions.every((each) => standsInFrame(frame, each, where));
    case 'or':
      return condition.conditions.some((each) => standsInFrame(frame, each, where));
    case 'reference': {
      const value = heldBy(frame, condition.reference, where);
      return value !== 0 && value !== '';
    }
    case 'comparison':
      return holds(Number(heldBy(frame, condition.left, where)), condition.operator, condition.right);
    case 'has':
      throw new DslError(`${where} asks what is carried, which ${NEEDS_A_RUN}`);
    default: {
      const unreached: never = condition;
      return unreached;
    }
  }
}

export function weighInFrame(segments: readonly TextSegment[], frame: Frame, where: string): string {
  return segments
    .map((segment) => {
      if (segment.kind === 'literal') return segment.text;
      if (segment.kind === 'interpolate') return String(heldBy(frame, segment.reference, where));
      return standsInFrame(frame, segment.condition, where) ? segment.text : '';
    })
    .join('');
}

const asksWhatIsCarried = (condition: Condition): boolean => {
  switch (condition.kind) {
    case 'has':
      return true;
    case 'not':
      return asksWhatIsCarried(condition.condition);
    case 'and':
    case 'or':
      return condition.conditions.some(asksWhatIsCarried);
    default:
      return false;
  }
};

export function unframedProblem(words: string): string | undefined {
  const found = parseSegments(words, 0).find((segment) => segment.kind === 'conditional' && asksWhatIsCarried(segment.condition));
  return found === undefined ? undefined : `${printSegments([found])} asks what is carried, which ${NEEDS_A_RUN}`;
}

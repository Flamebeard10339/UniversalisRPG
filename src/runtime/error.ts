// Beneath everything that throws one, including the modules that declare the
// shape of the state and the modules that put words on a failure. It was in
// state.ts, which meant the localizer had to reach the state module to raise a
// missing-parameter error, and that import was one of the seven that made
// state.ts part of a cycle rather than the floor of one.
export class RuntimeError extends Error {}

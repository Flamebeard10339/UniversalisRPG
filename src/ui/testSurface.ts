export type TestAction = (value: unknown) => void | Promise<void>;

// What one component offers a driving agent: the actions only it can perform,
// and the part of the shell's state only it holds. A component that owns
// neither offers neither, and the surface it never builds is one no agent can
// call.
export interface TestSurface {
  actions?: Readonly<Record<string, TestAction>>;
  state?: () => unknown;
}

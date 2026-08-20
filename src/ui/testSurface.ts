export type TestAction = (value: unknown) => void | Promise<void>;

export interface TestSurface {
  actions?: Readonly<Record<string, TestAction>>;
  state?: () => unknown;
}

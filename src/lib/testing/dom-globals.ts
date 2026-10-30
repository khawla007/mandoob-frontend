export function installDomGlobals(globals: Record<string, unknown>): void {
  Object.defineProperties(
    globalThis,
    Object.fromEntries(
      Object.entries(globals).map(([key, value]) => [
        key,
        { configurable: true, writable: true, value },
      ]),
    ),
  );
}

export function createVersionHistoryController<T>({
  load,
  apply,
  setPending,
}: {
  load(): Promise<T>;
  apply(value: T): void;
  setPending(value: boolean): void;
}) {
  let generation = 0;

  return {
    async open() {
      const requestGeneration = ++generation;
      setPending(true);
      const value = await load();
      if (requestGeneration !== generation) return;
      apply(value);
      setPending(false);
    },
    close() {
      generation += 1;
      setPending(false);
    },
  };
}

export function createVersionHistoryFormatters(locale: string) {
  return {
    timestamp: new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Dubai',
    }),
    integer: new Intl.NumberFormat(locale),
    decimal: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
  };
}

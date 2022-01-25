export function stringify<
  Key extends string,
  Value extends { toString: () => string },
>(object: Record<Key, Value>) {
  return Object.fromEntries(
    Object.entries(object).map(([key, entry]) => [
      key,
      (entry as Value).toString(),
    ]),
  );
}

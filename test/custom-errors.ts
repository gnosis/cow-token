interface Stringable {
  toString: () => string;
}

export function customError(name: string, ...args: Stringable[]) {
  return `reverted with custom error '${name}(${args
    .map((a) => a.toString())
    .join(", ")})'`;
}

export enum RevertMessage {
  ArrayIndexOutOfBound = "reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index)",
  OverOrUnderflow = "reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)",
  UninitializedMock = "Mock on the method is not initialized",
}

import { pipe } from "effect";

export const clampNumber = (n: number, min: number, max: number) =>
  pipe(
    n,
    (n) => Math.max(n, min),
    (n) => Math.min(n, max),
  );

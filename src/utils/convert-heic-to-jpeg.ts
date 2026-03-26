import { Path } from "@effect/platform";
import { Data, Effect } from "effect";
import heicConvert from "heic-convert";

class ConvertHeicError extends Data.TaggedError("ConvertHeicError")<{
  message?: string;
  cause?: unknown;
}> {}

export const convertHeicToJpeg = (imagePath: string, imageBuffer: Uint8Array) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    if (path.extname(imagePath).toLowerCase() != ".heic") return imageBuffer;

    const result = yield* Effect.tryPromise({
      try: () =>
        heicConvert({
          buffer: imageBuffer as unknown as ArrayBuffer,
          format: "JPEG",
          quality: 1,
        }),
      catch: (error) =>
        new ConvertHeicError({
          message: "error occured when converting heic file to jpeg",
          cause: error,
        }),
    });
    return new Uint8Array(result);
  });

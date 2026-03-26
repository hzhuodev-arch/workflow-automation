import { Context, Data, Effect } from "effect";

export class ImageProcessingError extends Data.TaggedError(
  "ImageProcessingError",
)<{
  message?: string;
  cause?: unknown;
}> {}

export interface ImageProcessorService {
  readonly getMetaData: (
    image: Uint8Array,
  ) => Effect.Effect<
    { width: number; height: number; format: string },
    ImageProcessingError
  >;
  readonly resizeImage: (
    image: Uint8Array,
    width: number,
    height: number,
  ) => Effect.Effect<Uint8Array, ImageProcessingError>;
  readonly applyOpacity: (
    image: Uint8Array,
    opacity: number,
  ) => Effect.Effect<Uint8Array, ImageProcessingError>;
  readonly compositeImage: (
    baseImage: Uint8Array,
    overlayImage: Uint8Array,
    x: number,
    y: number,
  ) => Effect.Effect<Uint8Array, ImageProcessingError>;
  readonly toJpeg: (
    image: Uint8Array,
    quality: number,
  ) => Effect.Effect<Uint8Array, ImageProcessingError>;
}

export class ImageProcessor extends Context.Tag("ImageProcessor")<
  ImageProcessor,
  ImageProcessorService
>() {}

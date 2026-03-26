import { Effect, Layer } from "effect";
import { ImageProcessingError, ImageProcessor } from "./image-processor.js";
import sharp from "sharp";

export const SharpImageProcessor = Layer.succeed(ImageProcessor, {
  getMetaData: (image: Uint8Array) =>
    Effect.gen(function* () {
      const buffer = Buffer.from(image);
      const metaData = yield* Effect.tryPromise({
        try: () => sharp(buffer).metadata(),
        catch: (error) =>
          new ImageProcessingError({
            message: "Failed to get image metadata",
            cause: error,
          }),
      });
      if (!metaData.width || !metaData.height || !metaData.format)
        return yield* new ImageProcessingError({
          message: "Image metadata is missing width, height, or format",
        });
      return {
        width: metaData.width,
        height: metaData.height,
        format: metaData.format,
      };
    }),

  resizeImage: (image: Uint8Array, scaledWidth: number, scaledHeight: number) =>
    Effect.tryPromise({
      try: () =>
        sharp(Buffer.from(image)).resize(scaledWidth, scaledHeight).toBuffer(),
      catch: (error) =>
        new ImageProcessingError({
          message: "Failed to resize image",
          cause: error,
        }),
    }),

  applyOpacity: (image: Uint8Array, opacity: number) =>
    Effect.gen(function* () {
      const buffer = Buffer.from(image);
      if (opacity >= 1) return new Uint8Array(buffer);
      const { data, info } = yield* Effect.tryPromise({
        try: () =>
          sharp(buffer)
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true }),
        catch: (error) =>
          new ImageProcessingError({
            message: "Failed to apply opacity to image",
            cause: error,
          }),
      });
      for (let i = 3; i < data.length; i += 4) {
        data[i] = Math.round(data[i] * opacity);
      }
      return yield* Effect.tryPromise({
        try: () =>
          sharp(data, {
            raw: { width: info.width, height: info.height, channels: 4 },
          })
            .png()
            .toBuffer(),
        catch: (error) =>
          new ImageProcessingError({
            message: "Failed to convert image to PNG after applying opacity",
            cause: error,
          }),
      });
    }),

  toJpeg: (image: Uint8Array, quality: number) =>
    Effect.tryPromise({
      try: () =>
        sharp(Buffer.from(image)).jpeg({ quality }).toBuffer(),
      catch: (error) =>
        new ImageProcessingError({
          message: "Failed to convert image to JPEG",
          cause: error,
        }),
    }),

  compositeImage: (
    baseImage: Uint8Array,
    overlayImage: Uint8Array,
    x: number,
    y: number,
  ) =>
    Effect.tryPromise({
      try: () =>
        sharp(Buffer.from(baseImage))
          .composite([{ input: Buffer.from(overlayImage), left: x, top: y }])
          .toBuffer(),
      catch: (error) =>
        new ImageProcessingError({
          message: "Failed to composite images",
          cause: error,
        }),
    }),
});

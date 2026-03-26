import * as AnthropicClient from "@effect/ai-anthropic/AnthropicClient";
import * as AnthropicLanguageModel from "@effect/ai-anthropic/AnthropicLanguageModel";
import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient";
import { Config, pipe } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FileSystem, Path } from "@effect/platform";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { SharpImageProcessor } from "./services/image-processor/implementation.js";
import { applyWatermark } from "./utils/apply-watermark.js";
import { convertHeicToJpeg } from "./utils/convert-heic-to-jpeg.js";
import { fileURLToPath } from "node:url";

const SUPPORTED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".heic",
]);

const main = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  // IMAGES_DIR is set by the launcher script to the folder containing the .app
  // Falls back to cwd for development use
  const imagesDir = yield* Config.string("IMAGES_DIR").pipe(
    Config.withDefault(process.cwd()),
  );

  // Watermark is bundled next to this script (in Resources/dist/ → Resources/)
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const watermarkPath = yield* Config.string("WATERMARK_PATH").pipe(
    Config.withDefault(path.join(scriptDir, "..", "watermark.png")),
  );

  const outputDir = path.join(imagesDir, "watermarked");

  yield* Effect.log(`Processing images in: ${imagesDir}`);
  yield* Effect.log(`Output directory: ${outputDir}`);

  yield* fs.makeDirectory(outputDir, { recursive: true });

  const watermark = yield* fs.readFile(watermarkPath);

  const allFilePaths = yield* fs.readDirectory(imagesDir);
  const imageFilePaths = allFilePaths.filter((f) =>
    SUPPORTED_EXTENSIONS.has(path.extname(f).toLowerCase()),
  );

  yield* Effect.log(`Found ${imageFilePaths.length} image(s) to process`);

  yield* Effect.forEach(
    imageFilePaths,
    (filePath) => {
      const fullPath = path.join(imagesDir, filePath);
      const filename =
        path.basename(filePath, path.extname(filePath)) + ".jpg";
      const outputPath = path.join(outputDir, filename);
      return pipe(
        fullPath,
        fs.readFile,
        Effect.flatMap((buffer) => convertHeicToJpeg(fullPath, buffer)),
        Effect.flatMap((baseImage) => applyWatermark(baseImage, watermark)),
        Effect.tap((baseImage) => fs.writeFile(outputPath, baseImage)),
        Effect.tap(() => Effect.log(`Done: ${filePath}`)),
      );
    },
    { concurrency: 10 },
  );

  yield* Effect.log("All done!");
});

const HttpClientLayer = NodeHttpClient.layer;

const AnthropicClientLayer = AnthropicClient.layerConfig({
  apiKey: Config.redacted("ANTHROPIC_API_KEY"),
}).pipe(Layer.provide(HttpClientLayer));

const LanguageModelLayer = AnthropicLanguageModel.layer({
  model: "claude-haiku-4-5-20251001",
}).pipe(Layer.provide(AnthropicClientLayer));

const MainLayer = Layer.mergeAll(
  LanguageModelLayer,
  AnthropicClientLayer,
  NodeFileSystem.layer,
  NodePath.layer,
  SharpImageProcessor,
);

Effect.runPromise(Effect.provide(main, MainLayer)).catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

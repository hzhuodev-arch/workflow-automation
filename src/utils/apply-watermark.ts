import { Effect, ExecutionPlan, pipe, Schedule, Schema } from "effect";
import { ImageProcessor } from "../services/image-processor/image-processor.js";
import { AiError, LanguageModel, Prompt } from "@effect/ai";
import { watermarkPlacementPrompt } from "../prompts/watermark-placement.js";
import { clampNumber } from "./clamp.js";
import { AnthropicLanguageModel } from "@effect/ai-anthropic";

const calculateWatermarkPlacementPlan = ExecutionPlan.make(
  {
    provide: AnthropicLanguageModel.model("claude-sonnet-4-6"),
    attempts: 3,
    schedule: Schedule.exponential("100 millis", 1.5),
    while: (error: AiError.AiError) =>
      error._tag === "HttpRequestError" ||
      error._tag === "HttpResponseError" ||
      error._tag === "UnknownError",
  },
  {
    provide: AnthropicLanguageModel.model("claude-haiku-4-5-20251001"),
    attempts: 2,
    schedule: Schedule.exponential("100 millis", 1.5),
  },
);

const WatermarkPlacement = Schema.Struct({
  x: Schema.Number.pipe(Schema.int()),
  y: Schema.Number.pipe(Schema.int()),
  scale: Schema.Number.pipe(Schema.between(0.1, 1)),
  opacity: Schema.Number.pipe(Schema.between(0.35, 0.65)),
  justification: Schema.String,
});

export const applyWatermark = (baseImage: Uint8Array, watermark: Uint8Array) =>
  Effect.gen(function* () {
    const imageProcessor = yield* ImageProcessor;

    const [baseImageMeta, watermarkMeta] = yield* Effect.all([
      imageProcessor.getMetaData(baseImage),
      imageProcessor.getMetaData(watermark),
    ]);

    // Construct LLM prompt
    const textPart = Prompt.makePart("text", {
      text: watermarkPlacementPrompt(
        baseImageMeta.width,
        baseImageMeta.height,
        watermarkMeta.width,
        watermarkMeta.height,
      ),
    });

    const imagePart = Prompt.makePart("file", {
      mediaType: `image/${baseImageMeta.format}` as `image/${string}`,
      data: yield* imageProcessor.toJpeg(baseImage, 20),
    });

    const message = Prompt.makeMessage("user", {
      content: [textPart, imagePart],
    });

    const prompt = Prompt.fromMessages([message]);

    // Get result from LLM and calculate placement
    const result = yield* LanguageModel.generateObject({
      prompt,
      schema: WatermarkPlacement,
      objectName: "WatermarkPlacement",
    }).pipe(Effect.withExecutionPlan(calculateWatermarkPlacementPlan));
    
    const { scale, x, y, opacity } = result.value;

    const scaledWmWidth = Math.round(watermarkMeta.width * scale);
    const scaledWmHeight = Math.round(watermarkMeta.height * scale);

    const maxX = baseImageMeta.width - scaledWmWidth;
    const maxY = baseImageMeta.height - scaledWmHeight;
    const left = clampNumber(x, 0, maxX);
    const top = clampNumber(y, 0, maxY);

    // Process image
    return yield* pipe(
      imageProcessor.resizeImage(watermark, scaledWmWidth, scaledWmHeight),
      Effect.flatMap((watermark) =>
        imageProcessor.applyOpacity(watermark, opacity),
      ),
      Effect.flatMap((watermark) =>
        imageProcessor.compositeImage(baseImage, watermark, left, top),
      ),
    );
  });

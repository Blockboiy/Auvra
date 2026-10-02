import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import multer from "multer";
import { AgentRunner } from "./agent-runner.js";
import type { AppConfig } from "./config.js";
import { DomainError, MissionService } from "./mission-service.js";
import { OrbioProvider } from "./provider/orbio.js";
import type { InferenceProvider } from "./provider/types.js";
import { JsonMissionRepository, type MissionRepository } from "./repository.js";
import { ToolRegistry } from "./tools.js";
import { BraveWebSearch, FallbackWebSearch, OrbioFirecrawlWebResearch, type WebScrapeProvider, type WebSearchProvider } from "./web-search.js";
import { CreativeService } from "./creative/service.js";
import { JsonCreativeRepository, type CreativeRepository } from "./creative/repository.js";
import { OrbioVideoProvider, type VideoProvider } from "./creative/video-provider.js";
import { RemotionFinishingRenderer, type FinishingRenderer } from "./creative/finishing-renderer.js";

export interface AppDependencies {
  repository?: MissionRepository;
  provider?: InferenceProvider;
  searchProvider?: WebSearchProvider;
  scrapeProvider?: WebScrapeProvider;
  creativeRepository?: CreativeRepository;
  videoProvider?: VideoProvider;
  finishingRenderer?: FinishingRenderer;
}

export function createApp(config: AppConfig, dependencies: AppDependencies = {}) {
  const repository = dependencies.repository ?? new JsonMissionRepository(config.dataFile);
  const provider = dependencies.provider ?? new OrbioProvider(config.provider);
  const orbioWeb = new OrbioFirecrawlWebResearch(config.provider.apiKey, config.provider.baseUrl);
  const searchProvider = dependencies.searchProvider ?? new FallbackWebSearch(new BraveWebSearch(config.webSearch?.apiKey ?? ""), orbioWeb);
  const service = new MissionService(repository, config, provider);
  const runner = new AgentRunner(repository, provider, new ToolRegistry(searchProvider, dependencies.scrapeProvider ?? orbioWeb), config);
  service.attachRunner(runner);
  const creativeRepository = dependencies.creativeRepository ?? new JsonCreativeRepository(config.creative.dataFile);
  const videoProvider = dependencies.videoProvider ?? new OrbioVideoProvider({ apiKey: config.provider.apiKey, baseUrl: config.provider.baseUrl, timeoutMs: config.provider.timeoutMs });
  const creative = new CreativeService(creativeRepository, config, provider, videoProvider, dependencies.finishingRenderer ?? new RemotionFinishingRenderer());
  void creative.resume();

  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: config.webOrigin, methods: ["GET", "POST"] }));
  app.use(express.json({ limit: "32kb" }));
  app.use("/api", (_request, response, next) => { response.setHeader("Cache-Control", "no-store"); next(); });

  app.get("/api/health", (_request, response) => response.json({ status: "ok", service: "auvra-api" }));
  app.get("/api/provider/status", async (_request, response, next) => {
    try { response.json(await service.providerStatus()); } catch (error) { next(error); }
  });
  app.get("/api/dashboard", async (_request, response, next) => {
    try { response.json(await service.dashboard()); } catch (error) { next(error); }
  });
  app.get("/api/missions", async (_request, response, next) => {
    try { response.json(await service.list()); } catch (error) { next(error); }
  });
  app.post("/api/missions", async (request, response, next) => {
    try { response.status(201).json(await service.create(request.body)); } catch (error) { next(error); }
  });
  app.get("/api/missions/:id", async (request, response, next) => {
    try { response.json(await service.get(request.params.id)); } catch (error) { next(error); }
  });
  app.post("/api/missions/:id/start", async (request, response, next) => {
    try { response.status(202).json(await service.start(request.params.id)); } catch (error) { next(error); }
  });
  app.post("/api/missions/:id/cancel", async (request, response, next) => {
    try { response.json(await service.cancel(request.params.id)); } catch (error) { next(error); }
  });

  const upload = multer({ storage: multer.memoryStorage(), limits: { files: config.creative.maxAssetFiles, fileSize: config.creative.maxAssetBytes, fields: 5, fieldSize: 1024 } });
  app.get("/api/creative/models", (_request, response) => response.json(creative.models()));
  app.post("/api/creative/projects", async (request, response, next) => { try { response.status(201).json(await creative.create(request.body)); } catch (error) { next(error); } });
  app.get("/api/creative/projects", async (_request, response, next) => { try { response.json(await creative.list()); } catch (error) { next(error); } });
  app.get("/api/creative/projects/:id", async (request, response, next) => { try { response.json(await creative.get(request.params.id)); } catch (error) { next(error); } });
  app.post("/api/creative/projects/:id/assets", upload.array("assets", config.creative.maxAssetFiles), async (request, response, next) => { try { response.status(201).json(await creative.addAssets(String(request.params.id), request.files as Express.Multer.File[], request.body?.role)); } catch (error) { next(error); } });
  app.post("/api/creative/projects/:id/reference", async (request, response, next) => { try { response.json(await creative.setReferenceAsset(request.params.id, request.body?.assetId)); } catch (error) { next(error); } });
  app.get("/api/creative/projects/:id/assets/:assetId/content", async (request, response, next) => { try { const { asset, path } = await creative.getAsset(request.params.id, request.params.assetId); response.setHeader("Content-Type", asset.mimeType); response.setHeader("Content-Disposition", "inline"); response.sendFile(path, (error) => { if (error) next(error); }); } catch (error) { next(error); } });
  app.post("/api/creative/projects/:id/analyze", async (request, response, next) => { try { response.json(await creative.analyze(request.params.id)); } catch (error) { next(error); } });
  app.post("/api/creative/projects/:id/direct", async (request, response, next) => { try { response.json(await creative.direct(request.params.id, request.body?.plan)); } catch (error) { next(error); } });
  app.post("/api/creative/projects/:id/finishing", async (request, response, next) => { try { response.json(await creative.updateFinishing(request.params.id, request.body)); } catch (error) { next(error); } });
  app.post("/api/creative/projects/:id/finishing/prepare-script", async (request, response, next) => { try { response.json(await creative.prepareNarrationScript(request.params.id)); } catch (error) { next(error); } });
  app.post("/api/creative/projects/:id/render", async (request, response, next) => { try { response.status(201).json(await creative.renderFinal(request.params.id)); } catch (error) { next(error); } });
  app.post("/api/creative/projects/:id/quote", async (request, response, next) => { try { response.status(201).json(await creative.quote(request.params.id, request.body?.shotId)); } catch (error) { next(error); } });
  app.post("/api/creative/projects/:id/quotes/:quoteId/approve", async (request, response, next) => { try { response.json(await creative.approveQuote(request.params.id, request.params.quoteId)); } catch (error) { next(error); } });
  app.post("/api/creative/projects/:id/generate", async (request, response, next) => { try { response.status(202).json(await creative.generate(request.params.id, request.body?.quoteId)); } catch (error) { next(error); } });
  app.get("/api/creative/projects/:id/generations/:generationId", async (request, response, next) => { try { response.json(await creative.getGeneration(request.params.id, request.params.generationId)); } catch (error) { next(error); } });
  app.get("/api/creative/projects/:id/output", async (request, response, next) => { try { const project = await creative.get(request.params.id); if (!project.outputAssetId) throw new DomainError("Final output is not ready.", "OUTPUT_NOT_READY", 404); response.json({ assetId: project.outputAssetId }); } catch (error) { next(error); } });

  app.use((_request, response) => response.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found." } }));
  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof DomainError) {
      response.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details } });
      return;
    }
    if (error instanceof SyntaxError) {
      response.status(400).json({ error: { code: "INVALID_JSON", message: "Request body contains invalid JSON." } });
      return;
    }
    if (error instanceof multer.MulterError) {
      response.status(413).json({ error: { code: "ASSET_LIMIT_EXCEEDED", message: "Creative asset upload limits were exceeded." } });
      return;
    }
    console.error("Auvra request failed", error instanceof Error ? error.message : "Unknown error");
    response.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected server error occurred." } });
  });

  return { app, service, runner, repository, creative, creativeRepository };
}

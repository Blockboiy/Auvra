import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { AgentRunner } from "./agent-runner.js";
import type { AppConfig } from "./config.js";
import { DomainError, MissionService } from "./mission-service.js";
import { OrbioProvider } from "./provider/orbio.js";
import type { InferenceProvider } from "./provider/types.js";
import { JsonMissionRepository, type MissionRepository } from "./repository.js";
import { ToolRegistry } from "./tools.js";
import { BraveWebSearch } from "./web-search.js";
import { registerCreativeStudio } from "./creative-studio.js";

export interface AppDependencies {
  repository?: MissionRepository;
  provider?: InferenceProvider;
  searchProvider?: BraveWebSearch;
}

export function createApp(config: AppConfig, dependencies: AppDependencies = {}) {
  const repository = dependencies.repository ?? new JsonMissionRepository(config.dataFile);
  const provider = dependencies.provider ?? new OrbioProvider(config.provider);
  const service = new MissionService(repository, config, provider);
  const runner = new AgentRunner(repository, provider, new ToolRegistry(dependencies.searchProvider ?? new BraveWebSearch(config.webSearch?.apiKey ?? "")), config);
  service.attachRunner(runner);

  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: config.webOrigin, methods: ["GET", "POST", "PATCH"] }));
  // Creative Studio accepts one bounded base64 product image; normal API requests retain 32kb limit.
  app.use("/api/creative", (_request, response, next) => { response.setHeader("Cache-Control", "no-store"); next(); });
  app.use("/api/creative", express.json({ limit: "12mb" }));
  app.use(express.json({ limit: "32kb" }));
  app.use("/api", (_request, response, next) => { response.setHeader("Cache-Control", "no-store"); next(); });

  registerCreativeStudio(app, config, provider);

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
    console.error("Auvra request failed", error instanceof Error ? error.message : "Unknown error");
    response.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected server error occurred." } });
  });

  return { app, service, runner, repository };
}

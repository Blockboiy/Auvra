import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { CreativeProject, VideoGeneration } from "@auvra/shared";

type CreativeDatabase = { version: 1; projects: CreativeProject[] };
const clone = <T>(value: T): T => structuredClone(value);

export interface CreativeRepository {
  listProjects(): Promise<CreativeProject[]>;
  getProject(id: string): Promise<CreativeProject | undefined>;
  createProject(project: CreativeProject): Promise<CreativeProject>;
  updateProject(id: string, updater: (project: CreativeProject) => CreativeProject): Promise<CreativeProject | undefined>;
  nonTerminalGenerations(): Promise<VideoGeneration[]>;
}

export class JsonCreativeRepository implements CreativeRepository {
  private database: CreativeDatabase = { version: 1, projects: [] };
  private loaded = false;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly filename: string) {}
  private serialize<T>(fn: () => Promise<T>): Promise<T> { const result = this.queue.then(fn, fn); this.queue = result.then(() => undefined, () => undefined); return result; }
  private async load() { if (this.loaded) return; try { const parsed = JSON.parse(await readFile(this.filename, "utf8")) as CreativeDatabase; this.database = { version: 1, projects: Array.isArray(parsed.projects) ? parsed.projects : [] }; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } this.loaded = true; }
  private async persist() { await mkdir(dirname(this.filename), { recursive: true }); const temp = `${this.filename}.${process.pid}.tmp`; await writeFile(temp, JSON.stringify(this.database, null, 2), "utf8"); await rename(temp, this.filename); }
  listProjects() { return this.serialize(async () => { await this.load(); return clone(this.database.projects).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }); }
  getProject(id: string) { return this.serialize(async () => { await this.load(); const found = this.database.projects.find((project) => project.id === id); return found ? clone(found) : undefined; }); }
  createProject(project: CreativeProject) { return this.serialize(async () => { await this.load(); this.database.projects.push(clone(project)); await this.persist(); return clone(project); }); }
  updateProject(id: string, updater: (project: CreativeProject) => CreativeProject) { return this.serialize(async () => { await this.load(); const index = this.database.projects.findIndex((project) => project.id === id); if (index < 0) return undefined; const current = this.database.projects[index]!; const updated = updater(clone(current)); this.database.projects[index] = clone(updated); await this.persist(); return clone(updated); }); }
  nonTerminalGenerations() { return this.serialize(async () => { await this.load(); return clone(this.database.projects.flatMap((project) => project.generations).filter((generation) => ["pending", "in_progress"].includes(generation.status) && generation.upstreamJobId)); }); }
}

export class MemoryCreativeRepository implements CreativeRepository {
  private projects = new Map<string, CreativeProject>();
  async listProjects() { return [...this.projects.values()].map(clone); }
  async getProject(id: string) { const found = this.projects.get(id); return found ? clone(found) : undefined; }
  async createProject(project: CreativeProject) { this.projects.set(project.id, clone(project)); return clone(project); }
  async updateProject(id: string, updater: (project: CreativeProject) => CreativeProject) { const found = this.projects.get(id); if (!found) return undefined; const updated = updater(clone(found)); this.projects.set(id, clone(updated)); return clone(updated); }
  async nonTerminalGenerations() { return [...this.projects.values()].flatMap((project) => project.generations).filter((generation) => ["pending", "in_progress"].includes(generation.status) && generation.upstreamJobId).map(clone); }
}

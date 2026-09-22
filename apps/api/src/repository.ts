import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Mission } from "@auvra/shared";

interface DatabaseShape {
  version: 1;
  missions: Mission[];
}

export interface MissionRepository {
  list(): Promise<Mission[]>;
  get(id: string): Promise<Mission | undefined>;
  create(mission: Mission): Promise<Mission>;
  update(id: string, updater: (mission: Mission) => Mission): Promise<Mission | undefined>;
}

const clone = <T>(value: T): T => structuredClone(value);

export class JsonMissionRepository implements MissionRepository {
  private data: DatabaseShape = { version: 1, missions: [] };
  private loaded = false;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly filename: string) {}

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await readFile(this.filename, "utf8");
      const parsed = JSON.parse(raw) as DatabaseShape;
      this.data = { version: 1, missions: Array.isArray(parsed.missions) ? parsed.missions : [] };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.filename), { recursive: true });
    const temporary = `${this.filename}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(this.data, null, 2), "utf8");
    await rename(temporary, this.filename);
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  async list(): Promise<Mission[]> {
    return this.serialize(async () => {
      await this.ensureLoaded();
      return clone(this.data.missions).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
  }

  async get(id: string): Promise<Mission | undefined> {
    return this.serialize(async () => {
      await this.ensureLoaded();
      const found = this.data.missions.find((mission) => mission.id === id);
      return found ? clone(found) : undefined;
    });
  }

  async create(mission: Mission): Promise<Mission> {
    return this.serialize(async () => {
      await this.ensureLoaded();
      this.data.missions.push(clone(mission));
      await this.persist();
      return clone(mission);
    });
  }

  async update(id: string, updater: (mission: Mission) => Mission): Promise<Mission | undefined> {
    return this.serialize(async () => {
      await this.ensureLoaded();
      const index = this.data.missions.findIndex((mission) => mission.id === id);
      if (index < 0) return undefined;
      const current = this.data.missions[index];
      if (!current) return undefined;
      const updated = updater(clone(current));
      this.data.missions[index] = clone(updated);
      await this.persist();
      return clone(updated);
    });
  }
}

export class MemoryMissionRepository implements MissionRepository {
  private readonly missions = new Map<string, Mission>();

  async list(): Promise<Mission[]> {
    return [...this.missions.values()].map(clone).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async get(id: string): Promise<Mission | undefined> {
    const mission = this.missions.get(id);
    return mission ? clone(mission) : undefined;
  }
  async create(mission: Mission): Promise<Mission> {
    this.missions.set(mission.id, clone(mission));
    return clone(mission);
  }
  async update(id: string, updater: (mission: Mission) => Mission): Promise<Mission | undefined> {
    const mission = this.missions.get(id);
    if (!mission) return undefined;
    const updated = updater(clone(mission));
    this.missions.set(id, clone(updated));
    return clone(updated);
  }
}

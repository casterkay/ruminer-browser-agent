import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

type QueueItem = Record<string, unknown>;

export class PersistentQueue {
  private dir: string;

  constructor(dir: string) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
  }

  async enqueue(item: QueueItem): Promise<void> {
    const id = `${Date.now()}-${crypto.randomUUID()}.json`;
    const file = path.join(this.dir, id);
    await fs.promises.writeFile(file, JSON.stringify(item));
  }

  async list(): Promise<string[]> {
    return fs.promises.readdir(this.dir);
  }

  async read(file: string): Promise<QueueItem | null> {
    try {
      const content = await fs.promises.readFile(path.join(this.dir, file), 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async remove(file: string): Promise<void> {
    await fs.promises.rm(path.join(this.dir, file), { force: true });
  }
}

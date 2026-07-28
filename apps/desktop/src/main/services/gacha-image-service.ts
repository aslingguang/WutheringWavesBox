import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RESOURCE_ROOT =
  'https://raw.githubusercontent.com/leck995/WutheringWavesToolResources/main/assets/header';
export class GachaImageService {
  constructor(private readonly cacheDirectory: string) {
    mkdirSync(cacheDirectory, { recursive: true });
  }
  async get(resourceIds: number[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    await Promise.all(
      resourceIds.slice(0, 200).map(async (id) => {
        if (!Number.isInteger(id) || id <= 0) return;
        try {
          const bytes = await this.load(id);
          result[String(id)] = `data:image/png;base64,${bytes.toString('base64')}`;
        } catch {
          /* Missing images use the renderer fallback. */
        }
      }),
    );
    return result;
  }
  private async load(id: number): Promise<Buffer> {
    const path = join(this.cacheDirectory, `${id}.png`);
    try {
      return readFileSync(path);
    } catch {
      const response = await fetch(`${RESOURCE_ROOT}/${id}.png`, {
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error('IMAGE_NOT_FOUND');
      const type = response.headers.get('content-type') ?? '';
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!type.startsWith('image/') || bytes.length < 100 || bytes.length > 2_000_000)
        throw new Error('IMAGE_INVALID');
      writeFileSync(path, bytes);
      return bytes;
    }
  }
}

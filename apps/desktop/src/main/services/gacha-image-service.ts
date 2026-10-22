import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type GachaImageResource = { resourceId: number; name: string; resourceType: string };
type WikiRecord = { name: string; iconUrl: string };
const API = 'https://api.kurobbs.com';
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 KuroGameBox/3.1.3';

export class GachaImageService {
  private catalogs = new Map<string, { expires: number; records: WikiRecord[] }>();

  constructor(
    private readonly cacheDirectory: string,
    private readonly roleArtworkCacheDirectory?: string,
  ) {
    mkdirSync(cacheDirectory, { recursive: true });
  }

  async get(
    resources: GachaImageResource[],
    roleAvatarUrls: Record<string, string> = {},
  ): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    const unique = [...new Map(resources.map((item) => [item.resourceId, item])).values()].slice(
      0,
      200,
    );
    const weapons = await this.catalog('1106');
    await Promise.all(
      unique.map(async (item) => {
        if (!Number.isInteger(item.resourceId) || item.resourceId <= 0) return;
        try {
          const character = !(/武器/i.test(item.resourceType) || item.resourceId >= 20_000_000);
          const cached = character
            ? this.readRoleAvatarCache(item.resourceId)
            : this.readCache(item.resourceId);
          if (cached) {
            result[String(item.resourceId)] = cached;
            return;
          }
          const imageUrl = character
            ? roleAvatarUrls[String(item.resourceId)]
            : weapons.find(
                (candidate) => normalizeName(candidate.name) === normalizeName(item.name),
              )?.iconUrl;
          if (!imageUrl) return;
          const response = await fetch(imageUrl, { signal: AbortSignal.timeout(10_000) });
          if (!response.ok) return;
          const type = response.headers.get('content-type')?.split(';')[0] ?? 'image/png';
          const bytes = Buffer.from(await response.arrayBuffer());
          if (!type.startsWith('image/') || bytes.length < 100 || bytes.length > 5_000_000) return;
          writeFileSync(
            join(
              this.cacheDirectory,
              `${item.resourceId}-${character ? 'official-avatar' : 'official-wiki'}.png`,
            ),
            bytes,
          );
          result[String(item.resourceId)] = `data:${type};base64,${bytes.toString('base64')}`;
        } catch {
          // A missing Wiki entry leaves the renderer fallback visible.
        }
      }),
    );
    return result;
  }

  private readCache(id: number): string | null {
    try {
      const bytes = readFileSync(join(this.cacheDirectory, `${id}-official-wiki.png`));
      return bytes.length >= 100 ? `data:image/png;base64,${bytes.toString('base64')}` : null;
    } catch {
      return null;
    }
  }

  private readRoleAvatarCache(id: number): string | null {
    for (const path of [
      join(this.cacheDirectory, `${id}-official-avatar.png`),
      join(this.cacheDirectory, `${id}.png`),
      ...(this.roleArtworkCacheDirectory
        ? [join(this.roleArtworkCacheDirectory, `${id}-icon-original.png`)]
        : []),
    ]) {
      try {
        const bytes = readFileSync(path);
        if (bytes.length >= 100) return `data:image/png;base64,${bytes.toString('base64')}`;
      } catch {
        // Continue through the independent official avatar caches.
      }
    }
    return null;
  }

  private async catalog(catalogueId: string): Promise<WikiRecord[]> {
    const cached = this.catalogs.get(catalogueId);
    if (cached && cached.expires > Date.now()) return cached.records;
    const response = await fetch(`${API}/wiki/core/catalogue/item/getPage`, {
      method: 'POST',
      signal: AbortSignal.timeout(20_000),
      headers: {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': UA,
        source: 'h5',
        wiki_type: '9',
        devcode: 'wwbox-gacha-wiki-cache',
      },
      body: new URLSearchParams({ catalogueId, page: '1', limit: '1000' }),
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as Record<string, unknown>;
    const data = asRecord(payload.data);
    const recordsValue = asRecord(data.results).records;
    const records = (Array.isArray(recordsValue) ? recordsValue : []).flatMap((value) => {
      const record = asRecord(value);
      const content = asRecord(record.content);
      const name = String(record.name ?? content.title ?? '').trim();
      const iconUrl = String(content.contentUrl ?? '').trim();
      return name && /^https:\/\//i.test(iconUrl) ? [{ name, iconUrl }] : [];
    });
    this.catalogs.set(catalogueId, { expires: Date.now() + 6 * 60 * 60_000, records });
    return records;
  }
}

function normalizeName(value: string): string {
  return value.replace(/[·・\s]/g, '').toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

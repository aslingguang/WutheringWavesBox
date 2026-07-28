import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type {
  GachaVersionMetadata,
  SaveVersionMetadataInput,
  VersionMetadataConflictStrategy,
  VersionMetadataUpdatePreview,
} from '@wwbox/contracts';
import { GACHA_VERSION_METADATA } from '@wwbox/contracts';

const OFFICIAL_URL =
  'https://media-cdn-mingchao.kurogame.com/akiwebsite/website2.0/json/G152/zh/ArticleMenu.json';
const OFFICIAL_ARTICLE_BASE =
  'https://media-cdn-mingchao.kurogame.com/akiwebsite/website2.0/json/G152/zh/article';

type RemoteEntry = { version: string; name: string; start: string; source: 'official' };

export class VersionMetadataService {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  list(): GachaVersionMetadata[] {
    if (!existsSync(this.filePath)) return this.normalize(structuredClone(GACHA_VERSION_METADATA));
    try {
      const value = JSON.parse(readFileSync(this.filePath, 'utf8')) as unknown;
      return Array.isArray(value)
        ? this.normalize(ensureBaseline(value.filter(isMetadata)))
        : this.normalize(structuredClone(GACHA_VERSION_METADATA));
    } catch {
      return this.normalize(structuredClone(GACHA_VERSION_METADATA));
    }
  }

  async previewUpdate(): Promise<VersionMetadataUpdatePreview> {
    const sourceErrors: VersionMetadataUpdatePreview['sourceErrors'] = {};
    const officialResult = await Promise.allSettled([this.fetchOfficial()]);
    const official = officialResult[0]?.status === 'fulfilled' ? officialResult[0].value : [];
    if (officialResult[0]?.status === 'rejected')
      sourceErrors.official = errorMessage(officialResult[0].reason);
    if (!official.length) throw new Error('VERSION_METADATA_FETCH_FAILED');

    const local = this.list();
    const entries = this.mergeRemote(local, official);
    const localByVersion = new Map(local.map((entry) => [entry.version, entry]));
    const conflicts = entries
      .filter((entry) => {
        const current = localByVersion.get(entry.version);
        return current && (current.name !== entry.name || current.start !== entry.start);
      })
      .map((incoming) => ({
        version: incoming.version,
        local: localByVersion.get(incoming.version)!,
        incoming,
      }));
    return { entries, conflicts, sourceErrors, fetchedAt: new Date().toISOString() };
  }

  applyUpdate(
    preview: VersionMetadataUpdatePreview,
    strategy: VersionMetadataConflictStrategy,
  ): GachaVersionMetadata[] {
    const current = this.list();
    const conflicts = new Set(preview.conflicts.map((entry) => entry.version));
    const incoming =
      strategy === 'overwrite'
        ? preview.entries
        : preview.entries.map((entry) =>
            conflicts.has(entry.version)
              ? (current.find((item) => item.version === entry.version) ?? entry)
              : entry,
          );
    this.persist(incoming);
    return this.list();
  }

  save(input: SaveVersionMetadataInput): GachaVersionMetadata[] {
    const entries = this.list();
    const current = entries.find((entry) => entry.version === input.version);
    const saved: GachaVersionMetadata = {
      version: input.version,
      name: input.name.trim(),
      start: normalizeDate(input.start),
      end: current?.end ?? null,
      featuredCharacterIds: current?.featuredCharacterIds ?? [],
      featuredWeaponIds: current?.featuredWeaponIds ?? [],
      phases: current?.phases ?? [],
      dateSource: 'manual',
      dateVerified: true,
    };
    this.persist([...entries.filter((entry) => entry.version !== input.version), saved]);
    return this.list();
  }

  remove(version: string): GachaVersionMetadata[] {
    const entries = this.list();
    if (!entries.some((entry) => entry.version === version)) throw new Error('VERSION_NOT_FOUND');
    this.persist(entries.filter((entry) => entry.version !== version));
    return this.list();
  }

  private async fetchOfficial(): Promise<RemoteEntry[]> {
    const articles = (await fetchJson(OFFICIAL_URL)) as Array<Record<string, unknown>>;
    const names = new Map<string, string>();
    const maintenance: Array<{ version: string; articleId: number }> = [];
    for (const article of articles) {
      const title = typeof article.articleTitle === 'string' ? article.articleTitle : '';
      const content = title.match(/(?:《鸣潮》)?[「“]([^」”]+)[」”]\s*(\d+\.\d+)版本内容说明/);
      if (content) names.set(content[2]!, content[1]!.trim());
      const update = title.match(/(\d+\.\d+)版本更新维护/);
      if (update && typeof article.articleId === 'number')
        maintenance.push({ version: update[1]!, articleId: article.articleId });
    }
    const results = await Promise.all(
      maintenance.map(async ({ version, articleId }) => {
        const detail = (await fetchJson(`${OFFICIAL_ARTICLE_BASE}/${articleId}.json`)) as Record<
          string,
          unknown
        >;
        const html = typeof detail.articleContent === 'string' ? detail.articleContent : '';
        const plain = decodeHtml(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
        const time = plain.match(
          /更新维护时间[：:]?\s*[✦*]?\s*(\d{4})年(\d{1,2})月(\d{1,2})日(\d{1,2}):(\d{2})\s*[~～至-]/,
        );
        const name = names.get(version);
        if (!time || !name) return null;
        return {
          version,
          name,
          start: `${time[1]}-${time[2]!.padStart(2, '0')}-${time[3]!.padStart(2, '0')} ${time[4]!.padStart(2, '0')}:${time[5]}:00`,
          source: 'official' as const,
        };
      }),
    );
    return results.filter((entry): entry is RemoteEntry => entry !== null);
  }

  private mergeRemote(
    local: GachaVersionMetadata[],
    remote: RemoteEntry[],
  ): GachaVersionMetadata[] {
    const localMap = new Map(local.map((entry) => [entry.version, entry]));
    const merged = new Map(local.map((entry) => [entry.version, entry]));
    for (const entry of remote) {
      const base = localMap.get(entry.version);
      merged.set(entry.version, {
        version: entry.version,
        name: entry.name,
        start: entry.start,
        end: base?.end ?? null,
        featuredCharacterIds: base?.featuredCharacterIds ?? [],
        featuredWeaponIds: base?.featuredWeaponIds ?? [],
        phases: base?.phases ?? [],
        dateSource: entry.source,
        dateVerified: true,
      });
    }
    return this.normalize([...merged.values()]);
  }

  private normalize(entries: GachaVersionMetadata[]): GachaVersionMetadata[] {
    const sorted = [...entries].sort((a, b) => b.start.localeCompare(a.start));
    return sorted.map((entry, index) => ({
      ...entry,
      end: index === 0 ? null : sorted[index - 1]!.start,
    }));
  }

  private persist(entries: GachaVersionMetadata[]): void {
    writeFileSync(this.filePath, JSON.stringify(this.normalize(entries), null, 2), 'utf8');
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const text = await response.text();
  if (text.length > 5_000_000) throw new Error('RESPONSE_TOO_LARGE');
  return JSON.parse(text) as unknown;
}

function normalizeDate(value: string): string {
  const match = value
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) throw new Error('VERSION_DATE_INVALID');
  return `${match[1]}-${match[2]}-${match[3]} ${match[4] ?? '00'}:${match[5] ?? '00'}:${match[6] ?? '00'}`;
}

function isMetadata(value: unknown): value is GachaVersionMetadata {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<GachaVersionMetadata>;
  return (
    typeof item.version === 'string' &&
    typeof item.name === 'string' &&
    typeof item.start === 'string' &&
    Array.isArray(item.phases)
  );
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function ensureBaseline(entries: GachaVersionMetadata[]): GachaVersionMetadata[] {
  const baseline = GACHA_VERSION_METADATA.find((entry) => entry.version === '1.0');
  return baseline
    ? [...entries.filter((entry) => entry.version !== '1.0'), structuredClone(baseline)]
    : entries;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

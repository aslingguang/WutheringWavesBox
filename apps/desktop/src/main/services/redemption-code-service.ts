import type { AccountRegion, RedemptionCode, RedemptionCodeCatalog } from '@wwbox/contracts';
import type { RedemptionCodeRepository } from './redemption-code-repository';

const GLOBAL_PAGE = 'https://wutheringwaves.fandom.com/wiki/Redemption_Code';
const GLOBAL_API =
  'https://wutheringwaves.fandom.com/api.php?action=parse&page=Redemption_Code&prop=wikitext&format=json&origin=*';
const CN_PAGE = 'https://wuwa.uk/zh/articles/redeem-codes';
const CACHE_DURATION_MS = 10 * 60 * 1000;

export class RedemptionCodeService {
  private cache: RedemptionCodeCatalog | null = null;

  constructor(private readonly repository?: RedemptionCodeRepository) {}

  async list(forceRefresh = false): Promise<RedemptionCodeCatalog> {
    if (
      !forceRefresh &&
      this.cache &&
      Date.now() - Date.parse(this.cache.fetchedAt) < CACHE_DURATION_MS
    )
      return this.cache;

    const [cnResult, globalResult] = await Promise.allSettled([fetchCnCodes(), fetchGlobalCodes()]);
    if (cnResult.status === 'fulfilled')
      this.repository?.upsert('cn', cnResult.value, new URL(CN_PAGE).hostname);
    if (globalResult.status === 'fulfilled')
      this.repository?.upsert('global', globalResult.value, new URL(GLOBAL_PAGE).hostname);

    const cn = this.repository?.list('cn') ?? resultValue(cnResult);
    const global = this.repository?.list('global') ?? resultValue(globalResult);
    const failed = cnResult.status === 'rejected' || globalResult.status === 'rejected';
    this.cache = {
      cn,
      global,
      source: `${new URL(CN_PAGE).hostname} / ${new URL(GLOBAL_PAGE).hostname}`,
      fetchedAt: new Date().toISOString(),
      ...(failed && !cn.length && !global.length
        ? { errorCode: 'REDEMPTION_SOURCE_UNAVAILABLE' }
        : {}),
    };
    return this.cache;
  }

  async markUsed(
    region: AccountRegion,
    code: string,
    used: boolean,
  ): Promise<RedemptionCodeCatalog> {
    if (!this.repository) throw new Error('REDEMPTION_DATABASE_UNAVAILABLE');
    this.repository.markUsed(region, code, used);
    const current = this.cache ?? {
      cn: this.repository.list('cn'),
      global: this.repository.list('global'),
      source: `${new URL(CN_PAGE).hostname} / ${new URL(GLOBAL_PAGE).hostname}`,
      fetchedAt: new Date().toISOString(),
    };
    this.cache = { ...current, [region]: this.repository.list(region) };
    return this.cache;
  }
}

async function fetchCnCodes(): Promise<RedemptionCode[]> {
  const response = await fetch(CN_PAGE, {
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: 'text/html', 'User-Agent': 'WutheringWavesBox/0.2' },
  });
  if (!response.ok) throw new Error('CN_REDEMPTION_SOURCE_UNAVAILABLE');
  const html = await response.text();
  const active = sectionTable(html, /<h2[^>]*>\s*有效兑换码/i);
  const expired = sectionTable(html, /<h2[^>]*>\s*最近过期/i);
  const codes = [...readHtmlTable(active, true), ...readHtmlTable(expired, false)];
  if (!codes.length) throw new Error('CN_REDEMPTION_RESPONSE_INVALID');
  return uniqueCodes(codes);
}

async function fetchGlobalCodes(): Promise<RedemptionCode[]> {
  const response = await fetch(GLOBAL_API, {
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('GLOBAL_REDEMPTION_SOURCE_UNAVAILABLE');
  const body = (await response.json()) as { parse?: { wikitext?: { '*'?: unknown } } };
  const wikitext = body.parse?.wikitext?.['*'];
  if (typeof wikitext !== 'string') throw new Error('GLOBAL_REDEMPTION_RESPONSE_INVALID');
  const active = wikitext.split('===Active===')[1]?.split('===Expired===')[0] ?? '';
  const expired = wikitext.split('===Expired===')[1] ?? '';
  const codes = [...readWikiCodes(active, true), ...readWikiCodes(expired, false)];
  if (!codes.length) throw new Error('GLOBAL_REDEMPTION_RESPONSE_INVALID');
  return uniqueCodes(codes);
}

function sectionTable(html: string, heading: RegExp): string {
  const start = html.search(heading);
  if (start < 0) return '';
  const tableStart = html.indexOf('<table', start);
  const tableEnd = html.indexOf('</table>', tableStart);
  return tableStart >= 0 && tableEnd >= 0 ? html.slice(tableStart, tableEnd + 8) : '';
}

function readHtmlTable(table: string, valid: boolean): RedemptionCode[] {
  return [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].flatMap((row) => {
    const cells = [...row[1]!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) =>
      plainText(cell[1]!),
    );
    const code = cells[0]?.replaceAll(' ', '').toUpperCase();
    if (!code || !/^[A-Z0-9_-]{3,64}$/.test(code)) return [];
    return [
      {
        code,
        reward: cells[1] || null,
        description: null,
        valid,
        used: false,
        startTime: null,
        endTime: /permanent|永久/i.test(cells[2] ?? '') ? null : cells[2] || null,
      },
    ];
  });
}

function readWikiCodes(wikitext: string, valid: boolean): RedemptionCode[] {
  return [
    ...wikitext.matchAll(
      /\|<code>([A-Za-z0-9_-]{3,64})<\/code>\|\|([^|\n]+)\|\|\{\{Card List\|([^|}]*)[^\n]*[\s\S]*?Valid until:\s*([^'<\n]+)/g,
    ),
  ].map((match) => ({
    code: match[1]!.toUpperCase(),
    description: `适用服务器：${match[2]!.trim()}`,
    reward: match[3]!.replaceAll('*', ' × ').replaceAll(';', '；').trim() || null,
    valid,
    used: false,
    startTime: null,
    endTime: /^Unknown/i.test(match[4]!.trim()) ? null : match[4]!.trim(),
  }));
}

function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&times;', '×')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueCodes(codes: RedemptionCode[]): RedemptionCode[] {
  return [...new Map(codes.map((item) => [item.code, item])).values()];
}

function resultValue(result: PromiseSettledResult<RedemptionCode[]>): RedemptionCode[] {
  return result.status === 'fulfilled' ? result.value : [];
}

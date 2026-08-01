import type { GachaRecord } from '@wwbox/contracts';

const POOLS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];
export class GachaImportService {
  async fetch(url: string): Promise<{ playerId: string; records: GachaRecord[] }> {
    const params = parseConveneParams(url);
    const playerId = params['playerId'];
    if (!playerId || !/^\d{5,20}$/.test(playerId)) throw new Error('GACHA_URL_INVALID');
    const endpoint = playerId.startsWith('1')
      ? 'https://gmserver-api.aki-game2.com/gacha/record/query'
      : 'https://gmserver-api.aki-game2.net/gacha/record/query';
    const records: GachaRecord[] = [];
    for (const poolType of POOLS) {
      const response = await fetch(endpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...params, cardPoolType: poolType }),
      });
      if (!response.ok) throw new Error('GACHA_REQUEST_FAILED');
      const body: unknown = await response.json();
      records.push(...readRecords(body, playerId, poolType));
    }
    return { playerId, records };
  }
}
export function parseConveneParams(url: string): Record<string, string> {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new Error('GACHA_URL_INVALID');
  }
  const query =
    parsed.search ||
    (parsed.hash.includes('?') ? `?${parsed.hash.split('?').slice(1).join('?')}` : '');
  const source = new URLSearchParams(query);
  const aliases: Record<string, string> = {
    player_id: 'playerId',
    record_id: 'recordId',
    resources_id: 'cardPoolId',
    gacha_type: 'cardPoolType',
    svr_id: 'serverId',
    lang: 'languageCode',
  };
  const params: Record<string, string> = {};
  for (const [key, value] of source) params[aliases[key] ?? key] = value;
  return params;
}
function readRecords(body: unknown, playerId: string, poolType: string): GachaRecord[] {
  if (!body || typeof body !== 'object') return [];
  const data = (body as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data.flatMap((raw, index): GachaRecord[] => {
    if (!raw || typeof raw !== 'object') return [];
    const r = raw as Record<string, unknown>;
    if (
      typeof r['name'] !== 'string' ||
      typeof r['time'] !== 'string' ||
      typeof r['qualityLevel'] !== 'number'
    )
      return [];
    return [
      {
        recordId: String(
          r['recordId'] ??
            r['id'] ??
            `${poolType}|${r['time']}|${r['resourceId'] ?? 0}|${r['name']}|${index}`,
        ).slice(0, 160),
        recordOrder: index,
        playerId,
        poolType: String(r['cardPoolType'] ?? poolType),
        resourceId: numericId(r['resourceId']),
        qualityLevel: r['qualityLevel'],
        resourceType: typeof r['resourceType'] === 'string' ? r['resourceType'] : 'unknown',
        name: r['name'].slice(0, 100),
        time: r['time'].slice(0, 32),
      },
    ];
  });
}

function numericId(value: unknown): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

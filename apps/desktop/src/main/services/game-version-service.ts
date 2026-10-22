import type {
  GameInstallation,
  GameRegion,
  GameVersionState,
  GameVersionStatus,
} from '@wwbox/contracts';

const INDEX_URLS: Record<Exclude<GameRegion, 'unknown'>, string> = {
  cn: 'https://prod-cn-alicdn-gamestarter.kurogame.com/launcher/game/G152/10003_Y8xXrXk65DqFHEDgApn3cpK5lfczpFx5/index.json',
  global:
    'https://prod-alicdn-gamestarter.kurogame.com/launcher/game/G153/50004_obOHXFrFanqsaIEOmuKroCcbZkQRBC7c/index.json',
  bilibili:
    'https://prod-cn-alicdn-gamestarter.kurogame.com/launcher/game/G152/10004_j5GWFuUFlb8N31Wi2uS3ZAVHcb7ZGN7y/index.json',
  wegame:
    'https://prod-cn-alicdn-gamestarter.kurogame.com/launcher/game/G152/10003_Y8xXrXk65DqFHEDgApn3cpK5lfczpFx5/index.json',
};

interface LauncherIndex {
  version?: unknown;
  config?: { version?: unknown };
}

interface CacheEntry {
  version: string;
  expiresAt: number;
}

export class GameVersionService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly fetcher: typeof fetch = globalThis.fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async check(installation: GameInstallation): Promise<GameVersionState> {
    const checkedAt = new Date(this.now()).toISOString();
    if (installation.region === 'unknown') return unknownState(installation, checkedAt);

    try {
      const remoteVersion = await this.getRemoteVersion(INDEX_URLS[installation.region]);
      return {
        installationId: installation.id,
        localVersion: installation.localVersion,
        remoteVersion,
        status: compareVersions(installation.localVersion, remoteVersion),
        checkedAt,
      };
    } catch {
      return unknownState(installation, checkedAt);
    }
  }

  private async getRemoteVersion(url: string): Promise<string> {
    const cached = this.cache.get(url);
    if (cached && cached.expiresAt > this.now()) return cached.version;

    const response = await this.fetcher(url, {
      headers: { Accept: 'application/json' },
      redirect: 'follow',
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`REMOTE_VERSION_HTTP_${response.status}`);
    const data = (await response.json()) as { default?: LauncherIndex };
    const version = readLauncherVersion(data.default);
    if (version === null) throw new Error('REMOTE_VERSION_INVALID');
    this.cache.set(url, { version, expiresAt: this.now() + 5 * 60 * 1_000 });
    return version;
  }
}

/**
 * 启动器索引里 config.version 是当前分发的客户端资源包版本，
 * 与 Helper 从 launcherDownloadConfig.json 读取的 bundles.*.version 同源；
 * 顶层 version 作为旧版结构或缺失时的回退值。
 */
function readLauncherVersion(index: LauncherIndex | undefined): string | null {
  const candidates = [index?.config?.version, index?.version];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && /^\d+(?:\.\d+){1,3}$/.test(candidate)) return candidate;
  }
  return null;
}

export function compareVersions(
  localVersion: string | null,
  remoteVersion: string,
): GameVersionStatus {
  if (!localVersion || !/^\d+(?:\.\d+){1,3}$/.test(localVersion)) return 'unknown';
  const local = localVersion.split('.').map(Number);
  const remote = remoteVersion.split('.').map(Number);
  const length = Math.max(local.length, remote.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (local[index] ?? 0) - (remote[index] ?? 0);
    if (difference < 0) return 'updateAvailable';
    if (difference > 0) return 'localNewer';
  }
  return 'latest';
}

function unknownState(installation: GameInstallation, checkedAt: string): GameVersionState {
  return {
    installationId: installation.id,
    localVersion: installation.localVersion,
    remoteVersion: null,
    status: 'unknown',
    checkedAt,
  };
}

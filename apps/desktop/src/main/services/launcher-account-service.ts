import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import type { AccountRegion, LauncherAccount } from '@wwbox/contracts';

interface CachedUser {
  cuid?: unknown;
  oauthCode?: unknown;
  phone?: unknown;
  email?: unknown;
  thirdNickName?: unknown;
  username?: unknown;
}
interface SecretAccount {
  account: LauncherAccount;
  oauthCode: string;
  gameUserCachePath: string;
  raw: CachedUser;
}

const AVATAR_RESOURCE_ROOTS = [
  'https://raw.githubusercontent.com/leck995/WutheringWavesToolResources/main/assets/header',
  'https://cdn.jsdelivr.net/gh/leck995/WutheringWavesToolResources@main/assets/header',
];

export class LauncherAccountService {
  private readonly accounts = new Map<string, SecretAccount>();

  async scan(
    appData: string,
    appPath = process.cwd(),
    avatarCachePath = join(appData, '@wwbox', 'desktop', 'gacha-images'),
  ): Promise<LauncherAccount[]> {
    this.accounts.clear();
    this.readRegion(join(appData, 'KR_G152'), 'cn');
    this.readRegion(join(appData, 'KR_G153'), 'global');
    const results: LauncherAccount[] = [];
    for (const entry of this.accounts.values())
      results.push(await this.query(entry, appPath, avatarCachePath));
    return results;
  }

  private readRegion(parent: string, region: AccountRegion): void {
    let directories: string[];
    try {
      directories = readdirSync(parent, { withFileTypes: true })
        .filter((item) => item.isDirectory())
        .map((item) => item.name);
    } catch {
      return;
    }
    for (const directory of directories) {
      try {
        const parsed: unknown = JSON.parse(
          readFileSync(join(parent, directory, 'KRSDKUserLauncherCache.json'), 'utf8'),
        );
        if (!Array.isArray(parsed)) continue;
        const cachePath = join(parent, directory, 'KRSDKUserLauncherCache.json');
        for (const raw of parsed) this.add(raw as CachedUser, region, cachePath);
      } catch {
        /* Ignore malformed or concurrently updated launcher caches. */
      }
    }
  }

  private add(raw: CachedUser, region: AccountRegion, cachePath: string): void {
    if (
      typeof raw.oauthCode !== 'string' ||
      raw.oauthCode.length < 2 ||
      raw.oauthCode.length > 4096
    )
      return;
    const oauthCode = xor5(raw.oauthCode);
    const cuid = typeof raw.cuid === 'string' ? raw.cuid : '';
    const labelSource = [raw.thirdNickName, raw.username, raw.phone, raw.email].find(
      (value) => typeof value === 'string' && value.length > 0,
    );
    const label = maskLabel(
      typeof labelSource === 'string' ? labelSource : `启动器账号 ${this.accounts.size + 1}`,
    );
    const id = createHash('sha256')
      .update(`${region}:${cuid}:${oauthCode}`)
      .digest('hex')
      .slice(0, 24);
    this.accounts.set(id, {
      oauthCode,
      gameUserCachePath: join(dirname(cachePath), 'KRSDKUserCache.json'),
      raw,
      account: {
        id,
        label,
        region,
        roleId: null,
        roleName: null,
        avatarUrl: null,
        level: null,
        energy: null,
        maxEnergy: null,
        energyRecoverTime: null,
        liveness: null,
        maxLiveness: null,
        activeDays: null,
        worldLevel: null,
        roleCount: null,
        soundBox: null,
        storeEnergy: null,
        maxStoreEnergy: null,
        weeklyRemaining: null,
        weeklyTravelScore: null,
        battlePassLevel: null,
        battlePassExp: null,
        battlePassExpLimit: null,
        battlePassWeekExp: null,
        battlePassWeekMaxExp: null,
        motorLevel: null,
        motorExp: null,
        motorNextExp: null,
        boxes: {},
        errorCode: null,
      },
    });
  }

  activate(accountId: string): void {
    const selected = this.accounts.get(accountId);
    if (!selected) throw new Error('LAUNCHER_ACCOUNT_NOT_FOUND');
    const selectedCuid = stringValue(selected.raw.cuid);
    activateGameUserCache(selected.gameUserCachePath, selectedCuid);
  }

  private async query(
    entry: SecretAccount,
    appPath: string,
    avatarCachePath: string,
  ): Promise<LauncherAccount> {
    try {
      const host =
        entry.account.region === 'cn'
          ? 'https://pc-launcher-sdk-api.kurogame.com'
          : 'https://pc-launcher-sdk-api.kurogame.net';
      const infoBody = await postJson(`${host}/game/queryPlayerInfo`, {
        oauthCode: entry.oauthCode,
      });
      const info = unwrapFirstPlayer(infoBody);
      if (!info) return { ...entry.account, errorCode: 'ACCOUNT_TOKEN_EXPIRED' };
      const roleId = stringValue(info['roleId']);
      const regionKey = roleRegion(roleId);
      if (!roleId || !regionKey) return { ...entry.account, errorCode: 'ACCOUNT_ROLE_NOT_FOUND' };
      const roleBody = await postJson(`${host}/game/queryRole`, {
        oauthCode: entry.oauthCode,
        playerId: roleId,
        region: regionKey,
      });
      const role = unwrapNamedPlayer(roleBody, regionKey);
      const base = objectValue(role?.['Base']);
      const battlePass = objectValue(role?.['BattlePass']);
      const motor = objectValue(role?.['MotorData']);
      const weeklyFrame =
        objectValue(role?.['WeeklyFrameData']) ?? objectValue(base?.['WeeklyFrameData']);
      const avatarUrl = await imageDataUrl(
        stringValue(info['headPhoto']),
        appPath,
        avatarCachePath,
      );
      return {
        ...entry.account,
        roleId,
        roleName: stringValue(info['roleName']) ?? stringValue(base?.['Name']),
        avatarUrl,
        level: numberValue(info['level']) ?? numberValue(base?.['Level']),
        energy: numberValue(base?.['Energy']),
        maxEnergy: numberValue(base?.['MaxEnergy']),
        energyRecoverTime: numberValue(base?.['EnergyRecoverTime']),
        liveness: numberValue(base?.['Liveness']),
        maxLiveness: numberValue(base?.['LivenessMaxCount']),
        activeDays: numberValue(base?.['ActiveDays']),
        worldLevel: numberValue(base?.['WorldLevel']),
        roleCount: numberValue(base?.['RoleNum']),
        soundBox: numberValue(base?.['SoundBox']),
        storeEnergy: numberValue(base?.['StoreEnergy']),
        maxStoreEnergy: numberValue(base?.['MaxStoreEnergy']),
        weeklyRemaining: numberValue(base?.['WeeklyInstCount']),
        weeklyTravelScore:
          numberValue(weeklyFrame?.['Cur']) ??
          numberValue(weeklyFrame?.['Score']) ??
          numberValue(role?.['RougeScore']) ??
          numberValue(base?.['RougeScore']),
        battlePassLevel: numberValue(battlePass?.['Level']),
        battlePassExp: numberValue(battlePass?.['Exp']),
        battlePassExpLimit: numberValue(battlePass?.['ExpLimit']),
        battlePassWeekExp: numberValue(battlePass?.['WeekExp']),
        battlePassWeekMaxExp: numberValue(battlePass?.['WeekMaxExp']),
        motorLevel: numberValue(motor?.['Level']),
        motorExp: numberValue(motor?.['Exp']),
        motorNextExp: numberValue(motor?.['NextExp']),
        boxes: numberRecord(base?.['Boxes']),
        errorCode: null,
      };
    } catch {
      return { ...entry.account, errorCode: 'ACCOUNT_QUERY_FAILED' };
    }
  }
}

export function activateGameUserCache(path: string, selectedCuid: string | null): void {
  if (!selectedCuid) throw new Error('GAME_ACCOUNT_ID_MISSING');
  let cache: Record<string, unknown>;
  try {
    const decoded = xorBytes(readFileSync(path), 9).toString('utf8');
    cache = objectValue(JSON.parse(decoded)) ?? {};
  } catch {
    throw new Error('GAME_ACCOUNT_CACHE_UNAVAILABLE');
  }
  const accounts = cache['account_list'];
  if (!Array.isArray(accounts)) throw new Error('GAME_ACCOUNT_CACHE_INVALID');
  const selected = accounts.find(
    (account) => stringValue(objectValue(account)?.['cuid']) === selectedCuid,
  );
  if (!selected) throw new Error('GAME_ACCOUNT_NOT_FOUND');
  cache['last_login_cuid'] = selectedCuid;
  cache['account_list'] = [selected, ...accounts.filter((account) => account !== selected)];
  try {
    const encoded = xorBytes(Buffer.from(JSON.stringify(cache), 'utf8'), 9);
    writeFileSync(path, encoded);
  } catch {
    throw new Error('GAME_ACCOUNT_CACHE_WRITE_FAILED');
  }
}

export function xorBytes(value: Uint8Array, key: number): Buffer {
  const result = Buffer.alloc(value.byteLength);
  for (let index = 0; index < value.byteLength; index += 1) {
    result[index] = (value[index] ?? 0) ^ key;
  }
  return result;
}

async function imageDataUrl(
  value: string | null,
  appPath: string,
  avatarCachePath: string,
): Promise<string | null> {
  if (!value) return null;
  const avatarId = avatarResourceId(value);
  if (avatarId) {
    for (const directory of [
      avatarCachePath,
      join(appPath, 'assets', 'header'),
      join(process.cwd(), 'assets', 'header'),
      join(process.resourcesPath, 'assets', 'header'),
    ]) {
      for (const extension of ['.png', '.webp', '.jpg', '.jpeg']) {
        try {
          const path = join(directory, `${avatarId}${extension}`);
          const bytes = readFileSync(path);
          if (bytes.byteLength > 5 * 1024 * 1024) continue;
          const mime =
            extension === '.jpg' || extension === '.jpeg'
              ? 'image/jpeg'
              : `image/${extname(path).slice(1)}`;
          return `data:${mime};base64,${bytes.toString('base64')}`;
        } catch {
          // The optional local avatar resource pack may not contain every avatar.
        }
      }
    }
    for (const root of AVATAR_RESOURCE_ROOTS) {
      const image = await remoteImageDataUrl(`${root}/${avatarId}.png`);
      if (!image) continue;
      try {
        mkdirSync(avatarCachePath, { recursive: true });
        writeFileSync(
          join(avatarCachePath, `${avatarId}.png`),
          Buffer.from(image.slice(image.indexOf(',') + 1), 'base64'),
        );
      } catch {
        // A read-only cache directory must not prevent the avatar from being displayed.
      }
      return image;
    }
    return null;
  }
  if (!/^https:\/\//i.test(value)) return null;
  return remoteImageDataUrl(value);
}

export function avatarResourceId(value: string): string | null {
  const normalized = value.trim();
  if (/^Role\d+$/i.test(normalized)) return normalized.slice(4);
  if (/^\d{8}$/.test(normalized)) return normalized.slice(4);
  return /^(?:Role[_-]?)?(\d{3,6})$/i.exec(normalized)?.[1] ?? null;
}

async function remoteImageDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 5 * 1024 * 1024) return null;
    const mime = response.headers.get('content-type')?.split(';')[0] || 'image/png';
    return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
  } catch {
    return null;
  }
}

async function postJson(url: string, body: object): Promise<unknown> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error('ACCOUNT_QUERY_FAILED');
    const result: unknown = await response.json();
    if (numberValue(objectValue(result)?.['code']) !== 1005) return result;
    if (attempt < 4) await delay(500);
  }
  throw new Error('ACCOUNT_QUERY_RETRY_EXHAUSTED');
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
function unwrapFirstPlayer(body: unknown): Record<string, unknown> | null {
  const data = objectValue(objectValue(body)?.['data']);
  if (!data) return null;
  const value = Object.values(data)[0];
  return parseEmbedded(value);
}
function unwrapNamedPlayer(body: unknown, key: string): Record<string, unknown> | null {
  return parseEmbedded(objectValue(objectValue(body)?.['data'])?.[key]);
}
function parseEmbedded(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      return objectValue(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return objectValue(value);
}
function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 100
    ? value
    : typeof value === 'number'
      ? String(value)
      : null;
}
function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function numberRecord(value: unknown): Record<string, number> {
  const source = objectValue(value);
  if (!source) return {};
  return Object.fromEntries(
    Object.entries(source).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === 'number' && Number.isFinite(entry[1]),
    ),
  );
}
function roleRegion(id: string | null): string | null {
  return id?.startsWith('1')
    ? 'China'
    : id?.startsWith('6')
      ? 'Eu'
      : id?.startsWith('7')
        ? 'Asia'
        : id?.startsWith('8')
          ? 'HMT'
          : id?.startsWith('9')
            ? 'SEA'
            : null;
}
export function xor5(value: string): string {
  return [...value].map((character) => String.fromCharCode(character.charCodeAt(0) ^ 5)).join('');
}
export function maskLabel(value: string): string {
  if (value.includes('@')) {
    const [name, domain] = value.split('@');
    return `${name?.slice(0, 2)}***@${domain}`;
  }
  if (/^\d{7,}$/.test(value)) return `${value.slice(0, 3)}****${value.slice(-2)}`;
  return value.slice(0, 40);
}

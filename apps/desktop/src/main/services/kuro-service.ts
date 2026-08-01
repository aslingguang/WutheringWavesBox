import type {
  KuroAccount,
  KuroCalculationInput,
  KuroDashboard,
  KuroHomeWidget,
  KuroGameRole,
  KuroLoginInput,
  KuroOperationResult,
  KuroResourceBriefing,
  KuroRetroEligibility,
  KuroResourceItem,
  KuroResourcePeriod,
  KuroResourcePeriodType,
  KuroRoleArtwork,
  KuroSmsInput,
  UpdateKuroAccountInput,
} from '@wwbox/contracts';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { KuroRepository } from './kuro-repository';

const API = 'https://api.kurobbs.com';
const GAME_ID = '3';
const SERVER_ID = '76402e5b20be2c39f095a152090afddc';
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 KuroGameBox/3.1.3';
const SMS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) KuroGameBox/3.1.3';

type SecretCodec = { encrypt(value: string): string; decrypt(value: string): string };
type ApiEnvelope = {
  code?: number;
  success?: boolean;
  msg?: string;
  message?: string;
  data?: unknown;
};

export class KuroService {
  private readonly roleArtworkCache = new Map<string, KuroRoleArtwork>();
  private readonly roleDetailCache = new Map<
    string,
    { expires: number; value: Record<string, unknown> }
  >();
  private readonly roleCultivateCache = new Map<
    string,
    { expires: number; value: Record<string, unknown> }
  >();
  private wikiRoleCatalog:
    | {
        expires: number;
        records: Array<{ name: string; entryId: string; order: number; iconUrl: string }>;
      }
    | undefined;
  private readonly cache = new Map<string, { expires: number; value: KuroDashboard }>();
  private readonly homeWidgetCache = new Map<
    string,
    { expires: number; value: KuroHomeWidget | null }
  >();
  private readonly accessTokens = new Map<string, { expires: number; value: string }>();
  private readonly phantomWeights = new Map<number, Record<string, number>>();
  constructor(
    private readonly repository: KuroRepository,
    private readonly secrets: SecretCodec,
    private readonly artworkCacheDirectory?: string,
    private readonly encodeImage?: (source: Buffer, maxDimension?: number) => Buffer,
  ) {
    this.loadArtworkCache();
  }

  listAccounts(): KuroAccount[] {
    return this.repository.list();
  }

  async roleAvatarUrls(
    resources: Array<{ resourceId: number; name: string }>,
  ): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    if (!resources.length) return result;
    for (const account of this.repository.list()) {
      try {
        const dashboard = await this.dashboard(account.id);
        const roles = this.findArrayByKeys(dashboard.calculator?.roles, [
          'roleList',
          'roles',
          'list',
        ]).map((value) => this.asRecord(value));
        for (const resource of resources) {
          if (result[String(resource.resourceId)]) continue;
          const role = roles.find(
            (item) =>
              Number(item.roleId ?? item.id ?? item.cardRoleId) === resource.resourceId ||
              String(item.roleName ?? item.name ?? '').trim() === resource.name.trim(),
          );
          if (!role) continue;
          const url = ['iconUrl', 'icon', 'roleIconUrl', 'roleIcon', 'picUrl', 'imageUrl']
            .map((key) => role[key])
            .find((value) => typeof value === 'string' && /^https:\/\//i.test(value));
          if (typeof url === 'string') result[String(resource.resourceId)] = url;
        }
      } catch {
        // Another configured account may still provide the official role catalogue.
      }
    }
    return result;
  }

  async sendSms(input: KuroSmsInput): Promise<KuroOperationResult> {
    if (!/^1[3-9]\d{9}$/.test(input.phone))
      return { success: false, message: '请输入正确的中国大陆手机号' };
    const body = new URLSearchParams({ mobile: input.phone, geeTestData: input.geeTestData ?? '' });
    const result = await this.request('/user/getSmsCodeForH5', {
      body,
      source: 'h5',
      version: '3.1.3',
      devcode: this.randomDevCode(),
      userAgent: SMS_UA,
    });
    const success = result.success === true || result.code === 0 || result.code === 200;
    return { success, message: this.message(result, success ? '验证码已发送' : '验证码发送失败') };
  }

  async login(input: KuroLoginInput): Promise<KuroAccount> {
    let token = input.token?.trim() ?? '';
    let did = input.did?.trim() || crypto.randomUUID().replaceAll('-', '');
    let accountName = '';
    if (input.method === 'sms') {
      const phone = input.phone?.trim() ?? '';
      const code = input.code?.trim() ?? '';
      if (!/^1[3-9]\d{9}$/.test(phone) || !/^\d{4,8}$/.test(code))
        throw new Error('手机号或验证码格式不正确');
      did = crypto.randomUUID().replaceAll('-', '');
      const devcode = this.randomDevCode();
      const result = await this.request(
        `/user/sdkLogin?${new URLSearchParams({ code, mobile: phone, devCode: did })}`,
        { source: 'android', devcode, did },
      );
      this.assertSuccess(result, '登录失败');
      const loginData = this.asRecord(result.data);
      token = (loginData.token as string) ?? '';
      accountName = String(loginData.userName ?? loginData.nickName ?? loginData.nickname ?? '');
    }
    if (token.length < 10) throw new Error('Token 格式不正确');
    const roles = await this.fetchRoles(token);
    if (!roles.length) throw new Error('未找到已绑定的鸣潮角色，请先在库街区绑定游戏账号');
    accountName ||= roles[0]?.roleName ?? `库街区用户${roles[0]?.userId ?? ''}`;
    const account = this.repository.save(
      accountName,
      input.remark?.trim() || null,
      input.method,
      input.method === 'sms' ? this.maskPhone(input.phone!) : null,
      this.secrets.encrypt(token),
      this.secrets.encrypt(did),
      roles,
    );
    this.homeWidgetCache.clear();
    return account;
  }

  async update(input: UpdateKuroAccountInput): Promise<KuroAccount> {
    const account = this.getAccount(input.accountId);
    const token = input.token?.trim() || this.token(account.id);
    const did = input.did?.trim() || this.did(account.id);
    if (token.length < 10 || did.length < 8) throw new Error('Token 或 Did 格式不正确');
    const roles = await this.fetchRoles(token);
    const updated =
      this.repository.updateCredentials(
        account.id,
        roles[0]?.roleName ?? account.accountName,
        input.remark?.trim() || null,
        this.secrets.encrypt(token),
        this.secrets.encrypt(did),
        roles,
      ) ?? this.notFound();
    this.homeWidgetCache.clear();
    return updated;
  }

  activate(id: string): KuroAccount {
    return this.repository.activate(id) ?? this.notFound();
  }
  remove(id: string): void {
    this.repository.remove(id);
    this.cache.delete(id);
    this.clearAccessTokens(id);
    this.homeWidgetCache.clear();
  }
  selectRole(id: string, roleId: string): KuroAccount {
    return this.repository.selectRole(id, roleId) ?? this.notFound();
  }
  setAutoSign(id: string, enabled: boolean): KuroAccount {
    return this.repository.setAutoSign(id, enabled) ?? this.notFound();
  }
  setAllAutoSign(enabled: boolean): KuroAccount[] {
    return this.repository.setAllAutoSign(enabled);
  }
  setAutoRetroSign(id: string, enabled: boolean): KuroAccount {
    return this.repository.setAutoRetroSign(id, enabled) ?? this.notFound();
  }
  setAllAutoRetroSign(enabled: boolean): KuroAccount[] {
    return this.repository.setAllAutoRetroSign(enabled);
  }

  async refreshRoles(id: string): Promise<KuroAccount> {
    const account = this.getAccount(id);
    const roles = await this.fetchRoles(this.token(id));
    const updated =
      this.repository.updateCredentials(
        id,
        roles[0]?.roleName ?? account.accountName,
        account.remark,
        this.repository.getSecret(id)!,
        this.repository.getDidSecret(id)!,
        roles,
      ) ?? this.notFound();
    this.homeWidgetCache.clear();
    return updated;
  }

  async roleDetail(
    accountId: string,
    roleId: string,
    cardRoleId: number,
  ): Promise<Record<string, unknown>> {
    const detailCacheKey = `${accountId}:${roleId}:${cardRoleId}`;
    const cachedDetail = this.roleDetailCache.get(detailCacheKey);
    if (cachedDetail && cachedDetail.expires > Date.now()) return cachedDetail.value;
    const account = this.getAccount(accountId);
    const role = account.roles.find((item) => item.roleId === roleId) ?? this.role(account);
    const token = this.token(account.id);
    const did = this.did(account.id);
    const requestDetail = async (bat: string): Promise<ApiEnvelope> => {
      const body = new FormData();
      body.set('serverId', SERVER_ID);
      body.set('roleId', role.roleId);
      body.set('gameId', GAME_ID);
      body.set('id', String(cardRoleId));
      body.set('channelId', '19');
      body.set('countryCode', '1');
      const response = await fetch(`${API}/aki/roleBox/akiBox/getRoleDetail`, {
        method: 'POST',
        signal: AbortSignal.timeout(20_000),
        headers: {
          accept: 'application/json, text/plain, */*',
          'user-agent': UA,
          source: 'android',
          did,
          devcode: did,
          'b-at': bat,
        },
        body,
      });
      return this.readEnvelope(response, '角色详情获取失败');
    };

    const accessTokenKey = this.accessTokenKey(account.id, role.roleId);
    let result = await requestDetail(await this.getAccessToken(account.id, role, token, did));
    if (this.isDataTokenExpired(result)) {
      this.accessTokens.delete(accessTokenKey);
      result = await requestDetail(await this.getAccessToken(account.id, role, token, did));
    }
    const resultMessage = this.message(result, '');
    if (/验证|captcha|安全校验|人机/.test(resultMessage))
      throw new Error('需要完成安全验证，请打开“手机视图”的“数据终端”完成验证后重试');
    if (!(result.code === 10902 || result.code === 200 || result.success === true))
      this.assertSuccess(result, '角色详情获取失败');
    let detail: Record<string, unknown>;
    if (typeof result.data === 'string') {
      const parsed: unknown = JSON.parse(result.data);
      detail = this.asRecord(parsed);
    } else detail = this.asRecord(result.data);
    const weights = await this.getPhantomWeights(cardRoleId);
    if (weights) detail.phantomWeights = weights;
    this.roleDetailCache.set(detailCacheKey, {
      expires: Date.now() + 10 * 60_000,
      value: detail,
    });
    return detail;
  }

  async roleCultivateStatus(
    accountId: string,
    roleId: string,
    cardRoleId: number,
  ): Promise<Record<string, unknown>> {
    const cacheKey = `${accountId}:${roleId}:${cardRoleId}`;
    const cached = this.roleCultivateCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return cached.value;
    const account = this.getAccount(accountId);
    const role = account.roles.find((item) => item.roleId === roleId) ?? this.role(account);
    const token = this.token(account.id);
    const did = this.did(account.id);
    const query = new URLSearchParams({
      userId: role.userId,
      serverId: SERVER_ID,
      roleId: role.roleId,
      ids: String(cardRoleId),
    });
    const result = await this.request(`/aki/calculator/roleCultivateStatus?${query}`, {
      token,
      did,
      devcode: did,
      bat: await this.getAccessToken(account.id, role, token, did),
      method: 'POST',
    });
    this.assertSuccess(result, '角色养成状态获取失败');
    let payload: unknown = result.data;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload) as unknown;
      } catch {
        payload = null;
      }
    }
    const payloadRecord = this.asRecord(payload);
    const source = Array.isArray(payload)
      ? payload
      : Array.isArray(payloadRecord.list)
        ? (payloadRecord.list as unknown[])
        : Array.isArray(payloadRecord.roleList)
          ? (payloadRecord.roleList as unknown[])
          : Object.keys(payloadRecord).length
            ? [payloadRecord]
            : [];
    const status = this.asRecord(
      source.find(
        (item) => Number(this.asRecord(item).roleId ?? this.asRecord(item).roleID) === cardRoleId,
      ) ?? source[0],
    );
    if (!Object.keys(status).length) throw new Error('角色养成状态为空');
    this.roleCultivateCache.set(cacheKey, {
      expires: Date.now() + 10 * 60_000,
      value: status,
    });
    return status;
  }

  async roleArtworks(
    roles: Array<{ id: number; name: string; icon?: string; element?: string }>,
    options: { useCardThumbnail: boolean; cardResolution: number } = {
      useCardThumbnail: true,
      cardResolution: 512,
    },
  ): Promise<Record<string, KuroRoleArtwork>> {
    const cardResolution = Math.max(128, Math.min(2048, Math.round(options.cardResolution)));
    const unique = [
      ...new Map(
        roles
          .filter((role) => Number.isInteger(role.id) && role.id > 0 && role.name.trim())
          .map((role) => [
            role.id,
            {
              id: role.id,
              name: role.name.trim(),
              icon: role.icon?.trim() ?? '',
              element: role.element?.trim() ?? '',
            },
          ]),
      ).values(),
    ].slice(0, 100);
    const cachedArtworks = Object.fromEntries(
      unique.flatMap((role) => {
        const artwork = this.roleArtworkCache.get(String(role.id));
        const iconFile = this.urlFileName(role.icon);
        const sourceKey = this.roleArtworkSourceKey(role.id, role.name, role.element, iconFile);
        return artwork?.wikiEntryId &&
          artwork.fullBody &&
          artwork.sourceIconKey === sourceKey &&
          (!options.useCardThumbnail ||
            (artwork.cardThumbnail && artwork.cardResolution === cardResolution))
          ? [[String(role.id), artwork]]
          : [];
      }),
    );
    if (Object.keys(cachedArtworks).length === unique.length) return cachedArtworks;

    const catalog = await this.getWikiRoleCatalog();
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < unique.length) {
        const role = unique[cursor++];
        if (!role) continue;
        const normalized = this.normalizeRoleName(role.name);
        const gender = this.roleGender(role.id, role.name);
        const element = this.roleElement(role.element || role.name);
        const iconFile = this.urlFileName(role.icon);
        const candidates = catalog.filter(
          (item) => this.normalizeRoleName(item.name) === normalized,
        );
        const roverRecord =
          normalized === '漂泊者'
            ? candidates.find(
                (item) =>
                  (!gender || this.roleGender(0, item.name) === gender) &&
                  (!element || this.roleElement(item.name) === element),
              )
            : undefined;
        const record =
          roverRecord ??
          catalog.find((item) => iconFile && this.urlFileName(item.iconUrl) === iconFile) ??
          candidates.find((item) => !gender || this.roleGender(0, item.name) === gender) ??
          candidates[0];
        if (!record) continue;
        const cached = this.roleArtworkCache.get(String(role.id));
        const sourceIconKey = this.roleArtworkSourceKey(
          role.id,
          role.name,
          role.element,
          iconFile || this.urlFileName(record.iconUrl),
        );
        if (
          cached?.wikiEntryId === record.entryId &&
          cached.sourceIconKey === sourceIconKey &&
          cached.thumbnail &&
          (!this.artworkCacheDirectory ||
            !this.encodeImage ||
            cached.thumbnail.endsWith('-icon-original.png'))
        ) {
          if (options.useCardThumbnail) {
            const cardThumbnail = await this.cacheCardArtwork(role.id, cardResolution);
            this.roleArtworkCache.set(String(role.id), {
              ...cached,
              cardThumbnail,
              cardResolution,
            });
            this.saveArtworkCache();
          }
          continue;
        }
        try {
          const entry = await this.wikiRequest('/wiki/core/catalogue/item/getEntryDetail', {
            id: record.entryId,
          });
          const figures = this.findWikiRoleFigures(this.asRecord(entry.data));
          const fullBodyRemote = String(this.asRecord(figures[0]).url ?? '');
          const second = this.asRecord(figures[1]);
          const teamRemote = String(second.url ?? second.verticalFigureUrl ?? '');
          if (fullBodyRemote) {
            const fullBody = await this.cacheArtwork(
              role.id,
              'full',
              fullBodyRemote,
              Boolean(cached),
            );
            const team = teamRemote
              ? await this.cacheArtwork(role.id, 'team', teamRemote, Boolean(cached))
              : fullBody;
            const thumbnail = role.icon
              ? await this.cacheRoleThumbnail(role.id, role.icon, Boolean(cached))
              : cached?.thumbnail;
            const cardThumbnail = options.useCardThumbnail
              ? await this.cacheCardArtwork(role.id, cardResolution)
              : undefined;
            this.roleArtworkCache.set(String(role.id), {
              fullBody,
              team,
              ...(thumbnail ? { thumbnail } : {}),
              ...(cardThumbnail ? { cardThumbnail, cardResolution } : {}),
              order: record.order,
              wikiEntryId: record.entryId,
              sourceIconKey,
            });
            this.saveArtworkCache();
          }
        } catch {
          // A single Wiki entry must not make the remaining character catalog unusable.
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, unique.length) }, worker));
    return Object.fromEntries(
      unique.flatMap((role) => {
        const artwork = this.roleArtworkCache.get(String(role.id));
        return artwork ? [[String(role.id), artwork]] : [];
      }),
    );
  }

  private async getWikiRoleCatalog(): Promise<
    Array<{ name: string; entryId: string; order: number; iconUrl: string }>
  > {
    if (this.wikiRoleCatalog && this.wikiRoleCatalog.expires > Date.now())
      return this.wikiRoleCatalog.records;
    const result = await this.wikiRequest('/wiki/core/catalogue/item/getPage', {
      catalogueId: '1105',
      page: '1',
      limit: '1000',
    });
    const rawRecords = this.asRecord(this.asRecord(result.data).results).records;
    const records = (Array.isArray(rawRecords) ? rawRecords : []).flatMap((value, order) => {
      const record = this.asRecord(value);
      const content = this.asRecord(record.content);
      const name = String(record.name ?? content.title ?? '').trim();
      const entryId = String(
        this.asRecord(content.linkConfig).entryId ?? content.linkId ?? record.entryId ?? '',
      ).trim();
      const iconUrl = String(content.contentUrl ?? '').trim();
      return name && entryId ? [{ name, entryId, order, iconUrl }] : [];
    });
    this.wikiRoleCatalog = { expires: Date.now() + 6 * 60 * 60_000, records };
    return records;
  }

  private async wikiRequest(path: string, body: Record<string, string>): Promise<ApiEnvelope> {
    const response = await fetch(`${API}${path}`, {
      method: 'POST',
      signal: AbortSignal.timeout(20_000),
      headers: {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': UA,
        source: 'h5',
        wiki_type: '9',
        devcode: 'wwbox-wiki-artwork-cache',
      },
      body: new URLSearchParams(body),
    });
    if (!response.ok) throw new Error(`Wiki 数据获取失败（HTTP ${response.status}）`);
    const result = (await response.json()) as ApiEnvelope;
    if (result.code !== 200 && result.success !== true)
      throw new Error(this.message(result, 'Wiki 数据获取失败'));
    return result;
  }

  private findWikiRoleFigures(value: unknown): unknown[] {
    if (Array.isArray(value)) {
      for (const item of value) {
        const result = this.findWikiRoleFigures(item);
        if (result.length) return result;
      }
      return [];
    }
    const record = this.asRecord(value);
    const role = this.asRecord(record.role);
    const figures = Array.isArray(role.figures) ? role.figures : [];
    if (figures.length) return figures;
    for (const child of Object.values(record)) {
      const result = this.findWikiRoleFigures(child);
      if (result.length) return result;
    }
    return [];
  }

  private normalizeRoleName(value: string): string {
    return value
      .replace(/[·•\s]/g, '')
      .replace(/[（(][^）)]*(?:男|女|衍射|湮灭|导电|气动|热熔|冷凝)[^）)]*[）)]/g, '')
      .replace(/[-－]?(?:男|女|衍射|湮灭|导电|气动|热熔|冷凝)/g, '')
      .toLowerCase();
  }

  private roleGender(id: number, name: string): 'male' | 'female' | '' {
    if (/(^|[-－（(])男([－\-）)]|$)/.test(name)) return 'male';
    if (/(^|[-－（(])女([－\-）)]|$)/.test(name)) return 'female';
    // The official role catalogue uses separate IDs for every Rover gender/form.
    if ([1309, 1406, 1501, 1605].includes(id)) return 'male';
    if ([1310, 1408, 1502, 1604].includes(id)) return 'female';
    return '';
  }

  private roleElement(value: string): string {
    return value.match(/冷凝|热熔|导电|气动|衍射|湮灭/)?.[0] ?? '';
  }

  private roleArtworkSourceKey(
    id: number,
    name: string,
    element: string | undefined,
    iconFile: string,
  ): string {
    return [iconFile, this.roleGender(id, name), this.roleElement(element || name)].join('|');
  }

  private urlFileName(value: string | undefined): string {
    if (!value) return '';
    try {
      return new URL(value).pathname.split('/').pop()?.toLowerCase() ?? '';
    } catch {
      return value.split(/[\\/]/).pop()?.split('?')[0]?.toLowerCase() ?? '';
    }
  }

  private async cacheArtwork(
    id: number,
    kind: 'full' | 'team',
    url: string,
    refresh = false,
  ): Promise<string> {
    if (!this.artworkCacheDirectory) return url;
    mkdirSync(this.artworkCacheDirectory, { recursive: true });
    const fileName = `${id}-${kind}.png`;
    const filePath = join(this.artworkCacheDirectory, fileName);
    if (refresh || !existsSync(filePath)) {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(25_000),
        headers: { accept: 'image/avif,image/webp,image/png,image/*', 'user-agent': UA },
      });
      if (!response.ok) throw new Error(`角色图片下载失败（HTTP ${response.status}）`);
      writeFileSync(filePath, Buffer.from(await response.arrayBuffer()));
    }
    return `wwbox-art://role/${fileName}`;
  }

  private roleCountFromDashboard(value: Record<string, unknown> | null): number | null {
    const list = this.findArrayByKeys(value, ['roleList', 'roles', 'roleDataList']);
    if (!list.length) return null;
    const ids = new Set(
      list
        .map((item) => this.asRecord(item))
        .map((item) => String(item.roleId ?? item.id ?? item.cardRoleId ?? ''))
        .filter(Boolean),
    );
    return ids.size || null;
  }

  private findArrayByKeys(value: unknown, keys: string[]): unknown[] {
    if (!value || typeof value !== 'object') return [];
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findArrayByKeys(item, keys);
        if (found.length) return found;
      }
      return [];
    }
    const record = this.asRecord(value);
    for (const key of keys) if (Array.isArray(record[key])) return record[key] as unknown[];
    for (const child of Object.values(record)) {
      const found = this.findArrayByKeys(child, keys);
      if (found.length) return found;
    }
    return [];
  }

  private numberFromRecord(value: Record<string, unknown> | null, keys: string[]): number | null {
    if (!value) return null;
    for (const key of keys) {
      const candidate = Number(value[key]);
      if (Number.isFinite(candidate)) return candidate;
    }
    for (const child of Object.values(value)) {
      if (child && typeof child === 'object') {
        const found = this.numberFromRecord(this.asRecord(child), keys);
        if (found !== null) return found;
      }
    }
    return null;
  }

  private async cacheRoleThumbnail(id: number, url: string, refresh = false): Promise<string> {
    if (!this.artworkCacheDirectory || !this.encodeImage) return url;
    mkdirSync(this.artworkCacheDirectory, { recursive: true });
    const originalFileName = `${id}-icon-original.png`;
    const originalPath = join(this.artworkCacheDirectory, originalFileName);
    if (refresh || !existsSync(originalPath)) {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(25_000),
        headers: { accept: 'image/avif,image/webp,image/png,image/*', 'user-agent': UA },
      });
      if (!response.ok) throw new Error(`角色头像下载失败（HTTP ${response.status}）`);
      const source = Buffer.from(await response.arrayBuffer());
      writeFileSync(originalPath, this.encodeImage(source));
    }
    return `wwbox-art://role/${originalFileName}`;
  }

  private async cacheCardArtwork(id: number, resolution: number): Promise<string> {
    if (!this.artworkCacheDirectory || !this.encodeImage) return `wwbox-art://role/${id}-full.png`;
    const sourcePath = join(this.artworkCacheDirectory, `${id}-full.png`);
    if (!existsSync(sourcePath)) throw new Error('角色全身像缓存不存在');
    const fileName = `${id}-full-${resolution}.png`;
    const filePath = join(this.artworkCacheDirectory, fileName);
    if (!existsSync(filePath))
      writeFileSync(filePath, this.encodeImage(readFileSync(sourcePath), resolution));
    return `wwbox-art://role/${fileName}`;
  }

  private loadArtworkCache(): void {
    if (!this.artworkCacheDirectory) return;
    try {
      const parsed = JSON.parse(
        readFileSync(join(this.artworkCacheDirectory, 'index.json'), 'utf8'),
      ) as
        | Record<string, KuroRoleArtwork>
        | { version: number; artworks: Record<string, KuroRoleArtwork> };
      const version = 'version' in parsed ? Number(parsed.version) : 1;
      const raw = 'artworks' in parsed ? parsed.artworks : parsed;
      for (const [id, artwork] of Object.entries(raw)) {
        if (!artwork?.fullBody) continue;
        // Older cache versions did not remember which source icon selected the
        // male/female Wiki entry. Re-resolve them and overwrite stale images.
        this.roleArtworkCache.set(id, version < 10 ? { ...artwork, wikiEntryId: '' } : artwork);
      }
    } catch {
      // The cache index is optional and is rebuilt after the next successful Wiki request.
    }
  }

  private saveArtworkCache(): void {
    if (!this.artworkCacheDirectory) return;
    mkdirSync(this.artworkCacheDirectory, { recursive: true });
    writeFileSync(
      join(this.artworkCacheDirectory, 'index.json'),
      JSON.stringify({ version: 10, artworks: Object.fromEntries(this.roleArtworkCache) }, null, 2),
      'utf8',
    );
  }

  private async getPhantomWeights(roleId: number): Promise<Record<string, number> | null> {
    const cached = this.phantomWeights.get(roleId);
    if (cached) return cached;
    try {
      const response = await fetch(
        `https://raw.githubusercontent.com/leck995/WutheringWavesToolResources/main/assets/data/zh_CN/weight/default/${roleId}.json`,
        { signal: AbortSignal.timeout(8_000), headers: { 'user-agent': UA } },
      );
      if (!response.ok) return null;
      const encoded = (await response.text()).trim();
      const parsed = this.asRecord(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')));
      const source = this.asRecord(parsed.subPropWeights);
      const weights = Object.fromEntries(
        Object.entries(source)
          .map(([name, value]) => [name, Number(value)] as const)
          .filter((entry) => Number.isFinite(entry[1])),
      );
      if (Object.keys(weights).length) {
        this.phantomWeights.set(roleId, weights);
        return weights;
      }
    } catch {
      // Weight data enhances scoring but must not prevent role details from opening.
    }
    return null;
  }

  async sign(accountId?: string): Promise<KuroOperationResult[]> {
    const today = new Date().toLocaleDateString('sv-SE');
    const accounts = accountId
      ? [this.getAccount(accountId)]
      : this.repository.list().filter((item) => !this.isToday(item.lastSignAt, today));
    return this.executeSign(accounts, false);
  }

  async retroSign(accountId?: string): Promise<KuroOperationResult[]> {
    const accounts = accountId ? [this.getAccount(accountId)] : this.repository.list();
    const output: KuroOperationResult[] = [];
    for (const account of accounts) {
      let eligibility = await this.getRetroEligibility(account);
      if (!eligibility.canRetro) {
        output.push({
          success: false,
          message: `${this.role(account).roleName}：${eligibility.reason}`,
        });
        continue;
      }
      if (!eligibility.signedToday) output.push(...(await this.executeSign([account], false)));
      let attempts = 0;
      while (eligibility.canRetro && attempts < 3) {
        attempts += 1;
        const result = await this.executeSign([account], true);
        output.push(...result);
        if (!result.every((item) => item.success)) break;
        eligibility = await this.getRetroEligibility(account);
      }
    }
    return output;
  }

  async retroEligibility(accountId?: string): Promise<KuroRetroEligibility[]> {
    const accounts = accountId ? [this.getAccount(accountId)] : this.repository.list();
    return Promise.all(accounts.map((account) => this.getRetroEligibility(account)));
  }

  private async getRetroEligibility(account: KuroAccount): Promise<KuroRetroEligibility> {
    const role = this.role(account);
    const query = new URLSearchParams({
      gameId: GAME_ID,
      serverId: role.serverId || SERVER_ID,
      roleId: role.roleId,
      userId: role.userId,
    });
    const token = this.token(account.id);
    const devcode = this.did(account.id);
    const [result, mine] = await Promise.all([
      this.request(`/encourage/signIn/initSignInV2?${query}`, {
        token,
        devcode,
        source: 'android',
      }),
      this.request('/user/mineV2', {
        token,
        devcode,
        source: 'android',
        body: new URLSearchParams({ otherUserId: role.userId }),
      }),
    ]);
    this.assertSuccess(result, '补签资格获取失败');
    this.assertSuccess(mine, '库洛币余额获取失败');
    const data = this.asRecord(result.data);
    const missingDays = Math.max(0, Number(data.omissionNnm ?? 0));
    const usedTimes = Math.max(0, Number(data.repleNum ?? 0));
    const serverRemaining = Number(data.disposableSignNum);
    const remainingTimes = Math.max(
      0,
      Math.min(3 - usedTimes, Number.isFinite(serverRemaining) ? serverRemaining : 3 - usedTimes),
    );
    const kuroCoins = Math.max(0, this.deepNumber(mine.data, 'goldNum'));
    const signedToday = data.isSigIn === true;
    const reason =
      missingDays <= 0
        ? '当月没有漏签记录'
        : remainingTimes <= 0
          ? '本月补签次数已用完'
          : kuroCoins < 200
            ? '库洛币不足 200'
            : null;
    return {
      accountId: account.id,
      roleId: role.roleId,
      canRetro: reason === null,
      signedToday,
      missingDays,
      remainingTimes,
      kuroCoins,
      reason,
    };
  }

  private async executeSign(
    accounts: KuroAccount[],
    retroactive: boolean,
  ): Promise<KuroOperationResult[]> {
    return Promise.all(
      accounts.map(async (account) => {
        const role = this.role(account);
        const month = String(new Date().getMonth() + 1).padStart(2, '0');
        const query = new URLSearchParams({
          gameId: GAME_ID,
          serverId: role.serverId || SERVER_ID,
          roleId: role.roleId,
          userId: role.userId,
          reqMonth: month,
        });
        try {
          const token = this.token(account.id);
          const result = await this.request(`/encourage/signIn/v2?${query}`, {
            token,
            devcode: this.did(account.id),
          });
          const message = this.message(result, '签到完成');
          const success =
            result.code === 200 || result.success === true || /成功|重复签到|已签到/.test(message);
          if (retroactive) this.repository.updateRetroSign(account.id, message, success);
          else this.repository.updateSign(account.id, message, success);
          const gameResult = {
            success,
            message: `${role.roleName}：${retroactive ? '补签' : '签到'}${message}`,
          };
          return gameResult;
        } catch (error) {
          const message = error instanceof Error ? error.message : '签到失败';
          if (retroactive) this.repository.updateRetroSign(account.id, message, false);
          else this.repository.updateSign(account.id, message, false);
          return { success: false, message: `${role.roleName}：${message}` };
        }
      }),
    );
  }

  async dashboard(id: string, roleId?: string, force = false): Promise<KuroDashboard> {
    const account = this.getAccount(id);
    const role = account.roles.find((item) => item.roleId === roleId) ?? this.role(account);
    const key = `${id}:${role.roleId}`;
    if (force) this.homeWidgetCache.delete(role.roleId);
    const cached = this.cache.get(key);
    if (!force && cached && cached.expires > Date.now()) return cached.value;
    const token = this.token(id);
    const did = this.did(id);
    const accessToken = await this.getAccessToken(id, role, token, did);
    const base = new URLSearchParams({
      gameId: GAME_ID,
      serverId: role.serverId || SERVER_ID,
      roleId: role.roleId,
      userId: role.userId,
    });
    const errors: KuroDashboard['errors'] = {};
    const load = async (
      name: keyof KuroDashboard['errors'],
      path: string,
      body?: URLSearchParams,
      method: 'GET' | 'POST' = 'POST',
    ) => {
      try {
        const result = await this.request(path, {
          token,
          did,
          bat: accessToken,
          method,
          ...(body ? { body } : {}),
        });
        this.assertSuccess(result, '数据获取失败');
        return Array.isArray(result.data) ? { list: result.data } : this.asRecord(result.data);
      } catch (error) {
        errors[name] = error instanceof Error ? error.message : '数据获取失败';
        return null;
      }
    };
    const loadSign = async (path: string) => {
      try {
        const result = await this.request(path, {
          token,
          devcode: did,
          source: 'android',
        });
        this.assertSuccess(result, '签到数据获取失败');
        return Array.isArray(result.data) ? { list: result.data } : this.asRecord(result.data);
      } catch (error) {
        errors.sign = error instanceof Error ? error.message : '签到数据获取失败';
        return null;
      }
    };
    const loadCommunityTasks = async () => {
      try {
        const result = await this.request('/encourage/level/getTaskProcess', {
          token,
          devcode: did,
          source: 'android',
          body: new URLSearchParams({ gameId: GAME_ID }),
        });
        this.assertSuccess(result, '库街区每日任务获取失败');
        return Array.isArray(result.data) ? { list: result.data } : this.asRecord(result.data);
      } catch (error) {
        errors.community = error instanceof Error ? error.message : '库街区每日任务获取失败';
        return null;
      }
    };
    const loadOptional = async (path: string, method: 'GET' | 'POST' = 'POST') => {
      try {
        const result = await this.request(path, {
          token,
          did,
          bat: accessToken,
          method,
        });
        this.assertSuccess(result, '数据获取失败');
        return Array.isArray(result.data) ? { list: result.data } : this.asRecord(result.data);
      } catch {
        // Optional account-specific calculator data is resolved on demand. Its
        // failure must not turn an otherwise usable calculator into an error page.
        return null;
      }
    };
    const roleBody = () => ({
      gameId: GAME_ID,
      roleId: role.roleId,
      serverId: SERVER_ID,
    });
    const loadRoleData = async (path: string) => {
      try {
        const result = await this.requestMultipart(path, roleBody(), {
          did,
          bat: accessToken,
        });
        this.assertSuccess(result, '角色数据获取失败');
        return this.dataRecord(result.data);
      } catch (error) {
        errors.roles = error instanceof Error ? error.message : '角色数据获取失败';
        return null;
      }
    };
    const loadChallenge = async (
      path: string,
      fields?: Record<string, string>,
    ): Promise<Record<string, unknown> | null> => {
      try {
        const result = fields
          ? await this.requestMultipart(path, fields, { did, bat: accessToken })
          : await this.request(path, { did, bat: accessToken, method: 'GET' });
        this.assertSuccess(result, '挑战数据获取失败');
        return this.dataRecord(result.data);
      } catch (error) {
        const message = error instanceof Error ? error.message : '挑战数据获取失败';
        errors.challenge = errors.challenge ? `${errors.challenge}；${message}` : message;
        return null;
      }
    };
    const [
      daily,
      roleList,
      baseData,
      calabash,
      explore,
      tower,
      slash,
      newTower,
      hologram,
      resourcePeriods,
      signInit,
      sign,
      communityTasks,
      calculatorRoles,
      calculatorWeapons,
      ownedRoles,
      calculatorEchoes,
    ] = await Promise.all([
      load(
        'overview',
        '/aki/widget/getData',
        new URLSearchParams({
          type: '2',
          sizeType: '1',
          gameId: GAME_ID,
          serverId: role.serverId || SERVER_ID,
          roleId: role.roleId,
          userId: role.userId,
        }),
      ),
      loadRoleData('/aki/roleBox/akiBox/roleData'),
      loadRoleData('/aki/roleBox/akiBox/baseData'),
      loadRoleData('/gamer/roleBox/akiBox/calabashData'),
      loadRoleData('/gamer/roleBox/akiBox/exploreIndex'),
      loadChallenge('/aki/roleBox/akiBox/towerDataDetail', roleBody()),
      loadChallenge(`/aki/roleBox/akiBox/slashDetail?${base}`),
      loadChallenge('/aki/roleBox/akiBox/newTowerDetail', {
        serverId: SERVER_ID,
        roleId: role.roleId,
      }),
      loadChallenge('/gamer/roleBox/akiBox/challengeDetails', roleBody()),
      load('resources', '/aki/resource/period/list', undefined, 'GET'),
      loadSign(`/encourage/signIn/initSignInV2?${base}`),
      loadSign(`/encourage/signIn/queryRecordV2?${base}`),
      loadCommunityTasks(),
      load('calculator', '/aki/calculator/listRole'),
      load('calculator', '/aki/calculator/listWeapon'),
      loadOptional(
        `/aki/calculator/queryOwnedRole?userId=${role.userId}&serverId=${role.serverId || SERVER_ID}&roleId=${role.roleId}`,
        'GET',
      ),
      this.loadEchoCatalog(),
    ]);
    const value: KuroDashboard = {
      accountId: id,
      role,
      fetchedAt: new Date().toISOString(),
      daily,
      roles: { list: roleList, baseData, calabash, explore },
      challenge: { tower, slash, newTower, hologram, overview: daily },
      resources: null,
      sign: signInit || sign ? { ...(signInit ?? {}), records: sign } : null,
      communityTasks,
      calculator: {
        roles: calculatorRoles,
        weapons: calculatorWeapons,
        ownedRoles,
        echoes: calculatorEchoes,
      },
      resourcePeriods,
      errors,
    };
    this.cache.set(key, { expires: Date.now() + 5 * 60_000, value });
    return value;
  }

  async homeWidget(playerId: string): Promise<KuroHomeWidget | null> {
    const cached = this.homeWidgetCache.get(playerId);
    if (cached && cached.expires > Date.now()) return cached.value;
    const account = this.repository
      .list()
      .find((item) => item.roles.some((role) => role.roleId === playerId));
    if (!account) {
      this.homeWidgetCache.set(playerId, { expires: Date.now() + 60_000, value: null });
      return null;
    }
    const dashboard = await this.dashboard(account.id, playerId);
    const roleCount = this.roleCountFromDashboard(dashboard.roles);
    const weekly = this.asRecord(dashboard.daily?.weeklyFrameData);
    const value: KuroHomeWidget = {
      playerId,
      roleCount,
      resonatorIcon: null,
      weeklyTravelScore: this.numberFromRecord(weekly, ['cur', 'current', 'value']),
      weeklyTravelMax: this.numberFromRecord(weekly, [
        'max',
        'maxScore',
        'limit',
        'total',
        'target',
      ]),
      weeklyTravelIcon: null,
    };
    this.homeWidgetCache.set(playerId, { expires: Date.now() + 5 * 60_000, value });
    return value;
  }

  async calculate(input: KuroCalculationInput): Promise<Record<string, unknown>> {
    const account = this.getAccount(input.accountId);
    const role = account.roles.find((item) => item.roleId === input.roleId) ?? this.role(account);
    const token = this.token(account.id);
    const did = this.did(account.id);
    const bat = await this.getAccessToken(account.id, role, token, did);
    const content =
      input.kind === 'weapon'
        ? [
            {
              weaponId: input.itemId,
              weaponStartLevel: input.startLevel,
              weaponEndLevel: input.endLevel,
            },
          ]
        : [
            {
              roleId: input.itemId,
              roleStartLevel: input.startLevel,
              roleEndLevel: input.endLevel,
              skillLevelUpList:
                input.skillLevelUpList?.map((item) => ({
                  startLevel: item.startLevel,
                  endLevel: item.enabled === false ? item.startLevel : item.endLevel,
                })) ??
                Array.from({ length: 5 }, () => ({
                  startLevel: input.skillStartLevel ?? 1,
                  endLevel: input.skillEndLevel ?? 10,
                })),
              advanceSkillList: input.advanceSkillList ?? [],
              weaponId: input.weapon?.itemId ?? 0,
              weaponStartLevel: input.weapon?.startLevel ?? 1,
              weaponEndLevel: input.weapon?.endLevel ?? 1,
              _category: 'all',
            },
          ];
    const body = new URLSearchParams({
      userId: role.userId,
      serverId: role.serverId || SERVER_ID,
      roleId: role.roleId,
      content: JSON.stringify(content),
    });
    const result = await this.request(
      `/aki/calculator/${input.kind === 'role' ? 'batchRoleCost' : 'batchWeaponCost'}`,
      { token, did, bat, body },
    );
    this.assertSuccess(result, '养成材料计算失败');
    return this.asRecord(result.data);
  }

  private async loadEchoCatalog(): Promise<Record<string, unknown>> {
    try {
      const [monsterResponse, setResponse] = await Promise.all([
        fetch('https://mc.appfeng.com/monster', {
          signal: AbortSignal.timeout(15_000),
          headers: { 'user-agent': UA, accept: 'text/html' },
        }),
        fetch('https://mc.appfeng.com/echo', {
          signal: AbortSignal.timeout(15_000),
          headers: { 'user-agent': UA, accept: 'text/html' },
        }),
      ]);
      if (!monsterResponse.ok || !setResponse.ok) return { list: [] };
      const [monsterHtml, setHtml] = await Promise.all([
        monsterResponse.text(),
        setResponse.text(),
      ]);
      const setsByEcho = new Map<number, string[]>();
      const setIcons = new Map<string, string>();
      const setBlocks = setHtml.split('<div class="item"').slice(1);
      for (const block of setBlocks) {
        const name = block
          .match(/<div class="title flexCenter">[\s\S]*?<\/div>/)?.[0]
          ?.replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (!name) continue;
        const iconPath = block.match(/<div class="title flexCenter"><img src="([^"]+)"/)?.[1];
        if (iconPath) setIcons.set(name, new URL(iconPath, 'https://mc.appfeng.com').toString());
        for (const match of block.matchAll(/href="\/monster\/(\d+)"/g)) {
          const id = Number(match[1]);
          if (!Number.isInteger(id)) continue;
          const values = setsByEcho.get(id) ?? [];
          if (!values.includes(name)) values.push(name);
          setsByEcho.set(id, values);
        }
      }
      const levelNames = Object.fromEntries(
        [...monsterHtml.matchAll(/value="([^"]+级)"/g)]
          .map((match) => match[1])
          .filter(
            (value, index, values): value is string =>
              Boolean(value) && values.indexOf(value) === index,
          )
          .map((value, index) => [`s${index + 1}`, value]),
      );
      const rarities = [
        ...new Set(
          [...monsterHtml.matchAll(/value="(\d+)星"/g)]
            .map((match) => Number(match[1]) + 1)
            .filter(Number.isFinite),
        ),
      ];
      const list = [
        ...monsterHtml.matchAll(
          /<li class="(s\d+)"><a href="\/monster\/(\d+)"[\s\S]*?<div class="cost">(?:Cost )?(\d+)<\/div>[\s\S]*?<div class="head"><img src="([^"]+)"[\s\S]*?<div class="name"><span>([^<]+)<\/span>/g,
        ),
      ].map((match) => {
        const id = Number(match[2]);
        return {
          id,
          name: match[5],
          iconUrl: new URL(match[4]!, 'https://mc.appfeng.com').toString(),
          cost: Number(match[3]),
          levelName: levelNames[match[1]!] ?? match[1],
          setNames: setsByEcho.get(id) ?? [],
          setIcons: Object.fromEntries(
            (setsByEcho.get(id) ?? []).map((name) => [name, setIcons.get(name) ?? '']),
          ),
          rarities,
        };
      });
      return { list };
    } catch {
      return { list: [] };
    }
  }

  async resourceBriefing(
    accountId: string,
    roleId: string | undefined,
    periodType: KuroResourcePeriodType,
    period: KuroResourcePeriod,
  ): Promise<KuroResourceBriefing> {
    const account = this.getAccount(accountId);
    const role = account.roles.find((item) => item.roleId === roleId) ?? this.role(account);
    const token = this.token(account.id);
    const did = this.did(account.id);
    const bat = await this.getAccessToken(account.id, role, token, did);
    const body = new URLSearchParams({
      period: String(period.index),
      roleId: role.roleId,
      serverId: role.serverId || SERVER_ID,
    });
    const result = await this.request(`/aki/resource/${periodType}`, { token, did, bat, body });
    this.assertSuccess(result, '资源简报获取失败');
    const raw = this.asRecord(result.data);
    const items = (value: unknown): KuroResourceItem[] =>
      (Array.isArray(value) ? value : [])
        .map((item) => this.asRecord(item))
        .map((item) => ({
          type: String(item.type ?? item.name ?? '其他'),
          num: Number(item.num ?? item.count ?? 0),
        }))
        .filter((item) => Number.isFinite(item.num));
    return {
      periodType,
      period,
      totalStar: Number(raw.totalStar ?? raw.star ?? 0),
      totalCoin: Number(raw.totalCoin ?? raw.coin ?? 0),
      starList: items(raw.starList),
      coinList: items(raw.coinList),
      raw,
    };
  }

  async runAutomation(startup = false): Promise<void> {
    const today = new Date().toLocaleDateString('sv-SE');
    const accounts = this.repository.list();
    for (const account of accounts) {
      if (!startup && Date.now() < this.dailyAutomationTime(account.id, today)) continue;
      if (account.autoSign && !this.isToday(account.lastSignAt, today)) await this.sign(account.id);
      if (account.autoRetroSign && !this.isToday(account.lastRetroSignAt, today))
        await this.retroSign(account.id);
    }
  }

  private isToday(value: string | null, today: string): boolean {
    return Boolean(value && new Date(value).toLocaleDateString('sv-SE') === today);
  }

  private dailyAutomationTime(accountId: string, today: string): number {
    let hash = 2166136261;
    for (const character of `${accountId}:${today}`) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    const offsetMinutes = 60 + (Math.abs(hash) % 181);
    const target = new Date(`${today}T04:00:00`);
    return target.getTime() + offsetMinutes * 60_000;
  }

  private async fetchRoles(token: string): Promise<KuroGameRole[]> {
    const result = await this.request('/gamer/role/list?gameId=3', {
      token,
      source: 'android',
    });
    this.assertSuccess(result, 'Token 无效或已过期');
    const values = Array.isArray(result.data) ? result.data : [];
    return values
      .map((value) => {
        const role = this.asRecord(value);
        return {
          userId: String(role.userId ?? ''),
          roleId: String(role.roleId ?? ''),
          roleName: String(role.roleName ?? '未命名角色'),
          serverId: String(role.serverId ?? SERVER_ID),
          serverName: role.serverName ? String(role.serverName) : null,
          linkedAccountId: null,
        };
      })
      .filter((role) => role.roleId && role.userId);
  }

  private async getAccessToken(
    accountId: string,
    role: KuroGameRole,
    token: string,
    did: string,
  ): Promise<string> {
    const key = this.accessTokenKey(accountId, role.roleId);
    const cached = this.accessTokens.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;
    const query = new URLSearchParams({
      serverId: role.serverId || SERVER_ID,
      roleId: role.roleId,
      userId: role.userId,
    });
    const result = await this.request(`/aki/roleBox/requestToken?${query}`, {
      token,
      did,
      bat: '',
    });
    this.assertSuccess(result, '无法获取库街区数据访问凭据');
    let rawData = result.data;
    if (typeof rawData === 'string') {
      try {
        rawData = JSON.parse(rawData) as unknown;
      } catch {
        // A few API variants return the access token directly instead of JSON.
      }
    }
    const data = this.asRecord(rawData);
    const value = String(data.accessToken ?? data.token ?? result.data ?? '');
    if (!value || value === '[object Object]') throw new Error('库街区数据访问凭据为空');
    this.accessTokens.set(key, { expires: Date.now() + 55 * 60_000, value });
    return value;
  }

  private randomDevCode(): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
  }

  private accessTokenKey(accountId: string, roleId: string): string {
    return `${accountId}:${roleId}`;
  }

  private clearAccessTokens(accountId: string): void {
    const prefix = `${accountId}:`;
    for (const key of this.accessTokens.keys()) {
      if (key.startsWith(prefix)) this.accessTokens.delete(key);
    }
  }

  private isDataTokenExpired(result: ApiEnvelope): boolean {
    const message = this.message(result, '');
    return /数据令牌.*失效|访问凭据.*失效|B-?At.*(?:失效|过期)|access\s*token.*expired/i.test(
      message,
    );
  }

  private async request(
    path: string,
    options: {
      token?: string;
      body?: URLSearchParams;
      source?: string;
      version?: string;
      devcode?: string;
      did?: string;
      bat?: string;
      method?: 'GET' | 'POST';
      userAgent?: string;
    } = {},
  ): Promise<ApiEnvelope> {
    const response = await fetch(`${API}${path}`, {
      method: options.method ?? 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        accept: 'application/json, text/plain, */*',
        'user-agent': options.userAgent ?? UA,
        source: options.source ?? 'android',
        ...(options.token ? { token: options.token } : {}),
        ...(options.version ? { version: options.version } : {}),
        ...(options.devcode ? { devcode: options.devcode } : {}),
        ...(options.did ? { did: options.did } : {}),
        ...(options.bat !== undefined ? { 'b-at': options.bat } : {}),
      },
      ...(options.body && options.method !== 'GET' ? { body: options.body.toString() } : {}),
    });
    return this.readEnvelope(response, '网络请求失败');
  }

  private async requestMultipart(
    path: string,
    fields: Record<string, string>,
    options: { did: string; bat: string },
  ): Promise<ApiEnvelope> {
    const body = new FormData();
    for (const [name, value] of Object.entries(fields)) body.set(name, value);
    const response = await fetch(`${API}${path}`, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
      headers: {
        accept: 'application/json, text/plain, */*',
        'user-agent': UA,
        source: 'android',
        did: options.did,
        devcode: options.did,
        'b-at': options.bat,
      },
      body,
    });
    return this.readEnvelope(response, '网络请求失败');
  }

  private getAccount(id: string): KuroAccount {
    return this.repository.get(id) ?? this.notFound();
  }
  mobileAuth(accountId: string, roleId?: string): Record<string, string> {
    const account = this.getAccount(accountId);
    const role =
      account.roles.find((item) => item.roleId === roleId) ??
      account.roles.find((item) => item.roleId === account.activeRoleId) ??
      this.role(account);
    return {
      token: this.token(account.id),
      did: this.did(account.id),
      userId: role.userId,
      roleId: role.roleId,
      serverId: role.serverId || SERVER_ID,
      gameId: GAME_ID,
      channelId: '19',
    };
  }
  private role(account: KuroAccount): KuroGameRole {
    return (
      account.roles.find((item) => item.roleId === account.activeRoleId) ??
      account.roles[0] ??
      this.notFound()
    );
  }
  private token(id: string): string {
    const value = this.repository.getSecret(id);
    if (!value) return this.notFound();
    return this.secrets.decrypt(value);
  }
  private did(id: string): string {
    const value = this.repository.getDidSecret(id);
    if (!value) throw new Error('账号缺少 Did，请编辑账号补充后重试');
    return this.secrets.decrypt(value);
  }
  private notFound(): never {
    throw new Error('库街区账号不存在');
  }
  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
  private dataRecord(value: unknown): Record<string, unknown> {
    if (typeof value === 'string') {
      try {
        return this.asRecord(JSON.parse(value) as unknown);
      } catch {
        return {};
      }
    }
    return this.asRecord(value);
  }
  private deepNumber(value: unknown, key: string): number {
    if (!value || typeof value !== 'object') return 0;
    const record = value as Record<string, unknown>;
    const direct = Number(record[key]);
    if (Number.isFinite(direct)) return direct;
    for (const child of Object.values(record)) {
      const nested = this.deepNumber(child, key);
      if (nested) return nested;
    }
    return 0;
  }
  private message(value: ApiEnvelope, fallback: string): string {
    return value.msg || value.message || fallback;
  }
  private async readEnvelope(response: Response, fallback: string): Promise<ApiEnvelope> {
    const text = await response.text();
    if (/captcha|geetest|安全验证|安全校验|人机验证|请.{0,8}验证/i.test(text))
      throw new Error('需要完成安全验证，请打开“手机视图”的“数据终端”完成验证后重试');
    if (!response.ok) throw new Error(`${fallback}（HTTP ${response.status}）`);
    try {
      return JSON.parse(text) as ApiEnvelope;
    } catch {
      throw new Error(`${fallback}：服务器返回了无法识别的页面`);
    }
  }
  private assertSuccess(value: ApiEnvelope, fallback: string): void {
    const summary = `${value.code ?? ''} ${value.msg ?? ''} ${value.message ?? ''} ${
      typeof value.data === 'string' ? value.data : ''
    }`;
    if (/captcha|geetest|安全验证|安全校验|人机验证|请.{0,8}验证/i.test(summary))
      throw new Error('需要完成安全验证，请打开“手机视图”的“数据终端”完成验证后重试');
    if (!(value.code === 0 || value.code === 200 || value.success === true))
      throw new Error(this.message(value, fallback));
  }
  private maskPhone(phone: string): string {
    return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
  }
}

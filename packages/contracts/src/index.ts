export const PROTOCOL_VERSION = 2 as const;

export interface HealthResult {
  protocolVersion: number;
  helperVersion: string;
  runtimeVersion: string;
  operatingSystem: string;
  processId: number;
}

export interface AppInfo {
  appVersion: string;
  platform: string;
  helper: HealthResult;
}

export interface WallpaperSelection {
  mode: 'default' | 'image' | 'folder';
  sourcePath: string;
  imageCount: number;
  dataUrl: string;
  currentIndex: number;
  fileName: string;
}

export type GameRegion = 'cn' | 'global' | 'bilibili' | 'wegame' | 'unknown';

export interface GameInstallation {
  id: string;
  rootPath: string;
  executablePath: string;
  clientExecutablePath: string | null;
  region: GameRegion;
  localVersion: string | null;
}

export interface GameValidationResult {
  valid: boolean;
  issues: string[];
  installation: GameInstallation | null;
}

export type GameRenderMode = 'default' | 'dx11' | 'dx12';

export interface LaunchGameInput {
  rootPath: string;
  renderMode: GameRenderMode;
  displayMode?: GameDisplayMode;
  width?: number;
  height?: number;
}

export interface GameProcessState {
  installationId: string;
  running: boolean;
  processId: number | null;
  startedAt: string | null;
}

export type GameVersionStatus = 'latest' | 'updateAvailable' | 'localNewer' | 'unknown';

export interface GameVersionState {
  installationId: string;
  localVersion: string | null;
  remoteVersion: string | null;
  status: GameVersionStatus;
  checkedAt: string;
}

export type GameDisplayMode = 'fullscreen' | 'borderless' | 'windowed';

export interface GameDisplaySettings {
  available: boolean;
  displayMode: GameDisplayMode;
  width: number;
  height: number;
}

export interface DisplayResolution {
  width: number;
  height: number;
}

export interface SaveGameDisplaySettingsInput {
  displayMode: GameDisplayMode;
  width: number;
  height: number;
}

export interface CopyConveneUrlResult {
  found: boolean;
  source: 'clientLog' | 'debugLog' | null;
  copiedAt: string | null;
  errorCode: string | null;
}

export type AccountRegion = 'cn' | 'global';

export interface AccountProfile {
  id: string;
  displayName: string;
  playerId: string | null;
  region: AccountRegion;
  installationId: string | null;
  note: string | null;
  active: boolean;
  createdAt: string;
}

export interface SaveAccountProfileInput {
  id?: string;
  displayName: string;
  playerId?: string | null;
  region: AccountRegion;
  installationId?: string | null;
  note?: string | null;
}

export interface RedemptionCode {
  code: string;
  description: string | null;
  reward: string | null;
  valid: boolean;
  startTime: string | null;
  endTime: string | null;
  used: boolean;
}

export interface RedemptionCodeCatalog {
  cn: RedemptionCode[];
  global: RedemptionCode[];
  source: string;
  fetchedAt: string;
  errorCode?: string | null;
}

export interface LauncherAccount {
  id: string;
  label: string;
  region: AccountRegion;
  roleId: string | null;
  roleName: string | null;
  avatarUrl: string | null;
  level: number | null;
  energy: number | null;
  maxEnergy: number | null;
  energyRecoverTime: number | null;
  liveness: number | null;
  maxLiveness: number | null;
  activeDays: number | null;
  worldLevel: number | null;
  roleCount: number | null;
  soundBox: number | null;
  storeEnergy: number | null;
  maxStoreEnergy: number | null;
  weeklyRemaining: number | null;
  weeklyTravelScore: number | null;
  battlePassLevel: number | null;
  battlePassExp: number | null;
  battlePassExpLimit: number | null;
  battlePassWeekExp: number | null;
  battlePassWeekMaxExp: number | null;
  motorLevel: number | null;
  motorExp: number | null;
  motorNextExp: number | null;
  boxes: Record<string, number>;
  errorCode: string | null;
}

export interface GachaRecord {
  recordId: string;
  recordOrder: number;
  playerId: string;
  poolType: string;
  resourceId: number;
  qualityLevel: number;
  resourceType: string;
  name: string;
  time: string;
}

export interface GachaVersionMetadata {
  version: string;
  name: string;
  start: string;
  end: string | null;
  featuredCharacterIds: number[];
  featuredWeaponIds: number[];
  phases: Array<{
    start: string;
    end: string | null;
    featuredCharacterIds: number[];
    featuredWeaponIds: number[];
  }>;
  dateSource: 'official' | 'wiki' | 'manual' | 'reference-image' | 'estimated-cycle';
  dateVerified: boolean;
}

export interface VersionMetadataConflict {
  version: string;
  local: GachaVersionMetadata;
  incoming: GachaVersionMetadata;
}

export interface VersionMetadataUpdatePreview {
  entries: GachaVersionMetadata[];
  conflicts: VersionMetadataConflict[];
  sourceErrors: Partial<Record<'official', string>>;
  fetchedAt: string;
}

export type VersionMetadataConflictStrategy = 'overwrite' | 'preserve';

export interface SaveVersionMetadataInput {
  version: string;
  name: string;
  start: string;
}

export const GACHA_VERSION_METADATA: GachaVersionMetadata[] = [
  {
    version: '3.5',
    name: '遗音扶剑，荡梦而歌',
    start: '2026-07-10 00:00:00',
    end: null,
    featuredCharacterIds: [1610],
    featuredWeaponIds: [21020096],
    phases: [
      {
        start: '2026-07-10 00:00:00',
        end: null,
        featuredCharacterIds: [1610],
        featuredWeaponIds: [21020096],
      },
    ],
    dateSource: 'reference-image',
    dateVerified: false,
  },
  {
    version: '3.4',
    name: '未选择的梦',
    start: '2026-06-08 00:00:00',
    end: '2026-07-10 00:00:00',
    featuredCharacterIds: [],
    featuredWeaponIds: [],
    phases: [],
    dateSource: 'reference-image',
    dateVerified: false,
  },
  {
    version: '3.3',
    name: '自星海尽处回响',
    start: '2026-04-30 00:00:00',
    end: '2026-06-08 00:00:00',
    featuredCharacterIds: [1108, 1209, 1211],
    featuredWeaponIds: [],
    phases: [
      {
        start: '2026-04-30 00:00:00',
        end: '2026-05-21 00:00:00',
        featuredCharacterIds: [1108, 1209],
        featuredWeaponIds: [],
      },
      {
        start: '2026-05-21 00:00:00',
        end: '2026-06-08 00:00:00',
        featuredCharacterIds: [1211],
        featuredWeaponIds: [],
      },
    ],
    dateSource: 'reference-image',
    dateVerified: false,
  },
  {
    version: '3.2',
    name: '于影中启明的决心',
    start: '2026-03-19 00:00:00',
    end: '2026-04-30 00:00:00',
    featuredCharacterIds: [],
    featuredWeaponIds: [],
    phases: [],
    dateSource: 'estimated-cycle',
    dateVerified: false,
  },
  {
    version: '3.1',
    name: '赠予雪中的你',
    start: '2026-02-05 00:00:00',
    end: '2026-03-19 00:00:00',
    featuredCharacterIds: [1210],
    featuredWeaponIds: [],
    phases: [
      {
        start: '2026-02-05 00:00:00',
        end: '2026-02-26 00:00:00',
        featuredCharacterIds: [1210],
        featuredWeaponIds: [],
      },
    ],
    dateSource: 'estimated-cycle',
    dateVerified: false,
  },
  {
    version: '3.0',
    name: '我们生而眺望',
    start: '2025-12-25 00:00:00',
    end: '2026-02-05 00:00:00',
    featuredCharacterIds: [],
    featuredWeaponIds: [],
    phases: [],
    dateSource: 'estimated-cycle',
    dateVerified: false,
  },
  {
    version: '1.0',
    name: '鸣潮往复，文明不屈',
    start: '2024-05-23 10:00:00',
    end: '2025-12-25 00:00:00',
    featuredCharacterIds: [],
    featuredWeaponIds: [],
    phases: [],
    dateSource: 'manual',
    dateVerified: true,
  },
];

export function findGachaVersion(
  time: string,
  metadata: GachaVersionMetadata[] = GACHA_VERSION_METADATA,
): GachaVersionMetadata | null {
  return (
    metadata.find((version) => time >= version.start && (!version.end || time < version.end)) ??
    null
  );
}

export function isFeaturedGachaItem(
  time: string,
  poolType: string,
  resourceId: number,
  metadata: GachaVersionMetadata[] = GACHA_VERSION_METADATA,
): boolean | null {
  const version = findGachaVersion(time, metadata);
  const phase = version?.phases.find(
    (item) => time >= item.start && (!item.end || time < item.end),
  );
  if (!phase) return null;
  const ids = ['1', '10'].includes(poolType) ? phase.featuredCharacterIds : phase.featuredWeaponIds;
  return ids.includes(resourceId);
}

export interface GachaPoolAnalysis {
  poolType: string;
  total: number;
  fiveStarCount: number;
  fourStarCount: number;
  pity: number;
  averageFiveStarPity: number | null;
  fiveStars: Array<{
    resourceId: number;
    name: string;
    time: string;
    pity: number;
    featured: boolean | null;
  }>;
}

export interface GachaAnalysis {
  playerId: string;
  total: number;
  importedAt: string | null;
  pools: GachaPoolAnalysis[];
  recentRecords: GachaRecord[];
}

export interface ImportGachaInput {
  installationId: string;
  url?: string | null;
}

export interface ImportGachaResult {
  url: string;
  analysis: GachaAnalysis;
}

export interface SnapshotExportInput {
  png: Uint8Array;
  destination: 'file' | 'clipboard';
}

export type KuroLoginMethod = 'sms' | 'token';
export type KuroFeature =
  'overview' | 'roles' | 'calculator' | 'challenge' | 'sign' | 'community' | 'resources';

export interface KuroGameRole {
  userId: string;
  roleId: string;
  roleName: string;
  serverId: string;
  serverName: string | null;
  linkedAccountId: string | null;
}

export interface KuroAccount {
  id: string;
  accountName: string;
  remark: string | null;
  displayTitle: string;
  collaborationStatus: 'linked' | 'unlinked';
  loginMethod: KuroLoginMethod;
  phoneMasked: string | null;
  hasDid: boolean;
  roles: KuroGameRole[];
  activeRoleId: string | null;
  active: boolean;
  autoSign: boolean;
  autoRetroSign: boolean;
  lastSignAt: string | null;
  lastSignStatus: string | null;
  lastRetroSignAt: string | null;
  lastRetroSignStatus: string | null;
  createdAt: string;
}

export interface KuroLoginInput {
  method: KuroLoginMethod;
  remark?: string;
  phone?: string;
  code?: string;
  token?: string;
  did?: string;
}

export interface UpdateKuroAccountInput {
  accountId: string;
  remark?: string | null;
  token?: string;
  did?: string;
}

export interface KuroSmsInput {
  phone: string;
  geeTestData?: string;
}

export interface KuroOperationResult {
  success: boolean;
  message: string;
}
export interface KuroRetroEligibility {
  accountId: string;
  roleId: string;
  canRetro: boolean;
  signedToday: boolean;
  missingDays: number;
  remainingTimes: number;
  kuroCoins: number;
  reason: string | null;
}

export interface KuroCalculationInput {
  accountId: string;
  roleId?: string;
  kind: 'role' | 'weapon';
  itemId: number;
  startLevel: number;
  endLevel: number;
  skillStartLevel?: number;
  skillEndLevel?: number;
  skillLevelUpList?: Array<{
    startLevel: number;
    endLevel: number;
    enabled?: boolean;
  }>;
  advanceSkillList?: string[];
  weapon?: {
    itemId: number;
    startLevel: number;
    endLevel: number;
  } | null;
}

export type KuroResourcePeriodType = 'version' | 'month' | 'week';

export interface KuroResourcePeriod {
  title: string;
  index: number;
}

export interface KuroResourceItem {
  type: string;
  num: number;
}

export interface KuroResourceBriefing {
  periodType: KuroResourcePeriodType;
  period: KuroResourcePeriod;
  totalStar: number;
  totalCoin: number;
  starList: KuroResourceItem[];
  coinList: KuroResourceItem[];
  raw: Record<string, unknown>;
}

export interface KuroHomeWidget {
  playerId: string;
  roleCount: number | null;
  resonatorIcon: string | null;
  weeklyTravelScore: number | null;
  weeklyTravelMax: number | null;
  weeklyTravelIcon: string | null;
}

export interface KuroDashboard {
  accountId: string;
  role: KuroGameRole;
  fetchedAt: string;
  daily: Record<string, unknown> | null;
  roles: Record<string, unknown> | null;
  challenge: Record<string, unknown> | null;
  resources: Record<string, unknown> | null;
  sign: Record<string, unknown> | null;
  communityTasks: Record<string, unknown> | null;
  calculator: Record<string, unknown> | null;
  resourcePeriods: Record<string, unknown> | null;
  errors: Partial<Record<KuroFeature, string>>;
}

export interface RpcRequest<TParams = unknown> {
  jsonrpc: '2.0';
  protocolVersion: number;
  id: string;
  method: string;
  params: TParams;
}

export interface RpcErrorData {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface RpcSuccess<TResult = unknown> {
  jsonrpc: '2.0';
  id: string;
  result: TResult;
}

export interface RpcFailure {
  jsonrpc: '2.0';
  id: string | null;
  error: RpcErrorData;
}

export interface KuroRoleArtwork {
  fullBody: string;
  team: string;
  thumbnail?: string;
  cardThumbnail?: string;
  cardResolution?: number;
  order: number;
  wikiEntryId: string;
  sourceIconKey?: string;
}

export type RpcResponse<TResult = unknown> = RpcSuccess<TResult> | RpcFailure;

export interface DesktopApi {
  system: {
    health(): Promise<AppInfo>;
    getDefaultWallpaperDirectory(): Promise<string>;
    chooseWallpaper(mode: 'image' | 'folder'): Promise<WallpaperSelection | null>;
    loadWallpaper(
      mode: 'default' | 'image' | 'folder',
      sourcePath: string,
      index?: number,
    ): Promise<WallpaperSelection | null>;
    setAutoStart(enabled: boolean): Promise<void>;
    setCloseGameOnExit(enabled: boolean): Promise<void>;
    controlWindow(action: 'minimize' | 'toggleMaximize' | 'close'): Promise<boolean>;
  };
  game: {
    listInstallations(): Promise<GameInstallation[]>;
    detectInstallations(): Promise<GameInstallation[]>;
    chooseInstallation(): Promise<GameValidationResult | null>;
    validateInstallation(rootPath: string): Promise<GameValidationResult>;
    launch(input: LaunchGameInput): Promise<GameProcessState>;
    getProcessState(rootPath: string): Promise<GameProcessState>;
    removeInstallation(installationId: string): Promise<void>;
    checkVersion(installationId: string): Promise<GameVersionState>;
    getDisplaySettings(installationId: string): Promise<GameDisplaySettings>;
    listDisplayResolutions(): Promise<DisplayResolution[]>;
    saveDisplaySettings(
      installationId: string,
      input: SaveGameDisplaySettingsInput,
    ): Promise<GameDisplaySettings>;
    openUpdater(installationId: string): Promise<void>;
    stopAll(): Promise<number>;
  };
  gacha: {
    copyConveneUrl(installationId: string): Promise<CopyConveneUrlResult>;
  };
  account: {
    list(): Promise<AccountProfile[]>;
    save(input: SaveAccountProfileInput): Promise<AccountProfile>;
    activate(accountId: string): Promise<AccountProfile>;
    remove(accountId: string): Promise<void>;
    scanLauncher(): Promise<LauncherAccount[]>;
    activateLauncher(accountId: string): Promise<void>;
  };
  kuro: {
    listAccounts(): Promise<KuroAccount[]>;
    requestCaptcha(): Promise<string>;
    sendSms(input: KuroSmsInput): Promise<KuroOperationResult>;
    login(input: KuroLoginInput): Promise<KuroAccount>;
    update(input: UpdateKuroAccountInput): Promise<KuroAccount>;
    activate(accountId: string): Promise<KuroAccount>;
    remove(accountId: string): Promise<void>;
    selectRole(accountId: string, roleId: string): Promise<KuroAccount>;
    setAutoSign(accountId: string, enabled: boolean): Promise<KuroAccount>;
    setAllAutoSign(enabled: boolean): Promise<KuroAccount[]>;
    setAutoRetroSign(accountId: string, enabled: boolean): Promise<KuroAccount>;
    setAllAutoRetroSign(enabled: boolean): Promise<KuroAccount[]>;
    sign(accountId?: string): Promise<KuroOperationResult[]>;
    retroSign(accountId?: string): Promise<KuroOperationResult[]>;
    retroEligibility(accountId?: string): Promise<KuroRetroEligibility[]>;
    dashboard(accountId: string, roleId?: string, forceRefresh?: boolean): Promise<KuroDashboard>;
    homeWidget(playerId: string): Promise<KuroHomeWidget | null>;
    calculate(input: KuroCalculationInput): Promise<Record<string, unknown>>;
    resourceBriefing(
      accountId: string,
      roleId: string | undefined,
      periodType: KuroResourcePeriodType,
      period: KuroResourcePeriod,
    ): Promise<KuroResourceBriefing>;
    refreshRoles(accountId: string): Promise<KuroAccount>;
    roleDetail(
      accountId: string,
      roleId: string,
      cardRoleId: number,
    ): Promise<Record<string, unknown>>;
    roleCultivateStatus(
      accountId: string,
      roleId: string,
      cardRoleId: number,
    ): Promise<Record<string, unknown>>;
    roleArtworks(
      roles: Array<{ id: number; name: string; icon?: string; element?: string }>,
      options?: { useCardThumbnail: boolean; cardResolution: number },
    ): Promise<Record<string, KuroRoleArtwork>>;
    openMobile(accountId: string, roleId: string, url: string): Promise<void>;
  };
  redemption: {
    list(forceRefresh?: boolean): Promise<RedemptionCodeCatalog>;
    copy(code: string): Promise<void>;
    markUsed(region: AccountRegion, code: string, used: boolean): Promise<RedemptionCodeCatalog>;
  };
  gachaAnalysis: {
    acquireUrl(installationId: string): Promise<string>;
    copyUrl(url: string): Promise<void>;
    import(input: ImportGachaInput): Promise<ImportGachaResult>;
    get(playerId?: string): Promise<GachaAnalysis | null>;
    export(playerId: string): Promise<boolean>;
    delete(playerId: string): Promise<void>;
    snapshot(input: SnapshotExportInput): Promise<boolean>;
    players(): Promise<string[]>;
    images(
      resources: Array<{ resourceId: number; name: string; resourceType: string }>,
    ): Promise<Record<string, string>>;
  };
  versionMetadata: {
    list(): Promise<GachaVersionMetadata[]>;
    previewUpdate(): Promise<VersionMetadataUpdatePreview>;
    applyUpdate(
      preview: VersionMetadataUpdatePreview,
      strategy: VersionMetadataConflictStrategy,
    ): Promise<GachaVersionMetadata[]>;
    save(input: SaveVersionMetadataInput): Promise<GachaVersionMetadata[]>;
    remove(version: string): Promise<GachaVersionMetadata[]>;
  };
}

export function isRpcFailure(response: RpcResponse): response is RpcFailure {
  return 'error' in response;
}

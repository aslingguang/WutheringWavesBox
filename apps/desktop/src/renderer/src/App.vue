<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { toBlob } from 'html-to-image';
import { GACHA_VERSION_METADATA, findGachaVersion } from '@wwbox/contracts';
import energyIcon from './assets/game-info/energy.png';
import storeEnergyIcon from './assets/game-info/store-energy.png';
import livenessIcon from './assets/game-info/liveness.png';
import weeklyIcon from './assets/game-info/weekly.png';
import battlePassIcon from './assets/game-info/battle-pass.png';
import resonatorsIcon from './assets/game-info/resonators.svg';
import weeklyTravelIcon from './assets/game-info/weekly-travel.svg';
import KuroPage from './components/KuroPage.vue';
import ThemedSelect from './components/ThemedSelect.vue';
import AppDialog from './components/AppDialog.vue';
import type {
  AppInfo,
  GameInstallation,
  GameProcessState,
  GameRenderMode,
  GameValidationResult,
  GameVersionState,
  GameDisplaySettings,
  AccountProfile,
  AccountRegion,
  RedemptionCodeCatalog,
  LauncherAccount,
  GachaAnalysis,
  GachaPoolAnalysis,
  GachaVersionMetadata,
  VersionMetadataUpdatePreview,
  KuroHomeWidget,
} from '@wwbox/contracts';

const info = ref<AppInfo | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const page = ref<'home' | 'gacha' | 'account' | 'kuro' | 'redemption' | 'settings'>('home');
const sidebarCollapsed = ref(localStorage.getItem('wwbox.sidebarCollapsed') === 'true');
const accountManagerOpen = ref(false);
const closeAccountManagerAfterSwitch = ref(
  localStorage.getItem('wwbox.closeAccountManagerAfterSwitch') === 'true',
);
const editingAccountId = ref<string | undefined>();
const themeStyle = ref<'glass' | 'dark' | 'light'>(
  (localStorage.getItem('wwbox.themeStyle') as 'glass' | 'dark' | 'light') || 'dark',
);
const themeOpacity = ref(Number(localStorage.getItem('wwbox.themeOpacity') || 30));
const highlightTop = ref(localStorage.getItem('wwbox.highlightTop') === 'true');
const highlightRight = ref(localStorage.getItem('wwbox.highlightRight') === 'true');
const highlightBottom = ref(localStorage.getItem('wwbox.highlightBottom') !== 'false');
const highlightLeft = ref(localStorage.getItem('wwbox.highlightLeft') !== 'false');
const highlightColor = ref(localStorage.getItem('wwbox.highlightColor') || '#22aeb0');
const highlightWidth = ref(Number(localStorage.getItem('wwbox.highlightWidth') || 4));
const highlightNavigation = ref(localStorage.getItem('wwbox.highlightNavigation') !== 'false');
const highlightTabs = ref(localStorage.getItem('wwbox.highlightTabs') !== 'false');
const highlightOptions = ref(localStorage.getItem('wwbox.highlightOptions') !== 'false');
const highlightGachaContrast = ref(localStorage.getItem('wwbox.highlightGachaContrast') === 'true');
const hoverHighlightColor = ref(localStorage.getItem('wwbox.hoverHighlightColor') || '#5bd1cf');
const hoverHighlightStyle = ref(localStorage.getItem('wwbox.hoverHighlightStyle') || 'outline');
const savedWallpaperMode =
  (localStorage.getItem('wwbox.wallpaperMode') as 'default' | 'image' | 'folder') || 'default';
const wallpaper = ref(
  savedWallpaperMode === 'image'
    ? localStorage.getItem('wwbox.wallpaper.image') || localStorage.getItem('wwbox.wallpaper') || ''
    : savedWallpaperMode === 'folder'
      ? localStorage.getItem('wwbox.wallpaper.folder') ||
        localStorage.getItem('wwbox.wallpaper') ||
        ''
      : '',
);
const wallpaperData = ref('');
const wallpaperImageCount = ref(0);
const wallpaperIndex = ref(0);
const wallpaperFileName = ref('');
const wallpaperFit = ref<'cover' | 'contain'>(
  (localStorage.getItem('wwbox.wallpaperFit') as 'cover' | 'contain') || 'cover',
);
const wallpaperRatio = ref<'viewport' | '16-9' | '4-3'>(
  (localStorage.getItem('wwbox.wallpaperRatio') as 'viewport' | '16-9' | '4-3') || 'viewport',
);
const wallpaperZoom = ref(Number(localStorage.getItem('wwbox.wallpaperZoom') || 100));
const wallpaperPositionX = ref(Number(localStorage.getItem('wwbox.wallpaperPositionX') || 50));
const wallpaperPositionY = ref(Number(localStorage.getItem('wwbox.wallpaperPositionY') || 50));
const wallpaperSlideshow = ref(localStorage.getItem('wwbox.wallpaperSlideshow') !== 'false');
const wallpaperIntervalMinutes = ref(
  Number(localStorage.getItem('wwbox.wallpaperIntervalMinutes') || 15),
);
const wallpaperDim = ref(Number(localStorage.getItem('wwbox.wallpaperDim') || 18));
const wallpaperBlur = ref(Number(localStorage.getItem('wwbox.wallpaperBlur') || 0));
const wallpaperFillBlur = ref(Number(localStorage.getItem('wwbox.wallpaperFillBlur') || 28));
const wallpaperFillBrightness = ref(
  Number(localStorage.getItem('wwbox.wallpaperFillBrightness') || 62),
);
const wallpaperFillSaturation = ref(
  Number(localStorage.getItem('wwbox.wallpaperFillSaturation') || 85),
);
const wallpaperFillScale = ref(Number(localStorage.getItem('wwbox.wallpaperFillScale') || 106));
const reduceMotion = ref(localStorage.getItem('wwbox.reduceMotion') === 'true');
const sidebarWallpaper = ref(localStorage.getItem('wwbox.sidebarWallpaper') !== 'false');
const wallpaperMode = ref<'default' | 'image' | 'folder'>(savedWallpaperMode);
const defaultWallpaperDirectory = ref('');
const autoStart = ref(localStorage.getItem('wwbox.autoStart') === 'true');
const closeGameOnExit = ref(localStorage.getItem('wwbox.closeGameOnExit') === 'true');
const installations = ref<GameInstallation[]>([]);
const gameLoading = ref(false);
const gameError = ref<string | null>(null);
const renderMode = ref<GameRenderMode>('default');
const processStates = ref<Record<string, GameProcessState>>({});
const launchingId = ref<string | null>(null);
const updatingId = ref<string | null>(null);
const openingLauncherId = ref<string | null>(null);
const stoppingGame = ref(false);
const versionStates = ref<Record<string, GameVersionState>>({});
const checkingVersions = ref(false);
type QuickGameSettings = {
  displayMode: GameDisplaySettings['displayMode'];
  width: number;
  height: number;
  renderMode: GameRenderMode;
};
const quickSettingsCollapsed = ref(localStorage.getItem('wwbox.quickSettingsCollapsed') === 'true');
const quickSettingsInstallationId = ref('');
const quickSettingsProfileId = ref('general');
const generalQuickSettings = ref<QuickGameSettings>(readGeneralQuickSettings());
const accountQuickSettings = ref<Record<string, QuickGameSettings>>(readAccountQuickSettings());
const displaySettings = ref<GameDisplaySettings | null>(null);
const displaySettingsLoading = ref(false);
const displaySettingsSaving = ref(false);
const displaySettingsMessage = ref('');
const resolutionPresets = ref<Array<{ label: string; width: number; height: number }>>([]);
const selectedGachaInstallationId = ref('');
const gachaMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null);
const accounts = ref<AccountProfile[]>([]);
const accountName = ref('');
const accountPlayerId = ref('');
const accountRegion = ref<AccountRegion>('cn');
const accountInstallationId = ref('');
const accountNote = ref('');
const accountError = ref<string | null>(null);
const redemptionCatalog = ref<RedemptionCodeCatalog | null>(null);
const redemptionRegion = ref<AccountRegion>('cn');
const redemptionLoading = ref(false);
const redemptionError = ref<string | null>(null);
const copiedCode = ref<string | null>(null);
const launcherAccounts = ref<LauncherAccount[]>(readCachedLauncherAccounts());
const selectedLauncherAccountId = ref('');
const kuroHomeWidget = ref<KuroHomeWidget | null>(null);
const launcherLoading = ref(false);
const accountRefreshMinutes = ref(
  Number(localStorage.getItem('wwbox.accountRefreshMinutes') || 120),
);
const lastAccountRefresh = ref(localStorage.getItem('wwbox.lastAccountRefresh') || '');
const gachaAnalysis = ref<GachaAnalysis | null>(null);
const gachaImporting = ref(false);
const gachaUrl = ref('');
const detectedGachaUid = ref('');
const gachaView = ref<'overview' | 'detail' | 'table' | 'versions'>('overview');
const selectedPoolType = ref('');
const gachaPlayers = ref<string[]>([]);
const gachaImages = ref<Record<string, string>>({});
const skipFirstSsr = ref(false);
const gachaHighContrast = ref(localStorage.getItem('wwbox.gachaHighContrast') === 'true');
const gachaHelpOpen = ref(false);
type GachaUrlHistoryItem = { url: string; source: 'custom' | 'game'; usedAt: string };
const gachaUrlHistory = ref<GachaUrlHistoryItem[]>([]);
type GachaTableSortKey = 'time' | 'name' | 'resourceType' | 'qualityLevel' | 'poolType';
type SnapshotRatio = 'phone' | 'desktop' | 'window';
type SnapshotDestination = 'file' | 'clipboard';
const tablePoolType = ref('all');
const tableSortKey = ref<GachaTableSortKey>('time');
const tableSortDirection = ref<'asc' | 'desc'>('desc');
const tablePage = ref(1);
const tablePageSize = ref(readDefaultPageSize());
const snapshotScale = ref(readSnapshotScale());
const snapshotRatio = ref<SnapshotRatio>(readSnapshotRatio());
const snapshotDestination = ref<SnapshotDestination>(readSnapshotDestination());
const snapshotSettingsOpen = ref(false);
const versionMetadata = ref<GachaVersionMetadata[]>(GACHA_VERSION_METADATA);
const versionUpdating = ref(false);
const versionPreview = ref<VersionMetadataUpdatePreview | null>(null);
const versionMessage = ref('');
const versionEditorOpen = ref(false);
const showAllVersions = ref(false);
const versionForm = ref({ version: '', name: '', start: '' });
const currentLauncherAccount = computed(() => {
  const playerId = accounts.value.find((account) => account.active)?.playerId;
  if (playerId) {
    return launcherAccounts.value.find((account) => account.roleId === playerId) ?? null;
  }
  return (
    launcherAccounts.value.find((account) => account.id === selectedLauncherAccountId.value) ?? null
  );
});
const editableQuickSettings = computed(() =>
  quickSettingsProfileId.value === 'general'
    ? generalQuickSettings.value
    : (accountQuickSettings.value[quickSettingsProfileId.value] ?? generalQuickSettings.value),
);
const activeAccount = computed(() => accounts.value.find((item) => item.active) ?? null);
const currentPlayerId = computed(
  () => activeAccount.value?.playerId ?? currentLauncherAccount.value?.roleId ?? '',
);
const displayedRoleCount = computed(
  () => kuroHomeWidget.value?.roleCount ?? currentLauncherAccount.value?.roleCount ?? null,
);
const displayedWeeklyTravelScore = computed(
  () =>
    kuroHomeWidget.value?.weeklyTravelScore ??
    currentLauncherAccount.value?.weeklyTravelScore ??
    null,
);
const displayedWeeklyTravelMax = computed(() => kuroHomeWidget.value?.weeklyTravelMax ?? 6000);
const displayedResonatorIcon = computed(
  () => kuroHomeWidget.value?.resonatorIcon || resonatorsIcon,
);
const displayedWeeklyTravelIcon = computed(
  () => kuroHomeWidget.value?.weeklyTravelIcon || weeklyTravelIcon,
);
const availableRedemptionCodes = computed(() =>
  (['cn', 'global'] as const).flatMap((region) =>
    (redemptionCatalog.value?.[region] ?? [])
      .filter((item) => item.valid && !item.used)
      .map((item) => ({ ...item, region })),
  ),
);
const useDefaultHighlightSides = computed(
  () =>
    !highlightTop.value && !highlightRight.value && !highlightBottom.value && !highlightLeft.value,
);
const effectiveHighlightTop = computed(() => highlightTop.value);
const effectiveHighlightRight = computed(() => highlightRight.value);
const effectiveHighlightBottom = computed(
  () => highlightBottom.value || useDefaultHighlightSides.value,
);
const effectiveHighlightLeft = computed(
  () => highlightLeft.value || useDefaultHighlightSides.value,
);
const appThemeStyle = computed(() => ({
  '--panel-opacity': String(Math.min(100, Math.max(0, themeOpacity.value)) / 100),
  '--wallpaper': wallpaperData.value ? `url("${wallpaperData.value}")` : 'none',
  '--wallpaper-fit': wallpaperFit.value,
  '--wallpaper-zoom': String(wallpaperZoom.value / 100),
  '--wallpaper-x': `${wallpaperPositionX.value}%`,
  '--wallpaper-y': `${wallpaperPositionY.value}%`,
  '--wallpaper-dim': String(wallpaperDim.value / 100),
  '--wallpaper-blur': `${wallpaperBlur.value}px`,
  '--wallpaper-fill-blur': `${wallpaperFillBlur.value}px`,
  '--wallpaper-fill-brightness': String(wallpaperFillBrightness.value / 100),
  '--wallpaper-fill-saturation': String(wallpaperFillSaturation.value / 100),
  '--wallpaper-fill-scale': String(wallpaperFillScale.value / 100),
  '--selection-highlight-color': highlightColor.value,
  '--selection-highlight-top': effectiveHighlightTop.value ? `${highlightWidth.value}px` : '0px',
  '--selection-highlight-right': effectiveHighlightRight.value
    ? `${highlightWidth.value}px`
    : '0px',
  '--selection-highlight-bottom': effectiveHighlightBottom.value
    ? `${highlightWidth.value}px`
    : '0px',
  '--selection-highlight-left': effectiveHighlightLeft.value ? `${highlightWidth.value}px` : '0px',
  '--selection-hover-color': hoverHighlightColor.value,
}));
const highlightScopeClasses = computed(() => ({
  'highlight-scope-navigation': highlightNavigation.value,
  'highlight-scope-tabs': highlightTabs.value,
  'highlight-scope-options': highlightOptions.value,
  'highlight-default-navigation': !highlightNavigation.value,
  'highlight-default-tabs': !highlightTabs.value,
  'highlight-default-options': !highlightOptions.value,
  'highlight-scope-gacha-contrast': highlightGachaContrast.value,
  [`hover-style-${hoverHighlightStyle.value}`]: true,
}));
const selectedPool = computed(
  () =>
    gachaAnalysis.value?.pools.find((pool) => pool.poolType === selectedPoolType.value) ??
    gachaAnalysis.value?.pools[0] ??
    null,
);
const primaryPools = computed(() => {
  const pools = gachaAnalysis.value?.pools ?? [];
  return pools.filter((pool) => ['1', '2', '3', '4'].includes(pool.poolType) || pool.total > 0);
});
const selectedPoolRecords = computed(
  () =>
    gachaAnalysis.value?.recentRecords.filter(
      (record) => record.poolType === selectedPool.value?.poolType,
    ) ?? [],
);
const selectedRarity = computed(() => {
  const total = selectedPoolRecords.value.length || 1;
  const five = selectedPoolRecords.value.filter((record) => record.qualityLevel === 5).length;
  const four = selectedPoolRecords.value.filter((record) => record.qualityLevel === 4).length;
  return {
    five,
    four,
    three: Math.max(0, total - five - four),
    fiveRate: (five / total) * 100,
    fourRate: (four / total) * 100,
  };
});
const tableRecords = computed(() => {
  const records = (gachaAnalysis.value?.recentRecords ?? []).filter(
    (record) => tablePoolType.value === 'all' || record.poolType === tablePoolType.value,
  );
  const direction = tableSortDirection.value === 'asc' ? 1 : -1;
  return [...records].sort((left, right) => {
    const leftValue = left[tableSortKey.value];
    const rightValue = right[tableSortKey.value];
    return (
      direction *
      (typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), 'zh-CN', { numeric: true }))
    );
  });
});
const tablePageCount = computed(() =>
  tablePageSize.value === 0
    ? 1
    : Math.max(1, Math.ceil(tableRecords.value.length / tablePageSize.value)),
);
const pagedTableRecords = computed(() => {
  if (tablePageSize.value === 0) return tableRecords.value;
  const page = Math.min(tablePage.value, tablePageCount.value);
  const start = (page - 1) * tablePageSize.value;
  return tableRecords.value.slice(start, start + tablePageSize.value);
});
const versionSummaries = computed(() =>
  versionMetadata.value
    .map((metadata) => {
      const records = (gachaAnalysis.value?.recentRecords ?? []).filter(
        (record) =>
          ['1', '2', '10', '11'].includes(record.poolType) &&
          findGachaVersion(record.time, versionMetadata.value)?.version === metadata.version,
      );
      const itemMap = new Map<
        number,
        {
          resourceId: number;
          name: string;
          count: number;
          qualityLevel: number;
          featured: boolean | null;
        }
      >();
      for (const record of records.filter((item) => item.qualityLevel >= 4)) {
        const existing = itemMap.get(record.resourceId);
        const featured = analyzedFeatured(record);
        if (existing) existing.count++;
        else
          itemMap.set(record.resourceId, {
            resourceId: record.resourceId,
            name: record.name,
            count: 1,
            qualityLevel: record.qualityLevel,
            featured: record.qualityLevel === 5 ? featured : null,
          });
      }
      return {
        metadata,
        total: records.length,
        five: records.filter((record) => record.qualityLevel === 5).length,
        four: records.filter((record) => record.qualityLevel === 4).length,
        featuredFive: records.filter((record) => {
          return record.qualityLevel === 5 && analyzedFeatured(record) === true;
        }).length,
        unknownFive: records.filter(
          (record) => record.qualityLevel === 5 && analyzedFeatured(record) === null,
        ).length,
        items: [...itemMap.values()].sort((left, right) => right.qualityLevel - left.qualityLevel),
      };
    })
    .filter((summary) => showAllVersions.value || summary.total > 0),
);
watch([tablePoolType, tableSortKey, tableSortDirection, tablePageSize], () => {
  tablePage.value = 1;
});
watch(gachaUrl, (value) => {
  detectedGachaUid.value = identifyUidFromUrl(value) ?? '';
});
watch(currentPlayerId, () => {
  void loadKuroHomeWidget();
  if (page.value === 'gacha') void syncGachaAccount();
});
watch(page, (value) => {
  if (value === 'home') void loadKuroHomeWidget();
});
const gachaSummary = computed(() => {
  const pools = primaryPools.value;
  const total = pools.reduce((sum, pool) => sum + pool.total, 0);
  const stars = pools.flatMap((pool) => visibleFiveStars(pool));
  const average = stars.length ? stars.reduce((sum, star) => sum + star.pity, 0) / stars.length : 0;
  const characterPool = pools.find((pool) => pool.poolType === '1');
  const weaponPool = pools.find((pool) => pool.poolType === '2');
  const characterStars = characterPool ? visibleFiveStars(characterPool) : [];
  const characterEventStars = characterStars.filter((star) => star.featured === true);
  const characterAverage = characterEventStars.length
    ? characterEventStars.reduce((sum, star) => sum + star.pity, 0) / characterEventStars.length
    : 0;
  const weaponStars = weaponPool ? visibleFiveStars(weaponPool) : [];
  const weaponAverage = weaponStars.length
    ? weaponStars.reduce((sum, star) => sum + star.pity, 0) / weaponStars.length
    : 0;
  let characterUpStreak = 0;
  for (const star of characterStars) {
    if (star.featured !== true) break;
    characterUpStreak++;
  }
  const currentPities = pools.map((pool) => pool.pity);
  return {
    total,
    stars: stars.length,
    average,
    characterAverage,
    weaponAverage,
    characterUpStreak,
    luckScore: average ? Math.max(1, Math.min(99.9, 100 - (average / 80) * 100)) : 0,
    characterPity: pools.find((pool) => pool.poolType === '1')?.pity ?? 0,
    weaponPity: pools.find((pool) => pool.poolType === '2')?.pity ?? 0,
    maxPity: Math.max(0, ...currentPities),
  };
});
let processPolling: ReturnType<typeof setInterval> | null = null;
let wallpaperPolling: ReturnType<typeof setInterval> | null = null;
let accountRefreshPolling: ReturnType<typeof setInterval> | null = null;
function scheduleWallpaperRotation(): void {
  if (wallpaperPolling) clearInterval(wallpaperPolling);
  wallpaperPolling = null;
  if (wallpaperMode.value !== 'folder' || !wallpaperSlideshow.value) return;
  wallpaperPolling = setInterval(
    () => void switchWallpaper(1),
    Math.max(1, wallpaperIntervalMinutes.value) * 60_000,
  );
}
watch([wallpaperMode, wallpaperSlideshow, wallpaperIntervalMinutes], scheduleWallpaperRotation);
function scheduleAccountRefresh(): void {
  if (accountRefreshPolling) clearInterval(accountRefreshPolling);
  accountRefreshPolling = null;
  if (accountRefreshMinutes.value <= 0) return;
  accountRefreshPolling = setInterval(
    () => void scanLauncherAccounts(),
    Math.max(15, accountRefreshMinutes.value) * 60_000,
  );
}
watch(accountRefreshMinutes, scheduleAccountRefresh);

async function checkHealth(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    if (!window.wwbox) throw new Error('PRELOAD_BRIDGE_UNAVAILABLE');
    info.value = await window.wwbox.system.health();
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'HELPER_UNAVAILABLE';
  } finally {
    loading.value = false;
  }
}

async function loadSavedGames(): Promise<void> {
  try {
    installations.value = await window.wwbox.game.listInstallations();
    if (!quickSettingsInstallationId.value && installations.value[0]) {
      quickSettingsInstallationId.value = installations.value[0].id;
    }
    await loadDisplaySettings();
  } catch (reason) {
    gameError.value = reason instanceof Error ? reason.message : 'DATABASE_UNAVAILABLE';
  }
}

async function openGachaPage(): Promise<void> {
  page.value = 'gacha';
  gachaMessage.value = null;
  await loadSavedGames();
  if (!selectedGachaInstallationId.value && installations.value[0]) {
    selectedGachaInstallationId.value = installations.value[0].id;
  }
  await syncGachaAccount();
  selectedPoolType.value =
    gachaAnalysis.value?.pools.find((pool) => pool.total > 0)?.poolType ?? '1';
  await loadGachaImages();
  loadGachaUrlHistory();
  await loadVersionMetadata();
}

async function syncGachaAccount(): Promise<void> {
  gachaPlayers.value = await window.wwbox.gachaAnalysis.players();
  const playerId = currentPlayerId.value;
  gachaAnalysis.value =
    playerId && gachaPlayers.value.includes(playerId)
      ? await window.wwbox.gachaAnalysis.get(playerId)
      : await window.wwbox.gachaAnalysis.get();
}

async function loadVersionMetadata(): Promise<void> {
  versionMetadata.value = await window.wwbox.versionMetadata.list();
}

async function previewVersionUpdate(): Promise<void> {
  versionUpdating.value = true;
  versionMessage.value = '';
  try {
    const preview = await window.wwbox.versionMetadata.previewUpdate();
    if (preview.conflicts.length) versionPreview.value = preview;
    else {
      versionMetadata.value = await window.wwbox.versionMetadata.applyUpdate(preview, 'overwrite');
      versionMessage.value = `已更新 ${preview.entries.length} 条版本信息，无本地冲突。`;
    }
  } catch (reason) {
    versionMessage.value = `更新失败：${describeError(reason)}`;
  } finally {
    versionUpdating.value = false;
  }
}

async function applyVersionUpdate(strategy: 'overwrite' | 'preserve'): Promise<void> {
  if (!versionPreview.value) return;
  versionUpdating.value = true;
  try {
    const plainPreview = JSON.parse(
      JSON.stringify(versionPreview.value),
    ) as VersionMetadataUpdatePreview;
    versionMetadata.value = await window.wwbox.versionMetadata.applyUpdate(plainPreview, strategy);
    versionMessage.value =
      strategy === 'overwrite'
        ? '已使用官网信息覆盖冲突项。'
        : '已更新无冲突项，并保留本地冲突信息。';
    versionPreview.value = null;
  } catch (reason) {
    versionMessage.value = `应用更新失败：${describeError(reason)}`;
  } finally {
    versionUpdating.value = false;
  }
}

function editVersionMetadata(entry: GachaVersionMetadata): void {
  versionForm.value = {
    version: entry.version,
    name: entry.name,
    start: entry.start.replace(' ', 'T').slice(0, 16),
  };
  versionEditorOpen.value = true;
}

async function removeVersionMetadata(entry: GachaVersionMetadata): Promise<void> {
  if (!window.confirm(`确定删除 V${entry.version} ${entry.name}？`)) return;
  try {
    versionMetadata.value = await window.wwbox.versionMetadata.remove(entry.version);
    versionMessage.value = `已删除 V${entry.version}。`;
  } catch (reason) {
    versionMessage.value = `删除失败：${describeError(reason)}`;
  }
}

async function saveVersionMetadata(): Promise<void> {
  try {
    versionMetadata.value = await window.wwbox.versionMetadata.save({ ...versionForm.value });
    versionMessage.value = `已保存 V${versionForm.value.version} ${versionForm.value.name}。`;
    versionEditorOpen.value = false;
    versionForm.value = { version: '', name: '', start: '' };
  } catch (reason) {
    versionMessage.value = `保存失败：${describeError(reason)}`;
  }
}

async function importGachaRecords(): Promise<void> {
  if (!gachaUrl.value.trim()) {
    gachaMessage.value = { type: 'error', text: '请先输入链接，或点击“获取链接”。' };
    return;
  }
  if (!selectedGachaInstallationId.value) return;
  gachaImporting.value = true;
  gachaMessage.value = null;
  try {
    const result = await window.wwbox.gachaAnalysis.import({
      installationId: selectedGachaInstallationId.value,
      url: gachaUrl.value || null,
    });
    gachaUrl.value = result.url;
    addGachaUrlHistory(result.url, 'custom');
    gachaAnalysis.value = result.analysis;
    detectedGachaUid.value = result.analysis.playerId;
    await loadGachaImages();
    gachaPlayers.value = await window.wwbox.gachaAnalysis.players();
    if (!result.analysis.pools.some((pool) => pool.poolType === selectedPoolType.value))
      selectedPoolType.value =
        result.analysis.pools.find((pool) => pool.total > 0)?.poolType ?? '1';
    gachaMessage.value = {
      type: 'success',
      text: `已导入并分析 ${gachaAnalysis.value.total} 条唤取记录`,
    };
  } catch (reason) {
    gachaMessage.value = { type: 'error', text: `导入失败：${describeError(reason)}` };
  } finally {
    gachaImporting.value = false;
  }
}
async function acquireGachaUrl(): Promise<void> {
  if (!selectedGachaInstallationId.value) return;
  gachaImporting.value = true;
  gachaMessage.value = null;
  try {
    const url = await window.wwbox.gachaAnalysis.acquireUrl(selectedGachaInstallationId.value);
    gachaUrl.value = url;
    addGachaUrlHistory(url, 'game');
    gachaMessage.value = { type: 'success', text: '已从游戏日志获取唤取链接。' };
  } catch (reason) {
    gachaMessage.value = { type: 'error', text: `获取失败：${describeError(reason)}` };
  } finally {
    gachaImporting.value = false;
  }
}
async function copyGachaUrl(): Promise<void> {
  if (!gachaUrl.value.trim()) return;
  try {
    await window.wwbox.gachaAnalysis.copyUrl(gachaUrl.value);
    gachaMessage.value = { type: 'success', text: '链接已复制到剪贴板。' };
  } catch (reason) {
    gachaMessage.value = { type: 'error', text: `复制失败：${describeError(reason)}` };
  }
}
function loadGachaUrlHistory(): void {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('wwbox.gachaUrlHistory') ?? '[]');
    if (Array.isArray(value)) gachaUrlHistory.value = value.slice(0, 12) as GachaUrlHistoryItem[];
  } catch {
    gachaUrlHistory.value = [];
  }
}
function addGachaUrlHistory(url: string, source: GachaUrlHistoryItem['source']): void {
  gachaUrlHistory.value = [
    { url, source, usedAt: new Date().toISOString() },
    ...gachaUrlHistory.value.filter((item) => item.url !== url),
  ].slice(0, 12);
  localStorage.setItem('wwbox.gachaUrlHistory', JSON.stringify(gachaUrlHistory.value));
}
async function exportGacha(): Promise<void> {
  if (gachaAnalysis.value) await window.wwbox.gachaAnalysis.export(gachaAnalysis.value.playerId);
}
async function snapshotGacha(): Promise<void> {
  const element = document.querySelector<HTMLElement>('.analysis-export-content');
  if (!element) return;
  const originalStyle = element.style.cssText;
  const originalRatio = element.dataset.snapshotRatio;
  const currentWidth = Math.ceil(element.getBoundingClientRect().width);
  document.body.classList.add('capturing-analysis');
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  try {
    const { width, height } = await resolveSnapshotLayout(
      element,
      snapshotRatio.value,
      currentWidth,
    );
    const blob = await toBlob(element, {
      width,
      height,
      backgroundColor: gachaHighContrast.value
        ? '#160d09'
        : themeStyle.value === 'light'
          ? '#eef4f5'
          : themeStyle.value === 'glass'
            ? '#10252c'
            : '#071116',
      pixelRatio: snapshotScale.value,
      filter: (node) =>
        !(node instanceof Element) ||
        (!node.classList.contains('version-editor') &&
          !node.classList.contains('version-manager-list')),
      style: {
        width: `${width}px`,
        height: `${height}px`,
        maxHeight: 'none',
        overflow: 'hidden',
      },
    });
    if (!blob) throw new Error('SNAPSHOT_RENDER_FAILED');
    const exported = await window.wwbox.gachaAnalysis.snapshot({
      png: new Uint8Array(await blob.arrayBuffer()),
      destination: snapshotDestination.value,
    });
    if (exported) {
      const exportedAt = new Date().toLocaleString('zh-CN', { hour12: false });
      gachaMessage.value = {
        type: 'success',
        text: `${snapshotDestination.value === 'clipboard' ? '完整分析快照已复制到剪贴板' : '完整分析快照已导出'} · ${exportedAt}`,
      };
    }
  } finally {
    element.style.cssText = originalStyle;
    if (originalRatio) element.dataset.snapshotRatio = originalRatio;
    else delete element.dataset.snapshotRatio;
    document.body.classList.remove('capturing-analysis');
  }
}
async function resolveSnapshotLayout(
  element: HTMLElement,
  ratioMode: SnapshotRatio,
  currentWidth: number,
): Promise<{ width: number; height: number }> {
  const width = ratioMode === 'phone' ? 720 : ratioMode === 'desktop' ? 1600 : currentWidth;
  element.dataset.snapshotRatio = ratioMode;
  element.style.setProperty('--snapshot-width', `${width}px`);
  element.style.removeProperty('--snapshot-height');
  element.style.width = `${width}px`;
  element.style.minWidth = `${width}px`;
  element.style.maxWidth = `${width}px`;
  element.style.height = 'auto';
  element.style.minHeight = '0';
  element.style.maxHeight = 'none';
  element.style.overflow = 'visible';
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const height = Math.ceil(element.scrollHeight) + 4;
  element.style.setProperty('--snapshot-height', `${height}px`);
  element.style.height = `${height}px`;
  return { width, height };
}
async function deleteGacha(): Promise<void> {
  if (!gachaAnalysis.value || !window.confirm('确定删除该玩家的全部本地唤取记录？')) return;
  await window.wwbox.gachaAnalysis.delete(gachaAnalysis.value.playerId);
  gachaAnalysis.value = null;
  gachaUrl.value = '';
}
async function selectGachaPlayer(playerId: string): Promise<void> {
  gachaAnalysis.value = await window.wwbox.gachaAnalysis.get(playerId);
  await loadGachaImages();
  selectedPoolType.value =
    gachaAnalysis.value?.pools.find((pool) => pool.total > 0)?.poolType ?? '1';
}

async function selectGachaUid(playerId: string, event?: Event): Promise<void> {
  if (playerId && gachaPlayers.value.includes(playerId)) await selectGachaPlayer(playerId);
  (
    (event?.currentTarget as HTMLElement | null)?.closest('[popover]') as HTMLElement | null
  )?.hidePopover();
}

function closePopover(id: string): void {
  document.getElementById(id)?.hidePopover();
}

function removeGachaUrlHistory(url: string): void {
  gachaUrlHistory.value = gachaUrlHistory.value.filter((item) => item.url !== url);
  localStorage.setItem('wwbox.gachaUrlHistory', JSON.stringify(gachaUrlHistory.value));
}

function identifyUidFromUrl(value: string): string | null {
  try {
    const parsed = new URL(value.trim());
    const query =
      parsed.search ||
      (parsed.hash.includes('?') ? `?${parsed.hash.split('?').slice(1).join('?')}` : '');
    const params = new URLSearchParams(query);
    const uid = params.get('playerId') ?? params.get('player_id');
    return uid && /^\d{5,20}$/.test(uid) ? uid : null;
  } catch {
    return null;
  }
}
async function loadGachaImages(): Promise<void> {
  if (!gachaAnalysis.value) return;
  const resources = [
    ...new Map(
      gachaAnalysis.value.recentRecords
        .filter((record) => record.qualityLevel >= 4 && record.resourceId > 0)
        .map((record) => [
          record.resourceId,
          { resourceId: record.resourceId, name: record.name, resourceType: record.resourceType },
        ]),
    ).values(),
  ];
  gachaImages.value = await window.wwbox.gachaAnalysis.images(resources);
}

async function openHome(): Promise<void> {
  page.value = 'home';
  await Promise.all([checkHealth(), loadSavedGames(), loadAccounts()]);
}

async function scanLauncherAccounts(): Promise<void> {
  launcherLoading.value = true;
  accountError.value = null;
  try {
    const cached = launcherAccounts.value;
    const refreshed = await window.wwbox.account.scanLauncher();
    launcherAccounts.value = refreshed.map((account) => {
      if (!account.errorCode) return account;
      const previous = cached.find(
        (item) => item.id === account.id || (!!account.roleId && item.roleId === account.roleId),
      );
      return previous?.roleId ? previous : account;
    });
    localStorage.setItem('wwbox.launcherAccountCache', JSON.stringify(launcherAccounts.value));
    lastAccountRefresh.value = new Date().toISOString();
    localStorage.setItem('wwbox.lastAccountRefresh', lastAccountRefresh.value);
    if (!selectedLauncherAccountId.value && launcherAccounts.value[0])
      selectedLauncherAccountId.value = launcherAccounts.value[0].id;
  } catch (reason) {
    accountError.value = describeError(reason);
  } finally {
    launcherLoading.value = false;
  }
}

async function loadKuroHomeWidget(): Promise<void> {
  const playerId = currentPlayerId.value;
  const requestId = ++kuroHomeWidgetRequestId;
  if (!playerId) {
    kuroHomeWidget.value = null;
    return;
  }
  try {
    const widget = await window.wwbox.kuro.homeWidget(playerId);
    if (requestId === kuroHomeWidgetRequestId && currentPlayerId.value === playerId)
      kuroHomeWidget.value = widget;
  } catch {
    if (requestId === kuroHomeWidgetRequestId && currentPlayerId.value === playerId)
      kuroHomeWidget.value = null;
  }
}

let kuroHomeWidgetRequestId = 0;

async function loadDisplayResolutions(): Promise<void> {
  const available = await window.wwbox.game.listDisplayResolutions().catch(() => []);
  const current = displaySettings.value
    ? [{ width: displaySettings.value.width, height: displaySettings.value.height }]
    : [];
  resolutionPresets.value = [...available, ...current]
    .filter(
      (item, index, values) =>
        values.findIndex((value) => value.width === item.width && value.height === item.height) ===
        index,
    )
    .sort((left, right) => right.width * right.height - left.width * left.height)
    .map((item) => ({ ...item, label: `${item.width} x ${item.height}` }));
}

function readCachedLauncherAccounts(): LauncherAccount[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem('wwbox.launcherAccountCache') || '[]');
    return Array.isArray(parsed)
      ? (parsed as LauncherAccount[]).map((account) =>
          account.roleId ? { ...account, errorCode: null } : account,
        )
      : [];
  } catch {
    return [];
  }
}

async function loginOtherAccount(): Promise<void> {
  accountError.value = null;
  await loadSavedGames();
  const game = installations.value[0];
  if (!game) {
    accountError.value = '请先添加游戏安装。';
    return;
  }
  accountManagerOpen.value = false;
  await launchGame(game);
  const timer = setInterval(async () => {
    const state = await window.wwbox.game.getProcessState(game.rootPath).catch(() => null);
    if (state?.running) return;
    clearInterval(timer);
    await scanLauncherAccounts();
    accountManagerOpen.value = true;
  }, 3_000);
}

async function loadAccounts(): Promise<void> {
  try {
    accounts.value = await window.wwbox.account.list();
  } catch (reason) {
    accountError.value = describeError(reason);
  }
}

async function saveAccount(): Promise<void> {
  accountError.value = null;
  try {
    await window.wwbox.account.save({
      ...(editingAccountId.value ? { id: editingAccountId.value } : {}),
      displayName: accountName.value,
      playerId: accountPlayerId.value || null,
      region: accountRegion.value,
      installationId: accountInstallationId.value || null,
      note: accountNote.value || null,
    });
    accountName.value = '';
    accountPlayerId.value = '';
    accountInstallationId.value = '';
    accountNote.value = '';
    editingAccountId.value = undefined;
    await loadAccounts();
  } catch (reason) {
    accountError.value = describeError(reason);
  }
}

function editAccount(account: AccountProfile): void {
  editingAccountId.value = account.id;
  accountName.value = account.displayName;
  accountPlayerId.value = account.playerId ?? '';
  accountRegion.value = account.region;
  accountInstallationId.value = account.installationId ?? '';
  accountNote.value = account.note ?? '';
}

function closeAccountEditor(): void {
  editingAccountId.value = undefined;
  accountError.value = null;
}

function closeAccountManager(): void {
  closeAccountEditor();
  accountManagerOpen.value = false;
}

function toggleSidebar(): void {
  sidebarCollapsed.value = !sidebarCollapsed.value;
  localStorage.setItem('wwbox.sidebarCollapsed', String(sidebarCollapsed.value));
}

function controlWindow(action: 'minimize' | 'toggleMaximize' | 'close'): void {
  void window.wwbox.system.controlWindow(action);
}

async function refreshHome(): Promise<void> {
  await Promise.all([checkHealth(), loadSavedGames(), loadAccounts(), scanLauncherAccounts()]);
}

async function chooseWallpaper(mode: 'image' | 'folder'): Promise<void> {
  const selected = await window.wwbox.system.chooseWallpaper(mode);
  if (!selected) return;
  wallpaperMode.value = selected.mode;
  wallpaper.value = selected.sourcePath;
  localStorage.setItem(`wwbox.wallpaper.${mode}`, selected.sourcePath);
  wallpaperData.value = selected.dataUrl;
  wallpaperImageCount.value = selected.imageCount;
  wallpaperIndex.value = selected.currentIndex;
  wallpaperFileName.value = selected.fileName;
  themeStyle.value = 'glass';
  themeOpacity.value = Math.min(themeOpacity.value, 72);
  await saveAppearance();
}

async function setWallpaperMode(mode: 'default' | 'image' | 'folder'): Promise<void> {
  wallpaperMode.value = mode;
  wallpaper.value = mode === 'default' ? '' : localStorage.getItem(`wwbox.wallpaper.${mode}`) || '';
  wallpaperData.value = '';
  wallpaperFileName.value = '';
  wallpaperImageCount.value = 0;
  wallpaperIndex.value = 0;
  await loadWallpaper();
  await saveAppearance();
}

async function loadWallpaper(index?: number): Promise<void> {
  if (wallpaperMode.value !== 'default' && !wallpaper.value) return;
  const loaded = await window.wwbox.system.loadWallpaper(
    wallpaperMode.value,
    wallpaper.value,
    index,
  );
  if (!loaded) {
    wallpaperData.value = '';
    wallpaperImageCount.value = 0;
    return;
  }
  wallpaperData.value = loaded.dataUrl;
  wallpaperImageCount.value = loaded.imageCount;
  wallpaperIndex.value = loaded.currentIndex;
  wallpaperFileName.value = loaded.fileName;
}

async function switchWallpaper(direction: -1 | 1): Promise<void> {
  if (wallpaperMode.value !== 'folder' || wallpaperImageCount.value < 2) return;
  const next =
    (wallpaperIndex.value + direction + wallpaperImageCount.value) % wallpaperImageCount.value;
  await loadWallpaper(next);
}

async function saveAppearance(): Promise<void> {
  localStorage.setItem('wwbox.themeStyle', themeStyle.value);
  localStorage.setItem('wwbox.themeOpacity', String(themeOpacity.value));
  localStorage.setItem('wwbox.highlightTop', String(highlightTop.value));
  localStorage.setItem('wwbox.highlightRight', String(highlightRight.value));
  localStorage.setItem('wwbox.highlightBottom', String(highlightBottom.value));
  localStorage.setItem('wwbox.highlightLeft', String(highlightLeft.value));
  localStorage.setItem('wwbox.highlightColor', highlightColor.value);
  localStorage.setItem('wwbox.highlightWidth', String(highlightWidth.value));
  localStorage.setItem('wwbox.highlightNavigation', String(highlightNavigation.value));
  localStorage.setItem('wwbox.highlightTabs', String(highlightTabs.value));
  localStorage.setItem('wwbox.highlightOptions', String(highlightOptions.value));
  localStorage.setItem('wwbox.highlightGachaContrast', String(highlightGachaContrast.value));
  localStorage.setItem('wwbox.hoverHighlightColor', hoverHighlightColor.value);
  localStorage.setItem('wwbox.hoverHighlightStyle', hoverHighlightStyle.value);
  localStorage.setItem('wwbox.wallpaper', wallpaper.value);
  localStorage.setItem('wwbox.wallpaperMode', wallpaperMode.value);
  localStorage.setItem('wwbox.wallpaperFit', wallpaperFit.value);
  localStorage.setItem('wwbox.wallpaperRatio', wallpaperRatio.value);
  localStorage.setItem('wwbox.wallpaperZoom', String(wallpaperZoom.value));
  localStorage.setItem('wwbox.wallpaperPositionX', String(wallpaperPositionX.value));
  localStorage.setItem('wwbox.wallpaperPositionY', String(wallpaperPositionY.value));
  localStorage.setItem('wwbox.wallpaperSlideshow', String(wallpaperSlideshow.value));
  localStorage.setItem('wwbox.wallpaperIntervalMinutes', String(wallpaperIntervalMinutes.value));
  localStorage.setItem('wwbox.wallpaperDim', String(wallpaperDim.value));
  localStorage.setItem('wwbox.wallpaperBlur', String(wallpaperBlur.value));
  localStorage.setItem('wwbox.wallpaperFillBlur', String(wallpaperFillBlur.value));
  localStorage.setItem('wwbox.wallpaperFillBrightness', String(wallpaperFillBrightness.value));
  localStorage.setItem('wwbox.wallpaperFillSaturation', String(wallpaperFillSaturation.value));
  localStorage.setItem('wwbox.wallpaperFillScale', String(wallpaperFillScale.value));
  localStorage.setItem('wwbox.reduceMotion', String(reduceMotion.value));
  localStorage.setItem('wwbox.sidebarWallpaper', String(sidebarWallpaper.value));
  localStorage.setItem('wwbox.accountRefreshMinutes', String(accountRefreshMinutes.value));
  localStorage.setItem('wwbox.autoStart', String(autoStart.value));
  localStorage.setItem('wwbox.closeGameOnExit', String(closeGameOnExit.value));
  await window.wwbox.system.setAutoStart(autoStart.value);
  await window.wwbox.system.setCloseGameOnExit(closeGameOnExit.value);
}

async function importLauncherAccount(account: LauncherAccount): Promise<void> {
  await window.wwbox.account.activateLauncher(account.id);
  const profile = await window.wwbox.account.save({
    displayName: account.roleName || account.label,
    playerId: account.roleId,
    region: account.region,
    note: '从官方启动器导入',
  });
  await window.wwbox.account.activate(profile.id);
  selectedLauncherAccountId.value = account.id;
  await loadAccounts();
  if (closeAccountManagerAfterSwitch.value) accountManagerOpen.value = false;
}

async function activateAccount(id: string): Promise<void> {
  accountError.value = null;
  try {
    const target = accounts.value.find((account) => account.id === id);
    const launcherAccount = launcherAccounts.value.find(
      (account) => account.roleId === target?.playerId,
    );
    if (launcherAccount) await window.wwbox.account.activateLauncher(launcherAccount.id);
    await window.wwbox.account.activate(id);
    selectedLauncherAccountId.value = launcherAccount?.id ?? '';
    await loadAccounts();
    if (closeAccountManagerAfterSwitch.value) accountManagerOpen.value = false;
  } catch (reason) {
    accountError.value = describeError(reason);
  }
}

function saveAccountSwitchPreference(): void {
  localStorage.setItem(
    'wwbox.closeAccountManagerAfterSwitch',
    String(closeAccountManagerAfterSwitch.value),
  );
}

async function removeAccount(id: string): Promise<void> {
  await window.wwbox.account.remove(id);
  await loadAccounts();
}

async function openRedemptionPage(forceRefresh = false): Promise<void> {
  page.value = 'redemption';
  await loadRedemptionCodes(forceRefresh);
}

async function loadRedemptionCodes(forceRefresh = false): Promise<void> {
  redemptionLoading.value = true;
  redemptionError.value = null;
  try {
    redemptionCatalog.value = await window.wwbox.redemption.list(forceRefresh);
    if (redemptionCatalog.value.errorCode)
      redemptionError.value =
        redemptionCatalog.value.errorCode === 'REDEMPTION_SOURCE_TLS_INVALID'
          ? '主数据源证书异常，安全备用源也暂时不可用'
          : '实时数据源与安全备用源暂时不可用，请稍后重试';
  } catch (reason) {
    redemptionError.value = describeError(reason);
  } finally {
    redemptionLoading.value = false;
  }
}

async function copyRedemptionCode(code: string): Promise<void> {
  await window.wwbox.redemption.copy(code);
  copiedCode.value = code;
  setTimeout(() => {
    if (copiedCode.value === code) copiedCode.value = null;
  }, 1600);
}

async function toggleRedemptionUsed(code: string, used: boolean): Promise<void> {
  redemptionError.value = null;
  try {
    redemptionCatalog.value = await window.wwbox.redemption.markUsed(
      redemptionRegion.value,
      code,
      used,
    );
  } catch (reason) {
    redemptionError.value = describeError(reason);
  }
}

async function launchGame(game: GameInstallation): Promise<void> {
  gameError.value = null;
  launchingId.value = game.id;
  try {
    if (currentLauncherAccount.value?.id) {
      await window.wwbox.account.activateLauncher(currentLauncherAccount.value.id);
    }
    const settings = effectiveQuickSettings();
    await window.wwbox.game
      .saveDisplaySettings(game.id, {
        displayMode: settings.displayMode,
        width: settings.width,
        height: settings.height,
      })
      .catch(() => null);
    const state = await window.wwbox.game.launch({
      rootPath: game.rootPath,
      renderMode: settings.renderMode,
      displayMode: settings.displayMode,
      width: settings.width,
      height: settings.height,
    });
    processStates.value[state.installationId] = state;
  } catch (reason) {
    gameError.value = describeError(reason);
  } finally {
    launchingId.value = null;
  }
}

async function openOfficialLauncher(game: GameInstallation): Promise<void> {
  gameError.value = null;
  openingLauncherId.value = game.id;
  try {
    await window.wwbox.game.openUpdater(game.id);
  } catch (reason) {
    gameError.value = describeError(reason);
  } finally {
    openingLauncherId.value = null;
  }
}

async function stopGame(): Promise<void> {
  stoppingGame.value = true;
  gameError.value = null;
  try {
    await window.wwbox.game.stopAll();
    await refreshProcessStates();
  } catch (reason) {
    gameError.value = describeError(reason);
  } finally {
    stoppingGame.value = false;
  }
}

function launcherAccountForProfile(profile: AccountProfile): LauncherAccount | null {
  return launcherAccounts.value.find((account) => account.roleId === profile.playerId) ?? null;
}

async function updateGame(game: GameInstallation): Promise<void> {
  gameError.value = null;
  updatingId.value = game.id;
  try {
    await window.wwbox.game.openUpdater(game.id);
  } catch (reason) {
    gameError.value = describeError(reason);
  } finally {
    updatingId.value = null;
  }
}

async function runGameAction(game: GameInstallation): Promise<void> {
  if (versionStates.value[game.id]?.status === 'updateAvailable') await updateGame(game);
  else await launchGame(game);
}

async function removeGame(game: GameInstallation): Promise<void> {
  if (processStates.value[game.id]?.running) return;
  gameError.value = null;
  try {
    await window.wwbox.game.removeInstallation(game.id);
    installations.value = installations.value.filter((item) => item.id !== game.id);
    delete processStates.value[game.id];
    delete versionStates.value[game.id];
  } catch (reason) {
    gameError.value = reason instanceof Error ? reason.message : 'DATABASE_UNAVAILABLE';
  }
}

async function checkVersions(): Promise<void> {
  if (installations.value.length === 0) return;
  checkingVersions.value = true;
  await Promise.all(
    installations.value.map(async (game) => {
      try {
        const state = await window.wwbox.game.checkVersion(game.id);
        game.localVersion = state.localVersion;
        versionStates.value[state.installationId] = state;
      } catch {
        versionStates.value[game.id] = {
          installationId: game.id,
          localVersion: game.localVersion,
          remoteVersion: null,
          status: 'unknown',
          checkedAt: new Date().toISOString(),
        };
      }
    }),
  );
  checkingVersions.value = false;
}

async function loadDisplaySettings(): Promise<void> {
  if (!quickSettingsInstallationId.value) {
    displaySettings.value = null;
    return;
  }
  displaySettingsLoading.value = true;
  displaySettingsMessage.value = '';
  try {
    displaySettings.value = await window.wwbox.game.getDisplaySettings(
      quickSettingsInstallationId.value,
    );
    await loadDisplayResolutions();
    if (
      displaySettings.value.available &&
      !localStorage.getItem('wwbox.quickGameSettings.general')
    ) {
      generalQuickSettings.value = {
        displayMode: displaySettings.value.displayMode,
        width: displaySettings.value.width,
        height: displaySettings.value.height,
        renderMode: renderMode.value,
      };
      persistQuickSettings();
    }
  } catch (reason) {
    displaySettingsMessage.value = describeError(reason);
  } finally {
    displaySettingsLoading.value = false;
  }
}

function selectResolution(value: string): void {
  const preset = resolutionPresets.value.find((item) => `${item.width}x${item.height}` === value);
  if (preset) {
    editableQuickSettings.value.width = preset.width;
    editableQuickSettings.value.height = preset.height;
  }
}

async function saveDisplaySettings(): Promise<void> {
  if (!quickSettingsInstallationId.value) return;
  displaySettingsSaving.value = true;
  displaySettingsMessage.value = '';
  try {
    displaySettings.value = await window.wwbox.game.saveDisplaySettings(
      quickSettingsInstallationId.value,
      {
        displayMode: editableQuickSettings.value.displayMode,
        width: editableQuickSettings.value.width,
        height: editableQuickSettings.value.height,
      },
    );
    persistQuickSettings();
    if (quickSettingsProfileId.value === 'general') {
      renderMode.value = generalQuickSettings.value.renderMode;
    }
    displaySettingsMessage.value =
      quickSettingsProfileId.value === 'general' ? '通用设置已保存。' : '账户自定义设置已保存。';
  } catch (reason) {
    displaySettingsMessage.value = describeError(reason);
  } finally {
    displaySettingsSaving.value = false;
  }
}

function readGeneralQuickSettings(): QuickGameSettings {
  try {
    const parsed = JSON.parse(
      localStorage.getItem('wwbox.quickGameSettings.general') || '{}',
    ) as Partial<QuickGameSettings>;
    if (isQuickGameSettings(parsed)) return parsed;
  } catch {
    // Invalid local settings fall back to conservative defaults.
  }
  return { displayMode: 'borderless', width: 1920, height: 1080, renderMode: 'default' };
}

function readAccountQuickSettings(): Record<string, QuickGameSettings> {
  try {
    const parsed = JSON.parse(
      localStorage.getItem('wwbox.quickGameSettings.accounts') || '{}',
    ) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, QuickGameSettings] =>
        isQuickGameSettings(entry[1]),
      ),
    );
  } catch {
    return {};
  }
}

function isQuickGameSettings(value: unknown): value is QuickGameSettings {
  if (!value || typeof value !== 'object') return false;
  const settings = value as Partial<QuickGameSettings>;
  return (
    (settings.displayMode === 'fullscreen' ||
      settings.displayMode === 'borderless' ||
      settings.displayMode === 'windowed') &&
    Number.isInteger(settings.width) &&
    Number.isInteger(settings.height) &&
    (settings.width ?? 0) >= 640 &&
    (settings.width ?? 0) <= 16384 &&
    (settings.height ?? 0) >= 480 &&
    (settings.height ?? 0) <= 8640 &&
    (settings.renderMode === 'default' ||
      settings.renderMode === 'dx11' ||
      settings.renderMode === 'dx12')
  );
}

function persistQuickSettings(): void {
  localStorage.setItem(
    'wwbox.quickGameSettings.general',
    JSON.stringify(generalQuickSettings.value),
  );
  localStorage.setItem(
    'wwbox.quickGameSettings.accounts',
    JSON.stringify(accountQuickSettings.value),
  );
}

function accountCustomSettingsEnabled(accountId: string): boolean {
  return !!accountQuickSettings.value[accountId];
}

function toggleAccountCustomSettings(account: LauncherAccount): void {
  if (accountQuickSettings.value[account.id]) {
    delete accountQuickSettings.value[account.id];
    if (quickSettingsProfileId.value === account.id) quickSettingsProfileId.value = 'general';
  } else {
    accountQuickSettings.value[account.id] = { ...generalQuickSettings.value };
    quickSettingsProfileId.value = account.id;
  }
  persistQuickSettings();
}

function effectiveQuickSettings(): QuickGameSettings {
  const accountId = currentLauncherAccount.value?.id;
  return accountId && accountQuickSettings.value[accountId]
    ? accountQuickSettings.value[accountId]
    : generalQuickSettings.value;
}

function toggleQuickSettings(): void {
  quickSettingsCollapsed.value = !quickSettingsCollapsed.value;
  localStorage.setItem('wwbox.quickSettingsCollapsed', String(quickSettingsCollapsed.value));
}

function versionStatusText(game: GameInstallation): string {
  const state = versionStates.value[game.id];
  if (!state) return '等待检测';
  if (state.status === 'latest') return `已是最新 · ${state.remoteVersion}`;
  if (state.status === 'updateAvailable') return `可更新至 ${state.remoteVersion}`;
  if (state.status === 'localNewer') return `本地版本较新 · 远端 ${state.remoteVersion}`;
  return '远端版本不可用';
}

function energyRecoveryText(): string {
  const account = currentLauncherAccount.value;
  if (!account || account.energy === null || account.maxEnergy === null) return '蓄满时间未知';
  if (account.energy >= account.maxEnergy) return '体力已满';
  const timestamp = account.energyRecoverTime;
  if (!timestamp) return '蓄满时间未知';
  const remaining = Math.max(0, normalizeTimestamp(timestamp) - Date.now());
  if (remaining === 0) return '即将蓄满';
  const totalMinutes = Math.ceil(remaining / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `约 ${hours} 小时 ${minutes} 分钟蓄满` : `约 ${minutes} 分钟蓄满`;
}

function storeEnergyRecoveryText(): string {
  const account = currentLauncherAccount.value;
  if (!account || account.storeEnergy === null || account.maxStoreEnergy === null)
    return '蓄满时间未知';
  if (account.storeEnergy >= account.maxStoreEnergy) return '结晶单质已满';
  const energyDelay =
    account.energy !== null &&
    account.maxEnergy !== null &&
    account.energy < account.maxEnergy &&
    account.energyRecoverTime
      ? Math.max(0, normalizeTimestamp(account.energyRecoverTime) - Date.now())
      : 0;
  const remaining =
    energyDelay + Math.max(0, account.maxStoreEnergy - account.storeEnergy) * 12 * 60_000;
  const totalMinutes = Math.ceil(remaining / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `约 ${hours} 小时 ${minutes} 分钟蓄满` : `约 ${minutes} 分钟蓄满`;
}

function normalizeTimestamp(value: number): number {
  return value < 1_000_000_000_000 ? value * 1000 : value;
}

async function refreshProcessStates(): Promise<void> {
  if (page.value !== 'home') return;
  await Promise.all(
    installations.value.map(async (game) => {
      try {
        const state = await window.wwbox.game.getProcessState(game.rootPath);
        processStates.value[state.installationId] = state;
      } catch {
        // A transient process query failure does not replace the main page error.
      }
    }),
  );
}

function describeError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : 'GAME_LAUNCH_FAILED';
  if (message.includes('GAME_RUNNING')) return '游戏已经在运行';
  if (message.includes('INVALID_GAME_DIRECTORY')) return '游戏目录已失效，请重新扫描';
  if (message.includes('GAME_LAUNCH_FAILED')) return '游戏启动失败';
  if (message.includes('GAME_UPDATER_NOT_FOUND'))
    return '未找到官方启动器，请使用官方启动器更新游戏';
  if (message.includes('UPDATER_MANAGED_BY_WEGAME')) return 'WeGame 版本需要通过 WeGame 更新';
  if (message.includes('GAME_UPDATER_LAUNCH_FAILED')) return '官方启动器启动失败';
  return message;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '未知' : date.toLocaleString('zh-CN');
}

async function detectGames(): Promise<void> {
  gameLoading.value = true;
  gameError.value = null;
  try {
    installations.value = await window.wwbox.game.detectInstallations();
    await Promise.all([checkVersions(), refreshProcessStates()]);
  } catch (reason) {
    gameError.value = reason instanceof Error ? reason.message : 'GAME_DETECTION_FAILED';
  } finally {
    gameLoading.value = false;
  }
}

async function chooseGame(): Promise<void> {
  gameError.value = null;
  try {
    const result = await window.wwbox.game.chooseInstallation();
    if (!result) return;
    if (!result.valid || !result.installation) {
      gameError.value = describeValidation(result);
      return;
    }
    if (!installations.value.some((item) => item.id === result.installation?.id)) {
      installations.value.push(result.installation);
    }
    await Promise.all([checkVersions(), refreshProcessStates()]);
  } catch (reason) {
    gameError.value = reason instanceof Error ? reason.message : 'GAME_VALIDATION_FAILED';
  }
}

function describeValidation(result: GameValidationResult): string {
  const labels: Record<string, string> = {
    INVALID_PATH: '目录路径无效',
    DIRECTORY_NOT_FOUND: '目录不存在',
    ROOT_EXECUTABLE_NOT_FOUND: '缺少 Wuthering Waves.exe',
    CLIENT_EXECUTABLE_NOT_FOUND: '缺少 Client-Win64-Shipping.exe',
  };
  return result.issues.map((issue) => labels[issue] ?? issue).join('；');
}

function regionName(region: GameInstallation['region']): string {
  return {
    cn: '国服',
    global: '国际服',
    bilibili: 'Bilibili',
    wegame: 'WeGame',
    unknown: '未知',
  }[region];
}
function poolName(poolType: string): string {
  return (
    (
      {
        '1': '角色活动唤取',
        '2': '武器活动唤取',
        '3': '角色常驻唤取',
        '4': '武器常驻唤取',
        '5': '新手唤取',
        '6': '新手自选唤取',
        '7': '感恩定向唤取',
        '8': '角色新旅唤取',
        '9': '武器新旅唤取',
        '10': '角色联动唤取',
        '11': '武器联动唤取',
      } as Record<string, string>
    )[poolType] ?? `卡池 ${poolType}`
  );
}
function visibleFiveStars(pool: GachaPoolAnalysis) {
  return skipFirstSsr.value ? pool.fiveStars.slice(0, -1) : pool.fiveStars;
}
function analyzedFeatured(record: {
  time: string;
  poolType: string;
  resourceId: number;
  name: string;
}): boolean | null {
  const analyzed = gachaAnalysis.value?.pools
    .find((pool) => pool.poolType === record.poolType)
    ?.fiveStars.find(
      (star) =>
        star.time === record.time &&
        (star.resourceId === record.resourceId || star.name === record.name),
    );
  return analyzed?.featured ?? null;
}
function visibleAverage(pool: GachaPoolAnalysis): number | string {
  const stars = visibleFiveStars(pool);
  return stars.length
    ? Math.round((stars.reduce((sum, star) => sum + star.pity, 0) / stars.length) * 10) / 10
    : '—';
}
function pityTone(
  pity: number,
): 'luck-miracle' | 'luck-high' | 'luck-steady' | 'luck-low' | 'luck-pity' {
  if (pity <= 20) return 'luck-miracle';
  if (pity <= 40) return 'luck-high';
  if (pity <= 55) return 'luck-steady';
  if (pity <= 68) return 'luck-low';
  return 'luck-pity';
}
function pityWidth(pity: number): string {
  return `${Math.max(3, Math.min(100, (pity / 80) * 100))}%`;
}
function luckTitle(score: number): string {
  if (score >= 85) return '天选之人 / 欧皇本皇';
  if (score >= 70) return '欧气爆棚 / 大欧皇';
  if (score >= 55) return '欧气附体 / 小欧皇';
  if (score >= 40) return '运势平稳 / 有来有回';
  if (score >= 25) return '非酋预警 / 尚有转机';
  return '保底选手 / 下次一定';
}
function historyTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
function toggleTableSort(key: GachaTableSortKey): void {
  if (tableSortKey.value === key) {
    tableSortDirection.value = tableSortDirection.value === 'asc' ? 'desc' : 'asc';
  } else {
    tableSortKey.value = key;
    tableSortDirection.value = key === 'time' || key === 'qualityLevel' ? 'desc' : 'asc';
  }
}
function tableSortMark(key: GachaTableSortKey): string {
  if (tableSortKey.value !== key) return '↕';
  return tableSortDirection.value === 'asc' ? '↑' : '↓';
}
function readDefaultPageSize(): number {
  const value = Number(localStorage.getItem('wwbox.gachaTablePageSize'));
  return [0, 20, 50, 100, 200].includes(value) ? value : 50;
}
function setTablePageSize(value: number): void {
  tablePageSize.value = value;
  localStorage.setItem('wwbox.gachaTablePageSize', String(value));
}
function readSnapshotScale(): number {
  const value = Number(localStorage.getItem('wwbox.gachaSnapshotScale'));
  return Number.isInteger(value) && value >= 1 && value <= 30 ? value : 2;
}
function readSnapshotRatio(): SnapshotRatio {
  const value = localStorage.getItem('wwbox.gachaSnapshotRatio');
  return value === 'phone' || value === 'desktop' || value === 'window' ? value : 'window';
}
function readSnapshotDestination(): SnapshotDestination {
  return localStorage.getItem('wwbox.gachaSnapshotDestination') === 'clipboard'
    ? 'clipboard'
    : 'file';
}
function saveSnapshotSettings(): void {
  snapshotScale.value = Math.min(30, Math.max(1, Math.round(snapshotScale.value)));
  localStorage.setItem('wwbox.gachaSnapshotScale', String(snapshotScale.value));
  localStorage.setItem('wwbox.gachaSnapshotRatio', snapshotRatio.value);
  localStorage.setItem('wwbox.gachaSnapshotDestination', snapshotDestination.value);
}
function saveGachaHighContrast(): void {
  localStorage.setItem('wwbox.gachaHighContrast', String(gachaHighContrast.value));
}

onMounted(() => {
  void checkHealth();
  void Promise.all([loadSavedGames(), loadAccounts()]).then(async () => {
    await Promise.all([scanLauncherAccounts(), checkVersions(), refreshProcessStates()]);
  });
  processPolling = setInterval(() => void refreshProcessStates(), 3_000);
  void window.wwbox.system.getDefaultWallpaperDirectory().then((directory) => {
    defaultWallpaperDirectory.value = directory;
  });
  void loadWallpaper();
  void window.wwbox.system.setCloseGameOnExit(closeGameOnExit.value);
  void loadRedemptionCodes();
  scheduleWallpaperRotation();
  scheduleAccountRefresh();
});

onUnmounted(() => {
  if (processPolling) clearInterval(processPolling);
  if (wallpaperPolling) clearInterval(wallpaperPolling);
  if (accountRefreshPolling) clearInterval(accountRefreshPolling);
});
</script>

<template>
  <main
    class="shell"
    :class="[
      `theme-${themeStyle}`,
      `wallpaper-ratio-${wallpaperRatio}`,
      `wallpaper-fit-${wallpaperFit}`,
      {
        'sidebar-collapsed': sidebarCollapsed,
        'reduce-motion': reduceMotion,
        'sidebar-wallpaper': sidebarWallpaper,
      },
      highlightScopeClasses,
    ]"
    :style="appThemeStyle"
  >
    <header class="window-titlebar">
      <div class="window-titlebar-brand">
        <span>W</span><strong>鸣潮工具箱</strong><small>WutheringWavesBox</small>
      </div>
      <div class="window-controls">
        <button type="button" title="最小化" aria-label="最小化" @click="controlWindow('minimize')">
          —
        </button>
        <button
          type="button"
          title="最大化或还原"
          aria-label="最大化或还原"
          @click="controlWindow('toggleMaximize')"
        >
          □
        </button>
        <button
          class="window-close"
          type="button"
          title="关闭"
          aria-label="关闭"
          @click="controlWindow('close')"
        >
          ×
        </button>
      </div>
    </header>
    <div id="app-dialog-root" />
    <div class="wallpaper-fill-layer" />
    <div class="wallpaper-layer" />
    <aside class="sidebar">
      <div class="brand-row">
        <div class="brand-mark">W</div>
        <strong>鸣潮工具箱</strong>
        <button
          class="collapse-button"
          type="button"
          :title="sidebarCollapsed ? '展开导航' : '收起导航'"
          @click="toggleSidebar"
        >
          ☰
        </button>
      </div>
      <nav aria-label="主导航">
        <button
          class="nav-item"
          :class="{ active: page === 'home' }"
          type="button"
          @click="openHome"
        >
          <span class="nav-icon">⌂</span><span class="nav-label">主页</span>
        </button>

        <button
          class="nav-item"
          :class="{ active: page === 'gacha' }"
          type="button"
          @click="openGachaPage"
        >
          <span class="nav-icon">▥</span><span class="nav-label">抽卡分析</span>
        </button>
        <button
          class="nav-item"
          :class="{ active: page === 'kuro' }"
          type="button"
          @click="page = 'kuro'"
        >
          <span class="nav-icon">◈</span><span class="nav-label">库街区</span>
        </button>
        <button
          class="nav-item"
          :class="{ active: page === 'redemption' }"
          type="button"
          @click="openRedemptionPage()"
        >
          <span class="nav-icon">◇</span><span class="nav-label">兑换码</span>
        </button>
        <button
          class="nav-item"
          :class="{ active: page === 'settings' }"
          type="button"
          @click="page = 'settings'"
        >
          <span class="nav-icon">⚙</span><span class="nav-label">设置</span>
        </button>
      </nav>
    </aside>

    <section v-if="page === 'home'" class="content home-content">
      <div class="home-right-rail">
        <article class="quick-settings-card" :class="{ collapsed: quickSettingsCollapsed }">
          <header>
            <div>
              <strong>快捷设置</strong>
              <small>游戏配置</small>
            </div>
            <button
              type="button"
              :title="quickSettingsCollapsed ? '展开快捷设置' : '折叠快捷设置'"
              @click="toggleQuickSettings"
            >
              {{ quickSettingsCollapsed ? '›' : '‹' }}
            </button>
          </header>
          <template v-if="!quickSettingsCollapsed">
            <nav class="quick-settings-tabs" aria-label="快捷设置分类">
              <button class="active" type="button">游戏启动项</button>
            </nav>
            <div class="quick-settings-panel">
              <div v-if="launcherAccounts.length" class="account-customization-list">
                <span>账户自定义设置</span>
                <button
                  v-for="account in launcherAccounts"
                  :key="account.id"
                  type="button"
                  :class="{ active: accountCustomSettingsEnabled(account.id) }"
                  @click="toggleAccountCustomSettings(account)"
                >
                  <b>{{ account.roleName || account.label }}</b>
                  <small>{{
                    accountCustomSettingsEnabled(account.id) ? '已启用' : '未启用'
                  }}</small>
                </button>
              </div>
              <div class="quick-profile-tabs">
                <button
                  type="button"
                  :class="{ active: quickSettingsProfileId === 'general' }"
                  @click="quickSettingsProfileId = 'general'"
                >
                  通用设置
                </button>
                <button
                  v-for="account in launcherAccounts.filter((item) =>
                    accountCustomSettingsEnabled(item.id),
                  )"
                  :key="account.id"
                  type="button"
                  :class="{ active: quickSettingsProfileId === account.id }"
                  @click="quickSettingsProfileId = account.id"
                >
                  {{ account.roleName || account.label }}
                </button>
              </div>
              <label>
                <span>游戏安装</span>
                <ThemedSelect
                  v-model="quickSettingsInstallationId"
                  :options="
                    installations.map((game) => ({
                      value: game.id,
                      label: `鸣潮 · ${regionName(game.region)}`,
                    }))
                  "
                  @change="loadDisplaySettings"
                />
              </label>
              <template v-if="quickSettingsInstallationId">
                <label>
                  <span>显示模式</span>
                  <ThemedSelect
                    v-model="editableQuickSettings.displayMode"
                    :options="[
                      { value: 'fullscreen', label: '全屏' },
                      { value: 'borderless', label: '无边框窗口' },
                      { value: 'windowed', label: '窗口' },
                    ]"
                  />
                </label>
                <label>
                  <span>分辨率</span>
                  <ThemedSelect
                    :model-value="`${editableQuickSettings.width}x${editableQuickSettings.height}`"
                    :options="
                      resolutionPresets.map((preset) => ({
                        value: `${preset.width}x${preset.height}`,
                        label: preset.label,
                      }))
                    "
                    @change="selectResolution(String($event))"
                  />
                </label>
                <label>
                  <span>渲染模式</span>
                  <ThemedSelect
                    v-model="editableQuickSettings.renderMode"
                    :options="[
                      { value: 'default', label: '默认' },
                      { value: 'dx11', label: 'DirectX 11' },
                      { value: 'dx12', label: 'DirectX 12' },
                    ]"
                    @change="persistQuickSettings"
                  />
                </label>
                <button
                  class="primary-button quick-settings-save"
                  type="button"
                  :disabled="
                    displaySettingsSaving || processStates[quickSettingsInstallationId]?.running
                  "
                  @click="saveDisplaySettings"
                >
                  {{ displaySettingsSaving ? '保存中…' : '应用设置' }}
                </button>
              </template>
              <p v-else-if="displaySettingsLoading">正在读取游戏配置…</p>
              <p v-else>请先添加游戏安装。</p>
              <small v-if="displaySettings && !displaySettings.available">
                游戏尚未生成配置文件，启动时仍会通过参数应用此设置。
              </small>
              <small v-if="displaySettingsMessage" class="quick-settings-message">{{
                displaySettingsMessage
              }}</small>
            </div>
          </template>
        </article>
        <article class="player-dashboard-card">
          <header class="player-card-header">
            <div class="player-identity">
              <span class="player-avatar">
                <HighQualityImage
                  v-if="currentLauncherAccount?.avatarUrl"
                  :src="currentLauncherAccount.avatarUrl"
                  alt="用户头像"
                />
                <span v-else class="player-avatar-placeholder" aria-label="暂无账户头像" />
              </span>
              <div>
                <h2>
                  {{ currentLauncherAccount?.roleName || activeAccount?.displayName || '尚未登录' }}
                </h2>
                <p>
                  LV.{{ currentLauncherAccount?.level ?? '—' }} · UID
                  {{ currentLauncherAccount?.roleId || activeAccount?.playerId || '—' }} · 索拉等级
                  {{ currentLauncherAccount?.worldLevel ?? '—' }} · 活跃
                  {{ currentLauncherAccount?.activeDays ?? '—' }} 天
                </p>
              </div>
            </div>
            <div class="player-card-actions">
              <button
                class="account-switch-button"
                type="button"
                @click="accountManagerOpen = true"
              >
                <span>切换账户</span><span class="chevron">▾</span></button
              ><button
                class="refresh-icon-button"
                type="button"
                :disabled="launcherLoading"
                title="刷新账户信息"
                @click="refreshHome"
              >
                {{ launcherLoading ? '…' : '↻' }}
              </button>
            </div>
          </header>
          <div class="player-metric-grid">
            <div>
              <img :src="energyIcon" alt="" /><span>结晶波片</span
              ><b
                >{{ currentLauncherAccount?.energy ?? '—' }}/{{
                  currentLauncherAccount?.maxEnergy ?? '—'
                }}</b
              ><small class="energy-recovery-time">{{ energyRecoveryText() }}</small>
            </div>
            <div>
              <img :src="storeEnergyIcon" alt="" /><span>结晶单质</span
              ><b
                >{{ currentLauncherAccount?.storeEnergy ?? '—' }}/{{
                  currentLauncherAccount?.maxStoreEnergy ?? '—'
                }}</b
              ><small class="energy-recovery-time">{{ storeEnergyRecoveryText() }}</small>
            </div>
            <div>
              <img :src="livenessIcon" alt="" /><span>活跃度</span
              ><b
                >{{ currentLauncherAccount?.liveness ?? '—' }}/{{
                  currentLauncherAccount?.maxLiveness ?? '—'
                }}</b
              ><small>{{
                (currentLauncherAccount?.liveness ?? 0) >= 100 ? '日常已完成' : '日常未完成'
              }}</small>
            </div>
            <div>
              <img :src="weeklyIcon" alt="" /><span>周本剩余</span
              ><b>{{ currentLauncherAccount?.weeklyRemaining ?? '—' }}</b>
            </div>
            <div>
              <img :src="displayedResonatorIcon" alt="" /><span>共鸣者数量</span
              ><b>{{ displayedRoleCount ?? '—' }}</b>
            </div>
            <div>
              <img :src="displayedWeeklyTravelIcon" alt="" /><span>周度游历</span
              ><b>{{ displayedWeeklyTravelScore ?? '—' }}/{{ displayedWeeklyTravelMax }}</b
              ><small>{{
                displayedWeeklyTravelScore === null || displayedWeeklyTravelScore === undefined
                  ? '周常状态未知'
                  : displayedWeeklyTravelScore >= displayedWeeklyTravelMax
                    ? '周常已完成'
                    : '周常未完成'
              }}</small>
            </div>
            <div class="battle-pass-block">
              <img class="battle-pass-icon" :src="battlePassIcon" alt="" />
              <div class="battle-pass-lines">
                <div class="battle-pass-line">
                  <span>先约电台</span>
                  <b>LV.{{ currentLauncherAccount?.battlePassLevel ?? '—' }}</b>
                  <small
                    >{{ currentLauncherAccount?.battlePassExp ?? '—' }}/{{
                      currentLauncherAccount?.battlePassExpLimit ?? '—'
                    }}</small
                  >
                </div>
                <div class="battle-pass-line">
                  <span>电台周经验</span>
                  <div class="battle-pass-progress">
                    <i
                      :style="{
                        width: `${Math.min(100, ((currentLauncherAccount?.battlePassWeekExp ?? 0) / (currentLauncherAccount?.battlePassWeekMaxExp || 1)) * 100)}%`,
                      }"
                    />
                  </div>
                  <b
                    >{{ currentLauncherAccount?.battlePassWeekExp ?? '—' }}/{{
                      currentLauncherAccount?.battlePassWeekMaxExp ?? '—'
                    }}</b
                  >
                </div>
              </div>
            </div>
          </div>
          <footer v-if="currentLauncherAccount?.errorCode">
            <span>账户信息暂不可用：{{ currentLauncherAccount.errorCode }}</span>
          </footer>
        </article>
        <div class="installation-list home-installation-list">
          <div class="launch-options">
            <button
              class="secondary-button"
              type="button"
              :disabled="checkingVersions"
              @click="checkVersions"
            >
              {{ checkingVersions ? '检测版本中…' : '检测更新' }}
            </button>
            <button
              class="secondary-button"
              type="button"
              :disabled="gameLoading"
              @click="detectGames"
            >
              {{ gameLoading ? '扫描中…' : '重新扫描' }}
            </button>
            <button class="secondary-button" type="button" @click="chooseGame">手动选择</button>
          </div>
          <article v-for="game in installations" :key="game.id" class="installation-card">
            <div class="game-icon">WW</div>
            <div class="game-info">
              <div class="game-title">
                <strong>鸣潮</strong><span>{{ regionName(game.region) }}</span>
              </div>
              <p>{{ game.rootPath }}</p>
              <small>
                本地版本 {{ game.localVersion || '暂未识别' }} ·
                <span :class="`version-${versionStates[game.id]?.status ?? 'unknown'}`">
                  {{ versionStatusText(game) }}
                </span>
              </small>
            </div>
            <div class="game-actions">
              <span v-if="processStates[game.id]?.running" class="running-badge">运行中</span>
              <button
                class="icon-button"
                type="button"
                title="移除安装记录（不会删除游戏文件）"
                :disabled="processStates[game.id]?.running"
                @click="removeGame(game)"
              >
                移除
              </button>
              <button
                class="secondary-button"
                type="button"
                :disabled="openingLauncherId === game.id"
                @click="openOfficialLauncher(game)"
              >
                {{ openingLauncherId === game.id ? '打开中…' : '官方启动器' }}
              </button>
              <button
                class="secondary-button stop-game-button"
                type="button"
                :disabled="!processStates[game.id]?.running || stoppingGame"
                @click="stopGame"
              >
                {{ stoppingGame ? '结束中…' : '结束游戏' }}
              </button>
              <button
                class="primary-button"
                type="button"
                :class="{ 'update-button': versionStates[game.id]?.status === 'updateAvailable' }"
                :disabled="
                  processStates[game.id]?.running ||
                  launchingId === game.id ||
                  updatingId === game.id
                "
                @click="runGameAction(game)"
              >
                {{
                  processStates[game.id]?.running
                    ? '游戏运行中'
                    : updatingId === game.id
                      ? '正在打开启动器…'
                      : launchingId === game.id
                        ? '正在启动…'
                        : versionStates[game.id]?.status === 'updateAvailable'
                          ? '更新游戏'
                          : '启动游戏'
                }}
              </button>
            </div>
          </article>
          <div v-if="!installations.length && !gameLoading" class="home-installation-empty">
            <span>未发现游戏安装</span>
            <small>可重新扫描或手动选择包含 Wuthering Waves.exe 的目录</small>
          </div>
        </div>
        <p v-if="gameError" class="error-detail home-game-error">{{ gameError }}</p>
      </div>
      <div class="home-grid home-quick-grid">
        <article class="quick-card" @click="openGachaPage">
          <strong>唤取分析</strong><span>获取抽卡链接与后续统计</span>
        </article>
        <article class="quick-card" @click="openRedemptionPage()">
          <div class="quick-card-heading">
            <strong>可用兑换码</strong><b>{{ availableRedemptionCodes.length }}</b>
          </div>
          <div v-if="availableRedemptionCodes.length" class="home-code-list">
            <span v-for="item in availableRedemptionCodes" :key="`${item.region}:${item.code}`"
              ><i>{{ item.region === 'cn' ? '国服' : '国际服' }}</i
              ><code>{{ item.code }}</code></span
            >
          </div>
          <span v-else>{{ redemptionLoading ? '正在同步…' : '暂无未使用的有效兑换码' }}</span>
        </article>
      </div>
    </section>

    <section v-else-if="page === 'kuro'" class="content kuro-content-page">
      <KuroPage />
    </section>

    <section
      v-else-if="page === 'gacha'"
      class="content gacha-content"
      :class="{ 'gacha-high-contrast': gachaHighContrast }"
    >
      <header class="gacha-header">
        <div>
          <p class="eyebrow">CONVENE ANALYSIS</p>
          <h1>唤取分析</h1>
        </div>
        <div class="gacha-header-tools">
          <label class="skip-ssr gacha-option-toggle"
            ><input v-model="skipFirstSsr" type="checkbox" />忽略第一个五星</label
          >
          <label class="gacha-option-toggle high-contrast-toggle"
            ><input
              v-model="gachaHighContrast"
              type="checkbox"
              @change="saveGachaHighContrast"
            />高对比度</label
          >
          <div class="analysis-tabs">
            <button
              type="button"
              :class="{ active: gachaView === 'overview' }"
              @click="gachaView = 'overview'"
            >
              直观</button
            ><button
              type="button"
              :class="{ active: gachaView === 'detail' }"
              @click="gachaView = 'detail'"
            >
              详情</button
            ><button
              type="button"
              :class="{ active: gachaView === 'table' }"
              @click="gachaView = 'table'"
            >
              表格</button
            ><button
              type="button"
              :class="{ active: gachaView === 'versions' }"
              @click="gachaView = 'versions'"
            >
              版本总结
            </button>
          </div>
          <div class="snapshot-settings">
            <button type="button" @click="snapshotSettingsOpen = true">快照设置</button>
            <AppDialog :open="snapshotSettingsOpen" @close="snapshotSettingsOpen = false">
              <section class="dialog-surface snapshot-settings-dialog">
                <header>
                  <strong>快照设置</strong>
                  <button type="button" aria-label="关闭" @click="snapshotSettingsOpen = false">
                    ×
                  </button>
                </header>
                <div class="snapshot-settings-fields">
                  <label
                    ><span>清晰度倍率</span
                    ><input
                      v-model.number="snapshotScale"
                      type="number"
                      min="1"
                      max="30"
                      step="1"
                      @change="saveSnapshotSettings"
                  /></label>
                  <label
                    ><span>导出比例</span
                    ><ThemedSelect
                      v-model="snapshotRatio"
                      :options="[
                        { value: 'phone', label: '手机比例 · 9:16' },
                        { value: 'desktop', label: '电脑屏幕 · 16:9' },
                        { value: 'window', label: '当前软件窗口' },
                      ]"
                      @change="saveSnapshotSettings"
                  /></label>
                  <label
                    ><span>导出位置</span
                    ><ThemedSelect
                      v-model="snapshotDestination"
                      :options="[
                        { value: 'file', label: '保存为 PNG 文件' },
                        { value: 'clipboard', label: '复制到剪贴板' },
                      ]"
                      @change="saveSnapshotSettings"
                  /></label>
                  <small>设置自动保存 · X{{ snapshotScale }}</small>
                </div>
              </section>
            </AppDialog>
          </div>
          <button type="button" :disabled="!gachaAnalysis" @click="snapshotGacha">快照</button
          ><button type="button" :disabled="!gachaAnalysis" @click="exportGacha">导出</button
          ><button
            class="danger-text"
            type="button"
            :disabled="!gachaAnalysis"
            @click="deleteGacha"
          >
            删除
          </button>
        </div>
      </header>
      <div class="gacha-commandbar">
        <div class="url-input-group">
          <div class="gacha-uid-select">
            <button type="button" class="gacha-popover-trigger" popovertarget="gacha-uid-popover">
              <span>UID</span><b>{{ detectedGachaUid || gachaAnalysis?.playerId || '未识别' }}</b>
            </button>
            <div
              id="gacha-uid-popover"
              class="gacha-uid-options"
              :data-theme="gachaHighContrast ? 'contrast' : themeStyle"
              popover
            >
              <button
                v-if="detectedGachaUid && !gachaPlayers.includes(detectedGachaUid)"
                type="button"
                class="detected"
                @click="selectGachaUid(detectedGachaUid, $event)"
              >
                <span>{{ detectedGachaUid }}</span
                ><small>链接识别</small>
              </button>
              <button
                v-for="player in gachaPlayers"
                :key="player"
                type="button"
                :class="{ active: player === gachaAnalysis?.playerId }"
                @click="selectGachaUid(player, $event)"
              >
                <span>{{ player }}</span
                ><small>{{ player === gachaAnalysis?.playerId ? '当前账户' : '本地记录' }}</small>
              </button>
              <p v-if="!gachaPlayers.length && !detectedGachaUid">暂无 UID 记录</p>
            </div>
          </div>
          <div class="url-field">
            <span>URL</span
            ><input
              v-model="gachaUrl"
              type="url"
              autocomplete="off"
              spellcheck="false"
              placeholder="输入自定义唤取链接"
            />
          </div>
          <button
            class="primary-button"
            type="button"
            :disabled="!gachaUrl.trim() || gachaImporting"
            @click="importGachaRecords"
          >
            {{ gachaImporting ? '分析中…' : '分析链接' }}</button
          ><button
            type="button"
            :disabled="!selectedGachaInstallationId || gachaImporting"
            @click="acquireGachaUrl"
          >
            获取链接</button
          ><button type="button" :disabled="!gachaUrl.trim()" @click="copyGachaUrl">
            复制链接
          </button>
        </div>
        <div class="url-history">
          <button type="button" class="gacha-popover-trigger" popovertarget="url-history-popover">
            <span>链接历史</span><b>{{ gachaUrlHistory.length }}</b>
          </button>
          <div
            v-if="gachaUrlHistory.length"
            id="url-history-popover"
            class="url-history-popover"
            :data-theme="gachaHighContrast ? 'contrast' : themeStyle"
            popover
          >
            <header><strong>最近使用</strong><small>点击记录填入输入框</small></header>
            <div v-for="item in gachaUrlHistory" :key="item.url" class="url-history-row">
              <button
                type="button"
                :title="item.url"
                @click="
                  gachaUrl = item.url;
                  closePopover('url-history-popover');
                "
              >
                <i :class="item.source">{{ item.source === 'game' ? '游戏获取' : '第三方链接' }}</i
                ><span>{{ item.url }}</span
                ><time>{{ historyTime(item.usedAt) }}</time>
              </button>
              <button
                class="history-delete"
                type="button"
                title="删除该记录"
                @click="removeGachaUrlHistory(item.url)"
              >
                ×
              </button>
            </div>
          </div>
          <div
            v-else
            id="url-history-popover"
            class="url-history-empty"
            :data-theme="gachaHighContrast ? 'contrast' : themeStyle"
            popover
          >
            暂无链接记录
          </div>
        </div>
      </div>
      <div class="analysis-capture-area">
        <p v-if="gachaMessage" class="gacha-result compact" :class="gachaMessage.type">
          {{ gachaMessage.text }}
        </p>
        <article v-if="!gachaAnalysis" class="gacha-empty">
          <strong>暂无唤取记录</strong>
          <p>粘贴链接后获取，或将输入框留空自动读取游戏日志。</p>
        </article>
        <div v-if="gachaAnalysis" class="analysis-area">
          <div v-if="gachaView === 'versions'" class="version-metadata-tools">
            <div class="version-tools-heading">
              <i>V</i
              ><span><strong>版本资料</strong><small>官网维护公告时间 · 本地可管理</small></span>
            </div>
            <span v-if="versionMessage">{{ versionMessage }}</span>
            <button
              type="button"
              :class="{ active: showAllVersions }"
              @click="showAllVersions = !showAllVersions"
            >
              {{ showAllVersions ? '仅显示有记录版本' : '显示所有版本' }}
            </button>
            <button
              type="button"
              :class="{ active: versionEditorOpen }"
              @click="versionEditorOpen = !versionEditorOpen"
            >
              版本管理
            </button>
            <button type="button" :disabled="versionUpdating" @click="previewVersionUpdate">
              {{ versionUpdating ? '正在获取…' : '更新版本信息' }}
            </button>
          </div>
          <AppDialog
            :open="gachaView === 'versions' && versionEditorOpen"
            backdrop-class="version-manager-backdrop"
            @close="versionEditorOpen = false"
          >
            <section class="version-manager-panel dialog-surface">
              <header>
                <div><strong>版本管理</strong><small>添加、修改或删除本地版本资料</small></div>
                <button type="button" title="关闭" @click="versionEditorOpen = false">×</button>
              </header>
              <form class="version-editor" @submit.prevent="saveVersionMetadata">
                <label
                  >版本号<input
                    v-model.trim="versionForm.version"
                    required
                    pattern="\d+\.\d+"
                    placeholder="3.5"
                /></label>
                <label
                  >版本名称<input
                    v-model.trim="versionForm.name"
                    required
                    maxlength="80"
                    placeholder="遗音扶剑，荡梦而歌"
                /></label>
                <label
                  >开始时间<input v-model="versionForm.start" required type="datetime-local"
                /></label>
                <button class="version-action primary" type="submit">
                  {{ versionForm.version ? '保存版本' : '添加版本' }}
                </button>
              </form>
              <div class="version-manager-list">
                <div v-for="entry in versionMetadata" :key="entry.version">
                  <strong>V{{ entry.version }}</strong
                  ><span>{{ entry.name }}</span
                  ><time>{{ entry.start }}</time
                  ><button
                    class="version-action edit"
                    type="button"
                    :disabled="entry.version === '1.0'"
                    @click="editVersionMetadata(entry)"
                  >
                    修改</button
                  ><button
                    class="version-action delete"
                    type="button"
                    :disabled="entry.version === '1.0'"
                    @click="removeVersionMetadata(entry)"
                  >
                    删除
                  </button>
                </div>
              </div>
            </section>
          </AppDialog>
          <div class="analysis-export-content">
            <article class="luck-summary">
              <button
                class="luck-help-button"
                type="button"
                title="查看分析参数说明"
                aria-label="查看分析参数说明"
                @click="gachaHelpOpen = true"
              >
                ?
              </button>
              <div class="luck-copy">
                <span
                  >特征码：<b>{{ gachaAnalysis.playerId }}</b></span
                >
                <p>经分析，你的抽卡欧皇程度为：</p>
                <h2>{{ luckTitle(gachaSummary.luckScore) }}</h2>
                <p>
                  总抽卡数：<strong>{{ gachaSummary.total }}<small> 抽</small></strong>
                </p>
                <p>
                  平均出金：<strong>{{ gachaSummary.average.toFixed(1) }}<small> 抽</small></strong>
                </p>
              </div>
              <div class="luck-tags">
                <span>角色 {{ gachaSummary.characterUpStreak }} 连 UP</span>
                <span
                  >角色池
                  {{ primaryPools.find((pool) => pool.poolType === '1')?.fiveStarCount ?? 0 }}
                  金</span
                >
                <span
                  >武器池
                  {{ primaryPools.find((pool) => pool.poolType === '2')?.fiveStarCount ?? 0 }}
                  金</span
                >
              </div>
              <div class="luck-metrics">
                <div>
                  <b>{{ gachaSummary.luckScore.toFixed(1) }}%</b><span>欧气指数</span>
                </div>
                <div>
                  <b>{{ gachaSummary.stars }}<small> 金</small></b
                  ><span>五星数</span>
                </div>
                <div>
                  <b>{{ gachaSummary.characterAverage.toFixed(1) }}<small> 抽</small></b
                  ><span>每 UP 角色</span>
                </div>
                <div>
                  <b>{{ gachaSummary.characterPity }}<small> 抽</small></b
                  ><span>角色池垫数</span>
                </div>
                <div>
                  <b>{{ gachaSummary.weaponAverage.toFixed(1) }}<small> 抽</small></b
                  ><span>每金武器</span>
                </div>
              </div>
            </article>
            <div class="analysis-scroll-content">
              <div v-if="gachaPlayers.length > 1" class="player-switcher">
                <span>本地玩家</span>
                <button
                  v-for="player in gachaPlayers"
                  :key="player"
                  type="button"
                  :class="{ active: player === gachaAnalysis.playerId }"
                  @click="selectGachaPlayer(player)"
                >
                  {{ player }}
                </button>
              </div>
              <div v-if="gachaView === 'overview'" class="pool-grid">
                <article
                  v-for="pool in primaryPools"
                  :key="pool.poolType"
                  class="pool-card reference-pool"
                >
                  <header>
                    <strong>{{ poolName(pool.poolType) }}</strong
                    ><span>{{ pool.total }} 抽</span>
                  </header>
                  <div class="pool-stats">
                    <span
                      >当前垫数 <b>{{ pool.pity }}</b></span
                    ><span
                      >五星 <b>{{ pool.fiveStarCount }}</b></span
                    ><span
                      >五星率
                      <b>{{
                        pool.total
                          ? `${((pool.fiveStarCount / pool.total) * 100).toFixed(2)}%`
                          : '—'
                      }}</b></span
                    ><span
                      >四星率
                      <b>{{
                        pool.total
                          ? `${((pool.fourStarCount / pool.total) * 100).toFixed(2)}%`
                          : '—'
                      }}</b></span
                    ><span
                      >平均出金 <b>{{ visibleAverage(pool) }}</b></span
                    >
                  </div>
                  <ul>
                    <li v-for="star in visibleFiveStars(pool)" :key="`${star.time}-${star.name}`">
                      <img
                        v-if="gachaImages[String(star.resourceId)]"
                        class="quality-image quality-image-5"
                        :src="gachaImages[String(star.resourceId)] ?? ''"
                        :alt="star.name"
                      /><span v-else class="gacha-image-fallback">5★</span
                      ><span class="star-record-copy"
                        ><b>{{ star.name }}</b
                        ><small
                          v-if="star.featured !== null"
                          :class="star.featured ? 'is-up' : 'is-lost'"
                          >{{ star.featured ? 'UP' : '歪' }}</small
                        ><time>{{ star.time }}</time
                        ><i class="pity-track"
                          ><i
                            :class="pityTone(star.pity)"
                            :style="{ width: pityWidth(star.pity) }"
                          ></i></i></span
                      ><b>{{ star.pity }} 抽</b>
                    </li>
                  </ul>
                </article>
              </div>
              <div v-else-if="gachaView === 'detail' && selectedPool" class="detail-view">
                <aside>
                  <button
                    v-for="pool in gachaAnalysis.pools"
                    :key="pool.poolType"
                    type="button"
                    :class="{ active: selectedPoolType === pool.poolType }"
                    @click="selectedPoolType = pool.poolType"
                  >
                    {{ poolName(pool.poolType) }}<small>{{ pool.total }} 抽</small>
                  </button>
                </aside>
                <article>
                  <div class="detail-hero">
                    <div
                      class="rarity-chart"
                      :style="{
                        background: `conic-gradient(var(--chart-five) 0 ${selectedRarity.fiveRate}%, var(--chart-four) ${selectedRarity.fiveRate}% ${selectedRarity.fiveRate + selectedRarity.fourRate}%, var(--chart-three) 0)`,
                      }"
                    >
                      <span>{{ selectedPool.total }}<small>总抽数</small></span>
                    </div>
                    <div class="rarity-legend">
                      <span class="quality-5"
                        >五星 {{ selectedRarity.five }} ·
                        {{ selectedRarity.fiveRate.toFixed(2) }}%</span
                      ><span class="quality-4"
                        >四星 {{ selectedRarity.four }} ·
                        {{ selectedRarity.fourRate.toFixed(2) }}%</span
                      ><span class="quality-3">三星 {{ selectedRarity.three }}</span>
                      <p>共消耗 {{ selectedPool.total * 160 }} 星声等价资源</p>
                    </div>
                  </div>
                  <div class="detail-metrics">
                    <div>
                      <span>总抽数</span><b>{{ selectedPool.total }}</b>
                    </div>
                    <div>
                      <span>当前垫数</span><b>{{ selectedPool.pity }}</b>
                    </div>
                    <div>
                      <span>五星数量</span><b>{{ selectedPool.fiveStarCount }}</b>
                    </div>
                    <div>
                      <span>四星数量</span><b>{{ selectedPool.fourStarCount }}</b>
                    </div>
                    <div>
                      <span>平均出金</span><b>{{ visibleAverage(selectedPool) }}</b>
                    </div>
                  </div>
                  <div class="five-star-timeline">
                    <div
                      v-for="star in visibleFiveStars(selectedPool)"
                      :key="`${star.time}-${star.name}`"
                    >
                      <img
                        v-if="gachaImages[String(star.resourceId)]"
                        class="quality-image quality-image-5"
                        :src="gachaImages[String(star.resourceId)] ?? ''"
                        :alt="star.name"
                      /><span v-else class="star-orb">5★</span><strong>{{ star.name }}</strong
                      ><b>{{ star.pity }} 抽</b><small>{{ star.time }}</small
                      ><span
                        v-if="star.featured !== null"
                        :class="star.featured ? 'star-badge is-up' : 'star-badge is-lost'"
                        >{{ star.featured ? 'UP' : '歪' }}</span
                      ><i class="pity-track timeline-track"
                        ><i
                          :class="pityTone(star.pity)"
                          :style="{ width: pityWidth(star.pity) }"
                        ></i
                      ></i>
                    </div>
                  </div>
                </article>
              </div>
              <div v-else-if="gachaView === 'versions'" class="version-summary-list">
                <article v-for="summary in versionSummaries" :key="summary.metadata.version">
                  <header>
                    <div>
                      <strong
                        >V{{ summary.metadata.version }} {{ summary.metadata.name }} ·
                        限定卡池统计</strong
                      ><small
                        >{{ summary.metadata.start.slice(0, 10) }} 开始 ·
                        {{
                          summary.metadata.dateVerified
                            ? `${summary.metadata.dateSource === 'official' ? '官网维护公告' : summary.metadata.dateSource === 'manual' ? '手动' : '已核验'}数据`
                            : summary.metadata.dateSource === 'reference-image'
                              ? '参考图数据'
                              : '周期估算'
                        }}</small
                      >
                    </div>
                    <div>
                      <b>{{ summary.total }}</b
                      ><span>总抽卡</span>
                    </div>
                    <div>
                      <b>{{ summary.five || '暂无' }}</b
                      ><span>五星数</span>
                    </div>
                    <div>
                      <b>{{ summary.four }}</b
                      ><span>四星数</span>
                    </div>
                    <div>
                      <b>{{ summary.total * 160 }}</b
                      ><span>星声等价</span>
                    </div>
                  </header>
                  <p>
                    你在 <b>V{{ summary.metadata.version }}</b> 限定卡池共计花费
                    <strong>{{ summary.total * 160 }}</strong> 星声等价资源，获得限定五星
                    <strong>{{ summary.featuredFive }}</strong> 个、确认歪卡
                    <strong>{{ summary.five - summary.featuredFive - summary.unknownFive }}</strong>
                    个<span v-if="summary.unknownFive"
                      >，另有
                      <strong>{{ summary.unknownFive }}</strong> 个因分期元数据缺失待判定</span
                    >。
                  </p>
                  <div class="version-item-grid">
                    <div
                      v-for="item in summary.items"
                      :key="item.resourceId"
                      :class="`quality-${item.qualityLevel}`"
                    >
                      <div>
                        <img
                          v-if="gachaImages[String(item.resourceId)]"
                          :class="`quality-image quality-image-${item.qualityLevel}`"
                          :src="gachaImages[String(item.resourceId)] ?? ''"
                          :alt="item.name"
                        /><span v-else>{{ item.qualityLevel }}★</span
                        ><i
                          v-if="item.qualityLevel === 5"
                          class="version-status-badge star-badge"
                          :class="{
                            'is-up': item.featured === true,
                            'is-lost': item.featured === false,
                            'is-unknown': item.featured === null,
                          }"
                          >{{
                            item.featured === true ? 'UP' : item.featured === false ? '歪' : '待定'
                          }}</i
                        >
                      </div>
                      <strong :title="item.name">{{ item.name }}</strong
                      ><b>{{ item.count }}</b>
                    </div>
                  </div>
                </article>
                <article v-if="!versionSummaries.length" class="version-empty">
                  暂无可归属到版本的唤取记录
                </article>
              </div>
              <div v-else class="table-view">
                <aside class="table-pool-filter">
                  <button
                    type="button"
                    :class="{ active: tablePoolType === 'all' }"
                    @click="tablePoolType = 'all'"
                  >
                    所有<small>{{ gachaAnalysis.recentRecords.length }}</small>
                  </button>
                  <button
                    v-for="pool in gachaAnalysis.pools"
                    :key="pool.poolType"
                    type="button"
                    :class="{ active: tablePoolType === pool.poolType }"
                    @click="tablePoolType = pool.poolType"
                  >
                    {{ poolName(pool.poolType) }}<small>{{ pool.total }}</small>
                  </button>
                </aside>
                <div class="gacha-table-wrap">
                  <table class="gacha-table-header" aria-hidden="true">
                    <thead>
                      <tr>
                        <th
                          v-for="column in [
                            { key: 'time', label: '时间' },
                            { key: 'name', label: '名称' },
                            { key: 'resourceType', label: '类型' },
                            { key: 'qualityLevel', label: '星级' },
                            { key: 'poolType', label: '卡池' },
                          ]"
                          :key="column.key"
                        >
                          <button
                            type="button"
                            :class="{ active: tableSortKey === column.key }"
                            @click="toggleTableSort(column.key as GachaTableSortKey)"
                          >
                            {{ column.label
                            }}<span>{{ tableSortMark(column.key as GachaTableSortKey) }}</span>
                          </button>
                        </th>
                      </tr>
                    </thead>
                  </table>
                  <div class="gacha-table-scroll">
                    <table class="gacha-table-body">
                      <tbody>
                        <tr
                          v-for="record in pagedTableRecords"
                          :key="`${record.poolType}-${record.resourceId}-${record.time}`"
                          :class="`row-quality-${record.qualityLevel}`"
                        >
                          <td>{{ record.time }}</td>
                          <td>
                            <span class="table-item"
                              ><img
                                v-if="gachaImages[String(record.resourceId)]"
                                :class="`quality-image quality-image-${record.qualityLevel}`"
                                :src="gachaImages[String(record.resourceId)] ?? ''"
                                :alt="record.name"
                              />{{ record.name }}</span
                            >
                          </td>
                          <td>{{ record.resourceType }}</td>
                          <td>{{ record.qualityLevel }}★</td>
                          <td>{{ poolName(record.poolType) }}</td>
                        </tr>
                      </tbody>
                    </table>
                    <div v-if="!tableRecords.length" class="table-empty">该卡池暂无唤取记录</div>
                  </div>
                  <footer v-if="tableRecords.length" class="table-pagination">
                    <span>共 {{ tableRecords.length }} 条</span>
                    <div>
                      <button type="button" :disabled="tablePage <= 1" @click="tablePage = 1">
                        首页
                      </button>
                      <button type="button" :disabled="tablePage <= 1" @click="tablePage--">
                        上一页
                      </button>
                      <b>{{ Math.min(tablePage, tablePageCount) }} / {{ tablePageCount }}</b>
                      <button
                        type="button"
                        :disabled="tablePage >= tablePageCount"
                        @click="tablePage++"
                      >
                        下一页
                      </button>
                      <button
                        type="button"
                        :disabled="tablePage >= tablePageCount"
                        @click="tablePage = tablePageCount"
                      >
                        末页
                      </button>
                    </div>
                    <div class="table-page-settings">
                      <button type="button" popovertarget="table-page-settings-popover">
                        分页设置
                      </button>
                      <div
                        id="table-page-settings-popover"
                        class="table-page-settings-popover"
                        :data-theme="gachaHighContrast ? 'contrast' : themeStyle"
                        popover
                      >
                        <label
                          >默认每页<ThemedSelect
                            :model-value="tablePageSize"
                            :options="
                              [20, 50, 100, 200, 0].map((size) => ({
                                value: size,
                                label: size === 0 ? '不分页' : `${size} 条`,
                              }))
                            "
                            @change="setTablePageSize(Number($event))"
                        /></label>
                        <small>设置自动保存到本机</small>
                      </div>
                    </div>
                  </footer>
                </div>
              </div>
            </div>
          </div>
          <AppDialog
            :open="gachaHelpOpen"
            :backdrop-class="`gacha-help-backdrop${gachaHighContrast ? ' is-contrast' : ''}`"
            @close="gachaHelpOpen = false"
          >
            <article
              class="dialog-surface gacha-help-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="gacha-help-title"
            >
              <header>
                <div>
                  <small>ANALYSIS GUIDE</small>
                  <h2 id="gacha-help-title">抽卡分析参数说明</h2>
                </div>
                <button type="button" aria-label="关闭说明" @click="gachaHelpOpen = false">
                  ×
                </button>
              </header>
              <section>
                <h3>欧皇程度评判</h3>
                <p>
                  欧气指数按所有已纳入统计的五星平均出金抽数换算：<b>100 − 平均出金 ÷ 80 × 100</b
                  >，结果限制在 1%～99.9%。平均越早出金，指数越高。
                </p>
                <div class="luck-grade-list">
                  <div><b>85%～99.9%</b><span>天选之人 / 欧皇本皇</span></div>
                  <div><b>70%～84.9%</b><span>欧气爆棚 / 大欧皇</span></div>
                  <div><b>55%～69.9%</b><span>欧气附体 / 小欧皇</span></div>
                  <div><b>40%～54.9%</b><span>运势平稳 / 有来有回</span></div>
                  <div><b>25%～39.9%</b><span>非酋预警 / 尚有转机</span></div>
                  <div><b>1%～24.9%</b><span>保底选手 / 下次一定</span></div>
                </div>
                <p class="gacha-help-note">
                  该结果仅根据当前导入记录计算，用于娱乐参考；记录数量较少时波动会更明显。
                </p>
              </section>
              <section>
                <h3>参数含义</h3>
                <dl>
                  <div>
                    <dt>总抽卡数</dt>
                    <dd>当前纳入分析的主要卡池抽卡记录总数。</dd>
                  </div>
                  <div>
                    <dt>平均出金</dt>
                    <dd>所有纳入统计的五星记录，其出金抽数的平均值。</dd>
                  </div>
                  <div>
                    <dt>五星数</dt>
                    <dd>当前统计范围内获得的五星总数量。</dd>
                  </div>
                  <div>
                    <dt>每 UP 角色</dt>
                    <dd>
                      角色活动池中，获得限定 UP 角色所用抽数的平均值；歪出的常驻五星不单独作为 UP
                      结果。
                    </dd>
                  </div>
                  <div>
                    <dt>角色池垫数</dt>
                    <dd>角色活动池自最近一次五星之后已经累计的抽数。</dd>
                  </div>
                  <div>
                    <dt>每金武器</dt>
                    <dd>武器活动池中每次获得五星武器所用抽数的平均值。</dd>
                  </div>
                  <div>
                    <dt>忽略第一个五星</dt>
                    <dd>
                      开启后不把各卡池时间最早、可能因历史记录不完整而抽数失真的首个五星纳入相关分析。
                    </dd>
                  </div>
                </dl>
              </section>
            </article>
          </AppDialog>
        </div>
      </div>
      <AppDialog :open="Boolean(versionPreview)" @close="versionPreview = null">
        <template v-if="versionPreview">
          <article class="dialog-surface version-conflict-modal">
            <header>
              <div>
                <p class="eyebrow">VERSION CONFLICT</p>
                <h2>发现 {{ versionPreview.conflicts.length }} 项版本冲突</h2>
              </div>
            </header>
            <p>候选信息来自鸣潮官网版本维护公告。请选择如何处理与本地数据不一致的版本。</p>
            <div class="version-conflicts">
              <div v-for="conflict in versionPreview.conflicts" :key="conflict.version">
                <strong>V{{ conflict.version }}</strong>
                <span>本地：{{ conflict.local.name }} · {{ conflict.local.start }}</span>
                <span>官网：{{ conflict.incoming.name }} · {{ conflict.incoming.start }}</span>
              </div>
            </div>
            <footer>
              <button
                class="conflict-overwrite"
                type="button"
                @click="applyVersionUpdate('overwrite')"
              >
                覆盖冲突信息
              </button>
              <button
                class="conflict-preserve"
                type="button"
                @click="applyVersionUpdate('preserve')"
              >
                不覆盖冲突信息
              </button>
              <button class="conflict-cancel" type="button" @click="versionPreview = null">
                不更新
              </button>
            </footer>
          </article>
        </template>
      </AppDialog>
    </section>

    <section v-else-if="page === 'account'" class="content">
      <header>
        <p class="eyebrow">ACCOUNT PROFILES</p>
        <h1>账号档案</h1>
        <p class="subtitle">切换本地展示档案，并关联用于启动的游戏安装</p>
      </header>
      <div class="account-layout">
        <div class="account-list">
          <article class="launcher-panel">
            <div>
              <strong>官方启动器登录账号</strong>
              <p>读取本机官方启动器已登录账号，不需要输入密码</p>
            </div>
            <button
              class="secondary-button"
              type="button"
              :disabled="launcherLoading"
              @click="scanLauncherAccounts"
            >
              {{ launcherLoading ? '读取并查询中…' : '导入登录账号' }}
            </button>
          </article>
          <article
            v-for="account in launcherAccounts"
            :key="account.id"
            class="account-card launcher"
            :class="{ active: selectedLauncherAccountId === account.id }"
            @click="selectedLauncherAccountId = account.id"
          >
            <div class="avatar">{{ (account.roleName || account.label).slice(0, 1) }}</div>
            <div>
              <strong>{{ account.roleName || account.label }}</strong>
              <p>
                {{
                  account.roleId
                    ? `UID ${account.roleId} · 等级 ${account.level ?? '—'}`
                    : account.errorCode || '未查询到角色'
                }}
              </p>
              <div v-if="account.roleId" class="role-metrics">
                <span>体力 {{ account.energy ?? '—' }}/{{ account.maxEnergy ?? '—' }}</span
                ><span>活跃度 {{ account.liveness ?? '—' }}/{{ account.maxLiveness ?? '—' }}</span
                ><span>活跃 {{ account.activeDays ?? '—' }} 天</span>
              </div>
            </div>
            <span class="running-badge">{{ account.region === 'cn' ? '国服' : '国际服' }}</span>
          </article>
          <article
            v-for="account in accounts"
            :key="account.id"
            class="account-card"
            :class="{ active: account.active }"
          >
            <div class="avatar">{{ account.displayName.slice(0, 1).toUpperCase() }}</div>
            <div>
              <strong>{{ account.displayName }}</strong>
              <p>
                {{ account.region === 'cn' ? '国服' : '国际服' }} ·
                {{ account.playerId ? `UID ${account.playerId}` : '未填写 UID' }}
              </p>
              <small v-if="account.note">{{ account.note }}</small>
            </div>
            <button
              v-if="!account.active"
              class="secondary-button"
              type="button"
              @click="activateAccount(account.id)"
            >
              切换
            </button>
            <span v-else class="running-badge">当前</span>
            <button class="icon-button" type="button" @click="removeAccount(account.id)">
              移除
            </button>
          </article>
          <div v-if="accounts.length === 0" class="empty-state">
            <strong>还没有账号档案</strong>
            <p>档案不包含密码或登录令牌。</p>
          </div>
        </div>
        <form class="profile-form" @submit.prevent="saveAccount">
          <h2>添加档案</h2>
          <label
            >显示名称<input
              v-model="accountName"
              maxlength="40"
              required
              placeholder="例如：主账号"
          /></label>
          <label
            >游戏 UID（可选）<input
              v-model="accountPlayerId"
              inputmode="numeric"
              pattern="[0-9]{1,20}"
              placeholder="仅用于展示"
          /></label>
          <label
            >区服<ThemedSelect
              v-model="accountRegion"
              :options="[
                { value: 'cn', label: '国服' },
                { value: 'global', label: '国际服' },
              ]"
          /></label>
          <label
            >备注<input v-model="accountNote" maxlength="120" placeholder="例如：主账号、亚服小号"
          /></label>
          <label
            >关联安装<ThemedSelect
              v-model="accountInstallationId"
              :options="[
                { value: '', label: '启动时自动选择' },
                ...installations.map((game) => ({
                  value: game.id,
                  label: `${regionName(game.region)} · ${game.rootPath}`,
                })),
              ]"
          /></label>
          <button class="primary-button" type="submit">保存档案</button>
          <p class="privacy-text">正式官方登录和自动写入启动器账号将在完成安全评审后提供。</p>
          <p v-if="accountError" class="error-detail">{{ accountError }}</p>
        </form>
      </div>
    </section>

    <section v-else-if="page === 'settings'" class="content settings-content">
      <header>
        <p class="eyebrow">APPEARANCE & BEHAVIOR</p>
        <h1>个性化设置</h1>
        <p class="subtitle">外观会应用到软件全局，并在本机自动保存。</p>
      </header>
      <div class="settings-grid">
        <article class="settings-card settings-card-wide system-overview-card">
          <div class="settings-card-heading">
            <div>
              <p class="eyebrow">SYSTEM OVERVIEW</p>
              <h2>运行概览</h2>
            </div>
            <span class="system-health" :class="{ error }"
              ><i />{{ loading ? '正在检查' : error ? 'Helper 不可用' : '系统正常' }}</span
            >
          </div>
          <div v-if="info" class="system-metrics">
            <div>
              <span>应用版本</span><strong>{{ info.appVersion }}</strong>
            </div>
            <div>
              <span>Helper 版本</span><strong>{{ info.helper.helperVersion }}</strong>
            </div>
            <div>
              <span>协议版本</span><strong>v{{ info.helper.protocolVersion }}</strong>
            </div>
            <div>
              <span>已识别客户端</span><strong>{{ installations.length }}</strong>
            </div>
          </div>
          <div v-if="error" class="system-error-row">
            <p class="error-detail">未能启动 .NET Helper：{{ error }}</p>
            <button class="secondary-button" type="button" @click="checkHealth">重新检查</button>
          </div>
        </article>
        <article class="settings-card settings-card-wide appearance-settings-card">
          <div class="settings-card-heading appearance-heading">
            <div>
              <p class="eyebrow">APPEARANCE</p>
              <h2>外观与壁纸</h2>
            </div>
            <small>主题、透明度与背景效果集中设置</small>
          </div>
          <div class="appearance-layout">
            <section class="appearance-theme-section">
              <h3>主题风格</h3>
              <div class="theme-choices">
                <button
                  v-for="style in ['glass', 'dark', 'light'] as const"
                  :key="style"
                  type="button"
                  :class="{ active: themeStyle === style }"
                  @click="
                    themeStyle = style;
                    saveAppearance();
                  "
                >
                  {{ { glass: '玻璃', dark: '深色', light: '浅色' }[style] }}
                </button>
              </div>
              <label
                >界面透明度 <b>{{ themeOpacity }}%</b
                ><input
                  v-model.number="themeOpacity"
                  type="range"
                  min="0"
                  max="100"
                  @change="saveAppearance"
              /></label>
              <div class="highlight-settings">
                <div class="highlight-settings-heading">
                  <span>高亮标记</span>
                  <i
                    :style="{
                      borderColor: highlightColor,
                      borderTopWidth: effectiveHighlightTop ? `${highlightWidth}px` : '0',
                      borderRightWidth: effectiveHighlightRight ? `${highlightWidth}px` : '0',
                      borderBottomWidth: effectiveHighlightBottom ? `${highlightWidth}px` : '0',
                      borderLeftWidth: effectiveHighlightLeft ? `${highlightWidth}px` : '0',
                    }"
                  />
                </div>
                <div class="highlight-sides" aria-label="高亮边框位置">
                  <label
                    ><input
                      v-model="highlightTop"
                      type="checkbox"
                      @change="saveAppearance"
                    />上</label
                  >
                  <label
                    ><input
                      v-model="highlightRight"
                      type="checkbox"
                      @change="saveAppearance"
                    />右</label
                  >
                  <label
                    ><input
                      v-model="highlightBottom"
                      type="checkbox"
                      @change="saveAppearance"
                    />下</label
                  >
                  <label
                    ><input
                      v-model="highlightLeft"
                      type="checkbox"
                      @change="saveAppearance"
                    />左</label
                  >
                </div>
                <div class="highlight-scope-settings">
                  <span>使用自定义高亮</span>
                  <label>
                    <input v-model="highlightNavigation" type="checkbox" @change="saveAppearance" />
                    <b>主导航</b><small>侧边栏当前页面</small>
                  </label>
                  <label>
                    <input v-model="highlightTabs" type="checkbox" @change="saveAppearance" />
                    <b>标签页</b><small>页面、视图与功能标签</small>
                  </label>
                  <label>
                    <input v-model="highlightOptions" type="checkbox" @change="saveAppearance" />
                    <b>选项</b><small>筛选、账户与模式选择</small>
                  </label>
                  <label>
                    <input
                      v-model="highlightGachaContrast"
                      type="checkbox"
                      @change="saveAppearance"
                    />
                    <b>抽卡高对比度</b><small>覆盖该模式的橙色标记</small>
                  </label>
                </div>
                <div class="hover-highlight-settings">
                  <span>鼠标悬停高亮（沿用上方作用域）</span>
                  <label class="highlight-color-row">
                    颜色
                    <input v-model="hoverHighlightColor" type="color" @input="saveAppearance" />
                  </label>
                  <label class="highlight-style-row">
                    样式
                    <ThemedSelect
                      v-model="hoverHighlightStyle"
                      :options="[
                        { value: 'outline', label: '细边框' },
                        { value: 'underline', label: '底部线' },
                        { value: 'glow', label: '柔和发光' },
                        { value: 'fill', label: '浅色填充' },
                        { value: 'double', label: '双层边框' },
                        { value: 'lift', label: '轻微上浮' },
                      ]"
                      @change="saveAppearance"
                    />
                  </label>
                </div>
                <label class="highlight-color-row">
                  标记颜色
                  <input v-model="highlightColor" type="color" @input="saveAppearance" />
                </label>
                <label>
                  标记宽度 <b>{{ highlightWidth }}px</b>
                  <input
                    v-model.number="highlightWidth"
                    type="range"
                    min="1"
                    max="8"
                    step="1"
                    @input="saveAppearance"
                  />
                </label>
              </div>
            </section>
            <section class="appearance-wallpaper-section">
              <h3>主题壁纸</h3>
              <div class="wallpaper-mode-tabs" role="tablist" aria-label="壁纸模式">
                <button
                  v-for="mode in ['default', 'image', 'folder'] as const"
                  :key="mode"
                  type="button"
                  :class="{ active: wallpaperMode === mode }"
                  @click="setWallpaperMode(mode)"
                >
                  <strong>{{
                    { default: '默认', image: '选择图片', folder: '选择文件夹' }[mode]
                  }}</strong>
                  <small>{{
                    { default: '读取默认目录', image: '使用单张图片', folder: '轮播文件夹' }[mode]
                  }}</small>
                </button>
              </div>
              <div class="wallpaper-preview">
                <div
                  v-if="wallpaperData"
                  class="wallpaper-preview-image"
                  :style="{
                    backgroundImage: `url(${wallpaperData})`,
                    backgroundSize: wallpaperFit,
                    backgroundPosition: `${wallpaperPositionX}% ${wallpaperPositionY}%`,
                    transform: `scale(${wallpaperZoom / 100})`,
                  }"
                />
                <span v-if="!wallpaperData">{{
                  wallpaperMode === 'default' ? '默认目录中暂无图片' : '尚未选择壁纸'
                }}</span>
              </div>
              <div v-if="wallpaperMode === 'default'" class="wallpaper-source-panel">
                <strong>默认壁纸目录</strong
                ><code>{{ defaultWallpaperDirectory || '正在获取目录…' }}</code>
                <small
                  >将 PNG、JPG、JPEG、WebP 或 BMP 图片放入此目录；启动时随机选取，当前共
                  {{ wallpaperImageCount }} 张。</small
                >
                <button class="secondary-button" type="button" @click="loadWallpaper()">
                  重新读取
                </button>
              </div>
              <div v-else-if="wallpaperMode === 'image'" class="wallpaper-source-panel">
                <strong>单张图片</strong
                ><span>{{ wallpaperFileName || wallpaper || '尚未选择图片' }}</span>
                <button class="secondary-button" type="button" @click="chooseWallpaper('image')">
                  选择图片
                </button>
              </div>
              <div v-else class="wallpaper-source-panel">
                <strong>壁纸文件夹</strong><span>{{ wallpaper || '尚未选择文件夹' }}</span>
                <small v-if="wallpaperImageCount">已发现 {{ wallpaperImageCount }} 张图片</small>
                <button class="secondary-button" type="button" @click="chooseWallpaper('folder')">
                  选择文件夹
                </button>
              </div>
              <div v-if="wallpaperData" class="wallpaper-controls">
                <label
                  >填充方式<ThemedSelect
                    v-model="wallpaperFit"
                    :options="[
                      { value: 'cover', label: '裁剪填充' },
                      { value: 'contain', label: '完整显示' },
                    ]"
                    @change="saveAppearance" /></label
                ><label
                  >固定比例<ThemedSelect
                    v-model="wallpaperRatio"
                    :options="[
                      { value: 'viewport', label: '跟随窗口' },
                      { value: '16-9', label: '16:9' },
                      { value: '4-3', label: '4:3' },
                    ]"
                    @change="saveAppearance" /></label
                ><label
                  >缩放 {{ wallpaperZoom }}%<input
                    v-model.number="wallpaperZoom"
                    type="range"
                    min="0"
                    max="1000"
                    @input="saveAppearance" /></label
                ><label
                  >水平位置 {{ wallpaperPositionX }}%<input
                    v-model.number="wallpaperPositionX"
                    type="range"
                    min="0"
                    max="100"
                    @input="saveAppearance" /></label
                ><label
                  >垂直位置 {{ wallpaperPositionY }}%<input
                    v-model.number="wallpaperPositionY"
                    type="range"
                    min="0"
                    max="100"
                    @input="saveAppearance" /></label
                ><label
                  >暗化 {{ wallpaperDim }}%<input
                    v-model.number="wallpaperDim"
                    type="range"
                    min="0"
                    max="70"
                    @input="saveAppearance" /></label
                ><label
                  >模糊 {{ wallpaperBlur }}px<input
                    v-model.number="wallpaperBlur"
                    type="range"
                    min="0"
                    max="20"
                    @input="saveAppearance" /></label
                ><template v-if="wallpaperFit === 'contain'">
                  <label
                    >空白区模糊 {{ wallpaperFillBlur }}px<input
                      v-model.number="wallpaperFillBlur"
                      type="range"
                      min="0"
                      max="60"
                      @input="saveAppearance"
                  /></label>
                  <label
                    >空白区亮度 {{ wallpaperFillBrightness }}%<input
                      v-model.number="wallpaperFillBrightness"
                      type="range"
                      min="20"
                      max="120"
                      @input="saveAppearance"
                  /></label>
                  <label
                    >空白区饱和度 {{ wallpaperFillSaturation }}%<input
                      v-model.number="wallpaperFillSaturation"
                      type="range"
                      min="0"
                      max="160"
                      @input="saveAppearance"
                  /></label>
                  <label
                    >空白区缩放 {{ wallpaperFillScale }}%<input
                      v-model.number="wallpaperFillScale"
                      type="range"
                      min="0"
                      max="1000"
                      @input="saveAppearance"
                  /></label> </template
                ><label v-if="wallpaperMode === 'folder'" class="switch-row"
                  ><span><strong>自动轮播</strong><small>按指定间隔切换文件夹图片</small></span
                  ><input
                    v-model="wallpaperSlideshow"
                    type="checkbox"
                    @change="saveAppearance" /></label
                ><label v-if="wallpaperMode === 'folder'"
                  >轮播间隔<ThemedSelect
                    v-model="wallpaperIntervalMinutes"
                    :options="
                      [1, 5, 15, 30, 60].map((value) => ({
                        value,
                        label: `${value} 分钟`,
                      }))
                    "
                    @change="saveAppearance"
                /></label>
                <div v-if="wallpaperMode === 'folder'" class="button-row">
                  <button class="secondary-button" type="button" @click="switchWallpaper(-1)">
                    上一张</button
                  ><button class="secondary-button" type="button" @click="switchWallpaper(1)">
                    下一张</button
                  ><span>{{ wallpaperIndex + 1 }}/{{ wallpaperImageCount }}</span>
                </div>
              </div>
            </section>
          </div>
        </article>
        <article class="settings-card settings-card-wide behavior-settings-card">
          <h2>应用行为</h2>
          <label class="setting-select-row"
            ><span
              ><strong>账户信息自动更新</strong
              ><small
                >默认每 2 小时更新；手动刷新不受此设置影响<span v-if="lastAccountRefresh">
                  · 上次 {{ formatDate(lastAccountRefresh) }}</span
                ></small
              ></span
            ><ThemedSelect
              v-model="accountRefreshMinutes"
              :options="[
                { value: 0, label: '关闭自动更新' },
                { value: 30, label: '30 分钟' },
                { value: 60, label: '1 小时' },
                { value: 120, label: '2 小时' },
                { value: 360, label: '6 小时' },
                { value: 720, label: '12 小时' },
              ]"
              @change="saveAppearance"
          /></label>
          <label class="switch-row"
            ><span><strong>开机自启</strong><small>登录 Windows 后自动启动工具箱</small></span
            ><input v-model="autoStart" type="checkbox" @change="saveAppearance" /></label
          ><label class="switch-row"
            ><span
              ><strong>关闭应用时关闭游戏</strong
              ><small>退出工具箱时同时结束由工具箱启动的游戏</small></span
            ><input v-model="closeGameOnExit" type="checkbox" @change="saveAppearance"
          /></label>
          <label class="switch-row"
            ><span><strong>减少动态效果</strong><small>关闭页面与侧栏过渡动画</small></span
            ><input v-model="reduceMotion" type="checkbox" @change="saveAppearance"
          /></label>
          <label class="switch-row"
            ><span
              ><strong>导航栏跟随内容背景</strong
              ><small>默认使用独立毛玻璃；开启后与右侧内容区采用一致的壁纸效果</small></span
            ><input v-model="sidebarWallpaper" type="checkbox" @change="saveAppearance"
          /></label>
        </article>
      </div>
    </section>

    <section v-else class="content">
      <header class="page-header">
        <div>
          <p class="eyebrow">REDEMPTION CODES</p>
          <h1>兑换码</h1>
          <p class="subtitle">查看国服与国际服公开兑换码，一键复制后在游戏内兑换</p>
        </div>
        <button
          class="secondary-button"
          type="button"
          :disabled="redemptionLoading"
          @click="openRedemptionPage(true)"
        >
          刷新
        </button>
      </header>
      <div class="tab-bar">
        <button
          type="button"
          :class="{ active: redemptionRegion === 'cn' }"
          @click="redemptionRegion = 'cn'"
        >
          国服</button
        ><button
          type="button"
          :class="{ active: redemptionRegion === 'global' }"
          @click="redemptionRegion = 'global'"
        >
          国际服
        </button>
      </div>
      <p v-if="redemptionLoading">正在获取兑换码…</p>
      <p v-else-if="redemptionError" class="error-detail">获取失败：{{ redemptionError }}</p>
      <div v-else-if="redemptionCatalog" class="code-list">
        <article
          v-for="item in redemptionCatalog[redemptionRegion]"
          :key="item.code"
          :class="{ expired: !item.valid, used: item.used }"
        >
          <div>
            <strong>{{ item.code }}</strong
            ><span>{{ item.used ? '已使用' : item.valid ? '可用' : '已失效' }}</span>
            <p>{{ item.reward || item.description || '奖励内容以游戏内为准' }}</p>
          </div>
          <div class="code-actions">
            <button
              class="secondary-button"
              type="button"
              :disabled="!item.valid"
              @click="copyRedemptionCode(item.code)"
            >
              {{ copiedCode === item.code ? '已复制' : '复制' }}
            </button>
            <button
              class="secondary-button used-toggle"
              type="button"
              @click="toggleRedemptionUsed(item.code, !item.used)"
            >
              {{ item.used ? '标记未使用' : '标记已使用' }}
            </button>
          </div>
        </article>
        <small>数据来源：{{ redemptionCatalog.source }} · 公开社区数据，不代表库洛官方</small>
      </div>
    </section>

    <AppDialog :open="accountManagerOpen" @close="closeAccountManager">
      <section
        class="dialog-surface account-modal"
        role="dialog"
        aria-modal="true"
        aria-label="账户管理"
      >
        <header>
          <div>
            <p class="eyebrow">ACCOUNT MANAGER</p>
            <h2>账户管理</h2>
          </div>
          <div class="account-header-actions">
            <button type="button" :disabled="launchingId !== null" @click="loginOtherAccount">
              登录其他账户</button
            ><button type="button" :disabled="launcherLoading" @click="scanLauncherAccounts">
              {{ launcherLoading ? '读取中…' : '从官方启动器导入' }}</button
            ><button
              class="icon-button"
              type="button"
              title="关闭"
              aria-label="关闭账户管理"
              @click="closeAccountManager"
            >
              ×
            </button>
          </div>
        </header>
        <label class="account-switch-preference switch-row">
          <span>
            <strong>切换后自动关闭</strong>
            <small>成功切换或导入账户后关闭账户管理弹窗</small>
          </span>
          <input
            v-model="closeAccountManagerAfterSwitch"
            type="checkbox"
            @change="saveAccountSwitchPreference"
          />
        </label>
        <div class="manager-layout">
          <div class="account-list compact">
            <article
              v-for="account in accounts"
              :key="account.id"
              class="account-card"
              :class="{ active: account.active }"
            >
              <div class="avatar">
                <img
                  v-if="launcherAccountForProfile(account)?.avatarUrl"
                  :src="launcherAccountForProfile(account)?.avatarUrl || ''"
                  alt="账户头像"
                />
                <span v-else class="account-avatar-placeholder" aria-hidden="true" />
              </div>
              <div>
                <strong>{{ account.displayName }}</strong>
                <p>
                  {{ account.playerId ? `UID ${account.playerId}` : '未绑定 UID' }} ·
                  {{ account.note || '无备注' }}
                </p>
              </div>
              <button class="text-button" type="button" @click="editAccount(account)">
                编辑备注</button
              ><button
                class="secondary-button"
                type="button"
                :disabled="account.active"
                @click="activateAccount(account.id)"
              >
                {{ account.active ? '使用中' : '使用' }}</button
              ><button class="danger-text" type="button" @click="removeAccount(account.id)">
                删除
              </button>
            </article>
            <article
              v-for="account in launcherAccounts.filter(
                (item) => !accounts.some((profile) => profile.playerId === item.roleId),
              )"
              :key="account.id"
              class="account-card launcher"
            >
              <div class="avatar">
                <img v-if="account.avatarUrl" :src="account.avatarUrl" alt="账户头像" />
                <span v-else class="account-avatar-placeholder" aria-hidden="true" />
              </div>
              <div>
                <strong>{{ account.roleName || account.label }}</strong>
                <p>
                  {{
                    account.roleId
                      ? `UID ${account.roleId} · Lv.${account.level ?? '—'}`
                      : account.errorCode || '等待登录'
                  }}
                </p>
              </div>
              <button
                class="secondary-button"
                type="button"
                :disabled="!account.roleId || activeAccount?.playerId === account.roleId"
                @click="importLauncherAccount(account)"
              >
                {{ activeAccount?.playerId === account.roleId ? '使用中' : '使用' }}
              </button>
            </article>
          </div>
        </div>
        <p v-if="accountError" class="error-detail">{{ accountError }}</p>
      </section>
    </AppDialog>
    <AppDialog :open="Boolean(editingAccountId)" @close="closeAccountEditor">
      <form
        v-if="editingAccountId"
        class="dialog-surface profile-form account-editor-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-editor-title"
        @submit.prevent="saveAccount"
      >
        <header>
          <h3 id="account-editor-title">编辑账户备注</h3>
          <button type="button" aria-label="关闭编辑账户备注" @click="closeAccountEditor">×</button>
        </header>
        <label
          >备注<input v-model="accountNote" maxlength="120" placeholder="为这个账户添加备注"
        /></label>
        <label>显示名称<input v-model="accountName" maxlength="40" required /></label
        ><label
          >游戏 UID（可选）<input
            v-model="accountPlayerId"
            inputmode="numeric"
            pattern="[0-9]{1,20}" /></label
        ><label
          >区服<ThemedSelect
            v-model="accountRegion"
            :options="[
              { value: 'cn', label: '国服' },
              { value: 'global', label: '国际服' },
            ]" /></label
        ><label
          >关联安装<ThemedSelect
            v-model="accountInstallationId"
            :options="[
              { value: '', label: '自动选择' },
              ...installations.map((game) => ({
                value: game.id,
                label: `${regionName(game.region)} · ${game.rootPath}`,
              })),
            ]"
        /></label>
        <p v-if="accountError" class="error-detail">{{ accountError }}</p>
        <footer class="dialog-actions">
          <button type="button" @click="closeAccountEditor">取消</button>
          <button class="account-editor-save" type="submit">保存修改</button>
        </footer>
      </form>
    </AppDialog>
  </main>
</template>

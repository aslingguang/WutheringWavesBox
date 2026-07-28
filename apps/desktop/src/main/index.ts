import { join } from 'node:path';
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  protocol,
  net,
  safeStorage,
  shell,
} from 'electron';
import type {
  AppInfo,
  CopyConveneUrlResult,
  GameInstallation,
  GameProcessState,
  GameValidationResult,
  GameVersionState,
  GameDisplaySettings,
  SaveGameDisplaySettingsInput,
  LaunchGameInput,
  AccountProfile,
  RedemptionCodeCatalog,
  SaveAccountProfileInput,
  LauncherAccount,
  WallpaperSelection,
  GachaAnalysis,
  ImportGachaInput,
  ImportGachaResult,
  SnapshotExportInput,
  GachaVersionMetadata,
  SaveVersionMetadataInput,
  VersionMetadataConflictStrategy,
  VersionMetadataUpdatePreview,
  KuroLoginInput,
  KuroSmsInput,
  KuroCalculationInput,
  KuroResourcePeriod,
  KuroResourcePeriodType,
  UpdateKuroAccountInput,
} from '@wwbox/contracts';
import { HelperClient } from './services/helper-client';
import { GameInstallationRepository } from './services/game-installation-repository';
import { GameVersionService } from './services/game-version-service';
import { GameSettingsService } from './services/game-settings-service';
import { AccountRepository } from './services/account-repository';
import { RedemptionCodeService } from './services/redemption-code-service';
import { RedemptionCodeRepository } from './services/redemption-code-repository';
import { LauncherAccountService } from './services/launcher-account-service';
import { GachaRepository } from './services/gacha-repository';
import { GachaImportService } from './services/gacha-import-service';
import { GachaImageService } from './services/gacha-image-service';
import { VersionMetadataService } from './services/version-metadata-service';
import { KuroRepository } from './services/kuro-repository';
import { KuroService } from './services/kuro-service';

let mainWindow: BrowserWindow | null = null;
let helperClient: HelperClient | null = null;
let gameRepository: GameInstallationRepository | null = null;
let accountRepository: AccountRepository | null = null;
let gachaRepository: GachaRepository | null = null;
const gameVersionService = new GameVersionService();
const gameSettingsService = new GameSettingsService();
let redemptionCodeService: RedemptionCodeService | null = null;
let redemptionCodeRepository: RedemptionCodeRepository | null = null;
const launcherAccountService = new LauncherAccountService();
const gachaImportService = new GachaImportService();
let gachaImageService: GachaImageService | null = null;
let versionMetadataService: VersionMetadataService | null = null;
let kuroRepository: KuroRepository | null = null;
let kuroService: KuroService | null = null;
let kuroSignTimer: NodeJS.Timeout | null = null;
const kuroMobileWindows = new Set<BrowserWindow>();
let closeGameOnExit = false;
let closingAfterGameStop = false;
const wallpaperFolderCache = new Map<string, { modifiedAt: number; images: string[] }>();
const wallpaperImageCache = new Map<string, string>();
let kuroArtworkCacheDirectory = '';
const KURO_MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 9; PJH110 Build/PQ3B.190801.04011825; wv) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/91.0.4472.114 ' +
  'Mobile Safari/537.36 Kuro/3.0.1 KuroGameBox/3.0.1';
function isOfficialKuroMobileUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'web-static.kurobbs.com' &&
      ['/mcbox/', '/resource-briefing/', '/mccalendar/', '/growth-calculator/', '/events2.0/'].some(
        (path) => url.pathname.startsWith(path),
      )
    );
  } catch {
    return false;
  }
}

async function openKuroMobileWindow(url: string, auth: Record<string, string>): Promise<void> {
  const encodedAuth = Buffer.from(
    JSON.stringify({
      token: auth['token'] ?? '',
      did: auth['did'] ?? '',
      userId: auth['userId'] ?? '',
      roleId: auth['roleId'] ?? '',
      serverId: auth['serverId'] ?? '',
      channelId: auth['channelId'] || '19',
      requestIp: auth['requestIp'] ?? '',
      gameId: auth['gameId'] || '3',
    }),
  ).toString('base64url');
  const roleId = encodeURIComponent(auth['roleId'] ?? '');
  const serverId = encodeURIComponent(auth['serverId'] ?? '');
  const pages = [
    {
      label: '数据终端',
      url: `https://web-static.kurobbs.com/mcbox/index.html#/mc-role-box?accessType=1&roleId=${roleId}&serverId=${serverId}`,
    },
    { label: '资源简报', url: 'https://web-static.kurobbs.com/resource-briefing/index.html#/home' },
    { label: '活动日历', url: 'https://web-static.kurobbs.com/mccalendar/index.html#/' },
    { label: '养成计算', url: 'https://web-static.kurobbs.com/growth-calculator/index.html#/' },
    {
      label: '每日签到',
      url: 'https://web-static.kurobbs.com/events2.0/index.html#/mc-month-sign/home',
    },
  ];
  const initialIndex = Math.max(
    0,
    pages.findIndex((page) => page.url === url),
  );
  const mobile = new BrowserWindow({
    width: 430,
    height: 900,
    minWidth: 390,
    minHeight: 650,
    title: '库街区手机视图',
    backgroundColor: '#10151a',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
      webviewTag: true,
    },
  });
  kuroMobileWindows.add(mobile);
  mobile.setMenuBarVisibility(false);
  mobile.on('closed', () => kuroMobileWindows.delete(mobile));
  mobile.webContents.on('will-attach-webview', (event, preferences, params) => {
    if (!params.src || !isOfficialKuroMobileUrl(params.src)) {
      event.preventDefault();
      return;
    }
    preferences.nodeIntegration = false;
    preferences.contextIsolation = true;
    preferences.sandbox = false;
    preferences.webSecurity = true;
    preferences.preload = join(__dirname, '../preload/kuro-mobile.cjs');
    preferences.additionalArguments = [`--kuro-mobile-auth=${encodedAuth}`];
  });
  mobile.webContents.on('did-attach-webview', (_event, guest) => {
    guest.setUserAgent(KURO_MOBILE_UA);
    guest.setWindowOpenHandler(({ url: target }) => {
      if (isOfficialKuroMobileUrl(target)) {
        void guest.loadURL(target, { userAgent: KURO_MOBILE_UA });
      } else if (target.startsWith('https://')) {
        void shell.openExternal(target);
      }
      return { action: 'deny' };
    });
    guest.on('did-start-loading', () => {
      void mobile.webContents.executeJavaScript(`window.setMobileStatus('正在加载官方页面…')`);
    });
    guest.on('did-fail-load', (_loadEvent, code, description) => {
      if (code === -3) return;
      void mobile.webContents.executeJavaScript(
        `window.setMobileStatus(${JSON.stringify(`官方页面加载失败（${description}）`)}, true)`,
      );
    });
  });
  const icons = ['◈', '▤', '▦', '⌁', '✓'];
  const shellPage = `<!doctype html><html><head><meta charset="utf-8">
    <style>*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;
    background:#0d141a;color:#edf4f8;font:12px system-ui,"Microsoft YaHei",sans-serif}
    body{display:grid;grid-template-rows:68px minmax(0,1fr)}nav{z-index:2;display:grid;
    grid-template-columns:repeat(5,minmax(0,1fr));align-items:stretch;gap:5px;padding:6px;
    border-bottom:1px solid #384650;background:#121c23}
    button{min-width:0;border:1px solid #42535e;border-radius:8px;color:inherit;background:#1b2831;
    padding:4px 3px;cursor:pointer}button i{display:block;color:#d8ba68;font:normal 20px/24px sans-serif}
    button span{display:block;font-size:12px;line-height:18px;white-space:nowrap}
    button:hover,button.active{border-color:#e1c16d;background:#3a3323;color:#fff0bc}
    main{position:relative;min-height:0}webview{display:inline-flex;width:100%;height:100%;background:#fff}
    #status{position:absolute;z-index:3;inset:0;display:none;place-items:center;background:#101820;
    padding:25px;text-align:center;font-size:14px}#status.show{display:grid}#status.error{color:#ff998f}</style></head>
    <body><nav>${pages
      .map(
        (page, index) =>
          `<button type="button" data-index="${index}"${index === initialIndex ? ' class="active"' : ''}>
          <i>${icons[index]}</i><span>${page.label}</span></button>`,
      )
      .join('')}</nav><main><div id="status" class="show">正在加载官方页面…</div>
      <webview id="viewer" partition="persist:kuro-mobile" src="${pages[initialIndex]?.url ?? url}"
      useragent="${KURO_MOBILE_UA}" allowpopups="false"></webview></main><script>
      const pages=${JSON.stringify(pages.map((page) => page.url))};
      const viewer=document.getElementById('viewer'),status=document.getElementById('status');
      window.setMobileStatus=(text,error=false)=>{status.textContent=text;status.className=text
        ?'show'+(error?' error':''):''};
      let loadingTimer=setTimeout(()=>window.setMobileStatus('官方页面加载超时，请检查网络后重试',true),20000);
      const loaded=()=>{clearTimeout(loadingTimer);window.setMobileStatus('')};
      viewer.addEventListener('did-finish-load',loaded);
      viewer.addEventListener('did-stop-loading',loaded);
      viewer.addEventListener('did-fail-load',(event)=>{if(event.errorCode!==-3){
        clearTimeout(loadingTimer);window.setMobileStatus('官方页面加载失败：'+event.errorDescription,true)}});
      document.querySelectorAll('button').forEach((button)=>button.addEventListener('click',()=>{
        const index=Number(button.dataset.index);document.querySelectorAll('button').forEach((item)=>
          item.classList.toggle('active',item===button));window.setMobileStatus('正在加载官方页面…');
        clearTimeout(loadingTimer);loadingTimer=setTimeout(() =>
          window.setMobileStatus('官方页面加载超时，请检查网络后重试',true),20000);
        viewer.loadURL(pages[index]);
      }));
      </script></body></html>`;
  await mobile.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(shellPage)}`);
}

function createWindow(): void {
  Menu.setApplicationMenu(null);
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    show: false,
    title: 'WutheringWavesBox',
    icon: bundledResourcePath('icon.png'),
    frame: false,
    backgroundColor: '#0b1015',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on('ready-to-show', () => mainWindow?.show());
  mainWindow.on('close', (event) => {
    if (!closeGameOnExit || closingAfterGameStop) return;
    event.preventDefault();
    closingAfterGameStop = true;
    void helperClient
      ?.stopAllGames()
      .catch(() => 0)
      .finally(() => {
        mainWindow?.destroy();
        app.quit();
      });
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function registerIpc(): void {
  ipcMain.handle('system.health', async (event): Promise<AppInfo> => {
    assertTrustedSender(event.sender);
    if (!helperClient) throw new Error('HELPER_UNAVAILABLE');
    return {
      appVersion: app.getVersion(),
      platform: process.platform,
      helper: await helperClient.health(),
    };
  });
  ipcMain.handle('kuro.listAccounts', (event) => {
    assertTrustedSender(event.sender);
    return requireKuroService().listAccounts();
  });
  ipcMain.handle('kuro.requestCaptcha', async (event) => {
    assertTrustedSender(event.sender);
    return showKuroCaptcha();
  });
  ipcMain.handle('kuro.sendSms', async (event, input: unknown) => {
    assertTrustedSender(event.sender);
    if (!isKuroSmsInput(input)) throw new Error('INVALID_ARGUMENT');
    return requireKuroService().sendSms(input);
  });
  ipcMain.handle('kuro.login', async (event, input: unknown) => {
    assertTrustedSender(event.sender);
    if (!isKuroLoginInput(input)) throw new Error('INVALID_ARGUMENT');
    return requireKuroService().login(input);
  });
  ipcMain.handle('kuro.update', async (event, input: unknown) => {
    assertTrustedSender(event.sender);
    if (!isUpdateKuroAccountInput(input)) throw new Error('INVALID_ARGUMENT');
    return requireKuroService().update(input);
  });
  ipcMain.handle('kuro.activate', (event, id: unknown) => {
    assertTrustedSender(event.sender);
    return requireKuroService().activate(assertId(id));
  });
  ipcMain.handle('kuro.remove', (event, id: unknown) => {
    assertTrustedSender(event.sender);
    requireKuroService().remove(assertId(id));
  });
  ipcMain.handle('kuro.selectRole', (event, id: unknown, roleId: unknown) => {
    assertTrustedSender(event.sender);
    return requireKuroService().selectRole(assertId(id), assertId(roleId));
  });
  ipcMain.handle('kuro.setAutoSign', (event, id: unknown, enabled: unknown) => {
    assertTrustedSender(event.sender);
    if (typeof enabled !== 'boolean') throw new Error('INVALID_ARGUMENT');
    return requireKuroService().setAutoSign(assertId(id), enabled);
  });
  ipcMain.handle('kuro.setAllAutoSign', (event, enabled: unknown) => {
    assertTrustedSender(event.sender);
    if (typeof enabled !== 'boolean') throw new Error('INVALID_ARGUMENT');
    return requireKuroService().setAllAutoSign(enabled);
  });
  ipcMain.handle('kuro.setAutoRetroSign', (event, id: unknown, enabled: unknown) => {
    assertTrustedSender(event.sender);
    if (typeof enabled !== 'boolean') throw new Error('INVALID_ARGUMENT');
    return requireKuroService().setAutoRetroSign(assertId(id), enabled);
  });
  ipcMain.handle('kuro.setAllAutoRetroSign', (event, enabled: unknown) => {
    assertTrustedSender(event.sender);
    if (typeof enabled !== 'boolean') throw new Error('INVALID_ARGUMENT');
    return requireKuroService().setAllAutoRetroSign(enabled);
  });
  ipcMain.handle('kuro.sign', async (event, id: unknown) => {
    assertTrustedSender(event.sender);
    return requireKuroService().sign(id === undefined ? undefined : assertId(id));
  });
  ipcMain.handle('kuro.retroSign', async (event, id: unknown) => {
    assertTrustedSender(event.sender);
    return requireKuroService().retroSign(id === undefined ? undefined : assertId(id));
  });
  ipcMain.handle('kuro.retroEligibility', async (event, id: unknown) => {
    assertTrustedSender(event.sender);
    return requireKuroService().retroEligibility(id === undefined ? undefined : assertId(id));
  });
  ipcMain.handle('kuro.dashboard', async (event, id: unknown, roleId: unknown, force: unknown) => {
    assertTrustedSender(event.sender);
    if (force !== undefined && typeof force !== 'boolean') throw new Error('INVALID_ARGUMENT');
    return requireKuroService().dashboard(
      assertId(id),
      roleId === undefined ? undefined : assertId(roleId),
      force as boolean | undefined,
    );
  });
  ipcMain.handle('kuro.homeWidget', async (event, playerId: unknown) => {
    assertTrustedSender(event.sender);
    if (typeof playerId !== 'string' || !/^\d{5,20}$/.test(playerId))
      throw new Error('INVALID_ARGUMENT');
    return requireKuroService().homeWidget(playerId);
  });
  ipcMain.handle('kuro.calculate', async (event, input: unknown) => {
    assertTrustedSender(event.sender);
    if (!isKuroCalculationInput(input)) throw new Error('INVALID_ARGUMENT');
    return requireKuroService().calculate(input);
  });
  ipcMain.handle(
    'kuro.resourceBriefing',
    async (event, accountId: unknown, roleId: unknown, periodType: unknown, period: unknown) => {
      assertTrustedSender(event.sender);
      if (!isKuroResourcePeriodType(periodType) || !isKuroResourcePeriod(period))
        throw new Error('INVALID_ARGUMENT');
      return requireKuroService().resourceBriefing(
        assertId(accountId),
        roleId === undefined ? undefined : assertId(roleId),
        periodType,
        period,
      );
    },
  );
  ipcMain.handle('kuro.refreshRoles', async (event, id: unknown) => {
    assertTrustedSender(event.sender);
    return requireKuroService().refreshRoles(assertId(id));
  });
  ipcMain.handle(
    'kuro.roleDetail',
    async (event, accountId: unknown, roleId: unknown, cardRoleId: unknown) => {
      assertTrustedSender(event.sender);
      if (!Number.isInteger(cardRoleId) || Number(cardRoleId) <= 0)
        throw new Error('INVALID_ARGUMENT');
      return requireKuroService().roleDetail(
        assertId(accountId),
        assertId(roleId),
        Number(cardRoleId),
      );
    },
  );
  ipcMain.handle(
    'kuro.roleCultivateStatus',
    async (event, accountId: unknown, roleId: unknown, cardRoleId: unknown) => {
      assertTrustedSender(event.sender);
      if (!Number.isInteger(cardRoleId) || Number(cardRoleId) <= 0)
        throw new Error('INVALID_ARGUMENT');
      return requireKuroService().roleCultivateStatus(
        assertId(accountId),
        assertId(roleId),
        Number(cardRoleId),
      );
    },
  );
  ipcMain.handle('kuro.roleArtworks', async (event, roles: unknown, options: unknown) => {
    assertTrustedSender(event.sender);
    if (
      !Array.isArray(roles) ||
      roles.some((role) => {
        if (!role || typeof role !== 'object') return true;
        const value = role as Record<string, unknown>;
        return (
          !Number.isInteger(value['id']) ||
          Number(value['id']) <= 0 ||
          typeof value['name'] !== 'string' ||
          (value['icon'] !== undefined && typeof value['icon'] !== 'string') ||
          (value['element'] !== undefined && typeof value['element'] !== 'string')
        );
      })
    )
      throw new Error('INVALID_ARGUMENT');
    const artworkOptions = options as Record<string, unknown> | undefined;
    if (
      artworkOptions &&
      (typeof artworkOptions['useCardThumbnail'] !== 'boolean' ||
        !Number.isInteger(artworkOptions['cardResolution']) ||
        Number(artworkOptions['cardResolution']) < 128 ||
        Number(artworkOptions['cardResolution']) > 2048)
    )
      throw new Error('INVALID_ARGUMENT');
    return requireKuroService().roleArtworks(
      roles.map((role) => {
        const value = role as Record<string, unknown>;
        return {
          id: Number(value['id']),
          name: String(value['name']),
          ...(typeof value['icon'] === 'string' ? { icon: value['icon'] } : {}),
          ...(typeof value['element'] === 'string' ? { element: value['element'] } : {}),
        };
      }),
      artworkOptions
        ? {
            useCardThumbnail: Boolean(artworkOptions['useCardThumbnail']),
            cardResolution: Number(artworkOptions['cardResolution']),
          }
        : undefined,
    );
  });
  ipcMain.handle(
    'kuro.openMobile',
    async (event, accountId: unknown, roleId: unknown, url: unknown) => {
      assertTrustedSender(event.sender);
      if (typeof url !== 'string' || !isOfficialKuroMobileUrl(url))
        throw new Error('INVALID_ARGUMENT');
      const service = requireKuroService();
      const validAccountId = assertId(accountId);
      const validRoleId = assertId(roleId);
      const auth = service.mobileAuth(validAccountId, validRoleId);
      await openKuroMobileWindow(url, auth);
    },
  );
  ipcMain.handle('system.getDefaultWallpaperDirectory', (event): string => {
    assertTrustedSender(event.sender);
    return ensureDefaultWallpaperDirectory();
  });
  ipcMain.handle(
    'system.chooseWallpaper',
    async (event, mode: unknown): Promise<WallpaperSelection | null> => {
      assertTrustedSender(event.sender);
      if (mode !== 'image' && mode !== 'folder') throw new Error('INVALID_ARGUMENT');
      const result = await dialog.showOpenDialog(mainWindow!, {
        properties: mode === 'folder' ? ['openDirectory'] : ['openFile'],
        ...(mode === 'image'
          ? { filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }] }
          : {}),
      });
      if (result.canceled || !result.filePaths[0]) return null;
      return resolveWallpaper(mode, result.filePaths[0]);
    },
  );
  ipcMain.handle(
    'system.loadWallpaper',
    async (
      event,
      mode: unknown,
      sourcePath: unknown,
      index: unknown,
    ): Promise<WallpaperSelection | null> => {
      assertTrustedSender(event.sender);
      if (
        (mode !== 'default' && mode !== 'image' && mode !== 'folder') ||
        (mode !== 'default' && !isValidRootPath(sourcePath))
      )
        throw new Error('INVALID_ARGUMENT');
      if (index !== undefined && (!Number.isInteger(index) || (index as number) < 0))
        throw new Error('INVALID_ARGUMENT');
      return resolveWallpaper(
        mode,
        mode === 'default' ? ensureDefaultWallpaperDirectory() : (sourcePath as string),
        index as number | undefined,
      );
    },
  );
  ipcMain.handle('system.setAutoStart', (event, enabled: unknown): void => {
    assertTrustedSender(event.sender);
    if (typeof enabled !== 'boolean') throw new Error('INVALID_ARGUMENT');
    app.setLoginItemSettings({ openAtLogin: enabled });
  });
  ipcMain.handle('system.setCloseGameOnExit', (event, enabled: unknown): void => {
    assertTrustedSender(event.sender);
    if (typeof enabled !== 'boolean') throw new Error('INVALID_ARGUMENT');
    closeGameOnExit = enabled;
  });
  ipcMain.handle('system.controlWindow', (event, action: unknown): boolean => {
    assertTrustedSender(event.sender);
    if (!mainWindow || !['minimize', 'toggleMaximize', 'close'].includes(String(action)))
      throw new Error('INVALID_ARGUMENT');
    if (action === 'minimize') mainWindow.minimize();
    else if (action === 'toggleMaximize') {
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
    } else mainWindow.close();
    return mainWindow.isMaximized();
  });

  ipcMain.handle('game.detectInstallations', async (event): Promise<GameInstallation[]> => {
    assertTrustedSender(event.sender);
    if (!helperClient) throw new Error('HELPER_UNAVAILABLE');
    if (!gameRepository) throw new Error('DATABASE_UNAVAILABLE');
    const detected = await helperClient.detectGameInstallations();
    for (const installation of detected) gameRepository.upsert(installation);
    return gameRepository.list();
  });

  ipcMain.handle('game.listInstallations', (event): GameInstallation[] => {
    assertTrustedSender(event.sender);
    if (!gameRepository) throw new Error('DATABASE_UNAVAILABLE');
    return gameRepository.list();
  });

  ipcMain.handle(
    'game.validateInstallation',
    async (event, rootPath: unknown): Promise<GameValidationResult> => {
      assertTrustedSender(event.sender);
      if (!isValidRootPath(rootPath)) {
        throw new Error('INVALID_ARGUMENT');
      }
      if (!helperClient) throw new Error('HELPER_UNAVAILABLE');
      return helperClient.validateGameInstallation(rootPath);
    },
  );
  ipcMain.handle('game.stopAll', async (event): Promise<number> => {
    assertTrustedSender(event.sender);
    if (!helperClient) throw new Error('HELPER_UNAVAILABLE');
    return helperClient.stopAllGames();
  });

  ipcMain.handle('game.chooseInstallation', async (event): Promise<GameValidationResult | null> => {
    assertTrustedSender(event.sender);
    if (!mainWindow || !helperClient) throw new Error('HELPER_UNAVAILABLE');
    const selection = await dialog.showOpenDialog(mainWindow, {
      title: '选择鸣潮游戏根目录',
      properties: ['openDirectory'],
    });
    const rootPath = selection.filePaths[0];
    if (selection.canceled || !rootPath) return null;
    const result = await helperClient.validateGameInstallation(rootPath);
    if (result.valid && result.installation) gameRepository?.upsert(result.installation);
    return result;
  });

  ipcMain.handle('game.launch', async (event, input: unknown): Promise<GameProcessState> => {
    assertTrustedSender(event.sender);
    if (!isLaunchGameInput(input)) throw new Error('INVALID_ARGUMENT');
    if (!helperClient) throw new Error('HELPER_UNAVAILABLE');
    return helperClient.launchGame(input);
  });

  ipcMain.handle(
    'game.getProcessState',
    async (event, rootPath: unknown): Promise<GameProcessState> => {
      assertTrustedSender(event.sender);
      if (!isValidRootPath(rootPath)) throw new Error('INVALID_ARGUMENT');
      if (!helperClient) throw new Error('HELPER_UNAVAILABLE');
      return helperClient.getGameProcessState(rootPath);
    },
  );

  ipcMain.handle('game.removeInstallation', (event, installationId: unknown): void => {
    assertTrustedSender(event.sender);
    if (typeof installationId !== 'string' || !/^[a-f0-9]{16}$/.test(installationId)) {
      throw new Error('INVALID_ARGUMENT');
    }
    if (!gameRepository) throw new Error('DATABASE_UNAVAILABLE');
    gameRepository.remove(installationId);
  });

  ipcMain.handle(
    'game.checkVersion',
    async (event, installationId: unknown): Promise<GameVersionState> => {
      assertTrustedSender(event.sender);
      if (typeof installationId !== 'string' || !/^[a-f0-9]{16}$/.test(installationId)) {
        throw new Error('INVALID_ARGUMENT');
      }
      if (!gameRepository) throw new Error('DATABASE_UNAVAILABLE');
      let installation = gameRepository.get(installationId);
      if (!installation) throw new Error('GAME_NOT_FOUND');
      if (helperClient) {
        const validation = await helperClient.validateGameInstallation(installation.rootPath);
        if (validation.valid && validation.installation) {
          installation = validation.installation;
          gameRepository.upsert(installation);
        }
      }
      return gameVersionService.check(installation);
    },
  );

  ipcMain.handle(
    'game.getDisplaySettings',
    (event, installationId: unknown): GameDisplaySettings => {
      assertTrustedSender(event.sender);
      const installation = getInstallation(installationId);
      return gameSettingsService.read(installation.rootPath);
    },
  );

  ipcMain.handle(
    'game.saveDisplaySettings',
    (event, installationId: unknown, input: unknown): GameDisplaySettings => {
      assertTrustedSender(event.sender);
      if (!isSaveGameDisplaySettingsInput(input)) throw new Error('INVALID_ARGUMENT');
      const installation = getInstallation(installationId);
      return gameSettingsService.save(installation.rootPath, input);
    },
  );

  ipcMain.handle('game.openUpdater', async (event, installationId: unknown): Promise<void> => {
    assertTrustedSender(event.sender);
    if (typeof installationId !== 'string' || !/^[a-f0-9]{16}$/.test(installationId)) {
      throw new Error('INVALID_ARGUMENT');
    }
    if (!gameRepository) throw new Error('DATABASE_UNAVAILABLE');
    const installation = gameRepository.get(installationId);
    if (!installation) throw new Error('GAME_NOT_FOUND');
    if (installation.region === 'wegame') throw new Error('UPDATER_MANAGED_BY_WEGAME');

    const candidates = [
      join(installation.rootPath, 'launcher.exe'),
      join(installation.rootPath, '..', 'launcher.exe'),
      join(installation.rootPath, '..', '..', 'launcher.exe'),
    ];
    const updater = candidates.find((candidate) => {
      try {
        return statSync(candidate).isFile();
      } catch {
        return false;
      }
    });
    if (!updater) throw new Error('GAME_UPDATER_NOT_FOUND');
    const failure = await shell.openPath(updater);
    if (failure) throw new Error(`GAME_UPDATER_LAUNCH_FAILED: ${failure}`);
  });

  ipcMain.handle(
    'gacha.copyConveneUrl',
    async (event, installationId: unknown): Promise<CopyConveneUrlResult> => {
      assertTrustedSender(event.sender);
      if (typeof installationId !== 'string' || !/^[a-f0-9]{16}$/.test(installationId)) {
        throw new Error('INVALID_ARGUMENT');
      }
      if (!gameRepository || !helperClient) throw new Error('SERVICE_UNAVAILABLE');
      const installation = gameRepository.get(installationId);
      if (!installation) throw new Error('GAME_NOT_FOUND');

      const result = await helperClient.findConveneUrl(installation.rootPath);
      if (!result.found || !result.url) {
        return {
          found: false,
          source: result.source,
          copiedAt: null,
          errorCode: result.errorCode,
        };
      }

      clipboard.writeText(result.url, 'clipboard');
      return {
        found: true,
        source: result.source,
        copiedAt: new Date().toISOString(),
        errorCode: null,
      };
    },
  );

  ipcMain.handle('account.list', (event): AccountProfile[] => {
    assertTrustedSender(event.sender);
    if (!accountRepository) throw new Error('DATABASE_UNAVAILABLE');
    return accountRepository.list();
  });

  ipcMain.handle('account.save', (event, input: unknown): AccountProfile => {
    assertTrustedSender(event.sender);
    if (!isSaveAccountInput(input)) throw new Error('INVALID_ARGUMENT');
    if (!accountRepository) throw new Error('DATABASE_UNAVAILABLE');
    if (input.installationId && !gameRepository?.get(input.installationId))
      throw new Error('GAME_NOT_FOUND');
    return accountRepository.save(input);
  });

  ipcMain.handle('account.activate', (event, accountId: unknown): AccountProfile => {
    assertTrustedSender(event.sender);
    if (!isUuid(accountId)) throw new Error('INVALID_ARGUMENT');
    const account = accountRepository?.activate(accountId);
    if (!account) throw new Error('ACCOUNT_NOT_FOUND');
    return account;
  });

  ipcMain.handle('account.remove', (event, accountId: unknown): void => {
    assertTrustedSender(event.sender);
    if (!isUuid(accountId)) throw new Error('INVALID_ARGUMENT');
    accountRepository?.remove(accountId);
  });

  ipcMain.handle('account.scanLauncher', async (event): Promise<LauncherAccount[]> => {
    assertTrustedSender(event.sender);
    return launcherAccountService.scan(
      app.getPath('appData'),
      app.getAppPath(),
      join(app.getPath('userData'), 'gacha-images'),
    );
  });

  ipcMain.handle('account.activateLauncher', (event, accountId: unknown): void => {
    assertTrustedSender(event.sender);
    if (typeof accountId !== 'string' || !/^[a-f0-9]{24}$/.test(accountId)) {
      throw new Error('INVALID_ARGUMENT');
    }
    launcherAccountService.activate(accountId);
  });

  ipcMain.handle(
    'redemption.list',
    async (event, forceRefresh: unknown): Promise<RedemptionCodeCatalog> => {
      assertTrustedSender(event.sender);
      if (forceRefresh !== undefined && typeof forceRefresh !== 'boolean')
        throw new Error('INVALID_ARGUMENT');
      if (!redemptionCodeService) throw new Error('SERVICE_UNAVAILABLE');
      return redemptionCodeService.list(forceRefresh ?? false);
    },
  );

  ipcMain.handle('redemption.copy', (event, code: unknown): void => {
    assertTrustedSender(event.sender);
    if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{3,64}$/.test(code))
      throw new Error('INVALID_ARGUMENT');
    clipboard.writeText(code, 'clipboard');
  });
  ipcMain.handle(
    'redemption.markUsed',
    async (
      event,
      region: unknown,
      code: unknown,
      used: unknown,
    ): Promise<RedemptionCodeCatalog> => {
      assertTrustedSender(event.sender);
      if (
        (region !== 'cn' && region !== 'global') ||
        typeof code !== 'string' ||
        !/^[A-Za-z0-9_-]{3,64}$/.test(code) ||
        typeof used !== 'boolean'
      )
        throw new Error('INVALID_ARGUMENT');
      if (!redemptionCodeService) throw new Error('SERVICE_UNAVAILABLE');
      return redemptionCodeService.markUsed(region, code, used);
    },
  );

  ipcMain.handle(
    'gachaAnalysis.acquireUrl',
    async (event, installationId: unknown): Promise<string> => {
      assertTrustedSender(event.sender);
      if (typeof installationId !== 'string') throw new Error('INVALID_ARGUMENT');
      const installation = gameRepository?.get(installationId);
      if (!installation || !helperClient) throw new Error('SERVICE_UNAVAILABLE');
      const result = await helperClient.findConveneUrl(installation.rootPath);
      if (!result.found || !result.url) throw new Error(result.errorCode ?? 'GACHA_URL_NOT_FOUND');
      return result.url;
    },
  );

  ipcMain.handle('gachaAnalysis.copyUrl', (event, url: unknown): void => {
    assertTrustedSender(event.sender);
    if (typeof url !== 'string' || url.length > 4_096) throw new Error('INVALID_ARGUMENT');
    let parsed: URL;
    try {
      parsed = new URL(url.trim());
    } catch {
      throw new Error('GACHA_URL_INVALID');
    }
    if (parsed.protocol !== 'https:') throw new Error('GACHA_URL_INVALID');
    clipboard.writeText(parsed.toString(), 'clipboard');
  });

  ipcMain.handle(
    'gachaAnalysis.import',
    async (event, input: unknown): Promise<ImportGachaResult> => {
      assertTrustedSender(event.sender);
      if (!isImportGachaInput(input)) throw new Error('INVALID_ARGUMENT');
      const installation = gameRepository?.get(input.installationId);
      if (!installation || !helperClient || !gachaRepository)
        throw new Error('SERVICE_UNAVAILABLE');
      let url = input.url?.trim() || null;
      if (!url) {
        const urlResult = await helperClient.findConveneUrl(installation.rootPath);
        if (!urlResult.found || !urlResult.url)
          throw new Error(urlResult.errorCode ?? 'GACHA_URL_NOT_FOUND');
        url = urlResult.url;
      }
      const imported = await gachaImportService.fetch(url);
      gachaRepository.upsert(imported.records);
      return { url, analysis: gachaRepository.analysis(imported.playerId) };
    },
  );

  ipcMain.handle('gachaAnalysis.get', (event, playerId: unknown): GachaAnalysis | null => {
    assertTrustedSender(event.sender);
    if (playerId !== undefined && (typeof playerId !== 'string' || !/^\d{5,20}$/.test(playerId)))
      throw new Error('INVALID_ARGUMENT');
    const selected = playerId ?? gachaRepository?.latestPlayerId();
    return selected && gachaRepository ? gachaRepository.analysis(selected) : null;
  });
  ipcMain.handle('gachaAnalysis.export', async (event, playerId: unknown): Promise<boolean> => {
    assertTrustedSender(event.sender);
    if (
      typeof playerId !== 'string' ||
      !/^\d{5,20}$/.test(playerId) ||
      !gachaRepository ||
      !mainWindow
    )
      throw new Error('INVALID_ARGUMENT');
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出唤取记录',
      defaultPath: `wuthering-waves-gacha-${playerId}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return false;
    writeFileSync(
      result.filePath,
      JSON.stringify(gachaRepository.analysis(playerId), null, 2),
      'utf8',
    );
    return true;
  });
  ipcMain.handle('gachaAnalysis.delete', (event, playerId: unknown): void => {
    assertTrustedSender(event.sender);
    if (typeof playerId !== 'string' || !/^\d{5,20}$/.test(playerId) || !gachaRepository)
      throw new Error('INVALID_ARGUMENT');
    gachaRepository.deletePlayer(playerId);
  });
  ipcMain.handle('gachaAnalysis.snapshot', async (event, input: unknown): Promise<boolean> => {
    assertTrustedSender(event.sender);
    if (!mainWindow || !isSnapshotExportInput(input)) throw new Error('INVALID_ARGUMENT');
    if (input.destination === 'clipboard') {
      clipboard.writeImage(nativeImage.createFromBuffer(Buffer.from(input.png)));
      return true;
    }
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '保存分析快照',
      defaultPath: 'wuthering-waves-gacha.png',
      filters: [{ name: 'PNG', extensions: ['png'] }],
    });
    if (result.canceled || !result.filePath) return false;
    writeFileSync(result.filePath, input.png);
    return true;
  });
  ipcMain.handle('gachaAnalysis.players', (event): string[] => {
    assertTrustedSender(event.sender);
    return gachaRepository?.players() ?? [];
  });
  ipcMain.handle(
    'gachaAnalysis.images',
    async (event, resourceIds: unknown): Promise<Record<string, string>> => {
      assertTrustedSender(event.sender);
      if (
        !Array.isArray(resourceIds) ||
        resourceIds.length > 200 ||
        resourceIds.some((id) => typeof id !== 'number' || !Number.isInteger(id) || id <= 0)
      )
        throw new Error('INVALID_ARGUMENT');
      return gachaImageService?.get(resourceIds) ?? {};
    },
  );
  ipcMain.handle('versionMetadata.list', (event): GachaVersionMetadata[] => {
    assertTrustedSender(event.sender);
    if (!versionMetadataService) throw new Error('SERVICE_UNAVAILABLE');
    return versionMetadataService.list();
  });
  ipcMain.handle(
    'versionMetadata.previewUpdate',
    async (event): Promise<VersionMetadataUpdatePreview> => {
      assertTrustedSender(event.sender);
      if (!versionMetadataService) throw new Error('SERVICE_UNAVAILABLE');
      return versionMetadataService.previewUpdate();
    },
  );
  ipcMain.handle(
    'versionMetadata.applyUpdate',
    (event, preview: unknown, strategy: unknown): GachaVersionMetadata[] => {
      assertTrustedSender(event.sender);
      if (!isVersionPreview(preview) || (strategy !== 'overwrite' && strategy !== 'preserve'))
        throw new Error('INVALID_ARGUMENT');
      if (!versionMetadataService) throw new Error('SERVICE_UNAVAILABLE');
      return versionMetadataService.applyUpdate(
        preview,
        strategy as VersionMetadataConflictStrategy,
      );
    },
  );
  ipcMain.handle('versionMetadata.save', (event, input: unknown): GachaVersionMetadata[] => {
    assertTrustedSender(event.sender);
    if (!isSaveVersionInput(input)) throw new Error('INVALID_ARGUMENT');
    if (!versionMetadataService) throw new Error('SERVICE_UNAVAILABLE');
    return versionMetadataService.save(input);
  });
  ipcMain.handle('versionMetadata.remove', (event, version: unknown): GachaVersionMetadata[] => {
    assertTrustedSender(event.sender);
    if (typeof version !== 'string' || !/^\d+\.\d+$/.test(version))
      throw new Error('INVALID_ARGUMENT');
    if (!versionMetadataService) throw new Error('SERVICE_UNAVAILABLE');
    return versionMetadataService.remove(version);
  });
}

function assertTrustedSender(sender: Electron.WebContents): void {
  if (sender !== mainWindow?.webContents) throw new Error('IPC_UNAUTHORIZED');
}

async function resolveWallpaper(
  mode: 'default' | 'image' | 'folder',
  sourcePath: string,
  requestedIndex?: number,
): Promise<WallpaperSelection | null> {
  try {
    const images = mode === 'image' ? [sourcePath] : listWallpaperImages(sourcePath);
    if (!images.length) return null;
    images.sort((left, right) => left.localeCompare(right, 'zh-CN', { numeric: true }));
    const currentIndex =
      requestedIndex === undefined
        ? Math.floor(Math.random() * images.length)
        : requestedIndex % images.length;
    const imagePath = images[currentIndex]!;
    let dataUrl = wallpaperImageCache.get(imagePath);
    if (!dataUrl) {
      const decoded = await nativeImage.createThumbnailFromPath(imagePath, {
        width: 2560,
        height: 2560,
      });
      if (decoded.isEmpty()) return null;
      dataUrl = `data:image/jpeg;base64,${decoded.toJPEG(88).toString('base64')}`;
      wallpaperImageCache.set(imagePath, dataUrl);
      while (wallpaperImageCache.size > 4)
        wallpaperImageCache.delete(wallpaperImageCache.keys().next().value!);
    }
    return {
      mode,
      sourcePath,
      imageCount: images.length,
      dataUrl,
      currentIndex,
      fileName: imagePath.split(/[\\/]/).at(-1) ?? imagePath,
    };
  } catch {
    return null;
  }
}

function ensureDefaultWallpaperDirectory(): string {
  const directory = join(app.getPath('userData'), 'wallpapers', 'default');
  mkdirSync(directory, { recursive: true });
  const destination = join(directory, 'default-wallpaper.jpg');
  const bundledWallpaper = bundledResourcePath('default-wallpaper.jpg');
  if (!existsSync(destination) && existsSync(bundledWallpaper)) {
    copyFileSync(bundledWallpaper, destination);
  }
  return directory;
}

function bundledResourcePath(fileName: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, fileName)
    : join(__dirname, '../../resources', fileName);
}

function listWallpaperImages(sourcePath: string): string[] {
  const modifiedAt = statSync(sourcePath).mtimeMs;
  const cached = wallpaperFolderCache.get(sourcePath);
  if (cached?.modifiedAt === modifiedAt) return [...cached.images];
  const images = readdirSync(sourcePath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(png|jpe?g|webp|bmp)$/i.test(entry.name))
    .map((entry) => join(sourcePath, entry.name));
  wallpaperFolderCache.set(sourcePath, { modifiedAt, images });
  return [...images];
}

function isValidRootPath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 1_024;
}

function isLaunchGameInput(value: unknown): value is LaunchGameInput {
  if (!value || typeof value !== 'object') return false;
  const input = value as Partial<LaunchGameInput>;
  const displaySettingsValid =
    input.displayMode === undefined && input.width === undefined && input.height === undefined
      ? true
      : (input.displayMode === 'fullscreen' ||
          input.displayMode === 'borderless' ||
          input.displayMode === 'windowed') &&
        Number.isInteger(input.width) &&
        Number.isInteger(input.height) &&
        (input.width ?? 0) >= 640 &&
        (input.width ?? 0) <= 16384 &&
        (input.height ?? 0) >= 480 &&
        (input.height ?? 0) <= 8640;
  return (
    isValidRootPath(input.rootPath) &&
    (input.renderMode === 'default' ||
      input.renderMode === 'dx11' ||
      input.renderMode === 'dx12') &&
    displaySettingsValid
  );
}

function getInstallation(installationId: unknown): GameInstallation {
  if (typeof installationId !== 'string' || !/^[a-f0-9]{16}$/.test(installationId)) {
    throw new Error('INVALID_ARGUMENT');
  }
  if (!gameRepository) throw new Error('DATABASE_UNAVAILABLE');
  const installation = gameRepository.get(installationId);
  if (!installation) throw new Error('GAME_NOT_FOUND');
  return installation;
}

function isSaveGameDisplaySettingsInput(value: unknown): value is SaveGameDisplaySettingsInput {
  if (!value || typeof value !== 'object') return false;
  const input = value as Partial<SaveGameDisplaySettingsInput>;
  return (
    (input.displayMode === 'fullscreen' ||
      input.displayMode === 'borderless' ||
      input.displayMode === 'windowed') &&
    Number.isInteger(input.width) &&
    Number.isInteger(input.height) &&
    (input.width ?? 0) >= 640 &&
    (input.width ?? 0) <= 16384 &&
    (input.height ?? 0) >= 480 &&
    (input.height ?? 0) <= 8640
  );
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function isSaveAccountInput(value: unknown): value is SaveAccountProfileInput {
  if (!value || typeof value !== 'object') return false;
  const input = value as Partial<SaveAccountProfileInput>;
  return (
    (input.id === undefined || isUuid(input.id)) &&
    typeof input.displayName === 'string' &&
    input.displayName.trim().length > 0 &&
    input.displayName.trim().length <= 40 &&
    (input.playerId === undefined ||
      input.playerId === null ||
      (typeof input.playerId === 'string' && /^[0-9]{1,20}$/.test(input.playerId.trim()))) &&
    (input.region === 'cn' || input.region === 'global') &&
    (input.installationId === undefined ||
      input.installationId === null ||
      /^[a-f0-9]{16}$/.test(input.installationId)) &&
    (input.note === undefined ||
      input.note === null ||
      (typeof input.note === 'string' && input.note.length <= 120))
  );
}

function isImportGachaInput(value: unknown): value is ImportGachaInput {
  if (!value || typeof value !== 'object') return false;
  const input = value as Partial<ImportGachaInput>;
  return (
    typeof input.installationId === 'string' &&
    /^[a-f0-9]{16}$/.test(input.installationId) &&
    (input.url === undefined ||
      input.url === null ||
      (typeof input.url === 'string' &&
        input.url.length <= 8192 &&
        /^https:\/\//.test(input.url.trim())))
  );
}

function isSaveVersionInput(value: unknown): value is SaveVersionMetadataInput {
  if (!value || typeof value !== 'object') return false;
  const input = value as Partial<SaveVersionMetadataInput>;
  return (
    typeof input.version === 'string' &&
    /^\d+\.\d+$/.test(input.version) &&
    typeof input.name === 'string' &&
    input.name.trim().length > 0 &&
    input.name.length <= 80 &&
    typeof input.start === 'string' &&
    /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(input.start)
  );
}

function isVersionPreview(value: unknown): value is VersionMetadataUpdatePreview {
  if (!value || typeof value !== 'object') return false;
  const preview = value as Partial<VersionMetadataUpdatePreview>;
  return (
    Array.isArray(preview.entries) &&
    preview.entries.length <= 100 &&
    Array.isArray(preview.conflicts) &&
    typeof preview.fetchedAt === 'string'
  );
}

function isPngBytes(value: unknown): value is Uint8Array {
  return (
    value instanceof Uint8Array &&
    value.byteLength >= 8 &&
    value.byteLength <= 100 * 1024 * 1024 &&
    value[0] === 0x89 &&
    value[1] === 0x50 &&
    value[2] === 0x4e &&
    value[3] === 0x47
  );
}

function isSnapshotExportInput(value: unknown): value is SnapshotExportInput {
  if (!value || typeof value !== 'object') return false;
  const input = value as Partial<SnapshotExportInput>;
  return (
    (input.destination === 'file' || input.destination === 'clipboard') && isPngBytes(input.png)
  );
}

function assertId(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 100)
    throw new Error('INVALID_ARGUMENT');
  return value;
}

function isKuroSmsInput(value: unknown): value is KuroSmsInput {
  if (!value || typeof value !== 'object') return false;
  const input = value as Partial<KuroSmsInput>;
  return (
    typeof input.phone === 'string' &&
    input.phone.length <= 20 &&
    (input.geeTestData === undefined || typeof input.geeTestData === 'string')
  );
}

function isKuroLoginInput(value: unknown): value is KuroLoginInput {
  if (!value || typeof value !== 'object') return false;
  const input = value as Partial<KuroLoginInput>;
  return (
    (input.method === 'sms' || input.method === 'token') &&
    [input.remark, input.phone, input.code, input.token, input.did].every(
      (item) => item === undefined || (typeof item === 'string' && item.length <= 4096),
    )
  );
}

function isUpdateKuroAccountInput(value: unknown): value is UpdateKuroAccountInput {
  if (!value || typeof value !== 'object') return false;
  const input = value as Partial<UpdateKuroAccountInput>;
  return (
    typeof input.accountId === 'string' &&
    input.accountId.length <= 100 &&
    [input.remark, input.token, input.did].every(
      (item) =>
        item === undefined || item === null || (typeof item === 'string' && item.length <= 4096),
    )
  );
}

function isKuroCalculationInput(value: unknown): value is KuroCalculationInput {
  if (!value || typeof value !== 'object') return false;
  const input = value as Partial<KuroCalculationInput>;
  return (
    typeof input.accountId === 'string' &&
    (input.kind === 'role' || input.kind === 'weapon') &&
    Number.isInteger(input.itemId) &&
    Number.isInteger(input.startLevel) &&
    Number.isInteger(input.endLevel) &&
    input.itemId! > 0 &&
    input.startLevel! >= 1 &&
    input.endLevel! <= 90 &&
    input.startLevel! <= input.endLevel! &&
    (input.skillLevelUpList === undefined ||
      (Array.isArray(input.skillLevelUpList) &&
        input.skillLevelUpList.length === 5 &&
        input.skillLevelUpList.every(
          (item) =>
            Number.isInteger(item.startLevel) &&
            Number.isInteger(item.endLevel) &&
            item.startLevel >= 1 &&
            item.endLevel <= 10 &&
            item.startLevel <= item.endLevel,
        ))) &&
    (input.advanceSkillList === undefined ||
      (Array.isArray(input.advanceSkillList) &&
        input.advanceSkillList.every((item) => typeof item === 'string' && item.length <= 100)))
  );
}

function isKuroResourcePeriodType(value: unknown): value is KuroResourcePeriodType {
  return value === 'version' || value === 'month' || value === 'week';
}

function isKuroResourcePeriod(value: unknown): value is KuroResourcePeriod {
  if (!value || typeof value !== 'object') return false;
  const period = value as Partial<KuroResourcePeriod>;
  return (
    typeof period.title === 'string' && period.title.length <= 80 && Number.isInteger(period.index)
  );
}

async function showKuroCaptcha(): Promise<string> {
  const captcha = new BrowserWindow({
    ...(mainWindow ? { parent: mainWindow } : {}),
    modal: true,
    width: 480,
    height: 430,
    resizable: false,
    title: '完成滑块验证',
    backgroundColor: '#f8fafc',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  captcha.setMenuBarVisibility(false);
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>html,body{margin:0;height:100%;font-family:Microsoft YaHei;background:#f8fafc;color:#334}#status{padding:14px;border-bottom:1px solid #dde3ea;background:white}#hint{padding:18px;font-size:13px;color:#667085}</style><script src="https://static.geetest.com/v4/gt4.js"></script></head><body><div id="status">正在加载极验，请稍候…</div><div id="hint">验证组件加载完成后会自动弹出。请手动完成滑块验证，成功后窗口将自动关闭并发送验证码。</div><script>window.__captchaResult='';const id='ec4aa4174277d822d73f2442a165a2cd';function fail(m){document.querySelector('#status').textContent=m}function start(){if(!window.initGeetest4){fail('极验脚本加载失败，请检查网络后重试');return}initGeetest4({captchaId:id,product:'bind',language:'zho',protocol:'https://'},c=>{c.onReady(()=>{document.querySelector('#status').textContent='请完成滑块验证';c.showBox()}).onSuccess(()=>{const r=c.getValidate();if(r){r.captcha_id=id;window.__captchaResult=JSON.stringify(r);document.querySelector('#status').textContent='验证通过'}}).onError(()=>fail('极验验证出错，请重试')).onClose(()=>{if(!window.__captchaResult)document.querySelector('#status').textContent='验证已取消，可关闭窗口后重试'})})}window.addEventListener('load',start);</script></body></html>`;
  await captcha.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, result?: string) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(timeout);
      if (!captcha.isDestroyed()) captcha.close();
      if (error) reject(error);
      else resolve(result!);
    };
    const poll = setInterval(() => {
      void captcha.webContents
        .executeJavaScript('window.__captchaResult || ""', true)
        .then((result: unknown) => {
          if (typeof result === 'string' && result) finish(undefined, result);
        })
        .catch(() => undefined);
    }, 250);
    const timeout = setTimeout(() => finish(new Error('极验验证超时，请重试')), 3 * 60_000);
    captcha.on('closed', () => finish(new Error('已取消滑块验证')));
  });
}

function requireKuroService(): KuroService {
  if (!kuroService) throw new Error('KURO_SERVICE_UNAVAILABLE');
  return kuroService;
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'wwbox-art',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });

  void app.whenReady().then(() => {
    kuroArtworkCacheDirectory = join(app.getPath('userData'), 'kuro-artworks');
    protocol.handle('wwbox-art', (request) => {
      const fileName = new URL(request.url).pathname.split('/').pop() ?? '';
      if (
        !/^(?:\d+-(?:full(?:-\d+)?|team|icon-original)|home-(?:resonators|weekly-travel))\.png$/.test(
          fileName,
        )
      )
        return new Response('Not found', { status: 404 });
      return net.fetch(
        new URL(
          `file:///${join(kuroArtworkCacheDirectory, fileName).replaceAll('\\', '/')}`,
        ).toString(),
      );
    });
    helperClient = new HelperClient();
    gameRepository = new GameInstallationRepository(join(app.getPath('userData'), 'data.db'));
    accountRepository = new AccountRepository(join(app.getPath('userData'), 'data.db'));
    kuroRepository = new KuroRepository(join(app.getPath('userData'), 'data.db'));
    kuroService = new KuroService(
      kuroRepository,
      {
        encrypt(value) {
          if (!safeStorage.isEncryptionAvailable()) throw new Error('系统安全存储当前不可用');
          return `safe:${safeStorage.encryptString(value).toString('base64')}`;
        },
        decrypt(value) {
          if (value.startsWith('safe:'))
            return safeStorage.decryptString(Buffer.from(value.slice(5), 'base64'));
          throw new Error('账号密钥不是受保护的格式，请重新登录');
        },
      },
      kuroArtworkCacheDirectory,
      (source, maxDimension) => {
        const image = nativeImage.createFromBuffer(source);
        if (image.isEmpty()) throw new Error('无法解析角色头像');
        if (!maxDimension) return image.toPNG();
        const size = image.getSize();
        const scale = Math.min(1, maxDimension / Math.max(size.width, size.height));
        return image
          .resize({
            width: Math.max(1, Math.round(size.width * scale)),
            height: Math.max(1, Math.round(size.height * scale)),
            quality: 'best',
          })
          .toPNG();
      },
    );
    redemptionCodeRepository = new RedemptionCodeRepository(
      join(app.getPath('userData'), 'data.db'),
    );
    redemptionCodeService = new RedemptionCodeService(redemptionCodeRepository);
    gachaRepository = new GachaRepository(join(app.getPath('userData'), 'data.db'));
    gachaImageService = new GachaImageService(join(app.getPath('userData'), 'gacha-images'));
    versionMetadataService = new VersionMetadataService(
      join(app.getPath('userData'), 'version-metadata.json'),
    );
    registerIpc();
    createWindow();
    void kuroService.runAutomation(true);
    kuroSignTimer = setInterval(() => void kuroService?.runAutomation(), 15 * 60_000);
  });
}

app.on('window-all-closed', () => {
  helperClient?.dispose();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (kuroSignTimer) clearInterval(kuroSignTimer);
  kuroSignTimer = null;
  gameRepository?.close();
  gameRepository = null;
  accountRepository?.close();
  accountRepository = null;
  kuroRepository?.close();
  kuroRepository = null;
  kuroService = null;
  redemptionCodeRepository?.close();
  redemptionCodeRepository = null;
  redemptionCodeService = null;
  gachaRepository?.close();
  gachaRepository = null;
});

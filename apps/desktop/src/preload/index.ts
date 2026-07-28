import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from '@wwbox/contracts';

const api: DesktopApi = {
  system: {
    health: () => ipcRenderer.invoke('system.health') as ReturnType<DesktopApi['system']['health']>,
    getDefaultWallpaperDirectory: () =>
      ipcRenderer.invoke('system.getDefaultWallpaperDirectory') as ReturnType<
        DesktopApi['system']['getDefaultWallpaperDirectory']
      >,
    chooseWallpaper: (mode) =>
      ipcRenderer.invoke('system.chooseWallpaper', mode) as ReturnType<
        DesktopApi['system']['chooseWallpaper']
      >,
    loadWallpaper: (mode, sourcePath, index) =>
      ipcRenderer.invoke('system.loadWallpaper', mode, sourcePath, index) as ReturnType<
        DesktopApi['system']['loadWallpaper']
      >,
    setAutoStart: (enabled) =>
      ipcRenderer.invoke('system.setAutoStart', enabled) as ReturnType<
        DesktopApi['system']['setAutoStart']
      >,
    setCloseGameOnExit: (enabled) =>
      ipcRenderer.invoke('system.setCloseGameOnExit', enabled) as ReturnType<
        DesktopApi['system']['setCloseGameOnExit']
      >,
    controlWindow: (action) =>
      ipcRenderer.invoke('system.controlWindow', action) as ReturnType<
        DesktopApi['system']['controlWindow']
      >,
  },
  game: {
    listInstallations: () =>
      ipcRenderer.invoke('game.listInstallations') as ReturnType<
        DesktopApi['game']['listInstallations']
      >,
    detectInstallations: () =>
      ipcRenderer.invoke('game.detectInstallations') as ReturnType<
        DesktopApi['game']['detectInstallations']
      >,
    chooseInstallation: () =>
      ipcRenderer.invoke('game.chooseInstallation') as ReturnType<
        DesktopApi['game']['chooseInstallation']
      >,
    validateInstallation: (rootPath) =>
      ipcRenderer.invoke('game.validateInstallation', rootPath) as ReturnType<
        DesktopApi['game']['validateInstallation']
      >,
    launch: (input) =>
      ipcRenderer.invoke('game.launch', input) as ReturnType<DesktopApi['game']['launch']>,
    getProcessState: (rootPath) =>
      ipcRenderer.invoke('game.getProcessState', rootPath) as ReturnType<
        DesktopApi['game']['getProcessState']
      >,
    removeInstallation: (installationId) =>
      ipcRenderer.invoke('game.removeInstallation', installationId) as ReturnType<
        DesktopApi['game']['removeInstallation']
      >,
    checkVersion: (installationId) =>
      ipcRenderer.invoke('game.checkVersion', installationId) as ReturnType<
        DesktopApi['game']['checkVersion']
      >,
    getDisplaySettings: (installationId) =>
      ipcRenderer.invoke('game.getDisplaySettings', installationId) as ReturnType<
        DesktopApi['game']['getDisplaySettings']
      >,
    saveDisplaySettings: (installationId, input) =>
      ipcRenderer.invoke('game.saveDisplaySettings', installationId, input) as ReturnType<
        DesktopApi['game']['saveDisplaySettings']
      >,
    openUpdater: (installationId) =>
      ipcRenderer.invoke('game.openUpdater', installationId) as ReturnType<
        DesktopApi['game']['openUpdater']
      >,
    stopAll: () => ipcRenderer.invoke('game.stopAll') as ReturnType<DesktopApi['game']['stopAll']>,
  },
  gacha: {
    copyConveneUrl: (installationId) =>
      ipcRenderer.invoke('gacha.copyConveneUrl', installationId) as ReturnType<
        DesktopApi['gacha']['copyConveneUrl']
      >,
  },
  account: {
    list: () => ipcRenderer.invoke('account.list') as ReturnType<DesktopApi['account']['list']>,
    save: (input) =>
      ipcRenderer.invoke('account.save', input) as ReturnType<DesktopApi['account']['save']>,
    activate: (accountId) =>
      ipcRenderer.invoke('account.activate', accountId) as ReturnType<
        DesktopApi['account']['activate']
      >,
    remove: (accountId) =>
      ipcRenderer.invoke('account.remove', accountId) as ReturnType<
        DesktopApi['account']['remove']
      >,
    scanLauncher: () =>
      ipcRenderer.invoke('account.scanLauncher') as ReturnType<
        DesktopApi['account']['scanLauncher']
      >,
    activateLauncher: (accountId) =>
      ipcRenderer.invoke('account.activateLauncher', accountId) as ReturnType<
        DesktopApi['account']['activateLauncher']
      >,
  },
  kuro: {
    listAccounts: () =>
      ipcRenderer.invoke('kuro.listAccounts') as ReturnType<DesktopApi['kuro']['listAccounts']>,
    requestCaptcha: () =>
      ipcRenderer.invoke('kuro.requestCaptcha') as ReturnType<DesktopApi['kuro']['requestCaptcha']>,
    sendSms: (input) =>
      ipcRenderer.invoke('kuro.sendSms', input) as ReturnType<DesktopApi['kuro']['sendSms']>,
    login: (input) =>
      ipcRenderer.invoke('kuro.login', input) as ReturnType<DesktopApi['kuro']['login']>,
    update: (input) =>
      ipcRenderer.invoke('kuro.update', input) as ReturnType<DesktopApi['kuro']['update']>,
    activate: (accountId) =>
      ipcRenderer.invoke('kuro.activate', accountId) as ReturnType<DesktopApi['kuro']['activate']>,
    remove: (accountId) =>
      ipcRenderer.invoke('kuro.remove', accountId) as ReturnType<DesktopApi['kuro']['remove']>,
    selectRole: (accountId, roleId) =>
      ipcRenderer.invoke('kuro.selectRole', accountId, roleId) as ReturnType<
        DesktopApi['kuro']['selectRole']
      >,
    setAutoSign: (accountId, enabled) =>
      ipcRenderer.invoke('kuro.setAutoSign', accountId, enabled) as ReturnType<
        DesktopApi['kuro']['setAutoSign']
      >,
    setAllAutoSign: (enabled) =>
      ipcRenderer.invoke('kuro.setAllAutoSign', enabled) as ReturnType<
        DesktopApi['kuro']['setAllAutoSign']
      >,
    setAutoRetroSign: (accountId, enabled) =>
      ipcRenderer.invoke('kuro.setAutoRetroSign', accountId, enabled) as ReturnType<
        DesktopApi['kuro']['setAutoRetroSign']
      >,
    setAllAutoRetroSign: (enabled) =>
      ipcRenderer.invoke('kuro.setAllAutoRetroSign', enabled) as ReturnType<
        DesktopApi['kuro']['setAllAutoRetroSign']
      >,
    sign: (accountId) =>
      ipcRenderer.invoke('kuro.sign', accountId) as ReturnType<DesktopApi['kuro']['sign']>,
    retroSign: (accountId) =>
      ipcRenderer.invoke('kuro.retroSign', accountId) as ReturnType<
        DesktopApi['kuro']['retroSign']
      >,
    retroEligibility: (accountId) =>
      ipcRenderer.invoke('kuro.retroEligibility', accountId) as ReturnType<
        DesktopApi['kuro']['retroEligibility']
      >,
    dashboard: (accountId, roleId, forceRefresh) =>
      ipcRenderer.invoke('kuro.dashboard', accountId, roleId, forceRefresh) as ReturnType<
        DesktopApi['kuro']['dashboard']
      >,
    homeWidget: (playerId) =>
      ipcRenderer.invoke('kuro.homeWidget', playerId) as ReturnType<
        DesktopApi['kuro']['homeWidget']
      >,
    calculate: (input) =>
      ipcRenderer.invoke('kuro.calculate', input) as ReturnType<DesktopApi['kuro']['calculate']>,
    resourceBriefing: (accountId, roleId, periodType, period) =>
      ipcRenderer.invoke(
        'kuro.resourceBriefing',
        accountId,
        roleId,
        periodType,
        period,
      ) as ReturnType<DesktopApi['kuro']['resourceBriefing']>,
    refreshRoles: (accountId) =>
      ipcRenderer.invoke('kuro.refreshRoles', accountId) as ReturnType<
        DesktopApi['kuro']['refreshRoles']
      >,
    roleDetail: (accountId, roleId, cardRoleId) =>
      ipcRenderer.invoke('kuro.roleDetail', accountId, roleId, cardRoleId) as ReturnType<
        DesktopApi['kuro']['roleDetail']
      >,
    roleCultivateStatus: (accountId, roleId, cardRoleId) =>
      ipcRenderer.invoke('kuro.roleCultivateStatus', accountId, roleId, cardRoleId) as ReturnType<
        DesktopApi['kuro']['roleCultivateStatus']
      >,
    roleArtworks: (roles, options) =>
      ipcRenderer.invoke('kuro.roleArtworks', roles, options) as ReturnType<
        DesktopApi['kuro']['roleArtworks']
      >,
    openMobile: (accountId, roleId, url) =>
      ipcRenderer.invoke('kuro.openMobile', accountId, roleId, url) as ReturnType<
        DesktopApi['kuro']['openMobile']
      >,
  },
  redemption: {
    list: (forceRefresh) =>
      ipcRenderer.invoke('redemption.list', forceRefresh) as ReturnType<
        DesktopApi['redemption']['list']
      >,
    copy: (code) =>
      ipcRenderer.invoke('redemption.copy', code) as ReturnType<DesktopApi['redemption']['copy']>,
    markUsed: (region, code, used) =>
      ipcRenderer.invoke('redemption.markUsed', region, code, used) as ReturnType<
        DesktopApi['redemption']['markUsed']
      >,
  },
  gachaAnalysis: {
    acquireUrl: (installationId) =>
      ipcRenderer.invoke('gachaAnalysis.acquireUrl', installationId) as ReturnType<
        DesktopApi['gachaAnalysis']['acquireUrl']
      >,
    copyUrl: (url) =>
      ipcRenderer.invoke('gachaAnalysis.copyUrl', url) as ReturnType<
        DesktopApi['gachaAnalysis']['copyUrl']
      >,
    import: (input) =>
      ipcRenderer.invoke('gachaAnalysis.import', input) as ReturnType<
        DesktopApi['gachaAnalysis']['import']
      >,
    get: (playerId) =>
      ipcRenderer.invoke('gachaAnalysis.get', playerId) as ReturnType<
        DesktopApi['gachaAnalysis']['get']
      >,
    export: (playerId) =>
      ipcRenderer.invoke('gachaAnalysis.export', playerId) as ReturnType<
        DesktopApi['gachaAnalysis']['export']
      >,
    delete: (playerId) =>
      ipcRenderer.invoke('gachaAnalysis.delete', playerId) as ReturnType<
        DesktopApi['gachaAnalysis']['delete']
      >,
    snapshot: (png) =>
      ipcRenderer.invoke('gachaAnalysis.snapshot', png) as ReturnType<
        DesktopApi['gachaAnalysis']['snapshot']
      >,
    players: () =>
      ipcRenderer.invoke('gachaAnalysis.players') as ReturnType<
        DesktopApi['gachaAnalysis']['players']
      >,
    images: (resourceIds) =>
      ipcRenderer.invoke('gachaAnalysis.images', resourceIds) as ReturnType<
        DesktopApi['gachaAnalysis']['images']
      >,
  },
  versionMetadata: {
    list: () =>
      ipcRenderer.invoke('versionMetadata.list') as ReturnType<
        DesktopApi['versionMetadata']['list']
      >,
    previewUpdate: () =>
      ipcRenderer.invoke('versionMetadata.previewUpdate') as ReturnType<
        DesktopApi['versionMetadata']['previewUpdate']
      >,
    applyUpdate: (preview, strategy) =>
      ipcRenderer.invoke('versionMetadata.applyUpdate', preview, strategy) as ReturnType<
        DesktopApi['versionMetadata']['applyUpdate']
      >,
    save: (input) =>
      ipcRenderer.invoke('versionMetadata.save', input) as ReturnType<
        DesktopApi['versionMetadata']['save']
      >,
    remove: (version) =>
      ipcRenderer.invoke('versionMetadata.remove', version) as ReturnType<
        DesktopApi['versionMetadata']['remove']
      >,
  },
};

contextBridge.exposeInMainWorld('wwbox', api);

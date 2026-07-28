import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GameDisplaySettings, SaveGameDisplaySettingsInput } from '@wwbox/contracts';

const CONFIG_RELATIVE_PATHS = [
  join('Client', 'Saved', 'Config', 'WindowsNoEditor', 'GameUserSettings.ini'),
  join('Client', 'Saved', 'Config', 'Windows', 'GameUserSettings.ini'),
];

export class GameSettingsService {
  read(rootPath: string): GameDisplaySettings {
    const configPath = this.resolveConfigPath(rootPath);
    if (!configPath || !existsSync(configPath)) return defaultSettings(false);
    const content = readFileSync(configPath, 'utf8');
    return {
      available: true,
      displayMode: parseDisplayMode(readValue(content, 'FullscreenMode')),
      width: parseDimension(readValue(content, 'ResolutionSizeX'), 1920),
      height: parseDimension(readValue(content, 'ResolutionSizeY'), 1080),
    };
  }

  save(rootPath: string, input: SaveGameDisplaySettingsInput): GameDisplaySettings {
    const configPath = this.resolveConfigPath(rootPath);
    if (!configPath || !existsSync(configPath)) throw new Error('GAME_SETTINGS_NOT_FOUND');
    let content = readFileSync(configPath, 'utf8');
    const mode =
      input.displayMode === 'fullscreen' ? '0' : input.displayMode === 'borderless' ? '1' : '2';
    const values: Record<string, string> = {
      FullscreenMode: mode,
      LastConfirmedFullscreenMode: mode,
      PreferredFullscreenMode: mode,
      ResolutionSizeX: String(input.width),
      ResolutionSizeY: String(input.height),
      LastUserConfirmedResolutionSizeX: String(input.width),
      LastUserConfirmedResolutionSizeY: String(input.height),
    };
    for (const [key, value] of Object.entries(values)) content = replaceValue(content, key, value);
    writeFileSync(configPath, content, 'utf8');
    return this.read(rootPath);
  }

  private resolveConfigPath(rootPath: string): string | null {
    return (
      CONFIG_RELATIVE_PATHS.map((relativePath) => join(rootPath, relativePath)).find(existsSync) ??
      null
    );
  }
}

function defaultSettings(available: boolean): GameDisplaySettings {
  return { available, displayMode: 'borderless', width: 1920, height: 1080 };
}

function readValue(content: string, key: string): string | null {
  return content.match(new RegExp(`^${key}=(.+)$`, 'mi'))?.[1]?.trim() ?? null;
}

function replaceValue(content: string, key: string, value: string): string {
  const pattern = new RegExp(`^${key}=.*$`, 'mi');
  return pattern.test(content)
    ? content.replace(pattern, `${key}=${value}`)
    : `${content.trimEnd()}\r\n${key}=${value}\r\n`;
}

function parseDimension(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 640 && parsed <= 16384 ? parsed : fallback;
}

function parseDisplayMode(value: string | null): GameDisplaySettings['displayMode'] {
  if (value === '0') return 'fullscreen';
  if (value === '2') return 'windowed';
  return 'borderless';
}

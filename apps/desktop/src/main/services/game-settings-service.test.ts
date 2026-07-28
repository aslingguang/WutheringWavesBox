import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GameSettingsService } from './game-settings-service';

describe('GameSettingsService', () => {
  it('reads and updates display settings while preserving unrelated values', () => {
    const root = mkdtempSync(join(tmpdir(), 'wwbox-settings-'));
    const directory = join(root, 'Client', 'Saved', 'Config', 'WindowsNoEditor');
    mkdirSync(directory, { recursive: true });
    const configPath = join(directory, 'GameUserSettings.ini');
    writeFileSync(
      configPath,
      'FullscreenMode=1\r\nResolutionSizeX=2560\r\nResolutionSizeY=1440\r\nFrameRateLimit=120\r\n',
    );
    const service = new GameSettingsService();

    expect(service.read(root)).toMatchObject({
      available: true,
      displayMode: 'borderless',
      width: 2560,
      height: 1440,
    });
    expect(
      service.save(root, { displayMode: 'fullscreen', width: 1920, height: 1080 }),
    ).toMatchObject({ displayMode: 'fullscreen', width: 1920, height: 1080 });
    expect(readFileSync(configPath, 'utf8')).toContain('FrameRateLimit=120');
  });

  it('reports unavailable when the game has not generated its config yet', () => {
    expect(new GameSettingsService().read('Z:\\missing')).toMatchObject({ available: false });
  });
});

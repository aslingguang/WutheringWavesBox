import { describe, expect, it, vi } from 'vitest';
import type { GameInstallation } from '@wwbox/contracts';
import { compareVersions, GameVersionService } from './game-version-service';

describe('GameVersionService', () => {
  it('reads the launcher index and caches its version', async () => {
    const fetcher = vi.fn(async () =>
      Promise.resolve(Response.json({ default: { version: '3.5.0' } })),
    ) as unknown as typeof fetch;
    const service = new GameVersionService(fetcher, () => 1_000);

    const first = await service.check(createInstallation('3.4.0'));
    const second = await service.check(createInstallation('3.4.0'));

    expect(first.status).toBe('updateAvailable');
    expect(first.remoteVersion).toBe('3.5.0');
    expect(second.remoteVersion).toBe('3.5.0');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('degrades to unknown when the endpoint fails', async () => {
    const fetcher = vi.fn(async () =>
      Promise.reject(new Error('offline')),
    ) as unknown as typeof fetch;
    const state = await new GameVersionService(fetcher).check(createInstallation('3.5.0'));

    expect(state.status).toBe('unknown');
    expect(state.remoteVersion).toBeNull();
  });
});

describe('compareVersions', () => {
  it.each([
    ['3.5.0', '3.5.0', 'latest'],
    ['3.4.1', '3.5.0', 'updateAvailable'],
    ['3.6.0', '3.5.0', 'localNewer'],
    [null, '3.5.0', 'unknown'],
  ] as const)('compares %s with %s', (local, remote, expected) => {
    expect(compareVersions(local, remote)).toBe(expected);
  });
});

function createInstallation(localVersion: string | null): GameInstallation {
  return {
    id: '0123456789abcdef',
    rootPath: 'D:\\Games\\Wuthering Waves Game',
    executablePath: 'D:\\Games\\Wuthering Waves Game\\Wuthering Waves.exe',
    clientExecutablePath:
      'D:\\Games\\Wuthering Waves Game\\Client\\Binaries\\Win64\\Client-Win64-Shipping.exe',
    region: 'cn',
    localVersion,
  };
}

import { afterEach, describe, expect, it } from 'vitest';
import type { GameInstallation } from '@wwbox/contracts';
import { GameInstallationRepository } from './game-installation-repository';

let repository: GameInstallationRepository | null = null;

afterEach(() => {
  repository?.close();
  repository = null;
});

describe('GameInstallationRepository', () => {
  it('persists and lists an installation', () => {
    repository = new GameInstallationRepository(':memory:');
    repository.upsert(createInstallation());

    expect(repository.list()).toEqual([createInstallation()]);
    expect(repository.get('0123456789abcdef')).toEqual(createInstallation());
  });

  it('updates an existing installation without duplication', () => {
    repository = new GameInstallationRepository(':memory:');
    repository.upsert(createInstallation());
    repository.upsert({ ...createInstallation(), localVersion: '2.0.0' });

    expect(repository.list()).toHaveLength(1);
    expect(repository.list()[0]?.localVersion).toBe('2.0.0');
  });

  it('removes only the selected installation', () => {
    repository = new GameInstallationRepository(':memory:');
    repository.upsert(createInstallation());
    repository.remove('0123456789abcdef');

    expect(repository.list()).toEqual([]);
  });
});

function createInstallation(): GameInstallation {
  return {
    id: '0123456789abcdef',
    rootPath: 'D:\\Games\\Wuthering Waves Game',
    executablePath: 'D:\\Games\\Wuthering Waves Game\\Wuthering Waves.exe',
    clientExecutablePath:
      'D:\\Games\\Wuthering Waves Game\\Client\\Binaries\\Win64\\Client-Win64-Shipping.exe',
    region: 'cn',
    localVersion: '1.0.0',
  };
}

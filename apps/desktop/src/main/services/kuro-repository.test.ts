import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AccountRepository } from './account-repository';
import { KuroRepository } from './kuro-repository';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('KuroRepository', () => {
  it('stores multiple accounts, selects roles, and links a matching game UID', () => {
    const directory = mkdtempSync(join(tmpdir(), 'wwbox-kuro-'));
    directories.push(directory);
    const path = join(directory, 'data.db');
    const profiles = new AccountRepository(path);
    const linked = profiles.save({ displayName: '主档案', playerId: '123456789', region: 'cn' });
    profiles.close();
    const repository = new KuroRepository(path);
    const first = repository.save('漂泊者', '主账号', 'token', null, 'safe:secret', 'safe:did', [
      {
        userId: '10',
        roleId: '123456789',
        roleName: '漂泊者',
        serverId: 'cn',
        serverName: '国服',
        linkedAccountId: null,
      },
      {
        userId: '10',
        roleId: '987654321',
        roleName: '小号',
        serverId: 'cn',
        serverName: '国服',
        linkedAccountId: null,
      },
    ]);
    const second = repository.save('副号', null, 'sms', '138****0000', 'safe:other', 'safe:did2', [
      {
        userId: '11',
        roleId: '111111111',
        roleName: '副号',
        serverId: 'cn',
        serverName: '国服',
        linkedAccountId: null,
      },
    ]);
    expect(first.roles[0]?.linkedAccountId).toBe(linked.id);
    expect(repository.selectRole(first.id, '987654321')?.activeRoleId).toBe('987654321');
    expect(repository.activate(second.id)?.active).toBe(true);
    expect(repository.setAllAutoSign(true).every((account) => account.autoSign)).toBe(true);
    expect(repository.setAutoRetroSign(first.id, true)?.autoRetroSign).toBe(true);
    expect(repository.setAllAutoRetroSign(true).every((account) => account.autoRetroSign)).toBe(
      true,
    );
    repository.close();
  });
});

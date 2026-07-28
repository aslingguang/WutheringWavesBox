import { afterEach, describe, expect, it } from 'vitest';
import { AccountRepository } from './account-repository';

let repository: AccountRepository | null = null;
afterEach(() => {
  repository?.close();
  repository = null;
});

describe('AccountRepository', () => {
  it('makes the first profile active and switches atomically', () => {
    repository = new AccountRepository(':memory:');
    const first = repository.save({ displayName: '主账号', region: 'cn' });
    const second = repository.save({
      displayName: '国际服',
      playerId: '123456789',
      region: 'global',
    });
    expect(first.active).toBe(true);
    expect(second.active).toBe(false);
    repository.activate(second.id);
    expect(repository.list().find((item) => item.active)?.id).toBe(second.id);
    expect(repository.list().filter((item) => item.active)).toHaveLength(1);
  });

  it('promotes another profile after removing the active one', () => {
    repository = new AccountRepository(':memory:');
    const first = repository.save({ displayName: 'A', region: 'cn' });
    const second = repository.save({ displayName: 'B', region: 'global' });
    repository.remove(first.id);
    expect(repository.list()).toEqual([expect.objectContaining({ id: second.id, active: true })]);
  });

  it('persists an optional account note', () => {
    repository = new AccountRepository(':memory:');
    const saved = repository.save({ displayName: '小号', region: 'global', note: '亚服备用账号' });
    expect(saved.note).toBe('亚服备用账号');
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GachaRepository } from './gacha-repository';

let repository: GachaRepository | null = null;
const directories: string[] = [];
afterEach(() => {
  repository?.close();
  repository = null;
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
describe('GachaRepository', () => {
  it('deduplicates records and calculates pity', () => {
    repository = new GachaRepository(':memory:');
    const records = Array.from({ length: 12 }, (_, index) => ({
      recordId: `record-${index}`,
      recordOrder: index,
      playerId: '123456789',
      poolType: '1',
      resourceId: index,
      qualityLevel: index === 9 ? 5 : 3,
      resourceType: '角色',
      name: index === 9 ? '五星角色' : `物品${index}`,
      time: `2026-01-${String(index + 1).padStart(2, '0')} 12:00:00`,
    }));
    repository.upsert(records);
    repository.upsert(records);
    const result = repository.analysis('123456789');
    expect(result.total).toBe(12);
    expect(result.pools[0]).toMatchObject({ fiveStarCount: 1, averageFiveStarPity: 10, pity: 2 });
    expect(result.pools).toHaveLength(11);
    expect(result.pools.find((pool) => pool.poolType === '3')).toMatchObject({ total: 0, pity: 0 });
  });

  it('can remove one import without deleting records shared by another import', () => {
    repository = new GachaRepository(':memory:');
    const base = {
      recordOrder: 0,
      playerId: '123456789',
      poolType: '1',
      resourceId: 100,
      qualityLevel: 3,
      resourceType: '武器',
      name: '测试武器',
      time: '2026-01-01 12:00:00',
    };
    const first = repository.import(
      [
        { ...base, recordId: 'shared' },
        { ...base, recordId: 'first-only', resourceId: 101 },
      ],
      'manual',
    );
    const second = repository.import(
      [
        { ...base, recordId: 'shared' },
        { ...base, recordId: 'second-only', resourceId: 102 },
      ],
      'game',
    );
    expect(first).toMatchObject({ addedCount: 2, duplicateCount: 0 });
    expect(second).toMatchObject({ addedCount: 1, duplicateCount: 1 });
    repository.deleteBatch(first.id);
    expect(
      repository
        .analysis(base.playerId)
        .recentRecords.map((item) => item.recordId)
        .sort(),
    ).toEqual(['second-only', 'shared']);
    expect(repository.batches(base.playerId)).toHaveLength(1);
    repository.deleteBatch(second.id);
    expect(repository.analysis(base.playerId).total).toBe(0);
  });

  it('keeps distinct server records even when item and timestamp are identical', () => {
    repository = new GachaRepository(':memory:');
    const base = {
      recordOrder: 0,
      playerId: '123456789',
      poolType: '1',
      resourceId: 100,
      qualityLevel: 3,
      resourceType: '武器',
      name: '同名武器',
      time: '2026-01-01 12:00:00',
    };
    repository.upsert([
      { ...base, recordId: 'server-record-1' },
      { ...base, recordId: 'server-record-2' },
    ]);
    repository.upsert([{ ...base, recordId: 'server-record-1' }]);
    expect(repository.analysis('123456789').total).toBe(2);
  });

  it('uses API response order when pulls share the same timestamp', () => {
    repository = new GachaRepository(':memory:');
    const base = {
      playerId: '123456789',
      poolType: '1',
      resourceType: '角色',
      time: '2026-01-01 12:00:00',
    };
    repository.upsert([
      {
        ...base,
        recordId: 'newest',
        recordOrder: 0,
        resourceId: 1,
        qualityLevel: 3,
        name: '最新三星',
      },
      { ...base, recordId: 'gold', recordOrder: 1, resourceId: 2, qualityLevel: 5, name: '五星' },
      {
        ...base,
        recordId: 'oldest',
        recordOrder: 2,
        resourceId: 3,
        qualityLevel: 3,
        name: '最早三星',
      },
    ]);
    const pool = repository.analysis('123456789').pools.find((entry) => entry.poolType === '1');
    expect(pool).toMatchObject({ averageFiveStarPity: 2, pity: 1 });
    expect(repository.analysis('123456789').recentRecords.map((entry) => entry.recordId)).toEqual([
      'newest',
      'gold',
      'oldest',
    ]);
  });

  it('adopts server ids for migrated rows and restores formerly collapsed duplicates', () => {
    const directory = mkdtempSync(join(tmpdir(), 'wwbox-gacha-'));
    directories.push(directory);
    const path = join(directory, 'data.db');
    const legacy = new DatabaseSync(path);
    legacy.exec(`CREATE TABLE gacha_records (
      player_id TEXT NOT NULL,pool_type TEXT NOT NULL,resource_id INTEGER NOT NULL,quality_level INTEGER NOT NULL,
      resource_type TEXT NOT NULL,name TEXT NOT NULL,time TEXT NOT NULL,imported_at INTEGER NOT NULL,
      PRIMARY KEY(player_id,pool_type,resource_id,name,time)) STRICT;
      INSERT INTO gacha_records VALUES('123456789','1',100,3,'武器','同名武器','2026-01-01 12:00:00',1);`);
    legacy.close();
    repository = new GachaRepository(path);
    const base = {
      recordOrder: 0,
      playerId: '123456789',
      poolType: '1',
      resourceId: 100,
      qualityLevel: 3,
      resourceType: '武器',
      name: '同名武器',
      time: '2026-01-01 12:00:00',
    };
    repository.upsert([
      { ...base, recordId: 'server-1' },
      { ...base, recordId: 'server-2' },
    ]);
    repository.upsert([
      { ...base, recordId: 'server-1' },
      { ...base, recordId: 'server-2' },
    ]);
    expect(repository.analysis('123456789').total).toBe(2);
  });

  it('marks crossover event pools as featured or lost', () => {
    repository = new GachaRepository(':memory:');
    repository.upsert([
      {
        recordId: 'crossover-1',
        recordOrder: 0,
        playerId: '123456789',
        poolType: '10',
        resourceId: 1610,
        qualityLevel: 5,
        resourceType: '角色',
        name: '联动角色',
        time: '2026-07-11 12:00:00',
      },
      {
        recordId: 'crossover-2',
        recordOrder: 1,
        playerId: '123456789',
        poolType: '10',
        resourceId: 1104,
        qualityLevel: 5,
        resourceType: '角色',
        name: '常驻角色',
        time: '2026-07-11 12:01:00',
      },
    ]);
    const pool = repository.analysis('123456789').pools.find((item) => item.poolType === '10');
    expect(pool?.fiveStars.map((star) => star.featured)).toEqual([false, true]);
  });

  it('recognizes newly released event characters without version metadata', () => {
    repository = new GachaRepository(':memory:');
    repository.upsert([
      {
        recordId: 'future-limited',
        recordOrder: 0,
        playerId: '123456789',
        poolType: '1',
        resourceId: 1999,
        qualityLevel: 5,
        resourceType: '角色',
        name: '未来限定角色',
        time: '2030-01-01 12:00:00',
      },
      {
        recordId: 'future-standard',
        recordOrder: 1,
        playerId: '123456789',
        poolType: '1',
        resourceId: 1104,
        qualityLevel: 5,
        resourceType: '角色',
        name: '忌炎之外的常驻角色',
        time: '2030-01-01 12:01:00',
      },
    ]);
    expect(
      repository
        .analysis('123456789')
        .pools.find((item) => item.poolType === '1')
        ?.fiveStars.map((star) => star.featured),
    ).toEqual([false, true]);
  });

  it('normalizes API pool names into analysis pool numbers', () => {
    repository = new GachaRepository(':memory:');
    repository.upsert([
      {
        recordId: 'alias-1',
        recordOrder: 0,
        playerId: '123456789',
        poolType: '角色精准调谐',
        resourceId: 9999,
        qualityLevel: 5,
        resourceType: '角色',
        name: '活动角色',
        time: '2026-01-01 12:00:00',
      },
      {
        recordId: 'alias-2',
        recordOrder: 0,
        playerId: '123456789',
        poolType: '武器调谐（常驻池）',
        resourceId: 8888,
        qualityLevel: 3,
        resourceType: '武器',
        name: '常驻武器',
        time: '2026-01-01 12:01:00',
      },
    ]);
    const analysis = repository.analysis('123456789');
    expect(analysis.pools.find((pool) => pool.poolType === '1')?.total).toBe(1);
    expect(analysis.pools.find((pool) => pool.poolType === '4')?.total).toBe(1);
    expect(analysis.recentRecords.map((record) => record.poolType)).toEqual(['4', '1']);
  });
});

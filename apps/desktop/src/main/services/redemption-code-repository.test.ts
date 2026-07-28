import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { RedemptionCodeRepository } from './redemption-code-repository';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('RedemptionCodeRepository', () => {
  it('keeps one row per region and code and preserves the used flag on refresh', () => {
    const directory = mkdtempSync(join(tmpdir(), 'wwbox-redemption-'));
    directories.push(directory);
    const repository = new RedemptionCodeRepository(join(directory, 'data.db'));
    const code = {
      code: 'testcode',
      description: null,
      reward: '奖励 A',
      valid: true,
      used: false,
      startTime: null,
      endTime: null,
    };

    repository.upsert('cn', [code, { ...code, reward: '奖励 B' }], 'example.test');
    repository.markUsed('cn', 'TESTCODE', true);
    repository.upsert('cn', [{ ...code, reward: '奖励 C' }], 'example.test');

    expect(repository.list('cn')).toEqual([
      expect.objectContaining({ code: 'TESTCODE', reward: '奖励 C', used: true }),
    ]);
    repository.close();
  });
});

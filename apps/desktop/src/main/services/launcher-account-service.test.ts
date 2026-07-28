import { describe, expect, it } from 'vitest';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  activateGameUserCache,
  avatarResourceId,
  maskLabel,
  xorBytes,
  xor5,
} from './launcher-account-service';
describe('launcher account utilities', () => {
  it('round trips launcher xor encoding', () =>
    expect(xor5(xor5('secret-token'))).toBe('secret-token'));
  it('masks phone and email labels', () => {
    expect(maskLabel('13800138000')).toBe('138****00');
    expect(maskLabel('player@example.com')).toBe('pl***@example.com');
  });
  it('converts launcher head-photo codes to resource ids', () => {
    expect(avatarResourceId('82001108')).toBe('1108');
    expect(avatarResourceId('Role1610')).toBe('1610');
    expect(avatarResourceId('Role_1501')).toBe('1501');
  });
  it('updates the encoded game SDK account cache', () => {
    const path = join(tmpdir(), `wwbox-account-${process.pid}-${Date.now()}.json`);
    const cache = {
      account_list: [{ cuid: 'first' }, { cuid: 'selected' }],
      last_login_cuid: 'first',
    };
    try {
      writeFileSync(path, xorBytes(Buffer.from(JSON.stringify(cache)), 9));
      activateGameUserCache(path, 'selected');
      const updated = JSON.parse(xorBytes(readFileSync(path), 9).toString('utf8')) as typeof cache;
      expect(updated.last_login_cuid).toBe('selected');
      expect(updated.account_list.map((account) => account.cuid)).toEqual(['selected', 'first']);
    } finally {
      unlinkSync(path);
    }
  });
});

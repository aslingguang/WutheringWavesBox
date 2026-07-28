import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@wwbox/contracts';

describe('desktop baseline', () => {
  it('uses the initial helper protocol', () => {
    expect(PROTOCOL_VERSION).toBe(2);
  });
});

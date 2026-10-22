import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GachaImageService } from './gacha-image-service';

afterEach(() => vi.unstubAllGlobals());

describe('GachaImageService', () => {
  it('loads the official character avatar without using the Wiki full-body image', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'wwbox-wiki-images-'));
    const fetchMock = vi.fn(async (url: string, input?: RequestInit) => {
      if (url.includes('/wiki/core/catalogue/item/getPage')) {
        const catalogueId = new URLSearchParams(String(input?.body)).get('catalogueId');
        expect(catalogueId).toBe('1106');
        const name = '天之苍苍';
        return new Response(
          JSON.stringify({
            code: 200,
            data: {
              results: {
                records: [{ name, content: { contentUrl: `https://official.test/${name}.png` } }],
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(new Uint8Array(200).fill(1), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const images = await new GachaImageService(directory).get(
        [
          { resourceId: 1110, name: '穗穗', resourceType: '角色' },
          { resourceId: 21020096, name: '天之苍苍', resourceType: '武器' },
        ],
        { 1110: 'https://official.test/穗穗-avatar.png' },
      );
      expect(Object.keys(images)).toEqual(['1110', '21020096']);
      expect(fetchMock.mock.calls.map(([url]) => String(url)).join('\n')).not.toMatch(
        /github|jsdelivr/i,
      );
      expect(fetchMock.mock.calls.map(([url]) => String(url))).not.toContain(
        'https://official.test/穗穗.png',
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

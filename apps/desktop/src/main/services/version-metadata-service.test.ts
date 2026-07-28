import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VersionMetadataService } from './version-metadata-service';

const directories: string[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('VersionMetadataService', () => {
  it('combines the official version title with the maintenance start time', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'wwbox-version-'));
    directories.push(directory);
    const service = new VersionMetadataService(join(directory, 'versions.json'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const body = url.includes('ArticleMenu')
          ? [
              { articleId: 1, articleTitle: '「官网名称」3.5版本内容说明' },
              { articleId: 2, articleTitle: '《鸣潮》3.5版本更新维护预告' },
            ]
          : {
              articleContent:
                '<p>✦更新维护时间：</p><strong>2026年7月10日04:00 ~ 2026年7月10日11:00（UTC+8）</strong>',
            };
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );

    const preview = await service.previewUpdate();
    const version = preview.entries.find((entry) => entry.version === '3.5');
    expect(version).toMatchObject({
      name: '官网名称',
      start: '2026-07-10 04:00:00',
      dateSource: 'official',
    });
    expect(preview.conflicts.some((entry) => entry.version === '3.5')).toBe(true);
  });

  it('stores manual metadata and derives the previous version end', () => {
    const directory = mkdtempSync(join(tmpdir(), 'wwbox-version-'));
    directories.push(directory);
    const service = new VersionMetadataService(join(directory, 'versions.json'));
    const entries = service.save({ version: '3.6', name: '测试版本', start: '2026-08-20T10:00' });
    expect(entries[0]).toMatchObject({ version: '3.6', name: '测试版本', dateSource: 'manual' });
    expect(entries.find((entry) => entry.version === '3.5')?.end).toBe('2026-08-20 10:00:00');
    expect(service.remove('3.6').some((entry) => entry.version === '3.6')).toBe(false);
  });
});

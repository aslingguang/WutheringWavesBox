import { afterEach, describe, expect, it, vi } from 'vitest';
import { GachaImportService } from './gacha-import-service';

afterEach(() => vi.unstubAllGlobals());
describe('GachaImportService', () => {
  it('uses a manually supplied convene URL without requesting that URL', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async () => new Response(JSON.stringify({ code: 0, data: [] }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const result = await new GachaImportService().fetch(
      'https://aki-gm-resources-oversea.aki-game.net/aki/gacha/index.html?playerId=712345678&recordId=temporary',
    );
    expect(result.playerId).toBe('712345678');
    expect(fetchMock).toHaveBeenCalledTimes(11);
    expect(
      fetchMock.mock.calls.every(
        ([url]) => url === 'https://gmserver-api.aki-game2.net/gacha/record/query',
      ),
    ).toBe(true);
  });

  it('parses the current hash route and snake case parameter names', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async () => new Response(JSON.stringify({ code: 0, data: [] }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const result = await new GachaImportService().fetch(
      'https://aki-gm-resources.aki-game.com/aki/gacha/index.html#/record?player_id=123456789&record_id=token&resources_id=1&gacha_type=1&svr_id=cn&lang=zh-Hans',
    );
    expect(result.playerId).toBe('123456789');
    const request = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(request).toMatchObject({
      playerId: '123456789',
      recordId: 'token',
      cardPoolId: '1',
      serverId: 'cn',
      languageCode: 'zh-Hans',
    });
  });
});

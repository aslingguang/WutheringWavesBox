import { afterEach, describe, expect, it, vi } from 'vitest';
import { RedemptionCodeService } from './redemption-code-service';

afterEach(() => vi.unstubAllGlobals());

const cnHtml = `
<h2>有效兑换码（2026 年 7 月）</h2><table><tbody>
<tr><td><code>WUTHERINGGIFT</code></td><td>50&times; 星声</td><td>Permanent</td></tr>
<tr><td><code>WUTHERINGGIFT</code></td><td>重复项</td><td>Permanent</td></tr>
</tbody></table>
<h2>最近过期</h2><table><tbody>
<tr><td><code>MECHANISMCITY</code></td><td>100&times; 星声</td><td>2026-06-28</td></tr>
</tbody></table>`;

const globalWikitext = `===Active===
|<code>GLOBALCODE</code>||All||{{Card List|Astrite*50;Shell Credit*10000|delim=;}}
| class="bg-new" |Discovered: July 1, 2026<br />'''Valid until: Unknown'''
===Expired===
|<code>OLDCODE</code>||All||{{Card List|Astrite*100|delim=;}}
| class="bg-old" |Discovered: June 1, 2026<br />'''Valid until: June 2, 2026'''`;

describe('RedemptionCodeService', () => {
  it('parses both configured pages and removes duplicate codes', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(cnHtml))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ parse: { wikitext: { '*': globalWikitext } } })),
        ),
    );

    const catalog = await new RedemptionCodeService().list();

    expect(catalog.cn).toHaveLength(2);
    expect(catalog.cn).toEqual([
      expect.objectContaining({ code: 'WUTHERINGGIFT', valid: true, used: false }),
      expect.objectContaining({ code: 'MECHANISMCITY', valid: false, used: false }),
    ]);
    expect(catalog.global).toEqual([
      expect.objectContaining({ code: 'GLOBALCODE', valid: true, used: false }),
      expect.objectContaining({ code: 'OLDCODE', valid: false, used: false }),
    ]);
  });
});

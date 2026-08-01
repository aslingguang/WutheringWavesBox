import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { isFeaturedGachaItem } from '@wwbox/contracts';
import type { GachaAnalysis, GachaPoolAnalysis, GachaRecord } from '@wwbox/contracts';

interface Row {
  record_id: string;
  record_order: number;
  player_id: string;
  pool_type: string;
  resource_id: number;
  quality_level: number;
  resource_type: string;
  name: string;
  time: string;
}
const POOL_TYPES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];
const POOL_TYPE_ALIASES: Record<string, string> = {
  角色精准调谐: '1',
  角色活动唤取: '1',
  武器精准调谐: '2',
  武器活动唤取: '2',
  '角色调谐（常驻池）': '3',
  角色常驻唤取: '3',
  '武器调谐（常驻池）': '4',
  武器常驻唤取: '4',
  新手唤取: '5',
  新手自选唤取: '6',
  感恩定向唤取: '7',
  角色新旅唤取: '8',
  武器新旅唤取: '9',
  角色联动唤取: '10',
  武器联动唤取: '11',
};
export class GachaRepository {
  private readonly database: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.initializeSchema();
    this.normalizeStoredPoolTypes();
  }
  upsert(records: GachaRecord[]): void {
    const statement = this.database.prepare(
      `INSERT INTO gacha_records(record_id,record_order,player_id,pool_type,resource_id,quality_level,resource_type,name,time,imported_at)
       VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(player_id,pool_type,record_id) DO UPDATE SET
       record_order=excluded.record_order,resource_id=excluded.resource_id,quality_level=excluded.quality_level,
       resource_type=excluded.resource_type,name=excluded.name,time=excluded.time,imported_at=excluded.imported_at`,
    );
    const adoptLegacy = this.database
      .prepare(`UPDATE OR IGNORE gacha_records SET record_id=?,record_order=?
      WHERE rowid=(SELECT rowid FROM gacha_records WHERE player_id=? AND pool_type=? AND resource_id=?
        AND name=? AND time=? AND record_id LIKE 'legacy|%' LIMIT 1)`);
    this.database.exec('BEGIN IMMEDIATE');
    try {
      for (const r of records) {
        const poolType = normalizePoolType(r.poolType);
        if (!r.recordId.startsWith('legacy|'))
          adoptLegacy.run(
            r.recordId,
            r.recordOrder,
            r.playerId,
            poolType,
            r.resourceId,
            r.name,
            r.time,
          );
        statement.run(
          r.recordId,
          r.recordOrder,
          r.playerId,
          poolType,
          r.resourceId,
          r.qualityLevel,
          r.resourceType,
          r.name,
          r.time,
          Date.now(),
        );
      }
      this.database.exec('COMMIT');
    } catch (e) {
      this.database.exec('ROLLBACK');
      throw e;
    }
  }
  latestPlayerId(): string | null {
    const row = this.database
      .prepare('SELECT player_id FROM gacha_records ORDER BY imported_at DESC LIMIT 1')
      .get() as { player_id: string } | undefined;
    return row?.player_id ?? null;
  }
  players(): string[] {
    return (
      this.database
        .prepare('SELECT DISTINCT player_id FROM gacha_records ORDER BY player_id')
        .all() as Array<{ player_id: string }>
    ).map((row) => row.player_id);
  }
  deletePlayer(playerId: string): void {
    this.database.prepare('DELETE FROM gacha_records WHERE player_id=?').run(playerId);
  }
  analysis(playerId: string): GachaAnalysis {
    const rows = (
      this.database
        .prepare(
          'SELECT record_id,record_order,player_id,pool_type,resource_id,quality_level,resource_type,name,time FROM gacha_records WHERE player_id=? ORDER BY time DESC,record_order ASC,record_id DESC',
        )
        .all(playerId) as unknown as Row[]
    ).map(mapRow);
    const grouped = new Map<string, GachaRecord[]>();
    for (const row of rows) {
      const pool = grouped.get(row.poolType) ?? [];
      pool.push(row);
      grouped.set(row.poolType, pool);
    }
    return {
      playerId,
      total: rows.length,
      importedAt: new Date().toISOString(),
      pools: POOL_TYPES.map((poolType) => analyzePool(poolType, grouped.get(poolType) ?? [])),
      recentRecords: rows,
    };
  }
  close(): void {
    this.database.close();
  }

  private normalizeStoredPoolTypes(): void {
    const update = this.database.prepare(
      'UPDATE OR IGNORE gacha_records SET pool_type=? WHERE pool_type=?',
    );
    const remove = this.database.prepare('DELETE FROM gacha_records WHERE pool_type=?');
    this.database.exec('BEGIN IMMEDIATE');
    try {
      for (const [alias, poolType] of Object.entries(POOL_TYPE_ALIASES)) {
        update.run(poolType, alias);
        remove.run(alias);
      }
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  private initializeSchema(): void {
    this.database.exec(`CREATE TABLE IF NOT EXISTS gacha_records (
      record_id TEXT NOT NULL, record_order INTEGER NOT NULL, player_id TEXT NOT NULL, pool_type TEXT NOT NULL, resource_id INTEGER NOT NULL,
      quality_level INTEGER NOT NULL, resource_type TEXT NOT NULL, name TEXT NOT NULL, time TEXT NOT NULL,
      imported_at INTEGER NOT NULL, PRIMARY KEY(player_id,pool_type,record_id)) STRICT;`);
    const columns = this.database
      .prepare('PRAGMA table_info(gacha_records)')
      .all() as unknown as Array<{ name: string }>;
    if (!columns.some((column) => column.name === 'record_id')) {
      this.database.exec(`BEGIN IMMEDIATE;
      ALTER TABLE gacha_records RENAME TO gacha_records_legacy;
      CREATE TABLE gacha_records (
        record_id TEXT NOT NULL, record_order INTEGER NOT NULL, player_id TEXT NOT NULL, pool_type TEXT NOT NULL, resource_id INTEGER NOT NULL,
        quality_level INTEGER NOT NULL, resource_type TEXT NOT NULL, name TEXT NOT NULL, time TEXT NOT NULL,
        imported_at INTEGER NOT NULL, PRIMARY KEY(player_id,pool_type,record_id)) STRICT;
      INSERT INTO gacha_records
        SELECT 'legacy|' || rowid,0,player_id,pool_type,resource_id,quality_level,resource_type,name,time,imported_at
        FROM gacha_records_legacy;
      DROP TABLE gacha_records_legacy;
      COMMIT;`);
      return;
    }
    if (!columns.some((column) => column.name === 'record_order'))
      this.database.exec(
        'ALTER TABLE gacha_records ADD COLUMN record_order INTEGER NOT NULL DEFAULT 0',
      );
  }
}
function mapRow(row: Row): GachaRecord {
  return {
    recordId: row.record_id,
    recordOrder: row.record_order,
    playerId: row.player_id,
    poolType: normalizePoolType(row.pool_type),
    resourceId: row.resource_id,
    qualityLevel: row.quality_level,
    resourceType: row.resource_type,
    name: row.name,
    time: row.time,
  };
}
function normalizePoolType(poolType: string): string {
  return POOL_TYPE_ALIASES[poolType.trim()] ?? poolType.trim();
}
function analyzePool(poolType: string, records: GachaRecord[]): GachaPoolAnalysis {
  const isEventPool = ['1', '2', '10', '11'].includes(poolType);
  const chronological = [...records].reverse();
  let pity = 0;
  const fiveStars: GachaPoolAnalysis['fiveStars'] = [];
  const pities: number[] = [];
  for (const record of chronological) {
    pity++;
    if (record.qualityLevel === 5) {
      fiveStars.push({
        resourceId: record.resourceId,
        name: record.name,
        time: record.time,
        pity,
        featured: isEventPool ? isFeaturedRecord(record) : null,
      });
      pities.push(pity);
      pity = 0;
    }
  }
  return {
    poolType,
    total: records.length,
    fiveStarCount: pities.length,
    fourStarCount: records.filter((r) => r.qualityLevel === 4).length,
    pity,
    averageFiveStarPity: pities.length
      ? Math.round((pities.reduce((a, b) => a + b, 0) / pities.length) * 10) / 10
      : null,
    fiveStars: fiveStars.reverse(),
  };
}
function isFeaturedRecord(record: GachaRecord): boolean | null {
  // Character event pools can always be classified from the permanent five-star
  // roster. This remains correct when a new event banner launches before version
  // metadata has been updated. Event weapon banners do not have off-banner
  // five-stars, so every five-star weapon there is featured.
  if (['2', '11'].includes(record.poolType)) return true;
  if (['1', '10'].includes(record.poolType))
    return !PERMANENT_FIVE_STAR_CHARACTER_IDS.has(record.resourceId);
  return isFeaturedGachaItem(record.time, record.poolType, record.resourceId);
}

const PERMANENT_FIVE_STAR_CHARACTER_IDS = new Set([1104, 1301, 1403, 1503, 1601]);

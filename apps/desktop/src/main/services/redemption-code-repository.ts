import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AccountRegion, RedemptionCode } from '@wwbox/contracts';

interface RedemptionCodeRow {
  code: string;
  description: string | null;
  reward: string | null;
  valid: number;
  used: number;
  start_time: string | null;
  end_time: string | null;
}

export class RedemptionCodeRepository {
  private readonly database: DatabaseSync;

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS redemption_codes (
        region TEXT NOT NULL CHECK(region IN ('cn', 'global')),
        code TEXT NOT NULL COLLATE NOCASE,
        description TEXT,
        reward TEXT,
        valid INTEGER NOT NULL CHECK(valid IN (0, 1)),
        used INTEGER NOT NULL DEFAULT 0 CHECK(used IN (0, 1)),
        start_time TEXT,
        end_time TEXT,
        source TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(region, code)
      ) STRICT;
    `);
  }

  upsert(region: AccountRegion, codes: RedemptionCode[], source: string): void {
    const statement = this.database.prepare(`
      INSERT INTO redemption_codes
        (region, code, description, reward, valid, used, start_time, end_time, source, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
      ON CONFLICT(region, code) DO UPDATE SET
        description=excluded.description, reward=excluded.reward, valid=excluded.valid,
        start_time=excluded.start_time, end_time=excluded.end_time,
        source=excluded.source, updated_at=excluded.updated_at
    `);
    this.database.exec('BEGIN IMMEDIATE');
    try {
      for (const item of uniqueCodes(codes))
        statement.run(
          region,
          item.code.toUpperCase(),
          item.description,
          item.reward,
          Number(item.valid),
          item.startTime,
          item.endTime,
          source,
          Date.now(),
        );
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  list(region: AccountRegion): RedemptionCode[] {
    return (
      this.database
        .prepare(
          `SELECT code, description, reward, valid, used, start_time, end_time
           FROM redemption_codes WHERE region=? ORDER BY valid DESC, used ASC, code`,
        )
        .all(region) as unknown as RedemptionCodeRow[]
    ).map(mapRow);
  }

  markUsed(region: AccountRegion, code: string, used: boolean): void {
    this.database
      .prepare('UPDATE redemption_codes SET used=? WHERE region=? AND code=? COLLATE NOCASE')
      .run(Number(used), region, code);
  }

  close(): void {
    this.database.close();
  }
}

function uniqueCodes(codes: RedemptionCode[]): RedemptionCode[] {
  return [...new Map(codes.map((item) => [item.code.trim().toUpperCase(), item])).values()];
}

function mapRow(row: RedemptionCodeRow): RedemptionCode {
  return {
    code: row.code,
    description: row.description,
    reward: row.reward,
    valid: row.valid === 1,
    used: row.used === 1,
    startTime: row.start_time,
    endTime: row.end_time,
  };
}

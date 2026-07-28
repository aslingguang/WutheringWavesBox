import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AccountProfile, AccountRegion, SaveAccountProfileInput } from '@wwbox/contracts';

interface AccountRow {
  id: string;
  display_name: string;
  player_id: string | null;
  region: string;
  installation_id: string | null;
  note: string | null;
  active: number;
  created_at: number;
}

export class AccountRepository {
  private readonly database: DatabaseSync;

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS account_profiles (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        player_id TEXT,
        region TEXT NOT NULL CHECK(region IN ('cn', 'global')),
        installation_id TEXT,
        active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0, 1)),
        created_at INTEGER NOT NULL
      ) STRICT;
    `);
    const columns = this.database.prepare('PRAGMA table_info(account_profiles)').all() as Array<{
      name: string;
    }>;
    if (!columns.some((column) => column.name === 'note'))
      this.database.exec('ALTER TABLE account_profiles ADD COLUMN note TEXT');
  }

  list(): AccountProfile[] {
    return (
      this.database
        .prepare(`SELECT * FROM account_profiles ORDER BY active DESC, created_at`)
        .all() as unknown as AccountRow[]
    ).map(mapRow);
  }

  save(input: SaveAccountProfileInput): AccountProfile {
    const playerId = input.playerId?.trim() || null;
    const matchingUid = playerId
      ? (this.database
          .prepare('SELECT id FROM account_profiles WHERE player_id = ? LIMIT 1')
          .get(playerId) as { id: string } | undefined)
      : undefined;
    const id = input.id ?? matchingUid?.id ?? randomUUID();
    const existing = this.database
      .prepare('SELECT active, created_at FROM account_profiles WHERE id = ?')
      .get(id) as { active: number; created_at: number } | undefined;
    const active = existing?.active ?? (this.list().length === 0 ? 1 : 0);
    const createdAt = existing?.created_at ?? Date.now();
    this.database
      .prepare(
        `INSERT INTO account_profiles (id, display_name, player_id, region, installation_id, active, created_at, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name, player_id=excluded.player_id,
      region=excluded.region, installation_id=excluded.installation_id, note=excluded.note`,
      )
      .run(
        id,
        input.displayName.trim(),
        playerId,
        input.region,
        input.installationId || null,
        active,
        createdAt,
        input.note?.trim() || null,
      );
    return this.get(id)!;
  }

  activate(id: string): AccountProfile | null {
    if (!this.get(id)) return null;
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare('UPDATE account_profiles SET active = 0').run();
      this.database.prepare('UPDATE account_profiles SET active = 1 WHERE id = ?').run(id);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
    return this.get(id);
  }

  get(id: string): AccountProfile | null {
    const row = this.database
      .prepare('SELECT * FROM account_profiles WHERE id = ?')
      .get(id) as unknown as AccountRow | undefined;
    return row ? mapRow(row) : null;
  }

  remove(id: string): void {
    const wasActive = this.get(id)?.active ?? false;
    this.database.prepare('DELETE FROM account_profiles WHERE id = ?').run(id);
    if (wasActive) {
      const next = this.list()[0];
      if (next) this.activate(next.id);
    }
  }

  close(): void {
    this.database.close();
  }
}

function mapRow(row: AccountRow): AccountProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    playerId: row.player_id,
    region: row.region as AccountRegion,
    installationId: row.installation_id,
    note: row.note,
    active: row.active === 1,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

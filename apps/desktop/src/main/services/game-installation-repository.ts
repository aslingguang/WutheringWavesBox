import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { GameInstallation, GameRegion } from '@wwbox/contracts';

interface GameInstallationRow {
  id: string;
  root_path: string;
  executable_path: string;
  client_executable_path: string | null;
  region: string;
  local_version: string | null;
}

export class GameInstallationRepository {
  private readonly database: DatabaseSync;

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS game_installations (
        id TEXT PRIMARY KEY,
        root_path TEXT NOT NULL UNIQUE,
        executable_path TEXT NOT NULL,
        client_executable_path TEXT,
        region TEXT NOT NULL,
        local_version TEXT,
        last_verified_at INTEGER NOT NULL
      ) STRICT;
    `);
  }

  list(): GameInstallation[] {
    const rows = this.database
      .prepare(
        `SELECT id, root_path, executable_path, client_executable_path, region, local_version
         FROM game_installations ORDER BY root_path COLLATE NOCASE`,
      )
      .all() as unknown as GameInstallationRow[];
    return rows.map(mapRow);
  }

  get(installationId: string): GameInstallation | null {
    const row = this.database
      .prepare(
        `SELECT id, root_path, executable_path, client_executable_path, region, local_version
         FROM game_installations WHERE id = ?`,
      )
      .get(installationId) as unknown as GameInstallationRow | undefined;
    return row ? mapRow(row) : null;
  }

  upsert(installation: GameInstallation): void {
    this.database
      .prepare(
        `INSERT INTO game_installations (
           id, root_path, executable_path, client_executable_path, region, local_version, last_verified_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           root_path = excluded.root_path,
           executable_path = excluded.executable_path,
           client_executable_path = excluded.client_executable_path,
           region = excluded.region,
           local_version = excluded.local_version,
           last_verified_at = excluded.last_verified_at`,
      )
      .run(
        installation.id,
        installation.rootPath,
        installation.executablePath,
        installation.clientExecutablePath,
        installation.region,
        installation.localVersion,
        Date.now(),
      );
  }

  remove(installationId: string): void {
    this.database.prepare('DELETE FROM game_installations WHERE id = ?').run(installationId);
  }

  close(): void {
    this.database.close();
  }
}

function mapRow(row: GameInstallationRow): GameInstallation {
  return {
    id: row.id,
    rootPath: row.root_path,
    executablePath: row.executable_path,
    clientExecutablePath: row.client_executable_path,
    region: isGameRegion(row.region) ? row.region : 'unknown',
    localVersion: row.local_version,
  };
}

function isGameRegion(value: string): value is GameRegion {
  return (
    value === 'cn' ||
    value === 'global' ||
    value === 'bilibili' ||
    value === 'wegame' ||
    value === 'unknown'
  );
}

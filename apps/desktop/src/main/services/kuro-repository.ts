import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { KuroAccount, KuroGameRole, KuroLoginMethod } from '@wwbox/contracts';

interface AccountRow {
  id: string;
  label: string;
  account_name: string | null;
  remark: string | null;
  login_method: string;
  phone_masked: string | null;
  token_secret: string;
  did_secret: string | null;
  active_role_id: string | null;
  active: number;
  auto_sign: number;
  auto_retro_sign: number;
  last_sign_at: number | null;
  last_sign_status: string | null;
  last_retro_sign_at: number | null;
  last_retro_sign_status: string | null;
  created_at: number;
}

interface RoleRow {
  account_id: string;
  user_id: string;
  role_id: string;
  role_name: string;
  server_id: string;
  server_name: string | null;
  linked_account_id: string | null;
}

export class KuroRepository {
  private readonly database: DatabaseSync;

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS kuro_accounts (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        login_method TEXT NOT NULL CHECK(login_method IN ('sms', 'token')),
        phone_masked TEXT,
        token_secret TEXT NOT NULL,
        active_role_id TEXT,
        active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0, 1)),
        auto_sign INTEGER NOT NULL DEFAULT 0 CHECK(auto_sign IN (0, 1)),
        auto_retro_sign INTEGER NOT NULL DEFAULT 0 CHECK(auto_retro_sign IN (0, 1)),
        last_sign_at INTEGER,
        last_sign_status TEXT,
        last_retro_sign_at INTEGER,
        last_retro_sign_status TEXT,
        created_at INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS kuro_roles (
        account_id TEXT NOT NULL REFERENCES kuro_accounts(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        role_id TEXT NOT NULL,
        role_name TEXT NOT NULL,
        server_id TEXT NOT NULL,
        server_name TEXT,
        linked_account_id TEXT,
        PRIMARY KEY(account_id, role_id)
      ) STRICT;
    `);
    const accountColumns = this.database
      .prepare('PRAGMA table_info(kuro_accounts)')
      .all() as Array<{ name: string }>;
    if (!accountColumns.some((column) => column.name === 'account_name'))
      this.database.exec('ALTER TABLE kuro_accounts ADD COLUMN account_name TEXT');
    if (!accountColumns.some((column) => column.name === 'remark'))
      this.database.exec('ALTER TABLE kuro_accounts ADD COLUMN remark TEXT');
    if (!accountColumns.some((column) => column.name === 'did_secret'))
      this.database.exec('ALTER TABLE kuro_accounts ADD COLUMN did_secret TEXT');
    if (!accountColumns.some((column) => column.name === 'auto_retro_sign'))
      this.database.exec(
        'ALTER TABLE kuro_accounts ADD COLUMN auto_retro_sign INTEGER NOT NULL DEFAULT 0 CHECK(auto_retro_sign IN (0, 1))',
      );
    if (!accountColumns.some((column) => column.name === 'last_retro_sign_at'))
      this.database.exec('ALTER TABLE kuro_accounts ADD COLUMN last_retro_sign_at INTEGER');
    if (!accountColumns.some((column) => column.name === 'last_retro_sign_status'))
      this.database.exec('ALTER TABLE kuro_accounts ADD COLUMN last_retro_sign_status TEXT');
  }

  list(): KuroAccount[] {
    const rows = this.database
      .prepare('SELECT * FROM kuro_accounts ORDER BY active DESC, created_at')
      .all() as unknown as AccountRow[];
    return rows.map((row) => this.mapAccount(row));
  }

  get(id: string): KuroAccount | null {
    const row = this.database
      .prepare('SELECT * FROM kuro_accounts WHERE id = ?')
      .get(id) as unknown as AccountRow | undefined;
    return row ? this.mapAccount(row) : null;
  }

  getSecret(id: string): string | null {
    const row = this.database
      .prepare('SELECT token_secret FROM kuro_accounts WHERE id = ?')
      .get(id) as { token_secret: string } | undefined;
    return row?.token_secret ?? null;
  }

  getDidSecret(id: string): string | null {
    const row = this.database
      .prepare('SELECT did_secret FROM kuro_accounts WHERE id = ?')
      .get(id) as { did_secret: string | null } | undefined;
    return row?.did_secret ?? null;
  }

  save(
    accountName: string,
    remark: string | null,
    loginMethod: KuroLoginMethod,
    phoneMasked: string | null,
    tokenSecret: string,
    didSecret: string,
    roles: KuroGameRole[],
  ): KuroAccount {
    const existing = roles
      .map((role) => role.roleId)
      .find((roleId) =>
        this.database.prepare('SELECT 1 FROM kuro_roles WHERE role_id = ? LIMIT 1').get(roleId),
      );
    const existingId = existing
      ? (
          this.database
            .prepare('SELECT account_id FROM kuro_roles WHERE role_id = ? LIMIT 1')
            .get(existing) as { account_id: string }
        ).account_id
      : null;
    const id = existingId ?? randomUUID();
    const current = this.get(id);
    const createdAt = current ? Date.parse(current.createdAt) : Date.now();
    const active = current?.active ?? this.list().length === 0;
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database
        .prepare(
          `INSERT INTO kuro_accounts
        (id,label,account_name,remark,login_method,phone_masked,token_secret,did_secret,active_role_id,active,auto_sign,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
        label=excluded.label,account_name=excluded.account_name,remark=excluded.remark,login_method=excluded.login_method,
        phone_masked=excluded.phone_masked,token_secret=excluded.token_secret,did_secret=excluded.did_secret`,
        )
        .run(
          id,
          accountName,
          accountName,
          remark?.trim() || null,
          loginMethod,
          phoneMasked,
          tokenSecret,
          didSecret,
          current?.activeRoleId ?? roles[0]?.roleId ?? null,
          active ? 1 : 0,
          current?.autoSign ? 1 : 0,
          createdAt,
        );
      this.database.prepare('DELETE FROM kuro_roles WHERE account_id = ?').run(id);
      const insert = this.database.prepare(`INSERT INTO kuro_roles
        (account_id,user_id,role_id,role_name,server_id,server_name,linked_account_id) VALUES (?,?,?,?,?,?,?)`);
      for (const role of roles)
        insert.run(
          id,
          role.userId,
          role.roleId,
          role.roleName,
          role.serverId,
          role.serverName,
          role.linkedAccountId,
        );
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
    return this.get(id)!;
  }

  updateCredentials(
    id: string,
    accountName: string,
    remark: string | null,
    tokenSecret: string,
    didSecret: string,
    roles: KuroGameRole[],
  ): KuroAccount | null {
    const current = this.get(id);
    if (!current) return null;
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database
        .prepare(
          'UPDATE kuro_accounts SET label=?, account_name=?, remark=?, token_secret=?, did_secret=? WHERE id=?',
        )
        .run(accountName, accountName, remark?.trim() || null, tokenSecret, didSecret, id);
      this.database.prepare('DELETE FROM kuro_roles WHERE account_id = ?').run(id);
      const insert = this.database.prepare(
        'INSERT INTO kuro_roles (account_id,user_id,role_id,role_name,server_id,server_name,linked_account_id) VALUES (?,?,?,?,?,?,?)',
      );
      for (const role of roles)
        insert.run(
          id,
          role.userId,
          role.roleId,
          role.roleName,
          role.serverId,
          role.serverName,
          role.linkedAccountId,
        );
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
    return this.get(id);
  }

  activate(id: string): KuroAccount | null {
    if (!this.get(id)) return null;
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare('UPDATE kuro_accounts SET active = 0').run();
      this.database.prepare('UPDATE kuro_accounts SET active = 1 WHERE id = ?').run(id);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
    return this.get(id);
  }

  selectRole(id: string, roleId: string): KuroAccount | null {
    const belongs = this.database
      .prepare('SELECT 1 FROM kuro_roles WHERE account_id = ? AND role_id = ?')
      .get(id, roleId);
    if (!belongs) return null;
    this.database
      .prepare('UPDATE kuro_accounts SET active_role_id = ? WHERE id = ?')
      .run(roleId, id);
    return this.get(id);
  }

  setAutoSign(id: string, enabled: boolean): KuroAccount | null {
    this.database
      .prepare('UPDATE kuro_accounts SET auto_sign = ? WHERE id = ?')
      .run(enabled ? 1 : 0, id);
    return this.get(id);
  }

  setAllAutoSign(enabled: boolean): KuroAccount[] {
    this.database.prepare('UPDATE kuro_accounts SET auto_sign = ?').run(enabled ? 1 : 0);
    return this.list();
  }

  setAutoRetroSign(id: string, enabled: boolean): KuroAccount | null {
    this.database
      .prepare('UPDATE kuro_accounts SET auto_retro_sign = ? WHERE id = ?')
      .run(enabled ? 1 : 0, id);
    return this.get(id);
  }

  setAllAutoRetroSign(enabled: boolean): KuroAccount[] {
    this.database.prepare('UPDATE kuro_accounts SET auto_retro_sign = ?').run(enabled ? 1 : 0);
    return this.list();
  }

  updateSign(id: string, message: string, success = true): void {
    if (success)
      this.database
        .prepare('UPDATE kuro_accounts SET last_sign_at = ?, last_sign_status = ? WHERE id = ?')
        .run(Date.now(), message, id);
    else
      this.database
        .prepare('UPDATE kuro_accounts SET last_sign_status = ? WHERE id = ?')
        .run(message, id);
  }

  updateRetroSign(id: string, message: string, success = true): void {
    if (success)
      this.database
        .prepare(
          'UPDATE kuro_accounts SET last_retro_sign_at = ?, last_retro_sign_status = ? WHERE id = ?',
        )
        .run(Date.now(), message, id);
    else
      this.database
        .prepare('UPDATE kuro_accounts SET last_retro_sign_status = ? WHERE id = ?')
        .run(message, id);
  }

  remove(id: string): void {
    const active = this.get(id)?.active;
    this.database.prepare('DELETE FROM kuro_accounts WHERE id = ?').run(id);
    if (active) {
      const next = this.list()[0];
      if (next) this.activate(next.id);
    }
  }

  close(): void {
    this.database.close();
  }

  private mapAccount(row: AccountRow): KuroAccount {
    const roles = (
      this.database
        .prepare(
          `SELECT r.*, a.id linked_account_id
      FROM kuro_roles r LEFT JOIN account_profiles a ON a.player_id = r.role_id
      WHERE r.account_id = ? ORDER BY r.role_id`,
        )
        .all(row.id) as unknown as RoleRow[]
    ).map((role) => ({
      userId: role.user_id,
      roleId: role.role_id,
      roleName: role.role_name,
      serverId: role.server_id,
      serverName: role.server_name,
      linkedAccountId: role.linked_account_id,
    }));
    return {
      id: row.id,
      accountName: row.account_name || row.label,
      remark: row.remark,
      displayTitle: `${row.account_name || row.label} · ${roles.find((role) => role.roleId === row.active_role_id)?.roleId ?? roles[0]?.roleId ?? '无UID'} · ${roles.some((role) => role.linkedAccountId) ? '已协同' : '未协同'}`,
      collaborationStatus: roles.some((role) => role.linkedAccountId) ? 'linked' : 'unlinked',
      loginMethod: row.login_method as KuroLoginMethod,
      phoneMasked: row.phone_masked,
      hasDid: Boolean(row.did_secret),
      roles,
      activeRoleId: row.active_role_id,
      active: row.active === 1,
      autoSign: row.auto_sign === 1,
      autoRetroSign: row.auto_retro_sign === 1,
      lastSignAt: row.last_sign_at ? new Date(row.last_sign_at).toISOString() : null,
      lastSignStatus: row.last_sign_status,
      lastRetroSignAt: row.last_retro_sign_at
        ? new Date(row.last_retro_sign_at).toISOString()
        : null,
      lastRetroSignStatus: row.last_retro_sign_status,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }
}

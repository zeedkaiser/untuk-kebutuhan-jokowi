
// =============================================
// DATABASE MODULE - SQLite
// Menyimpan data member, backup server, OAuth2 tokens
// =============================================

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs-extra");

const DB_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DB_DIR, "bot.db");

fs.ensureDirSync(DB_DIR);

const db = new Database(DB_PATH);

// =============================================
// INISIALISASI TABEL
// =============================================
db.exec(`
  -- Tabel member yang sudah OAuth2 / verify
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    username TEXT,
    discriminator TEXT,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at INTEGER,
    roles TEXT DEFAULT '[]',
    verified_at INTEGER DEFAULT (strftime('%s','now')),
    last_seen INTEGER DEFAULT (strftime('%s','now')),
    UNIQUE(user_id, guild_id)
  );

  -- Tabel backup server (channel, roles, struktur)
  CREATE TABLE IF NOT EXISTS server_backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    guild_name TEXT,
    backup_name TEXT,
    backup_data TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  -- Index untuk performa
  CREATE INDEX IF NOT EXISTS idx_members_guild ON members(guild_id);
  CREATE INDEX IF NOT EXISTS idx_backups_guild ON server_backups(guild_id);
`);

// =============================================
// MEMBER FUNCTIONS
// =============================================

function upsertMember({ userId, guildId, username, discriminator, accessToken, refreshToken, tokenExpiresAt, roles }) {
  const stmt = db.prepare(`
    INSERT INTO members (user_id, guild_id, username, discriminator, access_token, refresh_token, token_expires_at, roles, verified_at, last_seen)
    VALUES (@userId, @guildId, @username, @discriminator, @accessToken, @refreshToken, @tokenExpiresAt, @roles, strftime('%s','now'), strftime('%s','now'))
    ON CONFLICT(user_id, guild_id) DO UPDATE SET
      username = @username,
      discriminator = @discriminator,
      access_token = @accessToken,
      refresh_token = @refreshToken,
      token_expires_at = @tokenExpiresAt,
      roles = @roles,
      last_seen = strftime('%s','now')
  `);
  return stmt.run({ userId, guildId, username, discriminator, accessToken: accessToken || null, refreshToken: refreshToken || null, tokenExpiresAt: tokenExpiresAt || null, roles: JSON.stringify(roles || []) });
}

function getMember(userId, guildId) {
  return db.prepare("SELECT * FROM members WHERE user_id = ? AND guild_id = ?").get(userId, guildId);
}

function getAllMembers(guildId) {
  return db.prepare("SELECT * FROM members WHERE guild_id = ?").all(guildId);
}

function getMemberCount(guildId) {
  return db.prepare("SELECT COUNT(*) as count FROM members WHERE guild_id = ?").get(guildId).count;
}

function deleteMember(userId, guildId) {
  return db.prepare("DELETE FROM members WHERE user_id = ? AND guild_id = ?").run(userId, guildId);
}

function updateMemberRoles(userId, guildId, roles) {
  return db.prepare("UPDATE members SET roles = ? WHERE user_id = ? AND guild_id = ?").run(JSON.stringify(roles), userId, guildId);
}

// =============================================
// SERVER BACKUP FUNCTIONS
// =============================================

function saveBackup({ guildId, guildName, backupName, backupData }) {
  const stmt = db.prepare(`
    INSERT INTO server_backups (guild_id, guild_name, backup_name, backup_data)
    VALUES (?, ?, ?, ?)
  `);
  return stmt.run(guildId, guildName, backupName, JSON.stringify(backupData));
}

function getBackups(guildId) {
  return db.prepare("SELECT id, guild_id, guild_name, backup_name, created_at FROM server_backups WHERE guild_id = ? ORDER BY created_at DESC").all(guildId);
}

function getBackup(id) {
  const row = db.prepare("SELECT * FROM server_backups WHERE id = ?").get(id);
  if (row) row.backup_data = JSON.parse(row.backup_data);
  return row;
}

function deleteBackup(id) {
  return db.prepare("DELETE FROM server_backups WHERE id = ?").run(id);
}

module.exports = {
  db,
  // members
  upsertMember,
  getMember,
  getAllMembers,
  getMemberCount,
  deleteMember,
  updateMemberRoles,
  // backups
  saveBackup,
  getBackups,
  getBackup,
  deleteBackup,
};

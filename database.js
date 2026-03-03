// =============================================
// DATABASE MODULE - MongoDB
// =============================================

const mongoose = require("mongoose");

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("[MONGO] Connected"))
  .catch(err => console.error("[MONGO] Error:", err));

// ==============================
// MEMBER SCHEMA
// ==============================

const memberSchema = new mongoose.Schema({
  user_id: String,
  guild_id: String,
  username: String,
  discriminator: String,
  access_token: String,
  refresh_token: String,
  token_expires_at: Number,
  roles: {
    type: [String],
    default: []
  },
  verified_at: {
    type: Number,
    default: () => Math.floor(Date.now() / 1000)
  },
  last_seen: {
    type: Number,
    default: () => Math.floor(Date.now() / 1000)
  }
});

memberSchema.index({ user_id: 1, guild_id: 1 }, { unique: true });

const Member = mongoose.model("Member", memberSchema);

// ==============================
// MEMBER FUNCTIONS
// ==============================

async function upsertMember({ userId, guildId, username, discriminator, accessToken, refreshToken, tokenExpiresAt, roles }) {
  return Member.findOneAndUpdate(
    { user_id: userId, guild_id: guildId },
    {
      user_id: userId,
      guild_id: guildId,
      username,
      discriminator,
      access_token: accessToken || null,
      refresh_token: refreshToken || null,
      token_expires_at: tokenExpiresAt || null,
      roles: roles || [],
      last_seen: Math.floor(Date.now() / 1000)
    },
    { upsert: true, new: true }
  );
}

async function getMember(userId, guildId) {
  return Member.findOne({ user_id: userId, guild_id: guildId });
}

async function getAllMembers(guildId) {
  return Member.find({ guild_id: guildId });
}

async function getMemberCount(guildId) {
  return Member.countDocuments({ guild_id: guildId });
}

async function deleteMember(userId, guildId) {
  return Member.deleteOne({ user_id: userId, guild_id: guildId });
}

async function updateMemberRoles(userId, guildId, roles) {
  return Member.updateOne(
    { user_id: userId, guild_id: guildId },
    { roles }
  );
}

// ==============================
// EXPORT
// ==============================

module.exports = {
  upsertMember,
  getMember,
  getAllMembers,
  getMemberCount,
  deleteMember,
  updateMemberRoles
};

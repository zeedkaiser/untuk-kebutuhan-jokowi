
// =============================================
// OAUTH2 WEB SERVER
// Member klik link → authorize Discord → token tersimpan
// =============================================

const express = require("express");
const axios = require("axios");
const path = require("path");
const { upsertMember } = require("./database");

const app = express();
app.use(express.json());

const DISCORD_API = "https://discord.com/api/v10";

// =============================================
// GENERATE OAUTH2 URL
// =============================================
function generateOAuthUrl(guildId, state) {
  const params = new URLSearchParams({
    client_id: process.env.CLIENT_ID,
    redirect_uri: process.env.OAUTH2_REDIRECT_URI,
    response_type: "code",
    scope: "identify guilds.join",
    state: `${guildId}:${state}`,
    prompt: "none",
  });
  return `https://discord.com/oauth2/authorize?${params}`;
}

// =============================================
// HALAMAN VERIFY (user dibawa ke sini setelah OAuth2)
// =============================================
app.get("/verify", async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    return res.send(htmlPage("❌ Gagal", "Parameter tidak valid. Silakan coba lagi.", "error"));
  }

  const parts = state.split(":");
  const guildId = parts[0];
  const userId = parts[1];

  console.log(`[OAUTH] State parsed - guildId: ${guildId}, userId: ${userId}`);

  try {
  
    const tokenRes = await axios.post(
      `${DISCORD_API}/oauth2/token`,
      new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.OAUTH2_REDIRECT_URI,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;
    const tokenExpiresAt = Math.floor(Date.now() / 1000) + expires_in;

   
    const userRes = await axios.get(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const user = userRes.data;

   
    if (!guildId) {
      console.error(`[OAUTH] ❌ guildId tidak ditemukan di state: ${state}`);
      return res.send(htmlPage("❌ Gagal", "Guild ID tidak valid. Silakan coba lagi.", "error"));
    }

    console.log(`[OAUTH] 🔍 Menyimpan member - ID: ${user.id}, Username: ${user.username}, Guild: ${guildId}`);

   
    const result = upsertMember({
      userId: user.id,
      guildId,
      username: user.username,
      discriminator: user.discriminator || "0",
      accessToken: access_token,
      refreshToken: refresh_token,
      tokenExpiresAt,
      roles: [],
    });

    console.log(`[OAUTH] 💾 Database save result:`, result);

   
    try {
      await axios.put(
        `${DISCORD_API}/guilds/${guildId}/members/${user.id}`,
        { access_token },
        {
          headers: {
            Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
    } catch (e) {
      
    }

    console.log(`[OAUTH] ✅ ${user.username}#${user.discriminator} (ID: ${user.id}) berhasil verify untuk guild ${guildId}`);

    return res.send(htmlPage(
      "✅ Verifikasi Berhasil!",
      `Halo <strong>${user.username}</strong>! Kamu sudah berhasil diverifikasi.<br><br>Data kamu telah tersimpan di sistem backup kami.<br>Kamu bisa menutup halaman ini.`,
      "success"
    ));

  } catch (error) {
    console.error("[OAUTH] Error:", error.response?.data || error.message);
    return res.send(htmlPage("❌ Verifikasi Gagal", "Terjadi kesalahan. Silakan coba lagi melalui Discord.", "error"));
  }
});

// =============================================
// HEALTH CHECK
// =============================================
app.get("/health", (req, res) => res.json({ status: "ok" }));


app.get("/debug/members", (req, res) => {
  const { getAllMembers } = require("./database");
  const guildId = req.query.guild_id;
  
  if (!guildId) {
    return res.json({ error: "guild_id parameter required" });
  }

  const members = getAllMembers(guildId);
  res.json({
    guildId,
    totalMembers: members.length,
    members: members.map((m) => ({
      user_id: m.user_id,
      username: m.username,
      verified_at: new Date(m.verified_at * 1000).toISOString(),
      has_access_token: !!m.access_token,
    })),
  });
});

// =============================================
// HTML 
// =============================================
function htmlPage(title, message, type) {
  const color = type === "success" ? "#57f287" : "#ed4245";
  const icon = type === "success" ? "✅" : "❌";
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', sans-serif;
      background: #1a1a2e;
      color: #eee;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: #16213e;
      border: 1px solid ${color}44;
      border-radius: 16px;
      padding: 48px;
      text-align: center;
      max-width: 480px;
      width: 90%;
      box-shadow: 0 0 40px ${color}22;
    }
    .icon { font-size: 64px; margin-bottom: 16px; }
    h1 { color: ${color}; font-size: 24px; margin-bottom: 12px; }
    p { color: #aaa; line-height: 1.6; }
    strong { color: #eee; }
    .badge {
      display: inline-block;
      margin-top: 24px;
      padding: 8px 20px;
      background: ${color}22;
      border: 1px solid ${color}55;
      border-radius: 999px;
      font-size: 13px;
      color: ${color};
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <div class="badge">Powered by ProjectZeed</div>
  </div>
</body>
</html>`;
}

// =============================================
// START 
// =============================================
function startOAuthServer() {
  const port = process.env.PORT;
  app.listen(port, "0.0.0.0", () => {
    console.log(`[OAUTH] Server running on port ${port}`);
    console.log(`[OAUTH] Redirect URI: ${process.env.OAUTH2_REDIRECT_URI}`);
  });
}
module.exports = { startOAuthServer, generateOAuthUrl };
startOAuthServer();

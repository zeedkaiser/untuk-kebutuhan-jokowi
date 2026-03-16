const express = require("express");
const axios = require("axios");
const session = require("express-session");
const { upsertMember } = require("./database");
const MongoStore = require("connect-mongo").default;


const app = express();
app.set("trust proxy", 1); // WAJIB untuk Railway

// =============================
// EJS + STATIC
// =============================
app.set("view engine", "ejs");
app.set("views", __dirname + "/views");
app.use(express.static(__dirname + "/public"));

app.use(express.json());
app.set("trust proxy", 1); // 🔥 WAJIB sebelum session

app.use(
  session({
    secret: process.env.SESSION_SECRET || "zeed_secret",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
    }),
    cookie: {
      secure: true,
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

const DISCORD_API = "https://discord.com/api/v10";


// =============================================
// VERIFY ROUTE
// =============================================
app.get("/verify", async (req, res) => {

  const { code, state } = req.query;
  if (!code || !state) return res.send("Invalid request.");

  const [guildId] = state.split(":");

  try {

    // =============================
    // STEP 1 - GET ACCESS TOKEN
    // =============================
    const tokenRes = await axios.post(
      `${DISCORD_API}/oauth2/token`,
      new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.OAUTH2_REDIRECT_URI,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;

    const tokenExpiresAt = Math.floor(Date.now() / 1000) + expires_in;

    // =============================
    // STEP 2 - GET USER INFO
    // =============================
    const userRes = await axios.get(
      `${DISCORD_API}/users/@me`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`
        }
      }
    );

    const user = userRes.data;

    console.log("[VERIFY] USER:", user.id, user.username);

    // =============================
    // STEP 3 - CHECK MEMBER FIRST
    // =============================
    let memberExists = true;

    try {

      await axios.get(
        `${DISCORD_API}/guilds/${guildId}/members/${user.id}`,
        {
          headers: {
            Authorization: `Bot ${process.env.BOT_TOKEN}`
          }
        }
      );

      console.log("[VERIFY] USER ALREADY IN GUILD");

    } catch {

      memberExists = false;

    }

    // =============================
    // STEP 3B - JOIN USER IF NOT EXISTS
    // =============================
    if (!memberExists) {

      await axios.put(
        `${DISCORD_API}/guilds/${guildId}/members/${user.id}`,
        {
          access_token: access_token
        },
        {
          headers: {
            Authorization: `Bot ${process.env.BOT_TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );

      console.log("[VERIFY] USER JOINED GUILD");

    }

    // =============================
    // STEP 4 - GET MEMBER DATA
    // =============================
    const memberRes = await axios.get(
      `${DISCORD_API}/guilds/${guildId}/members/${user.id}`,
      {
        headers: {
          Authorization: `Bot ${process.env.BOT_TOKEN}`
        }
      }
    );

    const guild = memberRes.data;

    const roles = guild.roles.filter(r => r !== guildId);

    console.log("[VERIFY] ROLES:", roles);

    // =============================
    // STEP 5 - SAVE TO DATABASE
    // =============================
    await upsertMember({
      userId: user.id,
      guildId,
      username: user.username,
      discriminator: user.discriminator || "0",
      accessToken: access_token,
      refreshToken: refresh_token,
      tokenExpiresAt,
      roles
    });

    console.log("[VERIFY] USER SAVED TO DATABASE");

    // =============================
    // SUCCESS PAGE
    // =============================
    return res.render("verify", {
      username: user.username
    });

  } catch (err) {

    console.error(
      "[VERIFY ERROR]",
      err.response?.data || err.message
    );

    return res.send("Verify gagal.");
  }

});

    console.log("[VERIFY] USER SAVED TO DATABASE");

    // =============================
    // SUCCESS PAGE
    // =============================
    return res.render("verify", {
      username: user.username
    });

  } catch (err) {

    console.error(
      "[VERIFY ERROR]",
      err.response?.data || err.message
    );

    return res.send("Verify gagal.");
  }

});


// ==================================================
// LOGIN ROUTE (WAJIB ADA)
// ==================================================
app.get("/login", (req, res) => {

  // 🔥 Kalau sudah login, jangan redirect ke Discord lagi
  if (req.session.user) {
    return res.redirect("/dashboard");
  }

  const params = new URLSearchParams({
    client_id: process.env.CLIENT_ID,
    redirect_uri: process.env.DASHBOARD_REDIRECT_URI,
    response_type: "code",
    scope: "identify guilds",
  });

  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});


// ==================================================
// DASHBOARD CALLBACK
// ==================================================
app.get("/dashboard/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.send("No code.");

  try {
    const tokenRes = await axios.post(
      `${DISCORD_API}/oauth2/token`,
      new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.DASHBOARD_REDIRECT_URI,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const access_token = tokenRes.data.access_token;

    const userRes = await axios.get(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const guildRes = await axios.get(`${DISCORD_API}/users/@me/guilds`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const user = userRes.data;
    const guilds = guildRes.data;

    const adminGuilds = guilds.filter(g =>
      (BigInt(g.permissions) & BigInt(0x8)) === BigInt(0x8)
    );

    req.session.user = {
      id: user.id,
      username: user.username,
    };

    req.session.guilds = adminGuilds;

    return res.redirect("/dashboard");

  } catch (err) {
    console.error("Dashboard login error:", err.response?.data || err.message);
    return res.send("Login failed.");
  }
});


// ==================================================
// AUTH MIDDLEWARE
// ==================================================
function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}


// ==================================================
// DASHBOARD VIEW (EJS)
// ==================================================
app.get("/dashboard", requireAuth, async (req, res) => {
  const { getAllMembers } = require("./database");

  let totalVerified = 0;

  for (const guild of (req.session.guilds || [])) {
    const members = await getAllMembers(guild.id);
    totalVerified += members.length;
  }

  res.render("dashboard", {
    user: req.session.user,
    guilds: req.session.guilds || [],
    totalVerified
  });
});


// ==================================================
// RESTORE ROUTE
// ==================================================
app.post("/dashboard/restore/:guildId", requireAuth, async (req, res) => {
  const { guildId } = req.params;

  try {
    const { restoreToGuild } = require("./restoreEngine");
    await restoreToGuild(guildId);

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.json({ success: false });
  }
});


// ==================================================
// LOGOUT
// ==================================================
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});


// ==================================================
// HEALTH
// ==================================================
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});



// DEBUG MEMBERS
app.get("/debug/members", async (req, res) => {
  const { guild_id } = req.query;
  const { getAllMembers } = require("./database");

  if (!guild_id) {
    return res.json({ error: "guild_id required" });
  }

  try {
    const members = await getAllMembers(guild_id);

    return res.json({
      guildId: guild_id,
      totalMembers: members.length,
      members: members
    });

  } catch (err) {
    console.error(err);
    return res.json({ error: "failed to fetch members" });
  }
});

// ==================================================
// START SERVER
// ==================================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`OAuth Server running on port ${PORT}`);
});

app.get("/dashboard/guild/:guildId/members", requireAuth, async (req, res) => {
  const { guildId } = req.params;
  const { getAllMembers } = require("./database");

  const members = await getAllMembers(guildId);

  res.render("members", {
    user: req.session.user,
    guildId,
    members
  });
});

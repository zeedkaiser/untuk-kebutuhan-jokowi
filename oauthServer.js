const express = require("express");
const axios = require("axios");
const session = require("express-session");
const { upsertMember } = require("./database");

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
    cookie: {
      secure: true,
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

const DISCORD_API = "https://discord.com/api/v10";


// ==================================================
// VERIFY ROUTE (TETAP AMAN)
// ==================================================
app.get("/verify", async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) return res.send("Invalid request.");

  const [guildId] = state.split(":");

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

    await upsertMember({
      userId: user.id,
      guildId,
      username: user.username,
      discriminator: user.discriminator || "0",
      accessToken: access_token,
      refreshToken: refresh_token,
      tokenExpiresAt,
      roles: [],
    });

    return res.send(premiumVerifyPage(user.username));

  } catch (err) {
    console.error("Verify error:", err.response?.data || err.message);
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

function premiumVerifyPage(username) {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>ProjectZeed Verify</title>
    <style>
      body {
        margin:0;
        height:100vh;
        display:flex;
        align-items:center;
        justify-content:center;
        background: url("https://image-1.uhdpaper.com/wallpaper/cyberpunk-edgerunners-lucy-and-david-in-moon-4k-wallpaper-uhdpaper.com-628@1@i.jpg") center/cover no-repeat;
        font-family: Poppins, sans-serif;
      }

      .card {
        background: rgba(15,20,50,0.85);
        padding:40px;
        border-radius:20px;
        text-align:center;
        color:white;
        backdrop-filter: blur(8px);
        box-shadow:0 0 50px rgba(120,120,255,0.4);
      }

      .bar {
        width:0%;
        height:8px;
        background:linear-gradient(90deg,#6ea8ff,#b26eff);
        margin-top:20px;
        border-radius:5px;
        transition: width 0.4s ease;
      }

      .container {
        background:#111;
        border-radius:5px;
        overflow:hidden;
        margin-top:20px;
      }
    </style>
  </head>
  <body>

    <div class="card">
      <h2>⚡ Verification Complete</h2>
      <p>Welcome, <strong>${username}</strong></p>

      <div class="container">
        <div class="bar" id="bar"></div>
      </div>

      <p id="status">Initializing secure handshake...</p>
    </div>

    <script>
      let p = 0;
      const bar = document.getElementById("bar");
      const status = document.getElementById("status");

      const messages = [
        "Decrypting gateway...",
        "Syncing identity...",
        "Encrypting backup token...",
        "System integrity: 100%",
        "Verification Success"
      ];

      let i = 0;

      const interval = setInterval(() => {
        p += 25;
        bar.style.width = p + "%";
        status.innerText = messages[i];
        i++;

        if (p >= 100) clearInterval(interval);
      }, 700);
    </script>

  </body>
  </html>
  `;
}



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
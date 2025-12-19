const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const http = require("http");
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const sqlite3 = require("sqlite3").verbose();
const multer = require("multer");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT || 3000);
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = "sid";

const dataDir = path.resolve(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const uploadsDir = path.resolve(__dirname, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const dbPath = path.join(dataDir, "ssy.db");
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function nowISO() {
  return new Date().toISOString();
}

function ticketNoFromId(id) {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `SSY-${y}${m}${day}-${String(id).padStart(6, "0")}`;
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    role: row.role,
    is_active: row.is_active,
    created_at: row.created_at
  };
}

function mapTicket(row) {
  if (!row) return null;
  return {
    id: row.id,
    ticketNo: row.ticket_no,
    createdBy: row.created_by,
    category: row.category,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    assignedTo: row.assigned_to,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
    resolvedNote: row.resolved_note
  };
}

function mapEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    ticketId: row.ticket_id,
    actorId: row.actor_id,
    type: row.type,
    message: row.message,
    createdAt: row.created_at
  };
}

function mapAnnouncement(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdBy: row.created_by,
    createdAt: row.created_at,
    is_published: row.is_published,
    expiresAt: row.expires_at,
    imagePath: row.image_path
  };
}

function mapRating(row) {
  if (!row) return null;
  return {
    id: row.id,
    ticketId: row.ticket_id,
    userId: row.user_id,
    stars: row.stars,
    note: row.note,
    createdAt: row.created_at
  };
}

function mapAttachment(row) {
  if (!row) return null;
  return {
    id: row.id,
    ticketId: row.ticket_id,
    uploadedBy: row.uploaded_by,
    originalName: row.original_name,
    fileName: row.file_name,
    mime: row.mime,
    size: row.size,
    createdAt: row.created_at
  };
}

function mapAudit(row) {
  if (!row) return null;
  return {
    id: row.id,
    action: row.action,
    actorId: row.actor_id,
    meta: row.meta ? JSON.parse(row.meta) : null,
    createdAt: row.created_at
  };
}

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sid TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_no TEXT,
      created_by INTEGER NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      priority TEXT NOT NULL,
      status TEXT NOT NULL,
      assigned_to INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT,
      resolved_note TEXT,
      FOREIGN KEY(created_by) REFERENCES users(id),
      FOREIGN KEY(assigned_to) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      actor_id INTEGER,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(ticket_id) REFERENCES tickets(id),
      FOREIGN KEY(actor_id) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      is_published INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(created_by) REFERENCES users(id)
    )
  `);

  try {
    await run("ALTER TABLE announcements ADD COLUMN expires_at TEXT");
  } catch {}

  try {
    await run("ALTER TABLE announcements ADD COLUMN image_path TEXT");
  } catch {}

  await run(`
    CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      stars INTEGER NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(ticket_id, user_id),
      FOREIGN KEY(ticket_id) REFERENCES tickets(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      uploaded_by INTEGER NOT NULL,
      original_name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(ticket_id) REFERENCES tickets(id),
      FOREIGN KEY(uploaded_by) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      actor_id INTEGER,
      meta TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(actor_id) REFERENCES users(id)
    )
  `);
}

async function createSession(userId) {
  const sid = crypto.randomBytes(24).toString("hex");
  const createdAt = nowISO();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await run(
    "INSERT INTO sessions (sid, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
    [sid, userId, createdAt, expiresAt]
  );
  return { sid, expiresAt };
}

async function deleteSession(sid) {
  if (!sid) return;
  await run("DELETE FROM sessions WHERE sid = ?", [sid]);
}

async function getUserBySession(sid) {
  if (!sid) return null;
  const row = await get(
    `
    SELECT s.sid, s.expires_at, u.*
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.sid = ?
  `,
    [sid]
  );
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await deleteSession(sid);
    return null;
  }
  return mapUser(row);
}

async function addEvent(ticketId, actorId, type, message) {
  const createdAt = nowISO();
  const result = await run(
    "INSERT INTO events (ticket_id, actor_id, type, message, created_at) VALUES (?, ?, ?, ?, ?)",
    [ticketId, actorId || null, type, message, createdAt]
  );
  return {
    id: result.lastID,
    ticketId,
    actorId: actorId || null,
    type,
    message,
    createdAt
  };
}

async function addAudit(action, actorId, meta = null) {
  const createdAt = nowISO();
  await run(
    "INSERT INTO audit_log (action, actor_id, meta, created_at) VALUES (?, ?, ?, ?)",
    [action, actorId || null, meta ? JSON.stringify(meta) : null, createdAt]
  );
}

function canAccessTicket(user, ticket) {
  if (!user || !ticket) return false;
  if (user.role === "YONETICI") return true;
  if (user.role === "PERSONEL") return ticket.assigned_to === user.id;
  return ticket.created_by === user.id;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const name = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

function maybeUpload(fieldName) {
  return (req, res, next) => {
    if (req.is("multipart/form-data")) {
      return upload.single(fieldName)(req, res, next);
    }
    return next();
  };
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const webRoot = path.resolve(__dirname, "..");

app.use(express.json());
app.use(cookieParser());
app.use(express.static(webRoot));
app.use("/uploads", express.static(uploadsDir));

app.get("/api/health", (req, res) => {
  return res.json({
    ok: true,
    server: "ssy-backend",
    dbPath,
    time: nowISO()
  });
});

function setSessionCookie(res, sid, expiresAt) {
  res.cookie(COOKIE_NAME, sid, {
    httpOnly: true,
    sameSite: "lax",
    expires: new Date(expiresAt)
  });
}

async function authRequired(req, res, next) {
  try {
    const sid = req.cookies[COOKIE_NAME];
    const user = await getUserBySession(sid);
    if (!user) return res.status(401).json({ error: "UNAUTHORIZED" });
    if (user.is_active === 0) return res.status(403).json({ error: "ACCOUNT_DISABLED" });
    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

function requireRole(roles) {
  return (req, res, next) => {
    const list = Array.isArray(roles) ? roles : [roles];
    if (!req.user || !list.includes(req.user.role)) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }
    return next();
  };
}

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const { full_name, email, password, role } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedRole = String(role || "SAKIN").trim().toUpperCase();

    if (!full_name || !normalizedEmail || !password) {
      return res.status(400).json({ error: "MISSING_FIELDS" });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: "WEAK_PASSWORD" });
    }
    if (!["SAKIN", "PERSONEL", "YONETICI"].includes(normalizedRole)) {
      return res.status(400).json({ error: "INVALID_ROLE" });
    }

    const existing = await get("SELECT id FROM users WHERE email = ?", [normalizedEmail]);
    if (existing) return res.status(409).json({ error: "EMAIL_EXISTS" });

    const passwordHash = await bcrypt.hash(String(password), 10);
    const createdAt = nowISO();
    const result = await run(
      "INSERT INTO users (full_name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
      [full_name, normalizedEmail, passwordHash, normalizedRole, createdAt]
    );

    const session = await createSession(result.lastID);
    setSessionCookie(res, session.sid, session.expiresAt);

    const user = await get("SELECT * FROM users WHERE id = ?", [result.lastID]);
    await addAudit("USER_REGISTER", user.id, { email: user.email, role: user.role });
    return res.json({ user: mapUser(user) });
  } catch (err) {
    return next(err);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: "MISSING_FIELDS" });
    }

    const row = await get("SELECT * FROM users WHERE email = ?", [normalizedEmail]);
    if (!row) return res.status(401).json({ error: "INVALID_CREDENTIALS" });
    if (row.is_active === 0) return res.status(403).json({ error: "ACCOUNT_DISABLED" });

    const ok = await bcrypt.compare(String(password), row.password_hash);
    if (!ok) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

    const session = await createSession(row.id);
    setSessionCookie(res, session.sid, session.expiresAt);

    await addAudit("USER_LOGIN", row.id, { email: row.email });
    return res.json({ user: mapUser(row) });
  } catch (err) {
    return next(err);
  }
});

app.post("/api/auth/logout", async (req, res, next) => {
  try {
    const sid = req.cookies[COOKIE_NAME];
    if (sid) {
      await deleteSession(sid);
    }
    res.clearCookie(COOKIE_NAME);
    if (req.user) {
      await addAudit("USER_LOGOUT", req.user.id, { email: req.user.email });
    }
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

app.get("/api/me", authRequired, async (req, res) => {
  return res.json({ user: req.user });
});

app.get("/api/users", authRequired, requireRole("YONETICI"), async (req, res, next) => {
  try {
    const rows = await all("SELECT * FROM users ORDER BY id DESC");
    return res.json({ users: rows.map(mapUser) });
  } catch (err) {
    return next(err);
  }
});

app.patch("/api/users/:id", authRequired, requireRole("YONETICI"), async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    if (!userId) return res.status(400).json({ error: "INVALID_ID" });
    if (userId === req.user.id) return res.status(400).json({ error: "CANNOT_EDIT_SELF" });

    const row = await get("SELECT * FROM users WHERE id = ?", [userId]);
    if (!row) return res.status(404).json({ error: "NOT_FOUND" });

    const patch = req.body || {};
    let nextActive = row.is_active;
    if (Object.prototype.hasOwnProperty.call(patch, "is_active")) {
      nextActive = Number(patch.is_active) ? 1 : 0;
    }

    await run("UPDATE users SET is_active = ? WHERE id = ?", [nextActive, userId]);
    const updated = await get("SELECT * FROM users WHERE id = ?", [userId]);

    await addAudit("USER_UPDATE", req.user.id, {
      targetId: userId,
      is_active: nextActive
    });

    io.emit("user:updated", mapUser(updated));
    return res.json({ user: mapUser(updated) });
  } catch (err) {
    return next(err);
  }
});

app.get("/api/tickets", authRequired, async (req, res, next) => {
  try {
    let rows = [];
    if (req.user.role === "YONETICI") {
      rows = await all("SELECT * FROM tickets ORDER BY created_at DESC");
    } else if (req.user.role === "PERSONEL") {
      rows = await all(
        "SELECT * FROM tickets WHERE assigned_to = ? ORDER BY created_at DESC",
        [req.user.id]
      );
    } else {
      rows = await all(
        "SELECT * FROM tickets WHERE created_by = ? ORDER BY created_at DESC",
        [req.user.id]
      );
    }
    return res.json({ tickets: rows.map(mapTicket) });
  } catch (err) {
    return next(err);
  }
});

app.post("/api/tickets", authRequired, requireRole("SAKIN"), async (req, res, next) => {
  try {
    const { category, title, description, priority } = req.body || {};
    if (!category || !title || !description || !priority) {
      return res.status(400).json({ error: "MISSING_FIELDS" });
    }

    const createdAt = nowISO();
    const result = await run(
      `
      INSERT INTO tickets (created_by, category, title, description, priority, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [req.user.id, category, title, description, priority, "ACIK", createdAt, createdAt]
    );

    const ticketNo = ticketNoFromId(result.lastID);
    await run("UPDATE tickets SET ticket_no = ? WHERE id = ?", [ticketNo, result.lastID]);

    const row = await get("SELECT * FROM tickets WHERE id = ?", [result.lastID]);
    const ticket = mapTicket(row);

    const event = await addEvent(ticket.id, req.user.id, "STATUS", "Durum: Açık");
    io.emit("event:created", event);
    io.emit("ticket:created", ticket);
    await addAudit("TICKET_CREATE", req.user.id, { ticketId: ticket.id });

    return res.json({ ticket });
  } catch (err) {
    return next(err);
  }
});

app.patch("/api/tickets/:id", authRequired, async (req, res, next) => {
  try {
    const ticketId = Number(req.params.id);
    if (!ticketId) return res.status(400).json({ error: "INVALID_ID" });

    const row = await get("SELECT * FROM tickets WHERE id = ?", [ticketId]);
    if (!row) return res.status(404).json({ error: "NOT_FOUND" });

    if (req.user.role === "PERSONEL" && row.assigned_to !== req.user.id) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }
    if (req.user.role === "SAKIN") {
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    const patch = req.body || {};
    const next = {
      assigned_to: row.assigned_to,
      status: row.status,
      resolved_at: row.resolved_at,
      resolved_note: row.resolved_note
    };

    if (req.user.role === "YONETICI") {
      if (Object.prototype.hasOwnProperty.call(patch, "assignedTo")) {
        next.assigned_to = patch.assignedTo ? Number(patch.assignedTo) : null;
      }
      if (Object.prototype.hasOwnProperty.call(patch, "status")) {
        next.status = String(patch.status || row.status);
      }
      if (Object.prototype.hasOwnProperty.call(patch, "resolvedNote")) {
        next.resolved_note = String(patch.resolvedNote || "");
      }
    }

    if (req.user.role === "PERSONEL") {
      if (Object.prototype.hasOwnProperty.call(patch, "status")) {
        const desired = String(patch.status || row.status);
        if (!["INCELEMEDE", "COZULDU"].includes(desired)) {
          return res.status(400).json({ error: "INVALID_STATUS" });
        }
        next.status = desired;
      }
      if (Object.prototype.hasOwnProperty.call(patch, "resolvedNote")) {
        next.resolved_note = String(patch.resolvedNote || "");
      }
    }

    if (["COZULDU", "KAPANDI"].includes(next.status)) {
      next.resolved_at = nowISO();
    }

    const updatedAt = nowISO();

    await run(
      `
      UPDATE tickets
      SET assigned_to = ?, status = ?, resolved_at = ?, resolved_note = ?, updated_at = ?
      WHERE id = ?
    `,
      [
        next.assigned_to,
        next.status,
        next.resolved_at,
        next.resolved_note,
        updatedAt,
        ticketId
      ]
    );

    const updated = await get("SELECT * FROM tickets WHERE id = ?", [ticketId]);
    const ticket = mapTicket(updated);

    if (row.assigned_to !== next.assigned_to) {
      const message = next.assigned_to
        ? `Personel atandı (ID: ${next.assigned_to})`
        : "Atama kaldırıldı";
      const event = await addEvent(ticketId, req.user.id, "ASSIGN", message);
      io.emit("event:created", event);
    }

    if (row.status !== next.status) {
      const event = await addEvent(ticketId, req.user.id, "STATUS", `Durum: ${next.status}`);
      io.emit("event:created", event);
    }

    if (next.resolved_note && next.resolved_note !== row.resolved_note) {
      const event = await addEvent(ticketId, req.user.id, "COMMENT", `Çözüm Notu: ${next.resolved_note}`);
      io.emit("event:created", event);
    }

    io.emit("ticket:updated", ticket);
    await addAudit("TICKET_UPDATE", req.user.id, { ticketId });

    return res.json({ ticket });
  } catch (err) {
    return next(err);
  }
});

app.delete("/api/tickets/:id", authRequired, requireRole("SAKIN"), async (req, res, next) => {
  try {
    const ticketId = Number(req.params.id);
    if (!ticketId) return res.status(400).json({ error: "INVALID_ID" });

    const row = await get("SELECT * FROM tickets WHERE id = ?", [ticketId]);
    if (!row) return res.status(404).json({ error: "NOT_FOUND" });
    if (row.created_by !== req.user.id) return res.status(403).json({ error: "FORBIDDEN" });
    if (["COZULDU", "KAPANDI"].includes(row.status)) {
      return res.status(400).json({ error: "CANNOT_DELETE" });
    }

    await run("DELETE FROM tickets WHERE id = ?", [ticketId]);
    io.emit("ticket:deleted", { id: ticketId });
    await addAudit("TICKET_DELETE", req.user.id, { ticketId });

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

app.get("/api/events", authRequired, async (req, res, next) => {
  try {
    const ticketId = Number(req.query.ticketId);
    if (!ticketId) return res.status(400).json({ error: "INVALID_ID" });

    const ticket = await get("SELECT * FROM tickets WHERE id = ?", [ticketId]);
    if (!ticket) return res.status(404).json({ error: "NOT_FOUND" });

    if (req.user.role === "PERSONEL" && ticket.assigned_to !== req.user.id) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }
    if (req.user.role === "SAKIN" && ticket.created_by !== req.user.id) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    const rows = await all(
      "SELECT * FROM events WHERE ticket_id = ? ORDER BY created_at ASC",
      [ticketId]
    );

    return res.json({ events: rows.map(mapEvent) });
  } catch (err) {
    return next(err);
  }
});

app.get("/api/tickets/:id/attachments", authRequired, async (req, res, next) => {
  try {
    const ticketId = Number(req.params.id);
    if (!ticketId) return res.status(400).json({ error: "INVALID_ID" });

    const ticket = await get("SELECT * FROM tickets WHERE id = ?", [ticketId]);
    if (!ticket) return res.status(404).json({ error: "NOT_FOUND" });
    if (!canAccessTicket(req.user, ticket)) return res.status(403).json({ error: "FORBIDDEN" });

    const rows = await all(
      "SELECT * FROM attachments WHERE ticket_id = ? ORDER BY created_at ASC",
      [ticketId]
    );
    return res.json({ attachments: rows.map(mapAttachment) });
  } catch (err) {
    return next(err);
  }
});

app.post(
  "/api/tickets/:id/attachments",
  authRequired,
  upload.single("file"),
  async (req, res, next) => {
    try {
      const ticketId = Number(req.params.id);
      if (!ticketId) return res.status(400).json({ error: "INVALID_ID" });
      if (!req.file) return res.status(400).json({ error: "NO_FILE" });

      const ticket = await get("SELECT * FROM tickets WHERE id = ?", [ticketId]);
      if (!ticket) return res.status(404).json({ error: "NOT_FOUND" });
      if (!canAccessTicket(req.user, ticket)) return res.status(403).json({ error: "FORBIDDEN" });

      const createdAt = nowISO();
      const result = await run(
        `\n        INSERT INTO attachments (ticket_id, uploaded_by, original_name, file_name, mime, size, created_at)\n        VALUES (?, ?, ?, ?, ?, ?, ?)\n      `,
        [
          ticketId,
          req.user.id,
          req.file.originalname,
          req.file.filename,
          req.file.mimetype,
          req.file.size,
          createdAt
        ]
      );

      const row = await get("SELECT * FROM attachments WHERE id = ?", [result.lastID]);
      await addAudit("ATTACHMENT_UPLOAD", req.user.id, { ticketId, attachmentId: result.lastID });
      io.emit("attachment:created", { ticketId, attachment: mapAttachment(row) });

      return res.json({ attachment: mapAttachment(row) });
    } catch (err) {
      return next(err);
    }
  }
);

app.get("/api/reports/summary", authRequired, requireRole("YONETICI"), async (req, res, next) => {
  try {
    const allTickets = await all("SELECT * FROM tickets");
    const total = allTickets.length;
    const open = allTickets.filter(t => t.status === "ACIK" || t.status === "INCELEMEDE").length;
    const assigned = allTickets.filter(t => t.status === "ATANDI").length;
    const done = allTickets.filter(t => t.status === "COZULDU" || t.status === "KAPANDI").length;

    const resolved = allTickets.filter(t => (t.status === "COZULDU" || t.status === "KAPANDI") && t.resolved_at);
    const hours = resolved
      .map(t => (new Date(t.resolved_at) - new Date(t.created_at)) / 36e5)
      .filter(x => Number.isFinite(x) && x >= 0);
    const avgResolution = hours.length ? (hours.reduce((a, b) => a + b, 0) / hours.length) : null;
    const slaOk = hours.filter(h => h <= 48).length;

    const overdue = allTickets.filter(t => {
      if (["COZULDU", "KAPANDI", "IPTAL"].includes(t.status)) return false;
      const ageHours = (Date.now() - new Date(t.created_at).getTime()) / 36e5;
      return ageHours > 48;
    }).length;

    return res.json({
      total,
      open,
      assigned,
      done,
      avgResolution,
      slaOk,
      slaTotal: hours.length,
      overdue
    });
  } catch (err) {
    return next(err);
  }
});

app.get("/api/reports/top-staff", authRequired, requireRole("YONETICI"), async (req, res, next) => {
  try {
    const rows = await all(
      `
      SELECT u.id, u.full_name, u.email,
             COUNT(r.id) AS ratings_count,
             AVG(r.stars) AS avg_stars
      FROM ratings r
      JOIN tickets t ON t.id = r.ticket_id
      JOIN users u ON u.id = t.assigned_to
      WHERE u.role = 'PERSONEL'
      GROUP BY u.id
      ORDER BY avg_stars DESC, ratings_count DESC
      LIMIT 5
    `
    );

    const staff = rows.map(row => ({
      id: row.id,
      full_name: row.full_name,
      email: row.email,
      ratings_count: Number(row.ratings_count || 0),
      avg_stars: row.avg_stars ? Number(row.avg_stars) : 0
    }));

    return res.json({ staff });
  } catch (err) {
    return next(err);
  }
});

app.get("/api/search/tickets", authRequired, async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.json({ tickets: [] });
    const like = `%${q}%`;

    let rows = [];
    if (req.user.role === "YONETICI") {
      rows = await all(
        `\n        SELECT * FROM tickets\n        WHERE ticket_no LIKE ? OR title LIKE ? OR description LIKE ? OR category LIKE ?\n        ORDER BY created_at DESC\n      `,
        [like, like, like, like]
      );
    } else if (req.user.role === "PERSONEL") {
      rows = await all(
        `\n        SELECT * FROM tickets\n        WHERE assigned_to = ? AND (ticket_no LIKE ? OR title LIKE ? OR description LIKE ? OR category LIKE ?)\n        ORDER BY created_at DESC\n      `,
        [req.user.id, like, like, like, like]
      );
    } else {
      rows = await all(
        `\n        SELECT * FROM tickets\n        WHERE created_by = ? AND (ticket_no LIKE ? OR title LIKE ? OR description LIKE ? OR category LIKE ?)\n        ORDER BY created_at DESC\n      `,
        [req.user.id, like, like, like, like]
      );
    }

    return res.json({ tickets: rows.map(mapTicket) });
  } catch (err) {
    return next(err);
  }
});

app.get("/api/audit", authRequired, requireRole("YONETICI"), async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit || 50), 200);
    const rows = await all(
      "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?",
      [limit]
    );
    return res.json({ items: rows.map(mapAudit) });
  } catch (err) {
    return next(err);
  }
});

app.get("/api/announcements", authRequired, async (req, res, next) => {
  try {
    let rows = [];
    if (req.user.role === "YONETICI") {
      rows = await all("SELECT * FROM announcements ORDER BY created_at DESC");
    } else {
      rows = await all(
        "SELECT * FROM announcements WHERE is_published = 1 ORDER BY created_at DESC"
      );
    }
    const now = Date.now();
    const filtered = rows.filter((row) => {
      if (row.expires_at) return new Date(row.expires_at).getTime() > now;
      const created = new Date(row.created_at).getTime();
      return created + 48 * 36e5 > now;
    });
    return res.json({
      announcements: (req.user.role === "YONETICI" ? rows : filtered).map(mapAnnouncement)
    });
  } catch (err) {
    return next(err);
  }
});

app.get("/api/public/announcements", async (req, res, next) => {
  try {
    const rows = await all(
      "SELECT * FROM announcements WHERE is_published = 1 ORDER BY created_at DESC"
    );
    const now = Date.now();
    const filtered = rows.filter((row) => {
      if (row.expires_at) return new Date(row.expires_at).getTime() > now;
      const created = new Date(row.created_at).getTime();
      return created + 48 * 36e5 > now;
    });
    return res.json({ announcements: filtered.map(mapAnnouncement) });
  } catch (err) {
    return next(err);
  }
});

app.post("/api/announcements", authRequired, requireRole("YONETICI"), maybeUpload("image"), async (req, res, next) => {
  try {
    const { title, body, expiresHours } = req.body || {};
    if (!title || !body) return res.status(400).json({ error: "MISSING_FIELDS" });

    const createdAt = nowISO();
    const hours = Math.max(1, Number(expiresHours || 48));
    const expiresAt = new Date(Date.now() + hours * 36e5).toISOString();
    const imagePath = req.file ? req.file.filename : null;
    const result = await run(
      "INSERT INTO announcements (title, body, created_by, created_at, is_published, expires_at, image_path) VALUES (?, ?, ?, ?, 1, ?, ?)",
      [title, body, req.user.id, createdAt, expiresAt, imagePath]
    );

    const row = await get("SELECT * FROM announcements WHERE id = ?", [result.lastID]);
    const announcement = mapAnnouncement(row);
    io.emit("announcement:created", announcement);
    await addAudit("ANNOUNCEMENT_CREATE", req.user.id, { announcementId: announcement.id });

    return res.json({ announcement });
  } catch (err) {
    return next(err);
  }
});

app.delete("/api/announcements/:id", authRequired, requireRole("YONETICI"), async (req, res, next) => {
  try {
    const annId = Number(req.params.id);
    if (!annId) return res.status(400).json({ error: "INVALID_ID" });

    await run("DELETE FROM announcements WHERE id = ?", [annId]);
    io.emit("announcement:deleted", { id: annId });
    await addAudit("ANNOUNCEMENT_DELETE", req.user.id, { announcementId: annId });

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

app.get("/api/ratings", authRequired, async (req, res, next) => {
  try {
    const rows = await all(
      "SELECT * FROM ratings WHERE user_id = ? ORDER BY created_at DESC",
      [req.user.id]
    );
    return res.json({ ratings: rows.map(mapRating) });
  } catch (err) {
    return next(err);
  }
});

app.post("/api/ratings", authRequired, requireRole("SAKIN"), async (req, res, next) => {
  try {
    const { ticketId, stars, note } = req.body || {};
    const id = Number(ticketId);
    if (!id || !stars) return res.status(400).json({ error: "MISSING_FIELDS" });
    if (Number(stars) < 1 || Number(stars) > 5) {
      return res.status(400).json({ error: "INVALID_STARS" });
    }

    const ticket = await get("SELECT * FROM tickets WHERE id = ?", [id]);
    if (!ticket) return res.status(404).json({ error: "NOT_FOUND" });
    if (ticket.created_by !== req.user.id) return res.status(403).json({ error: "FORBIDDEN" });
    if (!["COZULDU", "KAPANDI"].includes(ticket.status)) {
      return res.status(400).json({ error: "NOT_RESOLVED" });
    }

    const createdAt = nowISO();
    await run(
      `
      INSERT INTO ratings (ticket_id, user_id, stars, note, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(ticket_id, user_id)
      DO UPDATE SET stars = excluded.stars, note = excluded.note, created_at = excluded.created_at
    `,
      [id, req.user.id, Number(stars), String(note || ""), createdAt]
    );

    const row = await get(
      "SELECT * FROM ratings WHERE ticket_id = ? AND user_id = ?",
      [id, req.user.id]
    );

    await addAudit("RATING_SAVE", req.user.id, { ticketId: id, stars: Number(stars) });
    return res.json({ rating: mapRating(row) });
  } catch (err) {
    return next(err);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "SERVER_ERROR" });
});

initDb()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`SSY backend running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to init DB", err);
    process.exit(1);
  });

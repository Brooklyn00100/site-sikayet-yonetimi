/* =========================================================
   admin.js — Yönetici Paneli (API + Realtime)
   No common.js needed
   + Detail modal with timeline
   + Modal scrollable/adaptive
   ========================================================= */

const el = (id) => document.getElementById(id);

const state = {
  me: null,
  users: [],
  tickets: [],
  announcements: [],
  report: null,
  topStaff: [],
  searchResults: null,
  searchQuery: ""
};

/* ---------- helpers ---------- */
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(type, title, msg) {
  const area = el("toastArea");
  if (!area) return alert(`${title}\n${msg}`);

  const icon = type === "success" ? "✓" : type === "danger" ? "!" : type === "warning" ? "!" : "i";
  const t = document.createElement("div");
  t.className = `toast ${type || "info"}`;
  t.innerHTML = `
    <div class="icon">${icon}</div>
    <div>
      <p class="t-title">${escapeHtml(title)}</p>
      <p class="t-msg">${escapeHtml(msg)}</p>
    </div>
  `;
  area.appendChild(t);

  setTimeout(() => {
    t.style.opacity = "0";
    t.style.transform = "translateY(6px)";
    setTimeout(() => t.remove(), 250);
  }, 3200);
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("tr-TR", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    });
  } catch { return iso; }
}

function priorityText(p) {
  switch (p) {
    case "ACIL": return "Acil";
    case "YUKSEK": return "Yüksek";
    case "NORMAL": return "Normal";
    case "DUSUK": return "Düşük";
    default: return p;
  }
}

function statusBadge(status) {
  switch (status) {
    case "ACIK": return `<span class="badge dot info">Açık</span>`;
    case "INCELEMEDE": return `<span class="badge dot warning">İncelemede</span>`;
    case "ATANDI": return `<span class="badge dot">Atandı</span>`;
    case "COZULDU": return `<span class="badge dot success">Çözüldü</span>`;
    case "KAPANDI": return `<span class="badge dot success">Kapandı</span>`;
    case "IPTAL": return `<span class="badge dot danger">İptal</span>`;
    default: return `<span class="badge dot">${escapeHtml(status)}</span>`;
  }
}

/* ---------- API ---------- */
async function api(path, { method = "GET", body = null } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : null,
    credentials: "include"
  });

  let data = null;
  try { data = await res.json(); } catch (e) {}

  if (!res.ok) {
    const err = (data && data.error) ? data.error : `HTTP_${res.status}`;
    const message = (data && data.message) ? data.message : null;
    return { ok: false, status: res.status, error: err, message, data };
  }

  return { ok: true, status: res.status, data };
}

function dashByRole(role) {
  if (role === "PERSONEL") return "staff.html";
  if (role === "SAKIN") return "resident.html";
  return "admin.html";
}

async function requireAdmin() {
  const r = await api("/api/me");
  if (!r.ok || !r.data?.user) {
    location.href = "auth.html";
    return null;
  }
  const user = r.data.user;
  if (user.role !== "YONETICI") {
    location.href = dashByRole(user.role);
    return null;
  }
  state.me = user;
  return user;
}

async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch {}
  location.href = "auth.html";
}

async function fetchUsers() {
  const r = await api("/api/users");
  if (!r.ok) throw new Error(r.error || "LOAD_FAILED");
  return r.data.users || [];
}

async function fetchTickets() {
  const r = await api("/api/tickets");
  if (!r.ok) throw new Error(r.error || "LOAD_FAILED");
  return r.data.tickets || [];
}

async function fetchAnnouncements() {
  const r = await api("/api/announcements");
  if (!r.ok) throw new Error(r.error || "LOAD_FAILED");
  return r.data.announcements || [];
}

async function fetchReport() {
  const r = await api("/api/reports/summary");
  if (!r.ok) throw new Error(r.error || "LOAD_FAILED");
  return r.data;
}

async function searchTickets(query) {
  const r = await api(`/api/search/tickets?q=${encodeURIComponent(query)}`);
  if (!r.ok) throw new Error(r.error || "SEARCH_FAILED");
  return r.data.tickets || [];
}

async function fetchTopStaff() {
  const r = await api("/api/reports/top-staff");
  if (!r.ok) throw new Error(r.error || "LOAD_FAILED");
  return r.data.staff || [];
}

async function fetchEvents(ticketId) {
  const r = await api(`/api/events?ticketId=${encodeURIComponent(ticketId)}`);
  if (!r.ok) throw new Error(r.error || "LOAD_FAILED");
  return r.data.events || [];
}

async function fetchAttachments(ticketId) {
  const r = await api(`/api/tickets/${ticketId}/attachments`);
  if (!r.ok) throw new Error(r.error || "LOAD_FAILED");
  return r.data.attachments || [];
}

async function updateTicket(ticketId, patch) {
  const r = await api(`/api/tickets/${ticketId}`, { method: "PATCH", body: patch });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, ticket: r.data.ticket };
}

async function createAnnouncement({ title, body, expiresHours, imageFile }) {
  const form = new FormData();
  form.append("title", title);
  form.append("body", body);
  form.append("expiresHours", String(expiresHours || 48));
  if (imageFile) form.append("image", imageFile);

  const res = await fetch("/api/announcements", {
    method: "POST",
    body: form,
    credentials: "include"
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) return { ok: false, error: (data && data.error) || `HTTP_${res.status}` };
  return { ok: true, announcement: data.announcement };
}

async function updateUser(userId, patch) {
  const r = await api(`/api/users/${userId}`, { method: "PATCH", body: patch });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, user: r.data.user };
}

async function deleteAnnouncement(annId) {
  const r = await api(`/api/announcements/${annId}`, { method: "DELETE" });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true };
}

/* ---------- Modal UI (scrollable/adaptive) ---------- */
function openModal({
  title,
  subtitle = "Şikayet detayları ve süreç geçmişi",
  bodyHtml,
  primaryText = "Kapat",
  onPrimary
}) {
  const existing = document.getElementById("ssyModalOverlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "ssyModalOverlay";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(15,23,42,0.55)";
  overlay.style.backdropFilter = "blur(6px)";
  overlay.style.zIndex = "9999";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.padding = "18px";

  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.style.width = "min(860px, 100%)";
  wrap.style.boxShadow = "0 20px 60px rgba(15,23,42,0.25)";

  wrap.style.maxHeight = "85vh";
  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";

  wrap.innerHTML = `
    <div class="card-head" style="flex: 0 0 auto;">
      <div>
        <h2>${escapeHtml(title)}</h2>
        <div class="sub">${escapeHtml(subtitle)}</div>
      </div>
      <button class="btn small" id="modalX" type="button">Kapat</button>
    </div>

    <div class="card-body" style="flex: 1 1 auto; overflow-y: auto; max-height: calc(85vh - 120px);">
      ${bodyHtml}
    </div>

    <div class="card-body" style="flex: 0 0 auto; padding-top: 0;">
      <div style="display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap;">
        <button class="btn primary" id="modalPrimary" type="button">${escapeHtml(primaryText)}</button>
      </div>
    </div>
  `;

  overlay.appendChild(wrap);
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  wrap.querySelector("#modalX").addEventListener("click", close);
  wrap.querySelector("#modalPrimary").addEventListener("click", async () => {
    const ok = await onPrimary?.();
    if (ok !== false) close();
  });

  window.addEventListener("keydown", function escOnce(ev) {
    if (ev.key === "Escape") {
      window.removeEventListener("keydown", escOnce);
      close();
    }
  });
}

/* ---------- ui helpers ---------- */
function userById(id, users) {
  return users.find(u => u.id === id) || null;
}

function userLabelCompact(u) {
  if (!u) return `<span class="hint">—</span>`;
  return `<div style="font-weight:950;">${escapeHtml(u.full_name || "Kullanıcı")}</div>
          <div class="muted">${escapeHtml(u.email || "")}</div>
          <div class="muted">${escapeHtml(u.role || "")}</div>`;
}

function creatorLabel(ticket, users) {
  const u = userById(ticket.createdBy, users);
  return userLabelCompact(u);
}

function assigneeLabel(ticket, users) {
  const u = ticket.assignedTo ? userById(ticket.assignedTo, users) : null;
  return u ? userLabelCompact(u) : `<span class="hint">—</span>`;
}

function setWho(me) {
  el("whoName").textContent = me.full_name || "Yönetici";
  el("whoMeta").textContent = me.email || "—";
}

/* ---------- stats + analytics ---------- */
function computeStats(all) {
  const total = all.length;
  const open = all.filter(t => t.status === "ACIK" || t.status === "INCELEMEDE").length;
  const assigned = all.filter(t => t.status === "ATANDI").length;
  const done = all.filter(t => t.status === "COZULDU" || t.status === "KAPANDI").length;

  el("statTotal").textContent = total;
  el("statOpen").textContent = open;
  el("statAssigned").textContent = assigned;
  el("statDone").textContent = done;

  el("countAll").textContent = total;
}

function computeAnalytics(all) {
  const byCat = {};
  for (const t of all) {
    byCat[t.category] = (byCat[t.category] || 0) + 1;
  }
  const top = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3);
  el("topCategories").innerHTML = top.length
    ? top.map(([c, n]) => `• <b>${escapeHtml(c)}</b>: ${n}`).join("<br/>")
    : "—";

  const resolved = all.filter(t => (t.status === "COZULDU" || t.status === "KAPANDI") && t.resolvedAt);
  if (resolved.length === 0) {
    el("avgResolution").textContent = "—";
    el("sla48").textContent = "—";
    return;
  }

  const hours = resolved
    .map(t => (new Date(t.resolvedAt) - new Date(t.createdAt)) / 36e5)
    .filter(x => Number.isFinite(x) && x >= 0);

  const avg = hours.reduce((a, b) => a + b, 0) / hours.length;
  el("avgResolution").textContent = `${avg.toFixed(1)} saat`;

  const slaOK = hours.filter(h => h <= 48).length;
  const pct = (slaOK / hours.length) * 100;
  el("sla48").textContent = `${slaOK}/${hours.length} (%${pct.toFixed(0)})`;
}

function renderReport() {
  if (!state.report) return;
  const { avgResolution, slaOk, slaTotal, overdue } = state.report;

  if (Number.isFinite(avgResolution)) {
    el("avgResolution").textContent = `${avgResolution.toFixed(1)} saat`;
  }
  if (slaTotal > 0) {
    const pct = (slaOk / slaTotal) * 100;
    el("sla48").textContent = `${slaOk}/${slaTotal} (%${pct.toFixed(0)})`;
    el("reportSlaRate").textContent = `%${pct.toFixed(0)}`;
    el("reportSlaTotal").textContent = `${slaTotal} kayıt`;
  } else {
    el("reportSlaRate").textContent = "—";
    el("reportSlaTotal").textContent = "—";
  }
  el("reportOverdue").textContent = String(overdue ?? "—");
}
/* ---------- filters ---------- */
function renderAssigneeFilter(staff) {
  const sel = el("filterAssignee");
  const current = sel.value;
  sel.innerHTML = `<option value="">Tüm Personel</option>` +
    staff.map(s => `<option value="${s.id}">${escapeHtml(s.full_name)} (${escapeHtml(s.email)})</option>`).join("");
  sel.value = current;
}

function applyFilters(all, users) {
  const q = (el("searchInput")?.value || "").trim().toLowerCase();
  const st = (el("filterStatus")?.value || "");
  const cat = (el("filterCategory")?.value || "");
  const asg = (el("filterAssignee")?.value || "");

  return all.filter(t => {
    const creator = userById(t.createdBy, users);
    const assignee = t.assignedTo ? userById(t.assignedTo, users) : null;

    const hay = [
      t.ticketNo, t.title, t.category, t.description, t.status, priorityText(t.priority),
      creator?.full_name, creator?.email,
      assignee?.full_name, assignee?.email
    ].filter(Boolean).join(" ").toLowerCase();

    if (q && !hay.includes(q)) return false;
    if (st && t.status !== st) return false;
    if (cat && t.category !== cat) return false;
    if (asg && String(t.assignedTo || "") !== String(asg)) return false;
    return true;
  });
}

function isDoneStatus(status) {
  return ["COZULDU", "KAPANDI", "IPTAL"].includes(status);
}

/* ---------- table render ---------- */
function renderTable(list, users, staff) {
  const tbody = el("ticketsTbody");
  const empty = el("emptyState");
  if (!tbody || !empty) return;
  tbody.innerHTML = "";

  if (list.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  for (const t of list) {
    const staffOptions = [`<option value="">Personel Ata</option>`]
      .concat(staff.map(s => `<option value="${s.id}" ${t.assignedTo === s.id ? "selected" : ""}>${escapeHtml(s.full_name)}</option>`))
      .join("");

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div style="font-weight:900;">${escapeHtml(t.ticketNo)}</div>
        <div class="muted">#${t.id}</div>
      </td>

      <td>
        <div style="font-weight:900;">${escapeHtml(t.title)}</div>
        <div class="muted">${escapeHtml(String(t.description || "").slice(0, 80))}${String(t.description || "").length > 80 ? "…" : ""}</div>
      </td>

      <td>${escapeHtml(t.category)}</td>
      <td>${escapeHtml(priorityText(t.priority))}</td>
      <td>${statusBadge(t.status)}</td>

      <td>${creatorLabel(t, users)}</td>
      <td>${assigneeLabel(t, users)}</td>

      <td>
        <div style="font-weight:800;">${escapeHtml(formatDate(t.createdAt))}</div>
        <div class="muted">Güncelleme: ${escapeHtml(formatDate(t.updatedAt))}</div>
      </td>

      <td>
        <div style="display:flex; flex-direction:column; gap:8px; min-width:220px;">
          <button class="btn small" data-action="detail" data-id="${t.id}">Detay + Timeline</button>

          <select class="select" data-action="assign" data-id="${t.id}">
            ${staffOptions}
          </select>

          <select class="select" data-action="status" data-id="${t.id}">
            <option value="ACIK" ${t.status === "ACIK" ? "selected" : ""}>Açık</option>
            <option value="INCELEMEDE" ${t.status === "INCELEMEDE" ? "selected" : ""}>İncelemede</option>
            <option value="ATANDI" ${t.status === "ATANDI" ? "selected" : ""}>Atandı</option>
            <option value="COZULDU" ${t.status === "COZULDU" ? "selected" : ""}>Çözüldü</option>
            <option value="KAPANDI" ${t.status === "KAPANDI" ? "selected" : ""}>Kapandı</option>
            <option value="IPTAL" ${t.status === "IPTAL" ? "selected" : ""}>İptal</option>
          </select>

          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn small primary" data-action="close" data-id="${t.id}">Kapandı</button>
            <button class="btn small danger" data-action="cancel" data-id="${t.id}">İptal</button>
          </div>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

function renderArchive(list, users, staff) {
  const tbody = el("ticketsArchiveTbody");
  const empty = el("emptyArchive");
  if (!tbody || !empty) return;
  tbody.innerHTML = "";

  if (list.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  for (const t of list) {
    const staffOptions = [`<option value="">Personel Ata</option>`]
      .concat(staff.map(s => `<option value="${s.id}" ${t.assignedTo === s.id ? "selected" : ""}>${escapeHtml(s.full_name)}</option>`))
      .join("");

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div style="font-weight:900;">${escapeHtml(t.ticketNo)}</div>
        <div class="muted">#${t.id}</div>
      </td>

      <td>
        <div style="font-weight:900;">${escapeHtml(t.title)}</div>
        <div class="muted">${escapeHtml(String(t.description || "").slice(0, 80))}${String(t.description || "").length > 80 ? "…" : ""}</div>
      </td>

      <td>${escapeHtml(t.category)}</td>
      <td>${escapeHtml(priorityText(t.priority))}</td>
      <td>${statusBadge(t.status)}</td>

      <td>${creatorLabel(t, users)}</td>
      <td>${assigneeLabel(t, users)}</td>

      <td>
        <div style="font-weight:800;">${escapeHtml(formatDate(t.createdAt))}</div>
        <div class="muted">Güncelleme: ${escapeHtml(formatDate(t.updatedAt))}</div>
      </td>

      <td>
        <div style="display:flex; flex-direction:column; gap:8px; min-width:220px;">
          <button class="btn small" data-action="detail" data-id="${t.id}">Detay + Timeline</button>

          <select class="select" data-action="assign" data-id="${t.id}">
            ${staffOptions}
          </select>

          <select class="select" data-action="status" data-id="${t.id}">
            <option value="ACIK" ${t.status === "ACIK" ? "selected" : ""}>Açık</option>
            <option value="INCELEMEDE" ${t.status === "INCELEMEDE" ? "selected" : ""}>İncelemede</option>
            <option value="ATANDI" ${t.status === "ATANDI" ? "selected" : ""}>Atandı</option>
            <option value="COZULDU" ${t.status === "COZULDU" ? "selected" : ""}>Çözüldü</option>
            <option value="KAPANDI" ${t.status === "KAPANDI" ? "selected" : ""}>Kapandı</option>
            <option value="IPTAL" ${t.status === "IPTAL" ? "selected" : ""}>İptal</option>
          </select>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

/* ---------- timeline + detail modal ---------- */
function eventBadge(type) {
  if (type === "STATUS") return `<span class="badge dot info">Durum</span>`;
  if (type === "ASSIGN") return `<span class="badge dot warning">Atama</span>`;
  if (type === "COMMENT") return `<span class="badge dot success">Not</span>`;
  return `<span class="badge dot">Olay</span>`;
}

function buildTimelineHtml(events, users) {
  if (events.length === 0) {
    return `<div class="hint">Henüz timeline kaydı yok.</div>`;
  }

  return `
    <div class="col" style="gap:10px;">
      ${events.map(ev => {
        const actor = userById(ev.actorId, users);
        const who = actor ? `${actor.full_name} (${actor.role})` : "Sistem";
        return `
          <div class="card soft" style="box-shadow:none;">
            <div class="card-body">
              <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
                <div>
                  <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                    ${eventBadge(ev.type)}
                    <div style="font-weight:950;">${escapeHtml(ev.message || "")}</div>
                  </div>
                  <div class="muted" style="margin-top:6px;">
                    ${escapeHtml(who)} • ${escapeHtml(formatDate(ev.createdAt))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

async function showDetailModal(t, users) {
  let events = [];
  try {
    events = await fetchEvents(t.id);
  } catch {
    events = [];
  }

  let attachments = [];
  try {
    attachments = await fetchAttachments(t.id);
  } catch {
    attachments = [];
  }
  const filesHtml = attachments.length
    ? `<ul>${attachments.map(a => `<li><a href="/uploads/${encodeURIComponent(a.fileName)}" target="_blank" rel="noopener">${escapeHtml(a.originalName)}</a></li>`).join("")}</ul>`
    : `<div class="hint">Ek dosya yok.</div>`;

  const creator = userById(t.createdBy, users);
  const assignee = t.assignedTo ? userById(t.assignedTo, users) : null;

  const timelineCount = events.length;

  openModal({
    title: `Detay — ${t.ticketNo}`,
    subtitle: "Şikayet detayları ve süreç geçmişi",
    primaryText: "Kapat",
    onPrimary: async () => true,
    bodyHtml: `
      <div class="grid-2">
        <div class="card soft" style="box-shadow:none;">
          <div class="card-body">
            <div class="label">Durum</div>
            <div style="margin-top:8px;">${statusBadge(t.status)}</div>

            <div style="height:10px;"></div>
            <div class="label">Kategori / Öncelik</div>
            <div class="hint" style="margin-top:6px;">
              <b>${escapeHtml(t.category)}</b> • <b>${escapeHtml(priorityText(t.priority))}</b>
            </div>

            <div style="height:10px;"></div>
            <div class="label">Tarih</div>
            <div class="hint" style="margin-top:6px;">
              Oluşturma: <b>${escapeHtml(formatDate(t.createdAt))}</b><br/>
              Güncelleme: <b>${escapeHtml(formatDate(t.updatedAt))}</b><br/>
              ${t.resolvedAt ? `Çözüm: <b>${escapeHtml(formatDate(t.resolvedAt))}</b>` : ""}
            </div>
          </div>
        </div>

        <div class="card soft" style="box-shadow:none;">
          <div class="card-body">
            <div class="label">Kişiler</div>
            <div style="height:8px;"></div>
            <div class="badge dot">Oluşturan</div>
            <div style="margin-top:8px;">${creator ? userLabelCompact(creator) : `<span class="hint">—</span>`}</div>

            <div style="height:10px;"></div>
            <div class="badge dot warning">Atanan</div>
            <div style="margin-top:8px;">${assignee ? userLabelCompact(assignee) : `<span class="hint">—</span>`}</div>
          </div>
        </div>
      </div>

      <div style="height:12px;"></div>

      <div class="card" style="box-shadow:none;">
        <div class="card-body">
          <div class="label">Başlık</div>
          <div style="font-weight:950; margin-top:6px;">${escapeHtml(t.title)}</div>

          <div style="height:10px;"></div>
          <div class="label">Açıklama</div>
          <div class="hint" style="margin-top:6px; white-space:pre-wrap;">${escapeHtml(t.description || "")}</div>

          ${t.resolvedNote ? `
            <div style="height:10px;"></div>
            <div class="label">Çözüm Notu</div>
            <div class="hint" style="margin-top:6px; white-space:pre-wrap;">${escapeHtml(t.resolvedNote)}</div>
          ` : ""}
        </div>
      </div>

      <div style="height:12px;"></div>

      <div class="card soft" style="box-shadow:none;">
        <div class="card-head">
          <div>
            <h2>Süreç Timeline</h2>
            <div class="sub">Atama, durum değişimi ve notlar</div>
          </div>
          <span class="badge dot info">${escapeHtml(String(timelineCount))}</span>
        </div>
        <div class="card-body">
          ${buildTimelineHtml(events, users)}
        </div>
      </div>

      <div style="height:12px;"></div>
      <div class="card soft" style="box-shadow:none;">
        <div class="card-head">
          <div>
            <h2>Ek Dosyalar</h2>
            <div class="sub">Şikayete eklenen dosyalar</div>
          </div>
        </div>
        <div class="card-body">
          ${filesHtml}
        </div>
      </div>
    `
  });
}

/* ---------- announcements ---------- */
function renderAnnouncements() {
  const ann = state.announcements.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10);
  el("countAnn").textContent = ann.length;
  el("annBadge").textContent = ann.length;

  const wrap = el("annList");
  wrap.innerHTML = "";

  if (ann.length === 0) {
    wrap.innerHTML = `<div class="hint">Henüz duyuru yok.</div>`;
    return;
  }

  for (const a of ann) {
    const expiresAt = a.expiresAt ? new Date(a.expiresAt) : null;
    const fallbackExpiry = new Date(new Date(a.createdAt).getTime() + 48 * 36e5);
    const effectiveExpiry = expiresAt || fallbackExpiry;
    const expired = effectiveExpiry.getTime() < Date.now();
    const hoursLeft = Math.max(0, (effectiveExpiry.getTime() - Date.now()) / 36e5);
    const item = document.createElement("div");
    item.className = "card";
    item.style.boxShadow = "none";
    item.innerHTML = `
      <div class="card-body">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
          <div>
            <div style="font-weight:950;">${escapeHtml(a.title)}</div>
            ${a.imagePath ? `<div style="margin-top:8px;"><img src="/uploads/${encodeURIComponent(a.imagePath)}" alt="" style="max-width:220px; border-radius:10px;" /></div>` : ""}
            <div class="hint" style="margin-top:6px; white-space:pre-wrap;">${escapeHtml(a.body)}</div>
            <div class="muted" style="margin-top:10px;">
              ${escapeHtml(formatDate(a.createdAt))}
              ${` • Süre: ${expired ? "Doldu" : `${hoursLeft.toFixed(1)} saat kaldı`}`}
            </div>
          </div>
          <button class="btn small danger" data-action="delAnn" data-id="${a.id}">Sil</button>
        </div>
      </div>
    `;
    wrap.appendChild(item);
  }
}

function renderUsers() {
  const tbody = el("usersTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const users = state.users.slice().sort((a, b) => b.id - a.id);
  el("countUsers").textContent = users.length;

  for (const u of users) {
    const active = Number(u.is_active) !== 0;
    const statusHtml = active
      ? '<span class="badge dot success">Aktif</span>'
      : '<span class="badge dot danger">Pasif</span>';
    const toggleLabel = active ? "Pasif Yap" : "Aktif Yap";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(String(u.id))}</td>
      <td>${escapeHtml(u.full_name || "")}</td>
      <td>${escapeHtml(u.email || "")}</td>
      <td>${escapeHtml(u.role || "")}</td>
      <td>${statusHtml}</td>
      <td>
        <button class="btn small ${active ? "danger" : "primary"}" data-action="toggleUser" data-id="${u.id}">
          ${toggleLabel}
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

function renderTopStaff() {
  const wrap = el("topStaffWrap");
  if (!wrap) return;
  wrap.innerHTML = "";

  if (!state.topStaff.length) {
    wrap.innerHTML = `<div class="hint">Henüz değerlendirme yok.</div>`;
    return;
  }

  const list = document.createElement("div");
  list.className = "col";
  list.style.gap = "10px";

  for (const s of state.topStaff) {
    const avg = Number(s.avg_stars || 0).toFixed(1);
    const count = Number(s.ratings_count || 0);
    const item = document.createElement("div");
    item.className = "card";
    item.style.boxShadow = "none";
    item.innerHTML = `
      <div class="card-body" style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
        <div>
          <div style="font-weight:950;">${escapeHtml(s.full_name || "Personel")}</div>
          <div class="muted">${escapeHtml(s.email || "")}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:900;">★ ${avg}</div>
          <div class="hint">${count} değerlendirme</div>
        </div>
      </div>
    `;
    list.appendChild(item);
  }

  wrap.appendChild(list);
}

/* ---------- bootstrap ---------- */
async function refreshAll() {
  try {
    const results = await Promise.allSettled([
      fetchUsers(),
      fetchTickets(),
      fetchAnnouncements(),
      fetchReport(),
      fetchTopStaff()
    ]);

    if (results[0].status === "fulfilled") state.users = results[0].value;
    if (results[1].status === "fulfilled") state.tickets = results[1].value;
    if (results[2].status === "fulfilled") state.announcements = results[2].value;
    if (results[3].status === "fulfilled") state.report = results[3].value;
    if (results[4].status === "fulfilled") state.topStaff = results[4].value;
    if (state.searchQuery && state.searchQuery.length >= 2) {
      try {
        state.searchResults = await searchTickets(state.searchQuery);
      } catch {
        state.searchResults = null;
      }
    }
    rerender();
  } catch (err) {
    toast("danger", "Hata", "Veriler yüklenemedi.");
  }
}

function rerender() {
  const users = state.users;
  const staff = users.filter(u => u.role === "PERSONEL" && u.is_active !== 0);

  computeStats(state.tickets);
  computeAnalytics(state.tickets);
  renderReport();

  renderAssigneeFilter(staff);

  const base = state.searchResults || state.tickets;
  const filtered = applyFilters(base, users);
  const activeOnly = filtered.filter(t => !isDoneStatus(t.status));
  const doneOnly = filtered.filter(t => isDoneStatus(t.status));
  renderTable(activeOnly, users, staff);
  renderArchive(doneOnly, users, staff);

  renderAnnouncements();
  renderUsers();
  renderTopStaff();
}

function setupRealtime() {
  if (!window.io) return;
  const socket = window.io();
  const refreshIfRelevant = () => refreshAll();
  socket.on("ticket:created", () => {
    toast("info", "Yeni Şikayet", "Yeni bir kayıt oluşturuldu.");
    refreshIfRelevant();
  });
  socket.on("ticket:updated", () => {
    toast("info", "Güncelleme", "Bir şikayet güncellendi.");
    refreshIfRelevant();
  });
  socket.on("ticket:deleted", refreshIfRelevant);
  socket.on("announcement:created", () => {
    toast("info", "Duyuru", "Yeni duyuru yayınlandı.");
    refreshIfRelevant();
  });
  socket.on("announcement:deleted", refreshIfRelevant);
  socket.on("attachment:created", refreshIfRelevant);
  socket.on("user:updated", refreshIfRelevant);
}

(async function init() {
  const me = await requireAdmin();
  if (!me) return;

  setWho(me);
  el("btnLogout")?.addEventListener("click", (e) => { e.preventDefault(); logout(); });

  ["searchInput", "filterStatus", "filterCategory", "filterAssignee"].forEach(id => {
    const node = el(id);
    if (!node) return;
    if (id === "searchInput") {
      let timer = null;
      node.addEventListener("input", () => {
        const q = node.value.trim();
        state.searchQuery = q;
        if (timer) clearTimeout(timer);
        timer = setTimeout(async () => {
          if (!q) {
            state.searchResults = null;
            rerender();
            return;
          }
          if (q.length < 2) return;
          try {
            state.searchResults = await searchTickets(q);
          } catch {
            state.searchResults = null;
          }
          rerender();
        }, 250);
      });
    } else {
      node.addEventListener("change", rerender);
    }
  });

  const ticketBodies = ["ticketsTbody", "ticketsArchiveTbody"];
  ticketBodies.forEach((id) => {
    el(id)?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const action = btn.dataset.action;
    const ticketId = Number(btn.dataset.id);
    if (!action || !ticketId) return;

    if (action === "detail") {
      const t = state.tickets.find(x => x.id === ticketId);
      if (!t) return toast("danger", "Hata", "Kayıt bulunamadı.");
      await showDetailModal(t, state.users);
      return;
    }

    if (action === "close") {
      const r = await updateTicket(ticketId, { status: "KAPANDI" });
      if (!r.ok) return toast("danger", "Hata", "İşlem başarısız.");
      toast("success", "Güncellendi", "Şikayet 'Kapandı' olarak güncellendi.");
      await refreshAll();
      return;
    }

    if (action === "cancel") {
      if (!confirm("Şikayeti 'İptal' yapmak istiyor musunuz?")) return;
      const r = await updateTicket(ticketId, { status: "IPTAL" });
      if (!r.ok) return toast("danger", "Hata", "İşlem başarısız.");
      toast("success", "Güncellendi", "Şikayet 'İptal' olarak güncellendi.");
      await refreshAll();
      return;
    }

    });
  });

  ticketBodies.forEach((id) => {
    el(id)?.addEventListener("change", async (e) => {
    const sel = e.target.closest("select");
    if (!sel) return;

    const action = sel.dataset.action;
    const ticketId = Number(sel.dataset.id);
    if (!action || !ticketId) return;

    if (action === "assign") {
      const staffId = Number(sel.value || 0) || null;
      const patch = staffId ? { assignedTo: staffId, status: "ATANDI" } : { assignedTo: null };
      const r = await updateTicket(ticketId, patch);
      if (!r.ok) return toast("danger", "Hata", "İşlem başarısız.");

      toast("success", "Atama", staffId ? "Personel atandı ve durum 'Atandı' yapıldı." : "Atama kaldırıldı.");
      await refreshAll();
      return;
    }

    if (action === "status") {
      const nextStatus = String(sel.value || "");
      const r = await updateTicket(ticketId, { status: nextStatus });
      if (!r.ok) return toast("danger", "Hata", "İşlem başarısız.");

      toast("success", "Güncellendi", "Durum güncellendi.");
      await refreshAll();
      return;
    }
    });
  });

  el("annList")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.dataset.action !== "delAnn") return;

    if (!confirm("Duyuruyu silmek istiyor musunuz?")) return;
    const r = await deleteAnnouncement(btn.dataset.id);
    if (!r.ok) return toast("danger", "Hata", "Silinemedi.");
    toast("success", "Silindi", "Duyuru silindi.");
    await refreshAll();
  });

  el("usersTbody")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.dataset.action !== "toggleUser") return;

    const userId = Number(btn.dataset.id);
    const user = state.users.find(u => u.id === userId);
    if (!user) return;

    const nextActive = Number(user.is_active) === 0 ? 1 : 0;
    if (!confirm(`Bu kullanıcıyı ${nextActive ? "aktif" : "pasif"} yapmak istiyor musunuz?`)) return;

    const r = await updateUser(userId, { is_active: nextActive });
    if (!r.ok) return toast("danger", "Hata", "Kullanıcı güncellenemedi.");
    toast("success", "Güncellendi", "Kullanıcı durumu güncellendi.");
    await refreshAll();
  });

  el("annForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const title = String(el("annTitle").value || "").trim();
    const body = String(el("annBody").value || "").trim();
    const expiresHours = Number(el("annExpiry")?.value || 48);
    const imageFile = el("annImage")?.files?.[0] || null;
    if (!title || !body) {
      toast("warning", "Eksik Bilgi", "Başlık ve içerik zorunludur.");
      return;
    }

    const r = await createAnnouncement({ title, body, expiresHours, imageFile });
    if (!r.ok) {
      toast("danger", "Hata", "Duyuru yayınlanamadı.");
      return;
    }

    el("annForm").reset();
    toast("success", "Yayınlandı", "Duyuru yayınlandı.");
    await refreshAll();
  });

  setupRealtime();
  await refreshAll();
})();

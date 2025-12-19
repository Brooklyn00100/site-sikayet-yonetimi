/* =========================================================
   staff.js — Personel Paneli (API + Realtime)
   UI: modal for "Çözüm Notu" (no prompt)
   ========================================================= */

const el = (id) => document.getElementById(id);

const state = {
  me: null,
  tickets: [],
  searchResults: null,
  searchQuery: ""
};

/* ---------- helpers ---------- */
function nowISO() { return new Date().toISOString(); }

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
    return d.toLocaleString("tr-TR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
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
  if (role === "YONETICI") return "admin.html";
  if (role === "SAKIN") return "resident.html";
  return "staff.html";
}

async function requirePersonel() {
  const r = await api("/api/me");
  if (!r.ok || !r.data?.user) {
    location.href = "auth.html";
    return null;
  }
  const user = r.data.user;
  if (user.role !== "PERSONEL") {
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

async function fetchTickets() {
  const r = await api("/api/tickets");
  if (!r.ok) throw new Error(r.error || "LOAD_FAILED");
  return r.data.tickets || [];
}

async function fetchAttachments(ticketId) {
  const r = await api(`/api/tickets/${ticketId}/attachments`);
  if (!r.ok) throw new Error(r.error || "LOAD_FAILED");
  return r.data.attachments || [];
}

async function searchTickets(query) {
  const r = await api(`/api/search/tickets?q=${encodeURIComponent(query)}`);
  if (!r.ok) throw new Error(r.error || "SEARCH_FAILED");
  return r.data.tickets || [];
}

async function updateTicket(ticketId, patch) {
  const r = await api(`/api/tickets/${ticketId}`, { method: "PATCH", body: patch });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, ticket: r.data.ticket };
}

/* ---------- Modal UI ---------- */
function openModal({ title, bodyHtml, primaryText = "Kaydet", onPrimary, secondaryText = "İptal", onSecondary }) {
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
  wrap.style.width = "min(720px, 100%)";
  wrap.style.boxShadow = "0 20px 60px rgba(15,23,42,0.25)";

  wrap.innerHTML = `
    <div class="card-head">
      <div>
        <h2>${escapeHtml(title)}</h2>
        <div class="sub">Bu işlem kayıt altında tutulur.</div>
      </div>
      <button class="btn small" id="modalX" type="button">Kapat</button>
    </div>
    <div class="card-body">
      ${bodyHtml}
      <div style="height:14px;"></div>
      <div style="display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap;">
        <button class="btn" id="modalSecondary" type="button">${escapeHtml(secondaryText)}</button>
        <button class="btn primary" id="modalPrimary" type="button">${escapeHtml(primaryText)}</button>
      </div>
    </div>
  `;

  overlay.appendChild(wrap);
  document.body.appendChild(overlay);

  const close = () => overlay.remove();

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  wrap.querySelector("#modalX").addEventListener("click", close);

  wrap.querySelector("#modalSecondary").addEventListener("click", () => {
    try { onSecondary?.(); } finally { close(); }
  });
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

async function openResolveModal(ticket, onDone) {
  let attachments = [];
  try { attachments = await fetchAttachments(ticket.id); } catch {}
  const filesHtml = attachments.length
    ? `<ul>${attachments.map(a => `<li><a href="/uploads/${encodeURIComponent(a.fileName)}" target="_blank" rel="noopener">${escapeHtml(a.originalName)}</a></li>`).join("")}</ul>`
    : `<div class="hint">Ek dosya yok.</div>`;

  openModal({
    title: `Çözüm Notu — ${ticket.ticketNo}`,
    primaryText: "Kaydet ve Çözüldü",
    onPrimary: async () => {
      const note = document.getElementById("solveNote").value.trim();
      const r = await updateTicket(ticket.id, { status: "COZULDU", resolvedNote: note || "" });
      if (!r.ok) {
        toast("danger", "Hata", "İşlem başarısız.");
        return false;
      }
      toast("success", "Tamamlandı", "Şikayet 'Çözüldü' olarak işaretlendi.");
      onDone?.();
      return true;
    },
    bodyHtml: `
      <div class="grid-2">
        <div class="card soft" style="box-shadow:none;">
          <div class="card-body">
            <div class="label">Başlık</div>
            <div style="font-weight:950; margin-top:6px;">${escapeHtml(ticket.title)}</div>
            <div class="hint" style="margin-top:10px;">Kategori: <b>${escapeHtml(ticket.category)}</b> • Öncelik: <b>${escapeHtml(priorityText(ticket.priority))}</b></div>
          </div>
        </div>
        <div class="card soft" style="box-shadow:none;">
          <div class="card-body">
            <div class="label">Açıklama</div>
            <div class="hint" style="margin-top:6px; white-space:pre-wrap;">${escapeHtml(ticket.description || "")}</div>
          </div>
        </div>
      </div>

      <div style="height:12px;"></div>
      <div class="card soft" style="box-shadow:none;">
        <div class="card-body">
          <div class="label">Ek Dosyalar</div>
          <div style="margin-top:6px;">${filesHtml}</div>
        </div>
      </div>
      <div style="height:12px;"></div>

      <div class="field">
        <div class="label">Çözüm Notu (isteğe bağlı)</div>
        <textarea class="textarea" id="solveNote" placeholder="Ne yapıldı? Hangi parça değişti? Tarih/saat vb."></textarea>
        <div class="hint">Bu not, yönetici ve sakin tarafından görülebilir.</div>
      </div>
    `
  });
}

/* ---------- ui ---------- */
function setWho(me) {
  el("whoName").textContent = me.full_name || "Personel";
  el("whoMeta").textContent = me.email || "—";
}

function computeStats(list) {
  const total = list.length;
  const inProg = list.filter(t => t.status === "ATANDI" || t.status === "INCELEMEDE").length;
  const done = list.filter(t => t.status === "COZULDU" || t.status === "KAPANDI").length;

  el("statTotal").textContent = total;
  el("statInProgress").textContent = inProg;
  el("statDone").textContent = done;
  el("countAssigned").textContent = total;
}

function applyFilters(list) {
  const q = (el("searchInput")?.value || "").trim().toLowerCase();
  const st = el("filterStatus")?.value || "";

  return list.filter(t => {
    const hay = `${t.ticketNo} ${t.title} ${t.category} ${priorityText(t.priority)} ${t.status}`.toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (st && t.status !== st) return false;
    return true;
  });
}

function renderTable(list) {
  const tbody = el("ticketsTbody");
  const empty = el("emptyState");
  tbody.innerHTML = "";

  if (list.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  for (const t of list) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div style="font-weight:900;">${escapeHtml(t.ticketNo)}</div>
        <div class="muted">#${escapeHtml(String(t.id))}</div>
      </td>
      <td>
        <div style="font-weight:900;">${escapeHtml(t.title)}</div>
        <div class="muted">${escapeHtml(String(t.description || "").slice(0, 80))}${String(t.description||"").length>80?"…":""}</div>
      </td>
      <td>${escapeHtml(t.category)}</td>
      <td>${escapeHtml(priorityText(t.priority))}</td>
      <td>${statusBadge(t.status)}</td>
      <td>
        <div style="font-weight:800;">${escapeHtml(formatDate(t.createdAt))}</div>
        <div class="muted">Güncelleme: ${escapeHtml(formatDate(t.updatedAt))}</div>
      </td>
      <td>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn small" data-action="detail" data-id="${t.id}">Detay</button>
          <button class="btn small" data-action="progress" data-id="${t.id}">İncelemede</button>
          <button class="btn small primary" data-action="resolve" data-id="${t.id}">Çözüldü</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

async function showDetail(t) {
  let attachments = [];
  try { attachments = await fetchAttachments(t.id); } catch {}
  const filesHtml = attachments.length
    ? `<ul>${attachments.map(a => `<li><a href="/uploads/${encodeURIComponent(a.fileName)}" target="_blank" rel="noopener">${escapeHtml(a.originalName)}</a></li>`).join("")}</ul>`
    : `<div class="hint">Ek dosya yok.</div>`;

  openModal({
    title: `Detay — ${t.ticketNo}`,
    primaryText: "Kapat",
    secondaryText: "—",
    onSecondary: () => {},
    onPrimary: async () => true,
    bodyHtml: `
      <div class="grid-2">
        <div class="card soft" style="box-shadow:none;">
          <div class="card-body">
            <div class="label">Durum</div>
            <div style="margin-top:8px;">${statusBadge(t.status)}</div>
            <div class="hint" style="margin-top:10px;">Kategori: <b>${escapeHtml(t.category)}</b></div>
            <div class="hint" style="margin-top:6px;">Öncelik: <b>${escapeHtml(priorityText(t.priority))}</b></div>
          </div>
        </div>
        <div class="card soft" style="box-shadow:none;">
          <div class="card-body">
            <div class="label">Tarih</div>
            <div class="hint" style="margin-top:8px;">Oluşturma: <b>${escapeHtml(formatDate(t.createdAt))}</b></div>
            <div class="hint" style="margin-top:6px;">Güncelleme: <b>${escapeHtml(formatDate(t.updatedAt))}</b></div>
            ${t.resolvedAt ? `<div class="hint" style="margin-top:6px;">Çözüm: <b>${escapeHtml(formatDate(t.resolvedAt))}</b></div>` : ""}
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
        <div class="card-body">
          <div class="label">Ek Dosyalar</div>
          <div style="margin-top:6px;">${filesHtml}</div>
        </div>
      </div>
    `
  });
}

function rerender() {
  const base = state.searchResults || state.tickets;
  computeStats(state.tickets);
  renderTable(applyFilters(base));
}

async function refresh() {
  try {
    state.tickets = await fetchTickets();
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

function setupRealtime() {
  if (!window.io) return;
  const socket = window.io();
  const refreshIfRelevant = () => refresh();
  socket.on("ticket:created", refreshIfRelevant);
  socket.on("ticket:updated", () => {
    toast("info", "Güncelleme", "Atanan şikayet güncellendi.");
    refreshIfRelevant();
  });
  socket.on("ticket:deleted", refreshIfRelevant);
  socket.on("attachment:created", refreshIfRelevant);
}

/* ---------- bootstrap ---------- */
(async function init() {
  const me = await requirePersonel();
  if (!me) return;

  setWho(me);
  el("btnLogout")?.addEventListener("click", (e) => { e.preventDefault(); logout(); });

  ["searchInput", "filterStatus"].forEach(id => {
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

  el("ticketsTbody")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const action = btn.dataset.action;
    const ticketId = Number(btn.dataset.id);
    if (!action || !ticketId) return;

    const t = state.tickets.find(x => x.id === ticketId);
    if (!t) return toast("danger", "Hata", "Kayıt bulunamadı veya size atanmadı.");

    if (action === "detail") {
      await showDetail(t);
      return;
    }

    if (action === "progress") {
      const r = await updateTicket(ticketId, { status: "INCELEMEDE" });
      if (!r.ok) return toast("danger", "Hata", "İşlem başarısız.");
      toast("success", "Güncellendi", "Durum 'İncelemede' olarak güncellendi.");
      await refresh();
      return;
    }

    if (action === "resolve") {
      if (t.status === "COZULDU" || t.status === "KAPANDI") {
        toast("info", "Bilgi", "Bu kayıt zaten çözüldü/kapatıldı.");
        return;
      }
      await openResolveModal(t, refresh);
      return;
    }
  });

  setupRealtime();
  await refresh();
})();

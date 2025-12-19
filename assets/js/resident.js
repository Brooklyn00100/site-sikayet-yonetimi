/* =========================================================
   resident.js — Sakin Paneli (API + Realtime)
   ========================================================= */

const el = (id) => document.getElementById(id);

const state = {
  me: null,
  tickets: [],
  ratings: [],
  announcements: [],
  searchResults: null,
  searchQuery: ""
};

/* ---------- Toast ---------- */
function toast(type, title, msg) {
  const area = el("toastArea");
  if (!area) return alert(`${title}\n${msg}`);

  const t = document.createElement("div");
  t.className = `toast ${type || "info"}`;
  t.innerHTML = `
    <div class="icon">${type === "success" ? "✓" : type === "danger" ? "!" : type === "warning" ? "!" : "i"}</div>
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

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
  try {
    data = await res.json();
  } catch (e) {}

  if (!res.ok) {
    const err = (data && data.error) ? data.error : `HTTP_${res.status}`;
    const message = (data && data.message) ? data.message : null;
    return { ok: false, status: res.status, error: err, message, data };
  }

  return { ok: true, status: res.status, data };
}

function dashByRole(role) {
  if (role === "YONETICI") return "admin.html";
  if (role === "PERSONEL") return "staff.html";
  return "resident.html";
}

async function requireSakin() {
  const r = await api("/api/me");
  if (!r.ok || !r.data?.user) {
    location.href = "auth.html";
    return null;
  }

  const user = r.data.user;
  if (user.role !== "SAKIN") {
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

async function fetchRatings() {
  const r = await api("/api/ratings");
  if (!r.ok) throw new Error(r.error || "LOAD_FAILED");
  return r.data.ratings || [];
}

async function fetchAnnouncements() {
  const r = await api("/api/announcements");
  if (!r.ok) throw new Error(r.error || "LOAD_FAILED");
  return r.data.announcements || [];
}

async function fetchAttachments(ticketId) {
  const r = await api(`/api/tickets/${ticketId}/attachments`);
  if (!r.ok) throw new Error(r.error || "LOAD_FAILED");
  return r.data.attachments || [];
}

async function createTicket(payload) {
  const r = await api("/api/tickets", { method: "POST", body: payload });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, ticket: r.data.ticket };
}

async function deleteTicket(ticketId) {
  const r = await api(`/api/tickets/${ticketId}`, { method: "DELETE" });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true };
}

async function saveRating(ticketId, stars, note = "") {
  const r = await api("/api/ratings", {
    method: "POST",
    body: { ticketId, stars, note }
  });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, rating: r.data.rating };
}

async function uploadAttachment(ticketId, file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`/api/tickets/${ticketId}/attachments`, {
    method: "POST",
    body: form,
    credentials: "include"
  });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) return { ok: false, error: (data && data.error) || `HTTP_${res.status}` };
  return { ok: true, attachment: data.attachment };
}

async function searchTickets(query) {
  const r = await api(`/api/search/tickets?q=${encodeURIComponent(query)}`);
  if (!r.ok) throw new Error(r.error || "SEARCH_FAILED");
  return r.data.tickets || [];
}

function getMyRating(ticketId) {
  return state.ratings.find(r => r.ticketId === ticketId) || null;
}

/* ---------- Ticket helpers ---------- */
function statusBadge(status) {
  switch (status) {
    case "ACIK":
      return `<span class="badge dot info">Açık</span>`;
    case "INCELEMEDE":
      return `<span class="badge dot warning">İncelemede</span>`;
    case "ATANDI":
      return `<span class="badge dot">Atandı</span>`;
    case "COZULDU":
      return `<span class="badge dot success">Çözüldü</span>`;
    case "KAPANDI":
      return `<span class="badge dot success">Kapandı</span>`;
    case "IPTAL":
      return `<span class="badge dot danger">İptal</span>`;
    default:
      return `<span class="badge dot">${escapeHtml(status)}</span>`;
  }
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

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("tr-TR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

/* ---------- UI Rendering ---------- */
function setWho(session) {
  el("whoName").textContent = session.full_name || "Sakin";
  el("whoMeta").textContent = session.email ? `${session.email}` : "Sakin";
}

function computeStats(myTickets) {
  const total = myTickets.length;
  const open = myTickets.filter(t => t.status === "ACIK" || t.status === "INCELEMEDE").length;
  const assigned = myTickets.filter(t => t.status === "ATANDI").length;
  const done = myTickets.filter(t => t.status === "COZULDU" || t.status === "KAPANDI").length;

  el("statTotal").textContent = total;
  el("statOpen").textContent = open;
  el("statAssigned").textContent = assigned;
  el("statDone").textContent = done;

  el("countAll").textContent = total;
  el("countOpen").textContent = open;
}

function applyFilters(myTickets) {
  const q = (el("searchInput")?.value || "").trim().toLowerCase();
  const st = el("filterStatus")?.value || "";
  const cat = el("filterCategory")?.value || "";

  return myTickets.filter(t => {
    const hay = `${t.ticketNo} ${t.title} ${t.category} ${priorityText(t.priority)} ${t.status}`.toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (st && t.status !== st) return false;
    if (cat && t.category !== cat) return false;
    return true;
  });
}

function renderTickets(filteredTickets) {
  const tbody = el("ticketsTbody");
  const empty = el("emptyState");
  tbody.innerHTML = "";

  if (filteredTickets.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  for (const t of filteredTickets) {
    const rating = getMyRating(t.id);
    const canRate = (t.status === "COZULDU" || t.status === "KAPANDI");
    const ratingHtml = canRate
      ? renderStars(t.id, rating?.stars || 0, !!rating)
      : `<span class="hint">Değerlendirme için çözüm bekleniyor</span>`;

    const canDelete = !["COZULDU", "KAPANDI"].includes(t.status);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div style="font-weight:900;">${escapeHtml(t.ticketNo)}</div>
        <div class="muted">#${t.id}</div>
      </td>
      <td>
        <div style="font-weight:900;">${escapeHtml(t.title)}</div>
        <div class="muted">${escapeHtml(shorten(t.description, 80))}</div>
      </td>
      <td>${escapeHtml(t.category)}</td>
      <td>${escapeHtml(priorityText(t.priority))}</td>
      <td>${statusBadge(t.status)}</td>
      <td>
        <div style="font-weight:800;">${escapeHtml(formatDate(t.createdAt))}</div>
        <div class="muted">Güncelleme: ${escapeHtml(formatDate(t.updatedAt))}</div>
      </td>
      <td>${ratingHtml}</td>
      <td>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn small" data-action="detail" data-id="${t.id}">Detay</button>
          ${canDelete ? `<button class="btn small danger" data-action="delete" data-id="${t.id}">Sil</button>` : ""}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

function shorten(s, n) {
  const str = String(s ?? "");
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

function renderStars(ticketId, stars, alreadyRated) {
  let html = `<div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">`;
  for (let i = 1; i <= 5; i++) {
    const active = i <= stars;
    html += `
      <button class="btn small ${active ? "primary" : ""}"
        style="padding:6px 10px;"
        data-action="rate"
        data-id="${ticketId}"
        data-stars="${i}"
        title="${i} yıldız">
        ${active ? "★" : "☆"}
      </button>
    `;
  }
  html += `<span class="hint">${alreadyRated ? `Kaydedildi: ${stars}/5` : "Puan ver"}</span></div>`;
  return html;
}

async function showDetail(ticket) {
  const rating = getMyRating(ticket.id);
  const canRate = (ticket.status === "COZULDU" || ticket.status === "KAPANDI");
  let attachments = [];
  try {
    attachments = await fetchAttachments(ticket.id);
  } catch {}

  const files = attachments.length
    ? attachments.map(a => `- ${a.originalName}`).join("\n")
    : "Yok";

  const msg =
`No: ${ticket.ticketNo}
Kategori: ${ticket.category}
Öncelik: ${priorityText(ticket.priority)}
Durum: ${ticket.status}

Başlık: ${ticket.title}

Açıklama:
${ticket.description}

Ekler:
${files}

${canRate ? `Değerlendirme: ${rating?.stars ? rating.stars + "/5" : "Yok"}` : "Değerlendirme: (Çözüm bekleniyor)"}
`;
  alert(msg);
}

async function refresh() {
  try {
    const [tickets, ratings, announcements] = await Promise.all([
      fetchTickets(),
      fetchRatings(),
      fetchAnnouncements()
    ]);
    state.tickets = tickets;
    state.ratings = ratings;
    state.announcements = announcements;
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
  const base = state.searchResults || state.tickets;
  computeStats(state.tickets);
  const filtered = applyFilters(base);
  renderTickets(filtered);
  renderAnnouncements();
}

function renderAnnouncements() {
  const count = el("annCount");
  const badge = el("annBadge");
  const wrap = el("annWrap");
  if (!wrap) return;

  const list = state.announcements
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10);

  if (count) count.textContent = list.length;
  if (badge) badge.textContent = list.length;

  wrap.innerHTML = "";
  if (list.length === 0) {
    wrap.innerHTML = `<div class="hint">Henüz duyuru yok.</div>`;
    return;
  }

  for (const a of list) {
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
            <div class="muted" style="margin-top:10px;">${escapeHtml(formatDate(a.createdAt))}</div>
          </div>
        </div>
      </div>
    `;
    wrap.appendChild(item);
  }
}

function setupRealtime() {
  if (!window.io) return;
  const socket = window.io();

  const refreshIfRelevant = () => {
    refresh();
  };

  socket.on("ticket:created", refreshIfRelevant);
  socket.on("ticket:updated", () => {
    toast("info", "Güncelleme", "Şikayetiniz güncellendi.");
    refreshIfRelevant();
  });
  socket.on("ticket:deleted", refreshIfRelevant);
  socket.on("announcement:created", () => {
    toast("info", "Duyuru", "Yeni duyuru yayınlandı.");
    refreshIfRelevant();
  });
  socket.on("announcement:deleted", refreshIfRelevant);
  socket.on("attachment:created", refreshIfRelevant);
}

/* ---------- Bootstrap ---------- */
(async function init() {
  const session = await requireSakin();
  if (!session) return;

  const lo = el("btnLogout");
  if (lo) lo.addEventListener("click", (e) => { e.preventDefault(); logout(); });

  setWho(session);
  setupRealtime();

  const form = el("ticketForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const category = el("category").value.trim();
    const priority = el("priority").value.trim();
    const title = el("title").value.trim();
    const description = el("description").value.trim();

    if (!category || !priority || !title || !description) {
      toast("warning", "Eksik Bilgi", "Lütfen tüm alanları doldurun.");
      return;
    }

    const r = await createTicket({ category, title, description, priority });
    if (!r.ok) {
      toast("danger", "Hata", "Kayıt oluşturulamadı.");
      return;
    }

    const file = el("attachment")?.files?.[0];
    if (file) {
      const up = await uploadAttachment(r.ticket.id, file);
      if (!up.ok) {
        toast("warning", "Dosya", "Dosya yüklenemedi.");
      }
    }

    form.reset();
    toast("success", "Şikayet Alındı", `Kayıt oluşturuldu: ${r.ticket.ticketNo}`);
    await refresh();
  });

  ["searchInput", "filterStatus", "filterCategory"].forEach(id => {
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

  el("ticketsTbody").addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const action = btn.dataset.action;
    const id = Number(btn.dataset.id);
    if (!action || !id) return;

    const ticket = state.tickets.find(t => t.id === id);
    if (!ticket) return toast("danger", "Hata", "Kayıt bulunamadı.");

    if (action === "delete") {
      if (!confirm("Bu şikayeti silmek istediğinize emin misiniz?")) return;
      const r = await deleteTicket(id);
      if (!r.ok) return toast("warning", "Silinemedi", "İşlem başarısız.");
      toast("success", "Silindi", "Şikayet kaydı silindi.");
      await refresh();
      return;
    }

    if (action === "detail") {
      await showDetail(ticket);
      return;
    }

    if (action === "rate") {
      const stars = Number(btn.dataset.stars);
      if (!["COZULDU", "KAPANDI"].includes(ticket.status)) {
        return toast("info", "Değerlendirme", "Değerlendirme için şikayetin çözülmesi gerekir.");
      }
      const r = await saveRating(ticket.id, stars, "");
      if (!r.ok) {
        return toast("danger", "Hata", "Değerlendirme kaydedilemedi.");
      }
      const idx = state.ratings.findIndex(x => x.ticketId === ticket.id);
      if (idx >= 0) state.ratings[idx] = r.rating;
      else state.ratings.push(r.rating);
      toast("success", "Teşekkürler", `Değerlendirmeniz kaydedildi: ${stars}/5`);
      rerender();
      return;
    }
  });

  await refresh();
})();

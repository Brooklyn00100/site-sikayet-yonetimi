/* =========================================================
   index.js — Home page announcements
   ========================================================= */

function qs(id) { return document.getElementById(id); }

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("tr-TR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

async function fetchPublicAnnouncements() {
  const res = await fetch("/api/public/announcements", { credentials: "include" });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) throw new Error((data && data.error) || `HTTP_${res.status}`);
  return data.announcements || [];
}

function renderAnnouncements(list) {
  const wrap = qs("annWrap");
  const count = qs("annCount");
  if (!wrap) return;

  const items = list.slice(0, 5);
  if (count) count.textContent = items.length;

  wrap.innerHTML = "";
  if (items.length === 0) {
    wrap.innerHTML = `<div class="hint">Henüz duyuru yok.</div>`;
    return;
  }

  for (const a of items) {
    const item = document.createElement("div");
    item.className = "card";
    item.style.boxShadow = "none";
    item.innerHTML = `
      <div class="card-body">
        <div style="font-weight:950;">${escapeHtml(a.title)}</div>
        ${a.imagePath ? `<div style="margin-top:8px;"><img src="/uploads/${encodeURIComponent(a.imagePath)}" alt="" style="max-width:220px; border-radius:10px;" /></div>` : ""}
        <div class="hint" style="margin-top:6px; white-space:pre-wrap;">${escapeHtml(a.body)}</div>
        <div class="muted" style="margin-top:10px;">${escapeHtml(formatDate(a.createdAt))}</div>
      </div>
    `;
    wrap.appendChild(item);
  }
}

(async function init() {
  const year = qs("year");
  if (year) year.textContent = new Date().getFullYear();

  try {
    const list = await fetchPublicAnnouncements();
    renderAnnouncements(list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  } catch (err) {
    const wrap = qs("annWrap");
    if (wrap) wrap.innerHTML = `<div class="hint">Duyurular yüklenemedi.</div>`;
  }
})();

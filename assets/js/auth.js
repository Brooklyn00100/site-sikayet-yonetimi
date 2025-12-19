/* =========================================================
   auth.js — REAL AUTH via Backend API (Express + SQLite)
   Endpoints:
     POST /api/auth/register
     POST /api/auth/login
     POST /api/auth/logout
     GET  /api/me
   ========================================================= */

function qs(id){ return document.getElementById(id); }

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(type, title, msg) {
  const area = qs("toastArea");
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

function dashByRole(role){
  if(role === "YONETICI") return "admin.html";
  if(role === "PERSONEL") return "staff.html";
  return "resident.html";
}

async function api(path, { method="GET", body=null } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : null,
    credentials: "include" // ✅ IMPORTANT: send/receive session cookie
  });

  let data = null;
  try { data = await res.json(); } catch(e){}

  if(!res.ok){
    const err = (data && data.error) ? data.error : `HTTP_${res.status}`;
    const message = (data && data.message) ? data.message : null;
    return { ok:false, status: res.status, error: err, message, data };
  }

  return { ok:true, status: res.status, data };
}

function setLoading(btn, loading){
  if(!btn) return;
  btn.disabled = !!loading;
  btn.dataset._txt ??= btn.textContent;
  btn.textContent = loading ? "Lütfen bekleyin..." : btn.dataset._txt;
}

function normalizeRole(v){
  const r = String(v || "").trim().toUpperCase();
  if(r === "SAKIN" || r === "PERSONEL" || r === "YONETICI") return r;
  return "SAKIN";
}

async function redirectIfAlreadyLoggedIn(){
  const r = await api("/api/me");
  if(r.ok && r.data && r.data.user && r.data.user.role){
    location.href = dashByRole(r.data.user.role);
  }
}

/* -------------------- LOGIN -------------------- */
async function handleLogin(e){
  e.preventDefault();

  const email = String(qs("loginEmail")?.value || "").trim();
  const password = String(qs("loginPassword")?.value || "");

  if(!email || !password){
    toast("warning", "Eksik Bilgi", "E-posta ve şifre zorunludur.");
    return;
  }

  const btn = e.target.querySelector("button[type='submit']");
  setLoading(btn, true);

  const r = await api("/api/auth/login", {
    method: "POST",
    body: { email, password }
  });

  setLoading(btn, false);

  if(!r.ok){
    if(r.error === "INVALID_CREDENTIALS"){
      toast("danger", "Giriş Başarısız", "E-posta veya şifre hatalı.");
      return;
    }
    if(r.error === "ACCOUNT_DISABLED"){
      toast("danger", "Hesap Pasif", "Bu hesap devre dışı bırakılmış.");
      return;
    }
    toast("danger", "Hata", `Giriş yapılamadı: ${r.error}`);
    return;
  }

  const user = r.data.user;
  toast("success", "Başarılı", "Giriş yapıldı.");
  setTimeout(()=> location.href = dashByRole(user.role), 300);
}

/* -------------------- REGISTER -------------------- */
async function handleRegister(e){
  e.preventDefault();

  const full_name = String(qs("regName")?.value || "").trim();
  const email = String(qs("regEmail")?.value || "").trim();
  const password = String(qs("regPassword")?.value || "");
  const password2 = String(qs("regPassword2")?.value || "");
  const role = normalizeRole(qs("regRole")?.value);

  if(!full_name || !email || !password || !password2){
    toast("warning", "Eksik Bilgi", "Tüm alanları doldurun.");
    return;
  }
  if(password.length < 6){
    toast("warning", "Şifre Zayıf", "Şifre en az 6 karakter olmalıdır.");
    return;
  }
  if(password !== password2){
    toast("warning", "Şifre Uyuşmuyor", "Şifreler aynı olmalıdır.");
    return;
  }

  const btn = e.target.querySelector("button[type='submit']");
  setLoading(btn, true);

  const r = await api("/api/auth/register", {
    method: "POST",
    body: { full_name, email, password, role }
  });

  setLoading(btn, false);

  if(!r.ok){
    if(r.error === "EMAIL_EXISTS"){
      toast("warning", "Zaten Kayıtlı", "Bu e-posta zaten kayıtlı. Giriş yapmayı deneyin.");
      return;
    }
    if(r.error === "WEAK_PASSWORD"){
      toast("warning", "Şifre Zayıf", "Şifre en az 6 karakter olmalıdır.");
      return;
    }
    toast("danger", "Hata", `Kayıt oluşturulamadı: ${r.error}`);
    return;
  }

  const user = r.data.user;
  toast("success", "Başarılı", "Hesap oluşturuldu.");
  setTimeout(()=> location.href = dashByRole(user.role), 350);
}

/* -------------------- BOOT -------------------- */
(async function init(){
  const params = new URLSearchParams(location.search);
  if (params.get("logout") === "1") {
    try { await api("/api/auth/logout", { method: "POST" }); } catch {}
    params.delete("logout");
    const next = location.pathname + (params.toString() ? `?${params.toString()}` : "");
    history.replaceState(null, "", next);
  } else {
    // If user already logged in, send to dashboard
    redirectIfAlreadyLoggedIn();
  }

  const loginForm = qs("loginForm");
  const registerForm = qs("registerForm");

  if(loginForm) loginForm.addEventListener("submit", handleLogin);
  if(registerForm) registerForm.addEventListener("submit", handleRegister);

  // helpful: if server is not running
  // quick ping
  api("/api/me").then(r=>{
    if(!r.ok && (r.status === 0 || r.error?.startsWith("HTTP_"))){
      // Only show if fetch failed or server not reachable
      // (Avoid spamming if unauthorized)
      if(r.status === 0){
        toast("warning", "Sunucu Yok", "Backend çalışmıyor. Terminalde: cd server && npm run dev");
      }
    }
  }).catch(()=>{});
})();

# Site Sikayet Yonetimi (Realtime + SQLite)

## Kurulum

```bash
cd backend
npm install
npm run dev
```

Tarayicida acin:

- http://localhost:3000/index.html
- http://localhost:3000/auth.html

## Notlar

- Veritabani dosyasi: `backend/data/ssy.db`
- Gercek zamanli guncellemeler Socket.IO ile yayinlanir.
- Kayit/Giris ve tum paneller API uzerinden calisir.

## Ek Ozellikler

- Duyurular ana sayfa ve sakin panelinde gorunur.
- Dosya ekleri: `backend/uploads/` (5MB limit, PNG/JPG/PDF/MP4).
- Kullanici yonetimi: admin panelinde aktif/pasif.
- Audit log: admin panelinde son islemler.
- Arama: baslik/aciklama/kategori/numara uzerinden arama.

# Kredensial Uji SIPRO (demo seed)

Sandi SEMUA akun demo: `Sipro#2026`

| Peran | Email | Catatan |
|---|---|---|
| Super Admin | superadmin@sipro.co.id | akses penuh + admin sistem |
| Owner/Direksi | owner@sipro.co.id | dashboard direksi, laporan |
| Manajer Sales | manager@sipro.co.id | approve diskon, pipeline |
| Marketing Admin | marketing@sipro.co.id | leads, kampanye |
| Sales | sales@sipro.co.id | leads/deal miliknya (uji RBAC 403 konstruksi) |
| Sales 2 | sales2@sipro.co.id | uji isolasi antar sales |
| Finance | finance@sipro.co.id | pembayaran, kas, GL |
| Manajer Proyek | pm@sipro.co.id | konstruksi, kalender, kalibrasi |
| Pelaksana Lapangan | site@sipro.co.id | Papan Mandor, progres (tanpa tombol kalibrasi) |
| Manajer Keuangan | finlead@sipro.co.id | approve fee/komisi/kas bon, tutup periode GL |
| Supervisor Digital Marketing | dmlead@sipro.co.id | otomasi, template WA, broadcast, showroom |
| Staf Digital Marketing | dm@sipro.co.id | inbox WA, broadcast (tanpa approve) |

## Pemisahan tugas yang DIUJI (jangan dianggap bug)
- **Fee mitra**: sales/marketing/manajer **MENGAJUKAN** (`marketing_fee:create`), finance
  **MENYETUJUI + MEMBAYAR** (`approve`/`update`). Karena itu tombol **"Ajukan Fee"
  SENGAJA nonaktif untuk finance** dan `POST /api/partners/rules/issue` menjawab **403**
  untuk finance — itu perilaku benar, bukan cacat.
- **Pemeliharaan jam tahap** (`POST /api/aging/reconcile`): hanya owner/super_admin
  (`aging:manage`). Semua peran boleh MELIHAT laporan umur tahap.
- **Mitra**: sales hanya boleh MELIHAT; finance boleh mengubah **aturan fee**
  (`partners:update`) tetapi TIDAK boleh mendaftarkan mitra baru (`partners:create`).

## Memulihkan lingkungan dari repo (WAJIB dibaca agen lanjutan)
Berkas `.env` TIDAK ada di git. Setelah `git clone`, backend akan **gagal login** sampai
variabel ini ada di `backend/.env` (selain `MONGO_URL` dan `DB_NAME` milik container):

```
JWT_SECRET="<acak, mis. python3 -c 'import secrets;print(secrets.token_urlsafe(48))'>"
```

`security.py` membacanya dengan `os.environ["JWT_SECRET"]` (tanpa nilai bawaan), jadi tanpa
baris itu setiap `POST /api/auth/login` mati 500. Variabel lain (WhatsApp, e-sign, storage)
opsional: bila kosong, modulnya jalan dalam **mode simulasi** dan aplikasi tetap utuh.

Dependensi yang biasanya belum ada di image dasar: `APScheduler`, `reportlab`, `tzlocal`
(`pip install -r backend/requirements.txt` bisa bentrok antara `emergentintegrations` dan
wheel `litellm`; pasang tiga paket itu saja bila paket lain sudah ada).

## Portal Pelanggan
- Login OTP; **OTP master pengujian = `000000`** (env `PORTAL_MASTER_OTP`).
- Nomor/nama pelanggan demo dapat dilihat di halaman Customer (hasil seed `customers`).

## Catatan pengujian
- Tidak ada backdoor auth. Halaman login punya tombol **"Masuk cepat"** yang hanya memanggil
  `POST /api/auth/login` biasa dengan akun demo di atas (boleh dihapus sebelum go-live).
- Bersihkan `localStorage` saat berganti peran agar sesi lama tidak terbawa.
- Login endpoint: `POST {REACT_APP_BACKEND_URL}/api/auth/login` body `{"email": "...", "password": "Sipro#2026"}`.

## Analitik & BI (Fase 44) — yang DIUJI, jangan dianggap bug
- **Metrik yang mengaku "belum ada data" itu BENAR.** 6 dari 47 metrik memang belum punya
  sumber data di sistem (demografi lead, alasan reschedule survei, pendapatan add-on tanpa
  `price_breakdown`, margin proyek tanpa budget operasional, waktu jual dari riwayat status
  bentukan migrasi, alasan lost yang belum diisi). Aturan repo: **jangan pernah menampilkan 0
  untuk data yang tidak ada** — kartunya menulis "belum ada data" + menyebut apa yang kurang.
- **Lencana "Dihitung dari sebagian data (40/47)"** juga benar: angkanya sah tetapi cakupannya
  belum penuh (mis. hanya 40 dari 47 lead punya `stage_history`).
- **Row-scope**: `sales@sipro.co.id` HANYA melihat metrik miliknya (server memaksa lewat
  `owner_email`); tombol "Hitung ulang snapshot" sengaja TIDAK muncul untuknya
  (butuh `analytics:manage`). Peran ber-`manage`: owner, super_admin, manajer sales, manajer
  keuangan, manajer proyek, supervisor DM.
- **Snapshot bukan kebenaran**: `POST /api/analytics/snapshots/rebuild` selalu menghitung ulang
  dan MEMPERBAIKI baris lama; gate membuktikannya dengan sengaja merusak satu nilai snapshot.

## Konstruksi Fase 46 — yang DIUJI, jangan dianggap bug
- **Unit tanpa jadwal menulis "belum ada data", bukan 0%.** `planned_progress`,
  `deviation`, `days_late` sengaja `null` + daftar `missing[]` ("jadwal_pembangunan",
  "rencana_bayar"). Menampilkan 0 untuk data yang tidak ada = cacat, bukan sebaliknya.
- **Tombol "Mulai Bangun" default = PERINGATAN.** Setting `build.require_dp_before_start`
  bawaannya **False**: unit boleh dimulai walau DP belum terbukti, TAPI peringatan wajib
  dicentang + alasan **minimal 5 huruf** (tercatat di `start_gate_log` + aktivitas + audit).
  Bila admin menyalakan setting, alasan yang sama MEMBLOKIR (`POST /api/build/unit/{id}/start`
  → 400 "Belum bisa dimulai").
- **Pelaksana lapangan (`site@sipro.co.id`) mendapat 403 di "Mulai Bangun"** — itu pemisahan
  tugas (`construction:approve`), bukan bug. Ia tetap boleh **mengajukan** hasil kerja.
- **Mengajukan hasil kerja WAJIB foto** (bawaan 2 foto untuk langkah persiapan) + checklist
  mutu lengkap; pengaju tidak boleh memverifikasi pekerjaannya sendiri (403).
- **Data demo gerbang:** `seed_phase46` menjadwalkan **satu unit tanpa memulainya** (mis.
  `A-05`/`A-03`, lencana kesiapan "peringatan") supaya dialog Mulai Bangun bisa dicoba. Bila
  sudah ditekan seseorang, unit itu jadi "berjalan" dan seed **tidak** mengembalikannya —
  jalankan `bash scripts/seed_reset.sh` bila butuh keadaan awal lagi.
- **Unit fixture uji:** `GATE46-01` (gate) dan `POC46-01/02` (POC) dibuat & dibuang otomatis.
  Bila terlihat di papan berarti ada run yang mati di tengah; jalankan gate/POC sekali lagi
  (keduanya membersihkan sisa sebelum mulai).
- **Izin tanpa tanggal berlaku** ditulis "masa berlaku belum dicatat" — bukan "aman
  selamanya"; izin `disetujui` yang tanggalnya lewat dilaporkan **kedaluwarsa**.

## Fase 47 — yang DIUJI, jangan dianggap bug
- **Mutasi rekening yang belum dicocokkan BUKAN pelunasan.** Saldo tagihan pelanggan tidak
  berubah sampai kasir menekan "Cocokkan". Itu inti fase ini, bukan data yang tertinggal.
- **Bukti transfer dari portal berstatus "menunggu verifikasi".** Tagihan **tidak** berkurang
  sebelum finance memverifikasi; pesan di portal memang menegaskan hal itu.
- **Hanya Manajer Keuangan (`finlead@sipro.co.id`) yang boleh MEMBATALKAN pencocokan bank**
  (`bank:approve`) dan **menyetujui/membayar rekap upah** (`labor:approve`). `finance@` biasa
  mendapat **403** di kedua aksi itu — pemisahan tugas, bukan cacat.
- **Yang MENGAJUKAN rekap upah tidak boleh menyetujuinya** (`pm@`/`site@` = 403).
- **Sales tidak punya akses** mutasi bank, bukti transfer, tenaga kerja, dan absensi (403);
  **sales juga tidak boleh menyetujui diskon penawarannya sendiri** (403 di
  `POST /api/quotations/{id}/decision`).
- **Simulasi KPR kosong menulis "belum ada data" + daftar yang kurang, bukan Rp 0.** Bunga &
  tenor harus datang dari bank; sistem tidak mengarang. Sama halnya: mutasi bank tanpa kolom
  saldo ditulis "saldo belum dicatat", dan selisih rekonsiliasi yang tak terjelaskan
  dinyatakan sebagai sebab `unexplained` beserta nominalnya.
- **Alasan wajib**: pembatalan/pengabaian pencocokan & keputusan diskon minimal **5 huruf**,
  penolakan bukti transfer minimal **10 huruf** (alasannya dibaca pelanggan di portal).
- **Absensi**: tanggal yang belum terjadi ditolak; satu orang satu baris per hari (koreksi =
  baris DIPERBARUI + riwayat, bukan baris kembar); tanggal yang sudah masuk rekap upah
  terkunci sampai rekapnya dibatalkan. Selisih dengan buku harian tampil sebagai
  **peringatan informasi** (match/mismatch/belum ada buku harian), tidak memblokir.
- **Rekap upah** menolak periode yang bertumpang dan periode tanpa absensi berupah (tidak ada
  dokumen kosong). Pembayaran melahirkan jurnal Dr `1-1600` (pekerjaan dalam proses) /
  Cr `1-1200` (bank) dan tidak bisa dibayar dua kali.
- **Data demo Fase 47** (`seed_phase47`, `demo_batch="fase47"`): 1 rekening bank + mutasi yang
  SENGAJA dibiarkan belum dicocokkan (satu di antaranya bernominal sama dengan termin nyata
  supaya usulan pencocokan muncul), 1 bukti transfer **pending**, 6 tenaga kerja + absensi 2
  hari terakhir, dan 1 penawaran berdiskon **di atas kewenangan** (menunggu persetujuan).
  Seed tidak pernah menekan tombol milik manusia. Bila keadaan awal dibutuhkan lagi:
  `bash scripts/seed_reset.sh`.
- **Bahan uji gate** bertanda `gate47` (unit `GATE47-*`, pekerja/lead "Uji … Gate47") dibuat &
  dibuang otomatis. Bila terlihat di layar, ada run gate yang mati di tengah — jalankan gate
  itu sekali lagi (setiap gate membersihkan sisa sebelum mulai).
- **Impor mutasi bank = berkas CSV** (kolom yang dikenali: tanggal, keterangan, debet/kredit
  atau nominal+arah, saldo, referensi). **Tarikan API bank belum ada** dan tidak dijanjikan
  di layar. WhatsApp (kirim penawaran), e-sign, dan storage terkelola tetap **MODE SIMULASI**.

## Guardrail Fase 47 (cara membuktikan cepat)
```
python3 scripts/verify_bank_recon.py        # gate ke-31
python3 scripts/verify_portal_proof.py      # gate ke-32
python3 scripts/verify_quotation_labor.py   # gate ke-33
python3 scripts/mutasi_47.py --check        # pola 19 mutasi masih ada di kode (cepat)
python3 scripts/mutasi_47.py                # uji-mutasi penuh (~40 menit, restart backend)
bash scripts/run_all_gates.sh               # 33 gates
```

## Fase 48 — Pengadaan & Subkon lanjutan (yang DIUJI, jangan dianggap bug)
- **Pemisahan tugas paling ketat ada di sini.** Uang muka subkon & pencairan retensi hanya
  boleh DIPUTUS `finlead@sipro.co.id` (finance_manager). `finance@sipro.co.id` sengaja
  menerima **403** untuk `POST /api/subcon/advances/{id}/decision` dan
  `POST /api/subcon/retentions/{id}/release` — itu perilaku benar.
- **Tagihan yang melebihi barang diterima DITOLAK (400), bukan sekadar ditandai.** Hanya
  `finlead` (atau owner) yang boleh menerobos, wajib `override_hold=true` +
  `override_reason` minimal 10 huruf. Penolakan ini bukan bug.
- **Retensi tidak bisa dicairkan** selama masa pemeliharaan berjalan ATAU masih ada temuan
  punch list terbuka pada unit lingkup SPK. Data demo sengaja memuat keduanya supaya
  gerbangnya bisa dicoba manusia.
- **Transfer material antar proyek** butuh `materials:approve` (PM/owner) — `site@` sengaja
  403 supaya barang tidak berpindah pusat biaya tanpa persetujuan.
- **Angka "belum ada data" itu BENAR**: vendor tanpa transaksi tidak diberi skor 0, material
  tanpa harga masuk tidak dihitung nilainya, harga tanpa acuan tidak dinyatakan "wajar".
- Data demo `fase48`: vendor VND-01..03 + daftar harga, permintaan material PR yang stoknya
  kurang (untuk mencoba tombol **Buat PO**), uang muka UMK/2026/0001 + 2 potongan menunggu,
  batas stok minimum pada dua material.

## Penutupan Fase 48 (18 Agu 2026) — perubahan yang perlu diketahui penguji
- **Lingkungan dipulihkan dari repo GitHub `luarbinasaaa/sipro`.** `backend/.env` dibuat ulang:
  selain `MONGO_URL`/`DB_NAME` milik container, WAJIB ada `JWT_SECRET` **dan**
  `DEFAULT_ORG_ID="org-sipro"` (dengan TANDA HUBUNG). Semua gate & POC memakai `org-sipro`
  secara harfiah; menulis `org_sipro` membuat 4 pemeriksaan `verify_build_hub.py` merah
  padahal kodenya benar.
- **Bug laten yang diperbaiki:** `seed.py` mengimpor `_run_3way` dari `procurement_router`
  (sudah dipindah ke `procurement_extra.evaluate_bill` pada Fase 48B), sehingga container
  dengan **DB kosong** mati saat startup dan tidak pernah ter-seed. Sekarang seed penuh
  (sampai Fase 48) jalan di DB bersih.
- **Data demo baru:** uang muka **UMK/2026/0003** (SPK/2026/0002 · PT Instalasi Prima ·
  Rp 15.000.000) sengaja ditinggalkan berstatus **"Diajukan / menunggu keputusan"** supaya
  gerbang "hanya Manajer Keuangan yang boleh memutuskan uang muka" bisa dicoba manusia.
  Pengajunya `pm@sipro.co.id` (aturan empat-mata tetap berlaku: pengaju tidak boleh
  memutuskan). Dokumen ini idempoten lewat penanda `demo_marker="advance_menunggu"` — bila
  sudah diputus, restart backend TIDAK membuat uang muka baru (dulu sempat menumpuk).
  Kembalikan keadaan awal dengan `bash scripts/seed_reset.sh`.
- **`/materials` sekarang menolak dengan sopan.** Sebelum ini `sales@` yang membuka
  `/materials` melihat tabel kosong + "Belum ada transaksi" padahal server menjawab **403** —
  layar berbohong "tidak ada data" untuk hal yang benar-benar "tidak boleh dilihat". Sekarang
  muncul kartu **AKSES DITOLAK** (`data-testid="materials-access-denied"`), sama seperti
  `/construction`.
- **PR/2026/0003 sudah dipakai** untuk membuktikan alur "Buat PO dari kekurangan stok"
  (lahir **PO/2026/0005**, Rp 34.250.000, berjejak `requisition_id`). Karena itu tombol
  "Buat PO" pada PR itu kini menolak dengan sopan ("Seluruh kebutuhan sudah tercukupi …
  PO terkait: PO/2026/0005") dan tombolnya mati — **itu bukti idempoten, bukan cacat**.
  PR/2026/0001 masih tersedia untuk dicoba manusia.
- **Pembanding harga tidak punya tombol.** Kotak "Pembanding harga" muncul sendiri begitu
  sebuah material dipilih di tab **Daftar Harga** (`vendor-price-material-select`). Test id
  `vendor-price-compare-button` sudah DIHAPUS karena tidak pernah dirender dan membuat uji
  E2E salah lapor.
- **Test id tab permintaan material = `materials-tab-requisitions`** (berakhiran huruf s).

# Rencana Development SIPRO — Fase 49 (Penutupan Buku, Laporan Owner, Pajak & Kepatuhan)

Problem statement (verbatim):
> "saya ingin anda lanjutkan development dari repo ini https://github.com/kahshdhdj/sipro — development sebelumnya berhenti disini saya ingin anda lanjutkan.
> Action: search_replace ke /app/backend/settings_store.py (menambah grup \"pajak\": \"Pajak & Kepatuhan\")
> Action: create_file /app/backend/tax_faktur_export.py — 'Faktur pajak keluaran v2 (Fase 49E) — pengganti, pembatalan, dan EKSPOR berkas' (faktur pengganti, pembatalan beralasan, ekspor XML Coretax + CSV, export hold bila NPWP kurang, rekap SPT Masa PPN)."

Status saat ini (ringkas, terverifikasi di container):
- Repo **sudah dipulihkan** ke `/app`, dependensi backend+frontend terpasang.
- Backend & frontend **RUNNING**.
- Login sempat 500 karena `.env` tidak ikut git (**JWT_SECRET hilang**) → **sudah diperbaiki** dengan menambah `JWT_SECRET` dan `PORTAL_MASTER_OTP=000000` ke `/app/backend/.env`.
- Baseline **hijau terbukti**: `python3 poc/poc_48.py` → **PASS (61 pemeriksaan)**. Fase 48 dinyatakan **DITUTUP**.
- Fase 49 **baru setengah**: beberapa mesin sudah ditulis, namun **belum tersambung ke endpoint mana pun dan belum ada UI**.

**Artefak Fase 49 yang sudah ada (namun belum dipakai UI/API):**
- Backend engines:
  - `backend/closing_engine.py` (49A/49B): `close_check`, `close_period` (hold+override), `year_check`, `year_close` (idempoten), `year_reopen` (reversal), `year_list`.
  - `backend/gl_project_cash.py` (49C): `cash_flow_projects` + tie-out.
  - `backend/owner_pack.py` (49D): `owner_pack`, `closing_history`.
  - `backend/tax_faktur_export.py` (49E/49G): faktur replace/cancel, export XML/CSV, `vat_return`.
- Models/SSOT/config:
  - `backend/models_p49.py` (request models lengkap, termasuk `BillPayWithholding`).
  - `backend/reference_p49.py` (SSOT groups 49).
  - `backend/settings_store.py` (grup **pajak** + keys: `tax.company_npwp`, `tax.company_idtku`, `tax.pph23_rate`, `tax.pph4_2_konstruksi_rate`, `tax.bupot_series`).

**Bug kritis laten (WAJIB diperbaiki dulu):**
- `backend/reference.py` `_PHASES` **berhenti di 48**, sehingga `reference_p49.py` **tidak pernah dimuat**.
  Dampak: pemanggilan `ref.make_validator("tax_export_format")` / `ref.label_of("faktur_state")` bisa **KeyError 500**.

**Belum ada sama sekali (wajib dibangun):**
- Mesin e-Bupot (49F): `withholding_engine.py` + koleksi `withholding_docs` + PDF + export.
- Integrasi **pembayaran tagihan AP dengan potong PPh** (vendor terima NET, utang pajak lahir) + idempoten.
- Endpoint backend 49A–49G + RBAC aksi baru.
- UI tabs di `/accounting`, `/accounting-reports`, `/tax`.
- `poc/poc_49.py` (POC core wajib PASS).
- `seed_phase49.py` (idempoten, demo `fase49`, termasuk NPWP contoh perusahaan).
- Gate baru: `scripts/verify_closing.py` (gate 37) + `scripts/verify_tax_compliance.py` (gate 38) + didaftarkan di `scripts/run_all_gates.sh`.
- Uji mutasi: `scripts/mutasi_49.py`.
- Dokumen: `docs/v2/43_CLOSING_TAX_COMPLIANCE_SPEC.md` + pembaruan `CODEBASE_MAP.md`, `test_result.md`, `memory/test_credentials.md`, `plan.md`.

---

## 1) Objectives
Fokus menutup gap nyata G1–G7 tanpa membangun ulang yang sudah ada, dengan tambahan target “menyambungkan” mesin yang sudah ada ke API/UI:

1. **Year-end closing (G1):** laba/rugi tahun berjalan dipindah ke **Laba Ditahan** via jurnal penutup yang seimbang, idempoten, dan reversible.
2. **Period close bergigi (G2):** penutupan bulan **MENAHAN** bila checklist gagal + override beralasan (≥10 huruf) hanya untuk peran berwenang + audit + tugas tinjauan.
3. **Arus kas per proyek (G3):** laporan cash-flow per proyek dengan **tie-out** ke konsolidasi + baris “tidak teralokasi” yang jujur.
4. **Paket laporan bulanan owner (G4):** BS/PL/CF + per proyek + rasio + metadata penutupan (status, siapa menutup, override, cutoff) + honest-null (`missing[]`).
5. **e-Faktur compliance (G5):** faktur pengganti/batal berjejak + ekspor **2 format** (XML Coretax + CSV) per periode + guard “hold” bila data wajib kurang (menyebut faktur mana).
6. **e-Bupot (G6):** bukti potong bernomor + PDF + ekspor per periode; pembetulan nomor tetap; pembatalan beralasan.
7. **Rekap SPT Masa PPN (G7):** keluaran/masukan/kurang-lebih bayar + status setor + rekonstruksi dari sumber (faktur keluaran & PPN masukan estimasi).

---

## 2) Implementation Steps

### FASE 1 — POC Core (WAJIB)
**Output:** `poc/poc_49.py` hijau (exit 0). Semua fixture dibuat via API resmi (bertanda `poc49`) dan dibersihkan; tidak meninggalkan jurnal/dokumen menggantung.

**Catatan penting sebelum POC:**
- Perbaiki SSOT terlebih dulu: tambahkan **49** ke `backend/reference.py::_PHASES` agar `reference_p49.py` termuat.
- Pastikan semua pesan galat berbahasa Indonesia, menyebut SEBAB + tindakan.

**User stories (POC):**
1. Sebagai finlead, saat menutup periode, sistem MENAHAN penutupan bila checklist gagal dan menyebut sebab satu per satu.
2. Sebagai finlead, saya bisa override penutupan dengan alasan ≥10 huruf; tercatat audit + melahirkan tugas tinjauan; peran tidak berwenang 403.
3. Sebagai owner, saya menutup TAHUN: laba tahun berjalan pindah ke laba ditahan via jurnal seimbang dan tidak bisa dobel (idempoten).
4. Sebagai owner, bila tahun dibuka kembali, jurnal penutup tahun dibalik (reversal) dengan jejak.
5. Sebagai owner, arus kas per proyek dapat dijumlahkan dan sama dengan arus kas konsolidasi (ada “tanpa proyek” yang jujur).
6. Sebagai finance, ekspor e-Faktur DITOLAK bila ada faktur wajib-NPWP yang belum lengkap dan menyebut faktur mana; faktur pengganti/batal berjejak.
7. Sebagai finance, bayar tagihan vendor/subkon dengan potong PPh → vendor terima NET, utang pajak lahir, bukti potong bernomor terbit otomatis, tidak bisa dobel; PDF bisa dibuat; pembetulan nomor tetap.

**Langkah POC (direvisi sesuai kondisi nyata repo):**
- P0. **Fix SSOT**: register fase 49 (`reference.py::_PHASES += (49,)`) + smoke call `/api/reference` memastikan group 49 muncul.
- P1. Buat periode uji: jurnal pendapatan/beban (manual) + pembayaran kas lintas 2 proyek + 1 transaksi tanpa proyek (untuk tie-out cashflow proyek).
- P2. Uji checklist: `GET /gl/periods/close-check?period=YYYY-MM` menghasilkan item + state + `blocking_reasons[]`.
- P3. Uji close hold: `POST /gl/periods/close` tanpa override saat ada blocking → 409/400 + daftar `reasons[]`.
- P4. Uji override (finlead/owner saja): close dengan `override=true` + `override_reason` ≥10 → close sukses + audit_log + task review.
- P5. Uji year-end close: `POST /gl/year/close` dua kali → kedua kalinya idempoten (tidak membuat jurnal baru).
- P6. Uji year-end reopen: `POST /gl/year/reopen` → jurnal reversal tercipta, jejak terpaut, state berubah.
- P7. Uji `GET /gl/reports/cash-flow-projects` + tie-out: Σ(project + unassigned) == consolidated.
- P8. Uji e-Faktur: buat 1 faktur valid + 1 faktur “wajib NPWP tapi kosong” → `GET /tax/faktur/export` menahan dan menyebut faktur bermasalah.
- P9. Uji e-Bupot penuh: bayar tagihan AP dengan payload potong PPh → vendor receive NET, potongan jadi utang pajak + bukti potong terbit; panggil lagi idempoten; `GET /tax/withholding/{id}/pdf` menghasilkan PDF.
- P10. Cleanup: hapus semua dokumen fixture bertanda `poc49` + pastikan tidak ada jurnal/dokumen menggantung.

> Stop point: jangan lanjut Fase 2 sebelum `poc_49.py` PASS.

---

### FASE 2 — V1 App Development (backend + frontend end-to-end)
**Output:** fitur tampil sebagai tab/section pada halaman existing (tanpa pintu sidebar baru):
- `/accounting` → tab **Penutupan Buku** (49A/49B)
- `/accounting-reports` → tab **Paket Laporan Owner** + **Arus Kas per Proyek** (49C/49D)
- `/tax` → tab **e-Faktur Ekspor** + **Bukti Potong (e-Bupot)** + **Rekap SPT Masa PPN** (49E/49F/49G)

#### 49A — Period Close Checklist + Hold/Override
- Backend:
  - Fix SSOT loader (49 masuk `_PHASES`).
  - Endpoint baru: `GET /gl/periods/close-check?period=YYYY-MM` → memanggil `closing_engine.close_check`.
  - Upgrade `POST /gl/periods/close`:
    - default: **hold** bila ada blocking reasons (HTTP 409/400 + `reasons[]`).
    - override: hanya `gl:close_override`, alasan ≥10 huruf, simpan metadata override pada `accounting_periods`.
    - tulis audit_log + buat task tinjauan (WorkHub) bila override dilakukan.
- Frontend (tab Penutupan Buku):
  - Panel checklist per item: label dari `/api/reference` + state pill.
  - Tombol Close disabled bila blocking; dialog override (alasan ≥10) bila user berwenang.
  - Tampilkan “kejujuran”: periode open/closed + siapa menutup + override reason bila ada.

#### 49B — Year-end Closing
- Backend:
  - Endpoint: `POST /gl/year/close` (payload `YearAction`) → `closing_engine.year_close`.
  - Endpoint: `POST /gl/year/reopen` (payload `YearAction`/reason) → `closing_engine.year_reopen`.
  - Endpoint: `GET /gl/year` atau `GET /gl/year/list` (bila belum ada) → `closing_engine.year_list`.
  - Simpan metadata di `gl_year_closings` + tautan jurnal penutup + reversal.
- Frontend:
  - Panel “Tutup Tahun”: tahun, status, net income, entry_no, tombol close/reopen sesuai RBAC.

#### 49C — Cash Flow per Proyek + Tie-out
- Backend:
  - Endpoint: `GET /gl/reports/cash-flow-projects?date_from&date_to` → `gl_project_cash.cash_flow_projects`.
  - Pastikan hasil menyertakan `unassigned`, `consolidated`, `tie_out.matches`.
- Frontend:
  - Tabel per proyek + baris “Tidak teralokasi” + baris total.
  - Badge tie-out: “match / selisih”.

#### 49D — Paket Laporan Bulanan Owner
- Backend:
  - Endpoint: `GET /gl/reports/owner-pack?period=YYYY-MM` → `owner_pack.owner_pack`.
  - Endpoint: `GET /gl/reports/closing-history?limit=` → `owner_pack.closing_history`.
- Frontend:
  - Halaman ringkas: BS/PL/CF + ratios + project P/L + cashflow projects + metadata penutupan.
  - “Missing data” ditampilkan sebagai catatan, bukan 0.

#### 49E — e-Faktur v2 (pengganti/batal + ekspor)
- Backend:
  - Integrasi `tax_faktur_export.py` ke router `tax_router.py`:
    - `POST /tax/faktur/{id}/replace`
    - `POST /tax/faktur/{id}/cancel`
    - `GET /tax/faktur/export?period=YYYY-MM&format=coretax_xml|excel_csv`
  - Guard ekspor: tahan bila NPWP perusahaan kosong atau ada faktur wajib-NPWP belum lengkap; error menyebut faktur yang kurang.
- Frontend:
  - List faktur + aksi pengganti/batal (dialog alasan ≥10).
  - Panel ekspor: pilih periode + format (XML/CSV), unduh file.

#### 49F — e-Bupot (bukti potong) — **PENUH (sesuai keputusan user)**
- Backend:
  - Buat `withholding_engine.py` + koleksi `withholding_docs`:
    - nomor seri dari `sequences` + `tax.bupot_series`.
    - state: issued/corrected/cancelled (SSOT).
    - pembetulan: nomor tetap, versi naik.
  - Endpoint:
    - `POST /tax/withholding/issue` (manual issuance; idempoten per ref)
    - `POST /ap/bills/{id}/pay-withholding` (atau endpoint setara) memakai model `BillPayWithholding`:
      - hitung potongan = base×rate
      - posting pembayaran kas net + jurnal utang pajak
      - terbitkan withholding doc otomatis (idempoten)
    - `GET /tax/withholding?period=`
    - `GET /tax/withholding/{id}/pdf`
    - `POST /tax/withholding/{id}/correct`
    - `POST /tax/withholding/{id}/cancel`
    - `GET /tax/withholding/export?period=`
  - Pastikan tie-out: total potongan = utang pajak yang tercatat; tidak dobel untuk ref yang sama.
- Frontend:
  - Tab Bukti Potong: list, filter periode, tombol PDF, ekspor, pembetulan/pembatalan.
  - UX: jelas membedakan “manual issuance” vs “otomatis dari pembayaran tagihan”.

#### 49G — Rekap SPT Masa PPN
- Backend:
  - Endpoint: `GET /tax/vat-return?period=YYYY-MM` → gunakan `tax_faktur_export.vat_return` + `tax_engine.ppn_input`.
  - Pastikan status: kurang_bayar/lebih_bayar/nihil/missing_data (SSOT).
- Frontend:
  - Kartu ringkas: PPN keluaran, masukan, net, status.
  - Link ke daftar faktur dan PPN masukan.

---

### FASE 3 — SSOT + Seed + RBAC + Gates + Mutasi + Penutupan
**Output:** seed demo `fase49` + guardrail + uji-mutasi + E2E multi-peran; suite gate menjadi **38 gates**.

**User stories (QA/Governance):**
1. Close period MENAHAN bila checklist gagal; override hanya peran berwenang + alasan ≥10.
2. Year-end close idempoten; reopen membuat reversal berjejak.
3. Cash flow per proyek tie-out ke konsolidasi.
4. Ekspor e-Faktur menolak faktur wajib-NPWP yang belum lengkap dengan daftar yang kurang.
5. Pembayaran tagihan dengan potong PPh menghasilkan NET ke vendor + utang pajak + bukti potong; idempoten; pembetulan nomor tetap.

**Langkah (direvisi sesuai progres & temuan audit):**
- S0. **Perbaiki SSOT loader:** tambah `49` ke `reference.py::_PHASES` + pastikan `/api/reference` memuat grup 49.
- S1. SSOT reference: pastikan grup 49 lengkap (`closing_check_item`, `closing_check_state`, `year_closing_state`, `faktur_state`, `tax_export_format`, `vat_return_state`, `withholding_kind`, `withholding_basis`, `withholding_state`).
- S2. Seed idempoten `seed_phase49.py` (`demo_batch="fase49"`):
  - 2 proyek + 1 transaksi tanpa proyek untuk uji arus kas.
  - 1 periode dengan kondisi checklist gagal (mis. bank un-reconciled/pending approval) + 1 periode bersih.
  - Isi **NPWP perusahaan contoh** (mis. `0012345678901000`, jelas ditandai demo) via settings store.
  - 1 faktur valid + 1 faktur “wajib NPWP tapi kosong” untuk uji hold ekspor.
  - 1 tagihan AP yang dibayar dengan potong PPh (melahirkan withholding doc otomatis).
- S3. RBAC: tambah aksi/izin baru:
  - `gl:close_override`, `gl:year_close`, `tax:export`, `tax:withholding_issue` (dan izin yang diperlukan untuk pay-withholding).
- S4. Gate baru + daftar ke `scripts/run_all_gates.sh`:
  - `scripts/verify_closing.py` (gate 37)
  - `scripts/verify_tax_compliance.py` (gate 38)
- S5. `scripts/mutasi_49.py` (16–24 mutasi) untuk mematikan guard:
  - close hold/override, year-close idempoten, reopen reversal, tie-out cashflow projects,
  - export e-Faktur hold reason, withholding idempotency & nomor tetap saat correct.
- S6. Update dok:
  - `docs/v2/43_CLOSING_TAX_COMPLIANCE_SPEC.md`
  - `CODEBASE_MAP.md`
  - `test_result.md`
  - `memory/test_credentials.md` (catatan env JWT_SECRET tetap relevan)
  - `plan.md` (dokumen ini)
- S7. Penutupan: testing_agent_v3 E2E multi-peran (owner, finlead, finance, pm, sales).

---

## 3) Next Actions
1. **Fix SSOT**: daftarkan fase 49 ke `reference.py::_PHASES` + smoke `/api/reference`.
2. Buat `withholding_engine.py` + endpoint minimal 49F + integrasi pembayaran tagihan dengan potong PPh.
3. Sambungkan endpoint 49A–49G ke router (`gl_router.py`, `gl_reports_router.py`, `tax_router.py`, dan router AP bila perlu).
4. Buat `poc/poc_49.py` sampai PASS + cleanup ketat.
5. Implement UI tabs minimal di `/accounting`, `/accounting-reports`, `/tax`.
6. Tambah `seed_phase49.py` + RBAC aksi baru.
7. Tambah 2 gate + `mutasi_49.py` + jalankan `bash scripts/run_all_gates.sh` sampai **OVERALL PASS (38 gates)**.
8. Jalankan E2E multi-peran testing_agent_v3 untuk menutup Fase 49.

---

## 4) Success Criteria
- `python3 poc/poc_49.py` → **PASS** (tidak meninggalkan jurnal/dokumen menggantung).
- Close period: HOLD + override beralasan (audit + task) berjalan; non-privileged 403.
- Year-end close: jurnal seimbang, idempoten; reopen membuat reversal berjejak.
- Cash flow per proyek tie-out: Σ(project + unassigned) == consolidated.
- e-Faktur: replace/cancel berjejak; ekspor XML/CSV per periode tersedia; ekspor menolak data wajib yang kurang dengan daftar faktur bermasalah.
- e-Bupot: pembayaran tagihan dengan potong PPh menghasilkan NET + utang pajak + bukti potong; idempoten; PDF; pembetulan nomor tetap.
- Rekap SPT PPN periode dapat direkonstruksi.
- Gates: `bash scripts/run_all_gates.sh` → **OVERALL PASS (38 gates)**.
- `python3 scripts/mutasi_49.py` → semua mutasi **TERTANGKAP**.
- E2E multi-peran: tidak ada bug kritis.

---

## Fase 50 (disiapkan setelah Fase 49 ditutup)
- **PWA offline terpadu** untuk absensi (Fase 47) + progres + foto dalam satu antrean sinkron.
- **Serah terima unit**: BAST unit, masa garansi, klaim garansi pasca-huni terhubung punch list & komplain CS.

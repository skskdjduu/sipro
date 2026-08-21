import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import QuotationBreakdown from "@/components/quotations/QuotationBreakdown";
import api from "@/services/apiClient";
import { QUOTE } from "@/constants/testIds";

const EMPTY = {
  unit_id: "", scheme_id: "", discount_amount: 0, discount_reason: "", valid_days: "",
  note: "", kpr: { tenor_months: "", annual_rate_pct: "", dp_pct: "" }, addons: [],
};

/**
 * QuotationForm — buat/revisi penawaran dengan SIMULASI dulu.
 *
 * Kenapa simulasi wajib ada sebelum simpan: sales dulu menghitung harga di luar sistem
 * (WhatsApp/kertas), sehingga angka yang dijanjikan ke pembeli tidak bisa direkonstruksi dan
 * diskon tidak berjejak. Di sini setiap perubahan bisa dihitung ulang oleh SERVER (satu
 * mesin harga), dan bila diskon melebihi kewenangan, alasannya WAJIB diisi sebelum diajukan.
 */
export default function QuotationForm({ open, onOpenChange, leadId, source, onDone }) {
  const [form, setForm] = useState(EMPTY);
  const [units, setUnits] = useState([]);
  const [schemes, setSchemes] = useState([]);
  const [addonMaster, setAddonMaster] = useState([]);
  const [addonPick, setAddonPick] = useState("");
  const [calc, setCalc] = useState(null);
  const [simBusy, setSimBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError(""); setCalc(null); setAddonPick("");
    setForm(source ? {
      unit_id: source.unit_id || "", scheme_id: source.scheme?.id || "",
      discount_amount: source.discount_amount || 0,
      discount_reason: source.discount_reason || "", valid_days: source.valid_days || "",
      note: source.note || "",
      kpr: {
        tenor_months: source.kpr?.tenor_months || "",
        annual_rate_pct: source.kpr?.annual_rate_pct || "",
        dp_pct: source.kpr?.dp_pct || "",
      },
      addons: (source.addons || []).map((a) => ({ code: a.code, qty: a.qty || 1,
        name: a.name })),
    } : EMPTY);
    Promise.all([
      // SATU pintu master untuk layar penawaran (`quotations:view`). Sebelumnya layar
      // memanggil `/finance/config/payment-schemes` yang menuntut `finance:view` — izin yang
      // tidak dimiliki sales — sehingga `Promise.all` gagal dan SEMUA daftar (termasuk unit)
      // ikut kosong: dialog jadi tidak bisa dipakai oleh peran pemiliknya.
      api.get("/quotations/options"),
    ]).then(([o]) => {
      const d = o.data.data || {};
      const list = d.units || [];
      setUnits(source?.unit_id && !list.some((x) => x.id === source.unit_id)
        ? [{ id: source.unit_id, code: source.unit_code, price: source.base_price }, ...list]
        : list);
      setSchemes(d.schemes || []);
      setAddonMaster(d.addons || []);
    }).catch((e) => setError(e?.response?.data?.detail || "Gagal memuat data master."));
  }, [open, source]);

  const payload = useCallback(() => {
    const kpr = {
      tenor_months: form.kpr.tenor_months === "" ? null : Number(form.kpr.tenor_months),
      annual_rate_pct: form.kpr.annual_rate_pct === "" ? null
        : Number(form.kpr.annual_rate_pct),
      dp_pct: form.kpr.dp_pct === "" ? null : Number(form.kpr.dp_pct),
    };
    return {
      unit_id: form.unit_id, scheme_id: form.scheme_id || null,
      discount_amount: Number(form.discount_amount) || 0,
      addons: form.addons.map((a) => ({ code: a.code, qty: Number(a.qty) || 1 })),
      kpr,
    };
  }, [form]);

  const simulate = async () => {
    if (!form.unit_id) { setError("Pilih unit lebih dulu."); return; }
    setSimBusy(true); setError("");
    try {
      const res = await api.post("/quotations/simulate", payload());
      setCalc(res.data.data);
    } catch (e) {
      setError(e?.response?.data?.detail || "Gagal menghitung simulasi.");
    } finally { setSimBusy(false); }
  };

  const save = async () => {
    if (!form.unit_id) { setError("Pilih unit lebih dulu."); return; }
    setBusy(true); setError("");
    try {
      const body = {
        ...payload(), lead_id: leadId,
        valid_days: form.valid_days === "" ? null : Number(form.valid_days),
        note: form.note.trim() || null,
        discount_reason: form.discount_reason.trim() || null,
      };
      const res = source?.id
        ? await api.post(`/quotations/${source.id}/revise`, body)
        : await api.post("/quotations", body);
      toast.success(res.data.message || "Penawaran tersimpan.");
      onOpenChange(false);
      onDone?.(res.data.data);
    } catch (e) {
      setError(e?.response?.data?.detail || "Gagal menyimpan penawaran.");
    } finally { setBusy(false); }
  };

  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setCalc(null); };
  const setKpr = (patch) => {
    setForm((f) => ({ ...f, kpr: { ...f.kpr, ...patch } })); setCalc(null);
  };
  const addAddon = () => {
    const master = addonMaster.find((a) => a.code === addonPick);
    if (!master) return;
    if (form.addons.some((a) => a.code === master.code)) {
      toast.info("Tambahan itu sudah ada di daftar.");
      return;
    }
    set({ addons: [...form.addons, { code: master.code, qty: 1, name: master.name }] });
    setAddonPick("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={QUOTE.dialog}
        className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {source?.id ? `Revisi penawaran ${source.no}` : "Buat penawaran harga"}
          </DialogTitle>
          <DialogDescription>
            Harga, termin, dan simulasi KPR dihitung SERVER dari master yang sama dengan
            tagihan — tidak ada rumus kedua.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Unit yang ditawarkan</Label>
              <Select value={form.unit_id} onValueChange={(v) => set({ unit_id: v })}>
                <SelectTrigger data-testid={QUOTE.unitSelect} aria-label="Unit yang ditawarkan">
                  <SelectValue placeholder="Pilih unit tersedia" />
                </SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.code}{u.type ? ` · ${u.type}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Skema pembayaran</Label>
              <Select value={form.scheme_id} onValueChange={(v) => set({ scheme_id: v })}>
                <SelectTrigger data-testid={QUOTE.schemeSelect} aria-label="Skema pembayaran">
                  <SelectValue placeholder="Pakai skema bawaan" />
                </SelectTrigger>
                <SelectContent>
                  {schemes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Tambahan (add-on) dari master</Label>
              <div className="flex gap-2">
                <Select value={addonPick} onValueChange={setAddonPick}>
                  <SelectTrigger data-testid={QUOTE.addonSelect} aria-label="Tambahan add-on">
                    <SelectValue placeholder={addonMaster.length ? "Pilih tambahan"
                      : "Master add-on belum ada"} />
                  </SelectTrigger>
                  <SelectContent>
                    {addonMaster.map((a) => (
                      <SelectItem key={a.code} value={a.code}>{a.name} ({a.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="secondary" data-testid={QUOTE.addonAddBtn}
                  onClick={addAddon}><Plus className="h-4 w-4" /></Button>
              </div>
              {form.addons.map((a, i) => (
                <div key={a.code} className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5">
                  <span className="flex-1 text-sm">{a.name || a.code}</span>
                  <Input type="number" min="0.1" step="0.1" value={a.qty}
                    aria-label={`Volume tambahan ${a.name || a.code}`} className="w-24"
                    onChange={(e) => {
                      const next = [...form.addons];
                      next[i] = { ...a, qty: e.target.value };
                      set({ addons: next });
                    }} />
                  <Button type="button" size="sm" variant="ghost"
                    aria-label={`Hapus tambahan ${a.name || a.code}`}
                    onClick={() => set({ addons: form.addons.filter((x) => x.code !== a.code) })}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="q-disc">Potongan harga (Rp)</Label>
                <Input id="q-disc" type="number" data-testid={QUOTE.discount}
                  value={form.discount_amount}
                  onChange={(e) => set({ discount_amount: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="q-valid">Masa berlaku (hari)</Label>
                <Input id="q-valid" type="number" value={form.valid_days} placeholder="7"
                  onChange={(e) => set({ valid_days: e.target.value })} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="q-disc-reason">Alasan diskon (wajib bila di atas kewenangan)</Label>
              <Textarea id="q-disc-reason" rows={2} data-testid={QUOTE.discountReason}
                value={form.discount_reason}
                placeholder="Mis. pembeli membandingkan dengan kompetitor; margin masih sehat."
                onChange={(e) => set({ discount_reason: e.target.value })} />
            </div>

            <div className="rounded-lg border bg-secondary/40 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Simulasi KPR (opsional)
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="q-kpr-tenor">Tenor (bulan)</Label>
                  <Input id="q-kpr-tenor" type="number" data-testid={QUOTE.kprTenor}
                    className="bg-background" value={form.kpr.tenor_months}
                    onChange={(e) => setKpr({ tenor_months: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="q-kpr-rate">Bunga (% / tahun)</Label>
                  <Input id="q-kpr-rate" type="number" step="0.1" data-testid={QUOTE.kprRate}
                    className="bg-background" value={form.kpr.annual_rate_pct}
                    onChange={(e) => setKpr({ annual_rate_pct: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="q-kpr-dp">DP (%)</Label>
                  <Input id="q-kpr-dp" type="number" step="0.5" data-testid={QUOTE.kprDp}
                    className="bg-background" value={form.kpr.dp_pct}
                    onChange={(e) => setKpr({ dp_pct: e.target.value })} />
                </div>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Dibiarkan kosong = simulasi ditulis “belum ada data” (bukan Rp 0).
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="q-note">Catatan untuk pembeli</Label>
              <Textarea id="q-note" rows={2} value={form.note}
                onChange={(e) => set({ note: e.target.value })} />
            </div>
          </div>

          <div className="space-y-3">
            <Button type="button" variant="secondary" className="w-full"
              data-testid={QUOTE.simulateBtn} disabled={simBusy} onClick={simulate}>
              <RefreshCw className={`mr-1.5 h-4 w-4 ${simBusy ? "animate-spin" : ""}`} />
              Hitung simulasi
            </Button>
            {error ? (
              <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            ) : null}
            {calc ? <QuotationBreakdown calc={calc} /> : (
              <p className="rounded-lg border border-dashed bg-card p-4 text-sm text-muted-foreground">
                Tekan “Hitung simulasi” untuk melihat rincian harga, termin, dan angsuran KPR
                sebelum penawaran disimpan.
              </p>
            )}
            {calc?.needs_discount_approval ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Diskon {calc.discount_pct}% melebihi kewenangan ({calc.discount_limit_pct}%) —
                penawaran akan berstatus <b>menunggu persetujuan</b> manajer dan alasan diskon
                wajib diisi.
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button data-testid={QUOTE.submitBtn} disabled={busy} onClick={save}>
            {busy ? "Menyimpan…" : (source?.id ? "Simpan revisi" : "Simpan penawaran")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Lock, LockOpen, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import EmptyState from "@/components/patterns/EmptyState";
import MetricCard from "@/components/patterns/MetricCard";
import StatusPill from "@/components/patterns/StatusPill";
import { ErrorState, LoadingCards } from "@/components/patterns/StateViews";
import { useAuth } from "@/context/AuthContext";
import { formatIDR } from "@/utils/formatters";
import api from "@/services/apiClient";
import { SUBFIN as T } from "@/constants/testIds";

/**
 * RetentionsPanel (Fase 48C) — daftar retensi + GERBANG pencairan.
 *
 * Sebelum fase ini `retention_held` hanya menumpuk di tagihan: uang subkon tertahan di
 * pembukuan tanpa daftar, tanpa masa pemeliharaan, dan tanpa jalan pencairan. Sekarang setiap
 * termin yang disetujui melahirkan baris di sini, lengkap dengan SEBAB kalau belum bisa
 * dicairkan (masa pemeliharaan / temuan punch list) — bukan sekadar tombol mati.
 */
export default function RetentionsPanel() {
  const { can } = useAuth();
  const canRequest = can("subcon_finance", "create");
  const canRelease = can("subcon_finance", "manage");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [action, setAction] = useState(null);   // {row, mode}

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await api.get("/subcon/retentions");
      setData(r.data);
    } catch (e) {
      setError(e?.response?.data?.detail || "Gagal memuat daftar retensi.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const s = data?.summary;
  if (loading) return <LoadingCards count={3} />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div data-testid={T.retentionPanel} className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Retensi ditahan" value={s?.held_value ?? 0} tone="amber" format="idr" />
        <MetricCard label="Sudah dicairkan" value={s?.released_value ?? 0} tone="emerald"
          format="idr" />
        <MetricCard label="Siap dicairkan" value={s?.ready ?? 0} tone="indigo" />
        <MetricCard label="Masih tertahan syarat" value={s?.blocked ?? 0} tone="rose" />
      </div>

      {!data?.data?.length ? (
        <EmptyState icon={Lock} title="Belum ada retensi tercatat"
          description={"Retensi lahir saat termin subkon DISETUJUI. Setiap baris punya masa "
            + "pemeliharaan sendiri dan hanya bisa dicairkan setelah syaratnya terpenuhi."} />
      ) : (
        <div className="space-y-2">
          {data.data.map((r) => {
            const gate = r.gate || {};
            const released = r.state === "released";
            return (
              <div key={r.id} data-testid={T.retentionRow} data-state={r.state}
                className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {r.retention_number}</span>
                      <StatusPill status={r.state} group="retention_state" />
                      {r.claim_number ? (
                        <span className="text-[11px] text-muted-foreground">
                          dari termin {r.claim_number}</span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 font-medium">{r.subcontractor_name}</p>
                    <p className="text-xs text-muted-foreground">
                      SPK {r.spk_number} · retensi {r.retention_pct}% · masa pemeliharaan
                      {" "}{r.maintenance_days} hari (s/d {r.maintenance_until})
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-heading text-lg font-semibold tabular-nums">
                      {formatIDR(r.amount)}</p>
                    {released ? (
                      <p className="text-[11px] text-emerald-700">
                        dicairkan {String(r.released_at || "").slice(0, 10)}
                        {r.journal_no ? ` · jurnal ${r.journal_no}` : ""}</p>
                    ) : null}
                  </div>
                </div>

                {!released ? (
                  <div data-testid={T.retentionGate}
                    className={`mt-3 rounded-lg border p-3 text-sm ${gate.ok
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                    <p className="flex items-center gap-1.5 font-medium">
                      {gate.ok ? <LockOpen className="h-4 w-4" />
                        : <ShieldAlert className="h-4 w-4" />}
                      {gate.ok ? "Syarat pencairan terpenuhi"
                        : "Belum bisa dicairkan"}
                    </p>
                    {(gate.blocks || []).map((b) => (
                      <p key={b.code} className="mt-1 text-xs">• {b.detail}</p>
                    ))}
                    {gate.ok ? (
                      <p className="mt-1 text-xs">
                        Masa pemeliharaan lewat dan tidak ada temuan punch list terbuka
                        {gate.punch_scope ? ` ${gate.punch_scope}` : ""}.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {!released ? (
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    {r.state === "held" && canRequest ? (
                      <Button data-testid={T.retentionRequestBtn} size="sm" variant="outline"
                        disabled={!gate.ok}
                        title={gate.ok ? undefined
                          : "Syarat pencairan belum terpenuhi — lihat sebabnya di atas."}
                        onClick={() => setAction({ row: r, mode: "request" })}>
                        Ajukan pencairan
                      </Button>
                    ) : null}
                    {r.state === "release_requested" && canRelease ? (
                      <Button data-testid={T.retentionReleaseBtn} size="sm"
                        onClick={() => setAction({ row: r, mode: "release" })}>
                        Cairkan retensi
                      </Button>
                    ) : null}
                    {r.state === "release_requested" && !canRelease ? (
                      <p className="text-xs text-muted-foreground">
                        Menunggu pencairan oleh Manajer Keuangan
                        {r.requested_by ? ` (diajukan ${r.requested_by})` : ""}.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <ReasonDialog action={action} onOpenChange={() => setAction(null)}
        onDone={() => { setAction(null); load(); }} />
    </div>
  );
}

function ReasonDialog({ action, onOpenChange, onDone }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setReason(""); }, [action]);

  const submit = async () => {
    if (reason.trim().length < 10) {
      toast.error("Alasan minimal 10 huruf — pencairan retensi mengeluarkan uang."); return;
    }
    setBusy(true);
    try {
      const url = action.mode === "request"
        ? `/subcon/retentions/${action.row.id}/request-release`
        : `/subcon/retentions/${action.row.id}/release`;
      const r = await api.post(url, { reason: reason.trim() });
      toast.success(action.mode === "request"
        ? "Pencairan diajukan ke Manajer Keuangan."
        : `Retensi dicairkan — jurnal ${r.data.journal_no}. Siap dibayar lewat Utang (AP).`);
      onDone && onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Gagal memproses retensi.");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!action} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {action?.mode === "request" ? "Ajukan pencairan retensi" : "Cairkan retensi"}
          </DialogTitle>
          <DialogDescription>
            {action?.row?.retention_number} · {formatIDR(action?.row?.amount)} untuk{" "}
            {action?.row?.subcontractor_name}.
            {action?.mode === "release"
              ? " Pencairan memindahkan Utang Retensi menjadi Utang Usaha yang siap dibayar."
              : " Pengajuan akan diperiksa ulang syaratnya oleh sistem saat dicairkan."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="ret-reason">Alasan</Label>
          <Textarea id="ret-reason" data-testid={T.retentionReason} rows={3} value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="mis. masa pemeliharaan selesai, seluruh temuan sudah diperbaiki & ditutup" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Batal</Button>
          <Button data-testid={T.retentionSubmit} onClick={submit} disabled={busy}>
            {busy ? "Memproses…" : "Simpan"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

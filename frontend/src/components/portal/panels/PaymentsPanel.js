import React, { useEffect, useState } from "react";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import StatusPill from "@/components/patterns/StatusPill";
import { LoadingCards, ErrorState } from "@/components/patterns/StateViews";
import PaymentProofDialog from "@/components/portal/PaymentProofDialog";
import { formatIDR, formatDateWIB } from "@/utils/formatters";
import portalApi from "@/services/portalClient";
import { PORTAL, INTAKE } from "@/constants/testIds";

/** Label status bukti transfer untuk pembeli (portal tidak memuat sesi staf/SSOT). */
function proofLabel(state) {
  if (state === "pending") return "Menunggu verifikasi";
  if (state === "verified") return "Terverifikasi";
  if (state === "rejected") return "Ditolak";
  return state || "-";
}

export default function PaymentsPanel() {
  const [data, setData] = useState(null);
  const [proofs, setProofs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [proofDeal, setProofDeal] = useState(null);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const [res, sub] = await Promise.all([
        portalApi.get("/portal/payments"),
        portalApi.get("/portal/payments/submissions")
          .catch(() => ({ data: { data: [] } })),
      ]);
      setData(res.data.data || []);
      setProofs(sub.data.data || []);
    } catch (e) {
      setError(e?.response?.data?.detail || "Gagal memuat pembayaran.");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (loading) return <LoadingCards count={3} />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data?.length) {
    return (
      <p className="rounded-xl border bg-white p-6 text-center text-sm text-slate-500">
        Belum ada tagihan.
      </p>
    );
  }

  return (
    <div data-testid={PORTAL.paymentsPanel} className="space-y-6">
      {data.map((p) => (
        <div key={p.deal_id} className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs text-slate-500">Total Harga</p>
              <p className="mt-1 text-base font-semibold tabular-nums">
                {formatIDR(p.summary?.total)}
              </p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs text-slate-500">Sudah Dibayar</p>
              <p className="mt-1 text-base font-semibold tabular-nums text-emerald-600">
                {formatIDR(p.summary?.paid)}
              </p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs text-slate-500">Sisa</p>
              <p className="mt-1 text-base font-semibold tabular-nums text-rose-600">
                {formatIDR(p.summary?.outstanding)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
            <p className="text-sm text-sky-900">
              Sudah transfer? Kirimkan buktinya agar bagian keuangan bisa memverifikasi.
              <span className="block text-xs text-sky-800">
                Tagihan berkurang setelah bukti diverifikasi — bukan saat bukti dikirim.
              </span>
            </p>
            <Button size="sm" data-testid={INTAKE.portalAddBtn}
              onClick={() => setProofDeal({ deal_id: p.deal_id, unit_code: p.unit_code,
                summary: p.summary })}>
              <Upload className="mr-1.5 h-4 w-4" /> Kirim bukti transfer
            </Button>
          </div>

          <div className="rounded-xl border bg-white">
            <div className="border-b px-4 py-2.5 text-sm font-semibold">
              Jadwal Pembayaran (Termin)
            </div>
            <div className="divide-y">
              {(p.schedule || []).map((s) => (
                <div key={s.id} data-testid={PORTAL.paymentRow}
                  className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div>
                    <p className="font-medium">{s.label}</p>
                    <p className="text-xs text-slate-400">Jatuh tempo {formatDateWIB(s.due_date)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums">{formatIDR(s.amount)}</span>
                    <StatusPill status={s.status}
                      label={s.status === "paid" ? "Lunas"
                        : s.status === "partial" ? "Sebagian" : "Belum"} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {(p.receipts || []).length > 0 && (
            <div className="rounded-xl border bg-white">
              <div className="border-b px-4 py-2.5 text-sm font-semibold">Riwayat Penerimaan</div>
              <div className="divide-y">
                {p.receipts.map((r) => (
                  <div key={r.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="text-slate-500">
                      {formatDateWIB(r.created_at)} · {r.method || "transfer"}
                    </span>
                    <span className="tabular-nums text-emerald-600">{formatIDR(r.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}

      <div data-testid={INTAKE.portalSection} className="rounded-xl border bg-white">
        <div className="border-b px-4 py-2.5 text-sm font-semibold">Bukti transfer yang Anda kirim</div>
        {!proofs.length ? (
          <p className="px-4 py-5 text-center text-sm text-slate-500">
            Belum ada bukti transfer yang dikirim. Gunakan tombol “Kirim bukti transfer” di atas.
          </p>
        ) : (
          <div className="divide-y">
            {proofs.map((s) => (
              <div key={s.id} data-testid={INTAKE.portalRow} data-state={s.state}
                className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium tabular-nums">{formatIDR(s.amount)}</p>
                    <p className="text-xs text-slate-500">
                      Transfer {formatDateWIB(s.transfer_date)}
                      {s.bank_name ? ` · ${s.bank_name}` : ""} · unit {s.unit_code || "-"}
                    </p>
                  </div>
                  <StatusPill status={s.state} label={proofLabel(s.state)} />
                </div>
                {s.state === "rejected" && s.reject_reason ? (
                  <p className="mt-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    Alasan penolakan: {s.reject_reason}
                  </p>
                ) : null}
                {s.state === "pending" ? (
                  <p className="mt-1.5 text-xs text-amber-700">
                    Menunggu verifikasi keuangan — sisa tagihan belum berubah.
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <PaymentProofDialog open={!!proofDeal} onOpenChange={(v) => !v && setProofDeal(null)}
        deal={proofDeal} onDone={load} />
    </div>
  );
}

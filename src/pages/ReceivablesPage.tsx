import React, { useMemo, useState } from 'react';
import {
  Plus,
  Search,
  AlertCircle,
  CreditCard,
  Printer,
  CheckCircle2,
  CalendarClock,
} from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { getInstallmentStatus, getPlanMetrics } from '../lib/calculations';
import { formatDate, formatDateTime, formatRupiah, toLocalDateISO } from '../lib/format';
import { InstallmentFrequency, PaymentPlan } from '../types/erp';
import { Modal, PlanStatusBadge } from '../components/ui/SharedUi';

export const ReceivablesPage: React.FC = () => {
  const {
    db,
    can,
    recordInstallmentPayment,
    createManualPaymentPlan,
    openPrint,
    showToast,
  } = useErp();

  const today = toLocalDateISO();
  const [filterTab, setFilterTab] = useState<'ALL' | 'ACTIVE' | 'OVERDUE' | 'PAID' | 'VOIDED'>(
    'ALL'
  );
  const [search, setSearch] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState<string>(db.paymentPlans[0]?.id || '');

  // Payment Modal
  const [payModalPlan, setPayModalPlan] = useState<PaymentPlan | null>(null);
  const [payAmount, setPayAmount] = useState<string>('');
  const [payMethod, setPayMethod] = useState<'CASH' | 'TRANSFER' | 'QRIS'>('TRANSFER');
  const [payNotes, setPayNotes] = useState('');

  // Manual Plan Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [custId, setCustId] = useState(db.customers[0]?.id || '');
  const [principal, setPrincipal] = useState<number>(2000000);
  const [dp, setDp] = useState<number>(500000);
  const [rate, setRate] = useState<number>(2);
  const [freq, setFreq] = useState<InstallmentFrequency>('WEEKLY');
  const [tenor, setTenor] = useState<number>(4);
  const [manualInvoice, setManualInvoice] = useState('');
  const [manualNotes, setManualNotes] = useState('');

  const enrichedPlans = useMemo(() => {
    return db.paymentPlans.map((plan) => ({
      plan,
      metrics: getPlanMetrics(plan, today),
    }));
  }, [db.paymentPlans, today]);

  const summary = useMemo(() => {
    let totalRemaining = 0;
    let totalCollected = 0;
    let totalOverdueAmount = 0;
    let overduePlans = 0;

    for (const { plan, metrics } of enrichedPlans) {
      if (plan.status === 'VOIDED') continue;
      totalCollected += metrics.totalPaid + plan.downPayment;
      if (plan.status === 'ACTIVE') {
        totalRemaining += metrics.remainingBalance;
        if (metrics.isOverdue) {
          overduePlans += 1;
          totalOverdueAmount += metrics.overdueAmount;
        }
      }
    }
    return { totalRemaining, totalCollected, totalOverdueAmount, overduePlans };
  }, [enrichedPlans]);

  const filteredPlans = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enrichedPlans.filter(({ plan, metrics }) => {
      if (filterTab === 'ACTIVE' && plan.status !== 'ACTIVE') return false;
      if (filterTab === 'OVERDUE' && !(plan.status === 'ACTIVE' && metrics.isOverdue)) return false;
      if (filterTab === 'PAID' && plan.status !== 'PAID') return false;
      if (filterTab === 'VOIDED' && plan.status !== 'VOIDED') return false;
      if (
        q &&
        !plan.customerName.toLowerCase().includes(q) &&
        !plan.planNumber.toLowerCase().includes(q) &&
        !(plan.invoiceNumber || '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [enrichedPlans, filterTab, search]);

  const selectedItem = useMemo(() => {
    return (
      enrichedPlans.find((e) => e.plan.id === selectedPlanId) ||
      filteredPlans[0] ||
      enrichedPlans[0] ||
      null
    );
  }, [enrichedPlans, filteredPlans, selectedPlanId]);

  const openPayModal = (plan: PaymentPlan) => {
    const m = getPlanMetrics(plan, today);
    const nextUnpaid = plan.schedule.find((it) => it.amount - it.paidAmount > 0);
    const defaultAmt = nextUnpaid ? nextUnpaid.amount - nextUnpaid.paidAmount : m.remainingBalance;
    setPayModalPlan(plan);
    setPayAmount(String(defaultAmt));
    setPayMethod('TRANSFER');
    setPayNotes('');
  };

  const handlePaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModalPlan) return;
    try {
      const res = recordInstallmentPayment({
        planId: payModalPlan.id,
        amount: Number(payAmount) || 0,
        paymentMethod: payMethod,
        notes: payNotes,
      });
      setPayModalPlan(null);
      setSelectedPlanId(res.plan.id);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal mencatat cicilan.');
    }
  };

  const handleCreateManual = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = createManualPaymentPlan({
        customerId: custId,
        principalAmount: principal,
        downPayment: dp,
        interestRate: rate,
        frequency: freq,
        tenorCount: tenor,
        invoiceNumber: manualInvoice,
        notes: manualNotes,
      });
      setCreateOpen(false);
      setSelectedPlanId(created.id);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal membuat skema kredit.');
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Summary */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-[#1A1614]">
            Manajemen Piutang &amp; Jadwal Cicilan
          </h2>
          <p className="text-xs text-[#6B6257]">
            Pantau jatuh tempo, keterlambatan otomatis, pembayaran bertahap, dan cetak kuitansi.
          </p>
        </div>
        {can('receivables:create') && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-bold cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Buat Skema Kredit Manual
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E6E0D6] rounded-xl p-4">
          <p className="text-xs font-bold uppercase text-[#6B6257]">Sisa Piutang Aktif</p>
          <p className="text-xl font-extrabold text-[#1A1614] tabular-nums mt-1.5">
            {formatRupiah(summary.totalRemaining)}
          </p>
        </div>
        <div className="bg-white border border-[#E6E0D6] rounded-xl p-4">
          <p className="text-xs font-bold uppercase text-[#6B6257]">Total Tertagih (DP + Cicilan)</p>
          <p className="text-xl font-extrabold text-emerald-700 tabular-nums mt-1.5">
            {formatRupiah(summary.totalCollected)}
          </p>
        </div>
        <div className="bg-white border border-[#E6E0D6] rounded-xl p-4">
          <p className="text-xs font-bold uppercase text-[#6B6257]">Nominal Terlambat (Overdue)</p>
          <p className="text-xl font-extrabold text-rose-700 tabular-nums mt-1.5">
            {formatRupiah(summary.totalOverdueAmount)}
          </p>
        </div>
        <div className="bg-white border border-[#E6E0D6] rounded-xl p-4">
          <p className="text-xs font-bold uppercase text-[#6B6257]">Tagihan Lewat Jatuh Tempo</p>
          <p className="text-xl font-extrabold text-rose-700 tabular-nums mt-1.5">
            {summary.overduePlans} Pelanggan
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#E6E0D6] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: 'ALL', label: 'Semua' },
              { id: 'OVERDUE', label: 'Terlambat' },
              { id: 'ACTIVE', label: 'Berjalan' },
              { id: 'PAID', label: 'Lunas' },
              { id: 'VOIDED', label: 'Dibatalkan' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilterTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                filterTab === t.id
                  ? 'bg-[#14110F] text-white'
                  : 'bg-[#F1EDE5] text-[#5C5349] hover:bg-[#E6E0D6]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-[#8A7F73] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari pelanggan / no. kredit..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-[#D8D0C5] text-xs"
          />
        </div>
      </div>

      {/* Master-Detail View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Plans List */}
        <div className="lg:col-span-5 space-y-2.5">
          {filteredPlans.map(({ plan, metrics }) => {
            const isSelected = selectedItem?.plan.id === plan.id;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlanId(plan.id)}
                className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-white border-[#B91C1C] ring-1 ring-[#B91C1C] shadow-sm'
                    : 'bg-white border-[#E6E0D6] hover:border-[#B8860B]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-[#1A1614] truncate">
                      {plan.customerName}
                    </p>
                    <p className="font-mono text-[11px] text-[#6B6257] mt-0.5">
                      {plan.planNumber}
                      {plan.invoiceNumber ? ` • ${plan.invoiceNumber}` : ''}
                    </p>
                  </div>
                  <PlanStatusBadge status={plan.status} isOverdue={metrics.isOverdue} />
                </div>

                <div className="mt-3 pt-2.5 border-t border-[#F1EDE5] flex items-center justify-between text-xs">
                  <div>
                    <p className="text-[#6B6257]">Sisa Kewajiban</p>
                    <p className="font-extrabold text-[#1A1614] tabular-nums">
                      {formatRupiah(metrics.remainingBalance)}
                    </p>
                  </div>
                  <div className="text-right">
                    {metrics.isOverdue ? (
                      <span className="inline-flex items-center gap-1 text-rose-700 font-bold">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Telat {metrics.maxOverdueDays} hari
                      </span>
                    ) : metrics.nextDueDate ? (
                      <span className="text-[#5C5349]">
                        Jatuh tempo: {formatDate(metrics.nextDueDate)}
                      </span>
                    ) : (
                      <span className="text-emerald-700 font-semibold">Selesai</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
          {filteredPlans.length === 0 && (
            <div className="bg-white border border-[#E6E0D6] rounded-xl p-8 text-center text-xs text-[#6B6257]">
              Tidak ada skema piutang yang sesuai filter.
            </div>
          )}
        </div>

        {/* Selected Plan Detail */}
        <div className="lg:col-span-7 bg-white border border-[#E6E0D6] rounded-xl p-5 shadow-xs">
          {!selectedItem ? (
            <div className="py-12 text-center text-xs text-[#6B6257]">
              Pilih salah satu skema piutang untuk melihat jadwal angsuran.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E6E0D6] pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-extrabold text-[#1A1614]">
                      {selectedItem.plan.customerName}
                    </h3>
                    <PlanStatusBadge
                      status={selectedItem.plan.status}
                      isOverdue={selectedItem.metrics.isOverdue}
                    />
                  </div>
                  <p className="font-mono text-xs text-[#6B6257] mt-1">
                    {selectedItem.plan.planNumber}
                    {selectedItem.plan.invoiceNumber
                      ? ` • Invoice ${selectedItem.plan.invoiceNumber}`
                      : ''}
                  </p>
                </div>

                {selectedItem.plan.status === 'ACTIVE' && can('receivables:pay') && (
                  <button
                    type="button"
                    onClick={() => openPayModal(selectedItem.plan)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-bold cursor-pointer"
                  >
                    <CreditCard className="w-4 h-4" />
                    Catat Bayar Cicilan
                  </button>
                )}
              </div>

              {selectedItem.metrics.isOverdue && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>
                    <strong>Peringatan Keterlambatan:</strong>{' '}
                    {selectedItem.metrics.overdueInstallmentCount} termin telah melewati jatuh tempo
                    (keterlambatan tertinggi <strong>{selectedItem.metrics.maxOverdueDays} hari</strong>
                    , tunggakan {formatRupiah(selectedItem.metrics.overdueAmount)}).
                  </span>
                </div>
              )}

              {/* Financial Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#F8F6F2] border border-[#E6E0D6] rounded-lg p-3.5 text-xs tabular-nums">
                <div>
                  <p className="text-[#6B6257]">Pokok Awal</p>
                  <p className="font-bold mt-0.5">
                    {formatRupiah(selectedItem.plan.principalAmount)}
                  </p>
                </div>
                <div>
                  <p className="text-[#6B6257]">DP / Uang Muka</p>
                  <p className="font-bold mt-0.5">{formatRupiah(selectedItem.plan.downPayment)}</p>
                </div>
                <div>
                  <p className="text-[#6B6257]">
                    Total Kewajiban (+{selectedItem.plan.interestRate}%)
                  </p>
                  <p className="font-bold mt-0.5">{formatRupiah(selectedItem.plan.totalPayable)}</p>
                </div>
                <div>
                  <p className="text-[#6B6257]">Sisa Piutang</p>
                  <p className="font-extrabold text-[#B91C1C] mt-0.5">
                    {formatRupiah(selectedItem.metrics.remainingBalance)}
                  </p>
                </div>
              </div>

              {/* Installment Schedule */}
              <div>
                <div className="flex items-center gap-2 text-xs font-extrabold text-[#1A1614] mb-2">
                  <CalendarClock className="w-4 h-4 text-[#B8860B]" />
                  Jadwal Angsuran ({selectedItem.plan.tenorCount}x{' '}
                  {selectedItem.plan.frequency === 'WEEKLY' ? 'Mingguan' : 'Bulanan'})
                </div>
                <div className="border border-[#E6E0D6] rounded-lg overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#F8F6F2] border-b border-[#E6E0D6] text-[#5C5349]">
                      <tr>
                        <th className="py-2 px-3">Termin</th>
                        <th className="py-2 px-3">Jatuh Tempo</th>
                        <th className="py-2 px-3 text-right">Tagihan</th>
                        <th className="py-2 px-3 text-right">Terbayar</th>
                        <th className="py-2 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EDE7DD] tabular-nums">
                      {selectedItem.plan.schedule.map((item) => {
                        const st = getInstallmentStatus(item, today);
                        return (
                          <tr key={item.index}>
                            <td className="py-2 px-3 font-bold">Ke-{item.index}</td>
                            <td className="py-2 px-3">{formatDate(item.dueDate)}</td>
                            <td className="py-2 px-3 text-right font-semibold">
                              {formatRupiah(item.amount)}
                            </td>
                            <td className="py-2 px-3 text-right text-emerald-700 font-semibold">
                              {formatRupiah(item.paidAmount)}
                            </td>
                            <td className="py-2 px-3">
                              {selectedItem.plan.status === 'VOIDED' ? (
                                <span className="text-stone-400">Void</span>
                              ) : st.status === 'PAID' ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Lunas
                                </span>
                              ) : st.status === 'OVERDUE' ? (
                                <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold">
                                  Telat {st.overdueDays} hr
                                </span>
                              ) : st.status === 'PARTIAL' ? (
                                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
                                  Sebagian
                                </span>
                              ) : (
                                <span className="text-[#6B6257]">Menunggu</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Payment History & Receipts */}
              <div>
                <h4 className="text-xs font-extrabold text-[#1A1614] mb-2">
                  Riwayat Pembayaran &amp; Kuitansi Resmi ({selectedItem.plan.payments.length})
                </h4>
                {selectedItem.plan.payments.length === 0 ? (
                  <p className="text-xs text-[#6B6257] py-3 border border-dashed border-[#D8D0C5] rounded-lg text-center">
                    Belum ada setoran angsuran yang masuk.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedItem.plan.payments.map((pay) => {
                      const cust = db.customers.find(
                        (c) => c.id === selectedItem.plan.customerId
                      );
                      return (
                        <div
                          key={pay.id}
                          className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg border border-[#E6E0D6] bg-[#FAF8F4] text-xs"
                        >
                          <div>
                            <p className="font-mono font-bold text-[#1A1614]">
                              {pay.receiptNumber} • {formatRupiah(pay.amount)}
                            </p>
                            <p className="text-[#6B6257]">
                              {formatDateTime(pay.paidAt)} • {pay.paymentMethod} • Diterima{' '}
                              {pay.receivedByName}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              openPrint({
                                kind: 'kuitansi',
                                plan: selectedItem.plan,
                                payment: pay,
                                customer: cust,
                              })
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#14110F] text-white font-bold hover:bg-[#B91C1C] cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            Cetak Kuitansi
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Record Payment Modal */}
      <Modal
        open={Boolean(payModalPlan)}
        onClose={() => setPayModalPlan(null)}
        title="Catat Pembayaran Cicilan"
        subtitle={
          payModalPlan
            ? `${payModalPlan.planNumber} — ${payModalPlan.customerName}`
            : undefined
        }
      >
        {payModalPlan && (
          <form onSubmit={handlePaySubmit} className="space-y-4 text-sm">
            {(() => {
              const m = getPlanMetrics(payModalPlan, today);
              return (
                <div className="p-3 rounded-lg bg-[#F8F6F2] border border-[#E6E0D6] flex justify-between text-xs">
                  <span>Sisa Kewajiban Saat Ini:</span>
                  <span className="font-extrabold text-[#B91C1C] tabular-nums">
                    {formatRupiah(m.remainingBalance)}
                  </span>
                </div>
              );
            })()}
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-bold text-[#5C5349]">Nominal Bayar (Rp) *</label>
                <button
                  type="button"
                  onClick={() =>
                    setPayAmount(String(getPlanMetrics(payModalPlan, today).remainingBalance))
                  }
                  className="text-xs font-bold text-[#B91C1C] hover:underline cursor-pointer"
                >
                  Lunasi Penuh
                </button>
              </div>
              <input
                type="number"
                required
                min={1}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5] font-mono font-bold tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5C5349] mb-1">Metode Bayar</label>
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value as 'CASH' | 'TRANSFER' | 'QRIS')}
                className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5] bg-white"
              >
                <option value="TRANSFER">Transfer Bank</option>
                <option value="CASH">Tunai (Cash)</option>
                <option value="QRIS">QRIS</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5C5349] mb-1">
                Catatan Pembayaran
              </label>
              <input
                type="text"
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                placeholder="Contoh: Transfer BCA termin ke-2"
                className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPayModalPlan(null)}
                className="px-4 py-2 rounded-lg border border-[#D8D0C5] text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#B91C1C] text-white text-xs font-bold cursor-pointer"
              >
                Simpan &amp; Terbitkan Kuitansi
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Manual Payment Plan Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Buat Skema Kredit / Piutang Manual"
        subtitle="Untuk pencatatan piutang di luar transaksi kasir langsung"
      >
        <form onSubmit={handleCreateManual} className="space-y-3.5 text-sm">
          <div>
            <label className="block text-xs font-bold text-[#5C5349] mb-1">Pelanggan *</label>
            <select
              value={custId}
              onChange={(e) => setCustId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5] bg-white"
            >
              {db.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.type})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#5C5349] mb-1">
                Pokok Hutang (Rp) *
              </label>
              <input
                type="number"
                required
                min={1}
                value={principal}
                onChange={(e) => setPrincipal(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5] font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5C5349] mb-1">
                Uang Muka / DP (Rp)
              </label>
              <input
                type="number"
                min={0}
                value={dp}
                onChange={(e) => setDp(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5] font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5C5349] mb-1">Frekuensi</label>
              <select
                value={freq}
                onChange={(e) => setFreq(e.target.value as InstallmentFrequency)}
                className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5] bg-white"
              >
                <option value="WEEKLY">Mingguan</option>
                <option value="MONTHLY">Bulanan</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5C5349] mb-1">Tenor (Termin)</label>
              <input
                type="number"
                min={1}
                max={60}
                value={tenor}
                onChange={(e) => setTenor(Number(e.target.value) || 1)}
                className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5] font-mono tabular-nums"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#5C5349] mb-1">Bunga (%)</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={rate}
                onChange={(e) => setRate(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5] font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5C5349] mb-1">
                Ref. Invoice (Opsional)
              </label>
              <input
                type="text"
                value={manualInvoice}
                onChange={(e) => setManualInvoice(e.target.value)}
                placeholder="IDB-..."
                className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#5C5349] mb-1">Catatan</label>
            <input
              type="text"
              value={manualNotes}
              onChange={(e) => setManualNotes(e.target.value)}
              placeholder="Keterangan skema piutang..."
              className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="px-4 py-2 rounded-lg border border-[#D8D0C5] text-xs font-bold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#B91C1C] text-white text-xs font-bold cursor-pointer"
            >
              Generate Jadwal Cicilan
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

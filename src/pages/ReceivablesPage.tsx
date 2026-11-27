import React, { useMemo, useState } from 'react';
import {
  Plus,
  Search,
  AlertCircle,
  CreditCard,
  Printer,
  CheckCircle2,
  CalendarClock,
  Download,
  MessageCircle,
  Layers,
  FileSpreadsheet,
} from 'lucide-react';
import { useErp } from '../context/ErpContext';
import {
  calcReceivablesAging,
  getInstallmentStatus,
  getPlanMetrics,
  previewCustomerFifoAllocation,
} from '../lib/calculations';
import { downloadCsv } from '../lib/csv';
import {
  formatDate,
  formatDateTime,
  formatRupiah,
  formatWhatsAppUrl,
  toLocalDateISO,
} from '../lib/format';
import { InstallmentFrequency, PaymentPlan } from '../types/erp';
import { EmptyState, Modal, PlanStatusBadge } from '../components/ui/SharedUi';

export const ReceivablesPage: React.FC = () => {
  const {
    db,
    can,
    recordInstallmentPayment,
    recordCustomerBulkPayment,
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

  // Single-Plan Payment Modal
  const [payModalPlan, setPayModalPlan] = useState<PaymentPlan | null>(null);
  const [payAmount, setPayAmount] = useState<string>('');
  const [payMethod, setPayMethod] = useState<'CASH' | 'TRANSFER' | 'QRIS'>('TRANSFER');
  const [payTransferRef, setPayTransferRef] = useState('');
  const [payNotes, setPayNotes] = useState('');

  // Smart FIFO Bulk Transfer Settlement Modal (B2B Multi-Invoice)
  const [fifoOpen, setFifoOpen] = useState(false);
  const [fifoCustomerId, setFifoCustomerId] = useState('');
  const [fifoAmount, setFifoAmount] = useState('');
  const [fifoMethod, setFifoMethod] = useState<'TRANSFER' | 'CASH' | 'QRIS'>('TRANSFER');
  const [fifoRef, setFifoRef] = useState('');
  const [fifoNotes, setFifoNotes] = useState('');

  // Manual Plan Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [custId, setCustId] = useState(db.customers[0]?.id || '');
  const [principal, setPrincipal] = useState<number>(10000000);
  const [dp, setDp] = useState<number>(2000000);
  const [rate, setRate] = useState<number>(0);
  const [freq, setFreq] = useState<InstallmentFrequency>('FLEXIBLE');
  const [tenor, setTenor] = useState<number>(3);
  const [tempoDays, setTempoDays] = useState<number>(30);
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

  const aging = useMemo(
    () => calcReceivablesAging(db.paymentPlans, today),
    [db.paymentPlans, today]
  );

  const handleExportReceivables = () => {
    downloadCsv(
      `piutang-cicilan-${today}.csv`,
      ['No Kredit', 'No Invoice', 'Pelanggan', 'Total Kewajiban', 'Terbayar', 'Sisa Piutang', 'Status', 'Hari Terlambat'],
      enrichedPlans.map(({ plan, metrics }) => [
        plan.planNumber,
        plan.invoiceNumber || '',
        plan.customerName,
        plan.totalPayable,
        metrics.totalPaid,
        metrics.remainingBalance,
        metrics.isOverdue ? 'TERLAMBAT' : plan.status,
        metrics.maxOverdueDays,
      ])
    );
  };

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

  const activeDebtCustomers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; remaining: number; count: number }>();
    for (const { plan, metrics } of enrichedPlans) {
      if (plan.status !== 'ACTIVE' || metrics.remainingBalance <= 0) continue;
      const curr = map.get(plan.customerId) || {
        id: plan.customerId,
        name: plan.customerName,
        remaining: 0,
        count: 0,
      };
      curr.remaining += metrics.remainingBalance;
      curr.count += 1;
      map.set(plan.customerId, curr);
    }
    return Array.from(map.values()).sort((a, b) => b.remaining - a.remaining);
  }, [enrichedPlans]);

  const fifoPreview = useMemo(() => {
    if (!fifoCustomerId) return null;
    return previewCustomerFifoAllocation(
      db.paymentPlans,
      fifoCustomerId,
      Number(fifoAmount) || 0,
      today
    );
  }, [db.paymentPlans, fifoCustomerId, fifoAmount, today]);

  const openFifoModal = (preselectCustomerId?: string) => {
    const targetId = preselectCustomerId || activeDebtCustomers[0]?.id || '';
    setFifoCustomerId(targetId);
    setFifoAmount('');
    setFifoMethod('TRANSFER');
    setFifoRef('');
    setFifoNotes('');
    setFifoOpen(true);
  };

  const handleFifoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      recordCustomerBulkPayment({
        customerId: fifoCustomerId,
        amount: Number(fifoAmount) || 0,
        paymentMethod: fifoMethod,
        transferReference: fifoRef,
        notes: fifoNotes,
      });
      setFifoOpen(false);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal mengalokasikan transfer.');
    }
  };

  const openPayModal = (plan: PaymentPlan) => {
    const m = getPlanMetrics(plan, today);
    const nextUnpaid = plan.schedule.find((it) => it.amount - it.paidAmount > 0);
    const defaultAmt = nextUnpaid ? nextUnpaid.amount - nextUnpaid.paidAmount : m.remainingBalance;
    setPayModalPlan(plan);
    setPayAmount(String(defaultAmt));
    setPayMethod('TRANSFER');
    setPayTransferRef('');
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
        transferReference: payTransferRef,
        notes: payNotes,
      });
      setPayModalPlan(null);
      setSelectedPlanId(res.plan.id);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal mencatat cicilan.');
    }
  };

  const openCreateManualModal = () => {
    setCustId(db.customers[0]?.id || '');
    setManualInvoice('');
    setManualNotes('');
    setCreateOpen(true);
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
        tempoDays,
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">
            Manajemen Piutang &amp; Jadwal Cicilan
          </h2>
          <p style={{ color: 'var(--text-secondary)' }} className="text-xs mt-0.5">
            Pantau jatuh tempo, keterlambatan otomatis, pembayaran bertahap, dan cetak kuitansi.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can('reports:export') && (
            <button
              type="button"
              onClick={handleExportReceivables}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 hig-btn-secondary text-xs font-semibold"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export CSV</span>
            </button>
          )}
          {can('receivables:pay') && activeDebtCustomers.length > 0 && (
            <button
              type="button"
              onClick={() => openFifoModal()}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 hig-btn-secondary text-xs font-semibold"
            >
              <Layers className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Transfer Sekaligus (FIFO)</span>
            </button>
          )}
          {can('receivables:create') && (
            <button
              type="button"
              onClick={openCreateManualModal}
              className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 hig-btn-cta text-xs font-semibold"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Buat Skema Kredit Manual</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="hig-card p-4">
          <p style={{ color: 'var(--text-secondary)' }} className="text-xs font-semibold">
            Sisa Piutang Aktif
          </p>
          <p className="text-xl font-bold tabular-nums mt-1.5">
            {formatRupiah(summary.totalRemaining)}
          </p>
        </div>
        <div className="hig-card p-4">
          <p style={{ color: 'var(--text-secondary)' }} className="text-xs font-semibold">
            Total Tertagih (DP + Cicilan)
          </p>
          <p
            style={{ color: 'var(--status-positive)' }}
            className="text-xl font-bold tabular-nums mt-1.5"
          >
            {formatRupiah(summary.totalCollected)}
          </p>
        </div>
        <div className="hig-card p-4">
          <p style={{ color: 'var(--text-secondary)' }} className="text-xs font-semibold">
            Nominal Terlambat (Overdue)
          </p>
          <p
            style={{ color: 'var(--status-danger)' }}
            className="text-xl font-bold tabular-nums mt-1.5"
          >
            {formatRupiah(summary.totalOverdueAmount)}
          </p>
        </div>
        <div className="hig-card p-4">
          <p style={{ color: 'var(--text-secondary)' }} className="text-xs font-semibold">
            Tagihan Lewat Jatuh Tempo
          </p>
          <p
            style={{ color: 'var(--status-danger)' }}
            className="text-xl font-bold tabular-nums mt-1.5"
          >
            {summary.overduePlans} Pelanggan
          </p>
        </div>
      </div>

      {/* Aging Piutang Summary */}
      {summary.totalRemaining > 0 && (
        <div className="hig-card px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 text-xs tabular-nums">
          <span className="font-bold">Aging Piutang:</span>
          <div className="flex flex-wrap items-center gap-5">
            <span>
              <span style={{ color: 'var(--text-secondary)' }}>Belum Jatuh Tempo: </span>
              <strong>{formatRupiah(aging.current)}</strong>
            </span>
            <span>
              <span style={{ color: 'var(--status-warning)' }}>Telat 1-30 hr: </span>
              <strong>{formatRupiah(aging.days1To30)}</strong>
            </span>
            <span>
              <span style={{ color: 'var(--status-danger)' }}>Telat 31-60 hr: </span>
              <strong>{formatRupiah(aging.days31To60)}</strong>
            </span>
            <span>
              <span style={{ color: 'var(--status-danger)' }}>&gt; 60 hr: </span>
              <strong>{formatRupiah(aging.over60)}</strong>
            </span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="hig-card p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div
          style={{
            backgroundColor: 'var(--bg-subtle)',
            borderColor: 'var(--border-hairline)',
          }}
          className="flex flex-wrap gap-1 p-1 rounded-xl border"
        >
          {(
            [
              { id: 'ALL', label: 'Semua' },
              { id: 'OVERDUE', label: 'Terlambat' },
              { id: 'ACTIVE', label: 'Berjalan' },
              { id: 'PAID', label: 'Lunas' },
              { id: 'VOIDED', label: 'Dibatalkan' },
            ] as const
          ).map((t) => {
            const active = filterTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFilterTab(t.id)}
                style={
                  active
                    ? { backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }
                    : { color: 'var(--text-secondary)' }
                }
                className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold ${
                  active ? 'shadow-xs' : 'hover:text-[var(--text-primary)]'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="relative w-full sm:w-64">
          <Search
            style={{ color: 'var(--text-secondary)' }}
            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="text"
            aria-label="Cari pelanggan atau nomor kredit"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari pelanggan / no. kredit..."
            className="w-full min-h-[38px] pl-9 pr-3 py-1.5 hig-input text-xs"
          />
        </div>
      </div>

      {/* Master-Detail View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Plans List */}
        <div className="lg:col-span-5 min-w-0 space-y-2.5">
          {filteredPlans.map(({ plan, metrics }) => {
            const isSelected = selectedItem?.plan.id === plan.id;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlanId(plan.id)}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: isSelected ? 'var(--accent-primary)' : 'var(--border-hairline)',
                }}
                className={`w-full text-left p-4 rounded-xl border transition-all ${
                  isSelected
                    ? 'ring-1 ring-[var(--accent-primary)] shadow-xs'
                    : 'hover:border-[var(--border-control)]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{plan.customerName}</p>
                    <p
                      style={{ color: 'var(--text-secondary)' }}
                      className="font-mono text-[11px] mt-0.5"
                    >
                      {plan.planNumber}
                      {plan.invoiceNumber ? ` · ${plan.invoiceNumber}` : ''}
                    </p>
                  </div>
                  <PlanStatusBadge status={plan.status} isOverdue={metrics.isOverdue} />
                </div>

                <div
                  style={{ borderColor: 'var(--border-hairline)' }}
                  className="mt-3 pt-2.5 border-t flex items-center justify-between text-xs"
                >
                  <div>
                    <p style={{ color: 'var(--text-secondary)' }}>Sisa Kewajiban</p>
                    <p className="font-bold tabular-nums">
                      {formatRupiah(metrics.remainingBalance)}
                    </p>
                  </div>
                  <div className="text-right">
                    {metrics.isOverdue ? (
                      <span
                        style={{ color: 'var(--status-danger)' }}
                        className="inline-flex items-center gap-1 font-bold"
                      >
                        <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        Telat {metrics.maxOverdueDays} hari
                      </span>
                    ) : metrics.nextDueDate ? (
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Jatuh tempo: {formatDate(metrics.nextDueDate)}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--status-positive)' }} className="font-semibold">
                        Selesai
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
          {filteredPlans.length === 0 && (
            <div className="hig-card">
              <EmptyState
                icon={CreditCard}
                title="Tidak ada skema piutang"
                description="Tidak ada data piutang yang sesuai filter saat ini."
                actionLabel="Reset Filter"
                onAction={() => {
                  setFilterTab('ALL');
                  setSearch('');
                }}
              />
            </div>
          )}
        </div>

        {/* Selected Plan Detail */}
        <div className="lg:col-span-7 min-w-0 hig-card p-5">
          {!selectedItem ? (
            <EmptyState
              icon={CreditCard}
              title="Belum ada skema piutang dipilih"
              description="Pilih salah satu rencana kredit di daftar untuk melihat jadwal angsuran."
            />
          ) : (
            <div className="space-y-5">
              <div
                style={{ borderColor: 'var(--border-hairline)' }}
                className="flex flex-wrap items-start justify-between gap-3 border-b pb-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold">{selectedItem.plan.customerName}</h3>
                    <PlanStatusBadge
                      status={selectedItem.plan.status}
                      isOverdue={selectedItem.metrics.isOverdue}
                    />
                  </div>
                  <p
                    style={{ color: 'var(--text-secondary)' }}
                    className="font-mono text-xs mt-1"
                  >
                    {selectedItem.plan.planNumber}
                    {selectedItem.plan.invoiceNumber
                      ? ` · Invoice ${selectedItem.plan.invoiceNumber}`
                      : ''}
                  </p>
                </div>

                {selectedItem.plan.status === 'ACTIVE' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const cust = db.customers.find((c) => c.id === selectedItem.plan.customerId);
                        if (!cust) return;
                        const custPlans = db.paymentPlans.filter(
                          (pl) => pl.customerId === cust.id && pl.status === 'ACTIVE'
                        );
                        openPrint({ kind: 'statement', customer: cust, plans: custPlans });
                      }}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 hig-btn-secondary text-xs font-semibold"
                    >
                      <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
                      <span>Rekap A4</span>
                    </button>
                    <a
                      href={formatWhatsAppUrl(
                        db.customers.find((c) => c.id === selectedItem.plan.customerId)?.phone,
                        `Halo ${selectedItem.plan.customerName}, kami dari ${db.settings.companyName} mengingatkan tagihan cicilan ${selectedItem.plan.planNumber} dengan sisa kewajiban ${formatRupiah(
                          selectedItem.metrics.remainingBalance
                        )}${
                          selectedItem.metrics.nextDueDate
                            ? ` (jatuh tempo ${formatDate(selectedItem.metrics.nextDueDate)})`
                            : ''
                        }.${
                          db.settings.bankName && db.settings.bankAccountNumber
                            ? `\nTransfer ke ${db.settings.bankName} ${db.settings.bankAccountNumber} a.n. ${db.settings.bankAccountHolder || db.settings.companyName}.`
                            : ''
                        } Terima kasih.`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 hig-btn-secondary text-xs font-semibold"
                    >
                      <MessageCircle className="w-4 h-4" aria-hidden="true" />
                      <span>Tagih WA</span>
                    </a>
                    {can('receivables:pay') && (
                      <button
                        type="button"
                        onClick={() => openPayModal(selectedItem.plan)}
                        style={{ backgroundColor: 'var(--accent-primary)', color: '#FFFFFF' }}
                        className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold hover:opacity-95"
                      >
                        <CreditCard className="w-4 h-4" aria-hidden="true" />
                        <span>Catat Bayar</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {selectedItem.metrics.isOverdue && (
                <div
                  role="alert"
                  style={{
                    backgroundColor: 'var(--status-danger-soft)',
                    color: 'var(--status-danger)',
                  }}
                  className="p-3 rounded-xl text-xs flex items-center gap-2.5"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>
                    <strong>Peringatan Keterlambatan:</strong>{' '}
                    {selectedItem.metrics.overdueInstallmentCount} termin telah melewati jatuh tempo
                    (tertinggi <strong>{selectedItem.metrics.maxOverdueDays} hari</strong>,
                    tunggakan {formatRupiah(selectedItem.metrics.overdueAmount)}).
                  </span>
                </div>
              )}

              {/* Financial Breakdown */}
              <div className="hig-inset grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 text-xs tabular-nums">
                <div>
                  <p style={{ color: 'var(--text-secondary)' }}>Pokok Awal</p>
                  <p className="font-bold mt-0.5">
                    {formatRupiah(selectedItem.plan.principalAmount)}
                  </p>
                </div>
                <div>
                  <p style={{ color: 'var(--text-secondary)' }}>DP / Uang Muka</p>
                  <p className="font-bold mt-0.5">{formatRupiah(selectedItem.plan.downPayment)}</p>
                </div>
                <div>
                  <p style={{ color: 'var(--text-secondary)' }}>
                    Total Kewajiban (+{selectedItem.plan.interestRate}%)
                  </p>
                  <p className="font-bold mt-0.5">{formatRupiah(selectedItem.plan.totalPayable)}</p>
                </div>
                <div>
                  <p style={{ color: 'var(--text-secondary)' }}>Sisa Piutang</p>
                  <p
                    style={{ color: 'var(--accent-primary-text)' }}
                    className="font-bold mt-0.5"
                  >
                    {formatRupiah(selectedItem.metrics.remainingBalance)}
                  </p>
                </div>
              </div>

              {/* Installment Schedule */}
              <div>
                <div className="flex items-center gap-2 text-xs font-bold mb-2">
                  <CalendarClock
                    style={{ color: 'var(--accent-gold)' }}
                    className="w-4 h-4"
                    aria-hidden="true"
                  />
                  <span>
                    {selectedItem.plan.frequency === 'FLEXIBLE'
                      ? `Tempo Fleksibel (${selectedItem.plan.tempoDays || 30} hari, Cicil Bertahap Bebas)`
                      : `Jadwal Angsuran (${selectedItem.plan.tenorCount}x ${
                          selectedItem.plan.frequency === 'WEEKLY' ? 'Mingguan' : 'Bulanan'
                        })`}
                  </span>
                </div>
                <div
                  style={{ borderColor: 'var(--border-hairline)' }}
                  className="border rounded-xl overflow-x-auto"
                >
                  <table className="w-full text-xs text-left">
                    <thead className="hig-table-head">
                      <tr>
                        <th className="py-2 px-3 font-semibold">Termin</th>
                        <th className="py-2 px-3 font-semibold">Jatuh Tempo</th>
                        <th className="py-2 px-3 font-semibold text-right">Tagihan</th>
                        <th className="py-2 px-3 font-semibold text-right">Terbayar</th>
                        <th className="py-2 px-3 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {selectedItem.plan.schedule.map((item) => {
                        const st = getInstallmentStatus(item, today);
                        return (
                          <tr key={item.index}>
                            <td className="py-2 px-3 font-bold">Ke-{item.index}</td>
                            <td className="py-2 px-3">{formatDate(item.dueDate)}</td>
                            <td className="py-2 px-3 text-right font-semibold">
                              {formatRupiah(item.amount)}
                            </td>
                            <td
                              style={{ color: 'var(--status-positive)' }}
                              className="py-2 px-3 text-right font-semibold"
                            >
                              {formatRupiah(item.paidAmount)}
                            </td>
                            <td className="py-2 px-3">
                              {selectedItem.plan.status === 'VOIDED' ? (
                                <span style={{ color: 'var(--text-secondary)' }}>Void</span>
                              ) : st.status === 'PAID' ? (
                                <span
                                  style={{ color: 'var(--status-positive)' }}
                                  className="inline-flex items-center gap-1 font-bold"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                                  Lunas
                                </span>
                              ) : st.status === 'OVERDUE' ? (
                                <span
                                  style={{ color: 'var(--status-danger)' }}
                                  className="inline-flex items-center gap-1.5 font-semibold"
                                >
                                  <span
                                    className="w-1.5 h-1.5 rounded-full bg-current shrink-0"
                                    aria-hidden="true"
                                  />
                                  Telat {st.overdueDays} hr
                                </span>
                              ) : st.status === 'PARTIAL' ? (
                                <span
                                  style={{ color: 'var(--status-warning)' }}
                                  className="inline-flex items-center gap-1.5 font-semibold"
                                >
                                  <span
                                    className="w-1.5 h-1.5 rounded-full bg-current shrink-0"
                                    aria-hidden="true"
                                  />
                                  Sebagian
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-secondary)' }}>Menunggu</span>
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
                <h4 className="text-xs font-bold mb-2">
                  Riwayat Pembayaran &amp; Kuitansi Resmi ({selectedItem.plan.payments.length})
                </h4>
                {selectedItem.plan.payments.length === 0 ? (
                  <p
                    style={{
                      color: 'var(--text-secondary)',
                      borderColor: 'var(--border-hairline)',
                    }}
                    className="text-xs py-3 border border-dashed rounded-xl text-center"
                  >
                    Belum ada setoran angsuran yang masuk.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {selectedItem.plan.payments.map((pay) => {
                      const cust = db.customers.find(
                        (c) => c.id === selectedItem.plan.customerId
                      );
                      return (
                        <div
                          key={pay.id}
                          className="px-2.5 -mx-2.5 py-2.5 rounded-lg hig-row-hover flex flex-wrap items-center justify-between gap-2 text-xs transition-colors"
                        >
                          <div>
                            <p className="font-mono font-bold">
                              {pay.receiptNumber} · {formatRupiah(pay.amount)}
                            </p>
                            <p style={{ color: 'var(--text-secondary)' }}>
                              {formatDateTime(pay.paidAt)} · {pay.paymentMethod}
                              {pay.transferReference ? ` (${pay.transferReference})` : ''} · Diterima{' '}
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
                            className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 hig-btn-secondary font-semibold"
                          >
                            <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Cetak Kuitansi</span>
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

      {/* Record Payment Modal (3 macOS dots) */}
      <Modal
        open={Boolean(payModalPlan)}
        onClose={() => setPayModalPlan(null)}
        title="Catat Pembayaran Cicilan"
        subtitle={
          payModalPlan ? `${payModalPlan.planNumber}: ${payModalPlan.customerName}` : undefined
        }
      >
        {payModalPlan && (
          <form onSubmit={handlePaySubmit} className="space-y-4 text-sm">
            {(() => {
              const m = getPlanMetrics(payModalPlan, today);
              return (
                <div className="hig-inset p-3 flex justify-between text-xs">
                  <span>Sisa Kewajiban Saat Ini:</span>
                  <span style={{ color: 'var(--accent-primary-text)' }} className="font-bold tabular-nums">
                    {formatRupiah(m.remainingBalance)}
                  </span>
                </div>
              );
            })()}
            <div>
              <div className="flex justify-between mb-1">
                <label htmlFor="rec-pay-amt" className="text-xs font-semibold">
                  Nominal Bayar (Rp) *
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setPayAmount(String(getPlanMetrics(payModalPlan, today).remainingBalance))
                  }
                  style={{ color: 'var(--accent-primary-text)' }}
                  className="text-xs font-semibold hover:underline"
                >
                  Lunasi Penuh
                </button>
              </div>
              <input
                id="rec-pay-amt"
                type="number"
                required
                min={1}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 hig-input font-mono font-bold tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="rec-pay-method" className="block text-xs font-semibold mb-1">
                Metode Bayar
              </label>
              <select
                id="rec-pay-method"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value as 'CASH' | 'TRANSFER' | 'QRIS')}
                className="w-full min-h-[44px] px-3 py-2 hig-input"
              >
                <option value="TRANSFER">Transfer Bank</option>
                <option value="CASH">Tunai (Cash)</option>
                <option value="QRIS">QRIS</option>
              </select>
            </div>
            {payMethod === 'TRANSFER' && (
              <div>
                <label htmlFor="rec-pay-ref" className="block text-xs font-semibold mb-1">
                  Ref. Transfer / Bank Pengirim (Opsional)
                </label>
                <input
                  id="rec-pay-ref"
                  type="text"
                  value={payTransferRef}
                  onChange={(e) => setPayTransferRef(e.target.value)}
                  placeholder="Contoh: BCA a.n. Agen / Ref #4412"
                  className="w-full min-h-[42px] px-3 py-2 hig-input font-mono text-xs"
                />
              </div>
            )}
            <div>
              <label htmlFor="rec-pay-notes" className="block text-xs font-semibold mb-1">
                Catatan Pembayaran
              </label>
              <input
                id="rec-pay-notes"
                type="text"
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                placeholder="Contoh: Transfer BCA termin ke-2"
                className="w-full min-h-[44px] px-3 py-2 hig-input"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPayModalPlan(null)}
                className="min-h-[44px] px-4 py-2 hig-btn-secondary text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="submit"
                style={{ backgroundColor: 'var(--accent-primary)', color: '#FFFFFF' }}
                className="min-h-[44px] px-4 py-2 rounded-lg text-xs font-semibold"
              >
                Simpan &amp; Terbitkan Kuitansi
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Manual Payment Plan Modal (3 macOS dots) */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Buat Skema Kredit / Piutang Manual"
        subtitle="Untuk pencatatan piutang di luar transaksi kasir langsung"
      >
        <form onSubmit={handleCreateManual} className="space-y-3.5 text-sm">
          <div>
            <label htmlFor="mp-cust" className="block text-xs font-semibold mb-1">
              Pelanggan *
            </label>
            {db.customers.length === 0 ? (
              <p
                role="alert"
                style={{
                  backgroundColor: 'var(--status-danger-soft)',
                  color: 'var(--status-danger)',
                }}
                className="p-2.5 rounded-lg text-xs font-medium"
              >
                Belum ada pelanggan terdaftar. Tambahkan pelanggan terlebih dahulu di menu Data
                Pelanggan.
              </p>
            ) : (
              <select
                id="mp-cust"
                value={custId}
                onChange={(e) => setCustId(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 hig-input"
              >
                {db.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.type})
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="mp-principal" className="block text-xs font-semibold mb-1">
                Pokok Hutang (Rp) *
              </label>
              <input
                id="mp-principal"
                type="number"
                required
                min={1}
                value={principal}
                onChange={(e) => setPrincipal(Number(e.target.value) || 0)}
                className="w-full min-h-[44px] px-3 py-2 hig-input font-mono tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="mp-dp" className="block text-xs font-semibold mb-1">
                Uang Muka / DP (Rp)
              </label>
              <input
                id="mp-dp"
                type="number"
                min={0}
                value={dp}
                onChange={(e) => setDp(Number(e.target.value) || 0)}
                className="w-full min-h-[44px] px-3 py-2 hig-input font-mono tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="mp-freq" className="block text-xs font-semibold mb-1">
                Frekuensi
              </label>
              <select
                id="mp-freq"
                value={freq}
                onChange={(e) => setFreq(e.target.value as InstallmentFrequency)}
                className="w-full min-h-[44px] px-3 py-2 hig-input"
              >
                <option value="FLEXIBLE">Tempo Fleksibel (Cicil Bebas)</option>
                <option value="WEEKLY">Mingguan</option>
                <option value="MONTHLY">Bulanan</option>
              </select>
            </div>
            {freq === 'FLEXIBLE' ? (
              <div>
                <label htmlFor="mp-tempo" className="block text-xs font-semibold mb-1">
                  Tempo (Hari)
                </label>
                <input
                  id="mp-tempo"
                  type="number"
                  min={1}
                  max={365}
                  value={tempoDays}
                  onChange={(e) => setTempoDays(Number(e.target.value) || 30)}
                  className="w-full min-h-[44px] px-3 py-2 hig-input font-mono tabular-nums"
                />
              </div>
            ) : (
              <div>
                <label htmlFor="mp-tenor" className="block text-xs font-semibold mb-1">
                  Tenor (Termin)
                </label>
                <input
                  id="mp-tenor"
                  type="number"
                  min={1}
                  max={60}
                  value={tenor}
                  onChange={(e) => setTenor(Number(e.target.value) || 1)}
                  className="w-full min-h-[44px] px-3 py-2 hig-input font-mono tabular-nums"
                />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="mp-rate" className="block text-xs font-semibold mb-1">
                Bunga (%)
              </label>
              <input
                id="mp-rate"
                type="number"
                min={0}
                step={0.5}
                value={rate}
                onChange={(e) => setRate(Number(e.target.value) || 0)}
                className="w-full min-h-[44px] px-3 py-2 hig-input font-mono tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="mp-inv" className="block text-xs font-semibold mb-1">
                Ref. Invoice (Opsional)
              </label>
              <input
                id="mp-inv"
                type="text"
                value={manualInvoice}
                onChange={(e) => setManualInvoice(e.target.value)}
                placeholder="IDB-..."
                className="w-full min-h-[44px] px-3 py-2 hig-input"
              />
            </div>
          </div>
          <div>
            <label htmlFor="mp-notes" className="block text-xs font-semibold mb-1">
              Catatan
            </label>
            <input
              id="mp-notes"
              type="text"
              value={manualNotes}
              onChange={(e) => setManualNotes(e.target.value)}
              placeholder="Keterangan skema piutang..."
              className="w-full min-h-[44px] px-3 py-2 hig-input"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="min-h-[44px] px-4 py-2 hig-btn-secondary text-xs font-semibold"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={db.customers.length === 0 || !custId}
              className="min-h-[44px] px-4 py-2 hig-btn-cta text-xs font-semibold disabled:opacity-50"
            >
              Generate Jadwal Cicilan
            </button>
          </div>
        </form>
      </Modal>

      {/* Smart FIFO Bulk Transfer Settlement Modal */}
      <Modal
        open={fifoOpen}
        onClose={() => setFifoOpen(false)}
        title="Transfer Sekaligus (Alokasi FIFO)"
        subtitle="Satu kali transfer besar dari agen otomatis melunasi nota jatuh tempo paling lama terlebih dahulu"
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleFifoSubmit} className="space-y-4 text-xs">
          <div>
            <label htmlFor="fifo-cust" className="block font-semibold mb-1">
              Pilih Mitra / Pemasok *
            </label>
            <select
              id="fifo-cust"
              value={fifoCustomerId}
              onChange={(e) => setFifoCustomerId(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 hig-input text-sm"
            >
              {activeDebtCustomers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.count} nota aktif (Total {formatRupiah(c.remaining)})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="fifo-amt" className="font-semibold">
                  Nominal Transfer Masuk (Rp) *
                </label>
                {fifoPreview && (
                  <button
                    type="button"
                    onClick={() => setFifoAmount(String(fifoPreview.totalRemaining))}
                    style={{ color: 'var(--accent-primary-text)' }}
                    className="font-semibold hover:underline"
                  >
                    Lunasi Semua
                  </button>
                )}
              </div>
              <input
                id="fifo-amt"
                type="number"
                min={1}
                required
                value={fifoAmount}
                onChange={(e) => setFifoAmount(e.target.value)}
                placeholder="Contoh: 10000000"
                className="w-full min-h-[42px] px-3 py-2 hig-input font-mono font-bold text-sm tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="fifo-method" className="block font-semibold mb-1">
                Metode Bayar
              </label>
              <select
                id="fifo-method"
                value={fifoMethod}
                onChange={(e) => setFifoMethod(e.target.value as 'TRANSFER' | 'CASH' | 'QRIS')}
                className="w-full min-h-[42px] px-3 py-2 hig-input text-sm"
              >
                <option value="TRANSFER">Transfer Bank</option>
                <option value="CASH">Tunai</option>
                <option value="QRIS">QRIS</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="fifo-ref" className="block font-semibold mb-1">
                Ref. Transfer / Bank Pengirim
              </label>
              <input
                id="fifo-ref"
                type="text"
                value={fifoRef}
                onChange={(e) => setFifoRef(e.target.value)}
                placeholder="BCA / Mandiri Ref..."
                className="w-full min-h-[40px] px-3 py-2 hig-input font-mono"
              />
            </div>
            <div>
              <label htmlFor="fifo-notes" className="block font-semibold mb-1">
                Catatan (Opsional)
              </label>
              <input
                id="fifo-notes"
                type="text"
                value={fifoNotes}
                onChange={(e) => setFifoNotes(e.target.value)}
                placeholder="Cicilan tahap 2"
                className="w-full min-h-[40px] px-3 py-2 hig-input"
              />
            </div>
          </div>

          {/* Live FIFO Allocation Preview */}
          {fifoPreview && fifoPreview.lines.length > 0 && (
            <div className="hig-inset p-3.5 space-y-2 tabular-nums">
              <p className="font-bold">Pratinjau Alokasi FIFO ({fifoPreview.lines.length} Nota):</p>
              <div className="space-y-1.5">
                {fifoPreview.lines.map((line) => (
                  <div key={line.plan.id} className="flex items-center justify-between gap-2">
                    <span className="font-mono">
                      {line.plan.planNumber}
                      {line.plan.invoiceNumber ? ` (${line.plan.invoiceNumber})` : ''}
                    </span>
                    <div className="text-right">
                      <span className="font-bold">+{formatRupiah(line.allocatedAmount)}</span>{' '}
                      <span
                        style={{
                          color: line.willSettle
                            ? 'var(--status-positive)'
                            : 'var(--text-secondary)',
                        }}
                        className="font-semibold"
                      >
                        {line.willSettle
                          ? '-> LUNAS'
                          : `-> Sisa ${formatRupiah(line.remainingAfter)}`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {fifoPreview.unallocated > 0 && (
                <p style={{ color: 'var(--status-danger)' }} className="font-semibold pt-1">
                  Nominal melebihi total piutang sebesar {formatRupiah(fifoPreview.unallocated)}.
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setFifoOpen(false)}
              className="min-h-[44px] px-4 py-2 hig-btn-secondary font-semibold"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={
                !fifoPreview ||
                fifoPreview.lines.length === 0 ||
                fifoPreview.unallocated > 0
              }
              className="min-h-[44px] px-4 py-2 hig-btn-cta font-semibold disabled:opacity-50"
            >
              Proses Alokasi Transfer
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

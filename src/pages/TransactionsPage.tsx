import React, { useMemo, useState } from 'react';
import {
  Search,
  Eye,
  Ban,
  Printer,
  FileText,
  Truck,
  AlertTriangle,
  ReceiptText,
  Download,
  RotateCcw,
  MessageCircle,
} from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { getTransactionNetMetrics } from '../lib/calculations';
import { downloadCsv } from '../lib/csv';
import {
  extractDateISO,
  formatDateTime,
  formatNumber,
  formatRupiah,
  formatWhatsAppUrl,
  toLocalDateISO,
} from '../lib/format';
import { PaymentMethod, ShippingStatus, Transaction, TransactionStatus } from '../types/erp';
import {
  EmptyState,
  Modal,
  PaymentMethodBadge,
  TxStatusBadge,
} from '../components/ui/SharedUi';

const SHIPPING_LABELS: Record<ShippingStatus, string> = {
  PENDING: 'Menunggu Dikemas',
  PACKED: 'Sudah Dikemas',
  SHIPPED: 'Dalam Pengiriman',
  DELIVERED: 'Diterima Pelanggan',
};

export const TransactionsPage: React.FC = () => {
  const {
    db,
    can,
    voidTransaction,
    createPartialReturn,
    updateTransactionShipping,
    openPrint,
    showToast,
  } = useErp();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | TransactionStatus>('ALL');
  const [methodFilter, setMethodFilter] = useState<'ALL' | PaymentMethod>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [voidModalTx, setVoidModalTx] = useState<Transaction | null>(null);
  const [voidReason, setVoidReason] = useState('');

  // Shipping & Partial Return state
  const [shipStatus, setShipStatus] = useState<ShippingStatus>('PENDING');
  const [shipCourier, setShipCourier] = useState('');
  const [shipTracking, setShipTracking] = useState('');
  const [returnModalTx, setReturnModalTx] = useState<Transaction | null>(null);
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState('');

  const selectedTx = useMemo(
    () => (selectedTxId ? db.transactions.find((t) => t.id === selectedTxId) || null : null),
    [db.transactions, selectedTxId]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.transactions.filter((tx) => {
      if (statusFilter !== 'ALL' && tx.status !== statusFilter) return false;
      if (methodFilter !== 'ALL' && tx.paymentMethod !== methodFilter) return false;
      const d = extractDateISO(tx.createdAt);
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      if (
        q &&
        !tx.invoiceNumber.toLowerCase().includes(q) &&
        !tx.customerName.toLowerCase().includes(q) &&
        !tx.cashierName.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [db.transactions, search, statusFilter, methodFilter, startDate, endDate]);

  const metrics = useMemo(() => {
    const completed = filtered.filter((t) => t.status === 'COMPLETED');
    const totalRevenue = completed.reduce((acc, t) => acc + getTransactionNetMetrics(t).netTotal, 0);
    const successRatio =
      filtered.length > 0 ? Math.round((completed.length / filtered.length) * 100) : 0;
    const avgOrder = completed.length > 0 ? Math.round(totalRevenue / completed.length) : 0;
    const voidCount = filtered.length - completed.length;
    return { totalRevenue, successRatio, avgOrder, voidCount };
  }, [filtered]);

  const linkedPlan = useMemo(() => {
    if (!selectedTx?.paymentPlanId) return undefined;
    return db.paymentPlans.find((p) => p.id === selectedTx.paymentPlanId);
  }, [db.paymentPlans, selectedTx]);

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('ALL');
    setMethodFilter('ALL');
    setStartDate('');
    setEndDate('');
  };

  const openDetailModal = (tx: Transaction) => {
    setSelectedTxId(tx.id);
    setShipStatus(tx.shippingStatus || 'PENDING');
    setShipCourier(tx.courierName || '');
    setShipTracking(tx.trackingNumber || '');
  };

  const handleSaveShipping = () => {
    if (!selectedTx) return;
    try {
      updateTransactionShipping({
        txId: selectedTx.id,
        shippingStatus: shipStatus,
        courierName: shipCourier,
        trackingNumber: shipTracking,
      });
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal memperbarui pengiriman.');
    }
  };

  const handleConfirmPartialReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnModalTx) return;
    try {
      const items = Object.entries(returnQtys)
        .filter(([, qty]) => qty > 0)
        .map(([productId, qty]) => ({ productId, qty }));
      createPartialReturn({
        txId: returnModalTx.id,
        items,
        reason: returnReason,
      });
      setReturnModalTx(null);
      setReturnQtys({});
      setReturnReason('');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal memproses retur sebagian.');
    }
  };

  const handleExportCsv = () => {
    downloadCsv(
      `riwayat-transaksi-${toLocalDateISO()}.csv`,
      ['No Invoice', 'Waktu', 'Pelanggan', 'Kasir', 'Metode', 'Subtotal', 'Diskon', 'PPN', 'Ongkir', 'Total', 'Status', 'Pengiriman', 'Resi'],
      filtered.map((tx) => [
        tx.invoiceNumber,
        formatDateTime(tx.createdAt),
        tx.customerName,
        tx.cashierName,
        tx.paymentMethod,
        tx.subtotal,
        tx.discountAmount || 0,
        tx.taxAmount,
        tx.shippingCost || 0,
        tx.total,
        tx.status,
        SHIPPING_LABELS[tx.shippingStatus || 'PENDING'],
        tx.trackingNumber || '',
      ])
    );
  };

  const handleConfirmVoid = (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidModalTx) return;
    try {
      voidTransaction(voidModalTx.id, voidReason);
      setVoidModalTx(null);
      setVoidReason('');
      setSelectedTxId(null);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal membatalkan transaksi.');
    }
  };

  return (
    <div className="space-y-5">
      {/* Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="hig-card p-4">
          <p style={{ color: 'var(--text-secondary)' }} className="text-xs font-semibold">
            Total Omset (Terfilter)
          </p>
          <p className="text-xl font-bold tabular-nums mt-1.5">
            {formatRupiah(metrics.totalRevenue)}
          </p>
        </div>
        <div className="hig-card p-4">
          <p style={{ color: 'var(--text-secondary)' }} className="text-xs font-semibold">
            Rasio Transaksi Sukses
          </p>
          <p
            style={{ color: 'var(--status-positive)' }}
            className="text-xl font-bold tabular-nums mt-1.5"
          >
            {metrics.successRatio}%
          </p>
        </div>
        <div className="hig-card p-4">
          <p style={{ color: 'var(--text-secondary)' }} className="text-xs font-semibold">
            Rata-Rata Nilai Order (AOV)
          </p>
          <p className="text-xl font-bold tabular-nums mt-1.5">
            {formatRupiah(metrics.avgOrder)}
          </p>
        </div>
        <div className="hig-card p-4">
          <p style={{ color: 'var(--text-secondary)' }} className="text-xs font-semibold">
            Transaksi Dibatalkan
          </p>
          <p
            style={{ color: 'var(--status-danger)' }}
            className="text-xl font-bold tabular-nums mt-1.5"
          >
            {metrics.voidCount} Invoice
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="hig-card p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search
            style={{ color: 'var(--text-secondary)' }}
            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="text"
            aria-label="Cari nomor invoice atau nama pelanggan"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari no. invoice, pelanggan, atau kasir..."
            className="w-full min-h-[40px] pl-9 pr-3 py-1.5 hig-input text-xs"
          />
        </div>
        <select
          aria-label="Filter status transaksi"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'ALL' | TransactionStatus)}
          className="min-h-[40px] px-3 py-1.5 hig-input text-xs font-semibold"
        >
          <option value="ALL">Semua Status</option>
          <option value="COMPLETED">Selesai</option>
          <option value="VOIDED">Dibatalkan (Void)</option>
        </select>
        <select
          aria-label="Filter metode pembayaran"
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value as 'ALL' | PaymentMethod)}
          className="min-h-[40px] px-3 py-1.5 hig-input text-xs font-semibold"
        >
          <option value="ALL">Semua Metode</option>
          <option value="CASH">Tunai</option>
          <option value="TRANSFER">Transfer Bank</option>
          <option value="QRIS">QRIS</option>
          <option value="CREDIT">Kredit / Tempo</option>
        </select>
        <div className="flex items-center gap-1.5 text-xs">
          <input
            type="date"
            aria-label="Tanggal mulai"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="min-h-[40px] px-2.5 py-1.5 hig-input"
          />
          <span style={{ color: 'var(--text-secondary)' }}>s/d</span>
          <input
            type="date"
            aria-label="Tanggal akhir"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="min-h-[40px] px-2.5 py-1.5 hig-input"
          />
        </div>
        {can('reports:export') && (
          <button
            type="button"
            onClick={handleExportCsv}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 hig-btn-secondary text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export CSV</span>
          </button>
        )}
      </div>

      {/* Table */}
      <div className="hig-card overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="Tidak ada transaksi ditemukan"
            description="Tidak ada invoice yang cocok dengan filter status, metode, atau rentang tanggal."
            actionLabel="Reset Filter"
            onAction={resetFilters}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="hig-table-head">
                <tr>
                  <th className="py-3 px-4 font-semibold">No. Invoice</th>
                  <th className="py-3 px-4 font-semibold">Waktu</th>
                  <th className="py-3 px-4 font-semibold">Pelanggan</th>
                  <th className="py-3 px-4 font-semibold">Kasir</th>
                  <th className="py-3 px-4 font-semibold">Metode</th>
                  <th className="py-3 px-4 font-semibold text-right">Total</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tx) => (
                  <tr key={tx.id} className="hig-row-hover">
                    <td className="py-3 px-4 font-mono font-bold">{tx.invoiceNumber}</td>
                    <td
                      style={{ color: 'var(--text-secondary)' }}
                      className="py-3 px-4 whitespace-nowrap"
                    >
                      {formatDateTime(tx.createdAt)}
                    </td>
                    <td className="py-3 px-4 font-semibold">{tx.customerName}</td>
                    <td style={{ color: 'var(--text-secondary)' }} className="py-3 px-4">
                      {tx.cashierName}
                    </td>
                    <td className="py-3 px-4">
                      <PaymentMethodBadge method={tx.paymentMethod} />
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">
                      {formatRupiah(tx.total)}
                    </td>
                    <td className="py-3 px-4">
                      <TxStatusBadge status={tx.status} />
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                      <button
                        type="button"
                        onClick={() => openDetailModal(tx)}
                        className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 hig-btn-secondary font-semibold"
                      >
                        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Detail</span>
                      </button>
                      {can('transactions:void') && tx.status === 'COMPLETED' && (
                        <button
                          type="button"
                          onClick={() => {
                            setVoidModalTx(tx);
                            setVoidReason('');
                          }}
                          style={{
                            backgroundColor: 'var(--status-danger-soft)',
                            color: 'var(--status-danger)',
                          }}
                          className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold"
                        >
                          <Ban className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Void</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Transaction Detail Modal (3 macOS dots) */}
      <Modal
        open={Boolean(selectedTx)}
        onClose={() => setSelectedTxId(null)}
        title={selectedTx ? `Detail Transaksi ${selectedTx.invoiceNumber}` : ''}
        subtitle={selectedTx ? formatDateTime(selectedTx.createdAt) : ''}
        maxWidth="max-w-2xl"
      >
        {selectedTx && (
          <div className="space-y-4 text-xs">
            <div className="hig-inset flex flex-wrap items-center justify-between gap-2 p-3.5">
              <div>
                <p style={{ color: 'var(--text-secondary)' }}>Pelanggan:</p>
                <p className="text-sm font-bold">{selectedTx.customerName}</p>
                <p style={{ color: 'var(--text-secondary)' }}>Kasir: {selectedTx.cashierName}</p>
              </div>
              <div className="text-right space-y-1">
                <TxStatusBadge status={selectedTx.status} />
                <div>
                  <PaymentMethodBadge method={selectedTx.paymentMethod} />
                </div>
              </div>
            </div>

            {selectedTx.status === 'VOIDED' && (
              <div
                style={{
                  backgroundColor: 'var(--status-danger-soft)',
                  color: 'var(--status-danger)',
                }}
                className="p-3 rounded-xl"
              >
                <p className="font-bold">
                  Dibatalkan oleh {selectedTx.voidedByName} (
                  {formatDateTime(selectedTx.voidedAt || '')})
                </p>
                <p className="mt-0.5">Alasan: {selectedTx.voidReason}</p>
              </div>
            )}

            <table className="w-full border-collapse">
              <thead>
                <tr
                  style={{
                    borderColor: 'var(--border-hairline)',
                    color: 'var(--text-secondary)',
                  }}
                  className="border-b"
                >
                  <th className="py-2 text-left">Produk</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Harga</th>
                  <th className="py-2 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {selectedTx.items.map((it) => (
                  <tr key={it.productId}>
                    <td className="py-2">
                      <p className="font-semibold">{it.productName}</p>
                      <p style={{ color: 'var(--text-secondary)' }} className="font-mono text-[11px]">
                        {it.sku}
                      </p>
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {it.qty} {it.unit}
                    </td>
                    <td className="py-2 text-right tabular-nums">{formatRupiah(it.sellPrice)}</td>
                    <td className="py-2 text-right font-bold tabular-nums">
                      {formatRupiah(it.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div
              style={{ borderColor: 'var(--border-hairline)' }}
              className="border-t pt-3 space-y-1 tabular-nums text-right"
            >
              {(selectedTx.discountAmount || 0) > 0 && (
                <p style={{ color: 'var(--status-positive)' }}>
                  Diskon: -{formatRupiah(selectedTx.discountAmount || 0)}
                </p>
              )}
              <p>Subtotal: {formatRupiah(selectedTx.subtotal)}</p>
              <p>
                PPN ({selectedTx.taxRate}%): {formatRupiah(selectedTx.taxAmount)}
              </p>
              {(selectedTx.shippingCost || 0) > 0 && (
                <p>Ongkos Kirim: {formatRupiah(selectedTx.shippingCost || 0)}</p>
              )}
              <p
                style={{ color: 'var(--accent-primary-text)' }}
                className="text-base font-bold"
              >
                Total: {formatRupiah(selectedTx.total)}
              </p>
            </div>

            {/* Shipping & Tracking Status */}
            {selectedTx.status === 'COMPLETED' && (
              <div className="hig-inset p-3.5 space-y-2.5">
                <p className="font-bold flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Status Pengiriman &amp; Resi Ekspedisi</span>
                </p>
                {can('transactions:shipping') ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <select
                        aria-label="Status pengiriman"
                        value={shipStatus}
                        onChange={(e) => setShipStatus(e.target.value as ShippingStatus)}
                        className="min-h-[36px] px-2.5 py-1 hig-input text-xs font-semibold"
                      >
                        {(Object.keys(SHIPPING_LABELS) as ShippingStatus[]).map((st) => (
                          <option key={st} value={st}>
                            {SHIPPING_LABELS[st]}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        aria-label="Nama kurir atau ekspedisi"
                        value={shipCourier}
                        onChange={(e) => setShipCourier(e.target.value)}
                        placeholder="Kurir (JNE / J&T / Cargo)"
                        className="min-h-[36px] px-2.5 py-1 hig-input text-xs"
                      />
                      <input
                        type="text"
                        aria-label="Nomor resi pengiriman"
                        value={shipTracking}
                        onChange={(e) => setShipTracking(e.target.value)}
                        placeholder="No. Resi pengiriman"
                        className="min-h-[36px] px-2.5 py-1 hig-input text-xs font-mono"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleSaveShipping}
                        className="min-h-[34px] px-3 py-1 hig-btn-secondary font-semibold"
                      >
                        Simpan Pengiriman
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div>
                      <span style={{ color: 'var(--text-secondary)' }}>Status: </span>
                      <strong>{SHIPPING_LABELS[selectedTx.shippingStatus || 'PENDING']}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-secondary)' }}>Kurir: </span>
                      <strong>{selectedTx.courierName || '-'}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-secondary)' }}>No. Resi: </span>
                      <strong className="font-mono">{selectedTx.trackingNumber || '-'}</strong>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Recorded Partial Returns */}
            {selectedTx.returns && selectedTx.returns.length > 0 && (
              <div className="hig-inset p-3 space-y-1.5">
                <p className="font-bold">Riwayat Retur Sebagian ({selectedTx.returns.length})</p>
                {selectedTx.returns.map((ret) => (
                  <div key={ret.id} style={{ color: 'var(--text-secondary)' }}>
                    <span className="font-semibold text-[var(--text-primary)]">
                      {formatDateTime(ret.createdAt)}
                    </span>{' '}
                    · Nilai {formatRupiah(ret.refundAmount)} · {ret.reason} (
                    {ret.items.map((i) => `${i.productName} ${formatNumber(i.qty)} ${i.unit}`).join(', ')})
                  </div>
                ))}
              </div>
            )}

            <div
              style={{ borderColor: 'var(--border-hairline)' }}
              className="flex flex-wrap gap-2 pt-3 border-t"
            >
              <button
                type="button"
                onClick={() =>
                  openPrint({
                    kind: 'thermal80',
                    transaction: selectedTx,
                    paymentPlan: linkedPlan,
                  })
                }
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 hig-btn-secondary font-semibold"
              >
                <Printer
                  style={{ color: 'var(--accent-primary-text)' }}
                  className="w-3.5 h-3.5"
                  aria-hidden="true"
                />
                <span>Struk Thermal</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  openPrint({
                    kind: 'invoiceA4',
                    transaction: selectedTx,
                    paymentPlan: linkedPlan,
                  })
                }
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 hig-btn-secondary font-semibold"
              >
                <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Invoice A4</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  openPrint({
                    kind: 'suratJalan',
                    transaction: selectedTx,
                  })
                }
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 hig-btn-secondary font-semibold"
              >
                <Truck
                  style={{ color: 'var(--accent-gold)' }}
                  className="w-3.5 h-3.5"
                  aria-hidden="true"
                />
                <span>Surat Jalan</span>
              </button>
              <a
                href={formatWhatsAppUrl(
                  selectedTx.customerPhone,
                  `Halo ${selectedTx.customerName}, info nota ${selectedTx.invoiceNumber} dari ${db.settings.companyName}:\nTotal: ${formatRupiah(
                    selectedTx.total
                  )}\nStatus Pengiriman: ${SHIPPING_LABELS[selectedTx.shippingStatus || 'PENDING']}${
                    selectedTx.trackingNumber ? `\nNo. Resi (${selectedTx.courierName || 'Ekspedisi'}): ${selectedTx.trackingNumber}` : ''
                  }`
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 hig-btn-secondary font-semibold"
              >
                <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                <span>WhatsApp</span>
              </a>
              {can('transactions:void') && selectedTx.status === 'COMPLETED' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTxId(null);
                      setReturnModalTx(selectedTx);
                      setReturnQtys({});
                      setReturnReason('');
                    }}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 hig-btn-secondary font-semibold"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Retur Sebagian</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTxId(null);
                      setVoidModalTx(selectedTx);
                      setVoidReason('');
                    }}
                    style={{ backgroundColor: 'var(--accent-primary)' }}
                    className="ml-auto min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-white font-semibold"
                  >
                    <Ban className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Batalkan (Void)</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Void Confirmation Modal (3 macOS dots) */}
      <Modal
        open={Boolean(voidModalTx)}
        onClose={() => setVoidModalTx(null)}
        title="Konfirmasi Pembatalan Transaksi (Void)"
        subtitle={
          voidModalTx
            ? `${voidModalTx.invoiceNumber}, Total ${formatRupiah(voidModalTx.total)}`
            : undefined
        }
      >
        <form onSubmit={handleConfirmVoid} className="space-y-4 text-sm">
          <div
            style={{
              backgroundColor: 'var(--status-warning-soft)',
              color: 'var(--status-warning)',
            }}
            className="p-3 rounded-xl text-xs flex items-start gap-2"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Pembatalan transaksi otomatis <strong>mengembalikan seluruh stok barang</strong> ke
              gudang serta menonaktifkan skema cicilan piutang terkait (jika ada).
            </span>
          </div>
          <div>
            <label htmlFor="void-reason" className="block text-xs font-semibold mb-1">
              Alasan Pembatalan *
            </label>
            <textarea
              id="void-reason"
              required
              rows={3}
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Tuliskan alasan void untuk tercatat pada Audit Log..."
              className="w-full px-3 py-2 hig-input"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setVoidModalTx(null)}
              className="min-h-[44px] px-4 py-2 hig-btn-secondary text-xs font-semibold"
            >
              Batal
            </button>
            <button
              type="submit"
              style={{ backgroundColor: 'var(--accent-primary)' }}
              className="min-h-[44px] px-4 py-2 rounded-lg text-white text-xs font-semibold"
            >
              Ya, Batalkan Transaksi
            </button>
          </div>
        </form>
      </Modal>

      {/* Partial Return Modal */}
      <Modal
        open={Boolean(returnModalTx)}
        onClose={() => setReturnModalTx(null)}
        title="Retur Barang Sebagian (Partial Return)"
        subtitle={returnModalTx ? `${returnModalTx.invoiceNumber} · ${returnModalTx.customerName}` : undefined}
      >
        {returnModalTx && (
          <form onSubmit={handleConfirmPartialReturn} className="space-y-4 text-xs">
            <div className="space-y-2">
              {returnModalTx.items.map((it) => {
                const alreadyReturned = (returnModalTx.returns || []).reduce(
                  (sum, r) =>
                    sum +
                    r.items.filter((ri) => ri.productId === it.productId).reduce((a, b) => a + b.qty, 0),
                  0
                );
                const maxRet = Math.max(0, Math.round((it.qty - alreadyReturned) * 1000) / 1000);
                return (
                  <div
                    key={it.productId}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="font-bold truncate">{it.productName}</p>
                      <p style={{ color: 'var(--text-secondary)' }}>
                        Terbeli {formatNumber(it.qty)} {it.unit} · Maks retur {formatNumber(maxRet)}{' '}
                        {it.unit}
                      </p>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={maxRet}
                      step="any"
                      disabled={maxRet <= 0}
                      value={returnQtys[it.productId] ?? ''}
                      onChange={(e) =>
                        setReturnQtys((prev) => ({
                          ...prev,
                          [it.productId]: Number(e.target.value) || 0,
                        }))
                      }
                      placeholder="0"
                      className="w-24 min-h-[36px] px-2.5 py-1 hig-input text-right font-mono tabular-nums"
                    />
                  </div>
                );
              })}
            </div>
            <div>
              <label htmlFor="ret-reason" className="block font-semibold mb-1">
                Alasan Retur *
              </label>
              <textarea
                id="ret-reason"
                required
                rows={2}
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="Misal: 0.5 Kg kemasan bocor / ditukar varian lain"
                className="w-full px-3 py-2 hig-input"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReturnModalTx(null)}
                className="min-h-[42px] px-4 py-2 hig-btn-secondary font-semibold"
              >
                Batal
              </button>
              <button
                type="submit"
                className="min-h-[42px] px-4 py-2 hig-btn-cta font-semibold"
              >
                Proses Retur &amp; Kembalikan Stok
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

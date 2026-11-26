import React, { useMemo, useState } from 'react';
import {
  Search,
  Eye,
  Ban,
  Printer,
  FileText,
  Truck,
  AlertTriangle,
} from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { extractDateISO, formatDateTime, formatRupiah } from '../lib/format';
import { PaymentMethod, Transaction, TransactionStatus } from '../types/erp';
import { Modal, PaymentMethodBadge, TxStatusBadge } from '../components/ui/SharedUi';

export const TransactionsPage: React.FC = () => {
  const { db, can, voidTransaction, openPrint, showToast } = useErp();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | TransactionStatus>('ALL');
  const [methodFilter, setMethodFilter] = useState<'ALL' | PaymentMethod>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [voidModalTx, setVoidModalTx] = useState<Transaction | null>(null);
  const [voidReason, setVoidReason] = useState('');

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
    const totalRevenue = completed.reduce((acc, t) => acc + t.total, 0);
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

  const handleConfirmVoid = (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidModalTx) return;
    try {
      voidTransaction(voidModalTx.id, voidReason);
      setVoidModalTx(null);
      setVoidReason('');
      setSelectedTx(null);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal membatalkan transaksi.');
    }
  };

  return (
    <div className="space-y-5">
      {/* Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E6E0D6] rounded-xl p-4">
          <p className="text-xs font-bold uppercase text-[#6B6257]">Total Omset (Terfilter)</p>
          <p className="text-xl font-extrabold text-[#1A1614] tabular-nums mt-1.5">
            {formatRupiah(metrics.totalRevenue)}
          </p>
        </div>
        <div className="bg-white border border-[#E6E0D6] rounded-xl p-4">
          <p className="text-xs font-bold uppercase text-[#6B6257]">Rasio Transaksi Sukses</p>
          <p className="text-xl font-extrabold text-emerald-700 tabular-nums mt-1.5">
            {metrics.successRatio}%
          </p>
        </div>
        <div className="bg-white border border-[#E6E0D6] rounded-xl p-4">
          <p className="text-xs font-bold uppercase text-[#6B6257]">Rata-Rata Nilai Order (AOV)</p>
          <p className="text-xl font-extrabold text-[#1A1614] tabular-nums mt-1.5">
            {formatRupiah(metrics.avgOrder)}
          </p>
        </div>
        <div className="bg-white border border-[#E6E0D6] rounded-xl p-4">
          <p className="text-xs font-bold uppercase text-[#6B6257]">Transaksi Dibatalkan</p>
          <p className="text-xl font-extrabold text-rose-700 tabular-nums mt-1.5">
            {metrics.voidCount} Invoice
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-[#E6E0D6] rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[#8A7F73] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari no. invoice, pelanggan, atau kasir..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-[#D8D0C5] text-xs"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'ALL' | TransactionStatus)}
          className="px-3 py-2 rounded-lg border border-[#D8D0C5] text-xs bg-white font-semibold"
        >
          <option value="ALL">Semua Status</option>
          <option value="COMPLETED">Selesai</option>
          <option value="VOIDED">Dibatalkan (Void)</option>
        </select>
        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value as 'ALL' | PaymentMethod)}
          className="px-3 py-2 rounded-lg border border-[#D8D0C5] text-xs bg-white font-semibold"
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
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-2.5 py-2 rounded-lg border border-[#D8D0C5]"
          />
          <span className="text-[#6B6257]">s/d</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-2.5 py-2 rounded-lg border border-[#D8D0C5]"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#E6E0D6] rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#F8F6F2] border-b border-[#E6E0D6] text-[#5C5349] uppercase">
              <tr>
                <th className="py-3 px-4 font-bold">No. Invoice</th>
                <th className="py-3 px-4 font-bold">Waktu</th>
                <th className="py-3 px-4 font-bold">Pelanggan</th>
                <th className="py-3 px-4 font-bold">Kasir</th>
                <th className="py-3 px-4 font-bold">Metode</th>
                <th className="py-3 px-4 font-bold text-right">Total</th>
                <th className="py-3 px-4 font-bold">Status</th>
                <th className="py-3 px-4 font-bold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EDE7DD]">
              {filtered.map((tx) => (
                <tr key={tx.id} className="hover:bg-[#FAF8F4]">
                  <td className="py-3 px-4 font-mono font-bold text-[#1A1614]">
                    {tx.invoiceNumber}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap text-[#5C5349]">
                    {formatDateTime(tx.createdAt)}
                  </td>
                  <td className="py-3 px-4 font-semibold">{tx.customerName}</td>
                  <td className="py-3 px-4 text-[#5C5349]">{tx.cashierName}</td>
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
                      onClick={() => setSelectedTx(tx)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[#D8D0C5] hover:bg-[#F1EDE5] font-semibold cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Detail
                    </button>
                    {can('transactions:void') && tx.status === 'COMPLETED' && (
                      <button
                        type="button"
                        onClick={() => {
                          setVoidModalTx(tx);
                          setVoidReason('');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 font-semibold cursor-pointer"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        Void
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[#6B6257]">
                    Tidak ada transaksi yang cocok dengan filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transaction Detail Modal */}
      <Modal
        open={Boolean(selectedTx)}
        onClose={() => setSelectedTx(null)}
        title={selectedTx ? `Detail Transaksi ${selectedTx.invoiceNumber}` : ''}
        subtitle={selectedTx ? formatDateTime(selectedTx.createdAt) : ''}
        maxWidth="max-w-2xl"
      >
        {selectedTx && (
          <div className="space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[#F8F6F2] border border-[#E6E0D6] rounded-lg p-3.5">
              <div>
                <p className="text-[#6B6257]">Pelanggan:</p>
                <p className="text-sm font-bold text-[#1A1614]">{selectedTx.customerName}</p>
                <p className="text-[#5C5349]">Kasir: {selectedTx.cashierName}</p>
              </div>
              <div className="text-right space-y-1">
                <TxStatusBadge status={selectedTx.status} />
                <div>
                  <PaymentMethodBadge method={selectedTx.paymentMethod} />
                </div>
              </div>
            </div>

            {selectedTx.status === 'VOIDED' && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800">
                <p className="font-bold">
                  Dibatalkan oleh {selectedTx.voidedByName} ({formatDateTime(selectedTx.voidedAt || '')})
                </p>
                <p className="mt-0.5">Alasan: {selectedTx.voidReason}</p>
              </div>
            )}

            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[#E6E0D6] text-[#6B6257]">
                  <th className="py-2 text-left">Produk</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Harga</th>
                  <th className="py-2 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDE7DD]">
                {selectedTx.items.map((it) => (
                  <tr key={it.productId}>
                    <td className="py-2">
                      <p className="font-semibold text-[#1A1614]">{it.productName}</p>
                      <p className="font-mono text-[11px] text-[#7C7165]">{it.sku}</p>
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

            <div className="border-t border-[#E6E0D6] pt-3 space-y-1 tabular-nums text-right">
              <p>Subtotal: {formatRupiah(selectedTx.subtotal)}</p>
              <p>
                PPN ({selectedTx.taxRate}%): {formatRupiah(selectedTx.taxAmount)}
              </p>
              <p className="text-base font-extrabold text-[#B91C1C]">
                Total: {formatRupiah(selectedTx.total)}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-[#E6E0D6]">
              <button
                type="button"
                onClick={() =>
                  openPrint({
                    kind: 'thermal80',
                    transaction: selectedTx,
                    paymentPlan: linkedPlan,
                  })
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#D8D0C5] hover:bg-[#F8F6F2] font-bold cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-[#B91C1C]" />
                Struk Thermal
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
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#D8D0C5] hover:bg-[#F8F6F2] font-bold cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                Invoice A4
              </button>
              <button
                type="button"
                onClick={() =>
                  openPrint({
                    kind: 'suratJalan',
                    transaction: selectedTx,
                  })
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#D8D0C5] hover:bg-[#F8F6F2] font-bold cursor-pointer"
              >
                <Truck className="w-3.5 h-3.5 text-[#B8860B]" />
                Surat Jalan
              </button>
              {can('transactions:void') && selectedTx.status === 'COMPLETED' && (
                <button
                  type="button"
                  onClick={() => {
                    setVoidModalTx(selectedTx);
                    setVoidReason('');
                  }}
                  className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
                >
                  <Ban className="w-3.5 h-3.5" />
                  Batalkan (Void)
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Void Confirmation Modal */}
      <Modal
        open={Boolean(voidModalTx)}
        onClose={() => setVoidModalTx(null)}
        title="Konfirmasi Pembatalan Transaksi (Void)"
        subtitle={
          voidModalTx
            ? `${voidModalTx.invoiceNumber} — Total ${formatRupiah(voidModalTx.total)}`
            : undefined
        }
      >
        <form onSubmit={handleConfirmVoid} className="space-y-4 text-sm">
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <span>
              Pembatalan transaksi akan otomatis <strong>mengembalikan seluruh stok barang</strong>{' '}
              ke gudang serta menonaktifkan skema cicilan piutang terkait (jika ada).
            </span>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#5C5349] mb-1">
              Alasan Pembatalan *
            </label>
            <textarea
              required
              rows={3}
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Tuliskan alasan void untuk tercatat pada Audit Log..."
              className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setVoidModalTx(null)}
              className="px-4 py-2 rounded-lg border border-[#D8D0C5] text-xs font-bold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
            >
              Ya, Batalkan Transaksi
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import { PackagePlus, Search, AlertTriangle, ArrowDownUp, Download } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { calcInventoryValuation } from '../lib/calculations';
import { downloadCsv } from '../lib/csv';
import { formatDateTime, formatNumber, formatRupiah, toLocalDateISO } from '../lib/format';
import { EmptyState, MovementBadge, Modal } from '../components/ui/SharedUi';
import { StockMovementType } from '../types/erp';

export const WarehousePage: React.FC = () => {
  const { db, can, adjustStock, showToast } = useErp();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | StockMovementType>('ALL');
  const [skuFilter, setSkuFilter] = useState<string>('ALL');
  const [showAllLowStock, setShowAllLowStock] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const [productId, setProductId] = useState(db.products[0]?.id || '');
  const [adjType, setAdjType] = useState<'INBOUND' | 'OUTBOUND' | 'DAMAGED_EXPIRED'>('INBOUND');
  const [qty, setQty] = useState<number>(10);
  const [referenceId, setReferenceId] = useState('');
  const [notes, setNotes] = useState('');

  const valuation = useMemo(() => calcInventoryValuation(db.products), [db.products]);
  const lowStockItems = useMemo(
    () => db.products.filter((p) => p.stock <= p.minStock).sort((a, b) => a.stock - b.stock),
    [db.products]
  );

  const filteredMovements = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.stockMovements.filter((m) => {
      const typeOk = typeFilter === 'ALL' || m.type === typeFilter;
      const skuOk = skuFilter === 'ALL' || m.productId === skuFilter;
      const qOk =
        !q ||
        m.productName.toLowerCase().includes(q) ||
        m.sku.toLowerCase().includes(q) ||
        m.picName.toLowerCase().includes(q) ||
        m.notes.toLowerCase().includes(q) ||
        (m.referenceId || '').toLowerCase().includes(q);
      return typeOk && skuOk && qOk;
    });
  }, [db.stockMovements, search, typeFilter, skuFilter]);

  const handleExportStockCard = () => {
    downloadCsv(
      `kartu-stok-${toLocalDateISO()}.csv`,
      ['Waktu', 'SKU', 'Produk', 'Jenis Mutasi', 'Perubahan', 'Stok Awal', 'Stok Akhir', 'PIC', 'Ref', 'Catatan'],
      filteredMovements.map((m) => [
        formatDateTime(m.createdAt),
        m.sku,
        m.productName,
        m.type,
        m.qtyDelta,
        m.previousStock,
        m.newStock,
        m.picName,
        m.referenceId || '',
        m.notes,
      ])
    );
  };

  const openAdjustForProduct = (pid: string) => {
    setProductId(pid);
    setAdjType('INBOUND');
    setQty(20);
    setReferenceId('');
    setNotes('Restok barang gudang');
    setModalOpen(true);
  };

  const handleAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      adjustStock({
        productId,
        type: adjType,
        qty,
        referenceId,
        notes,
      });
      setModalOpen(false);
      setReferenceId('');
      setNotes('');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal menyesuaikan stok.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">
            Valuasi Inventaris &amp; Mutasi Gudang
          </h2>
          <p style={{ color: 'var(--text-secondary)' }} className="text-xs mt-0.5">
            Estimasi nilai aset real-time berdasarkan HPP dan catatan lengkap keluar-masuk stok.
          </p>
        </div>
        {can('warehouse:adjust') && (
          <button
            type="button"
            onClick={() => {
              setProductId(db.products[0]?.id || '');
              setAdjType('INBOUND');
              setQty(1);
              setNotes('');
              setReferenceId('');
              setModalOpen(true);
            }}
            className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 hig-btn-cta text-xs font-semibold"
          >
            <PackagePlus className="w-4 h-4" aria-hidden="true" />
            <span>Penyesuaian Stok (Opname)</span>
          </button>
        )}
      </div>

      {/* Valuation Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="hig-card p-4">
          <p style={{ color: 'var(--text-secondary)' }} className="text-xs font-semibold">
            Valuasi Aset Gudang (HPP)
          </p>
          <p className="text-xl font-bold tabular-nums mt-1.5">
            {formatRupiah(valuation.totalHppValue)}
          </p>
        </div>
        <div className="hig-card p-4">
          <p style={{ color: 'var(--text-secondary)' }} className="text-xs font-semibold">
            Potensi Nilai Jual
          </p>
          <p
            style={{ color: 'var(--status-positive)' }}
            className="text-xl font-bold tabular-nums mt-1.5"
          >
            {formatRupiah(valuation.totalRetailValue)}
          </p>
        </div>
        <div className="hig-card p-4">
          <p style={{ color: 'var(--text-secondary)' }} className="text-xs font-semibold">
            Estimasi Laba Tersimpan
          </p>
          <p
            style={{ color: 'var(--accent-gold)' }}
            className="text-xl font-bold tabular-nums mt-1.5"
          >
            {formatRupiah(valuation.potentialProfit)}
          </p>
        </div>
        <div className="hig-card p-4">
          <p style={{ color: 'var(--text-secondary)' }} className="text-xs font-semibold">
            Total Unit / SKU Menipis
          </p>
          <p className="text-xl font-bold tabular-nums mt-1.5">
            {valuation.totalUnits.toLocaleString('id-ID')} unit{' '}
            <span style={{ color: 'var(--accent-gold)' }} className="text-sm font-semibold">
              ({valuation.lowStockCount} menipis)
            </span>
          </p>
        </div>
      </div>

      {/* Low Stock Queue — clean borderless Apple HIG list (no nested boxes, no competing black CTAs) */}
      {lowStockItems.length > 0 && (
        <div className="hig-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle
                style={{ color: 'var(--accent-gold)' }}
                className="w-4 h-4 shrink-0"
                aria-hidden="true"
              />
              <h3 className="text-sm font-bold">Stok di Bawah Batas Minimum</h3>
              <span
                style={{ color: 'var(--text-secondary)' }}
                className="text-xs font-medium tabular-nums"
              >
                ({lowStockItems.length} produk)
              </span>
            </div>
            {lowStockItems.length > 6 && (
              <button
                type="button"
                onClick={() => setShowAllLowStock((v) => !v)}
                style={{ color: 'var(--accent-primary-text)' }}
                className="min-h-[34px] px-2 text-xs font-semibold hover:underline"
              >
                {showAllLowStock ? 'Tampilkan ringkas' : `Lihat semua (${lowStockItems.length})`}
              </button>
            )}
          </div>

          <div
            className={`grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 ${
              showAllLowStock ? 'max-h-72 overflow-y-auto pr-1' : ''
            }`}
          >
            {(showAllLowStock ? lowStockItems : lowStockItems.slice(0, 6)).map((item) => (
              <div
                key={item.id}
                className="px-2.5 -mx-2.5 py-2 rounded-lg hig-row-hover flex items-center justify-between gap-3 text-xs transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-semibold truncate">{item.name}</p>
                  <p style={{ color: 'var(--text-secondary)' }} className="font-mono text-[11px]">
                    {item.sku} · Min. {item.minStock} {item.unit}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    style={{
                      color: item.stock === 0 ? 'var(--status-danger)' : 'var(--status-warning)',
                    }}
                    className="inline-flex items-center gap-1.5 font-semibold tabular-nums"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-current shrink-0"
                      aria-hidden="true"
                    />
                    {item.stock} {item.unit}
                  </span>
                  {can('warehouse:adjust') && (
                    <button
                      type="button"
                      onClick={() => openAdjustForProduct(item.id)}
                      style={{ color: 'var(--text-primary)' }}
                      className="min-h-[32px] px-2.5 py-1 rounded-lg hover:bg-[var(--bg-hover)] text-xs font-semibold transition-colors"
                    >
                      + Restok
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Movement History */}
      <div className="hig-card overflow-hidden">
        <div
          style={{ borderColor: 'var(--border-hairline)' }}
          className="p-4 border-b flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <ArrowDownUp
              style={{ color: 'var(--accent-primary-text)' }}
              className="w-4 h-4"
              aria-hidden="true"
            />
            <h3 className="text-sm font-bold">Riwayat Mutasi Stok ({filteredMovements.length})</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search
                style={{ color: 'var(--text-secondary)' }}
                className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="text"
                aria-label="Cari riwayat mutasi stok"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari SKU, produk, PIC, catatan..."
                className="min-h-[38px] pl-9 pr-3 py-1.5 hig-input text-xs w-60"
              />
            </div>
            <select
              aria-label="Kartu stok per produk"
              value={skuFilter}
              onChange={(e) => setSkuFilter(e.target.value)}
              className="min-h-[38px] px-3 py-1.5 hig-input text-xs font-semibold max-w-[200px]"
            >
              <option value="ALL">Semua Produk (Kartu Stok)</option>
              {db.products.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.sku}] {p.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter jenis mutasi stok"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'ALL' | StockMovementType)}
              className="min-h-[38px] px-3 py-1.5 hig-input text-xs font-semibold"
            >
              <option value="ALL">Semua Mutasi</option>
              <option value="PURCHASE">Pembelian PO</option>
              <option value="INBOUND">Stok Masuk (Inbound)</option>
              <option value="OUTBOUND">Stok Keluar (Outbound)</option>
              <option value="DAMAGED_EXPIRED">Koreksi / Rusak / Expired</option>
              <option value="SALE">Penjualan POS</option>
              <option value="VOID_RETURN">Retur Void</option>
              <option value="PARTIAL_RETURN">Retur Sebagian</option>
            </select>
            <button
              type="button"
              onClick={handleExportStockCard}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 hig-btn-secondary text-xs font-semibold"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export</span>
            </button>
          </div>
        </div>

        {filteredMovements.length === 0 ? (
          <EmptyState
            icon={ArrowDownUp}
            title="Mutasi stok tidak ditemukan"
            description="Tidak ada riwayat keluar-masuk stok yang cocok dengan filter saat ini."
            actionLabel="Reset Filter"
            onAction={() => {
              setSearch('');
              setTypeFilter('ALL');
              setSkuFilter('ALL');
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="hig-table-head">
                <tr>
                  <th className="py-3 px-4 font-semibold">Waktu</th>
                  <th className="py-3 px-4 font-semibold">Produk / SKU</th>
                  <th className="py-3 px-4 font-semibold">Jenis Mutasi</th>
                  <th className="py-3 px-4 font-semibold text-right">Perubahan</th>
                  <th className="py-3 px-4 font-semibold text-right">Stok Akhir</th>
                  <th className="py-3 px-4 font-semibold">PIC</th>
                  <th className="py-3 px-4 font-semibold">Catatan &amp; Referensi</th>
                </tr>
              </thead>
              <tbody>
                {filteredMovements.map((m) => (
                  <tr key={m.id} className="hig-row-hover">
                    <td
                      style={{ color: 'var(--text-secondary)' }}
                      className="py-3 px-4 whitespace-nowrap"
                    >
                      {formatDateTime(m.createdAt)}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-bold">{m.productName}</p>
                      <p
                        style={{ color: 'var(--text-secondary)' }}
                        className="font-mono text-[11px]"
                      >
                        {m.sku}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <MovementBadge type={m.type} />
                    </td>
                    <td
                      style={{
                        color:
                          m.qtyDelta > 0 ? 'var(--status-positive)' : 'var(--status-danger)',
                      }}
                      className="py-3 px-4 text-right font-mono font-bold tabular-nums"
                    >
                      {m.qtyDelta > 0 ? `+${formatNumber(m.qtyDelta)}` : formatNumber(m.qtyDelta)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {formatNumber(m.previousStock)} -&gt;{' '}
                      <span className="font-bold">{formatNumber(m.newStock)}</span>
                    </td>
                    <td className="py-3 px-4 font-medium">{m.picName}</td>
                    <td style={{ color: 'var(--text-secondary)' }} className="py-3 px-4">
                      {m.referenceId && (
                        <span
                          style={{ color: 'var(--text-primary)' }}
                          className="font-mono text-[11px] font-semibold mr-1.5"
                        >
                          [{m.referenceId}]
                        </span>
                      )}
                      {m.notes}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Adjust Stock Modal (with 3 macOS dots) */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Penyesuaian Stok / Opname Gudang"
        subtitle="Setiap mutasi otomatis tercatat pada Audit Trail dengan nama PIC"
      >
        <form onSubmit={handleAdjustSubmit} className="space-y-4 text-sm">
          <div>
            <label htmlFor="wh-prod" className="block text-xs font-semibold mb-1">
              Pilih Produk *
            </label>
            <select
              id="wh-prod"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 hig-input"
            >
              {db.products.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.sku}] {p.name}: Sisa {p.stock} {p.unit}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="wh-type" className="block text-xs font-semibold mb-1">
                Jenis Mutasi *
              </label>
              <select
                id="wh-type"
                value={adjType}
                onChange={(e) =>
                  setAdjType(e.target.value as 'INBOUND' | 'OUTBOUND' | 'DAMAGED_EXPIRED')
                }
                className="w-full min-h-[44px] px-3 py-2 hig-input"
              >
                <option value="INBOUND">Stok Masuk (Inbound)</option>
                <option value="OUTBOUND">Stok Keluar (Outbound)</option>
                <option value="DAMAGED_EXPIRED">Koreksi / Rusak / Expired</option>
              </select>
            </div>
            <div>
              <label htmlFor="wh-qty" className="block text-xs font-semibold mb-1">
                Kuantitas (Bisa Desimal Kg) *
              </label>
              <input
                id="wh-qty"
                type="number"
                min={0.01}
                step="any"
                required
                value={qty}
                onChange={(e) => setQty(Math.max(0.01, Number(e.target.value) || 0.01))}
                className="w-full min-h-[44px] px-3 py-2 hig-input font-mono font-bold tabular-nums"
              />
            </div>
          </div>

          <div>
            <label htmlFor="wh-ref" className="block text-xs font-semibold mb-1">
              No. Referensi / PO / Berita Acara (Opsional)
            </label>
            <input
              id="wh-ref"
              type="text"
              value={referenceId}
              onChange={(e) => setReferenceId(e.target.value)}
              placeholder="Contoh: PO-2026-11 / OPNAME-NOV"
              className="w-full min-h-[44px] px-3 py-2 hig-input"
            />
          </div>

          <div>
            <label htmlFor="wh-notes" className="block text-xs font-semibold mb-1">
              Alasan / Catatan Tertulis *
            </label>
            <textarea
              id="wh-notes"
              required
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Wajib diisi: misal penerimaan dari pemasok Temanggung atau barang lembap/rusak..."
              className="w-full px-3 py-2 hig-input"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="min-h-[44px] px-4 py-2 hig-btn-secondary text-xs font-semibold"
            >
              Batal
            </button>
            <button
              type="submit"
              className="min-h-[44px] px-4 py-2 hig-btn-cta text-xs font-semibold"
            >
              Simpan Mutasi Stok
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import { PackagePlus, Search, AlertTriangle, ArrowDownUp } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { calcInventoryValuation } from '../lib/calculations';
import { formatDateTime, formatRupiah } from '../lib/format';
import { MovementBadge, Modal } from '../components/ui/SharedUi';
import { StockMovementType } from '../types/erp';

export const WarehousePage: React.FC = () => {
  const { db, can, adjustStock, showToast } = useErp();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | StockMovementType>('ALL');
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
      const qOk =
        !q ||
        m.productName.toLowerCase().includes(q) ||
        m.sku.toLowerCase().includes(q) ||
        m.picName.toLowerCase().includes(q) ||
        m.notes.toLowerCase().includes(q) ||
        (m.referenceId || '').toLowerCase().includes(q);
      return typeOk && qOk;
    });
  }, [db.stockMovements, search, typeFilter]);

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
      {/* Valuation & Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-[#1A1614]">
            Valuasi Inventaris &amp; Mutasi Gudang
          </h2>
          <p className="text-xs text-[#6B6257]">
            Estimasi nilai aset real-time berdasarkan Harga Pokok Penjualan (HPP) dan rekam jejak
            keluar-masuk stok.
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
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-bold shadow-xs cursor-pointer"
          >
            <PackagePlus className="w-4 h-4" />
            Penyesuaian Stok (Opname)
          </button>
        )}
      </div>

      {/* Valuation Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E6E0D6] rounded-xl p-4">
          <p className="text-xs font-bold uppercase text-[#6B6257]">Valuasi Aset Gudang (HPP)</p>
          <p className="text-xl font-extrabold text-[#1A1614] tabular-nums mt-2">
            {formatRupiah(valuation.totalHppValue)}
          </p>
        </div>
        <div className="bg-white border border-[#E6E0D6] rounded-xl p-4">
          <p className="text-xs font-bold uppercase text-[#6B6257]">Potensi Nilai Jual</p>
          <p className="text-xl font-extrabold text-emerald-800 tabular-nums mt-2">
            {formatRupiah(valuation.totalRetailValue)}
          </p>
        </div>
        <div className="bg-white border border-[#E6E0D6] rounded-xl p-4">
          <p className="text-xs font-bold uppercase text-[#6B6257]">Estimasi Laba Tersimpan</p>
          <p className="text-xl font-extrabold text-[#B8860B] tabular-nums mt-2">
            {formatRupiah(valuation.potentialProfit)}
          </p>
        </div>
        <div className="bg-white border border-[#E6E0D6] rounded-xl p-4">
          <p className="text-xs font-bold uppercase text-[#6B6257]">Total Unit / SKU Menipis</p>
          <p className="text-xl font-extrabold text-[#1A1614] tabular-nums mt-2">
            {valuation.totalUnits.toLocaleString('id-ID')} unit{' '}
            <span className="text-sm font-bold text-amber-700">
              ({valuation.lowStockCount} menipis)
            </span>
          </p>
        </div>
      </div>

      {/* Low Stock Quick Alert Strip */}
      {lowStockItems.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs font-extrabold text-amber-900 mb-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Stok Berada di Bawah Batas Minimum ({lowStockItems.length} Produk)
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStockItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2.5 bg-white border border-amber-200 rounded-lg px-3 py-1.5 text-xs"
              >
                <span className="font-semibold text-[#1A1614]">{item.name}</span>
                <span className="font-mono font-bold text-rose-700 tabular-nums">
                  {item.stock}/{item.minStock} {item.unit}
                </span>
                {can('warehouse:adjust') && (
                  <button
                    type="button"
                    onClick={() => openAdjustForProduct(item.id)}
                    className="px-2 py-0.5 rounded bg-[#14110F] text-white text-[11px] font-bold hover:bg-[#B91C1C] cursor-pointer"
                  >
                    + Restok
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Movement History */}
      <div className="bg-white border border-[#E6E0D6] rounded-xl shadow-xs overflow-hidden">
        <div className="p-4 border-b border-[#E6E0D6] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ArrowDownUp className="w-4 h-4 text-[#B91C1C]" />
            <h3 className="text-sm font-extrabold text-[#1A1614]">
              Riwayat Mutasi Stok ({filteredMovements.length})
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-[#8A7F73] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari SKU, produk, PIC, catatan..."
                className="pl-9 pr-3 py-1.5 rounded-lg border border-[#D8D0C5] text-xs w-60"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'ALL' | StockMovementType)}
              className="px-3 py-1.5 rounded-lg border border-[#D8D0C5] text-xs bg-white font-semibold"
            >
              <option value="ALL">Semua Mutasi</option>
              <option value="INBOUND">Stok Masuk (Inbound)</option>
              <option value="OUTBOUND">Stok Keluar (Outbound)</option>
              <option value="DAMAGED_EXPIRED">Koreksi / Rusak / Expired</option>
              <option value="SALE">Penjualan POS</option>
              <option value="VOID_RETURN">Retur Void</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#F8F6F2] border-b border-[#E6E0D6] text-[#5C5349] uppercase">
              <tr>
                <th className="py-3 px-4 font-bold">Waktu</th>
                <th className="py-3 px-4 font-bold">Produk / SKU</th>
                <th className="py-3 px-4 font-bold">Jenis Mutasi</th>
                <th className="py-3 px-4 font-bold text-right">Perubahan</th>
                <th className="py-3 px-4 font-bold text-right">Stok Akhir</th>
                <th className="py-3 px-4 font-bold">PIC</th>
                <th className="py-3 px-4 font-bold">Catatan &amp; Referensi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EDE7DD]">
              {filteredMovements.map((m) => (
                <tr key={m.id} className="hover:bg-[#FAF8F4]">
                  <td className="py-3 px-4 whitespace-nowrap text-[#5C5349]">
                    {formatDateTime(m.createdAt)}
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-bold text-[#1A1614]">{m.productName}</p>
                    <p className="font-mono text-[11px] text-[#7C7165]">{m.sku}</p>
                  </td>
                  <td className="py-3 px-4">
                    <MovementBadge type={m.type} />
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-mono font-extrabold tabular-nums ${
                      m.qtyDelta > 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {m.qtyDelta > 0 ? `+${m.qtyDelta}` : m.qtyDelta}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums">
                    {m.previousStock} → <span className="font-extrabold">{m.newStock}</span>
                  </td>
                  <td className="py-3 px-4 font-medium">{m.picName}</td>
                  <td className="py-3 px-4 text-[#5C5349]">
                    {m.referenceId && (
                      <span className="font-mono text-[11px] font-semibold text-[#1A1614] mr-1.5">
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
      </div>

      {/* Adjust Stock Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Penyesuaian Stok / Opname Gudang"
        subtitle="Setiap mutasi otomatis tercatat pada Audit Trail dengan nama PIC"
      >
        <form onSubmit={handleAdjustSubmit} className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-bold text-[#5C5349] mb-1">Pilih Produk *</label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5] bg-white"
            >
              {db.products.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.sku}] {p.name} — Sisa {p.stock} {p.unit}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#5C5349] mb-1">Jenis Mutasi *</label>
              <select
                value={adjType}
                onChange={(e) =>
                  setAdjType(e.target.value as 'INBOUND' | 'OUTBOUND' | 'DAMAGED_EXPIRED')
                }
                className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5] bg-white"
              >
                <option value="INBOUND">Stok Masuk (Inbound)</option>
                <option value="OUTBOUND">Stok Keluar (Outbound)</option>
                <option value="DAMAGED_EXPIRED">Koreksi / Rusak / Expired</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5C5349] mb-1">Kuantitas *</label>
              <input
                type="number"
                min={1}
                required
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5] font-mono font-bold tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#5C5349] mb-1">
              No. Referensi / PO / Berita Acara (Opsional)
            </label>
            <input
              type="text"
              value={referenceId}
              onChange={(e) => setReferenceId(e.target.value)}
              placeholder="Contoh: PO-2026-11 / OPNAME-NOV"
              className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#5C5349] mb-1">
              Alasan / Catatan Tertulis *
            </label>
            <textarea
              required
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Wajib diisi: misal penerimaan dari pemasok Temanggung atau barang lembap/rusak..."
              className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-[#D8D0C5] text-xs font-bold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#B91C1C] text-white text-xs font-bold cursor-pointer"
            >
              Simpan Mutasi Stok
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

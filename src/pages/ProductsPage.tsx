import React, { useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Upload,
  Download,
  Pencil,
  Trash2,
  AlertTriangle,
  FileSpreadsheet,
} from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { calcMarginPercent } from '../lib/calculations';
import {
  CsvProductRow,
  downloadCsv,
  parseProductsCsv,
  PRODUCT_CSV_HEADERS,
} from '../lib/csv';
import { formatRupiah } from '../lib/format';
import { Product } from '../types/erp';
import { Modal } from '../components/ui/SharedUi';

export const ProductsPage: React.FC = () => {
  const { db, can, upsertProduct, deleteProduct, importProductsBulk, showToast } = useErp();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('SEMUA');
  const [onlyLowStock, setOnlyLowStock] = useState(false);

  // Add/Edit Product Modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Tembakau Rajangan');
  const [unit, setUnit] = useState('Pouch');
  const [costPrice, setCostPrice] = useState<number>(30000);
  const [sellPrice, setSellPrice] = useState<number>(45000);
  const [stock, setStock] = useState<number>(50);
  const [minStock, setMinStock] = useState<number>(10);
  const [description, setDescription] = useState('');

  // Import CSV Modal
  const [importOpen, setImportOpen] = useState(false);
  const [csvPreview, setCsvPreview] = useState<{
    valid: CsvProductRow[];
    errors: string[];
  } | null>(null);

  const showCost = can('products:view_cost');

  const categories = useMemo(() => {
    const s = new Set(db.products.map((p) => p.category));
    return ['SEMUA', ...Array.from(s)];
  }, [db.products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.products.filter((p) => {
      if (categoryFilter !== 'SEMUA' && p.category !== categoryFilter) return false;
      if (onlyLowStock && p.stock > p.minStock) return false;
      if (
        q &&
        !p.name.toLowerCase().includes(q) &&
        !p.sku.toLowerCase().includes(q) &&
        !p.category.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [db.products, search, categoryFilter, onlyLowStock]);

  const openAdd = () => {
    setEditingId(undefined);
    setSku('');
    setName('');
    setCategory('Tembakau Rajangan');
    setUnit('Pouch');
    setCostPrice(30000);
    setSellPrice(45000);
    setStock(25);
    setMinStock(10);
    setDescription('');
    setFormOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditingId(p.id);
    setSku(p.sku);
    setName(p.name);
    setCategory(p.category);
    setUnit(p.unit);
    setCostPrice(p.costPrice);
    setSellPrice(p.sellPrice);
    setStock(p.stock);
    setMinStock(p.minStock);
    setDescription(p.description || '');
    setFormOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      upsertProduct({
        id: editingId,
        sku,
        name,
        category,
        unit,
        costPrice,
        sellPrice,
        stock,
        minStock,
        description,
      });
      setFormOpen(false);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal menyimpan produk.');
    }
  };

  const handleDelete = (p: Product) => {
    if (!window.confirm(`Hapus produk "${p.name}" (${p.sku})?`)) return;
    try {
      deleteProduct(p.id);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal menghapus produk.');
    }
  };

  const handleExportCsv = () => {
    const rows = db.products.map((p) => [
      p.sku,
      p.name,
      p.category,
      p.unit,
      p.costPrice,
      p.sellPrice,
      p.stock,
      p.minStock,
      p.description || '',
    ]);
    downloadCsv('indobacco-master-produk.csv', PRODUCT_CSV_HEADERS, rows);
  };

  const handleDownloadTemplate = () => {
    downloadCsv('template-import-produk.csv', PRODUCT_CSV_HEADERS, [
      [
        'IDB-RJG-099',
        'Tembakau Contoh Temanggung (100g)',
        'Tembakau Rajangan',
        'Pouch',
        32000,
        48000,
        40,
        10,
        'Catatan contoh produk baru',
      ],
    ]);
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const res = parseProductsCsv(text);
    setCsvPreview(res);
  };

  const handleConfirmImport = () => {
    if (!csvPreview || csvPreview.valid.length === 0) return;
    try {
      importProductsBulk(csvPreview.valid);
      setImportOpen(false);
      setCsvPreview(null);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Import CSV gagal.');
    }
  };

  const liveMargin = calcMarginPercent(costPrice, sellPrice);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-[#1A1614]">Katalog Master Produk</h2>
          <p className="text-xs text-[#6B6257]">
            Kelola SKU, kategori tembakau &amp; perlengkapan, kalkulasi margin laba otomatis, dan
            import/export massal CSV.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showCost && (
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#D8D0C5] bg-white hover:bg-[#F8F6F2] text-xs font-bold cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          )}
          {can('products:write') && (
            <>
              <button
                type="button"
                onClick={() => {
                  setCsvPreview(null);
                  setImportOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#D8D0C5] bg-white hover:bg-[#F8F6F2] text-xs font-bold cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                Import CSV
              </button>
              <button
                type="button"
                onClick={openAdd}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-bold cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Tambah Produk
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#E6E0D6] rounded-xl p-3.5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[#8A7F73] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari SKU, nama produk, atau kategori..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-[#D8D0C5] text-xs"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-[#D8D0C5] text-xs bg-white font-semibold"
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c === 'SEMUA' ? 'Semua Kategori' : c}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#5C5349] cursor-pointer">
          <input
            type="checkbox"
            checked={onlyLowStock}
            onChange={(e) => setOnlyLowStock(e.target.checked)}
            className="rounded border-[#D8D0C5]"
          />
          Hanya Stok Menipis
        </label>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#E6E0D6] rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#F8F6F2] border-b border-[#E6E0D6] text-[#5C5349] uppercase">
              <tr>
                <th className="py-3 px-4 font-bold">SKU</th>
                <th className="py-3 px-4 font-bold">Nama Produk</th>
                <th className="py-3 px-4 font-bold">Kategori</th>
                <th className="py-3 px-4 font-bold">Satuan</th>
                {showCost && <th className="py-3 px-4 font-bold text-right">Harga Beli (HPP)</th>}
                <th className="py-3 px-4 font-bold text-right">Harga Jual</th>
                {showCost && <th className="py-3 px-4 font-bold text-right">Margin</th>}
                <th className="py-3 px-4 font-bold text-right">Stok</th>
                {(can('products:write') || can('products:delete')) && (
                  <th className="py-3 px-4 font-bold text-right">Aksi</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EDE7DD]">
              {filtered.map((p) => {
                const margin = calcMarginPercent(p.costPrice, p.sellPrice);
                const isLow = p.stock <= p.minStock;
                return (
                  <tr key={p.id} className="hover:bg-[#FAF8F4]">
                    <td className="py-3 px-4 font-mono font-bold text-[#1A1614]">{p.sku}</td>
                    <td className="py-3 px-4">
                      <p className="font-bold text-[#1A1614]">{p.name}</p>
                      {p.description && (
                        <p className="text-[11px] text-[#7C7165] truncate max-w-xs">
                          {p.description}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[#5C5349]">{p.category}</td>
                    <td className="py-3 px-4">{p.unit}</td>
                    {showCost && (
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {formatRupiah(p.costPrice)}
                      </td>
                    )}
                    <td className="py-3 px-4 text-right font-mono font-bold text-[#1A1614] tabular-nums">
                      {formatRupiah(p.sellPrice)}
                    </td>
                    {showCost && (
                      <td className="py-3 px-4 text-right tabular-nums">
                        <span
                          className={`px-1.5 py-0.5 rounded font-bold ${
                            margin >= 25
                              ? 'bg-emerald-50 text-emerald-700'
                              : margin >= 10
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {margin}%
                        </span>
                      </td>
                    )}
                    <td className="py-3 px-4 text-right tabular-nums">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold ${
                          p.stock === 0
                            ? 'bg-rose-100 text-rose-800'
                            : isLow
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {isLow && <AlertTriangle className="w-3 h-3" />}
                        {p.stock} {p.unit}
                      </span>
                    </td>
                    {(can('products:write') || can('products:delete')) && (
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-1">
                        {can('products:write') && (
                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            className="p-1.5 rounded border border-[#D8D0C5] hover:bg-[#F1EDE5] cursor-pointer"
                            title="Edit produk"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {can('products:delete') && (
                          <button
                            type="button"
                            onClick={() => handleDelete(p)}
                            className="p-1.5 rounded border border-rose-200 text-rose-700 hover:bg-rose-50 cursor-pointer"
                            title="Hapus produk"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? 'Edit Master Produk' : 'Tambah Produk Baru'}
      >
        <form onSubmit={handleSave} className="space-y-3.5 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#5C5349] mb-1">Kode SKU *</label>
              <input
                type="text"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="IDB-RJG-005"
                className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5] font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5C5349] mb-1">Satuan *</label>
              <input
                type="text"
                required
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="Pouch / Bal / Box"
                className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#5C5349] mb-1">Nama Produk *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#5C5349] mb-1">Kategori *</label>
            <input
              type="text"
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#5C5349] mb-1">
                Harga Beli / HPP (Rp) *
              </label>
              <input
                type="number"
                required
                min={0}
                value={costPrice}
                onChange={(e) => setCostPrice(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5] font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5C5349] mb-1">
                Harga Jual (Rp) *
              </label>
              <input
                type="number"
                required
                min={1}
                value={sellPrice}
                onChange={(e) => setSellPrice(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5] font-mono tabular-nums"
              />
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-[#F8F6F2] border border-[#E6E0D6] flex justify-between text-xs">
            <span>Estimasi Margin Laba per Unit:</span>
            <span className="font-extrabold text-emerald-700 tabular-nums">
              {liveMargin}% ({formatRupiah(sellPrice - costPrice)})
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#5C5349] mb-1">Stok Saat Ini *</label>
              <input
                type="number"
                required
                min={0}
                value={stock}
                onChange={(e) => setStock(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5] font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5C5349] mb-1">
                Batas Minimum (Alert) *
              </label>
              <input
                type="number"
                required
                min={0}
                value={minStock}
                onChange={(e) => setMinStock(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5] font-mono tabular-nums"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#5C5349] mb-1">Deskripsi</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 py-2 rounded-lg border border-[#D8D0C5] text-xs font-bold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#B91C1C] text-white text-xs font-bold cursor-pointer"
            >
              Simpan Produk
            </button>
          </div>
        </form>
      </Modal>

      {/* CSV Bulk Import Modal */}
      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Master Produk Massal (CSV)"
        subtitle="Produk dengan SKU yang sama akan otomatis diperbarui; SKU baru akan ditambahkan"
        maxWidth="max-w-xl"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 rounded-lg bg-[#F8F6F2] border border-[#E6E0D6] flex items-center justify-between gap-3">
            <div>
              <p className="font-bold text-[#1A1614]">Format Kolom CSV</p>
              <p className="text-[#6B6257] font-mono text-[11px] mt-0.5">
                {PRODUCT_CSV_HEADERS.join(', ')}
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#D8D0C5] font-bold shrink-0 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#B91C1C]" />
              Unduh Template
            </button>
          </div>

          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFilePick}
            className="block w-full text-xs text-[#5C5349] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#14110F] file:text-white file:font-bold cursor-pointer"
          />

          {csvPreview && (
            <div className="space-y-2">
              <div className="flex gap-3 font-bold">
                <span className="text-emerald-700">Valid: {csvPreview.valid.length} baris</span>
                <span className="text-rose-700">Error: {csvPreview.errors.length} baris</span>
              </div>
              {csvPreview.errors.length > 0 && (
                <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-800 max-h-28 overflow-y-auto space-y-1">
                  {csvPreview.errors.map((err, i) => (
                    <p key={i}>{err}</p>
                  ))}
                </div>
              )}
              {csvPreview.valid.length > 0 && (
                <div className="border border-[#E6E0D6] rounded max-h-40 overflow-y-auto">
                  <table className="w-full text-left">
                    <thead className="bg-[#F8F6F2] border-b border-[#E6E0D6]">
                      <tr>
                        <th className="py-1.5 px-2">SKU</th>
                        <th className="py-1.5 px-2">Nama</th>
                        <th className="py-1.5 px-2 text-right">Jual</th>
                        <th className="py-1.5 px-2 text-right">Stok</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EDE7DD]">
                      {csvPreview.valid.map((r) => (
                        <tr key={r.sku}>
                          <td className="py-1.5 px-2 font-mono">{r.sku}</td>
                          <td className="py-1.5 px-2">{r.name}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums">
                            {formatRupiah(r.sellPrice)}
                          </td>
                          <td className="py-1.5 px-2 text-right tabular-nums">{r.stock}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setImportOpen(false)}
              className="px-4 py-2 rounded-lg border border-[#D8D0C5] font-bold cursor-pointer"
            >
              Tutup
            </button>
            <button
              type="button"
              disabled={!csvPreview || csvPreview.valid.length === 0}
              onClick={handleConfirmImport}
              className="px-4 py-2 rounded-lg bg-[#B91C1C] disabled:bg-stone-300 text-white font-bold cursor-pointer"
            >
              Impor {csvPreview?.valid.length || 0} Produk
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

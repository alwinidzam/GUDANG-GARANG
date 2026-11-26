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
  Boxes,
  Table2,
  Save,
  Tag,
} from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { calcMarginPercent } from '../lib/calculations';
import {
  CsvProductRow,
  downloadCsv,
  parseProductsCsv,
  PRODUCT_CSV_HEADERS,
} from '../lib/csv';
import { formatNumber, formatRupiah } from '../lib/format';
import { BulkProductPatch } from '../lib/storeEngine';
import { Product } from '../types/erp';
import { EmptyState, Modal } from '../components/ui/SharedUi';

export const ProductsPage: React.FC = () => {
  const {
    db,
    can,
    upsertProduct,
    bulkUpdateProducts,
    deleteProduct,
    importProductsBulk,
    openPrint,
    showToast,
  } = useErp();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('SEMUA');
  const [onlyLowStock, setOnlyLowStock] = useState(false);

  // Bulk inline opname mode
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkDrafts, setBulkDrafts] = useState<Record<string, BulkProductPatch>>({});

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Tembakau Flavour');
  const [unit, setUnit] = useState('Kg');
  const [costPrice, setCostPrice] = useState<number>(0);
  const [sellPrice, setSellPrice] = useState<number>(130000);
  const [wholesalePrice, setWholesalePrice] = useState<string>('');
  const [distributorPrice, setDistributorPrice] = useState<string>('');
  const [stock, setStock] = useState<number>(0);
  const [minStock, setMinStock] = useState<number>(0);
  const [description, setDescription] = useState('');

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
    setCategory('Tembakau Flavour');
    setUnit('Kg');
    setCostPrice(0);
    setSellPrice(130000);
    setWholesalePrice('');
    setDistributorPrice('');
    setStock(0);
    setMinStock(0);
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
    setWholesalePrice(p.wholesalePrice ? String(p.wholesalePrice) : '');
    setDistributorPrice(p.distributorPrice ? String(p.distributorPrice) : '');
    setStock(p.stock);
    setMinStock(p.minStock);
    setDescription(p.description || '');
    setFormOpen(true);
  };

  const updateBulkField = (p: Product, field: keyof BulkProductPatch, value: number | undefined) => {
    setBulkDrafts((prev) => {
      const base: BulkProductPatch = prev[p.id] || {
        id: p.id,
        costPrice: p.costPrice,
        sellPrice: p.sellPrice,
        wholesalePrice: p.wholesalePrice,
        distributorPrice: p.distributorPrice,
        stock: p.stock,
        minStock: p.minStock,
      };
      return {
        ...prev,
        [p.id]: { ...base, [field]: value },
      };
    });
  };

  const bulkChangedCount = Object.keys(bulkDrafts).length;

  const handleSaveBulk = () => {
    try {
      const patches = Object.values(bulkDrafts);
      bulkUpdateProducts(patches);
      setBulkDrafts({});
      setBulkMode(false);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal menyimpan edit massal.');
    }
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
        wholesalePrice: Number(wholesalePrice) || undefined,
        distributorPrice: Number(distributorPrice) || undefined,
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
          <h2 className="text-lg font-bold tracking-tight">Katalog Master Produk</h2>
          <p style={{ color: 'var(--text-secondary)' }} className="text-xs mt-0.5">
            Kelola SKU, kategori tembakau, margin laba otomatis, dan import/export massal CSV.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showCost && (
            <button
              type="button"
              onClick={handleExportCsv}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 hig-btn-secondary text-xs font-semibold"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export CSV</span>
            </button>
          )}
          {can('products:write') && (
            <>
              {bulkMode ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setBulkDrafts({});
                      setBulkMode(false);
                    }}
                    className="min-h-[40px] px-3 py-2 hig-btn-secondary text-xs font-semibold"
                  >
                    Batal Edit Massal
                  </button>
                  <button
                    type="button"
                    disabled={bulkChangedCount === 0}
                    onClick={handleSaveBulk}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 hig-btn-cta text-xs font-semibold disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Simpan Perubahan ({bulkChangedCount} SKU)</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setBulkDrafts({});
                      setBulkMode(true);
                    }}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 hig-btn-secondary text-xs font-semibold"
                  >
                    <Table2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Edit Massal (Stok &amp; HPP)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCsvPreview(null);
                      setImportOpen(true);
                    }}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 hig-btn-secondary text-xs font-semibold"
                  >
                    <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Import CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={openAdd}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 hig-btn-cta text-xs font-semibold"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    <span>Tambah Produk</span>
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="hig-card p-3.5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search
            style={{ color: 'var(--text-secondary)' }}
            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="text"
            aria-label="Cari SKU atau nama produk"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari SKU, nama produk, atau kategori..."
            className="w-full min-h-[38px] pl-9 pr-3 py-1.5 hig-input text-xs"
          />
        </div>
        <select
          aria-label="Filter kategori produk"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="min-h-[38px] px-3 py-1.5 hig-input text-xs font-semibold"
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c === 'SEMUA' ? 'Semua Kategori' : c}
            </option>
          ))}
        </select>
        <label
          htmlFor="only-low-stock"
          className="inline-flex items-center gap-2 text-xs font-semibold"
        >
          <input
            id="only-low-stock"
            type="checkbox"
            checked={onlyLowStock}
            onChange={(e) => setOnlyLowStock(e.target.checked)}
            className="rounded"
          />
          <span>Hanya Stok Menipis</span>
        </label>
      </div>

      {/* Table */}
      <div className="hig-card overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title="Produk tidak ditemukan"
            description="Tidak ada produk yang cocok dengan filter pencarian atau kategori."
            actionLabel="Reset Filter"
            onAction={() => {
              setSearch('');
              setCategoryFilter('SEMUA');
              setOnlyLowStock(false);
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="hig-table-head">
                <tr>
                  <th className="py-3 px-4 font-semibold">SKU</th>
                  <th className="py-3 px-4 font-semibold">Nama Produk</th>
                  <th className="py-3 px-4 font-semibold">Kategori</th>
                  <th className="py-3 px-4 font-semibold">Satuan</th>
                  {showCost && (
                    <th className="py-3 px-4 font-semibold text-right">Harga Beli (HPP)</th>
                  )}
                  <th className="py-3 px-4 font-semibold text-right">Harga Jual</th>
                  {bulkMode && (
                    <>
                      <th className="py-3 px-4 font-semibold text-right">Grosir</th>
                      <th className="py-3 px-4 font-semibold text-right">Distributor</th>
                    </>
                  )}
                  {showCost && !bulkMode && (
                    <th className="py-3 px-4 font-semibold text-right">Margin</th>
                  )}
                  <th className="py-3 px-4 font-semibold text-right">Stok</th>
                  {bulkMode && <th className="py-3 px-4 font-semibold text-right">Min. Stok</th>}
                  {!bulkMode && (can('products:write') || can('products:delete')) && (
                    <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const draft = bulkDrafts[p.id];
                  const curCost = draft ? draft.costPrice : p.costPrice;
                  const curSell = draft ? draft.sellPrice : p.sellPrice;
                  const curWholesale = draft ? draft.wholesalePrice : p.wholesalePrice;
                  const curDist = draft ? draft.distributorPrice : p.distributorPrice;
                  const curStock = draft ? draft.stock : p.stock;
                  const curMin = draft ? draft.minStock : p.minStock;
                  const margin = calcMarginPercent(curCost, curSell);
                  const isLow = curStock <= curMin;
                  return (
                    <tr key={p.id} className="hig-row-hover">
                      <td className="py-3 px-4 font-mono font-bold whitespace-nowrap">{p.sku}</td>
                      <td className="py-3 px-4">
                        <p className="font-bold">{p.name}</p>
                        {(p.wholesalePrice || p.distributorPrice) && !bulkMode && (
                          <p style={{ color: 'var(--text-secondary)' }} className="text-[11px] tabular-nums">
                            {p.wholesalePrice ? `Grosir ${formatRupiah(p.wholesalePrice)}` : ''}
                            {p.wholesalePrice && p.distributorPrice ? ' · ' : ''}
                            {p.distributorPrice ? `Dist. ${formatRupiah(p.distributorPrice)}` : ''}
                          </p>
                        )}
                        {p.description && (
                          <p
                            style={{ color: 'var(--text-secondary)' }}
                            className="text-[11px] truncate max-w-xs"
                          >
                            {p.description}
                          </p>
                        )}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }} className="py-3 px-4">
                        {p.category}
                      </td>
                      <td className="py-3 px-4">{p.unit}</td>
                      {showCost && (
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          {bulkMode ? (
                            <input
                              type="number"
                              aria-label={`HPP ${p.sku}`}
                              min={0}
                              value={curCost}
                              onChange={(e) =>
                                updateBulkField(p, 'costPrice', Number(e.target.value) || 0)
                              }
                              className="w-24 px-2 py-1 text-right hig-input font-mono text-xs"
                            />
                          ) : (
                            formatRupiah(p.costPrice)
                          )}
                        </td>
                      )}
                      <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">
                        {bulkMode ? (
                          <input
                            type="number"
                            aria-label={`Harga Jual ${p.sku}`}
                            min={1}
                            value={curSell}
                            onChange={(e) =>
                              updateBulkField(p, 'sellPrice', Number(e.target.value) || 0)
                            }
                            className="w-24 px-2 py-1 text-right hig-input font-mono text-xs"
                          />
                        ) : (
                          formatRupiah(p.sellPrice)
                        )}
                      </td>
                      {bulkMode && (
                        <>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">
                            <input
                              type="number"
                              aria-label={`Harga Grosir ${p.sku}`}
                              min={0}
                              placeholder="-"
                              value={curWholesale ?? ''}
                              onChange={(e) =>
                                updateBulkField(
                                  p,
                                  'wholesalePrice',
                                  Number(e.target.value) || undefined
                                )
                              }
                              className="w-24 px-2 py-1 text-right hig-input font-mono text-xs"
                            />
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">
                            <input
                              type="number"
                              aria-label={`Harga Distributor ${p.sku}`}
                              min={0}
                              placeholder="-"
                              value={curDist ?? ''}
                              onChange={(e) =>
                                updateBulkField(
                                  p,
                                  'distributorPrice',
                                  Number(e.target.value) || undefined
                                )
                              }
                              className="w-24 px-2 py-1 text-right hig-input font-mono text-xs"
                            />
                          </td>
                        </>
                      )}
                      {showCost && !bulkMode && (
                        <td className="py-3 px-4 text-right tabular-nums">
                          {p.costPrice > 0 ? (
                            <span
                              style={{
                                color:
                                  margin >= 25
                                    ? 'var(--status-positive)'
                                    : margin >= 10
                                    ? 'var(--status-warning)'
                                    : 'var(--status-danger)',
                              }}
                              className="font-semibold"
                            >
                              {margin}%
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-secondary)' }}>-</span>
                          )}
                        </td>
                      )}
                      <td className="py-3 px-4 text-right tabular-nums">
                        {bulkMode ? (
                          <input
                            type="number"
                            aria-label={`Stok ${p.sku}`}
                            min={0}
                            step="any"
                            value={curStock}
                            onChange={(e) =>
                              updateBulkField(p, 'stock', Number(e.target.value) || 0)
                            }
                            className="w-20 px-2 py-1 text-right hig-input font-mono text-xs"
                          />
                        ) : (
                          <span
                            style={{
                              color:
                                p.stock === 0
                                  ? 'var(--status-danger)'
                                  : isLow
                                  ? 'var(--status-warning)'
                                  : 'var(--status-positive)',
                            }}
                            className="inline-flex items-center gap-1.5 font-semibold"
                          >
                            {isLow ? (
                              <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                            ) : (
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-current shrink-0"
                                aria-hidden="true"
                              />
                            )}
                            {formatNumber(p.stock)} {p.unit}
                          </span>
                        )}
                      </td>
                      {bulkMode && (
                        <td className="py-3 px-4 text-right tabular-nums">
                          <input
                            type="number"
                            aria-label={`Min Stok ${p.sku}`}
                            min={0}
                            step="any"
                            value={curMin}
                            onChange={(e) =>
                              updateBulkField(p, 'minStock', Number(e.target.value) || 0)
                            }
                            className="w-16 px-2 py-1 text-right hig-input font-mono text-xs"
                          />
                        </td>
                      )}
                      {!bulkMode && (can('products:write') || can('products:delete')) && (
                        <td className="py-3 px-4 text-right whitespace-nowrap space-x-1">
                          <button
                            type="button"
                            onClick={() => openPrint({ kind: 'labels', products: [p], copies: 6 })}
                            className="w-8 h-8 inline-flex items-center justify-center hig-btn-secondary"
                            aria-label={`Cetak label ${p.name}`}
                            title="Cetak label kemasan"
                          >
                            <Tag className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          {can('products:write') && (
                            <button
                              type="button"
                              onClick={() => openEdit(p)}
                              className="w-8 h-8 inline-flex items-center justify-center hig-btn-secondary"
                              aria-label={`Edit ${p.name}`}
                              title="Edit produk"
                            >
                              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          )}
                          {can('products:delete') && (
                            <button
                              type="button"
                              onClick={() => handleDelete(p)}
                              style={{
                                backgroundColor: 'var(--status-danger-soft)',
                                color: 'var(--status-danger)',
                              }}
                              className="w-8 h-8 inline-flex items-center justify-center rounded-lg"
                              aria-label={`Hapus ${p.name}`}
                              title="Hapus produk"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
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
        )}
      </div>

      {/* Add/Edit Modal (3 macOS dots) */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? 'Edit Master Produk' : 'Tambah Produk Baru'}
      >
        <form onSubmit={handleSave} className="space-y-3.5 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="prd-sku" className="block text-xs font-semibold mb-1">
                Kode SKU *
              </label>
              <input
                id="prd-sku"
                type="text"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="IDB-RJG-005"
                className="w-full min-h-[42px] px-3 py-2 hig-input font-mono uppercase"
              />
            </div>
            <div>
              <label htmlFor="prd-unit" className="block text-xs font-semibold mb-1">
                Satuan *
              </label>
              <input
                id="prd-unit"
                type="text"
                required
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="Pouch / Bal / Box"
                className="w-full min-h-[42px] px-3 py-2 hig-input"
              />
            </div>
          </div>
          <div>
            <label htmlFor="prd-name" className="block text-xs font-semibold mb-1">
              Nama Produk *
            </label>
            <input
              id="prd-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 hig-input"
            />
          </div>
          <div>
            <label htmlFor="prd-cat" className="block text-xs font-semibold mb-1">
              Kategori *
            </label>
            <input
              id="prd-cat"
              type="text"
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 hig-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="prd-hpp" className="block text-xs font-semibold mb-1">
                Harga Beli / HPP (Rp) *
              </label>
              <input
                id="prd-hpp"
                type="number"
                required
                min={0}
                value={costPrice}
                onChange={(e) => setCostPrice(Number(e.target.value) || 0)}
                className="w-full min-h-[42px] px-3 py-2 hig-input font-mono tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="prd-sell" className="block text-xs font-semibold mb-1">
                Harga Jual (Rp) *
              </label>
              <input
                id="prd-sell"
                type="number"
                required
                min={1}
                value={sellPrice}
                onChange={(e) => setSellPrice(Number(e.target.value) || 0)}
                className="w-full min-h-[42px] px-3 py-2 hig-input font-mono tabular-nums"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="prd-grosir" className="block text-xs font-semibold mb-1">
                Harga Grosir (Opsional)
              </label>
              <input
                id="prd-grosir"
                type="number"
                min={0}
                value={wholesalePrice}
                onChange={(e) => setWholesalePrice(e.target.value)}
                placeholder="Sama dgn Harga Jual"
                className="w-full min-h-[42px] px-3 py-2 hig-input font-mono tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="prd-dist" className="block text-xs font-semibold mb-1">
                Harga Distributor (Opsional)
              </label>
              <input
                id="prd-dist"
                type="number"
                min={0}
                value={distributorPrice}
                onChange={(e) => setDistributorPrice(e.target.value)}
                placeholder="Sama dgn Harga Jual"
                className="w-full min-h-[42px] px-3 py-2 hig-input font-mono tabular-nums"
              />
            </div>
          </div>
          <div className="hig-inset p-2.5 flex justify-between text-xs">
            <span>Estimasi Margin Laba per Unit:</span>
            <span style={{ color: 'var(--status-positive)' }} className="font-bold tabular-nums">
              {liveMargin}% ({formatRupiah(sellPrice - costPrice)})
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="prd-stock" className="block text-xs font-semibold mb-1">
                Stok Saat Ini (Bisa Desimal Kg) *
              </label>
              <input
                id="prd-stock"
                type="number"
                required
                min={0}
                step="any"
                value={stock}
                onChange={(e) => setStock(Math.max(0, Number(e.target.value) || 0))}
                className="w-full min-h-[42px] px-3 py-2 hig-input font-mono tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="prd-min" className="block text-xs font-semibold mb-1">
                Batas Minimum (Alert) *
              </label>
              <input
                id="prd-min"
                type="number"
                required
                min={0}
                step="any"
                value={minStock}
                onChange={(e) => setMinStock(Math.max(0, Number(e.target.value) || 0))}
                className="w-full min-h-[42px] px-3 py-2 hig-input font-mono tabular-nums"
              />
            </div>
          </div>
          <div>
            <label htmlFor="prd-desc" className="block text-xs font-semibold mb-1">
              Deskripsi
            </label>
            <textarea
              id="prd-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 hig-input"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="min-h-[44px] px-4 py-2 hig-btn-secondary text-xs font-semibold"
            >
              Batal
            </button>
            <button
              type="submit"
              className="min-h-[44px] px-4 py-2 hig-btn-cta text-xs font-semibold"
            >
              Simpan Produk
            </button>
          </div>
        </form>
      </Modal>

      {/* CSV Bulk Import Modal (3 macOS dots) */}
      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Master Produk Massal (CSV)"
        subtitle="Produk dengan SKU sama diperbarui otomatis; SKU baru ditambahkan"
        maxWidth="max-w-xl"
      >
        <div className="space-y-4 text-xs">
          <div className="hig-inset p-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-bold">Format Kolom CSV</p>
              <p style={{ color: 'var(--text-secondary)' }} className="font-mono text-[11px] mt-0.5">
                {PRODUCT_CSV_HEADERS.join(', ')}
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 hig-btn-secondary font-semibold shrink-0"
            >
              <FileSpreadsheet
                style={{ color: 'var(--accent-primary-text)' }}
                className="w-3.5 h-3.5"
                aria-hidden="true"
              />
              <span>Unduh Template</span>
            </button>
          </div>

          <input
            type="file"
            aria-label="Pilih file CSV produk"
            accept=".csv,text/csv"
            onChange={handleFilePick}
            className="block w-full text-xs file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#18181B] file:text-white file:font-semibold"
          />

          {csvPreview && (
            <div className="space-y-2">
              <div className="flex gap-3 font-bold">
                <span style={{ color: 'var(--status-positive)' }}>
                  Valid: {csvPreview.valid.length} baris
                </span>
                <span style={{ color: 'var(--status-danger)' }}>
                  Error: {csvPreview.errors.length} baris
                </span>
              </div>
              {csvPreview.errors.length > 0 && (
                <div
                  style={{
                    backgroundColor: 'var(--status-danger-soft)',
                    color: 'var(--status-danger)',
                  }}
                  className="p-2.5 rounded-lg max-h-28 overflow-y-auto space-y-1"
                >
                  {csvPreview.errors.map((err, i) => (
                    <p key={i}>{err}</p>
                  ))}
                </div>
              )}
              {csvPreview.valid.length > 0 && (
                <div
                  style={{ borderColor: 'var(--border-hairline)' }}
                  className="border rounded-lg max-h-40 overflow-y-auto"
                >
                  <table className="w-full text-left">
                    <thead className="hig-table-head">
                      <tr>
                        <th className="py-1.5 px-2">SKU</th>
                        <th className="py-1.5 px-2">Nama</th>
                        <th className="py-1.5 px-2 text-right">Jual</th>
                        <th className="py-1.5 px-2 text-right">Stok</th>
                      </tr>
                    </thead>
                    <tbody>
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
              className="min-h-[44px] px-4 py-2 hig-btn-secondary font-semibold"
            >
              Tutup
            </button>
            <button
              type="button"
              disabled={!csvPreview || csvPreview.valid.length === 0}
              onClick={handleConfirmImport}
              className="min-h-[44px] px-4 py-2 hig-btn-cta disabled:opacity-40 font-semibold"
            >
              Impor {csvPreview?.valid.length || 0} Produk
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import { Plus, Truck, Building2, Trash2, Pencil, Download, CreditCard } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { downloadCsv } from '../lib/csv';
import { formatDateTime, formatNumber, formatRupiah, toLocalDateISO } from '../lib/format';
import { PurchaseOrder, Supplier } from '../types/erp';
import { EmptyState, Modal } from '../components/ui/SharedUi';

interface PoDraftRow {
  productId: string;
  qty: number;
  unitCost: number;
}

export const PurchasesPage: React.FC = () => {
  const {
    db,
    can,
    upsertSupplier,
    deleteSupplier,
    createPurchaseOrder,
    payPurchaseOrder,
    showToast,
  } = useErp();

  const suppliers = db.suppliers || [];
  const orders = db.purchaseOrders || [];

  const [tab, setTab] = useState<'PO' | 'SUPPLIERS'>('PO');

  // Supplier modal
  const [supModalOpen, setSupModalOpen] = useState(false);
  const [editingSupId, setEditingSupId] = useState<string | undefined>(undefined);
  const [supName, setSupName] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supAddress, setSupAddress] = useState('');
  const [supNotes, setSupNotes] = useState('');

  // PO modal
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poMethod, setPoMethod] = useState<'CASH' | 'TRANSFER' | 'CREDIT'>('TRANSFER');
  const [poPaid, setPoPaid] = useState<string>('0');
  const [poNotes, setPoNotes] = useState('');
  const [poItems, setPoItems] = useState<PoDraftRow[]>([]);

  // Pay AP modal
  const [payModalPo, setPayModalPo] = useState<PurchaseOrder | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'CASH' | 'TRANSFER' | 'QRIS'>('TRANSFER');
  const [payNotes, setPayNotes] = useState('');

  const summary = useMemo(() => {
    let totalSpent = 0;
    let totalDebt = 0;
    let unpaidCount = 0;
    for (const po of orders) {
      if (po.status === 'VOIDED') continue;
      totalSpent += po.totalCost;
      const rem = Math.max(0, po.totalCost - po.paidAmount);
      totalDebt += rem;
      if (rem > 0) unpaidCount += 1;
    }
    return { totalSpent, totalDebt, unpaidCount };
  }, [orders]);

  const openAddSupplier = () => {
    setEditingSupId(undefined);
    setSupName('');
    setSupPhone('');
    setSupAddress('');
    setSupNotes('');
    setSupModalOpen(true);
  };

  const openEditSupplier = (s: Supplier) => {
    setEditingSupId(s.id);
    setSupName(s.name);
    setSupPhone(s.phone);
    setSupAddress(s.address);
    setSupNotes(s.notes || '');
    setSupModalOpen(true);
  };

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      upsertSupplier({
        id: editingSupId,
        name: supName,
        phone: supPhone,
        address: supAddress,
        notes: supNotes,
      });
      setSupModalOpen(false);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal menyimpan supplier.');
    }
  };

  const openNewPoModal = () => {
    const firstSup = suppliers[0]?.id || '';
    const firstProd = db.products[0];
    setPoSupplierId(firstSup);
    setPoMethod('TRANSFER');
    setPoPaid('0');
    setPoNotes('');
    setPoItems(
      firstProd
        ? [{ productId: firstProd.id, qty: 10, unitCost: firstProd.costPrice || 85000 }]
        : []
    );
    setPoModalOpen(true);
  };

  const poTotal = useMemo(
    () => poItems.reduce((sum, it) => sum + Math.round((it.qty || 0) * (it.unitCost || 0)), 0),
    [poItems]
  );

  const handleCreatePo = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      createPurchaseOrder({
        supplierId: poSupplierId,
        items: poItems,
        paymentMethod: poMethod,
        paidAmount: poMethod === 'CREDIT' ? Number(poPaid) || 0 : poTotal,
        notes: poNotes,
      });
      setPoModalOpen(false);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal menyimpan PO pembelian.');
    }
  };

  const handlePayDebt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModalPo) return;
    try {
      payPurchaseOrder({
        poId: payModalPo.id,
        amount: Number(payAmount) || 0,
        paymentMethod: payMethod,
        notes: payNotes,
      });
      setPayModalPo(null);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal mencatat pembayaran hutang.');
    }
  };

  const handleExportCsv = () => {
    downloadCsv(
      `pembelian-po-${toLocalDateISO()}.csv`,
      ['No PO', 'Tanggal', 'Supplier', 'Jumlah Item', 'Total Modal', 'Dibayar', 'Sisa Hutang', 'Status'],
      orders.map((po) => [
        po.poNumber,
        formatDateTime(po.createdAt),
        po.supplierName,
        po.items.length,
        po.totalCost,
        po.paidAmount,
        Math.max(0, po.totalCost - po.paidAmount),
        po.status,
      ])
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Pembelian (PO) &amp; Pemasok Supplier</h2>
          <p style={{ color: 'var(--text-secondary)' }} className="text-xs mt-0.5">
            Catat kulakan bahan baku, update stok &amp; HPP otomatis, serta pantau hutang supplier.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 hig-btn-secondary text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export CSV</span>
          </button>
          {can('purchases:manage') && (
            <>
              <button
                type="button"
                onClick={openAddSupplier}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 hig-btn-secondary text-xs font-semibold"
              >
                <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>+ Supplier</span>
              </button>
              <button
                type="button"
                onClick={openNewPoModal}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 hig-btn-cta text-xs font-semibold"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>Catat Pembelian (PO)</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="hig-card p-4">
          <p style={{ color: 'var(--text-secondary)' }} className="text-xs font-semibold">
            Total Pembelian Kumulatif
          </p>
          <p className="text-xl font-bold tabular-nums mt-1.5">{formatRupiah(summary.totalSpent)}</p>
        </div>
        <div className="hig-card p-4">
          <p style={{ color: 'var(--text-secondary)' }} className="text-xs font-semibold">
            Hutang Supplier Aktif (AP)
          </p>
          <p
            style={{
              color: summary.totalDebt > 0 ? 'var(--status-danger)' : 'var(--status-positive)',
            }}
            className="text-xl font-bold tabular-nums mt-1.5"
          >
            {formatRupiah(summary.totalDebt)}
          </p>
        </div>
        <div className="hig-card p-4">
          <p style={{ color: 'var(--text-secondary)' }} className="text-xs font-semibold">
            PO Belum Lunas
          </p>
          <p className="text-xl font-bold tabular-nums mt-1.5">{summary.unpaidCount} PO</p>
        </div>
        <div className="hig-card p-4">
          <p style={{ color: 'var(--text-secondary)' }} className="text-xs font-semibold">
            Pemasok Terdaftar
          </p>
          <p className="text-xl font-bold tabular-nums mt-1.5">{suppliers.length} Supplier</p>
        </div>
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Navigasi pembelian dan supplier"
        style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-hairline)' }}
        className="inline-flex gap-1 p-1 rounded-xl border"
      >
        {(
          [
            { id: 'PO', label: `Order Pembelian (${orders.length})` },
            { id: 'SUPPLIERS', label: `Data Pemasok (${suppliers.length})` },
          ] as const
        ).map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              style={
                active
                  ? { backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }
                  : { color: 'var(--text-secondary)' }
              }
              className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
                active ? 'shadow-xs' : ''
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="hig-card overflow-hidden">
        {tab === 'PO' ? (
          orders.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="Belum ada catatan pembelian (PO)"
              description="Tambahkan supplier lalu catat PO pembelian agar stok gudang dan HPP produk terupdate otomatis."
              actionLabel={can('purchases:manage') ? '+ Catat Pembelian' : undefined}
              onAction={can('purchases:manage') ? openNewPoModal : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="hig-table-head">
                  <tr>
                    <th className="py-3 px-4 font-semibold">No. PO</th>
                    <th className="py-3 px-4 font-semibold">Tanggal</th>
                    <th className="py-3 px-4 font-semibold">Supplier</th>
                    <th className="py-3 px-4 font-semibold">Rincian Item</th>
                    <th className="py-3 px-4 font-semibold text-right">Total Modal</th>
                    <th className="py-3 px-4 font-semibold text-right">Sisa Hutang</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((po) => {
                    const remaining = Math.max(0, po.totalCost - po.paidAmount);
                    const statusColor =
                      po.status === 'PAID'
                        ? 'var(--status-positive)'
                        : po.status === 'PARTIAL'
                        ? 'var(--status-warning)'
                        : 'var(--status-danger)';
                    const statusLabel =
                      po.status === 'PAID'
                        ? 'Lunas'
                        : po.status === 'PARTIAL'
                        ? 'Sebagian'
                        : 'Belum Bayar';
                    return (
                      <tr key={po.id} className="hig-row-hover">
                        <td className="py-3 px-4 font-mono font-bold whitespace-nowrap">
                          {po.poNumber}
                        </td>
                        <td
                          style={{ color: 'var(--text-secondary)' }}
                          className="py-3 px-4 whitespace-nowrap"
                        >
                          {formatDateTime(po.createdAt)}
                        </td>
                        <td className="py-3 px-4 font-semibold">{po.supplierName}</td>
                        <td style={{ color: 'var(--text-secondary)' }} className="py-3 px-4">
                          {po.items
                            .slice(0, 2)
                            .map((i) => `${i.productName} (${formatNumber(i.qty)} ${i.unit})`)
                            .join(', ')}
                          {po.items.length > 2 ? ` +${po.items.length - 2} lainnya` : ''}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">
                          {formatRupiah(po.totalCost)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">
                          {formatRupiah(remaining)}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            style={{ color: statusColor }}
                            className="inline-flex items-center gap-1.5 font-semibold"
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full bg-current shrink-0"
                              aria-hidden="true"
                            />
                            {statusLabel}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {can('purchases:manage') && remaining > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setPayModalPo(po);
                                setPayAmount(String(remaining));
                                setPayMethod('TRANSFER');
                                setPayNotes('');
                              }}
                              className="min-h-[32px] inline-flex items-center gap-1 px-2.5 py-1 hig-btn-secondary font-semibold"
                            >
                              <CreditCard className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Bayar</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : suppliers.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Belum ada data pemasok"
            description="Tambahkan pemasok tembakau atau bahan kemasan agar riwayat pembelian terekam rapi."
            actionLabel={can('purchases:manage') ? '+ Tambah Supplier' : undefined}
            onAction={can('purchases:manage') ? openAddSupplier : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="hig-table-head">
                <tr>
                  <th className="py-3 px-4 font-semibold">Kode</th>
                  <th className="py-3 px-4 font-semibold">Nama Pemasok</th>
                  <th className="py-3 px-4 font-semibold">Kontak / WA</th>
                  <th className="py-3 px-4 font-semibold">Alamat</th>
                  <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.id} className="hig-row-hover">
                    <td className="py-3 px-4 font-mono font-bold whitespace-nowrap">{s.code}</td>
                    <td className="py-3 px-4">
                      <p className="font-bold">{s.name}</p>
                      {s.notes && (
                        <p style={{ color: 'var(--text-secondary)' }} className="text-[11px]">
                          {s.notes}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono">{s.phone}</td>
                    <td style={{ color: 'var(--text-secondary)' }} className="py-3 px-4">
                      {s.address || '-'}
                    </td>
                    <td className="py-3 px-4 text-right space-x-1">
                      {can('purchases:manage') && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditSupplier(s)}
                            className="w-8 h-8 inline-flex items-center justify-center hig-btn-secondary"
                            aria-label={`Edit ${s.name}`}
                          >
                            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!window.confirm(`Hapus supplier "${s.name}"?`)) return;
                              try {
                                deleteSupplier(s.id);
                              } catch (err) {
                                showToast(
                                  'error',
                                  err instanceof Error ? err.message : 'Gagal menghapus supplier.'
                                );
                              }
                            }}
                            style={{
                              backgroundColor: 'var(--status-danger-soft)',
                              color: 'var(--status-danger)',
                            }}
                            className="w-8 h-8 inline-flex items-center justify-center rounded-lg"
                            aria-label={`Hapus ${s.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Supplier Modal */}
      <Modal
        open={supModalOpen}
        onClose={() => setSupModalOpen(false)}
        title={editingSupId ? 'Edit Pemasok (Supplier)' : 'Tambah Pemasok Baru'}
      >
        <form onSubmit={handleSaveSupplier} className="space-y-3.5 text-sm">
          <div>
            <label htmlFor="sup-name" className="block text-xs font-semibold mb-1">
              Nama Supplier / Pabrik *
            </label>
            <input
              id="sup-name"
              type="text"
              required
              value={supName}
              onChange={(e) => setSupName(e.target.value)}
              placeholder="Contoh: Gudang Tembakau Temanggung Jaya"
              className="w-full min-h-[42px] px-3 py-2 hig-input"
            />
          </div>
          <div>
            <label htmlFor="sup-phone" className="block text-xs font-semibold mb-1">
              No. Kontak / WhatsApp *
            </label>
            <input
              id="sup-phone"
              type="text"
              required
              value={supPhone}
              onChange={(e) => setSupPhone(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 hig-input"
            />
          </div>
          <div>
            <label htmlFor="sup-addr" className="block text-xs font-semibold mb-1">
              Alamat
            </label>
            <textarea
              id="sup-addr"
              rows={2}
              value={supAddress}
              onChange={(e) => setSupAddress(e.target.value)}
              className="w-full px-3 py-2 hig-input"
            />
          </div>
          <div>
            <label htmlFor="sup-notes" className="block text-xs font-semibold mb-1">
              Catatan (Opsional)
            </label>
            <input
              id="sup-notes"
              type="text"
              value={supNotes}
              onChange={(e) => setSupNotes(e.target.value)}
              placeholder="Misal: Pemasok daun Virginia & flavour"
              className="w-full min-h-[42px] px-3 py-2 hig-input"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setSupModalOpen(false)}
              className="min-h-[44px] px-4 py-2 hig-btn-secondary text-xs font-semibold"
            >
              Batal
            </button>
            <button
              type="submit"
              className="min-h-[44px] px-4 py-2 hig-btn-cta text-xs font-semibold"
            >
              Simpan Supplier
            </button>
          </div>
        </form>
      </Modal>

      {/* Create Purchase Order Modal */}
      <Modal
        open={poModalOpen}
        onClose={() => setPoModalOpen(false)}
        title="Catat Pembelian Barang (PO / Kulakan)"
        subtitle="Stok gudang dan HPP produk diperbarui otomatis saat PO disimpan"
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleCreatePo} className="space-y-4 text-sm">
          <div>
            <label htmlFor="po-sup" className="block text-xs font-semibold mb-1">
              Pemasok / Supplier *
            </label>
            {suppliers.length === 0 ? (
              <div
                style={{
                  backgroundColor: 'var(--status-danger-soft)',
                  color: 'var(--status-danger)',
                }}
                className="p-2.5 rounded-lg text-xs font-medium flex items-center justify-between gap-2"
              >
                <span>Belum ada data supplier. Tambah supplier terlebih dahulu.</span>
                <button
                  type="button"
                  onClick={() => {
                    setPoModalOpen(false);
                    openAddSupplier();
                  }}
                  className="underline font-bold shrink-0"
                >
                  + Tambah Supplier
                </button>
              </div>
            ) : (
              <select
                id="po-sup"
                value={poSupplierId}
                onChange={(e) => setPoSupplierId(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 hig-input"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">Daftar Barang Dibeli *</span>
              <button
                type="button"
                onClick={() => {
                  const first = db.products[0];
                  if (!first) return;
                  setPoItems((prev) => [
                    ...prev,
                    { productId: first.id, qty: 5, unitCost: first.costPrice || 85000 },
                  ]);
                }}
                style={{ color: 'var(--accent-primary-text)' }}
                className="text-xs font-semibold hover:underline"
              >
                + Tambah Baris Produk
              </button>
            </div>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {poItems.map((row, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center text-xs">
                  <select
                    aria-label={`Produk baris ${idx + 1}`}
                    value={row.productId}
                    onChange={(e) => {
                      const prod = db.products.find((p) => p.id === e.target.value);
                      setPoItems((prev) =>
                        prev.map((r, i) =>
                          i === idx
                            ? {
                                ...r,
                                productId: e.target.value,
                                unitCost: prod?.costPrice || r.unitCost,
                              }
                            : r
                        )
                      );
                    }}
                    className="col-span-5 min-h-[38px] px-2 py-1.5 hig-input"
                  >
                    {db.products.map((p) => (
                      <option key={p.id} value={p.id}>
                        [{p.sku}] {p.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    aria-label={`Qty baris ${idx + 1}`}
                    min={0.01}
                    step="any"
                    value={row.qty}
                    onChange={(e) =>
                      setPoItems((prev) =>
                        prev.map((r, i) =>
                          i === idx ? { ...r, qty: Number(e.target.value) || 0 } : r
                        )
                      )
                    }
                    placeholder="Qty Kg"
                    className="col-span-2 min-h-[38px] px-2 py-1.5 hig-input font-mono tabular-nums"
                  />
                  <input
                    type="number"
                    aria-label={`HPP baris ${idx + 1}`}
                    min={1}
                    value={row.unitCost}
                    onChange={(e) =>
                      setPoItems((prev) =>
                        prev.map((r, i) =>
                          i === idx ? { ...r, unitCost: Number(e.target.value) || 0 } : r
                        )
                      )
                    }
                    placeholder="Harga Beli"
                    className="col-span-4 min-h-[38px] px-2 py-1.5 hig-input font-mono tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => setPoItems((prev) => prev.filter((_, i) => i !== idx))}
                    aria-label="Hapus baris"
                    style={{ color: 'var(--status-danger)' }}
                    className="col-span-1 min-h-[36px] flex items-center justify-center rounded-lg hover:bg-[var(--status-danger-soft)]"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label htmlFor="po-method" className="block font-semibold mb-1">
                Metode Pembayaran
              </label>
              <select
                id="po-method"
                value={poMethod}
                onChange={(e) => setPoMethod(e.target.value as 'CASH' | 'TRANSFER' | 'CREDIT')}
                className="w-full min-h-[42px] px-3 py-2 hig-input"
              >
                <option value="TRANSFER">Transfer Bank (Lunas)</option>
                <option value="CASH">Tunai Kas (Lunas)</option>
                <option value="CREDIT">Tempo / Hutang Supplier</option>
              </select>
            </div>
            {poMethod === 'CREDIT' ? (
              <div>
                <label htmlFor="po-dp" className="block font-semibold mb-1">
                  DP Dibayar Sekarang (Rp)
                </label>
                <input
                  id="po-dp"
                  type="number"
                  min={0}
                  value={poPaid}
                  onChange={(e) => setPoPaid(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 hig-input font-mono tabular-nums"
                />
              </div>
            ) : (
              <div>
                <label htmlFor="po-notes" className="block font-semibold mb-1">
                  Catatan / No. Nota Supplier
                </label>
                <input
                  id="po-notes"
                  type="text"
                  value={poNotes}
                  onChange={(e) => setPoNotes(e.target.value)}
                  placeholder="Contoh: Nota kirim panen Nov"
                  className="w-full min-h-[42px] px-3 py-2 hig-input"
                />
              </div>
            )}
          </div>

          <div className="hig-inset p-3.5 flex items-center justify-between text-xs font-bold tabular-nums">
            <span>Total Nilai Pembelian (Modal):</span>
            <span className="text-base">{formatRupiah(poTotal)}</span>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setPoModalOpen(false)}
              className="min-h-[44px] px-4 py-2 hig-btn-secondary text-xs font-semibold"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={suppliers.length === 0 || poItems.length === 0}
              className="min-h-[44px] px-4 py-2 hig-btn-cta text-xs font-semibold disabled:opacity-50"
            >
              Simpan PO &amp; Tambah Stok
            </button>
          </div>
        </form>
      </Modal>

      {/* Pay AP Modal */}
      <Modal
        open={Boolean(payModalPo)}
        onClose={() => setPayModalPo(null)}
        title="Bayar Hutang Supplier"
        subtitle={payModalPo ? `${payModalPo.poNumber} · ${payModalPo.supplierName}` : undefined}
      >
        {payModalPo && (
          <form onSubmit={handlePayDebt} className="space-y-3.5 text-sm">
            <div className="hig-inset p-3 flex justify-between text-xs tabular-nums">
              <span>Sisa Hutang:</span>
              <span className="font-bold">
                {formatRupiah(Math.max(0, payModalPo.totalCost - payModalPo.paidAmount))}
              </span>
            </div>
            <div>
              <label htmlFor="ap-amt" className="block text-xs font-semibold mb-1">
                Nominal Bayar (Rp) *
              </label>
              <input
                id="ap-amt"
                type="number"
                min={1}
                required
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 hig-input font-mono tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="ap-method" className="block text-xs font-semibold mb-1">
                Metode Bayar
              </label>
              <select
                id="ap-method"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value as 'CASH' | 'TRANSFER' | 'QRIS')}
                className="w-full min-h-[42px] px-3 py-2 hig-input"
              >
                <option value="TRANSFER">Transfer Bank</option>
                <option value="CASH">Kas Tunai</option>
                <option value="QRIS">QRIS</option>
              </select>
            </div>
            <div>
              <label htmlFor="ap-notes" className="block text-xs font-semibold mb-1">
                Catatan (Opsional)
              </label>
              <input
                id="ap-notes"
                type="text"
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 hig-input"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPayModalPo(null)}
                className="min-h-[44px] px-4 py-2 hig-btn-secondary text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="submit"
                className="min-h-[44px] px-4 py-2 hig-btn-cta text-xs font-semibold"
              >
                Simpan Pembayaran
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

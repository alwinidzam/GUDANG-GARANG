import React, { useMemo, useState } from 'react';
import { Plus, Search, Pencil, Trash2, Eye, Phone, MapPin, Users, Download } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { getPlanMetrics } from '../lib/calculations';
import { downloadCsv } from '../lib/csv';
import { formatDateTime, formatRupiah, toLocalDateISO } from '../lib/format';
import { Customer, CustomerType } from '../types/erp';
import { CustomerTypeBadge, EmptyState, Modal, TxStatusBadge } from '../components/ui/SharedUi';

export const CustomersPage: React.FC = () => {
  const { db, can, upsertCustomer, deleteCustomer, showToast } = useErp();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | CustomerType>('ALL');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [type, setType] = useState<CustomerType>('RETAIL');
  const [creditLimit, setCreditLimit] = useState<string>('');
  const [notes, setNotes] = useState('');

  const [detailCustomerId, setDetailCustomerId] = useState<string | null>(null);
  const today = toLocalDateISO();

  const detailCustomer = useMemo(
    () => (detailCustomerId ? db.customers.find((c) => c.id === detailCustomerId) || null : null),
    [db.customers, detailCustomerId]
  );

  const customerStats = useMemo(() => {
    const map = new Map<string, { totalSpend: number; txCount: number; activeDebt: number }>();
    for (const c of db.customers) {
      map.set(c.id, { totalSpend: 0, txCount: 0, activeDebt: 0 });
    }
    for (const tx of db.transactions) {
      if (tx.status !== 'COMPLETED' || !tx.customerId) continue;
      const entry = map.get(tx.customerId);
      if (entry) {
        entry.totalSpend += tx.total;
        entry.txCount += 1;
      }
    }
    for (const pl of db.paymentPlans) {
      if (pl.status !== 'ACTIVE') continue;
      const entry = map.get(pl.customerId);
      if (entry) {
        entry.activeDebt += getPlanMetrics(pl, today).remainingBalance;
      }
    }
    return map;
  }, [db.customers, db.transactions, db.paymentPlans, today]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.customers.filter((c) => {
      if (typeFilter !== 'ALL' && c.type !== typeFilter) return false;
      if (
        q &&
        !c.name.toLowerCase().includes(q) &&
        !c.code.toLowerCase().includes(q) &&
        !c.phone.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [db.customers, search, typeFilter]);

  const openAdd = () => {
    setEditingId(undefined);
    setName('');
    setPhone('');
    setAddress('');
    setType('RETAIL');
    setCreditLimit('');
    setNotes('');
    setFormOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditingId(c.id);
    setName(c.name);
    setPhone(c.phone);
    setAddress(c.address);
    setType(c.type);
    setCreditLimit(c.creditLimit ? String(c.creditLimit) : '');
    setNotes(c.notes || '');
    setFormOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      upsertCustomer({
        id: editingId,
        name,
        phone,
        address,
        type,
        creditLimit: Number(creditLimit) || undefined,
        notes,
      });
      setFormOpen(false);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal menyimpan pelanggan.');
    }
  };

  const handleExportCsv = () => {
    downloadCsv(
      `pelanggan-indobacco-${today}.csv`,
      ['Kode', 'Nama', 'Tipe', 'Kontak WA', 'Alamat', 'Plafon Kredit', 'Belanja Kumulatif', 'Piutang Aktif'],
      filtered.map((c) => {
        const st = customerStats.get(c.id) || { totalSpend: 0, txCount: 0, activeDebt: 0 };
        return [c.code, c.name, c.type, c.phone, c.address, c.creditLimit || 0, st.totalSpend, st.activeDebt];
      })
    );
  };

  const handleDelete = (c: Customer) => {
    if (!window.confirm(`Hapus pelanggan "${c.name}" (${c.code})?`)) return;
    try {
      deleteCustomer(c.id);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal menghapus pelanggan.');
    }
  };

  const detailTxs = useMemo(() => {
    if (!detailCustomer) return [];
    return db.transactions.filter((t) => t.customerId === detailCustomer.id);
  }, [db.transactions, detailCustomer]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Database Mitra &amp; Pelanggan</h2>
          <p style={{ color: 'var(--text-secondary)' }} className="text-xs mt-0.5">
            Profil pelanggan Retail, Grosir, dan Distributor beserta akumulasi omset dan piutang
            berjalan.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 hig-btn-secondary text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export CSV</span>
          </button>
          {(can('customers:write') || can('pos:quick_customer')) && (
            <button
              type="button"
              onClick={openAdd}
              className="min-h-[44px] inline-flex items-center gap-1.5 px-4 py-2 hig-btn-cta text-xs font-semibold"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Tambah Pelanggan</span>
            </button>
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
            aria-label="Cari kode, nama, atau nomor WhatsApp pelanggan"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kode, nama pelanggan, atau no. WhatsApp..."
            className="w-full min-h-[38px] pl-9 pr-3 py-1.5 hig-input text-xs"
          />
        </div>
        <select
          aria-label="Filter tipe pelanggan"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as 'ALL' | CustomerType)}
          className="min-h-[38px] px-3 py-1.5 hig-input text-xs font-semibold"
        >
          <option value="ALL">Semua Tipe</option>
          <option value="RETAIL">Retail</option>
          <option value="GROSIR">Grosir</option>
          <option value="DISTRIBUTOR">Distributor</option>
        </select>
      </div>

      {/* Table */}
      <div className="hig-card overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Pelanggan tidak ditemukan"
            description="Tidak ada data pelanggan yang cocok dengan kata kunci atau tipe yang dipilih."
            actionLabel="Reset Filter"
            onAction={() => {
              setSearch('');
              setTypeFilter('ALL');
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="hig-table-head">
                <tr>
                  <th className="py-3 px-4 font-semibold">Kode</th>
                  <th className="py-3 px-4 font-semibold">Nama &amp; Alamat</th>
                  <th className="py-3 px-4 font-semibold">Tipe</th>
                  <th className="py-3 px-4 font-semibold">Kontak / WA</th>
                  <th className="py-3 px-4 font-semibold text-right">Belanja Kumulatif</th>
                  <th className="py-3 px-4 font-semibold text-right">Piutang Berjalan</th>
                  <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const st = customerStats.get(c.id) || {
                    totalSpend: 0,
                    txCount: 0,
                    activeDebt: 0,
                  };
                  return (
                    <tr key={c.id} className="hig-row-hover">
                      <td className="py-3 px-4 font-mono font-bold">{c.code}</td>
                      <td className="py-3 px-4">
                        <p className="font-bold">{c.name}</p>
                        <p
                          style={{ color: 'var(--text-secondary)' }}
                          className="text-[11px] truncate max-w-xs"
                        >
                          {c.address}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <CustomerTypeBadge type={c.type} />
                      </td>
                      <td className="py-3 px-4 font-mono">{c.phone}</td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        <p className="font-bold">{formatRupiah(st.totalSpend)}</p>
                        <p style={{ color: 'var(--text-secondary)' }} className="text-[11px]">
                          {st.txCount} transaksi
                        </p>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">
                        <span
                          style={{
                            color:
                              st.activeDebt > 0
                                ? 'var(--status-danger)'
                                : 'var(--status-positive)',
                          }}
                        >
                          {formatRupiah(st.activeDebt)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-1">
                        <button
                          type="button"
                          onClick={() => setDetailCustomerId(c.id)}
                          className="w-8 h-8 inline-flex items-center justify-center hig-btn-secondary"
                          aria-label={`Lihat riwayat ${c.name}`}
                          title="Riwayat belanja"
                        >
                          <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        {can('customers:write') && (
                          <button
                            type="button"
                            onClick={() => openEdit(c)}
                            className="w-8 h-8 inline-flex items-center justify-center hig-btn-secondary"
                            aria-label={`Edit ${c.name}`}
                            title="Edit pelanggan"
                          >
                            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        )}
                        {can('customers:delete') && (
                          <button
                            type="button"
                            onClick={() => handleDelete(c)}
                            style={{
                              backgroundColor: 'var(--status-danger-soft)',
                              color: 'var(--status-danger)',
                            }}
                            className="w-8 h-8 inline-flex items-center justify-center rounded-lg"
                            aria-label={`Hapus ${c.name}`}
                            title="Hapus pelanggan"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </td>
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
        title={editingId ? 'Edit Pelanggan' : 'Tambah Pelanggan Baru'}
      >
        <form onSubmit={handleSave} className="space-y-3.5 text-sm">
          <div>
            <label htmlFor="cst-name" className="block text-xs font-semibold mb-1">
              Nama Pelanggan *
            </label>
            <input
              id="cst-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 hig-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cst-phone" className="block text-xs font-semibold mb-1">
                No. Kontak / WA *
              </label>
              <input
                id="cst-phone"
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 hig-input"
              />
            </div>
            <div>
              <label htmlFor="cst-type" className="block text-xs font-semibold mb-1">
                Tipe *
              </label>
              <select
                id="cst-type"
                value={type}
                onChange={(e) => setType(e.target.value as CustomerType)}
                className="w-full min-h-[42px] px-3 py-2 hig-input"
              >
                <option value="RETAIL">Retail</option>
                <option value="GROSIR">Grosir</option>
                <option value="DISTRIBUTOR">Distributor</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="cst-addr" className="block text-xs font-semibold mb-1">
              Alamat
            </label>
            <textarea
              id="cst-addr"
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 hig-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cst-limit" className="block text-xs font-semibold mb-1">
                Plafon Kredit (Rp, Opsional)
              </label>
              <input
                id="cst-limit"
                type="number"
                min={0}
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                placeholder="Tanpa batas"
                className="w-full min-h-[42px] px-3 py-2 hig-input font-mono tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="cst-notes" className="block text-xs font-semibold mb-1">
                Catatan Preferensi
              </label>
              <input
                id="cst-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Misal: Ekspedisi langganan"
                className="w-full min-h-[42px] px-3 py-2 hig-input"
              />
            </div>
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
              Simpan
            </button>
          </div>
        </form>
      </Modal>

      {/* Customer Detail Modal (3 macOS dots) */}
      <Modal
        open={Boolean(detailCustomer)}
        onClose={() => setDetailCustomerId(null)}
        title={detailCustomer ? `${detailCustomer.name} (${detailCustomer.code})` : ''}
        maxWidth="max-w-xl"
      >
        {detailCustomer && (
          <div className="space-y-4 text-xs">
            <div className="hig-inset p-3.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <CustomerTypeBadge type={detailCustomer.type} />
                <span
                  style={{ color: 'var(--accent-primary-text)' }}
                  className="font-mono font-bold"
                >
                  Piutang Aktif:{' '}
                  {formatRupiah(customerStats.get(detailCustomer.id)?.activeDebt || 0)}
                </span>
              </div>
              <p style={{ color: 'var(--text-secondary)' }} className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" aria-hidden="true" /> {detailCustomer.phone}
              </p>
              <p style={{ color: 'var(--text-secondary)' }} className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" aria-hidden="true" />{' '}
                {detailCustomer.address || '-'}
              </p>
            </div>

            <div>
              <h4 className="font-bold mb-2">Riwayat Transaksi ({detailTxs.length})</h4>
              {detailTxs.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)' }} className="py-4 text-center">
                  Belum ada transaksi.
                </p>
              ) : (
                <div
                  style={{ borderColor: 'var(--border-hairline)' }}
                  className="border rounded-xl p-1.5 space-y-1 max-h-60 overflow-y-auto"
                >
                  {detailTxs.map((tx) => (
                    <div key={tx.id} className="p-2.5 flex items-center justify-between">
                      <div>
                        <p className="font-mono font-bold">{tx.invoiceNumber}</p>
                        <p style={{ color: 'var(--text-secondary)' }} className="text-[11px]">
                          {formatDateTime(tx.createdAt)} · {tx.items.length} item
                        </p>
                      </div>
                      <div className="text-right space-y-0.5">
                        <p className="font-bold tabular-nums">{formatRupiah(tx.total)}</p>
                        <TxStatusBadge status={tx.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

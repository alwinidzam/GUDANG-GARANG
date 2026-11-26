import React, { useMemo, useState } from 'react';
import { Plus, Search, Pencil, Trash2, Eye, Phone, MapPin } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { getPlanMetrics } from '../lib/calculations';
import { formatDateTime, formatRupiah, toLocalDateISO } from '../lib/format';
import { Customer, CustomerType } from '../types/erp';
import { CustomerTypeBadge, Modal, TxStatusBadge } from '../components/ui/SharedUi';

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

  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);
  const today = toLocalDateISO();

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
    setFormOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditingId(c.id);
    setName(c.name);
    setPhone(c.phone);
    setAddress(c.address);
    setType(c.type);
    setFormOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      upsertCustomer({ id: editingId, name, phone, address, type });
      setFormOpen(false);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal menyimpan pelanggan.');
    }
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
          <h2 className="text-lg font-extrabold text-[#1A1614]">Database Mitra &amp; Pelanggan</h2>
          <p className="text-xs text-[#6B6257]">
            Profil pelanggan Retail, Grosir, dan Distributor beserta akumulasi omset &amp; saldo
            piutang berjalan.
          </p>
        </div>
        {(can('customers:write') || can('pos:quick_customer')) && (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-bold cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Tambah Pelanggan
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#E6E0D6] rounded-xl p-3.5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[#8A7F73] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kode, nama pelanggan, atau no. WhatsApp..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-[#D8D0C5] text-xs"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as 'ALL' | CustomerType)}
          className="px-3 py-1.5 rounded-lg border border-[#D8D0C5] text-xs bg-white font-semibold"
        >
          <option value="ALL">Semua Tipe</option>
          <option value="RETAIL">Retail</option>
          <option value="GROSIR">Grosir</option>
          <option value="DISTRIBUTOR">Distributor</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#E6E0D6] rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#F8F6F2] border-b border-[#E6E0D6] text-[#5C5349] uppercase">
              <tr>
                <th className="py-3 px-4 font-bold">Kode</th>
                <th className="py-3 px-4 font-bold">Nama &amp; Alamat</th>
                <th className="py-3 px-4 font-bold">Tipe</th>
                <th className="py-3 px-4 font-bold">Kontak / WA</th>
                <th className="py-3 px-4 font-bold text-right">Belanja Kumulatif</th>
                <th className="py-3 px-4 font-bold text-right">Piutang Berjalan</th>
                <th className="py-3 px-4 font-bold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EDE7DD]">
              {filtered.map((c) => {
                const st = customerStats.get(c.id) || {
                  totalSpend: 0,
                  txCount: 0,
                  activeDebt: 0,
                };
                return (
                  <tr key={c.id} className="hover:bg-[#FAF8F4]">
                    <td className="py-3 px-4 font-mono font-bold text-[#1A1614]">{c.code}</td>
                    <td className="py-3 px-4">
                      <p className="font-bold text-[#1A1614]">{c.name}</p>
                      <p className="text-[11px] text-[#7C7165] truncate max-w-xs">{c.address}</p>
                    </td>
                    <td className="py-3 px-4">
                      <CustomerTypeBadge type={c.type} />
                    </td>
                    <td className="py-3 px-4 font-mono">{c.phone}</td>
                    <td className="py-3 px-4 text-right tabular-nums">
                      <p className="font-bold">{formatRupiah(st.totalSpend)}</p>
                      <p className="text-[11px] text-[#7C7165]">{st.txCount} transaksi</p>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">
                      <span className={st.activeDebt > 0 ? 'text-rose-700' : 'text-emerald-700'}>
                        {formatRupiah(st.activeDebt)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap space-x-1">
                      <button
                        type="button"
                        onClick={() => setDetailCustomer(c)}
                        className="p-1.5 rounded border border-[#D8D0C5] hover:bg-[#F1EDE5] cursor-pointer"
                        title="Riwayat belanja"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      {can('customers:write') && (
                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          className="p-1.5 rounded border border-[#D8D0C5] hover:bg-[#F1EDE5] cursor-pointer"
                          title="Edit pelanggan"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {can('customers:delete') && (
                        <button
                          type="button"
                          onClick={() => handleDelete(c)}
                          className="p-1.5 rounded border border-rose-200 text-rose-700 hover:bg-rose-50 cursor-pointer"
                          title="Hapus pelanggan"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
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
        title={editingId ? 'Edit Pelanggan' : 'Tambah Pelanggan Baru'}
      >
        <form onSubmit={handleSave} className="space-y-3.5 text-sm">
          <div>
            <label className="block text-xs font-bold text-[#5C5349] mb-1">Nama Pelanggan *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#5C5349] mb-1">
                No. Kontak / WA *
              </label>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5C5349] mb-1">Tipe *</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as CustomerType)}
                className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5] bg-white"
              >
                <option value="RETAIL">Retail</option>
                <option value="GROSIR">Grosir</option>
                <option value="DISTRIBUTOR">Distributor</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#5C5349] mb-1">Alamat</label>
            <textarea
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
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
              Simpan
            </button>
          </div>
        </form>
      </Modal>

      {/* Customer Detail Modal */}
      <Modal
        open={Boolean(detailCustomer)}
        onClose={() => setDetailCustomer(null)}
        title={detailCustomer ? `${detailCustomer.name} (${detailCustomer.code})` : ''}
        maxWidth="max-w-xl"
      >
        {detailCustomer && (
          <div className="space-y-4 text-xs">
            <div className="bg-[#F8F6F2] border border-[#E6E0D6] rounded-lg p-3.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <CustomerTypeBadge type={detailCustomer.type} />
                <span className="font-mono font-bold text-[#B91C1C]">
                  Piutang Aktif:{' '}
                  {formatRupiah(customerStats.get(detailCustomer.id)?.activeDebt || 0)}
                </span>
              </div>
              <p className="flex items-center gap-1.5 text-[#4A423A]">
                <Phone className="w-3.5 h-3.5" /> {detailCustomer.phone}
              </p>
              <p className="flex items-center gap-1.5 text-[#4A423A]">
                <MapPin className="w-3.5 h-3.5" /> {detailCustomer.address || '-'}
              </p>
            </div>

            <div>
              <h4 className="font-extrabold text-[#1A1614] mb-2">
                Riwayat Transaksi ({detailTxs.length})
              </h4>
              {detailTxs.length === 0 ? (
                <p className="text-[#6B6257] py-4 text-center">Belum ada transaksi.</p>
              ) : (
                <div className="border border-[#E6E0D6] rounded-lg divide-y divide-[#EDE7DD] max-h-60 overflow-y-auto">
                  {detailTxs.map((tx) => (
                    <div key={tx.id} className="p-2.5 flex items-center justify-between">
                      <div>
                        <p className="font-mono font-bold">{tx.invoiceNumber}</p>
                        <p className="text-[11px] text-[#6B6257]">
                          {formatDateTime(tx.createdAt)} • {tx.items.length} item
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

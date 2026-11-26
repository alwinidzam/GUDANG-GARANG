import React, { useMemo, useState } from 'react';
import { Plus, Wallet, Trash2, Download } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { downloadCsv } from '../lib/csv';
import { addDaysISO, formatDate, formatRupiah, toLocalDateISO } from '../lib/format';
import { ExpenseCategory } from '../types/erp';
import { EmptyState, Modal } from '../components/ui/SharedUi';

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  GAJI: 'Gaji & Upah Karyawan',
  LISTRIK_AIR: 'Listrik, Air & Internet',
  KEMASAN: 'Plastik, Pouch & Kemasan',
  ONGKIR_EKSPEDISI: 'Ongkir & Ekspedisi',
  SEWA: 'Sewa Gudang / Toko',
  BAHAN_PENOLONG: 'Bahan Penolong / Saos',
  LAINNYA: 'Biaya Lainnya',
};

const METHOD_LABELS: Record<'CASH' | 'TRANSFER' | 'QRIS', string> = {
  CASH: 'Kas Tunai',
  TRANSFER: 'Transfer Bank',
  QRIS: 'QRIS',
};

export const ExpensesPage: React.FC = () => {
  const { db, can, createExpense, deleteExpense, showToast } = useErp();
  const today = toLocalDateISO();
  const expenses = db.expenses || [];

  const [catFilter, setCatFilter] = useState<'ALL' | ExpenseCategory>('ALL');
  const [modalOpen, setModalOpen] = useState(false);

  const [date, setDate] = useState(today);
  const [category, setCategory] = useState<ExpenseCategory>('KEMASAN');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'TRANSFER' | 'QRIS'>('CASH');
  const [notes, setNotes] = useState('');

  // Real-time cashflow balance per wallet across sales, receivables, PO payments, and expenses
  const cashflow = useMemo(() => {
    const wallets = { CASH: 0, TRANSFER: 0, QRIS: 0 };

    for (const tx of db.transactions) {
      if (tx.status !== 'COMPLETED') continue;
      if (tx.paymentMethod === 'CASH') wallets.CASH += tx.total;
      else if (tx.paymentMethod === 'TRANSFER') wallets.TRANSFER += tx.total;
      else if (tx.paymentMethod === 'QRIS') wallets.QRIS += tx.total;
      else if (tx.paymentMethod === 'CREDIT' && tx.amountPaid > 0) {
        wallets[tx.dpPaymentMethod || 'TRANSFER'] += tx.amountPaid;
      }
    }

    for (const pl of db.paymentPlans) {
      if (pl.status === 'VOIDED') continue;
      if (!pl.transactionId && pl.downPayment > 0) {
        wallets[pl.dpPaymentMethod || 'TRANSFER'] += pl.downPayment;
      }
      for (const p of pl.payments) {
        wallets[p.paymentMethod] += p.amount;
      }
    }

    for (const po of db.purchaseOrders || []) {
      if (po.status === 'VOIDED') continue;
      for (const p of po.payments) {
        wallets[p.paymentMethod] -= p.amount;
      }
    }

    const cutoff30 = addDaysISO(today, -29);
    let expense30 = 0;
    for (const e of expenses) {
      wallets[e.paymentMethod] -= e.amount;
      if (e.date >= cutoff30) expense30 += e.amount;
    }

    return { ...wallets, expense30 };
  }, [db.transactions, db.paymentPlans, db.purchaseOrders, expenses, today]);

  const filtered = useMemo(
    () => expenses.filter((e) => catFilter === 'ALL' || e.category === catFilter),
    [expenses, catFilter]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      createExpense({
        date,
        category,
        description,
        amount: Number(amount) || 0,
        paymentMethod,
        notes,
      });
      setModalOpen(false);
      setDescription('');
      setAmount('');
      setNotes('');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal mencatat pengeluaran.');
    }
  };

  const handleExport = () => {
    downloadCsv(
      `kas-pengeluaran-${today}.csv`,
      ['Tanggal', 'Kategori', 'Deskripsi', 'Metode', 'Nominal', 'PIC', 'Catatan'],
      filtered.map((e) => [
        e.date,
        CATEGORY_LABELS[e.category],
        e.description,
        METHOD_LABELS[e.paymentMethod],
        e.amount,
        e.picName,
        e.notes || '',
      ])
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Kas, Arus Uang &amp; Pengeluaran Operasional</h2>
          <p style={{ color: 'var(--text-secondary)' }} className="text-xs mt-0.5">
            Pantau saldo kas riil per metode bayar dan catat biaya operasional untuk Laba Bersih.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 hig-btn-secondary text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export CSV</span>
          </button>
          {can('expenses:manage') && (
            <button
              type="button"
              onClick={() => {
                setDate(today);
                setModalOpen(true);
              }}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 hig-btn-cta text-xs font-semibold"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Catat Pengeluaran</span>
            </button>
          )}
        </div>
      </div>

      {/* Wallet Cashflow Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="hig-card p-4">
          <p style={{ color: 'var(--text-secondary)' }} className="text-xs font-semibold">
            Arus Kas Tunai (Laci)
          </p>
          <p className="text-xl font-bold tabular-nums mt-1.5">{formatRupiah(cashflow.CASH)}</p>
        </div>
        <div className="hig-card p-4">
          <p style={{ color: 'var(--text-secondary)' }} className="text-xs font-semibold">
            Arus Rekening Bank
          </p>
          <p className="text-xl font-bold tabular-nums mt-1.5">{formatRupiah(cashflow.TRANSFER)}</p>
        </div>
        <div className="hig-card p-4">
          <p style={{ color: 'var(--text-secondary)' }} className="text-xs font-semibold">
            Arus Saldo QRIS
          </p>
          <p className="text-xl font-bold tabular-nums mt-1.5">{formatRupiah(cashflow.QRIS)}</p>
        </div>
        <div className="hig-card p-4">
          <p style={{ color: 'var(--text-secondary)' }} className="text-xs font-semibold">
            Total Pengeluaran (30 Hari)
          </p>
          <p
            style={{ color: 'var(--status-danger)' }}
            className="text-xl font-bold tabular-nums mt-1.5"
          >
            {formatRupiah(cashflow.expense30)}
          </p>
        </div>
      </div>

      {/* Expense List */}
      <div className="hig-card overflow-hidden">
        <div
          style={{ borderColor: 'var(--border-hairline)' }}
          className="p-4 border-b flex flex-wrap items-center justify-between gap-3"
        >
          <h3 className="text-sm font-bold">Catatan Pengeluaran ({filtered.length})</h3>
          <select
            aria-label="Filter kategori pengeluaran"
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value as 'ALL' | ExpenseCategory)}
            className="min-h-[38px] px-3 py-1.5 hig-input text-xs font-semibold"
          >
            <option value="ALL">Semua Kategori</option>
            {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map((k) => (
              <option key={k} value={k}>
                {CATEGORY_LABELS[k]}
              </option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Belum ada catatan pengeluaran"
            description="Catat biaya operasional seperti plastik kemasan, listrik, ongkir, atau gaji untuk laporan Laba Bersih."
            actionLabel={can('expenses:manage') ? '+ Catat Pengeluaran' : undefined}
            onAction={can('expenses:manage') ? () => setModalOpen(true) : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="hig-table-head">
                <tr>
                  <th className="py-3 px-4 font-semibold">Tanggal</th>
                  <th className="py-3 px-4 font-semibold">Kategori</th>
                  <th className="py-3 px-4 font-semibold">Keterangan</th>
                  <th className="py-3 px-4 font-semibold">Sumber Dana</th>
                  <th className="py-3 px-4 font-semibold">PIC</th>
                  <th className="py-3 px-4 font-semibold text-right">Nominal</th>
                  {can('expenses:manage') && (
                    <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} className="hig-row-hover">
                    <td className="py-3 px-4 whitespace-nowrap">{formatDate(item.date)}</td>
                    <td className="py-3 px-4 font-semibold">{CATEGORY_LABELS[item.category]}</td>
                    <td className="py-3 px-4">
                      <p className="font-semibold">{item.description}</p>
                      {item.notes && (
                        <p style={{ color: 'var(--text-secondary)' }} className="text-[11px]">
                          {item.notes}
                        </p>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }} className="py-3 px-4">
                      {METHOD_LABELS[item.paymentMethod]}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }} className="py-3 px-4">
                      {item.picName}
                    </td>
                    <td
                      style={{ color: 'var(--status-danger)' }}
                      className="py-3 px-4 text-right font-mono font-bold tabular-nums"
                    >
                      -{formatRupiah(item.amount)}
                    </td>
                    {can('expenses:manage') && (
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            if (!window.confirm(`Hapus catatan "${item.description}"?`)) return;
                            deleteExpense(item.id);
                          }}
                          style={{
                            backgroundColor: 'var(--status-danger-soft)',
                            color: 'var(--status-danger)',
                          }}
                          className="w-8 h-8 inline-flex items-center justify-center rounded-lg"
                          aria-label={`Hapus ${item.description}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Expense Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Catat Pengeluaran Operasional"
        subtitle="Otomatis mengurangi arus kas dan dihitung pada Laba Bersih bulanan"
      >
        <form onSubmit={handleSubmit} className="space-y-3.5 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="exp-date" className="block text-xs font-semibold mb-1">
                Tanggal *
              </label>
              <input
                id="exp-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 hig-input"
              />
            </div>
            <div>
              <label htmlFor="exp-cat" className="block text-xs font-semibold mb-1">
                Kategori *
              </label>
              <select
                id="exp-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                className="w-full min-h-[42px] px-3 py-2 hig-input"
              >
                {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map((k) => (
                  <option key={k} value={k}>
                    {CATEGORY_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="exp-desc" className="block text-xs font-semibold mb-1">
              Keterangan Pengeluaran *
            </label>
            <input
              id="exp-desc"
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Contoh: Beli 500 plastik pouch & lakban"
              className="w-full min-h-[42px] px-3 py-2 hig-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="exp-amt" className="block text-xs font-semibold mb-1">
                Nominal (Rp) *
              </label>
              <input
                id="exp-amt"
                type="number"
                min={1}
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 hig-input font-mono font-bold tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="exp-method" className="block text-xs font-semibold mb-1">
                Sumber Dana
              </label>
              <select
                id="exp-method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as 'CASH' | 'TRANSFER' | 'QRIS')}
                className="w-full min-h-[42px] px-3 py-2 hig-input"
              >
                <option value="CASH">Kas Tunai (Laci)</option>
                <option value="TRANSFER">Transfer Bank</option>
                <option value="QRIS">QRIS</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="exp-notes" className="block text-xs font-semibold mb-1">
              Catatan (Opsional)
            </label>
            <input
              id="exp-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 hig-input"
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
              Simpan Pengeluaran
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

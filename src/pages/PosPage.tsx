import React, { useMemo, useState } from 'react';
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  UserPlus,
  CheckCircle2,
  Printer,
  FileText,
  Truck,
  Calculator,
  AlertCircle,
} from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { buildInstallmentSchedule } from '../lib/calculations';
import { formatDate, formatRupiah, toLocalDateISO } from '../lib/format';
import {
  CustomerType,
  InstallmentFrequency,
  PaymentMethod,
  PaymentPlan,
  Product,
  Transaction,
} from '../types/erp';
import { Modal } from '../components/ui/SharedUi';

interface CartRow {
  productId: string;
  qty: number;
}

export const PosPage: React.FC = () => {
  const { db, createSale, upsertCustomer, openPrint, showToast } = useErp();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('SEMUA');
  const [cart, setCart] = useState<CartRow[]>([]);
  const [customerId, setCustomerId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [cashInput, setCashInput] = useState<string>('');
  const [notes, setNotes] = useState('');

  // Credit calculator state
  const [dpInput, setDpInput] = useState<string>('0');
  const [tenorCount, setTenorCount] = useState<number>(3);
  const [frequency, setFrequency] = useState<InstallmentFrequency>('WEEKLY');
  const [interestRate, setInterestRate] = useState<number>(2);

  // Quick customer modal
  const [custModalOpen, setCustModalOpen] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');
  const [newCustType, setNewCustType] = useState<CustomerType>('RETAIL');

  // Completed transaction modal
  const [completedResult, setCompletedResult] = useState<{
    transaction: Transaction;
    paymentPlan?: PaymentPlan;
  } | null>(null);

  const categories = useMemo(() => {
    const set = new Set(db.products.map((p) => p.category));
    return ['SEMUA', ...Array.from(set)];
  }, [db.products]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.products.filter((p) => {
      const catOk = selectedCategory === 'SEMUA' || p.category === selectedCategory;
      const qOk =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q);
      return catOk && qOk;
    });
  }, [db.products, search, selectedCategory]);

  const productMap = useMemo(
    () => new Map(db.products.map((p) => [p.id, p])),
    [db.products]
  );

  const cartDetailed = useMemo(() => {
    return cart
      .map((row) => {
        const product = productMap.get(row.productId);
        if (!product) return null;
        return { product, qty: row.qty, subtotal: product.sellPrice * row.qty };
      })
      .filter((x): x is { product: Product; qty: number; subtotal: number } => x !== null);
  }, [cart, productMap]);

  const subtotal = useMemo(
    () => cartDetailed.reduce((acc, row) => acc + row.subtotal, 0),
    [cartDetailed]
  );
  const taxAmount = Math.round(subtotal * (db.settings.taxRate / 100));
  const grandTotal = subtotal + taxAmount;

  const cashReceived = Number(cashInput) || 0;
  const cashChange = cashReceived - grandTotal;

  const creditPreview = useMemo(() => {
    if (paymentMethod !== 'CREDIT' || grandTotal <= 0) return null;
    try {
      const dp = Number(dpInput) || 0;
      return {
        ok: true as const,
        data: buildInstallmentSchedule({
          principalAmount: grandTotal,
          downPayment: dp,
          interestRate,
          frequency,
          tenorCount,
          startDate: toLocalDateISO(),
        }),
      };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : 'Skema cicilan belum valid.',
      };
    }
  }, [paymentMethod, grandTotal, dpInput, interestRate, frequency, tenorCount]);

  const addToCart = (product: Product) => {
    if (product.stock <= 0) {
      showToast('error', `Stok "${product.name}" sedang habis.`);
      return;
    }
    setCart((prev) => {
      const idx = prev.findIndex((r) => r.productId === product.id);
      if (idx === -1) {
        return [...prev, { productId: product.id, qty: 1 }];
      }
      const nextQty = prev[idx].qty + 1;
      if (nextQty > product.stock) {
        showToast('error', `Stok maksimal "${product.name}" hanya ${product.stock} ${product.unit}.`);
        return prev;
      }
      return prev.map((r, i) => (i === idx ? { ...r, qty: nextQty } : r));
    });
  };

  const updateCartQty = (productId: string, nextQty: number) => {
    const product = productMap.get(productId);
    if (!product) return;
    if (nextQty <= 0) {
      setCart((prev) => prev.filter((r) => r.productId !== productId));
      return;
    }
    if (nextQty > product.stock) {
      showToast('error', `Jumlah melebihi stok gudang (${product.stock} ${product.unit}).`);
      return;
    }
    setCart((prev) => prev.map((r) => (r.productId === productId ? { ...r, qty: nextQty } : r)));
  };

  const handleCheckout = () => {
    try {
      const res = createSale({
        customerId: customerId || null,
        items: cart.map((c) => ({ productId: c.productId, qty: c.qty })),
        paymentMethod,
        amountPaid:
          paymentMethod === 'CASH'
            ? cashReceived
            : paymentMethod === 'CREDIT'
            ? Number(dpInput) || 0
            : grandTotal,
        notes: notes.trim() || undefined,
        creditConfig:
          paymentMethod === 'CREDIT'
            ? {
                downPayment: Number(dpInput) || 0,
                interestRate,
                frequency,
                tenorCount,
                startDate: toLocalDateISO(),
              }
            : undefined,
      });
      setCompletedResult(res);
      setCart([]);
      setCashInput('');
      setDpInput('0');
      setNotes('');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Checkout gagal.');
    }
  };

  const handleQuickCreateCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = upsertCustomer({
        name: newCustName,
        phone: newCustPhone,
        address: newCustAddress,
        type: newCustType,
      });
      setCustomerId(created.id);
      setCustModalOpen(false);
      setNewCustName('');
      setNewCustPhone('');
      setNewCustAddress('');
      setNewCustType('RETAIL');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal menambah pelanggan.');
    }
  };

  const canSubmit =
    cartDetailed.length > 0 &&
    (paymentMethod !== 'CASH' || cashReceived >= grandTotal) &&
    (paymentMethod !== 'CREDIT' || (Boolean(customerId) && Boolean(creditPreview?.ok)));

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
      {/* Left Catalog Pane */}
      <div className="xl:col-span-7 space-y-4">
        <div className="bg-white border border-[#E6E0D6] rounded-xl p-4 shadow-xs space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#8A7F73] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama produk tembakau, papir, atau kode SKU (contoh: IDB-RJG-001)..."
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[#D8D0C5] text-sm focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20 focus:border-[#B91C1C]"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-[#14110F] text-white'
                    : 'bg-[#F1EDE5] text-[#5C5349] hover:bg-[#E6E0D6]'
                }`}
              >
                {cat === 'SEMUA' ? 'Semua Produk' : cat}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {filteredProducts.map((p) => {
            const inCartQty = cart.find((c) => c.productId === p.id)?.qty || 0;
            const outOfStock = p.stock <= 0;
            const lowStock = p.stock > 0 && p.stock <= p.minStock;
            return (
              <button
                key={p.id}
                type="button"
                disabled={outOfStock}
                onClick={() => addToCart(p)}
                className={`text-left p-4 rounded-xl border transition-all flex flex-col justify-between relative ${
                  outOfStock
                    ? 'bg-stone-100 border-stone-200 opacity-60 cursor-not-allowed'
                    : inCartQty > 0
                    ? 'bg-white border-[#B91C1C] ring-1 ring-[#B91C1C] shadow-sm cursor-pointer'
                    : 'bg-white border-[#E6E0D6] hover:border-[#B8860B] hover:shadow-sm cursor-pointer'
                }`}
              >
                {inCartQty > 0 && (
                  <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[#B91C1C] text-white text-xs font-extrabold flex items-center justify-center shadow">
                    {inCartQty}
                  </span>
                )}

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-mono text-[11px] font-semibold text-[#7C7165]">
                      {p.sku}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums ${
                        outOfStock
                          ? 'bg-rose-100 text-rose-800'
                          : lowStock
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {outOfStock ? 'Habis' : `${p.stock} ${p.unit}`}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-[#1A1614] leading-snug line-clamp-2">
                    {p.name}
                  </p>
                  <p className="text-[11px] text-[#6B6257] mt-1">{p.category}</p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-[#F1EDE5] flex items-center justify-between">
                  <span className="text-sm font-extrabold text-[#B91C1C] tabular-nums">
                    {formatRupiah(p.sellPrice)}
                  </span>
                  <span className="text-[11px] text-[#6B6257]">/ {p.unit}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Cart & Payment Pane */}
      <div className="xl:col-span-5 bg-white border border-[#E6E0D6] rounded-xl shadow-sm overflow-hidden sticky top-20">
        <div className="px-5 py-3.5 bg-[#14110F] text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold">Keranjang Kasir</h2>
          </div>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={() => setCart([])}
              className="text-xs text-rose-300 hover:text-rose-200 cursor-pointer"
            >
              Kosongkan
            </button>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* Customer Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#6B6257] mb-1.5">
              Pelanggan
            </label>
            <div className="flex gap-2">
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-[#D8D0C5] text-sm bg-white focus:outline-none focus:border-[#B91C1C]"
              >
                <option value="">Pelanggan Umum (Non-Member)</option>
                {db.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.type})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setCustModalOpen(true)}
                title="Tambah Pelanggan Baru"
                className="px-3 py-2 rounded-lg border border-[#D8D0C5] bg-[#F8F6F2] hover:bg-[#EFEAE0] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <UserPlus className="w-4 h-4 text-[#B91C1C]" />
                Baru
              </button>
            </div>
          </div>

          {/* Cart Items */}
          <div className="max-h-60 overflow-y-auto divide-y divide-[#EDE7DD] border border-[#EDE7DD] rounded-lg px-3">
            {cartDetailed.length === 0 ? (
              <p className="py-8 text-center text-xs text-[#7C7165]">
                Klik produk di sebelah kiri untuk memasukkan ke keranjang.
              </p>
            ) : (
              cartDetailed.map(({ product, qty, subtotal: lineSub }) => (
                <div key={product.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[#1A1614] truncate">{product.name}</p>
                    <p className="text-[11px] text-[#6B6257] tabular-nums">
                      {formatRupiah(product.sellPrice)} • Maks {product.stock} {product.unit}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => updateCartQty(product.id, qty - 1)}
                      className="w-6 h-6 rounded border border-[#D8D0C5] flex items-center justify-center hover:bg-[#F1EDE5] cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={product.stock}
                      value={qty}
                      onChange={(e) => updateCartQty(product.id, Number(e.target.value) || 0)}
                      className="w-12 text-center py-0.5 text-xs font-bold border border-[#D8D0C5] rounded tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => updateCartQty(product.id, qty + 1)}
                      className="w-6 h-6 rounded border border-[#D8D0C5] flex items-center justify-center hover:bg-[#F1EDE5] cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <span className="w-24 text-right text-xs font-bold tabular-nums">
                      {formatRupiah(lineSub)}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateCartQty(product.id, 0)}
                      className="p-1 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                      aria-label="Hapus item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Totals */}
          <div className="bg-[#F8F6F2] rounded-lg p-3.5 border border-[#E6E0D6] space-y-1.5 text-xs tabular-nums">
            <div className="flex justify-between text-[#5C5349]">
              <span>Subtotal</span>
              <span className="font-semibold">{formatRupiah(subtotal)}</span>
            </div>
            <div className="flex justify-between text-[#5C5349]">
              <span>PPN ({db.settings.taxRate}%)</span>
              <span className="font-semibold">{formatRupiah(taxAmount)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-[#D8D0C5] text-base font-extrabold text-[#1A1614]">
              <span>Total Tagihan</span>
              <span className="text-[#B91C1C]">{formatRupiah(grandTotal)}</span>
            </div>
          </div>

          {/* Payment Methods */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#6B6257] mb-1.5">
              Metode Pembayaran
            </label>
            <div className="grid grid-cols-2 2xl:grid-cols-4 gap-2">
              {(
                [
                  { id: 'CASH', label: 'Tunai' },
                  { id: 'TRANSFER', label: 'Transfer Bank' },
                  { id: 'QRIS', label: 'QRIS' },
                  { id: 'CREDIT', label: 'Kredit / Tempo' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id)}
                  className={`py-2 px-2.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                    paymentMethod === m.id
                      ? 'bg-[#B91C1C] text-white border-[#B91C1C]'
                      : 'bg-white text-[#4A423A] border-[#D8D0C5] hover:bg-[#F8F6F2]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cash Calculator */}
          {paymentMethod === 'CASH' && (
            <div className="p-3.5 rounded-lg border border-[#E6E0D6] bg-white space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#1A1614]">Uang Diterima (Rp)</label>
                <button
                  type="button"
                  onClick={() => setCashInput(String(grandTotal))}
                  className="text-[11px] font-bold text-[#B91C1C] hover:underline cursor-pointer"
                >
                  Uang Pas
                </button>
              </div>
              <input
                type="number"
                min={0}
                value={cashInput}
                onChange={(e) => setCashInput(e.target.value)}
                placeholder="Masukkan nominal bayar..."
                className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5] font-mono font-bold text-sm tabular-nums"
              />
              <div className="flex flex-wrap gap-1.5">
                {[50000, 100000, 200000, 500000, 1000000].map((nom) => (
                  <button
                    key={nom}
                    type="button"
                    onClick={() => setCashInput(String((Number(cashInput) || 0) + nom))}
                    className="px-2 py-1 rounded bg-[#F1EDE5] hover:bg-[#E6E0D6] text-[11px] font-semibold tabular-nums cursor-pointer"
                  >
                    +{(nom / 1000).toLocaleString('id-ID')}rb
                  </button>
                ))}
              </div>
              {grandTotal > 0 && (
                <div className="flex justify-between pt-1.5 border-t border-[#F1EDE5] text-xs font-bold tabular-nums">
                  <span>{cashChange >= 0 ? 'Kembalian' : 'Kurang Bayar'}</span>
                  <span className={cashChange >= 0 ? 'text-emerald-700' : 'text-rose-600'}>
                    {formatRupiah(Math.abs(cashChange))}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Direct Credit / Installment Calculator */}
          {paymentMethod === 'CREDIT' && (
            <div className="p-3.5 rounded-lg border border-amber-300 bg-amber-50/60 space-y-3">
              <div className="flex items-center gap-2 text-xs font-extrabold text-amber-900">
                <Calculator className="w-4 h-4 text-[#B8860B]" />
                Kalkulator Cicilan Piutang Langsung
              </div>

              {!customerId && (
                <div className="flex items-start gap-2 p-2.5 rounded bg-rose-100 text-rose-900 text-xs font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Pilih <strong>Pelanggan Terdaftar</strong> (atau klik tombol &ldquo;Baru&rdquo;)
                    untuk mengaktifkan pembayaran Kredit / Tempo.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div>
                  <label className="block font-semibold text-[#5C5349] mb-1">
                    Uang Muka / DP (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={dpInput}
                    onChange={(e) => setDpInput(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded border border-[#D8D0C5] bg-white font-mono font-bold tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#5C5349] mb-1">Bunga Total (%)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={interestRate}
                    onChange={(e) => setInterestRate(Number(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 rounded border border-[#D8D0C5] bg-white font-mono font-bold tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#5C5349] mb-1">Frekuensi</label>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as InstallmentFrequency)}
                    className="w-full px-2.5 py-1.5 rounded border border-[#D8D0C5] bg-white font-semibold"
                  >
                    <option value="WEEKLY">Mingguan</option>
                    <option value="MONTHLY">Bulanan</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-[#5C5349] mb-1">Tenor (Termin)</label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={tenorCount}
                    onChange={(e) => setTenorCount(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full px-2.5 py-1.5 rounded border border-[#D8D0C5] bg-white font-mono font-bold tabular-nums"
                  />
                </div>
              </div>

              {creditPreview &&
                (creditPreview.ok ? (
                  <div className="bg-white rounded border border-amber-200 p-2.5 text-xs space-y-1 tabular-nums">
                    <div className="flex justify-between">
                      <span className="text-[#6B6257]">Sisa Pokok + Bunga:</span>
                      <span className="font-bold text-[#1A1614]">
                        {formatRupiah(creditPreview.data.totalPayable)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6B6257]">Estimasi Angsuran / Termin:</span>
                      <span className="font-extrabold text-[#B91C1C]">
                        {formatRupiah(creditPreview.data.installmentBaseAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] text-[#6B6257]">
                      <span>Jatuh Tempo #1 – Terakhir:</span>
                      <span>
                        {formatDate(creditPreview.data.schedule[0].dueDate)} –{' '}
                        {formatDate(
                          creditPreview.data.schedule[creditPreview.data.schedule.length - 1]
                            .dueDate
                        )}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-rose-700 font-semibold">{creditPreview.error}</p>
                ))}
            </div>
          )}

          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Catatan transaksi (opsional)..."
            className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5] text-xs"
          />

          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleCheckout}
            className={`w-full py-3 rounded-xl font-extrabold text-sm transition-colors shadow-sm ${
              canSubmit
                ? 'bg-[#B91C1C] hover:bg-[#991B1B] text-white cursor-pointer'
                : 'bg-stone-200 text-stone-500 cursor-not-allowed'
            }`}
          >
            Selesaikan Transaksi &amp; Terbitkan Invoice
          </button>
        </div>
      </div>

      {/* Quick Customer Modal */}
      <Modal
        open={custModalOpen}
        onClose={() => setCustModalOpen(false)}
        title="Tambah Pelanggan Baru"
        subtitle="Langsung tersedia di kasir & modul piutang"
      >
        <form onSubmit={handleQuickCreateCustomer} className="space-y-3.5 text-sm">
          <div>
            <label className="block text-xs font-bold text-[#5C5349] mb-1">Nama Pelanggan *</label>
            <input
              type="text"
              required
              value={newCustName}
              onChange={(e) => setNewCustName(e.target.value)}
              placeholder="Contoh: Toko Tembakau Makmur"
              className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#5C5349] mb-1">
                Nomor HP / WhatsApp *
              </label>
              <input
                type="text"
                required
                value={newCustPhone}
                onChange={(e) => setNewCustPhone(e.target.value)}
                placeholder="0812..."
                className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5C5349] mb-1">Tipe Mitra</label>
              <select
                value={newCustType}
                onChange={(e) => setNewCustType(e.target.value as CustomerType)}
                className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5] bg-white"
              >
                <option value="RETAIL">Retail</option>
                <option value="GROSIR">Grosir</option>
                <option value="DISTRIBUTOR">Distributor</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#5C5349] mb-1">Alamat Pengiriman</label>
            <textarea
              rows={2}
              value={newCustAddress}
              onChange={(e) => setNewCustAddress(e.target.value)}
              placeholder="Alamat lengkap untuk Invoice & Surat Jalan..."
              className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCustModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-[#D8D0C5] text-xs font-bold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#B91C1C] text-white text-xs font-bold cursor-pointer"
            >
              Simpan &amp; Pilih
            </button>
          </div>
        </form>
      </Modal>

      {/* Post-Checkout Print & Action Modal */}
      <Modal
        open={Boolean(completedResult)}
        onClose={() => setCompletedResult(null)}
        title="Transaksi Berhasil Disimpan"
        subtitle={
          completedResult
            ? `Invoice ${completedResult.transaction.invoiceNumber} • ${completedResult.transaction.customerName}`
            : undefined
        }
      >
        {completedResult && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900">
              <CheckCircle2 className="w-7 h-7 text-emerald-600 shrink-0" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider">Total Transaksi</p>
                <p className="text-xl font-extrabold tabular-nums">
                  {formatRupiah(completedResult.transaction.total)}
                </p>
                {completedResult.transaction.paymentMethod === 'CASH' && (
                  <p className="text-xs mt-0.5 tabular-nums">
                    Kembalian: {formatRupiah(completedResult.transaction.changeAmount)}
                  </p>
                )}
                {completedResult.paymentPlan && (
                  <p className="text-xs mt-0.5 font-semibold">
                    Skema Kredit {completedResult.paymentPlan.planNumber} aktif (
                    {completedResult.paymentPlan.tenorCount} termin)
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() =>
                  openPrint({
                    kind: 'thermal58',
                    transaction: completedResult.transaction,
                    paymentPlan: completedResult.paymentPlan,
                  })
                }
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border border-[#D8D0C5] hover:bg-[#F8F6F2] text-xs font-bold cursor-pointer"
              >
                <Printer className="w-4 h-4 text-[#B91C1C]" />
                Struk Thermal 58mm
              </button>
              <button
                type="button"
                onClick={() =>
                  openPrint({
                    kind: 'thermal80',
                    transaction: completedResult.transaction,
                    paymentPlan: completedResult.paymentPlan,
                  })
                }
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border border-[#D8D0C5] hover:bg-[#F8F6F2] text-xs font-bold cursor-pointer"
              >
                <Printer className="w-4 h-4 text-[#B91C1C]" />
                Struk Thermal 80mm
              </button>
              <button
                type="button"
                onClick={() =>
                  openPrint({
                    kind: 'invoiceA4',
                    transaction: completedResult.transaction,
                    paymentPlan: completedResult.paymentPlan,
                  })
                }
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border border-[#D8D0C5] hover:bg-[#F8F6F2] text-xs font-bold cursor-pointer"
              >
                <FileText className="w-4 h-4 text-[#14110F]" />
                Invoice Resmi A4
              </button>
              <button
                type="button"
                onClick={() =>
                  openPrint({
                    kind: 'suratJalan',
                    transaction: completedResult.transaction,
                  })
                }
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border border-[#D8D0C5] hover:bg-[#F8F6F2] text-xs font-bold cursor-pointer"
              >
                <Truck className="w-4 h-4 text-[#B8860B]" />
                Cetak Surat Jalan
              </button>
            </div>

            <button
              type="button"
              onClick={() => setCompletedResult(null)}
              className="w-full py-2.5 rounded-lg bg-[#14110F] text-white text-xs font-bold cursor-pointer"
            >
              Mulai Transaksi Baru
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
};

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
  PauseCircle,
  Clock,
  MessageCircle,
} from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { buildInstallmentSchedule, getEffectiveUnitPrice, getPlanMetrics } from '../lib/calculations';
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatRupiah,
  formatWhatsAppUrl,
  roundQty,
  toLocalDateISO,
} from '../lib/format';
import {
  CustomerType,
  HoldOrder,
  InstallmentFrequency,
  PaymentMethod,
  PaymentPlan,
  Product,
  Transaction,
} from '../types/erp';
import { EmptyState, Modal } from '../components/ui/SharedUi';

interface CartRow {
  productId: string;
  qty: number;
}

export const PosPage: React.FC = () => {
  const {
    db,
    can,
    createSale,
    upsertCustomer,
    saveHoldOrder,
    deleteHoldOrder,
    openCashierShift,
    closeCashierShift,
    openPrint,
    showToast,
  } = useErp();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('SEMUA');
  const [cart, setCart] = useState<CartRow[]>([]);
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [customerId, setCustomerId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('TRANSFER');
  const [dpPaymentMethod, setDpPaymentMethod] = useState<'TRANSFER' | 'CASH' | 'QRIS'>('TRANSFER');
  const [transferRef, setTransferRef] = useState<string>('');
  const [cashInput, setCashInput] = useState<string>('');
  const [discountMode, setDiscountMode] = useState<'RP' | 'PCT'>('RP');
  const [discountInput, setDiscountInput] = useState<string>('');
  const [shippingInput, setShippingInput] = useState<string>('');
  const [taxEnabled, setTaxEnabled] = useState<boolean>(true);
  const [notes, setNotes] = useState('');

  // Hold orders & Cashier Shift modals
  const [holdListOpen, setHoldListOpen] = useState(false);
  const [shiftModalOpen, setShiftModalOpen] = useState<'OPEN' | 'CLOSE' | null>(null);
  const [shiftCashInput, setShiftCashInput] = useState<string>('0');
  const [shiftNotes, setShiftNotes] = useState('');

  // B2B Staged Credit / Tempo calculator state (defaults: Flexible 30-day tempo, 0% interest)
  const [dpInput, setDpInput] = useState<string>('0');
  const [tenorCount, setTenorCount] = useState<number>(3);
  const [tempoDays, setTempoDays] = useState<number>(30);
  const [frequency, setFrequency] = useState<InstallmentFrequency>('FLEXIBLE');
  const [interestRate, setInterestRate] = useState<number>(0);

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

  const selectedCustomer = useMemo(
    () => (customerId ? db.customers.find((c) => c.id === customerId) || null : null),
    [db.customers, customerId]
  );

  const selectedCustomerExposure = useMemo(() => {
    if (!selectedCustomer) return null;
    const today = toLocalDateISO();
    let activeDebt = 0;
    let activeCount = 0;
    let overdueCount = 0;
    let maxOverdueDays = 0;
    for (const pl of db.paymentPlans) {
      if (pl.customerId !== selectedCustomer.id || pl.status !== 'ACTIVE') continue;
      const m = getPlanMetrics(pl, today);
      activeDebt += m.remainingBalance;
      activeCount += 1;
      if (m.isOverdue) {
        overdueCount += 1;
        if (m.maxOverdueDays > maxOverdueDays) maxOverdueDays = m.maxOverdueDays;
      }
    }
    const remainingLimit =
      selectedCustomer.creditLimit && selectedCustomer.creditLimit > 0
        ? selectedCustomer.creditLimit - activeDebt
        : null;
    return { activeDebt, activeCount, overdueCount, maxOverdueDays, remainingLimit };
  }, [selectedCustomer, db.paymentPlans]);

  const openShift = useMemo(
    () => (db.shifts || []).find((s) => s.status === 'OPEN') || null,
    [db.shifts]
  );

  const holdOrders = db.holdOrders || [];

  const cartDetailed = useMemo(() => {
    return cart
      .map((row) => {
        const product = productMap.get(row.productId);
        if (!product) return null;
        const unitPrice = getEffectiveUnitPrice(product, selectedCustomer?.type);
        return {
          product,
          qty: row.qty,
          unitPrice,
          subtotal: Math.round(unitPrice * row.qty),
        };
      })
      .filter(
        (x): x is { product: Product; qty: number; unitPrice: number; subtotal: number } =>
          x !== null
      );
  }, [cart, productMap, selectedCustomer?.type]);

  const totalWeightKg = useMemo(
    () => roundQty(cartDetailed.reduce((sum, row) => sum + row.qty, 0)),
    [cartDetailed]
  );

  const rawSubtotal = useMemo(
    () => cartDetailed.reduce((acc, row) => acc + row.subtotal, 0),
    [cartDetailed]
  );
  const rawDiscVal = Math.max(0, Number(discountInput) || 0);
  const discountAmount = Math.min(
    rawSubtotal,
    discountMode === 'PCT' ? Math.round((rawSubtotal * Math.min(100, rawDiscVal)) / 100) : Math.round(rawDiscVal)
  );
  const subtotal = Math.max(0, rawSubtotal - discountAmount);
  const shippingCost = Math.max(0, Math.round(Number(shippingInput) || 0));
  const taxAmount = taxEnabled ? Math.round(subtotal * (db.settings.taxRate / 100)) : 0;
  const grandTotal = subtotal + taxAmount + shippingCost;

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
          tempoDays,
          startDate: toLocalDateISO(),
        }),
      };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : 'Skema cicilan belum valid.',
      };
    }
  }, [paymentMethod, grandTotal, dpInput, interestRate, frequency, tenorCount, tempoDays]);

  const addToCart = (product: Product, addQty = 1) => {
    if (product.stock <= 0) {
      showToast('error', `Stok "${product.name}" sedang habis.`);
      return;
    }
    const step = roundQty(Math.min(addQty, product.stock));
    setCart((prev) => {
      const idx = prev.findIndex((r) => r.productId === product.id);
      if (idx === -1) {
        return [...prev, { productId: product.id, qty: step }];
      }
      const nextQty = roundQty(prev[idx].qty + step);
      if (nextQty > product.stock) {
        showToast(
          'error',
          `Stok maksimal "${product.name}" hanya ${formatNumber(product.stock)} ${product.unit}.`
        );
        return prev;
      }
      return prev.map((r, i) => (i === idx ? { ...r, qty: nextQty } : r));
    });
  };

  const updateCartQty = (productId: string, rawQty: number, preserveDraft = false) => {
    const product = productMap.get(productId);
    if (!product) return;
    if (!preserveDraft) {
      setQtyDrafts((prev) => {
        if (!(productId in prev)) return prev;
        const next = { ...prev };
        delete next[productId];
        return next;
      });
    }
    const nextQty = roundQty(rawQty);
    if (!Number.isFinite(nextQty) || nextQty <= 0) {
      setCart((prev) => prev.filter((r) => r.productId !== productId));
      return;
    }
    if (nextQty > product.stock) {
      showToast(
        'error',
        `Jumlah melebihi stok gudang (${formatNumber(product.stock)} ${product.unit}).`
      );
      return;
    }
    setCart((prev) => prev.map((r) => (r.productId === productId ? { ...r, qty: nextQty } : r)));
  };

  const handleHoldCart = () => {
    if (cart.length === 0) return;
    try {
      const label = selectedCustomer
        ? `${selectedCustomer.name} (${cart.length} item)`
        : `Pesanan Umum (${cart.length} item)`;
      saveHoldOrder({
        label,
        customerId: customerId || null,
        items: cart,
        discountAmount,
        shippingCost,
        taxEnabled,
        notes: notes.trim() || undefined,
      });
      setCart([]);
      setDiscountInput('');
      setShippingInput('');
      setNotes('');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal menahan pesanan.');
    }
  };

  const handleResumeHold = (hold: HoldOrder) => {
    setCart(hold.items);
    setCustomerId(hold.customerId || '');
    setDiscountMode('RP');
    setDiscountInput(hold.discountAmount ? String(hold.discountAmount) : '');
    setShippingInput(hold.shippingCost ? String(hold.shippingCost) : '');
    setTaxEnabled(hold.taxEnabled !== false);
    setNotes(hold.notes || '');
    deleteHoldOrder(hold.id);
    setHoldListOpen(false);
    showToast('info', `Pesanan "${hold.label}" dimuat kembali ke keranjang.`);
  };

  const handleCheckout = () => {
    try {
      const res = createSale({
        customerId: customerId || null,
        items: cart.map((c) => ({ productId: c.productId, qty: c.qty })),
        paymentMethod,
        dpPaymentMethod: paymentMethod === 'CREDIT' ? dpPaymentMethod : undefined,
        transferReference:
          paymentMethod === 'TRANSFER' ||
          (paymentMethod === 'CREDIT' && dpPaymentMethod === 'TRANSFER' && (Number(dpInput) || 0) > 0)
            ? transferRef.trim() || undefined
            : undefined,
        discountAmount,
        shippingCost,
        taxEnabled,
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
                tempoDays,
                startDate: toLocalDateISO(),
              }
            : undefined,
      });
      setCompletedResult(res);
      setCart([]);
      setCashInput('');
      setTransferRef('');
      setDiscountInput('');
      setShippingInput('');
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
    can('pos:checkout') &&
    cartDetailed.length > 0 &&
    (paymentMethod !== 'CASH' || cashReceived >= grandTotal) &&
    (paymentMethod !== 'CREDIT' || (Boolean(customerId) && Boolean(creditPreview?.ok)));

  return (
    <div className="space-y-4">
      {/* Compact Shift Kasir & Hold Orders Bar */}
      <div className="hig-card px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <Clock
            style={{ color: openShift ? 'var(--status-positive)' : 'var(--text-secondary)' }}
            className="w-4 h-4 shrink-0"
            aria-hidden="true"
          />
          {openShift ? (
            <span>
              <strong style={{ color: 'var(--status-positive)' }}>Shift Aktif</strong> ·{' '}
              {openShift.cashierName} · Modal awal{' '}
              <strong className="tabular-nums">{formatRupiah(openShift.openingCash)}</strong>
            </span>
          ) : (
            <span style={{ color: 'var(--text-secondary)' }}>
              Shift kasir belum dibuka (opsional untuk pencatatan modal &amp; setoran laci harian).
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {holdOrders.length > 0 && (
            <button
              type="button"
              onClick={() => setHoldListOpen(true)}
              className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1 hig-btn-secondary font-semibold"
            >
              <PauseCircle className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Pesanan Ditahan ({holdOrders.length})</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setShiftCashInput(openShift ? '' : '500000');
              setShiftNotes('');
              setShiftModalOpen(openShift ? 'CLOSE' : 'OPEN');
            }}
            className="min-h-[34px] px-3 py-1 hig-btn-secondary font-semibold"
          >
            {openShift ? 'Tutup Shift Kasir' : 'Buka Shift Kasir'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
      {/* Left Catalog Pane */}
      <div className="xl:col-span-7 space-y-4">
        <div className="hig-card p-4 space-y-3">
          <div className="relative">
            <Search
              style={{ color: 'var(--text-secondary)' }}
              className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              aria-label="Cari produk tembakau atau SKU"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && search.trim()) {
                  const exact =
                    filteredProducts.find(
                      (p) => p.sku.toLowerCase() === search.trim().toLowerCase()
                    ) || (filteredProducts.length === 1 ? filteredProducts[0] : null);
                  if (exact && exact.stock > 0) {
                    e.preventDefault();
                    addToCart(exact);
                    setSearch('');
                  }
                }
              }}
              placeholder="Cari nama produk atau ketik/scan SKU (IB-0001) lalu Enter..."
              className="w-full min-h-[44px] pl-10 pr-4 py-2 hig-input text-sm"
            />
          </div>

          <div
            style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-hairline)' }}
            className="flex flex-wrap gap-1 p-1 rounded-xl border"
          >
            {categories.map((cat) => {
              const active = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedCategory(cat)}
                  style={
                    active
                      ? { backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }
                      : { color: 'var(--text-secondary)' }
                  }
                  className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    active ? 'shadow-xs' : 'hover:text-[var(--text-primary)]'
                  }`}
                >
                  {cat === 'SEMUA' ? 'Semua Produk' : cat}
                </button>
              );
            })}
          </div>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="hig-card">
            <EmptyState
              icon={Search}
              title="Produk tidak ditemukan"
              description="Tidak ada SKU yang sesuai dengan kata kunci atau kategori yang dipilih."
              actionLabel="Reset Pencarian"
              onAction={() => {
                setSearch('');
                setSelectedCategory('SEMUA');
              }}
            />
          </div>
        ) : (
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
                  style={{
                    backgroundColor: outOfStock ? 'var(--bg-subtle)' : 'var(--bg-surface)',
                    borderColor: inCartQty > 0 ? 'var(--accent-primary)' : 'var(--border-hairline)',
                  }}
                  className={`text-left p-4 rounded-xl border transition-all flex flex-col justify-between relative ${
                    outOfStock
                      ? 'opacity-60'
                      : inCartQty > 0
                      ? 'ring-1 ring-[var(--accent-primary)] shadow-xs'
                      : 'hover:border-[var(--border-control)]'
                  }`}
                >
                  {inCartQty > 0 && (
                    <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[#B91C1C] text-white text-xs font-bold flex items-center justify-center shadow">
                      {inCartQty}
                    </span>
                  )}

                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span
                        style={{ color: 'var(--text-secondary)' }}
                        className="font-mono text-[11px] font-semibold"
                      >
                        {p.sku}
                      </span>
                      <span
                        style={{
                          color: outOfStock
                            ? 'var(--status-danger)'
                            : lowStock
                            ? 'var(--status-warning)'
                            : 'var(--status-positive)',
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums"
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-current shrink-0"
                          aria-hidden="true"
                        />
                        {outOfStock ? 'Habis' : `${p.stock} ${p.unit}`}
                      </span>
                    </div>
                    <p className="text-sm font-bold leading-snug line-clamp-2">{p.name}</p>
                    <p style={{ color: 'var(--text-secondary)' }} className="text-[11px] mt-1">
                      {p.category}
                    </p>
                  </div>

                  <div
                    style={{ borderColor: 'var(--border-hairline)' }}
                    className="mt-3 pt-2.5 border-t flex items-center justify-between"
                  >
                    <span
                      style={{ color: 'var(--accent-primary-text)' }}
                      className="text-sm font-bold tabular-nums"
                    >
                      {formatRupiah(getEffectiveUnitPrice(p, selectedCustomer?.type))}
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }} className="text-[11px]">
                      / {p.unit}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Right Cart & Payment Pane */}
      <div className="xl:col-span-5 hig-card overflow-hidden sticky top-20 flex flex-col max-h-[calc(100vh-6rem)]">
        <div
          style={{
            backgroundColor: 'var(--bg-subtle)',
            borderColor: 'var(--border-hairline)',
          }}
          className="px-5 py-3.5 border-b flex items-center justify-between shrink-0"
        >
          <div className="flex items-center gap-2">
            <ShoppingCart
              style={{ color: 'var(--accent-primary-text)' }}
              className="w-4 h-4"
              aria-hidden="true"
            />
            <h2 className="text-sm font-bold">Keranjang Kasir</h2>
          </div>
          {cart.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleHoldCart}
                style={{ color: 'var(--text-primary)' }}
                className="min-h-[34px] px-2 text-xs font-semibold hover:underline"
              >
                Tahan
              </button>
              <button
                type="button"
                onClick={() => setCart([])}
                style={{ color: 'var(--status-danger)' }}
                className="min-h-[34px] px-2 text-xs font-semibold hover:underline"
              >
                Kosongkan
              </button>
            </div>
          )}
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Customer Selector */}
          <div>
            <label htmlFor="pos-customer" className="block text-xs font-semibold mb-1.5">
              Pelanggan
            </label>
            <div className="flex gap-2">
              <select
                id="pos-customer"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="flex-1 min-h-[44px] px-3 py-2 hig-input text-sm"
              >
                <option value="">Pelanggan Umum (Non-Member)</option>
                {db.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.type})
                  </option>
                ))}
              </select>
              {can('pos:quick_customer') && (
                <button
                  type="button"
                  onClick={() => setCustModalOpen(true)}
                  title="Tambah Pelanggan Baru"
                  className="min-h-[44px] px-3.5 py-2 hig-btn-secondary text-xs font-semibold flex items-center gap-1.5"
                >
                  <UserPlus
                    style={{ color: 'var(--accent-primary-text)' }}
                    className="w-4 h-4"
                    aria-hidden="true"
                  />
                  <span>Baru</span>
                </button>
              )}
            </div>
            {selectedCustomer && selectedCustomerExposure && (
              <div
                style={{
                  backgroundColor:
                    selectedCustomerExposure.overdueCount > 0
                      ? 'var(--status-danger-soft)'
                      : 'var(--bg-subtle)',
                  borderColor: 'var(--border-hairline)',
                }}
                className="mt-2 px-3 py-2 rounded-lg border text-[11px] flex flex-wrap items-center justify-between gap-2 tabular-nums"
              >
                <span>
                  Tier: <strong>{selectedCustomer.type}</strong> · Piutang aktif:{' '}
                  <strong>{formatRupiah(selectedCustomerExposure.activeDebt)}</strong>
                  {selectedCustomerExposure.activeCount > 0
                    ? ` (${selectedCustomerExposure.activeCount} nota)`
                    : ''}
                </span>
                {selectedCustomerExposure.overdueCount > 0 ? (
                  <span style={{ color: 'var(--status-danger)' }} className="font-bold">
                    {selectedCustomerExposure.overdueCount} nota telat (maks{' '}
                    {selectedCustomerExposure.maxOverdueDays} hr)
                  </span>
                ) : selectedCustomerExposure.remainingLimit !== null ? (
                  <span
                    style={{
                      color:
                        selectedCustomerExposure.remainingLimit > 0
                          ? 'var(--status-positive)'
                          : 'var(--status-danger)',
                    }}
                    className="font-semibold"
                  >
                    Sisa plafon: {formatRupiah(selectedCustomerExposure.remainingLimit)}
                  </span>
                ) : null}
              </div>
            )}
          </div>

          {/* Cart Items */}
          <div
            style={{ borderColor: 'var(--border-hairline)' }}
            className="max-h-60 overflow-y-auto space-y-1 border rounded-xl px-3 py-1"
          >
            {cartDetailed.length === 0 ? (
              <p
                style={{ color: 'var(--text-secondary)' }}
                className="py-8 text-center text-xs"
              >
                Klik produk di sebelah kiri untuk memasukkan ke keranjang.
              </p>
            ) : (
              cartDetailed.map(({ product, qty, unitPrice, subtotal: lineSub }) => (
                <div key={product.id} className="py-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold truncate">{product.name}</p>
                      <p
                        style={{ color: 'var(--text-secondary)' }}
                        className="text-[11px] tabular-nums"
                      >
                        {formatRupiah(unitPrice)}/{product.unit} · Maks {formatNumber(product.stock)}{' '}
                        {product.unit}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateCartQty(product.id, roundQty(qty - 0.5))}
                        aria-label={`Kurangi ${product.name}`}
                        className="w-7 h-7 rounded-lg hig-btn-secondary flex items-center justify-center"
                      >
                        <Minus className="w-3 h-3" aria-hidden="true" />
                      </button>
                      <input
                        type="number"
                        aria-label={`Jumlah ${product.name}`}
                        min={0.05}
                        max={product.stock}
                        step="any"
                        value={qtyDrafts[product.id] ?? String(qty)}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setQtyDrafts((prev) => ({ ...prev, [product.id]: raw }));
                          const parsed = Number(raw);
                          if (raw.trim() !== '' && Number.isFinite(parsed) && parsed > 0) {
                            updateCartQty(product.id, parsed, true);
                          }
                        }}
                        onBlur={() => {
                          setQtyDrafts((prev) => {
                            const next = { ...prev };
                            delete next[product.id];
                            return next;
                          });
                        }}
                        className="w-14 h-7 text-center text-xs font-bold hig-input tabular-nums"
                      />
                      <button
                        type="button"
                        onClick={() => updateCartQty(product.id, roundQty(qty + 0.5))}
                        aria-label={`Tambah ${product.name}`}
                        className="w-7 h-7 rounded-lg hig-btn-secondary flex items-center justify-center"
                      >
                        <Plus className="w-3 h-3" aria-hidden="true" />
                      </button>
                      <span className="w-20 text-right text-xs font-bold tabular-nums">
                        {formatRupiah(lineSub)}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateCartQty(product.id, 0)}
                        style={{ color: 'var(--status-danger)' }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--status-danger-soft)]"
                        aria-label={`Hapus ${product.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  {/* Quick factory volume presets (0.5 Kg to 50 Kg) */}
                  <div className="flex flex-wrap items-center gap-1 text-[10px]">
                    <span style={{ color: 'var(--text-secondary)' }}>Cepat:</span>
                    {[0.5, 1, 5, 10, 25, 50].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        disabled={preset > product.stock}
                        onClick={() => updateCartQty(product.id, preset)}
                        style={{ color: 'var(--text-secondary)' }}
                        className="px-1.5 py-0.5 rounded hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] font-mono font-semibold disabled:opacity-35"
                      >
                        {preset} {product.unit}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Discount, Shipping & PPN Controls */}
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="pos-disc" className="font-semibold">
                  Diskon
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setDiscountMode((m) => (m === 'RP' ? 'PCT' : 'RP'));
                    setDiscountInput('');
                  }}
                  style={{ color: 'var(--accent-primary-text)' }}
                  className="text-[11px] font-semibold hover:underline"
                >
                  {discountMode === 'RP' ? 'Mode Rp' : 'Mode %'}
                </button>
              </div>
              <input
                id="pos-disc"
                type="number"
                min={0}
                max={discountMode === 'PCT' ? 100 : undefined}
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
                placeholder={discountMode === 'RP' ? '0 (Rp)' : '0 (%)'}
                className="w-full min-h-[36px] px-2.5 py-1 hig-input font-mono tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="pos-ship" className="block font-semibold mb-1">
                Ongkir / Kirim (Rp)
              </label>
              <input
                id="pos-ship"
                type="number"
                min={0}
                value={shippingInput}
                onChange={(e) => setShippingInput(e.target.value)}
                placeholder="0"
                className="w-full min-h-[36px] px-2.5 py-1 hig-input font-mono tabular-nums"
              />
            </div>
          </div>

          {/* Totals */}
          <div className="hig-inset p-3.5 space-y-1.5 text-xs tabular-nums">
            <div style={{ color: 'var(--text-secondary)' }} className="flex justify-between">
              <span>Total Muatan ({cartDetailed.length} varian)</span>
              <span style={{ color: 'var(--text-primary)' }} className="font-mono font-semibold">
                {formatNumber(totalWeightKg)} Kg
              </span>
            </div>
            <div style={{ color: 'var(--text-secondary)' }} className="flex justify-between">
              <span>Subtotal</span>
              <span style={{ color: 'var(--text-primary)' }} className="font-semibold">
                {formatRupiah(rawSubtotal)}
              </span>
            </div>
            {discountAmount > 0 && (
              <div style={{ color: 'var(--status-positive)' }} className="flex justify-between">
                <span>Diskon</span>
                <span className="font-semibold">-{formatRupiah(discountAmount)}</span>
              </div>
            )}
            <div style={{ color: 'var(--text-secondary)' }} className="flex justify-between items-center">
              <label htmlFor="pos-tax-toggle" className="inline-flex items-center gap-1.5">
                <input
                  id="pos-tax-toggle"
                  type="checkbox"
                  checked={taxEnabled}
                  onChange={(e) => setTaxEnabled(e.target.checked)}
                />
                <span>PPN ({db.settings.taxRate}%)</span>
              </label>
              <span style={{ color: 'var(--text-primary)' }} className="font-semibold">
                {formatRupiah(taxAmount)}
              </span>
            </div>
            {shippingCost > 0 && (
              <div style={{ color: 'var(--text-secondary)' }} className="flex justify-between">
                <span>Ongkos Kirim</span>
                <span style={{ color: 'var(--text-primary)' }} className="font-semibold">
                  {formatRupiah(shippingCost)}
                </span>
              </div>
            )}
            <div
              style={{ borderColor: 'var(--border-hairline)' }}
              className="flex justify-between pt-2 border-t text-base font-bold"
            >
              <span>Total Tagihan</span>
              <span style={{ color: 'var(--accent-primary-text)' }}>
                {formatRupiah(grandTotal)}
              </span>
            </div>
          </div>

          {/* Payment Methods */}
          <div>
            <p className="text-xs font-semibold mb-1.5">Metode Pembayaran</p>
            <div className="grid grid-cols-2 2xl:grid-cols-4 gap-2">
              {(
                [
                  { id: 'TRANSFER', label: 'Transfer Bank' },
                  { id: 'CREDIT', label: 'Cicil / Tempo' },
                  { id: 'CASH', label: 'Tunai' },
                  { id: 'QRIS', label: 'QRIS' },
                ] as const
              ).map((m) => {
                const active = paymentMethod === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPaymentMethod(m.id)}
                    style={
                      active
                        ? {
                            backgroundColor: 'var(--cta-bg)',
                            color: 'var(--cta-text)',
                            borderColor: 'var(--cta-bg)',
                          }
                        : {
                            backgroundColor: 'var(--bg-surface)',
                            color: 'var(--text-primary)',
                            borderColor: 'var(--border-control)',
                          }
                    }
                    className="min-h-[42px] py-2 px-2.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap"
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Transfer Bank Reference */}
          {paymentMethod === 'TRANSFER' && (
            <div
              style={{
                backgroundColor: 'var(--bg-subtle)',
                borderColor: 'var(--border-hairline)',
              }}
              className="p-3.5 rounded-xl border space-y-2 text-xs"
            >
              <label htmlFor="pos-tf-ref" className="block font-semibold">
                Ref. Transfer / Bank Pengirim (Opsional)
              </label>
              <input
                id="pos-tf-ref"
                type="text"
                value={transferRef}
                onChange={(e) => setTransferRef(e.target.value)}
                placeholder="Contoh: BCA a.n. CV Maju Jaya / Ref #8821"
                className="w-full min-h-[38px] px-3 py-1.5 hig-input font-mono text-xs"
              />
              {db.settings.bankName && db.settings.bankAccountNumber && (
                <p style={{ color: 'var(--text-secondary)' }} className="text-[11px]">
                  Rekening tujuan: <strong>{db.settings.bankName}</strong>{' '}
                  <span className="font-mono">{db.settings.bankAccountNumber}</span>
                </p>
              )}
            </div>
          )}

          {/* Cash Calculator */}
          {paymentMethod === 'CASH' && (
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-hairline)',
              }}
              className="p-3.5 rounded-xl border space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <label htmlFor="pos-cash-input" className="text-xs font-semibold">
                  Uang Diterima (Rp)
                </label>
                <button
                  type="button"
                  onClick={() => setCashInput(String(grandTotal))}
                  style={{ color: 'var(--accent-primary-text)' }}
                  className="text-xs font-semibold hover:underline"
                >
                  Uang Pas
                </button>
              </div>
              <input
                id="pos-cash-input"
                type="number"
                min={0}
                value={cashInput}
                onChange={(e) => setCashInput(e.target.value)}
                placeholder="Masukkan nominal bayar..."
                className="w-full min-h-[44px] px-3 py-2 hig-input font-mono font-bold text-sm tabular-nums"
              />
              <div className="flex flex-wrap gap-1.5">
                {[50000, 100000, 200000, 500000, 1000000].map((nom) => (
                  <button
                    key={nom}
                    type="button"
                    onClick={() => setCashInput(String((Number(cashInput) || 0) + nom))}
                    className="min-h-[34px] px-2.5 py-1 rounded-lg hig-btn-secondary text-[11px] font-semibold tabular-nums"
                  >
                    +{(nom / 1000).toLocaleString('id-ID')}rb
                  </button>
                ))}
              </div>
              {grandTotal > 0 && (
                <div
                  style={{ borderColor: 'var(--border-hairline)' }}
                  className="flex justify-between pt-2 border-t text-xs font-bold tabular-nums"
                >
                  <span>{cashChange >= 0 ? 'Kembalian' : 'Kurang Bayar'}</span>
                  <span
                    style={{
                      color: cashChange >= 0 ? 'var(--status-positive)' : 'var(--status-danger)',
                    }}
                  >
                    {formatRupiah(Math.abs(cashChange))}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Direct Credit / Installment Calculator */}
          {paymentMethod === 'CREDIT' && (
            <div
              style={{
                backgroundColor: 'var(--bg-subtle)',
                borderColor: 'var(--border-hairline)',
              }}
              className="p-3.5 rounded-xl border space-y-3"
            >
              <div className="flex items-center gap-2 text-xs font-bold">
                <Calculator
                  style={{ color: 'var(--accent-gold)' }}
                  className="w-4 h-4"
                  aria-hidden="true"
                />
                <span>Kalkulator Cicilan Piutang Langsung</span>
              </div>

              {!customerId && (
                <div
                  role="alert"
                  style={{
                    backgroundColor: 'var(--status-danger-soft)',
                    color: 'var(--status-danger)',
                  }}
                  className="flex items-start gap-2 p-2.5 rounded-lg text-xs font-medium"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    Pilih <strong>Pelanggan Terdaftar</strong> (atau klik tombol Baru) untuk
                    mengaktifkan pembayaran Kredit / Tempo.
                  </span>
                </div>
              )}

              <div className="space-y-2.5 text-xs">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="pos-dp" className="font-semibold">
                      Uang Muka / DP (Rp)
                    </label>
                    <div className="flex items-center gap-1">
                      {[0, 20, 30, 50].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          disabled={grandTotal <= 0}
                          onClick={() =>
                            setDpInput(String(Math.round((grandTotal * pct) / 100)))
                          }
                          style={{ color: 'var(--accent-primary-text)' }}
                          className="px-1.5 py-0.5 rounded hover:bg-[var(--bg-hover)] text-[11px] font-semibold disabled:opacity-40"
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      id="pos-dp"
                      type="number"
                      min={0}
                      value={dpInput}
                      onChange={(e) => setDpInput(e.target.value)}
                      className="w-full min-h-[38px] px-2.5 py-1.5 hig-input font-mono font-bold tabular-nums"
                    />
                    <select
                      aria-label="Metode pembayaran DP"
                      value={dpPaymentMethod}
                      onChange={(e) =>
                        setDpPaymentMethod(e.target.value as 'TRANSFER' | 'CASH' | 'QRIS')
                      }
                      className="w-full min-h-[38px] px-2.5 py-1.5 hig-input font-semibold"
                    >
                      <option value="TRANSFER">DP via Transfer</option>
                      <option value="CASH">DP via Tunai</option>
                      <option value="QRIS">DP via QRIS</option>
                    </select>
                  </div>
                </div>

                {(Number(dpInput) || 0) > 0 && dpPaymentMethod === 'TRANSFER' && (
                  <div>
                    <label htmlFor="pos-dp-ref" className="block font-semibold mb-1">
                      Ref. Transfer DP (Opsional)
                    </label>
                    <input
                      id="pos-dp-ref"
                      type="text"
                      value={transferRef}
                      onChange={(e) => setTransferRef(e.target.value)}
                      placeholder="Contoh: TF DP BCA a.n. Agen"
                      className="w-full min-h-[36px] px-2.5 py-1.5 hig-input font-mono"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label htmlFor="pos-freq" className="block font-semibold mb-1">
                      Skema Pembayaran
                    </label>
                    <select
                      id="pos-freq"
                      value={frequency}
                      onChange={(e) => setFrequency(e.target.value as InstallmentFrequency)}
                      className="w-full min-h-[38px] px-2.5 py-1.5 hig-input font-semibold"
                    >
                      <option value="FLEXIBLE">Tempo Fleksibel (Cicil Bebas)</option>
                      <option value="WEEKLY">Termin Mingguan</option>
                      <option value="MONTHLY">Termin Bulanan</option>
                    </select>
                  </div>

                  {frequency === 'FLEXIBLE' ? (
                    <div>
                      <label htmlFor="pos-tempo-days" className="block font-semibold mb-1">
                        Jatuh Tempo (Hari)
                      </label>
                      <div className="flex items-center gap-1">
                        {[14, 30, 45, 60].map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setTempoDays(d)}
                            style={
                              tempoDays === d
                                ? { backgroundColor: 'var(--cta-bg)', color: 'var(--cta-text)' }
                                : { backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }
                            }
                            className="flex-1 min-h-[38px] rounded-lg border border-[var(--border-hairline)] text-[11px] font-semibold"
                          >
                            {d}hr
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="pos-tenor" className="block font-semibold mb-1">
                        Tenor (Termin)
                      </label>
                      <input
                        id="pos-tenor"
                        type="number"
                        min={1}
                        max={60}
                        value={tenorCount}
                        onChange={(e) => setTenorCount(Math.max(1, Number(e.target.value) || 1))}
                        className="w-full min-h-[38px] px-2.5 py-1.5 hig-input font-mono font-bold tabular-nums"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="pos-rate" className="block font-semibold mb-1">
                    Bunga / Biaya Admin (%, default 0%)
                  </label>
                  <input
                    id="pos-rate"
                    type="number"
                    min={0}
                    step={0.5}
                    value={interestRate}
                    onChange={(e) => setInterestRate(Number(e.target.value) || 0)}
                    className="w-full min-h-[36px] px-2.5 py-1.5 hig-input font-mono font-bold tabular-nums"
                  />
                </div>
              </div>

              {creditPreview &&
                (creditPreview.ok ? (
                  <div
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-hairline)',
                    }}
                    className="rounded-lg border p-2.5 text-xs space-y-1 tabular-nums"
                  >
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Sisa Tagihan (Piutang):</span>
                      <span className="font-bold">
                        {formatRupiah(creditPreview.data.totalPayable)}
                      </span>
                    </div>
                    {frequency === 'FLEXIBLE' ? (
                      <div className="flex justify-between">
                        <span style={{ color: 'var(--text-secondary)' }}>
                          Batas Jatuh Tempo ({tempoDays} hari):
                        </span>
                        <span
                          style={{ color: 'var(--accent-primary-text)' }}
                          className="font-bold"
                        >
                          {formatDate(creditPreview.data.schedule[0].dueDate)}
                        </span>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between">
                          <span style={{ color: 'var(--text-secondary)' }}>
                            Estimasi Angsuran / Termin:
                          </span>
                          <span
                            style={{ color: 'var(--accent-primary-text)' }}
                            className="font-bold"
                          >
                            {formatRupiah(creditPreview.data.installmentBaseAmount)}
                          </span>
                        </div>
                        <div
                          style={{ color: 'var(--text-secondary)' }}
                          className="flex justify-between text-[11px]"
                        >
                          <span>Jatuh Tempo #1 s/d Terakhir:</span>
                          <span>
                            {formatDate(creditPreview.data.schedule[0].dueDate)} -{' '}
                            {formatDate(
                              creditPreview.data.schedule[creditPreview.data.schedule.length - 1]
                                .dueDate
                            )}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <p style={{ color: 'var(--status-danger)' }} className="text-xs font-semibold">
                    {creditPreview.error}
                  </p>
                ))}
            </div>
          )}

          <div>
            <label htmlFor="pos-notes" className="sr-only">
              Catatan transaksi
            </label>
            <input
              id="pos-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan transaksi (opsional)..."
              className="w-full min-h-[40px] px-3 py-2 hig-input text-xs"
            />
          </div>

          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleCheckout}
            style={
              canSubmit
                ? { backgroundColor: 'var(--accent-primary)', color: '#FFFFFF' }
                : { backgroundColor: 'var(--bg-subtle)', color: 'var(--text-secondary)' }
            }
            className="w-full min-h-[48px] py-3 rounded-xl font-bold text-sm transition-opacity hover:opacity-95"
          >
            Selesaikan Transaksi &amp; Terbitkan Invoice
          </button>
        </div>
      </div>

      {/* Quick Customer Modal (with 3 macOS dots) */}
      <Modal
        open={custModalOpen}
        onClose={() => setCustModalOpen(false)}
        title="Tambah Pelanggan Baru"
        subtitle="Langsung tersedia di kasir dan modul piutang"
      >
        <form onSubmit={handleQuickCreateCustomer} className="space-y-3.5 text-sm">
          <div>
            <label htmlFor="qc-name" className="block text-xs font-semibold mb-1">
              Nama Pelanggan *
            </label>
            <input
              id="qc-name"
              type="text"
              required
              value={newCustName}
              onChange={(e) => setNewCustName(e.target.value)}
              placeholder="Contoh: Toko Tembakau Makmur"
              className="w-full min-h-[44px] px-3 py-2 hig-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="qc-phone" className="block text-xs font-semibold mb-1">
                Nomor HP / WhatsApp *
              </label>
              <input
                id="qc-phone"
                type="text"
                required
                value={newCustPhone}
                onChange={(e) => setNewCustPhone(e.target.value)}
                placeholder="0812..."
                className="w-full min-h-[44px] px-3 py-2 hig-input"
              />
            </div>
            <div>
              <label htmlFor="qc-type" className="block text-xs font-semibold mb-1">
                Tipe Mitra
              </label>
              <select
                id="qc-type"
                value={newCustType}
                onChange={(e) => setNewCustType(e.target.value as CustomerType)}
                className="w-full min-h-[44px] px-3 py-2 hig-input"
              >
                <option value="RETAIL">Retail</option>
                <option value="GROSIR">Grosir</option>
                <option value="DISTRIBUTOR">Distributor</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="qc-address" className="block text-xs font-semibold mb-1">
              Alamat Pengiriman
            </label>
            <textarea
              id="qc-address"
              rows={2}
              value={newCustAddress}
              onChange={(e) => setNewCustAddress(e.target.value)}
              placeholder="Alamat lengkap untuk Invoice dan Surat Jalan..."
              className="w-full px-3 py-2 hig-input"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCustModalOpen(false)}
              className="min-h-[44px] px-4 py-2 hig-btn-secondary text-xs font-semibold"
            >
              Batal
            </button>
            <button
              type="submit"
              className="min-h-[44px] px-4 py-2 hig-btn-cta text-xs font-semibold"
            >
              Simpan &amp; Pilih
            </button>
          </div>
        </form>
      </Modal>

      {/* Post-Checkout Print & Action Modal (with 3 macOS dots) */}
      <Modal
        open={Boolean(completedResult)}
        onClose={() => setCompletedResult(null)}
        title="Transaksi Berhasil Disimpan"
        subtitle={
          completedResult
            ? `Invoice ${completedResult.transaction.invoiceNumber} · ${completedResult.transaction.customerName}`
            : undefined
        }
      >
        {completedResult && (
          <div className="space-y-4">
            <div
              style={{
                backgroundColor: 'var(--status-positive-soft)',
                color: 'var(--status-positive)',
              }}
              className="flex items-center gap-3 p-4 rounded-xl"
            >
              <CheckCircle2 className="w-7 h-7 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold">Total Transaksi</p>
                <p className="text-xl font-bold tabular-nums">
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
                className="min-h-[44px] flex items-center justify-center gap-2 py-2.5 px-3 hig-btn-secondary text-xs font-semibold"
              >
                <Printer
                  style={{ color: 'var(--accent-primary-text)' }}
                  className="w-4 h-4"
                  aria-hidden="true"
                />
                <span>Struk Thermal 58mm</span>
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
                className="min-h-[44px] flex items-center justify-center gap-2 py-2.5 px-3 hig-btn-secondary text-xs font-semibold"
              >
                <Printer
                  style={{ color: 'var(--accent-primary-text)' }}
                  className="w-4 h-4"
                  aria-hidden="true"
                />
                <span>Struk Thermal 80mm</span>
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
                className="min-h-[44px] flex items-center justify-center gap-2 py-2.5 px-3 hig-btn-secondary text-xs font-semibold"
              >
                <FileText className="w-4 h-4" aria-hidden="true" />
                <span>Invoice Resmi A4</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  openPrint({
                    kind: 'suratJalan',
                    transaction: completedResult.transaction,
                  })
                }
                className="min-h-[44px] flex items-center justify-center gap-2 py-2.5 px-3 hig-btn-secondary text-xs font-semibold"
              >
                <Truck
                  style={{ color: 'var(--accent-gold)' }}
                  className="w-4 h-4"
                  aria-hidden="true"
                />
                <span>Cetak Surat Jalan</span>
              </button>
            </div>

            <div className="flex gap-2">
              <a
                href={formatWhatsAppUrl(
                  completedResult.transaction.customerPhone,
                  `Halo ${completedResult.transaction.customerName}, berikut ringkasan nota ${completedResult.transaction.invoiceNumber} dari ${db.settings.companyName}:\nTotal: ${formatRupiah(
                    completedResult.transaction.total
                  )}\nMetode: ${completedResult.transaction.paymentMethod}\nTerima kasih!`
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 py-2.5 hig-btn-secondary text-xs font-semibold"
              >
                <MessageCircle className="w-4 h-4" aria-hidden="true" />
                <span>Kirim Nota WA</span>
              </a>
              <button
                type="button"
                onClick={() => setCompletedResult(null)}
                className="flex-1 min-h-[44px] py-2.5 hig-btn-cta text-xs font-semibold"
              >
                Mulai Transaksi Baru
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Hold Orders Modal */}
      <Modal
        open={holdListOpen}
        onClose={() => setHoldListOpen(false)}
        title="Pesanan Ditahan (Draft / Antrean)"
        subtitle="Klik Lanjutkan untuk memuat kembali item ke keranjang kasir"
      >
        {holdOrders.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }} className="text-xs py-6 text-center">
            Tidak ada pesanan yang sedang ditahan.
          </p>
        ) : (
          <div className="space-y-2 text-xs">
            {holdOrders.map((h) => (
              <div
                key={h.id}
                className="p-3 rounded-xl border border-[var(--border-hairline)] flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-bold truncate">{h.label}</p>
                  <p style={{ color: 'var(--text-secondary)' }} className="text-[11px]">
                    {formatDateTime(h.createdAt)} · {h.items.length} varian
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleResumeHold(h)}
                    className="min-h-[34px] px-3 py-1 hig-btn-cta font-semibold"
                  >
                    Lanjutkan
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteHoldOrder(h.id)}
                    style={{ color: 'var(--status-danger)' }}
                    className="min-h-[34px] px-2 py-1 rounded-lg hover:bg-[var(--status-danger-soft)]"
                    aria-label="Hapus pesanan ditahan"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Cashier Shift Modal */}
      <Modal
        open={Boolean(shiftModalOpen)}
        onClose={() => setShiftModalOpen(null)}
        title={shiftModalOpen === 'CLOSE' ? 'Tutup Shift Kasir & Rekonsiliasi' : 'Buka Shift Kasir'}
        subtitle={
          shiftModalOpen === 'CLOSE'
            ? 'Masukkan jumlah uang tunai fisik di laci kasir saat ini'
            : 'Catat modal uang kembalian awal di laci kasir'
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              if (shiftModalOpen === 'OPEN') {
                openCashierShift(Number(shiftCashInput) || 0, shiftNotes);
              } else {
                const closed = closeCashierShift(Number(shiftCashInput) || 0, shiftNotes);
                showToast(
                  'info',
                  `Shift ditutup. Ekspektasi ${formatRupiah(closed.expectedCash || 0)}, Selisih ${formatRupiah(
                    closed.variance || 0
                  )}.`
                );
              }
              setShiftModalOpen(null);
            } catch (err) {
              showToast('error', err instanceof Error ? err.message : 'Gagal memproses shift.');
            }
          }}
          className="space-y-3.5 text-sm"
        >
          <div>
            <label htmlFor="shf-cash" className="block text-xs font-semibold mb-1">
              {shiftModalOpen === 'CLOSE' ? 'Kas Tunai Fisik di Laci (Rp) *' : 'Modal Kas Awal (Rp) *'}
            </label>
            <input
              id="shf-cash"
              type="number"
              min={0}
              required
              value={shiftCashInput}
              onChange={(e) => setShiftCashInput(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 hig-input font-mono font-bold tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="shf-notes" className="block text-xs font-semibold mb-1">
              Catatan Shift (Opsional)
            </label>
            <input
              id="shf-notes"
              type="text"
              value={shiftNotes}
              onChange={(e) => setShiftNotes(e.target.value)}
              placeholder="Misal: Shift pagi / setoran ke brankas"
              className="w-full min-h-[42px] px-3 py-2 hig-input"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShiftModalOpen(null)}
              className="min-h-[44px] px-4 py-2 hig-btn-secondary text-xs font-semibold"
            >
              Batal
            </button>
            <button
              type="submit"
              className="min-h-[44px] px-4 py-2 hig-btn-cta text-xs font-semibold"
            >
              {shiftModalOpen === 'CLOSE' ? 'Tutup & Hitung Selisih' : 'Mulai Shift Kasir'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
    </div>
  );
};

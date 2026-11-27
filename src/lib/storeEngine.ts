import {
  buildInstallmentSchedule,
  getEffectiveUnitPrice,
  getPlanMetrics,
  previewCustomerFifoAllocation,
} from './calculations';
import { CsvProductRow } from './csv';
import { generateId, hashPassword, padSeq, roundQty, toLocalDateISO } from './format';
import { hasPermission } from './rbac';
import {
  AuditLog,
  CashierShift,
  CompanySettings,
  Customer,
  CustomerType,
  DatabaseState,
  ExpenseCategory,
  ExpenseRecord,
  HoldOrder,
  InstallmentFrequency,
  InstallmentPaymentRecord,
  PaymentMethod,
  PaymentPlan,
  Product,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderPayment,
  Role,
  ShippingStatus,
  StockMovement,
  Supplier,
  Transaction,
  TransactionItem,
  TransactionReturnItem,
  TransactionReturnRecord,
  User,
} from '../types/erp';

export interface CartItemInput {
  productId: string;
  qty: number;
}

export interface CreateSaleInput {
  customerId: string | null;
  items: CartItemInput[];
  paymentMethod: PaymentMethod;
  dpPaymentMethod?: 'CASH' | 'TRANSFER' | 'QRIS';
  transferReference?: string;
  amountPaid: number;
  discountAmount?: number;
  shippingCost?: number;
  taxEnabled?: boolean;
  notes?: string;
  creditConfig?: {
    downPayment: number;
    interestRate: number;
    frequency: InstallmentFrequency;
    tenorCount: number;
    tempoDays?: number;
    startDate?: string;
  };
}

export interface CreateSaleResult {
  state: DatabaseState;
  transaction: Transaction;
  paymentPlan?: PaymentPlan;
}

function appendAudit(
  state: DatabaseState,
  actor: User,
  entry: Omit<AuditLog, 'id' | 'timestamp' | 'userId' | 'userName' | 'userRole'>
): AuditLog[] {
  const newLog: AuditLog = {
    id: generateId('aud'),
    timestamp: new Date().toISOString(),
    userId: actor.id,
    userName: actor.name,
    userRole: actor.role,
    ...entry,
  };
  return [newLog, ...state.auditLogs];
}

export function createSale(
  state: DatabaseState,
  actor: User,
  input: CreateSaleInput
): CreateSaleResult {
  if (!hasPermission(actor.role, 'pos:checkout')) {
    throw new Error('Akses ditolak: Role Anda tidak memiliki izin melakukan transaksi kasir.');
  }
  if (!input.items || input.items.length === 0) {
    throw new Error('Keranjang belanja masih kosong.');
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const localToday = toLocalDateISO(now);
  const ym = localToday.slice(0, 7).replace('-', '');
  const productMap = new Map(state.products.map((p) => [p.id, p]));

  let customer: Customer | undefined;
  if (input.customerId) {
    customer = state.customers.find((c) => c.id === input.customerId);
    if (!customer) {
      throw new Error('Pelanggan terdaftar tidak ditemukan.');
    }
  }

  const mergedQty = new Map<string, number>();
  for (const item of input.items) {
    const cleanQty = roundQty(item.qty);
    if (!Number.isFinite(cleanQty) || cleanQty <= 0) {
      throw new Error('Kuantitas produk harus lebih besar dari 0.');
    }
    mergedQty.set(item.productId, roundQty((mergedQty.get(item.productId) || 0) + cleanQty));
  }

  const txItems: TransactionItem[] = [];
  const nextProducts = state.products.map((p) => ({ ...p }));
  const nextProductMap = new Map(nextProducts.map((p) => [p.id, p]));
  const newMovements: StockMovement[] = [];

  for (const [productId, qty] of mergedQty.entries()) {
    const prod = productMap.get(productId);
    if (!prod) {
      throw new Error('Salah satu produk di keranjang tidak ditemukan di master data.');
    }
    if (prod.stock <= 0) {
      throw new Error(`Stok "${prod.name}" sedang habis (0 ${prod.unit}).`);
    }
    if (qty > prod.stock) {
      throw new Error(
        `Stok "${prod.name}" tidak mencukupi (tersedia ${prod.stock} ${prod.unit}, diminta ${qty}).`
      );
    }

    const mutableProd = nextProductMap.get(productId)!;
    const prevStock = mutableProd.stock;
    mutableProd.stock = roundQty(prevStock - qty);
    mutableProd.updatedAt = nowIso;

    const unitSellPrice = getEffectiveUnitPrice(prod, customer?.type);
    txItems.push({
      productId: prod.id,
      sku: prod.sku,
      productName: prod.name,
      unit: prod.unit,
      qty,
      costPrice: prod.costPrice,
      sellPrice: unitSellPrice,
      subtotal: Math.round(unitSellPrice * qty),
    });
  }

  const rawSubtotal = txItems.reduce((sum, item) => sum + item.subtotal, 0);
  const discountAmount = Math.max(0, Math.round(input.discountAmount || 0));
  if (discountAmount > rawSubtotal) {
    throw new Error('Nominal diskon tidak boleh melebihi subtotal belanja.');
  }
  const subtotal = rawSubtotal - discountAmount;
  const shippingCost = Math.max(0, Math.round(input.shippingCost || 0));
  const taxEnabled = input.taxEnabled !== false;
  const taxRate = taxEnabled ? state.settings.taxRate : 0;
  const taxAmount = taxEnabled ? Math.round(subtotal * (taxRate / 100)) : 0;
  const total = subtotal + taxAmount + shippingCost;

  const prefix = state.settings.invoicePrefix.trim() || 'IDB';
  const invoiceNumber = `${prefix}-${ym}-${padSeq(state.settings.nextInvoiceSeq)}`;
  const suratJalanNumber = `SJ-${ym}-${padSeq(state.settings.nextSuratJalanSeq)}`;
  const txId = generateId('tx');

  let amountPaid = total;
  let changeAmount = 0;
  let paymentPlan: PaymentPlan | undefined;

  if (input.paymentMethod === 'CASH') {
    if (!Number.isFinite(input.amountPaid) || input.amountPaid < total) {
      throw new Error('Nominal pembayaran tunai kurang dari total tagihan.');
    }
    amountPaid = Math.round(input.amountPaid);
    changeAmount = amountPaid - total;
  } else if (input.paymentMethod === 'CREDIT') {
    if (!customer) {
      throw new Error('Pembayaran Kredit/Tempo wajib memilih Pelanggan Terdaftar.');
    }
    if (!input.creditConfig) {
      throw new Error('Konfigurasi cicilan kredit wajib diisi.');
    }
    const sched = buildInstallmentSchedule({
      principalAmount: total,
      downPayment: input.creditConfig.downPayment,
      interestRate: input.creditConfig.interestRate,
      frequency: input.creditConfig.frequency,
      tenorCount: input.creditConfig.tenorCount,
      tempoDays: input.creditConfig.tempoDays,
      startDate: input.creditConfig.startDate || localToday,
    });

    if (customer.creditLimit && customer.creditLimit > 0) {
      const existingDebt = state.paymentPlans
        .filter((pl) => pl.customerId === customer!.id && pl.status === 'ACTIVE')
        .reduce((sum, pl) => sum + getPlanMetrics(pl, localToday).remainingBalance, 0);
      if (existingDebt + sched.totalPayable > customer.creditLimit) {
        throw new Error(
          `Melebihi plafon kredit "${customer.name}" (Plafon Rp ${customer.creditLimit.toLocaleString(
            'id-ID'
          )}, piutang aktif Rp ${existingDebt.toLocaleString('id-ID')}).`
        );
      }
    }

    amountPaid = Math.round(input.creditConfig.downPayment);
    changeAmount = 0;
    const dpMethod = input.dpPaymentMethod || 'TRANSFER';
    const dpRef = input.transferReference?.trim() || undefined;

    paymentPlan = {
      id: generateId('pln'),
      planNumber: `KRD-${ym}-${padSeq(state.settings.nextPlanSeq)}`,
      transactionId: txId,
      invoiceNumber,
      customerId: customer.id,
      customerName: customer.name,
      createdAt: nowIso,
      principalAmount: total,
      downPayment: amountPaid,
      dpPaymentMethod: amountPaid > 0 ? dpMethod : undefined,
      dpTransferReference: amountPaid > 0 ? dpRef : undefined,
      interestRate: input.creditConfig.interestRate,
      interestAmount: sched.interestAmount,
      totalPayable: sched.totalPayable,
      frequency: input.creditConfig.frequency,
      tenorCount: input.creditConfig.frequency === 'FLEXIBLE' ? 1 : input.creditConfig.tenorCount,
      tempoDays:
        input.creditConfig.frequency === 'FLEXIBLE'
          ? input.creditConfig.tempoDays || 30
          : undefined,
      schedule: sched.schedule,
      payments: [],
      status: 'ACTIVE',
      notes: input.notes || `Skema tempo / cicilan untuk ${invoiceNumber}`,
    };
  }

  for (const item of txItems) {
    const updatedProd = nextProductMap.get(item.productId)!;
    newMovements.push({
      id: generateId('mov'),
      createdAt: nowIso,
      productId: item.productId,
      sku: item.sku,
      productName: item.productName,
      type: 'SALE',
      qtyDelta: -item.qty,
      previousStock: roundQty(updatedProd.stock + item.qty),
      newStock: updatedProd.stock,
      picId: actor.id,
      picName: actor.name,
      referenceId: invoiceNumber,
      notes: `Penjualan POS (${invoiceNumber})`,
    });
  }

  const transaction: Transaction = {
    id: txId,
    invoiceNumber,
    suratJalanNumber,
    createdAt: nowIso,
    customerId: customer ? customer.id : null,
    customerName: customer ? customer.name : 'Pelanggan Umum',
    customerPhone: customer?.phone,
    customerAddress: customer?.address,
    items: txItems,
    subtotal,
    discountAmount: discountAmount || undefined,
    shippingCost: shippingCost || undefined,
    taxEnabled,
    taxRate,
    taxAmount,
    total,
    paymentMethod: input.paymentMethod,
    dpPaymentMethod:
      input.paymentMethod === 'CREDIT' && amountPaid > 0
        ? input.dpPaymentMethod || 'TRANSFER'
        : undefined,
    transferReference: input.transferReference?.trim() || undefined,
    amountPaid,
    changeAmount,
    status: 'COMPLETED',
    shippingStatus: 'PENDING',
    cashierId: actor.id,
    cashierName: actor.name,
    paymentPlanId: paymentPlan?.id,
    notes: input.notes,
  };

  const nextSettings: CompanySettings = {
    ...state.settings,
    nextInvoiceSeq: state.settings.nextInvoiceSeq + 1,
    nextSuratJalanSeq: state.settings.nextSuratJalanSeq + 1,
    nextPlanSeq: paymentPlan ? state.settings.nextPlanSeq + 1 : state.settings.nextPlanSeq,
  };

  const nextState: DatabaseState = {
    ...state,
    products: nextProducts,
    transactions: [transaction, ...state.transactions],
    stockMovements: [...newMovements, ...state.stockMovements],
    paymentPlans: paymentPlan ? [paymentPlan, ...state.paymentPlans] : state.paymentPlans,
    settings: nextSettings,
    auditLogs: appendAudit(state, actor, {
      module: 'POS',
      action: 'CREATE_SALE',
      summary: `Transaksi ${invoiceNumber} (${input.paymentMethod}) total Rp ${total.toLocaleString('id-ID')} a.n. ${transaction.customerName}`,
      after: {
        invoiceNumber,
        total,
        paymentMethod: input.paymentMethod,
        itemCount: txItems.length,
      },
    }),
  };

  return { state: nextState, transaction, paymentPlan };
}

export function voidTransaction(
  state: DatabaseState,
  actor: User,
  txId: string,
  reason: string
): DatabaseState {
  if (!hasPermission(actor.role, 'transactions:void')) {
    throw new Error('Akses ditolak: Hanya Super Admin dan Manager yang dapat membatalkan transaksi.');
  }
  const cleanReason = reason.trim();
  if (!cleanReason) {
    throw new Error('Alasan pembatalan transaksi wajib diisi.');
  }

  const targetTx = state.transactions.find((t) => t.id === txId);
  if (!targetTx) {
    throw new Error('Transaksi tidak ditemukan.');
  }
  if (targetTx.status === 'VOIDED') {
    throw new Error('Transaksi ini sudah pernah dibatalkan (Void).');
  }

  const nowIso = new Date().toISOString();
  const nextProducts = state.products.map((p) => ({ ...p }));
  const prodMap = new Map(nextProducts.map((p) => [p.id, p]));
  const returnMovements: StockMovement[] = [];

  for (const item of targetTx.items) {
    const returnedQty = (targetTx.returns || []).reduce(
      (sum, ret) =>
        sum +
        ret.items
          .filter((ri) => ri.productId === item.productId)
          .reduce((a, b) => a + b.qty, 0),
      0
    );
    const qtyToRestore = roundQty(Math.max(0, item.qty - returnedQty));
    const prod = prodMap.get(item.productId);
    if (prod && qtyToRestore > 0) {
      const prev = prod.stock;
      prod.stock = roundQty(prev + qtyToRestore);
      prod.updatedAt = nowIso;
      returnMovements.push({
        id: generateId('mov'),
        createdAt: nowIso,
        productId: prod.id,
        sku: prod.sku,
        productName: prod.name,
        type: 'VOID_RETURN',
        qtyDelta: qtyToRestore,
        previousStock: prev,
        newStock: prod.stock,
        picId: actor.id,
        picName: actor.name,
        referenceId: targetTx.invoiceNumber,
        notes: `Pengembalian stok (Void ${targetTx.invoiceNumber}): ${cleanReason}`,
      });
    }
  }

  const nextTransactions = state.transactions.map((t) =>
    t.id === txId
      ? {
          ...t,
          status: 'VOIDED' as const,
          voidedAt: nowIso,
          voidedById: actor.id,
          voidedByName: actor.name,
          voidReason: cleanReason,
        }
      : t
  );

  const nextPlans = state.paymentPlans.map((pl) =>
    pl.id === targetTx.paymentPlanId || pl.transactionId === txId
      ? { ...pl, status: 'VOIDED' as const }
      : pl
  );

  return {
    ...state,
    products: nextProducts,
    transactions: nextTransactions,
    stockMovements: [...returnMovements, ...state.stockMovements],
    paymentPlans: nextPlans,
    auditLogs: appendAudit(state, actor, {
      module: 'TRANSAKSI',
      action: 'VOID_TRANSACTION',
      summary: `Membatalkan transaksi ${targetTx.invoiceNumber}, alasan: ${cleanReason}`,
      before: { status: targetTx.status, total: targetTx.total },
      after: { status: 'VOIDED', voidReason: cleanReason },
    }),
  };
}

export interface AdjustStockInput {
  productId: string;
  type: 'INBOUND' | 'OUTBOUND' | 'DAMAGED_EXPIRED';
  qty: number;
  notes: string;
  referenceId?: string;
}

export function adjustStock(
  state: DatabaseState,
  actor: User,
  input: AdjustStockInput
): DatabaseState {
  if (!hasPermission(actor.role, 'warehouse:adjust')) {
    throw new Error('Akses ditolak: Anda tidak memiliki izin menyesuaikan stok gudang.');
  }
  const cleanQty = roundQty(input.qty);
  if (!Number.isFinite(cleanQty) || cleanQty <= 0) {
    throw new Error('Jumlah penyesuaian stok harus lebih besar dari 0.');
  }
  const cleanNotes = input.notes.trim();
  if (!cleanNotes) {
    throw new Error('Catatan / alasan mutasi stok wajib diisi.');
  }

  const prod = state.products.find((p) => p.id === input.productId);
  if (!prod) {
    throw new Error('Produk tidak ditemukan.');
  }

  const delta = input.type === 'INBOUND' ? cleanQty : -cleanQty;
  const newStock = roundQty(prod.stock + delta);
  if (newStock < 0) {
    throw new Error(
      `Stok "${prod.name}" tidak mencukupi untuk dikurangi ${cleanQty} ${prod.unit} (sisa ${prod.stock}).`
    );
  }

  const nowIso = new Date().toISOString();
  const nextProducts = state.products.map((p) =>
    p.id === prod.id ? { ...p, stock: newStock, updatedAt: nowIso } : p
  );

  const movement: StockMovement = {
    id: generateId('mov'),
    createdAt: nowIso,
    productId: prod.id,
    sku: prod.sku,
    productName: prod.name,
    type: input.type,
    qtyDelta: delta,
    previousStock: prod.stock,
    newStock,
    picId: actor.id,
    picName: actor.name,
    referenceId: input.referenceId?.trim() || undefined,
    notes: cleanNotes,
  };

  return {
    ...state,
    products: nextProducts,
    stockMovements: [movement, ...state.stockMovements],
    auditLogs: appendAudit(state, actor, {
      module: 'GUDANG',
      action: `STOCK_${input.type}`,
      summary: `Mutasi ${input.type} (${delta > 0 ? `+${delta}` : delta} ${prod.unit}) pada ${prod.name}`,
      before: { stock: prod.stock },
      after: { stock: newStock, notes: cleanNotes },
    }),
  };
}

export interface RecordInstallmentPaymentInput {
  planId: string;
  amount: number;
  paymentMethod: 'CASH' | 'TRANSFER' | 'QRIS';
  transferReference?: string;
  notes?: string;
}

export function recordInstallmentPayment(
  state: DatabaseState,
  actor: User,
  input: RecordInstallmentPaymentInput
): { state: DatabaseState; payment: InstallmentPaymentRecord; plan: PaymentPlan } {
  if (!hasPermission(actor.role, 'receivables:pay')) {
    throw new Error('Akses ditolak: Anda tidak memiliki izin mencatat pembayaran cicilan.');
  }

  const plan = state.paymentPlans.find((p) => p.id === input.planId);
  if (!plan) {
    throw new Error('Rencana cicilan tidak ditemukan.');
  }
  if (plan.status === 'VOIDED') {
    throw new Error('Piutang ini sudah dibatalkan (Void).');
  }
  if (plan.status === 'PAID') {
    throw new Error('Piutang ini sudah lunas sepenuhnya.');
  }

  const metrics = getPlanMetrics(plan);
  const payAmount = Math.round(input.amount);
  if (!Number.isFinite(payAmount) || payAmount <= 0) {
    throw new Error('Nominal cicilan harus lebih besar dari Rp 0.');
  }
  if (payAmount > metrics.remainingBalance) {
    throw new Error(
      `Nominal pembayaran (${payAmount}) melebihi sisa kewajiban piutang (${metrics.remainingBalance}).`
    );
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const localToday = toLocalDateISO(now);
  const ym = localToday.slice(0, 7).replace('-', '');
  const receiptNumber = `KWT-${ym}-${padSeq(state.settings.nextReceiptSeq)}`;

  let remainingToAllocate = payAmount;
  const nextSchedule = plan.schedule.map((item) => {
    const unpaid = Math.max(0, item.amount - item.paidAmount);
    if (unpaid <= 0 || remainingToAllocate <= 0) return { ...item };
    const alloc = Math.min(unpaid, remainingToAllocate);
    remainingToAllocate -= alloc;
    const updatedPaid = item.paidAmount + alloc;
    return {
      ...item,
      paidAmount: updatedPaid,
      paidAt: updatedPaid >= item.amount ? nowIso : item.paidAt,
    };
  });

  const remainingBalanceAfter = Math.max(0, metrics.remainingBalance - payAmount);
  const paymentRecord: InstallmentPaymentRecord = {
    id: generateId('pay'),
    receiptNumber,
    paidAt: nowIso,
    amount: payAmount,
    paymentMethod: input.paymentMethod,
    receivedById: actor.id,
    receivedByName: actor.name,
    transferReference: input.transferReference?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    remainingBalanceAfter,
  };

  const updatedPlan: PaymentPlan = {
    ...plan,
    schedule: nextSchedule,
    payments: [paymentRecord, ...plan.payments],
    status: remainingBalanceAfter === 0 ? 'PAID' : 'ACTIVE',
  };

  const nextState: DatabaseState = {
    ...state,
    paymentPlans: state.paymentPlans.map((p) => (p.id === plan.id ? updatedPlan : p)),
    settings: {
      ...state.settings,
      nextReceiptSeq: state.settings.nextReceiptSeq + 1,
    },
    auditLogs: appendAudit(state, actor, {
      module: 'PIUTANG',
      action: 'RECORD_INSTALLMENT_PAYMENT',
      summary: `Terima cicilan ${receiptNumber} a.n. ${plan.customerName} sebesar Rp ${payAmount.toLocaleString('id-ID')}`,
      before: { remainingBalance: metrics.remainingBalance, status: plan.status },
      after: { remainingBalance: remainingBalanceAfter, status: updatedPlan.status },
    }),
  };

  return { state: nextState, payment: paymentRecord, plan: updatedPlan };
}

export interface CreateManualPlanInput {
  customerId: string;
  principalAmount: number;
  downPayment: number;
  dpPaymentMethod?: 'CASH' | 'TRANSFER' | 'QRIS';
  transferReference?: string;
  interestRate: number;
  frequency: InstallmentFrequency;
  tenorCount: number;
  tempoDays?: number;
  startDate?: string;
  invoiceNumber?: string;
  notes?: string;
}

export function createManualPaymentPlan(
  state: DatabaseState,
  actor: User,
  input: CreateManualPlanInput
): { state: DatabaseState; plan: PaymentPlan } {
  if (!hasPermission(actor.role, 'receivables:create')) {
    throw new Error('Akses ditolak: Anda tidak memiliki izin membuat skema piutang.');
  }
  const customer = state.customers.find((c) => c.id === input.customerId);
  if (!customer) {
    throw new Error('Pelanggan tidak ditemukan.');
  }

  const sched = buildInstallmentSchedule({
    principalAmount: input.principalAmount,
    downPayment: input.downPayment,
    interestRate: input.interestRate,
    frequency: input.frequency,
    tenorCount: input.tenorCount,
    tempoDays: input.tempoDays,
    startDate: input.startDate,
  });

  const now = new Date();
  const nowIso = now.toISOString();
  const localToday = toLocalDateISO(now);
  const ym = localToday.slice(0, 7).replace('-', '');
  const dpRounded = Math.round(input.downPayment);
  const plan: PaymentPlan = {
    id: generateId('pln'),
    planNumber: `KRD-${ym}-${padSeq(state.settings.nextPlanSeq)}`,
    invoiceNumber: input.invoiceNumber?.trim() || undefined,
    customerId: customer.id,
    customerName: customer.name,
    createdAt: nowIso,
    principalAmount: Math.round(input.principalAmount),
    downPayment: dpRounded,
    dpPaymentMethod: dpRounded > 0 ? input.dpPaymentMethod || 'TRANSFER' : undefined,
    dpTransferReference: dpRounded > 0 ? input.transferReference?.trim() || undefined : undefined,
    interestRate: input.interestRate,
    interestAmount: sched.interestAmount,
    totalPayable: sched.totalPayable,
    frequency: input.frequency,
    tenorCount: input.frequency === 'FLEXIBLE' ? 1 : input.tenorCount,
    tempoDays: input.frequency === 'FLEXIBLE' ? input.tempoDays || 30 : undefined,
    schedule: sched.schedule,
    payments: [],
    status: 'ACTIVE',
    notes: input.notes?.trim() || 'Skema cicilan piutang manual',
  };

  const nextState: DatabaseState = {
    ...state,
    paymentPlans: [plan, ...state.paymentPlans],
    settings: {
      ...state.settings,
      nextPlanSeq: state.settings.nextPlanSeq + 1,
    },
    auditLogs: appendAudit(state, actor, {
      module: 'PIUTANG',
      action: 'CREATE_PAYMENT_PLAN',
      summary: `Buat skema piutang ${plan.planNumber} untuk ${customer.name} (Total Tagihan Rp ${plan.totalPayable.toLocaleString('id-ID')})`,
      after: { planNumber: plan.planNumber, totalPayable: plan.totalPayable },
    }),
  };

  return { state: nextState, plan };
}

export interface UpsertProductInput {
  id?: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  costPrice: number;
  sellPrice: number;
  wholesalePrice?: number;
  distributorPrice?: number;
  stock: number;
  minStock: number;
  description?: string;
}

export function upsertProduct(
  state: DatabaseState,
  actor: User,
  input: UpsertProductInput
): DatabaseState {
  if (!hasPermission(actor.role, 'products:write')) {
    throw new Error('Akses ditolak: Anda tidak memiliki izin mengubah master produk.');
  }
  const sku = input.sku.trim().toUpperCase();
  const name = input.name.trim();
  if (!sku || !name) {
    throw new Error('SKU dan Nama Produk wajib diisi.');
  }
  if (
    !Number.isFinite(input.costPrice) ||
    input.costPrice < 0 ||
    !Number.isFinite(input.sellPrice) ||
    input.sellPrice <= 0
  ) {
    throw new Error('Harga Beli >= 0 dan Harga Jual harus > 0.');
  }
  const cleanStock = roundQty(input.stock);
  const cleanMinStock = roundQty(input.minStock);
  if (!Number.isFinite(cleanStock) || cleanStock < 0 || !Number.isFinite(cleanMinStock) || cleanMinStock < 0) {
    throw new Error('Stok dan batas stok minimum harus angka >= 0.');
  }
  const wholesalePrice =
    input.wholesalePrice && Number.isFinite(input.wholesalePrice) && input.wholesalePrice > 0
      ? Math.round(input.wholesalePrice)
      : undefined;
  const distributorPrice =
    input.distributorPrice && Number.isFinite(input.distributorPrice) && input.distributorPrice > 0
      ? Math.round(input.distributorPrice)
      : undefined;

  const duplicateSku = state.products.find((p) => p.sku.toUpperCase() === sku && p.id !== input.id);
  if (duplicateSku) {
    throw new Error(`Kode SKU "${sku}" sudah digunakan oleh produk lain.`);
  }

  const nowIso = new Date().toISOString();
  const existing = input.id ? state.products.find((p) => p.id === input.id) : undefined;

  if (existing) {
    const updated: Product = {
      ...existing,
      sku,
      name,
      category: input.category.trim() || 'Tembakau Flavour',
      unit: input.unit.trim() || 'Kg',
      costPrice: Math.round(input.costPrice),
      sellPrice: Math.round(input.sellPrice),
      wholesalePrice,
      distributorPrice,
      stock: cleanStock,
      minStock: cleanMinStock,
      description: input.description?.trim() || undefined,
      updatedAt: nowIso,
    };
    const stockDelta = roundQty(updated.stock - existing.stock);
    const nextMovements =
      stockDelta !== 0
        ? [
            {
              id: generateId('mov'),
              createdAt: nowIso,
              productId: updated.id,
              sku: updated.sku,
              productName: updated.name,
              type: stockDelta > 0 ? ('INBOUND' as const) : ('OUTBOUND' as const),
              qtyDelta: stockDelta,
              previousStock: existing.stock,
              newStock: updated.stock,
              picId: actor.id,
              picName: actor.name,
              referenceId: 'EDIT-MASTER',
              notes: 'Penyesuaian stok via edit master produk',
            },
            ...state.stockMovements,
          ]
        : state.stockMovements;
    return {
      ...state,
      products: state.products.map((p) => (p.id === existing.id ? updated : p)),
      stockMovements: nextMovements,
      auditLogs: appendAudit(state, actor, {
        module: 'MASTER_PRODUK',
        action: 'UPDATE_PRODUCT',
        summary: `Memperbarui produk ${updated.sku}: ${updated.name}`,
        before: { sellPrice: existing.sellPrice, costPrice: existing.costPrice, stock: existing.stock },
        after: { sellPrice: updated.sellPrice, costPrice: updated.costPrice, stock: updated.stock },
      }),
    };
  }

  const created: Product = {
    id: generateId('prd'),
    sku,
    name,
    category: input.category.trim() || 'Tembakau Flavour',
    unit: input.unit.trim() || 'Kg',
    costPrice: Math.round(input.costPrice),
    sellPrice: Math.round(input.sellPrice),
    wholesalePrice,
    distributorPrice,
    stock: cleanStock,
    minStock: cleanMinStock,
    description: input.description?.trim() || undefined,
    updatedAt: nowIso,
  };

  const movements =
    created.stock > 0
      ? [
          {
            id: generateId('mov'),
            createdAt: nowIso,
            productId: created.id,
            sku: created.sku,
            productName: created.name,
            type: 'INBOUND' as const,
            qtyDelta: created.stock,
            previousStock: 0,
            newStock: created.stock,
            picId: actor.id,
            picName: actor.name,
            referenceId: 'INIT-MASTER',
            notes: 'Stok awal saat tambah produk baru',
          },
          ...state.stockMovements,
        ]
      : state.stockMovements;

  return {
    ...state,
    products: [created, ...state.products],
    stockMovements: movements,
    auditLogs: appendAudit(state, actor, {
      module: 'MASTER_PRODUK',
      action: 'CREATE_PRODUCT',
      summary: `Menambahkan produk baru ${created.sku}: ${created.name}`,
      after: created,
    }),
  };
}

export function deleteProduct(state: DatabaseState, actor: User, productId: string): DatabaseState {
  if (!hasPermission(actor.role, 'products:delete')) {
    throw new Error('Akses ditolak: Hanya Super Admin yang dapat menghapus produk.');
  }
  const prod = state.products.find((p) => p.id === productId);
  if (!prod) {
    throw new Error('Produk tidak ditemukan.');
  }
  return {
    ...state,
    products: state.products.filter((p) => p.id !== productId),
    auditLogs: appendAudit(state, actor, {
      module: 'MASTER_PRODUK',
      action: 'DELETE_PRODUCT',
      summary: `Menghapus produk ${prod.sku}: ${prod.name}`,
      before: prod,
    }),
  };
}

export function importProductsBulk(
  state: DatabaseState,
  actor: User,
  rows: CsvProductRow[]
): { state: DatabaseState; inserted: number; updated: number } {
  if (!hasPermission(actor.role, 'products:write')) {
    throw new Error('Akses ditolak: Anda tidak memiliki izin import master produk.');
  }
  if (rows.length === 0) {
    throw new Error('Tidak ada baris valid untuk diimpor.');
  }

  const nowIso = new Date().toISOString();
  const nextProducts = state.products.map((p) => ({ ...p }));
  const skuMap = new Map(nextProducts.map((p, idx) => [p.sku.toUpperCase(), idx]));
  const importMovements: StockMovement[] = [];
  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    const key = row.sku.trim().toUpperCase();
    const cleanName = row.name.trim();
    const cleanStock = roundQty(row.stock);
    const cleanMinStock = roundQty(row.minStock);
    if (
      !key ||
      !cleanName ||
      !Number.isFinite(row.costPrice) ||
      row.costPrice < 0 ||
      !Number.isFinite(row.sellPrice) ||
      row.sellPrice <= 0 ||
      !Number.isFinite(cleanStock) ||
      cleanStock < 0 ||
      !Number.isFinite(cleanMinStock) ||
      cleanMinStock < 0
    ) {
      throw new Error(`Baris import CSV tidak valid untuk SKU "${row.sku || '-'}".`);
    }

    const existingIdx = skuMap.get(key);
    if (existingIdx !== undefined) {
      const prev = nextProducts[existingIdx];
      const nextProd: Product = {
        ...prev,
        name: cleanName,
        category: row.category.trim() || prev.category,
        unit: row.unit.trim() || prev.unit,
        costPrice: Math.round(row.costPrice),
        sellPrice: Math.round(row.sellPrice),
        stock: cleanStock,
        minStock: cleanMinStock,
        description: row.description?.trim() || undefined,
        updatedAt: nowIso,
      };
      nextProducts[existingIdx] = nextProd;
      const delta = roundQty(nextProd.stock - prev.stock);
      if (delta !== 0) {
        importMovements.push({
          id: generateId('mov'),
          createdAt: nowIso,
          productId: nextProd.id,
          sku: nextProd.sku,
          productName: nextProd.name,
          type: delta > 0 ? 'INBOUND' : 'OUTBOUND',
          qtyDelta: delta,
          previousStock: prev.stock,
          newStock: nextProd.stock,
          picId: actor.id,
          picName: actor.name,
          referenceId: 'IMPORT-CSV',
          notes: 'Penyesuaian stok melalui Import CSV',
        });
      }
      updated += 1;
    } else {
      const created: Product = {
        id: generateId('prd'),
        sku: key,
        name: cleanName,
        category: row.category.trim() || 'Tembakau Flavour',
        unit: row.unit.trim() || 'Kg',
        costPrice: Math.round(row.costPrice),
        sellPrice: Math.round(row.sellPrice),
        stock: cleanStock,
        minStock: cleanMinStock,
        description: row.description?.trim() || undefined,
        updatedAt: nowIso,
      };
      nextProducts.push(created);
      skuMap.set(key, nextProducts.length - 1);
      if (created.stock > 0) {
        importMovements.push({
          id: generateId('mov'),
          createdAt: nowIso,
          productId: created.id,
          sku: created.sku,
          productName: created.name,
          type: 'INBOUND',
          qtyDelta: created.stock,
          previousStock: 0,
          newStock: created.stock,
          picId: actor.id,
          picName: actor.name,
          referenceId: 'IMPORT-CSV',
          notes: 'Stok awal dari Import CSV',
        });
      }
      inserted += 1;
    }
  }

  const nextState: DatabaseState = {
    ...state,
    products: nextProducts,
    stockMovements: [...importMovements, ...state.stockMovements],
    auditLogs: appendAudit(state, actor, {
      module: 'MASTER_PRODUK',
      action: 'IMPORT_CSV',
      summary: `Import CSV produk: ${inserted} ditambah, ${updated} diperbarui`,
      after: { inserted, updated },
    }),
  };

  return { state: nextState, inserted, updated };
}

export interface UpsertCustomerInput {
  id?: string;
  name: string;
  phone: string;
  address: string;
  type: CustomerType;
  creditLimit?: number;
  notes?: string;
}

export function upsertCustomer(
  state: DatabaseState,
  actor: User,
  input: UpsertCustomerInput
): { state: DatabaseState; customer: Customer } {
  const isNew = !input.id;
  const allowed =
    hasPermission(actor.role, 'customers:write') ||
    (isNew && hasPermission(actor.role, 'pos:quick_customer'));
  if (!allowed) {
    throw new Error('Akses ditolak: Anda tidak memiliki izin mengelola data pelanggan.');
  }

  const name = input.name.trim();
  const phone = input.phone.trim();
  const address = input.address.trim();
  const creditLimit =
    input.creditLimit && Number.isFinite(input.creditLimit) && input.creditLimit > 0
      ? Math.round(input.creditLimit)
      : undefined;
  const notes = input.notes?.trim() || undefined;
  if (!name || !phone) {
    throw new Error('Nama pelanggan dan nomor kontak/WhatsApp wajib diisi.');
  }

  if (input.id) {
    const existing = state.customers.find((c) => c.id === input.id);
    if (!existing) throw new Error('Pelanggan tidak ditemukan.');
    const updated: Customer = {
      ...existing,
      name,
      phone,
      address,
      type: input.type,
      creditLimit,
      notes,
    };
    const nextState: DatabaseState = {
      ...state,
      customers: state.customers.map((c) => (c.id === existing.id ? updated : c)),
      auditLogs: appendAudit(state, actor, {
        module: 'MASTER_PELANGGAN',
        action: 'UPDATE_CUSTOMER',
        summary: `Memperbarui pelanggan ${updated.code}: ${updated.name}`,
        before: existing,
        after: updated,
      }),
    };
    return { state: nextState, customer: updated };
  }

  const maxNum = state.customers.reduce((max, c) => {
    const match = /^PLG-(\d+)$/i.exec(c.code.trim());
    const n = match ? Number(match[1]) : 0;
    return n > max ? n : max;
  }, 0);
  const nextNum = Math.max(maxNum, state.customers.length) + 1;
  const created: Customer = {
    id: generateId('cst'),
    code: `PLG-${String(nextNum).padStart(3, '0')}`,
    name,
    phone,
    address,
    type: input.type,
    creditLimit,
    notes,
    createdAt: new Date().toISOString(),
  };

  const nextState: DatabaseState = {
    ...state,
    customers: [created, ...state.customers],
    auditLogs: appendAudit(state, actor, {
      module: 'MASTER_PELANGGAN',
      action: 'CREATE_CUSTOMER',
      summary: `Menambahkan pelanggan baru ${created.code}: ${created.name} (${created.type})`,
      after: created,
    }),
  };
  return { state: nextState, customer: created };
}

export function deleteCustomer(state: DatabaseState, actor: User, customerId: string): DatabaseState {
  if (!hasPermission(actor.role, 'customers:delete')) {
    throw new Error('Akses ditolak: Hanya Super Admin yang dapat menghapus pelanggan.');
  }
  const cust = state.customers.find((c) => c.id === customerId);
  if (!cust) throw new Error('Pelanggan tidak ditemukan.');

  const hasActiveDebt = state.paymentPlans.some(
    (p) => p.customerId === customerId && p.status === 'ACTIVE'
  );
  if (hasActiveDebt) {
    throw new Error('Tidak dapat menghapus pelanggan yang masih memiliki piutang aktif.');
  }

  return {
    ...state,
    customers: state.customers.filter((c) => c.id !== customerId),
    auditLogs: appendAudit(state, actor, {
      module: 'MASTER_PELANGGAN',
      action: 'DELETE_CUSTOMER',
      summary: `Menghapus pelanggan ${cust.code}: ${cust.name}`,
      before: cust,
    }),
  };
}

export interface UpsertUserInput {
  id?: string;
  username: string;
  name: string;
  role: Role;
  password?: string;
  isActive: boolean;
}

export function upsertUser(state: DatabaseState, actor: User, input: UpsertUserInput): DatabaseState {
  if (!hasPermission(actor.role, 'users:manage')) {
    throw new Error('Akses ditolak: Hanya Super Admin yang dapat mengelola akun pengguna.');
  }
  const username = input.username.trim().toLowerCase();
  const name = input.name.trim();
  if (!username || !name) {
    throw new Error('Username dan Nama Lengkap wajib diisi.');
  }

  const dup = state.users.find((u) => u.username.toLowerCase() === username && u.id !== input.id);
  if (dup) {
    throw new Error(`Username "${username}" sudah terdaftar.`);
  }

  if (input.id) {
    const existing = state.users.find((u) => u.id === input.id);
    if (!existing) throw new Error('User tidak ditemukan.');

    const activeSuperAdmins = state.users.filter((u) => u.role === 'SUPER_ADMIN' && u.isActive);
    const removingLastSuperAdmin =
      existing.role === 'SUPER_ADMIN' &&
      existing.isActive &&
      (input.role !== 'SUPER_ADMIN' || !input.isActive) &&
      activeSuperAdmins.length <= 1;

    if (removingLastSuperAdmin) {
      throw new Error('Sistem harus memiliki minimal 1 Super Admin yang aktif.');
    }

    const updated: User = {
      ...existing,
      username,
      name,
      role: input.role,
      isActive: input.isActive,
      passwordHash: input.password?.trim()
        ? hashPassword(input.password.trim())
        : existing.passwordHash,
    };

    return {
      ...state,
      users: state.users.map((u) => (u.id === existing.id ? updated : u)),
      auditLogs: appendAudit(state, actor, {
        module: 'RBAC_USER',
        action: 'UPDATE_USER',
        summary: `Memperbarui akun ${updated.username} (Role: ${updated.role}, Aktif: ${updated.isActive})`,
        before: { role: existing.role, isActive: existing.isActive },
        after: { role: updated.role, isActive: updated.isActive },
      }),
    };
  }

  if (!input.password || input.password.trim().length < 4) {
    throw new Error('Password user baru minimal 4 karakter.');
  }

  const created: User = {
    id: generateId('usr'),
    username,
    name,
    role: input.role,
    passwordHash: hashPassword(input.password.trim()),
    isActive: input.isActive,
    createdAt: new Date().toISOString(),
  };

  return {
    ...state,
    users: [...state.users, created],
    auditLogs: appendAudit(state, actor, {
      module: 'RBAC_USER',
      action: 'CREATE_USER',
      summary: `Menambahkan user baru "${created.username}" (${created.role})`,
      after: { username: created.username, role: created.role },
    }),
  };
}

export function deleteUser(state: DatabaseState, actor: User, userId: string): DatabaseState {
  if (!hasPermission(actor.role, 'users:manage')) {
    throw new Error('Akses ditolak: Hanya Super Admin yang dapat menghapus pengguna.');
  }
  if (actor.id === userId) {
    throw new Error('Tidak dapat menghapus akun yang sedang Anda gunakan.');
  }
  const target = state.users.find((u) => u.id === userId);
  if (!target) throw new Error('Pengguna tidak ditemukan.');

  const activeSuperAdmins = state.users.filter((u) => u.role === 'SUPER_ADMIN' && u.isActive);
  if (target.role === 'SUPER_ADMIN' && target.isActive && activeSuperAdmins.length <= 1) {
    throw new Error('Tidak dapat menghapus satu-satunya Super Admin aktif.');
  }

  return {
    ...state,
    users: state.users.filter((u) => u.id !== userId),
    auditLogs: appendAudit(state, actor, {
      module: 'RBAC_USER',
      action: 'DELETE_USER',
      summary: `Menghapus user "${target.username}" (${target.role})`,
      before: { username: target.username, role: target.role },
    }),
  };
}

export function updateSettings(
  state: DatabaseState,
  actor: User,
  nextPartial: Partial<CompanySettings>
): DatabaseState {
  if (!hasPermission(actor.role, 'settings:write')) {
    throw new Error('Akses ditolak: Anda tidak memiliki izin mengubah pengaturan sistem.');
  }

  const merged: CompanySettings = {
    ...state.settings,
    ...nextPartial,
  };

  if (!merged.companyName.trim()) {
    throw new Error('Nama perusahaan wajib diisi.');
  }
  if (!merged.invoicePrefix.trim()) {
    throw new Error('Prefix nomor invoice wajib diisi.');
  }
  if (!Number.isFinite(merged.taxRate) || merged.taxRate < 0 || merged.taxRate > 100) {
    throw new Error('Tarif PPN harus antara 0% sampai 100%.');
  }
  if (!Number.isFinite(merged.dailyTarget) || merged.dailyTarget < 0) {
    throw new Error('Target omset harian tidak boleh negatif.');
  }

  return {
    ...state,
    settings: {
      ...merged,
      invoicePrefix: merged.invoicePrefix.trim().toUpperCase(),
    },
    auditLogs: appendAudit(state, actor, {
      module: 'PENGATURAN',
      action: 'UPDATE_SETTINGS',
      summary: `Memperbarui pengaturan perusahaan & pajak (PPN ${merged.taxRate}%, Prefix ${merged.invoicePrefix.toUpperCase()})`,
      before: state.settings,
      after: merged,
    }),
  };
}

const VALID_ROLES = new Set<Role>(['SUPER_ADMIN', 'MANAGER', 'KASIR', 'OWNER']);
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function hasDangerousKeys(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;
  if (Array.isArray(obj)) return obj.some(hasDangerousKeys);
  const rec = obj as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    if (DANGEROUS_KEYS.has(key)) return true;
    if (hasDangerousKeys(rec[key])) return true;
  }
  return false;
}

export function isValidDatabaseState(parsed: unknown): parsed is DatabaseState {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  if (hasDangerousKeys(parsed)) return false;
  const c = parsed as Partial<DatabaseState>;
  if (c.schemaVersion !== 1) return false;
  if (
    !Array.isArray(c.users) ||
    !Array.isArray(c.products) ||
    !Array.isArray(c.customers) ||
    !Array.isArray(c.transactions) ||
    !Array.isArray(c.stockMovements) ||
    !Array.isArray(c.paymentPlans) ||
    !Array.isArray(c.auditLogs)
  ) {
    return false;
  }

  const usersValid = c.users.every(
    (u) =>
      u &&
      typeof u === 'object' &&
      typeof u.id === 'string' &&
      u.id.length > 0 &&
      typeof u.username === 'string' &&
      u.username.length > 0 &&
      typeof u.name === 'string' &&
      typeof u.passwordHash === 'string' &&
      typeof u.isActive === 'boolean' &&
      VALID_ROLES.has(u.role)
  );
  if (!usersValid) return false;
  if (!c.users.some((u) => u.role === 'SUPER_ADMIN' && u.isActive)) return false;

  const productsValid = c.products.every(
    (p) =>
      p &&
      typeof p === 'object' &&
      typeof p.id === 'string' &&
      typeof p.sku === 'string' &&
      typeof p.name === 'string' &&
      typeof p.unit === 'string' &&
      typeof p.costPrice === 'number' &&
      Number.isFinite(p.costPrice) &&
      p.costPrice >= 0 &&
      typeof p.sellPrice === 'number' &&
      Number.isFinite(p.sellPrice) &&
      p.sellPrice > 0 &&
      typeof p.stock === 'number' &&
      Number.isFinite(p.stock) &&
      p.stock >= 0 &&
      typeof p.minStock === 'number' &&
      Number.isFinite(p.minStock) &&
      p.minStock >= 0
  );
  if (!productsValid) return false;

  const s = c.settings;
  if (
    !s ||
    typeof s !== 'object' ||
    typeof s.companyName !== 'string' ||
    !s.companyName.trim() ||
    typeof s.invoicePrefix !== 'string' ||
    !s.invoicePrefix.trim() ||
    typeof s.taxRate !== 'number' ||
    !Number.isFinite(s.taxRate) ||
    s.taxRate < 0 ||
    s.taxRate > 100 ||
    typeof s.dailyTarget !== 'number' ||
    !Number.isFinite(s.dailyTarget) ||
    s.dailyTarget < 0 ||
    !Number.isInteger(s.nextInvoiceSeq) ||
    s.nextInvoiceSeq < 1 ||
    !Number.isInteger(s.nextReceiptSeq) ||
    s.nextReceiptSeq < 1 ||
    !Number.isInteger(s.nextSuratJalanSeq) ||
    s.nextSuratJalanSeq < 1 ||
    !Number.isInteger(s.nextPlanSeq) ||
    s.nextPlanSeq < 1
  ) {
    return false;
  }

  return true;
}

export function validateAndRestoreBackup(
  actor: User,
  parsed: unknown
): DatabaseState {
  if (!hasPermission(actor.role, 'backup:manage')) {
    throw new Error('Akses ditolak: Hanya Super Admin yang dapat melakukan restore basis data.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('File JSON backup tidak valid.');
  }
  if (hasDangerousKeys(parsed)) {
    throw new Error('File backup ditolak karena mengandung properti berbahaya.');
  }

  const candidate = parsed as Partial<DatabaseState>;
  if (candidate.schemaVersion !== 1) {
    throw new Error('Versi skema backup tidak dikenali (schemaVersion harus 1).');
  }

  const requiredArrays: Array<keyof DatabaseState> = [
    'users',
    'products',
    'customers',
    'transactions',
    'stockMovements',
    'paymentPlans',
    'auditLogs',
  ];
  for (const key of requiredArrays) {
    if (!Array.isArray(candidate[key])) {
      throw new Error(`Struktur backup korup: properti "${key}" harus berupa array.`);
    }
  }
  if (!candidate.settings || typeof candidate.settings !== 'object') {
    throw new Error('Struktur backup korup: properti "settings" tidak ditemukan.');
  }
  const hasSuperAdmin = candidate.users!.some(
    (u) => u && u.role === 'SUPER_ADMIN' && u.isActive
  );
  if (!hasSuperAdmin) {
    throw new Error('File backup ditolak karena tidak memiliki Super Admin yang aktif.');
  }
  if (!isValidDatabaseState(candidate)) {
    throw new Error('File backup ditolak: terdapat data user, produk, atau pengaturan yang tidak valid.');
  }

  return {
    ...candidate,
    suppliers: Array.isArray(candidate.suppliers) ? candidate.suppliers : [],
    purchaseOrders: Array.isArray(candidate.purchaseOrders) ? candidate.purchaseOrders : [],
    expenses: Array.isArray(candidate.expenses) ? candidate.expenses : [],
    holdOrders: Array.isArray(candidate.holdOrders) ? candidate.holdOrders : [],
    shifts: Array.isArray(candidate.shifts) ? candidate.shifts : [],
    auditLogs: appendAudit(candidate, actor, {
      module: 'BASIS_DATA',
      action: 'RESTORE_BACKUP',
      summary: `Restore basis data JSON (${candidate.products.length} produk, ${candidate.transactions.length} transaksi)`,
    }),
  };
}

export interface BulkProductPatch {
  id: string;
  costPrice: number;
  sellPrice: number;
  wholesalePrice?: number;
  distributorPrice?: number;
  stock: number;
  minStock: number;
}

export function bulkUpdateProducts(
  state: DatabaseState,
  actor: User,
  patches: BulkProductPatch[]
): { state: DatabaseState; updatedCount: number } {
  if (!hasPermission(actor.role, 'products:write')) {
    throw new Error('Akses ditolak: Anda tidak memiliki izin edit massal produk.');
  }
  if (patches.length === 0) {
    throw new Error('Tidak ada perubahan produk untuk disimpan.');
  }

  const nowIso = new Date().toISOString();
  const patchMap = new Map(patches.map((p) => [p.id, p]));
  const movements: StockMovement[] = [];
  let updatedCount = 0;

  const nextProducts = state.products.map((prod) => {
    const patch = patchMap.get(prod.id);
    if (!patch) return prod;
    const cleanStock = roundQty(patch.stock);
    const cleanMin = roundQty(patch.minStock);
    if (
      !Number.isFinite(patch.costPrice) ||
      patch.costPrice < 0 ||
      !Number.isFinite(patch.sellPrice) ||
      patch.sellPrice <= 0 ||
      !Number.isFinite(cleanStock) ||
      cleanStock < 0 ||
      !Number.isFinite(cleanMin) ||
      cleanMin < 0
    ) {
      throw new Error(`Nilai tidak valid pada SKU ${prod.sku}.`);
    }

    const updated: Product = {
      ...prod,
      costPrice: Math.round(patch.costPrice),
      sellPrice: Math.round(patch.sellPrice),
      wholesalePrice:
        patch.wholesalePrice && patch.wholesalePrice > 0
          ? Math.round(patch.wholesalePrice)
          : undefined,
      distributorPrice:
        patch.distributorPrice && patch.distributorPrice > 0
          ? Math.round(patch.distributorPrice)
          : undefined,
      stock: cleanStock,
      minStock: cleanMin,
      updatedAt: nowIso,
    };

    const delta = roundQty(updated.stock - prod.stock);
    if (delta !== 0) {
      movements.push({
        id: generateId('mov'),
        createdAt: nowIso,
        productId: prod.id,
        sku: prod.sku,
        productName: prod.name,
        type: delta > 0 ? 'INBOUND' : 'OUTBOUND',
        qtyDelta: delta,
        previousStock: prod.stock,
        newStock: updated.stock,
        picId: actor.id,
        picName: actor.name,
        referenceId: 'OPNAME-MASSAL',
        notes: 'Update stok via Edit Massal / Stock Opname',
      });
    }
    updatedCount += 1;
    return updated;
  });

  if (updatedCount === 0) {
    throw new Error('Tidak ada produk cocok untuk diperbarui.');
  }

  return {
    updatedCount,
    state: {
      ...state,
      products: nextProducts,
      stockMovements: [...movements, ...state.stockMovements],
      auditLogs: appendAudit(state, actor, {
        module: 'MASTER_PRODUK',
        action: 'BULK_UPDATE_PRODUCTS',
        summary: `Edit massal / Stock Opname memperbarui ${updatedCount} SKU (${movements.length} perubahan stok)`,
        after: { updatedCount, stockAdjustments: movements.length },
      }),
    },
  };
}

export interface PartialReturnInput {
  txId: string;
  items: Array<{ productId: string; qty: number }>;
  reason: string;
}

export function createPartialReturn(
  state: DatabaseState,
  actor: User,
  input: PartialReturnInput
): DatabaseState {
  if (!hasPermission(actor.role, 'transactions:void')) {
    throw new Error('Akses ditolak: Hanya Super Admin dan Manager yang dapat memproses retur.');
  }
  const cleanReason = input.reason.trim();
  if (!cleanReason) {
    throw new Error('Alasan retur barang wajib diisi.');
  }
  const tx = state.transactions.find((t) => t.id === input.txId);
  if (!tx) throw new Error('Transaksi tidak ditemukan.');
  if (tx.status !== 'COMPLETED') {
    throw new Error('Hanya transaksi berstatus Selesai yang dapat diretur.');
  }

  const nowIso = new Date().toISOString();
  const nextProducts = state.products.map((p) => ({ ...p }));
  const prodMap = new Map(nextProducts.map((p) => [p.id, p]));
  const returnItems: TransactionReturnItem[] = [];
  const returnMovements: StockMovement[] = [];

  for (const reqItem of input.items) {
    const qty = roundQty(reqItem.qty);
    if (qty <= 0) continue;
    const txItem = tx.items.find((i) => i.productId === reqItem.productId);
    if (!txItem) throw new Error('Item retur tidak ada dalam nota ini.');
    const prevReturned = (tx.returns || []).reduce(
      (sum, r) =>
        sum + r.items.filter((ri) => ri.productId === reqItem.productId).reduce((a, b) => a + b.qty, 0),
      0
    );
    const maxReturnable = roundQty(txItem.qty - prevReturned);
    if (qty > maxReturnable) {
      throw new Error(
        `Qty retur "${txItem.productName}" melebihi sisa yang dapat diretur (${maxReturnable} ${txItem.unit}).`
      );
    }

    const refundSubtotal = Math.round(txItem.sellPrice * qty);
    returnItems.push({
      productId: txItem.productId,
      sku: txItem.sku,
      productName: txItem.productName,
      unit: txItem.unit,
      qty,
      unitPrice: txItem.sellPrice,
      refundSubtotal,
    });

    const prod = prodMap.get(txItem.productId);
    if (prod) {
      const prev = prod.stock;
      prod.stock = roundQty(prev + qty);
      prod.updatedAt = nowIso;
      returnMovements.push({
        id: generateId('mov'),
        createdAt: nowIso,
        productId: prod.id,
        sku: prod.sku,
        productName: prod.name,
        type: 'PARTIAL_RETURN',
        qtyDelta: qty,
        previousStock: prev,
        newStock: prod.stock,
        picId: actor.id,
        picName: actor.name,
        referenceId: tx.invoiceNumber,
        notes: `Retur sebagian (${tx.invoiceNumber}): ${cleanReason}`,
      });
    }
  }

  if (returnItems.length === 0) {
    throw new Error('Pilih minimal 1 item dengan kuantitas retur > 0.');
  }

  const rawRefund = returnItems.reduce((sum, i) => sum + i.refundSubtotal, 0);
  const refundTax = tx.taxRate > 0 ? Math.round(rawRefund * (tx.taxRate / 100)) : 0;
  const refundAmount = rawRefund + refundTax;

  const returnRecord: TransactionReturnRecord = {
    id: generateId('ret'),
    createdAt: nowIso,
    items: returnItems,
    refundAmount,
    reason: cleanReason,
    processedById: actor.id,
    processedByName: actor.name,
  };

  const nextTransactions = state.transactions.map((t) =>
    t.id === tx.id ? { ...t, returns: [returnRecord, ...(t.returns || [])] } : t
  );

  // If this was an active Credit transaction, automatically credit the return value against the customer's receivable
  let creditedPlanNumber: string | undefined;
  let creditedAmount = 0;
  const nextPlans = state.paymentPlans.map((pl) => {
    if ((pl.id !== tx.paymentPlanId && pl.transactionId !== tx.id) || pl.status !== 'ACTIVE') {
      return pl;
    }
    const metrics = getPlanMetrics(pl);
    const creditToApply = Math.min(refundAmount, metrics.remainingBalance);
    if (creditToApply <= 0) return pl;

    creditedPlanNumber = pl.planNumber;
    creditedAmount = creditToApply;

    // Deduct credit from unpaid installments starting from the last termin backward
    let pool = creditToApply;
    const revSchedule = [...pl.schedule].reverse().map((item) => {
      const unpaid = Math.max(0, item.amount - item.paidAmount);
      if (unpaid <= 0 || pool <= 0) return { ...item };
      const reduce = Math.min(unpaid, pool);
      pool -= reduce;
      return { ...item, amount: item.amount - reduce };
    });
    const nextSchedule = revSchedule.reverse();
    const nextTotalPayable = Math.max(0, pl.totalPayable - creditToApply);
    const nextRemaining = Math.max(0, metrics.remainingBalance - creditToApply);

    return {
      ...pl,
      totalPayable: nextTotalPayable,
      returnCreditAmount: (pl.returnCreditAmount || 0) + creditToApply,
      schedule: nextSchedule,
      status: nextRemaining === 0 ? ('PAID' as const) : ('ACTIVE' as const),
    };
  });

  return {
    ...state,
    products: nextProducts,
    transactions: nextTransactions,
    paymentPlans: nextPlans,
    stockMovements: [...returnMovements, ...state.stockMovements],
    auditLogs: appendAudit(state, actor, {
      module: 'TRANSAKSI',
      action: 'PARTIAL_RETURN',
      summary: `Retur sebagian ${tx.invoiceNumber} (${returnItems.length} item, nilai Rp ${refundAmount.toLocaleString(
        'id-ID'
      )}${
        creditedPlanNumber
          ? `, potong piutang ${creditedPlanNumber} Rp ${creditedAmount.toLocaleString('id-ID')}`
          : ''
      }): ${cleanReason}`,
      after: { refundAmount, creditedAmount, items: returnItems },
    }),
  };
}

export function updateTransactionShipping(
  state: DatabaseState,
  actor: User,
  input: {
    txId: string;
    shippingStatus: ShippingStatus;
    courierName?: string;
    trackingNumber?: string;
  }
): DatabaseState {
  if (!hasPermission(actor.role, 'transactions:shipping')) {
    throw new Error('Akses ditolak: Anda tidak memiliki izin memperbarui status pengiriman.');
  }
  const tx = state.transactions.find((t) => t.id === input.txId);
  if (!tx) throw new Error('Transaksi tidak ditemukan.');

  const courierName = input.courierName?.trim() || undefined;
  const trackingNumber = input.trackingNumber?.trim() || undefined;

  return {
    ...state,
    transactions: state.transactions.map((t) =>
      t.id === tx.id
        ? {
            ...t,
            shippingStatus: input.shippingStatus,
            courierName,
            trackingNumber,
          }
        : t
    ),
    auditLogs: appendAudit(state, actor, {
      module: 'TRANSAKSI',
      action: 'UPDATE_SHIPPING',
      summary: `Status pengiriman ${tx.invoiceNumber}: ${input.shippingStatus}${
        trackingNumber ? ` (Resi: ${trackingNumber})` : ''
      }`,
      before: { shippingStatus: tx.shippingStatus, trackingNumber: tx.trackingNumber },
      after: { shippingStatus: input.shippingStatus, courierName, trackingNumber },
    }),
  };
}

export interface UpsertSupplierInput {
  id?: string;
  name: string;
  phone: string;
  address: string;
  notes?: string;
}

export function upsertSupplier(
  state: DatabaseState,
  actor: User,
  input: UpsertSupplierInput
): { state: DatabaseState; supplier: Supplier } {
  if (!hasPermission(actor.role, 'purchases:manage')) {
    throw new Error('Akses ditolak: Anda tidak memiliki izin mengelola pemasok.');
  }
  const name = input.name.trim();
  const phone = input.phone.trim();
  if (!name || !phone) {
    throw new Error('Nama supplier dan nomor kontak wajib diisi.');
  }
  const suppliers = state.suppliers || [];
  if (input.id) {
    const existing = suppliers.find((s) => s.id === input.id);
    if (!existing) throw new Error('Supplier tidak ditemukan.');
    const updated: Supplier = {
      ...existing,
      name,
      phone,
      address: input.address.trim(),
      notes: input.notes?.trim() || undefined,
    };
    return {
      supplier: updated,
      state: {
        ...state,
        suppliers: suppliers.map((s) => (s.id === existing.id ? updated : s)),
        auditLogs: appendAudit(state, actor, {
          module: 'PEMBELIAN',
          action: 'UPDATE_SUPPLIER',
          summary: `Memperbarui supplier ${updated.code}: ${updated.name}`,
        }),
      },
    };
  }

  const maxNum = suppliers.reduce((max, s) => {
    const m = /^SUP-(\d+)$/i.exec(s.code.trim());
    const n = m ? Number(m[1]) : 0;
    return n > max ? n : max;
  }, 0);
  const created: Supplier = {
    id: generateId('sup'),
    code: `SUP-${String(Math.max(maxNum, suppliers.length) + 1).padStart(3, '0')}`,
    name,
    phone,
    address: input.address.trim(),
    notes: input.notes?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  return {
    supplier: created,
    state: {
      ...state,
      suppliers: [created, ...suppliers],
      auditLogs: appendAudit(state, actor, {
        module: 'PEMBELIAN',
        action: 'CREATE_SUPPLIER',
        summary: `Menambahkan supplier baru ${created.code}: ${created.name}`,
      }),
    },
  };
}

export function deleteSupplier(
  state: DatabaseState,
  actor: User,
  supplierId: string
): DatabaseState {
  if (!hasPermission(actor.role, 'purchases:manage')) {
    throw new Error('Akses ditolak.');
  }
  const suppliers = state.suppliers || [];
  const target = suppliers.find((s) => s.id === supplierId);
  if (!target) throw new Error('Supplier tidak ditemukan.');
  const hasUnpaid = (state.purchaseOrders || []).some(
    (po) => po.supplierId === supplierId && (po.status === 'UNPAID' || po.status === 'PARTIAL')
  );
  if (hasUnpaid) {
    throw new Error('Tidak dapat menghapus supplier yang masih memiliki hutang pembelian aktif.');
  }
  return {
    ...state,
    suppliers: suppliers.filter((s) => s.id !== supplierId),
    auditLogs: appendAudit(state, actor, {
      module: 'PEMBELIAN',
      action: 'DELETE_SUPPLIER',
      summary: `Menghapus supplier ${target.code}: ${target.name}`,
    }),
  };
}

export interface CreatePurchaseOrderInput {
  supplierId: string;
  items: Array<{ productId: string; qty: number; unitCost: number }>;
  paymentMethod: 'CASH' | 'TRANSFER' | 'CREDIT';
  paidAmount: number;
  notes?: string;
}

export function createPurchaseOrder(
  state: DatabaseState,
  actor: User,
  input: CreatePurchaseOrderInput
): { state: DatabaseState; po: PurchaseOrder } {
  if (!hasPermission(actor.role, 'purchases:manage')) {
    throw new Error('Akses ditolak: Anda tidak memiliki izin mencatat pembelian.');
  }
  const supplier = (state.suppliers || []).find((s) => s.id === input.supplierId);
  if (!supplier) throw new Error('Pemasok / supplier wajib dipilih.');
  if (!input.items || input.items.length === 0) {
    throw new Error('Minimal 1 produk wajib dimasukkan dalam PO pembelian.');
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const ym = toLocalDateISO(now).slice(0, 7).replace('-', '');
  const nextPoSeq = state.settings.nextPoSeq || 1;
  const poNumber = `PO-${ym}-${padSeq(nextPoSeq)}`;

  const nextProducts = state.products.map((p) => ({ ...p }));
  const prodMap = new Map(nextProducts.map((p) => [p.id, p]));
  const poItems: PurchaseOrderItem[] = [];
  const movements: StockMovement[] = [];

  for (const row of input.items) {
    const qty = roundQty(row.qty);
    const unitCost = Math.round(row.unitCost);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error('Kuantitas pembelian harus lebih besar dari 0.');
    }
    if (!Number.isFinite(unitCost) || unitCost <= 0) {
      throw new Error('Harga beli modal (HPP) harus lebih besar dari Rp 0.');
    }
    const prod = prodMap.get(row.productId);
    if (!prod) throw new Error('Salah satu produk pembelian tidak ditemukan.');

    const prevStock = prod.stock;
    const newStock = roundQty(prevStock + qty);
    // Weighted average HPP when previous stock > 0 & costPrice > 0, otherwise use latest purchase cost
    const nextCostPrice =
      prevStock > 0 && prod.costPrice > 0
        ? Math.round((prevStock * prod.costPrice + qty * unitCost) / newStock)
        : unitCost;

    prod.stock = newStock;
    prod.costPrice = nextCostPrice;
    prod.updatedAt = nowIso;

    poItems.push({
      productId: prod.id,
      sku: prod.sku,
      productName: prod.name,
      unit: prod.unit,
      qty,
      unitCost,
      subtotal: Math.round(qty * unitCost),
    });

    movements.push({
      id: generateId('mov'),
      createdAt: nowIso,
      productId: prod.id,
      sku: prod.sku,
      productName: prod.name,
      type: 'PURCHASE',
      qtyDelta: qty,
      previousStock: prevStock,
      newStock,
      picId: actor.id,
      picName: actor.name,
      referenceId: poNumber,
      notes: `Pembelian dari ${supplier.name} @ Rp ${unitCost.toLocaleString('id-ID')}/${prod.unit}`,
    });
  }

  const totalCost = poItems.reduce((sum, it) => sum + it.subtotal, 0);
  const paidAmount =
    input.paymentMethod === 'CREDIT'
      ? Math.max(0, Math.min(totalCost, Math.round(input.paidAmount || 0)))
      : totalCost;
  const status = paidAmount >= totalCost ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'UNPAID';

  const payments: PurchaseOrderPayment[] =
    paidAmount > 0
      ? [
          {
            id: generateId('popay'),
            paidAt: nowIso,
            amount: paidAmount,
            paymentMethod: input.paymentMethod === 'CREDIT' ? 'TRANSFER' : input.paymentMethod,
            paidById: actor.id,
            paidByName: actor.name,
            notes: input.paymentMethod === 'CREDIT' ? 'DP pembelian ke supplier' : 'Pembayaran lunas PO',
          },
        ]
      : [];

  const po: PurchaseOrder = {
    id: generateId('po'),
    poNumber,
    createdAt: nowIso,
    supplierId: supplier.id,
    supplierName: supplier.name,
    items: poItems,
    totalCost,
    paymentMethod: input.paymentMethod,
    paidAmount,
    status,
    payments,
    createdById: actor.id,
    createdByName: actor.name,
    notes: input.notes?.trim() || undefined,
  };

  return {
    po,
    state: {
      ...state,
      products: nextProducts,
      stockMovements: [...movements, ...state.stockMovements],
      purchaseOrders: [po, ...(state.purchaseOrders || [])],
      settings: {
        ...state.settings,
        nextPoSeq: nextPoSeq + 1,
      },
      auditLogs: appendAudit(state, actor, {
        module: 'PEMBELIAN',
        action: 'CREATE_PO',
        summary: `Pembelian ${poNumber} dari ${supplier.name} total Rp ${totalCost.toLocaleString(
          'id-ID'
        )} (${status})`,
        after: { poNumber, totalCost, paidAmount, status, itemCount: poItems.length },
      }),
    },
  };
}

export function payPurchaseOrder(
  state: DatabaseState,
  actor: User,
  input: {
    poId: string;
    amount: number;
    paymentMethod: 'CASH' | 'TRANSFER' | 'QRIS';
    notes?: string;
  }
): DatabaseState {
  if (!hasPermission(actor.role, 'purchases:manage')) {
    throw new Error('Akses ditolak.');
  }
  const orders = state.purchaseOrders || [];
  const po = orders.find((p) => p.id === input.poId);
  if (!po) throw new Error('PO Pembelian tidak ditemukan.');
  const remaining = Math.max(0, po.totalCost - po.paidAmount);
  const payAmt = Math.round(input.amount);
  if (!Number.isFinite(payAmt) || payAmt <= 0 || payAmt > remaining) {
    throw new Error(`Nominal pelunasan harus antara Rp 1 sampai Rp ${remaining.toLocaleString('id-ID')}.`);
  }

  const nextPaid = po.paidAmount + payAmt;
  const nextStatus = nextPaid >= po.totalCost ? 'PAID' : 'PARTIAL';
  const payment: PurchaseOrderPayment = {
    id: generateId('popay'),
    paidAt: new Date().toISOString(),
    amount: payAmt,
    paymentMethod: input.paymentMethod,
    paidById: actor.id,
    paidByName: actor.name,
    notes: input.notes?.trim() || undefined,
  };

  return {
    ...state,
    purchaseOrders: orders.map((p) =>
      p.id === po.id
        ? { ...p, paidAmount: nextPaid, status: nextStatus, payments: [payment, ...p.payments] }
        : p
    ),
    auditLogs: appendAudit(state, actor, {
      module: 'PEMBELIAN',
      action: 'PAY_PO',
      summary: `Bayar hutang ${po.poNumber} (${po.supplierName}) Rp ${payAmt.toLocaleString('id-ID')}`,
      before: { paidAmount: po.paidAmount, status: po.status },
      after: { paidAmount: nextPaid, status: nextStatus },
    }),
  };
}

export interface CreateExpenseInput {
  date: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  paymentMethod: 'CASH' | 'TRANSFER' | 'QRIS';
  notes?: string;
}

export function createExpense(
  state: DatabaseState,
  actor: User,
  input: CreateExpenseInput
): DatabaseState {
  if (!hasPermission(actor.role, 'expenses:manage')) {
    throw new Error('Akses ditolak: Anda tidak memiliki izin mencatat pengeluaran.');
  }
  const description = input.description.trim();
  const amount = Math.round(input.amount);
  if (!description) throw new Error('Deskripsi pengeluaran wajib diisi.');
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Nominal pengeluaran harus lebih besar dari Rp 0.');
  }

  const record: ExpenseRecord = {
    id: generateId('exp'),
    date: input.date || toLocalDateISO(),
    createdAt: new Date().toISOString(),
    category: input.category,
    description,
    amount,
    paymentMethod: input.paymentMethod,
    picId: actor.id,
    picName: actor.name,
    notes: input.notes?.trim() || undefined,
  };

  return {
    ...state,
    expenses: [record, ...(state.expenses || [])],
    auditLogs: appendAudit(state, actor, {
      module: 'KAS_PENGELUARAN',
      action: 'CREATE_EXPENSE',
      summary: `Catat pengeluaran [${record.category}] ${description}: Rp ${amount.toLocaleString('id-ID')}`,
      after: { category: record.category, amount, paymentMethod: record.paymentMethod },
    }),
  };
}

export function deleteExpense(
  state: DatabaseState,
  actor: User,
  expenseId: string
): DatabaseState {
  if (!hasPermission(actor.role, 'expenses:manage')) {
    throw new Error('Akses ditolak.');
  }
  const expenses = state.expenses || [];
  const target = expenses.find((e) => e.id === expenseId);
  if (!target) throw new Error('Catatan pengeluaran tidak ditemukan.');
  return {
    ...state,
    expenses: expenses.filter((e) => e.id !== expenseId),
    auditLogs: appendAudit(state, actor, {
      module: 'KAS_PENGELUARAN',
      action: 'DELETE_EXPENSE',
      summary: `Hapus catatan pengeluaran "${target.description}" (Rp ${target.amount.toLocaleString('id-ID')})`,
      before: target,
    }),
  };
}

export function saveHoldOrder(
  state: DatabaseState,
  actor: User,
  input: Omit<HoldOrder, 'id' | 'createdAt'>
): DatabaseState {
  if (!hasPermission(actor.role, 'pos:checkout')) {
    throw new Error('Akses ditolak.');
  }
  if (!input.items || input.items.length === 0) {
    throw new Error('Keranjang kosong tidak dapat ditahan.');
  }
  const hold: HoldOrder = {
    id: generateId('hld'),
    createdAt: new Date().toISOString(),
    label: input.label.trim() || `Pesanan ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`,
    customerId: input.customerId,
    items: input.items,
    discountAmount: input.discountAmount,
    shippingCost: input.shippingCost,
    taxEnabled: input.taxEnabled,
    notes: input.notes,
  };
  return {
    ...state,
    holdOrders: [hold, ...(state.holdOrders || [])],
  };
}

export function deleteHoldOrder(state: DatabaseState, holdId: string): DatabaseState {
  return {
    ...state,
    holdOrders: (state.holdOrders || []).filter((h) => h.id !== holdId),
  };
}

export function openCashierShift(
  state: DatabaseState,
  actor: User,
  openingCash: number,
  notes?: string
): DatabaseState {
  if (!hasPermission(actor.role, 'pos:checkout')) {
    throw new Error('Akses ditolak.');
  }
  const shifts = state.shifts || [];
  if (shifts.some((s) => s.status === 'OPEN')) {
    throw new Error('Masih ada shift kasir yang sedang aktif. Tutup shift terlebih dahulu.');
  }
  const cleanOpening = Math.round(openingCash);
  if (!Number.isFinite(cleanOpening) || cleanOpening < 0) {
    throw new Error('Modal kas awal tidak boleh negatif.');
  }
  const shift: CashierShift = {
    id: generateId('shf'),
    openedAt: new Date().toISOString(),
    cashierId: actor.id,
    cashierName: actor.name,
    openingCash: cleanOpening,
    status: 'OPEN',
    notes: notes?.trim() || undefined,
  };
  return {
    ...state,
    shifts: [shift, ...shifts],
    auditLogs: appendAudit(state, actor, {
      module: 'SHIFT_KASIR',
      action: 'OPEN_SHIFT',
      summary: `Buka shift kasir oleh ${actor.name} (Modal awal Rp ${cleanOpening.toLocaleString('id-ID')})`,
    }),
  };
}

export function closeCashierShift(
  state: DatabaseState,
  actor: User,
  actualCash: number,
  notes?: string
): { state: DatabaseState; closedShift: CashierShift } {
  if (!hasPermission(actor.role, 'pos:checkout')) {
    throw new Error('Akses ditolak.');
  }
  const shifts = state.shifts || [];
  const openShift = shifts.find((s) => s.status === 'OPEN');
  if (!openShift) throw new Error('Tidak ada shift kasir yang sedang aktif.');

  const cleanActual = Math.round(actualCash);
  if (!Number.isFinite(cleanActual) || cleanActual < 0) {
    throw new Error('Nominal kas fisik akhir tidak valid.');
  }

  const closedAt = new Date().toISOString();
  // Calculate expected cash in drawer since shift opened (only CASH sales and CASH DP, never TRANSFER DP)
  const cashSales = state.transactions
    .filter(
      (t) =>
        t.status === 'COMPLETED' &&
        t.createdAt >= openShift.openedAt &&
        (t.paymentMethod === 'CASH' ||
          (t.paymentMethod === 'CREDIT' &&
            t.amountPaid > 0 &&
            (t.dpPaymentMethod || 'CASH') === 'CASH'))
    )
    .reduce(
      (sum, t) => sum + (t.paymentMethod === 'CASH' ? t.total : t.amountPaid),
      0
    );
  const cashInstallments = state.paymentPlans
    .flatMap((pl) => pl.payments)
    .filter((p) => p.paymentMethod === 'CASH' && p.paidAt >= openShift.openedAt)
    .reduce((sum, p) => sum + p.amount, 0);
  const cashExpenses = (state.expenses || [])
    .filter((e) => e.paymentMethod === 'CASH' && e.createdAt >= openShift.openedAt)
    .reduce((sum, e) => sum + e.amount, 0);
  const cashPoPayments = (state.purchaseOrders || [])
    .flatMap((po) => po.payments)
    .filter((p) => p.paymentMethod === 'CASH' && p.paidAt >= openShift.openedAt)
    .reduce((sum, p) => sum + p.amount, 0);

  const expectedCash = openShift.openingCash + cashSales + cashInstallments - cashExpenses - cashPoPayments;
  const variance = cleanActual - expectedCash;

  const closedShift: CashierShift = {
    ...openShift,
    closedAt,
    expectedCash,
    actualCash: cleanActual,
    variance,
    status: 'CLOSED',
    notes: notes?.trim() || openShift.notes,
  };

  return {
    closedShift,
    state: {
      ...state,
      shifts: shifts.map((s) => (s.id === openShift.id ? closedShift : s)),
      auditLogs: appendAudit(state, actor, {
        module: 'SHIFT_KASIR',
        action: 'CLOSE_SHIFT',
        summary: `Tutup shift kasir: Kas fisik Rp ${cleanActual.toLocaleString(
          'id-ID'
        )}, Ekspektasi Rp ${expectedCash.toLocaleString('id-ID')} (Selisih Rp ${variance.toLocaleString(
          'id-ID'
        )})`,
        after: { expectedCash, actualCash: cleanActual, variance },
      }),
    },
  };
}

export interface CustomerBulkPaymentInput {
  customerId: string;
  amount: number;
  paymentMethod: 'CASH' | 'TRANSFER' | 'QRIS';
  transferReference?: string;
  notes?: string;
}

/**
 * Smart B2B FIFO settlement: allocates one lump-sum transfer across a customer's open invoices
 * (oldest due date / overdue first), generating official receipts per affected plan.
 */
export function recordCustomerBulkPayment(
  state: DatabaseState,
  actor: User,
  input: CustomerBulkPaymentInput
): {
  state: DatabaseState;
  settledCount: number;
  affectedPlans: PaymentPlan[];
  receipts: InstallmentPaymentRecord[];
} {
  if (!hasPermission(actor.role, 'receivables:pay')) {
    throw new Error('Akses ditolak: Anda tidak memiliki izin mencatat pembayaran piutang.');
  }
  const customer = state.customers.find((c) => c.id === input.customerId);
  if (!customer) throw new Error('Pelanggan tidak ditemukan.');

  const payAmount = Math.round(input.amount);
  if (!Number.isFinite(payAmount) || payAmount <= 0) {
    throw new Error('Nominal pembayaran harus lebih besar dari Rp 0.');
  }

  const today = toLocalDateISO();
  const preview = previewCustomerFifoAllocation(state.paymentPlans, customer.id, payAmount, today);
  if (preview.lines.length === 0) {
    throw new Error(`Pelanggan "${customer.name}" tidak memiliki piutang aktif.`);
  }
  if (payAmount > preview.totalRemaining) {
    throw new Error(
      `Nominal transfer (Rp ${payAmount.toLocaleString(
        'id-ID'
      )}) melebihi total piutang aktif "${customer.name}" (Rp ${preview.totalRemaining.toLocaleString(
        'id-ID'
      )}).`
    );
  }

  let runningState = state;
  const affectedPlans: PaymentPlan[] = [];
  const receipts: InstallmentPaymentRecord[] = [];
  let settledCount = 0;

  for (const line of preview.lines) {
    const res = recordInstallmentPayment(runningState, actor, {
      planId: line.plan.id,
      amount: line.allocatedAmount,
      paymentMethod: input.paymentMethod,
      transferReference: input.transferReference,
      notes: input.notes?.trim()
        ? `${input.notes.trim()} (Alokasi FIFO otomatis)`
        : 'Alokasi transfer bertahap FIFO otomatis',
    });
    runningState = res.state;
    affectedPlans.push(res.plan);
    receipts.push(res.payment);
    if (res.plan.status === 'PAID') settledCount += 1;
  }

  return {
    state: runningState,
    settledCount,
    affectedPlans,
    receipts,
  };
}

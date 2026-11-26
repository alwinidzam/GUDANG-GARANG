import { buildInstallmentSchedule, getPlanMetrics } from './calculations';
import { CsvProductRow } from './csv';
import { generateId, hashPassword, padSeq } from './format';
import { hasPermission } from './rbac';
import {
  AuditLog,
  CompanySettings,
  Customer,
  CustomerType,
  DatabaseState,
  InstallmentFrequency,
  InstallmentPaymentRecord,
  PaymentMethod,
  PaymentPlan,
  Product,
  Role,
  StockMovement,
  Transaction,
  TransactionItem,
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
  amountPaid: number;
  notes?: string;
  creditConfig?: {
    downPayment: number;
    interestRate: number;
    frequency: InstallmentFrequency;
    tenorCount: number;
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

  const nowIso = new Date().toISOString();
  const ym = nowIso.slice(0, 7).replace('-', '');
  const productMap = new Map(state.products.map((p) => [p.id, p]));

  const mergedQty = new Map<string, number>();
  for (const item of input.items) {
    if (!Number.isInteger(item.qty) || item.qty <= 0) {
      throw new Error('Kuantitas produk harus bilangan bulat minimal 1.');
    }
    mergedQty.set(item.productId, (mergedQty.get(item.productId) || 0) + item.qty);
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
    mutableProd.stock = prevStock - qty;
    mutableProd.updatedAt = nowIso;

    txItems.push({
      productId: prod.id,
      sku: prod.sku,
      productName: prod.name,
      unit: prod.unit,
      qty,
      costPrice: prod.costPrice,
      sellPrice: prod.sellPrice,
      subtotal: prod.sellPrice * qty,
    });
  }

  const subtotal = txItems.reduce((sum, item) => sum + item.subtotal, 0);
  const taxRate = state.settings.taxRate;
  const taxAmount = Math.round(subtotal * (taxRate / 100));
  const total = subtotal + taxAmount;

  let customer: Customer | undefined;
  if (input.customerId) {
    customer = state.customers.find((c) => c.id === input.customerId);
    if (!customer) {
      throw new Error('Pelanggan terdaftar tidak ditemukan.');
    }
  }

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
      startDate: input.creditConfig.startDate || nowIso.slice(0, 10),
    });

    amountPaid = Math.round(input.creditConfig.downPayment);
    changeAmount = 0;

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
      interestRate: input.creditConfig.interestRate,
      interestAmount: sched.interestAmount,
      totalPayable: sched.totalPayable,
      frequency: input.creditConfig.frequency,
      tenorCount: input.creditConfig.tenorCount,
      schedule: sched.schedule,
      payments: [],
      status: 'ACTIVE',
      notes: input.notes || `Skema cicilan untuk ${invoiceNumber}`,
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
      previousStock: updatedProd.stock + item.qty,
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
    taxRate,
    taxAmount,
    total,
    paymentMethod: input.paymentMethod,
    amountPaid,
    changeAmount,
    status: 'COMPLETED',
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
    const prod = prodMap.get(item.productId);
    if (prod) {
      const prev = prod.stock;
      prod.stock = prev + item.qty;
      prod.updatedAt = nowIso;
      returnMovements.push({
        id: generateId('mov'),
        createdAt: nowIso,
        productId: prod.id,
        sku: prod.sku,
        productName: prod.name,
        type: 'VOID_RETURN',
        qtyDelta: item.qty,
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
      summary: `Membatalkan transaksi ${targetTx.invoiceNumber} — Alasan: ${cleanReason}`,
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
  if (!Number.isInteger(input.qty) || input.qty <= 0) {
    throw new Error('Jumlah penyesuaian stok harus bilangan bulat lebih dari 0.');
  }
  const cleanNotes = input.notes.trim();
  if (!cleanNotes) {
    throw new Error('Catatan / alasan mutasi stok wajib diisi.');
  }

  const prod = state.products.find((p) => p.id === input.productId);
  if (!prod) {
    throw new Error('Produk tidak ditemukan.');
  }

  const delta = input.type === 'INBOUND' ? input.qty : -input.qty;
  const newStock = prod.stock + delta;
  if (newStock < 0) {
    throw new Error(
      `Stok "${prod.name}" tidak mencukupi untuk dikurangi ${input.qty} ${prod.unit} (sisa ${prod.stock}).`
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

  const nowIso = new Date().toISOString();
  const ym = nowIso.slice(0, 7).replace('-', '');
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
  interestRate: number;
  frequency: InstallmentFrequency;
  tenorCount: number;
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
    startDate: input.startDate,
  });

  const nowIso = new Date().toISOString();
  const ym = nowIso.slice(0, 7).replace('-', '');
  const plan: PaymentPlan = {
    id: generateId('pln'),
    planNumber: `KRD-${ym}-${padSeq(state.settings.nextPlanSeq)}`,
    invoiceNumber: input.invoiceNumber?.trim() || undefined,
    customerId: customer.id,
    customerName: customer.name,
    createdAt: nowIso,
    principalAmount: Math.round(input.principalAmount),
    downPayment: Math.round(input.downPayment),
    interestRate: input.interestRate,
    interestAmount: sched.interestAmount,
    totalPayable: sched.totalPayable,
    frequency: input.frequency,
    tenorCount: input.tenorCount,
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
  if (input.costPrice < 0 || input.sellPrice <= 0) {
    throw new Error('Harga Beli >= 0 dan Harga Jual harus > 0.');
  }
  if (!Number.isInteger(input.stock) || input.stock < 0 || !Number.isInteger(input.minStock) || input.minStock < 0) {
    throw new Error('Stok dan batas stok minimum harus bilangan bulat >= 0.');
  }

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
      category: input.category.trim() || 'Tembakau Rajangan',
      unit: input.unit.trim() || 'Pouch',
      costPrice: Math.round(input.costPrice),
      sellPrice: Math.round(input.sellPrice),
      stock: input.stock,
      minStock: input.minStock,
      description: input.description?.trim() || undefined,
      updatedAt: nowIso,
    };
    return {
      ...state,
      products: state.products.map((p) => (p.id === existing.id ? updated : p)),
      auditLogs: appendAudit(state, actor, {
        module: 'MASTER_PRODUK',
        action: 'UPDATE_PRODUCT',
        summary: `Memperbarui produk ${updated.sku} — ${updated.name}`,
        before: { sellPrice: existing.sellPrice, costPrice: existing.costPrice, stock: existing.stock },
        after: { sellPrice: updated.sellPrice, costPrice: updated.costPrice, stock: updated.stock },
      }),
    };
  }

  const created: Product = {
    id: generateId('prd'),
    sku,
    name,
    category: input.category.trim() || 'Tembakau Rajangan',
    unit: input.unit.trim() || 'Pouch',
    costPrice: Math.round(input.costPrice),
    sellPrice: Math.round(input.sellPrice),
    stock: input.stock,
    minStock: input.minStock,
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
      summary: `Menambahkan produk baru ${created.sku} — ${created.name}`,
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
      summary: `Menghapus produk ${prod.sku} — ${prod.name}`,
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
  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    const key = row.sku.toUpperCase();
    const existingIdx = skuMap.get(key);
    if (existingIdx !== undefined) {
      nextProducts[existingIdx] = {
        ...nextProducts[existingIdx],
        name: row.name,
        category: row.category,
        unit: row.unit,
        costPrice: row.costPrice,
        sellPrice: row.sellPrice,
        stock: row.stock,
        minStock: row.minStock,
        description: row.description,
        updatedAt: nowIso,
      };
      updated += 1;
    } else {
      const created: Product = {
        id: generateId('prd'),
        sku: key,
        name: row.name,
        category: row.category,
        unit: row.unit,
        costPrice: row.costPrice,
        sellPrice: row.sellPrice,
        stock: row.stock,
        minStock: row.minStock,
        description: row.description,
        updatedAt: nowIso,
      };
      nextProducts.unshift(created);
      skuMap.set(key, 0);
      inserted += 1;
    }
  }

  const nextState: DatabaseState = {
    ...state,
    products: nextProducts,
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
  if (!name || !phone) {
    throw new Error('Nama pelanggan dan nomor kontak/WhatsApp wajib diisi.');
  }

  if (input.id) {
    const existing = state.customers.find((c) => c.id === input.id);
    if (!existing) throw new Error('Pelanggan tidak ditemukan.');
    const updated: Customer = { ...existing, name, phone, address, type: input.type };
    const nextState: DatabaseState = {
      ...state,
      customers: state.customers.map((c) => (c.id === existing.id ? updated : c)),
      auditLogs: appendAudit(state, actor, {
        module: 'MASTER_PELANGGAN',
        action: 'UPDATE_CUSTOMER',
        summary: `Memperbarui pelanggan ${updated.code} — ${updated.name}`,
        before: existing,
        after: updated,
      }),
    };
    return { state: nextState, customer: updated };
  }

  const nextNum = state.customers.length + 1;
  const created: Customer = {
    id: generateId('cst'),
    code: `PLG-${String(nextNum).padStart(3, '0')}`,
    name,
    phone,
    address,
    type: input.type,
    createdAt: new Date().toISOString(),
  };

  const nextState: DatabaseState = {
    ...state,
    customers: [created, ...state.customers],
    auditLogs: appendAudit(state, actor, {
      module: 'MASTER_PELANGGAN',
      action: 'CREATE_CUSTOMER',
      summary: `Menambahkan pelanggan baru ${created.code} — ${created.name} (${created.type})`,
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
      summary: `Menghapus pelanggan ${cust.code} — ${cust.name}`,
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

export function validateAndRestoreBackup(
  actor: User,
  parsed: unknown
): DatabaseState {
  if (!hasPermission(actor.role, 'backup:manage')) {
    throw new Error('Akses ditolak: Hanya Super Admin yang dapat melakukan restore basis data.');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('File JSON backup tidak valid.');
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

  const restored = candidate as DatabaseState;
  return {
    ...restored,
    auditLogs: appendAudit(restored, actor, {
      module: 'BASIS_DATA',
      action: 'RESTORE_BACKUP',
      summary: `Restore basis data JSON (${restored.products.length} produk, ${restored.transactions.length} transaksi)`,
    }),
  };
}

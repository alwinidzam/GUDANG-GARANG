import { describe, expect, it } from 'vitest';
import {
  buildInstallmentSchedule,
  calcInventoryValuation,
  calcMarginPercent,
  calcReceivablesAging,
  getInstallmentStatus,
  getPlanMetrics,
  previewCustomerFifoAllocation,
} from '../calculations';
import { escapeCsvCell, parseCsv, parseProductsCsv, toCsv } from '../csv';
import { terbilangRupiah } from '../format';
import { getDefaultViewForRole, hasPermission } from '../rbac';
import { createEmptyDatabase, createInitialDatabase, createSeedData } from '../seedData';
import {
  adjustStock,
  bulkUpdateProducts,
  closeCashierShift,
  createExpense,
  createPartialReturn,
  createPurchaseOrder,
  createSale,
  deleteCustomer,
  deleteUser,
  importProductsBulk,
  isValidDatabaseState,
  openCashierShift,
  payPurchaseOrder,
  recordCustomerBulkPayment,
  recordInstallmentPayment,
  upsertCustomer,
  upsertProduct,
  upsertSupplier,
  upsertUser,
  validateAndRestoreBackup,
  voidTransaction,
} from '../storeEngine';
import { Role } from '../../types/erp';

describe('Format & Calculations', () => {
  it('converts Rupiah amounts accurately into Indonesian Terbilang', () => {
    expect(terbilangRupiah(0)).toBe('Nol Rupiah');
    expect(terbilangRupiah(1500)).toBe('Seribu Lima Ratus Rupiah');
    expect(terbilangRupiah(1_500_000)).toBe('Satu Juta Lima Ratus Ribu Rupiah');
    expect(terbilangRupiah(12_345_000)).toBe(
      'Dua Belas Juta Tiga Ratus Empat Puluh Lima Ribu Rupiah'
    );
  });

  it('calculates margin percentage and inventory valuation correctly', () => {
    expect(calcMarginPercent(30000, 50000)).toBe(40);
    const seed = createSeedData(new Date('2026-11-26T10:00:00'));
    const val = calcInventoryValuation(seed.products);
    expect(val.skuCount).toBe(seed.products.length);
    expect(val.totalHppValue).toBeGreaterThan(0);
    expect(val.totalRetailValue).toBeGreaterThan(val.totalHppValue);
    expect(val.lowStockCount).toBeGreaterThan(0);
  });

  it('builds exact installment schedules with month-end clamping and remainder precision', () => {
    const res = buildInstallmentSchedule({
      principalAmount: 1_000_000,
      downPayment: 250_000,
      interestRate: 4,
      frequency: 'MONTHLY',
      tenorCount: 3,
      startDate: '2026-01-31',
    });

    expect(res.financedAmount).toBe(750_000);
    expect(res.interestAmount).toBe(30_000);
    expect(res.totalPayable).toBe(780_000);
    expect(res.schedule).toHaveLength(3);
    expect(res.schedule[0].dueDate).toBe('2026-02-28');
    expect(res.schedule[1].dueDate).toBe('2026-03-31');
    const sum = res.schedule.reduce((a, it) => a + it.amount, 0);
    expect(sum).toBe(res.totalPayable);

    // Uneven split pushes remainder to final termin
    const uneven = buildInstallmentSchedule({
      principalAmount: 100_000,
      downPayment: 0,
      interestRate: 0,
      frequency: 'WEEKLY',
      tenorCount: 3,
      startDate: '2026-11-01',
    });
    expect(uneven.schedule[0].dueDate).toBe('2026-11-08');
    expect(uneven.schedule.reduce((a, b) => a + b.amount, 0)).toBe(100_000);
    expect(uneven.schedule[2].amount).toBe(33334);
  });

  it('detects overdue installments and exact overdue days', () => {
    const status = getInstallmentStatus(
      { index: 1, dueDate: '2026-11-10', amount: 500_000, paidAmount: 0 },
      '2026-11-26'
    );
    expect(status.status).toBe('OVERDUE');
    expect(status.overdueDays).toBe(16);
  });
});

describe('CSV Parser & Product Import', () => {
  it('handles quoted commas and parses product CSV safely', () => {
    const csv = toCsv(
      ['sku', 'name', 'category', 'unit', 'costPrice', 'sellPrice', 'stock', 'minStock'],
      [
        ['IDB-TST-01', 'Tembakau, Gayor "Halus"', 'Tembakau Rajangan', 'Pouch', 30000, 45000, 20, 5],
        ['BAD-ROW', '', 'Cat', 'Pcs', 1000, 2000, 5, 1],
      ]
    );
    const parsedRows = parseCsv(csv);
    expect(parsedRows).toHaveLength(3);
    expect(parsedRows[1][1]).toBe('Tembakau, Gayor "Halus"');

    const prodResult = parseProductsCsv(csv);
    expect(prodResult.valid).toHaveLength(1);
    expect(prodResult.valid[0].sku).toBe('IDB-TST-01');
    expect(prodResult.errors).toHaveLength(1);
  });
});

describe('RBAC Permission Matrix', () => {
  it('enforces strict separation across Super Admin, Manager, Kasir, and Owner', () => {
    expect(getDefaultViewForRole('KASIR')).toBe('pos');
    expect(getDefaultViewForRole('OWNER')).toBe('dashboard');

    expect(hasPermission('KASIR', 'pos:checkout')).toBe(true);
    expect(hasPermission('KASIR', 'transactions:void')).toBe(false);
    expect(hasPermission('KASIR', 'warehouse:adjust')).toBe(false);
    expect(hasPermission('KASIR', 'products:view_cost')).toBe(false);

    expect(hasPermission('MANAGER', 'transactions:void')).toBe(true);
    expect(hasPermission('MANAGER', 'warehouse:adjust')).toBe(true);
    expect(hasPermission('MANAGER', 'users:manage')).toBe(false);
    expect(hasPermission('MANAGER', 'backup:manage')).toBe(false);

    expect(hasPermission('OWNER', 'view:reports')).toBe(true);
    expect(hasPermission('OWNER', 'view:audit')).toBe(true);
    expect(hasPermission('OWNER', 'pos:checkout')).toBe(false);
    expect(hasPermission('OWNER', 'transactions:void')).toBe(false);

    expect(hasPermission('SUPER_ADMIN', 'users:manage')).toBe(true);
    expect(hasPermission('SUPER_ADMIN', 'backup:manage')).toBe(true);
  });
});

describe('Store Engine Transactional Integrity', () => {
  it('deducts stock on POS sale, prevents overselling, and restores stock on Manager void', () => {
    const seed = createSeedData(new Date('2026-11-26T10:00:00'));
    const kasir = seed.users.find((u) => u.role === 'KASIR')!;
    const manager = seed.users.find((u) => u.role === 'MANAGER')!;
    const targetProd = seed.products[0];
    const initialStock = targetProd.stock;

    // Oversell should fail cleanly
    expect(() =>
      createSale(seed, kasir, {
        customerId: null,
        items: [{ productId: targetProd.id, qty: initialStock + 10 }],
        paymentMethod: 'CASH',
        amountPaid: 999_999_999,
      })
    ).toThrow(/tidak mencukupi/i);

    // Valid sale
    const subtotal = targetProd.sellPrice * 3;
    const tax = Math.round(subtotal * (seed.settings.taxRate / 100));
    const total = subtotal + tax;
    const saleRes = createSale(seed, kasir, {
      customerId: null,
      items: [{ productId: targetProd.id, qty: 3 }],
      paymentMethod: 'CASH',
      amountPaid: total + 5000,
    });

    expect(saleRes.transaction.changeAmount).toBe(5000);
    expect(
      saleRes.state.products.find((p) => p.id === targetProd.id)!.stock
    ).toBe(initialStock - 3);

    // Kasir cannot void
    expect(() =>
      voidTransaction(saleRes.state, kasir, saleRes.transaction.id, 'Coba void')
    ).toThrow(/Akses ditolak/i);

    // Manager voids & restores stock
    const afterVoid = voidTransaction(
      saleRes.state,
      manager,
      saleRes.transaction.id,
      'Pelanggan membatalkan pesanan'
    );
    expect(afterVoid.products.find((p) => p.id === targetProd.id)!.stock).toBe(initialStock);
    expect(
      afterVoid.transactions.find((t) => t.id === saleRes.transaction.id)!.status
    ).toBe('VOIDED');
  });

  it('creates credit payment plan from POS, records partial & full payments, and marks PAID', () => {
    const seed = createSeedData(new Date('2026-11-26T10:00:00'));
    const kasir = seed.users.find((u) => u.role === 'KASIR')!;
    const manager = seed.users.find((u) => u.role === 'MANAGER')!;
    const prod = seed.products[6]; // Bal 5kg
    const customer = seed.customers[0];

    const res = createSale(seed, kasir, {
      customerId: customer.id,
      items: [{ productId: prod.id, qty: 1 }],
      paymentMethod: 'CREDIT',
      amountPaid: 500_000,
      creditConfig: {
        downPayment: 500_000,
        interestRate: 0,
        frequency: 'WEEKLY',
        tenorCount: 2,
        startDate: '2026-11-26',
      },
    });

    expect(res.paymentPlan).toBeDefined();
    const plan = res.paymentPlan!;
    const metricsBefore = getPlanMetrics(plan, '2026-11-26');
    expect(metricsBefore.remainingBalance).toBe(plan.totalPayable);

    // Partial payment
    const half = Math.floor(metricsBefore.remainingBalance / 2);
    const pay1 = recordInstallmentPayment(res.state, manager, {
      planId: plan.id,
      amount: half,
      paymentMethod: 'TRANSFER',
    });
    expect(pay1.plan.status).toBe('ACTIVE');
    expect(pay1.payment.receiptNumber).toMatch(/^KWT-/);

    // Final settlement
    const rem = getPlanMetrics(pay1.plan, '2026-11-26').remainingBalance;
    const pay2 = recordInstallmentPayment(pay1.state, manager, {
      planId: plan.id,
      amount: rem,
      paymentMethod: 'CASH',
    });
    expect(pay2.plan.status).toBe('PAID');
    expect(pay2.payment.remainingBalanceAfter).toBe(0);
  });

  it('prevents negative stock on warehouse adjustment and protects last Super Admin', () => {
    const seed = createSeedData(new Date('2026-11-26T10:00:00'));
    const admin = seed.users.find((u) => u.role === 'SUPER_ADMIN')!;
    const prod = seed.products[4]; // stock 8

    expect(() =>
      adjustStock(seed, admin, {
        productId: prod.id,
        type: 'DAMAGED_EXPIRED',
        qty: prod.stock + 5,
        notes: 'Tes melebihi stok',
      })
    ).toThrow(/tidak mencukupi/i);

    const adjusted = adjustStock(seed, admin, {
      productId: prod.id,
      type: 'INBOUND',
      qty: 12,
      notes: 'Restok supplier',
    });
    expect(adjusted.products.find((p) => p.id === prod.id)!.stock).toBe(prod.stock + 12);

    // Cannot deactivate last active Super Admin
    expect(() =>
      upsertUser(adjusted, admin, {
        id: admin.id,
        username: admin.username,
        name: admin.name,
        role: 'MANAGER',
        isActive: false,
      })
    ).toThrow(/minimal 1 Super Admin/i);

    expect(() => deleteUser(adjusted, admin, admin.id)).toThrow(/sedang Anda gunakan/i);

    // Backup restore validation
    expect(() => validateAndRestoreBackup(admin, { schemaVersion: 99 })).toThrow(/schemaVersion/i);
    const restored = validateAndRestoreBackup(admin, JSON.parse(JSON.stringify(adjusted)));
    expect(restored.products).toHaveLength(adjusted.products.length);
  });

  it('initializes a completely clean empty database while keeping login accounts', () => {
    const empty = createEmptyDatabase(new Date('2026-11-26T10:00:00'));
    expect(empty.products).toHaveLength(0);
    expect(empty.customers).toHaveLength(0);
    expect(empty.transactions).toHaveLength(0);
    expect(empty.stockMovements).toHaveLength(0);
    expect(empty.paymentPlans).toHaveLength(0);
    expect(empty.auditLogs).toHaveLength(0);
    expect(empty.users.some((u) => u.role === 'SUPER_ADMIN' && u.isActive)).toBe(true);
    expect(empty.settings.nextInvoiceSeq).toBe(1);
    expect(empty.settings.nextPlanSeq).toBe(1);
  });

  it('loads the exact 197-SKU Indobacco product catalog with clean zero operational history', () => {
    const initial = createInitialDatabase(new Date('2026-11-26T10:00:00'));
    expect(initial.products).toHaveLength(197);
    expect(new Set(initial.products.map((p) => p.sku)).size).toBe(197);
    expect(initial.products[0]).toMatchObject({
      sku: 'IB-0001',
      name: 'A MILD',
      unit: 'Kg',
      sellPrice: 125000,
    });
    expect(initial.products[74]).toMatchObject({
      sku: 'IB-0075',
      name: 'HERBAL',
      unit: 'Kg',
      sellPrice: 150000,
    });
    expect(initial.products[190]).toMatchObject({
      sku: 'IB-0191',
      name: 'WHISKY BLUE',
      sellPrice: 135000,
    });
    expect(initial.products[191]).toMatchObject({
      sku: 'IB-0192',
      name: 'WHISKY BLUE ICE',
      sellPrice: 130000,
    });
    expect(initial.products[196]).toMatchObject({
      sku: 'IB-0197',
      name: 'ZBW',
      unit: 'Kg',
      sellPrice: 130000,
    });
    expect(initial.customers).toHaveLength(0);
    expect(initial.transactions).toHaveLength(0);
    expect(initial.stockMovements).toHaveLength(0);
    expect(initial.paymentPlans).toHaveLength(0);
    expect(initial.auditLogs).toHaveLength(0);
  });
});

describe('Security & Synchronization Regression Suite', () => {
  it('neutralizes CSV formula injection and parses Indonesian thousand-dot numbers', () => {
    expect(escapeCsvCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(escapeCsvCell('+cmd|calc')).toBe("'+cmd|calc");
    expect(escapeCsvCell('@evil')).toBe("'@evil");
    expect(escapeCsvCell(-15000)).toBe('-15000');
    expect(terbilangRupiah(Number.NaN)).toBe('Nol Rupiah');
    expect(terbilangRupiah(Number.POSITIVE_INFINITY)).toBe('Nol Rupiah');

    const indoCsv = [
      'Kode Barang,Nama Barang,Satuan,Harga,HPP,Stok',
      'IB-0001,A MILD,Kg,125.000,90.000,15',
      'IB-0099,TEST RIBU,Kg,1.250.000,900.000,2',
    ].join('\n');
    const parsed = parseProductsCsv(indoCsv);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.valid[0].sellPrice).toBe(125000);
    expect(parsed.valid[0].costPrice).toBe(90000);
    expect(parsed.valid[1].sellPrice).toBe(1250000);
  });

  it('prevents index corruption on mixed CSV insert+update and reconciles stock movements', () => {
    const initial = createInitialDatabase(new Date('2026-11-26T10:00:00'));
    const admin = initial.users.find((u) => u.role === 'SUPER_ADMIN')!;

    // Insert a brand-new SKU FIRST, then update an existing SKU IB-0001 in the same batch
    const res = importProductsBulk(initial, admin, [
      {
        sku: 'IB-9999',
        name: 'NEW BLEND',
        category: 'Tembakau Flavour',
        unit: 'Kg',
        costPrice: 80000,
        sellPrice: 140000,
        stock: 10,
        minStock: 2,
      },
      {
        sku: 'IB-0001',
        name: 'A MILD UPDATED',
        category: 'Tembakau Pabrikan',
        unit: 'Kg',
        costPrice: 95000,
        sellPrice: 128000,
        stock: 25,
        minStock: 5,
      },
    ]);

    expect(res.inserted).toBe(1);
    expect(res.updated).toBe(1);
    expect(res.state.products).toHaveLength(198);
    expect(res.state.products.find((p) => p.sku === 'IB-0001')).toMatchObject({
      name: 'A MILD UPDATED',
      sellPrice: 128000,
      stock: 25,
    });
    expect(res.state.products.find((p) => p.sku === 'IB-0002')?.name).toBe('A MILD ICE');
    expect(res.state.stockMovements.filter((m) => m.referenceId === 'IMPORT-CSV')).toHaveLength(2);

    // Edit stock directly via upsertProduct -> must create EDIT-MASTER movement & reject NaN
    const prod1 = res.state.products.find((p) => p.sku === 'IB-0001')!;
    expect(() =>
      upsertProduct(res.state, admin, {
        ...prod1,
        sellPrice: Number.NaN,
      })
    ).toThrow(/Harga Jual/i);

    const edited = upsertProduct(res.state, admin, { ...prod1, stock: 30 });
    expect(edited.stockMovements[0]).toMatchObject({
      sku: 'IB-0001',
      qtyDelta: 5,
      previousStock: 25,
      newStock: 30,
      referenceId: 'EDIT-MASTER',
    });
  });

  it('generates unique customer codes after deletion and hardens backup restore validation', () => {
    const empty = createEmptyDatabase(new Date('2026-11-26T10:00:00'));
    const admin = empty.users.find((u) => u.role === 'SUPER_ADMIN')!;

    const c1 = upsertCustomer(empty, admin, {
      name: 'Toko Satu',
      phone: '08111',
      address: 'Jl. 1',
      type: 'RETAIL',
    });
    const c2 = upsertCustomer(c1.state, admin, {
      name: 'Toko Dua',
      phone: '08222',
      address: 'Jl. 2',
      type: 'GROSIR',
    });
    const afterDel = deleteCustomer(c2.state, admin, c1.customer.id);
    const c3 = upsertCustomer(afterDel, admin, {
      name: 'Toko Tiga',
      phone: '08333',
      address: 'Jl. 3',
      type: 'DISTRIBUTOR',
    });
    expect(c2.customer.code).toBe('PLG-002');
    expect(c3.customer.code).toBe('PLG-003');

    // Invalid RBAC role must not crash hasPermission
    expect(hasPermission('UNKNOWN_ROLE' as Role, 'users:manage')).toBe(false);

    // Malformed backup with invalid role, NaN price, or prototype key must be rejected
    const badRole = JSON.parse(JSON.stringify(empty));
    badRole.users.push({
      id: 'usr_bad',
      username: 'bad',
      name: 'Bad',
      role: 'HACKER',
      passwordHash: 'x',
      isActive: true,
      createdAt: '2026-11-26T00:00:00',
    });
    expect(isValidDatabaseState(badRole)).toBe(false);
    expect(() => validateAndRestoreBackup(admin, badRole)).toThrow(/tidak valid/i);

    const protoPayload = JSON.parse(
      `{"schemaVersion":1,"constructor":{"polluted":true},"users":[],"products":[],"customers":[],"transactions":[],"stockMovements":[],"paymentPlans":[],"auditLogs":[],"settings":{}}`
    );
    expect(() => validateAndRestoreBackup(admin, protoPayload)).toThrow(/berbahaya/i);
  });

  it('supports decimal Kg sales, tier pricing, discounts, credit limits, partial returns, PO weighted HPP, expenses, and cashier shift reconciliation', () => {
    const base = createInitialDatabase(new Date('2026-11-26T10:00:00'));
    const admin = base.users.find((u) => u.role === 'SUPER_ADMIN')!;
    const prod = base.products[0]; // IB-0001 A MILD 125000

    // 1. Bulk inline opname: set HPP 90000, Grosir 115000, stock 10.5 Kg
    const bulk = bulkUpdateProducts(base, admin, [
      {
        id: prod.id,
        costPrice: 90000,
        sellPrice: 125000,
        wholesalePrice: 115000,
        stock: 10.5,
        minStock: 2,
      },
    ]);
    expect(bulk.updatedCount).toBe(1);
    expect(bulk.state.products[0].stock).toBe(10.5);
    expect(bulk.state.stockMovements[0].referenceId).toBe('OPNAME-MASSAL');

    // 2. Supplier + PO pembelian (10 Kg @ 100000 -> weighted HPP ~94878, stock 20.5 Kg, AP debt)
    const supRes = upsertSupplier(bulk.state, admin, {
      name: 'Pemasok Temanggung',
      phone: '081234',
      address: 'Temanggung',
    });
    const poRes = createPurchaseOrder(supRes.state, admin, {
      supplierId: supRes.supplier.id,
      items: [{ productId: prod.id, qty: 10, unitCost: 100000 }],
      paymentMethod: 'CREDIT',
      paidAmount: 400000,
    });
    expect(poRes.po.status).toBe('PARTIAL');
    expect(poRes.state.products[0].stock).toBe(20.5);
    expect(poRes.state.products[0].costPrice).toBe(Math.round((10.5 * 90000 + 10 * 100000) / 20.5));

    const paidPoState = payPurchaseOrder(poRes.state, admin, {
      poId: poRes.po.id,
      amount: 600000,
      paymentMethod: 'TRANSFER',
    });
    expect(paidPoState.purchaseOrders![0].status).toBe('PAID');

    // 3. Open cashier shift (500k opening cash), record 50k cash expense
    const shiftOpened = openCashierShift(paidPoState, admin, 500000);
    const withExpense = createExpense(shiftOpened, admin, {
      date: '2026-11-26',
      category: 'KEMASAN',
      description: 'Plastik pouch',
      amount: 50000,
      paymentMethod: 'CASH',
    });

    // 4. Create Grosir customer with 200k credit limit & verify credit limit guard
    const custRes = upsertCustomer(withExpense, admin, {
      name: 'Agen Grosir',
      phone: '08999',
      address: 'Solo',
      type: 'GROSIR',
      creditLimit: 200000,
    });
    expect(() =>
      createSale(custRes.state, admin, {
        customerId: custRes.customer.id,
        items: [{ productId: prod.id, qty: 3 }],
        paymentMethod: 'CREDIT',
        amountPaid: 0,
        taxEnabled: false,
        creditConfig: {
          downPayment: 0,
          interestRate: 0,
          frequency: 'WEEKLY',
          tenorCount: 2,
          startDate: '2026-11-26',
        },
      })
    ).toThrow(/plafon kredit/i);

    // 5. Decimal Kg cash sale (1.5 Kg @ Grosir 115000 = 172500, discount 12500, shipping 10000, PPN off -> total 170000)
    const saleRes = createSale(custRes.state, admin, {
      customerId: custRes.customer.id,
      items: [{ productId: prod.id, qty: 1.5 }],
      paymentMethod: 'CASH',
      discountAmount: 12500,
      shippingCost: 10000,
      taxEnabled: false,
      amountPaid: 200000,
    });
    expect(saleRes.transaction.items[0].sellPrice).toBe(115000);
    expect(saleRes.transaction.total).toBe(170000);
    expect(saleRes.transaction.changeAmount).toBe(30000);
    expect(saleRes.state.products[0].stock).toBe(19);

    // 6. Partial return 0.5 Kg -> restores stock to 19.5 Kg
    const afterReturn = createPartialReturn(saleRes.state, admin, {
      txId: saleRes.transaction.id,
      items: [{ productId: prod.id, qty: 0.5 }],
      reason: 'Kemasan sobek 0.5 Kg',
    });
    expect(afterReturn.products[0].stock).toBe(19.5);
    expect(afterReturn.transactions[0].returns).toHaveLength(1);

    // 7. Close cashier shift -> expectedCash = 500000 + 170000 - 50000 = 620000
    const closed = closeCashierShift(afterReturn, admin, 615000);
    expect(closed.closedShift.expectedCash).toBe(620000);
    expect(closed.closedShift.variance).toBe(-5000);

    // 8. Receivables aging check
    const aging = calcReceivablesAging(closed.state.paymentPlans, '2026-11-26');
    expect(aging.current).toBe(0);
  });

  it('supports B2B factory flexible tempo, transfer DP wallet isolation, return credit deduction, and FIFO bulk transfer settlement', () => {
    const base = createInitialDatabase(new Date('2026-11-26T10:00:00'));
    const admin = base.users.find((u) => u.role === 'SUPER_ADMIN')!;
    const prod = base.products[0]; // IB-0001 A MILD 125000

    // Stock up 200 Kg and add Distributor with 50jt credit limit
    const stocked = adjustStock(base, admin, {
      productId: prod.id,
      type: 'INBOUND',
      qty: 200,
      notes: 'Produksi pabrik batch 1',
    });
    const custRes = upsertCustomer(stocked, admin, {
      name: 'PT Distributor Nusantara',
      phone: '08123456789',
      address: 'Surabaya',
      type: 'DISTRIBUTOR',
      creditLimit: 50_000_000,
    });

    // Open cashier shift with Rp 1,000,000 physical cash
    const shiftState = openCashierShift(custRes.state, admin, 1_000_000);

    // Invoice 1: 50 Kg @ 125,000 = 6,250,000, PPN off, DP 1,250,000 via TRANSFER, FLEXIBLE 14 days
    const sale1 = createSale(shiftState, admin, {
      customerId: custRes.customer.id,
      items: [{ productId: prod.id, qty: 50 }],
      paymentMethod: 'CREDIT',
      amountPaid: 1_250_000,
      dpPaymentMethod: 'TRANSFER',
      transferReference: 'BCA-DP-001',
      taxEnabled: false,
      creditConfig: {
        downPayment: 1_250_000,
        interestRate: 0,
        frequency: 'FLEXIBLE',
        tenorCount: 1,
        tempoDays: 14,
        startDate: '2026-11-01',
      },
    });
    expect(sale1.transaction.dpPaymentMethod).toBe('TRANSFER');
    expect(sale1.transaction.transferReference).toBe('BCA-DP-001');
    expect(sale1.paymentPlan?.frequency).toBe('FLEXIBLE');
    expect(sale1.paymentPlan?.tempoDays).toBe(14);
    expect(sale1.paymentPlan?.schedule).toHaveLength(1);
    expect(sale1.paymentPlan?.schedule[0].dueDate).toBe('2026-11-15');
    expect(sale1.paymentPlan?.totalPayable).toBe(5_000_000);

    // Partial return of 10 Kg (1,250,000) on Invoice 1 -> auto-reduces receivable from 5,000,000 to 3,750,000
    const afterReturn = createPartialReturn(sale1.state, admin, {
      txId: sale1.transaction.id,
      items: [{ productId: prod.id, qty: 10 }],
      reason: 'Kemasan basah 10 Kg',
    });
    const plan1AfterReturn = afterReturn.paymentPlans.find((p) => p.id === sale1.paymentPlan!.id)!;
    expect(plan1AfterReturn.returnCreditAmount).toBe(1_250_000);
    expect(plan1AfterReturn.totalPayable).toBe(3_750_000);
    expect(getPlanMetrics(plan1AfterReturn, '2026-11-26').remainingBalance).toBe(3_750_000);
    expect(afterReturn.products[0].stock).toBe(160);

    // Invoice 2: 40 Kg @ 125,000 = 5,000,000, DP 1,000,000 via CASH, FLEXIBLE 30 days (newer due date)
    const sale2 = createSale(afterReturn, admin, {
      customerId: custRes.customer.id,
      items: [{ productId: prod.id, qty: 40 }],
      paymentMethod: 'CREDIT',
      amountPaid: 1_000_000,
      dpPaymentMethod: 'CASH',
      taxEnabled: false,
      creditConfig: {
        downPayment: 1_000_000,
        interestRate: 0,
        frequency: 'FLEXIBLE',
        tenorCount: 1,
        tempoDays: 30,
        startDate: '2026-11-26',
      },
    });
    expect(sale2.paymentPlan?.totalPayable).toBe(4_000_000);

    // Verify Cashier Shift isolation: only Invoice 2's CASH DP (1,000,000) enters physical drawer, NOT Invoice 1's TRANSFER DP
    const shiftCheck = closeCashierShift(sale2.state, admin, 2_000_000);
    expect(shiftCheck.closedShift.expectedCash).toBe(2_000_000); // 1,000,000 opening + 1,000,000 CASH DP
    expect(shiftCheck.closedShift.variance).toBe(0);

    // Preview & Execute Smart FIFO Bulk Transfer: Rp 5,000,000 lump-sum transfer
    // Must settle Invoice 1 (3,750,000 -> PAID) and allocate remaining 1,250,000 to Invoice 2 (leaving 2,750,000)
    const preview = previewCustomerFifoAllocation(
      sale2.state.paymentPlans,
      custRes.customer.id,
      5_000_000,
      '2026-11-26'
    );
    expect(preview.totalRemaining).toBe(7_750_000);
    expect(preview.lines).toHaveLength(2);
    expect(preview.lines[0].plan.id).toBe(sale1.paymentPlan!.id);
    expect(preview.lines[0].allocatedAmount).toBe(3_750_000);
    expect(preview.lines[0].willSettle).toBe(true);
    expect(preview.lines[1].plan.id).toBe(sale2.paymentPlan!.id);
    expect(preview.lines[1].allocatedAmount).toBe(1_250_000);
    expect(preview.lines[1].remainingAfter).toBe(2_750_000);
    expect(preview.unallocated).toBe(0);

    // Overpayment must throw cleanly
    expect(() =>
      recordCustomerBulkPayment(sale2.state, admin, {
        customerId: custRes.customer.id,
        amount: 9_000_000,
        paymentMethod: 'TRANSFER',
      })
    ).toThrow(/melebihi total piutang/i);

    const bulkRes = recordCustomerBulkPayment(sale2.state, admin, {
      customerId: custRes.customer.id,
      amount: 5_000_000,
      paymentMethod: 'TRANSFER',
      transferReference: 'MANDIRI-BATCH-99',
      notes: 'Transfer cicilan bertahap 5jt',
    });
    expect(bulkRes.settledCount).toBe(1);
    expect(bulkRes.affectedPlans).toHaveLength(2);
    expect(bulkRes.receipts).toHaveLength(2);
    expect(bulkRes.receipts[0].receiptNumber).toMatch(/^KWT-/);
    expect(bulkRes.receipts[1].receiptNumber).toMatch(/^KWT-/);
    expect(bulkRes.receipts[0].transferReference).toBe('MANDIRI-BATCH-99');

    const finalPlan1 = bulkRes.state.paymentPlans.find((p) => p.id === sale1.paymentPlan!.id)!;
    const finalPlan2 = bulkRes.state.paymentPlans.find((p) => p.id === sale2.paymentPlan!.id)!;
    expect(finalPlan1.status).toBe('PAID');
    expect(getPlanMetrics(finalPlan1, '2026-11-26').remainingBalance).toBe(0);
    expect(finalPlan2.status).toBe('ACTIVE');
    expect(getPlanMetrics(finalPlan2, '2026-11-26').remainingBalance).toBe(2_750_000);
  });
});

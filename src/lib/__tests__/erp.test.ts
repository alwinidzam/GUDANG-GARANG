import { describe, expect, it } from 'vitest';
import {
  buildInstallmentSchedule,
  calcInventoryValuation,
  calcMarginPercent,
  getInstallmentStatus,
  getPlanMetrics,
} from '../calculations';
import { parseCsv, parseProductsCsv, toCsv } from '../csv';
import { terbilangRupiah } from '../format';
import { getDefaultViewForRole, hasPermission } from '../rbac';
import { createSeedData } from '../seedData';
import {
  adjustStock,
  createSale,
  deleteUser,
  recordInstallmentPayment,
  upsertUser,
  validateAndRestoreBackup,
  voidTransaction,
} from '../storeEngine';

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
});

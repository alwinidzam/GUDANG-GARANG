import { buildInstallmentSchedule } from './calculations';
import { addDaysISO, hashPassword, padSeq, toLocalDateISO } from './format';
import { createCatalogProducts } from './productCatalog';
import {
  AuditLog,
  CompanySettings,
  Customer,
  DatabaseState,
  PaymentMethod,
  PaymentPlan,
  Product,
  StockMovement,
  Transaction,
  TransactionItem,
  User,
} from '../types/erp';

function createDefaultUsers(tsAt: (daysOffset: number, hour?: number, minute?: number) => string): User[] {
  return [
    {
      id: 'usr_admin',
      username: 'admin',
      name: 'Bagong Pratama',
      role: 'SUPER_ADMIN',
      passwordHash: hashPassword('admin123'),
      isActive: true,
      createdAt: tsAt(-60, 8, 0),
    },
    {
      id: 'usr_manager',
      username: 'manager',
      name: 'Raka Wijaya',
      role: 'MANAGER',
      passwordHash: hashPassword('manager123'),
      isActive: true,
      createdAt: tsAt(-55, 8, 30),
    },
    {
      id: 'usr_kasir',
      username: 'kasir',
      name: 'Sinta Dewi',
      role: 'KASIR',
      passwordHash: hashPassword('kasir123'),
      isActive: true,
      createdAt: tsAt(-45, 9, 0),
    },
    {
      id: 'usr_owner',
      username: 'owner',
      name: 'H. Darmawan',
      role: 'OWNER',
      passwordHash: hashPassword('owner123'),
      isActive: true,
      createdAt: tsAt(-60, 8, 0),
    },
  ];
}

export function createEmptyDatabase(baseDate: Date = new Date()): DatabaseState {
  const today = toLocalDateISO(baseDate);
  const tsAt = (daysOffset: number, hour = 10, minute = 15): string => {
    const dStr = addDaysISO(today, daysOffset);
    return `${dStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
  };

  return {
    schemaVersion: 1,
    users: createDefaultUsers(tsAt),
    products: [],
    customers: [],
    transactions: [],
    stockMovements: [],
    paymentPlans: [],
    auditLogs: [],
    suppliers: [],
    purchaseOrders: [],
    expenses: [],
    holdOrders: [],
    shifts: [],
    settings: {
      companyName: 'PT Indobacco Tingwe Nusantara',
      tagline: 'Tingwe Tobacco Premium: Go International',
      address: 'Jl. Raya Industri Tembakau No. 45, Temanggung, Jawa Tengah 56212',
      phone: '(0293) 491-880 / WA 0811-2900-450',
      email: 'operasional@indobacco.co.id',
      bankName: '',
      bankAccountNumber: '',
      bankAccountHolder: '',
      taxRate: 11,
      invoicePrefix: 'IDB',
      dailyTarget: 6500000,
      receiptFooter: 'Terima kasih telah mempercayai kualitas Indobacco Tingwe Premium.',
      nextInvoiceSeq: 1,
      nextReceiptSeq: 1,
      nextSuratJalanSeq: 1,
      nextPlanSeq: 1,
      nextPoSeq: 1,
    },
  };
}

export function createInitialDatabase(baseDate: Date = new Date()): DatabaseState {
  const empty = createEmptyDatabase(baseDate);
  const today = toLocalDateISO(baseDate);
  return {
    ...empty,
    products: createCatalogProducts(`${today}T09:00:00`),
  };
}

export function createSeedData(baseDate: Date = new Date()): DatabaseState {
  const today = toLocalDateISO(baseDate);
  const tsAt = (daysOffset: number, hour = 10, minute = 15): string => {
    const dStr = addDaysISO(today, daysOffset);
    return `${dStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
  };
  const ym = today.slice(0, 7).replace('-', '');

  const users: User[] = createDefaultUsers(tsAt);

  const products: Product[] = [
    {
      id: 'prd_01',
      sku: 'IDB-RJG-001',
      name: 'Tembakau Gayor Temanggung Grade A (100g)',
      category: 'Tembakau Rajangan',
      unit: 'Pouch',
      costPrice: 38000,
      sellPrice: 55000,
      stock: 145,
      minStock: 25,
      description: 'Rajangan halus daun srinthil Temanggung panen kemarau.',
      updatedAt: tsAt(-2, 11, 0),
    },
    {
      id: 'prd_02',
      sku: 'IDB-RJG-002',
      name: 'Tembakau Mole Madura Super (100g)',
      category: 'Tembakau Rajangan',
      unit: 'Pouch',
      costPrice: 30000,
      sellPrice: 45000,
      stock: 92,
      minStock: 20,
      description: 'Karakter gurih kuat khas Madura, kadar air terjaga.',
      updatedAt: tsAt(-2, 11, 5),
    },
    {
      id: 'prd_03',
      sku: 'IDB-RJG-003',
      name: 'Tembakau Virginia Gold Mild (100g)',
      category: 'Tembakau Rajangan',
      unit: 'Pouch',
      costPrice: 34000,
      sellPrice: 52000,
      stock: 14,
      minStock: 20,
      description: 'Virginia curing oven warna kuning keemasan, tarikan ringan.',
      updatedAt: tsAt(-1, 15, 20),
    },
    {
      id: 'prd_04',
      sku: 'IDB-RJG-004',
      name: 'Tembakau Darwati Garut Klasik (100g)',
      category: 'Tembakau Rajangan',
      unit: 'Pouch',
      costPrice: 32000,
      sellPrice: 48000,
      stock: 64,
      minStock: 15,
      description: 'Rajangan tradisional Garut aroma manis sejuk.',
      updatedAt: tsAt(-3, 9, 40),
    },
    {
      id: 'prd_05',
      sku: 'IDB-FLV-001',
      name: 'Tingwe Flavour Cengkeh Gayo (50g)',
      category: 'Tembakau Rasa',
      unit: 'Kaleng',
      costPrice: 24000,
      sellPrice: 38000,
      stock: 8,
      minStock: 15,
      description: 'Blend saus rempah cengkeh pilihan dalam kemasan kaleng kedap.',
      updatedAt: tsAt(-1, 16, 0),
    },
    {
      id: 'prd_06',
      sku: 'IDB-FLV-002',
      name: 'Tingwe Flavour Kopi Toraja Roast (50g)',
      category: 'Tembakau Rasa',
      unit: 'Kaleng',
      costPrice: 26000,
      sellPrice: 42000,
      stock: 48,
      minStock: 12,
      description: 'Infusi aroma kopi sangrai lembut tanpa rasa pahit berlebih.',
      updatedAt: tsAt(-4, 14, 10),
    },
    {
      id: 'prd_07',
      sku: 'IDB-BAL-001',
      name: 'Paket Grosir Daun Rajang Pilihan (Bal 5kg)',
      category: 'Bahan Baku Grosir',
      unit: 'Bal',
      costPrice: 1250000,
      sellPrice: 1650000,
      stock: 18,
      minStock: 5,
      description: 'Kemasan karung pres standar agen & pabrik mitra.',
      updatedAt: tsAt(-2, 13, 0),
    },
    {
      id: 'prd_08',
      sku: 'IDB-BAL-002',
      name: 'Cengkeh Rajang Menado Kering (1kg)',
      category: 'Bahan Baku Grosir',
      unit: 'Kg',
      costPrice: 145000,
      sellPrice: 195000,
      stock: 34,
      minStock: 10,
      description: 'Cengkeh rajang bersih siap campur untuk racikan kretek.',
      updatedAt: tsAt(-5, 10, 0),
    },
    {
      id: 'prd_09',
      sku: 'IDB-ACC-001',
      name: 'Kertas Papir Manis Indobacco (Box 50 Book)',
      category: 'Perlengkapan Tingwe',
      unit: 'Box',
      costPrice: 42000,
      sellPrice: 65000,
      stock: 110,
      minStock: 25,
      description: 'Papir tipis bakar lambat isi 50 buku per box.',
      updatedAt: tsAt(-3, 12, 0),
    },
    {
      id: 'prd_10',
      sku: 'IDB-ACC-002',
      name: 'Filter Busa Regular 8mm (Pack 1000 pcs)',
      category: 'Perlengkapan Tingwe',
      unit: 'Pack',
      costPrice: 28000,
      sellPrice: 45000,
      stock: 9,
      minStock: 15,
      description: 'Filter busa padat ukuran standar 8mm.',
      updatedAt: tsAt(-1, 17, 10),
    },
    {
      id: 'prd_11',
      sku: 'IDB-ACC-003',
      name: 'Alat Linting Besi Stainless Premium',
      category: 'Perlengkapan Tingwe',
      unit: 'Pcs',
      costPrice: 22000,
      sellPrice: 39000,
      stock: 57,
      minStock: 10,
      description: 'Mesin linting manual bodi baja anti karat 70mm.',
      updatedAt: tsAt(-6, 11, 20),
    },
    {
      id: 'prd_12',
      sku: 'IDB-PKT-001',
      name: 'Starter Kit Tingwe Nusantara Eksklusif',
      category: 'Paket Ekspor & Gift',
      unit: 'Set',
      costPrice: 95000,
      sellPrice: 149000,
      stock: 29,
      minStock: 8,
      description: 'Set lengkap pouch tembakau, alat linting, filter, dan kaleng penyimpanan.',
      updatedAt: tsAt(-2, 9, 15),
    },
  ];

  const customers: Customer[] = [
    {
      id: 'cst_01',
      code: 'PLG-001',
      name: 'Toko Bagong Jaya',
      phone: '0812-3456-7890',
      address: 'Jl. Malioboro No. 88, Yogyakarta',
      type: 'DISTRIBUTOR',
      createdAt: tsAt(-50, 10, 0),
    },
    {
      id: 'cst_02',
      code: 'PLG-002',
      name: 'Agen Tembakau Nusantara',
      phone: '0813-9988-1122',
      address: 'Jl. Raya Temanggung Km 4, Jawa Tengah',
      type: 'DISTRIBUTOR',
      createdAt: tsAt(-42, 11, 0),
    },
    {
      id: 'cst_03',
      code: 'PLG-003',
      name: 'UD Sumber Rejeki Kudus',
      phone: '0821-7766-5544',
      address: 'Jl. Ahmad Yani No. 19, Kudus',
      type: 'GROSIR',
      createdAt: tsAt(-35, 14, 0),
    },
    {
      id: 'cst_04',
      code: 'PLG-004',
      name: 'Warung Tingwe Solo',
      phone: '0856-2233-4455',
      address: 'Jl. Slamet Riyadi No. 210, Surakarta',
      type: 'GROSIR',
      createdAt: tsAt(-28, 9, 30),
    },
    {
      id: 'cst_05',
      code: 'PLG-005',
      name: 'CV Maju Bersama Ekspor',
      phone: '0811-2020-3030',
      address: 'Kawasan Industri Rungkut Blok C-12, Surabaya',
      type: 'DISTRIBUTOR',
      createdAt: tsAt(-20, 15, 0),
    },
    {
      id: 'cst_06',
      code: 'PLG-006',
      name: 'Bpk. Hendra Pratama',
      phone: '0878-1100-9900',
      address: 'Perum Griya Indah Blok B4, Semarang',
      type: 'RETAIL',
      createdAt: tsAt(-14, 13, 0),
    },
  ];

  const taxRate = 11;
  const prodById = new Map(products.map((p) => [p.id, p]));
  const custById = new Map(customers.map((c) => [c.id, c]));

  const makeItems = (pairs: Array<[string, number]>): TransactionItem[] =>
    pairs.map(([pid, qty]) => {
      const p = prodById.get(pid)!;
      return {
        productId: p.id,
        sku: p.sku,
        productName: p.name,
        unit: p.unit,
        qty,
        costPrice: p.costPrice,
        sellPrice: p.sellPrice,
        subtotal: p.sellPrice * qty,
      };
    });

  const transactions: Transaction[] = [];
  const paymentPlans: PaymentPlan[] = [];
  const stockMovements: StockMovement[] = [];
  const auditLogs: AuditLog[] = [];

  interface SeedTxSpec {
    seq: number;
    daysAgo: number;
    hour: number;
    customerId: string | null;
    items: Array<[string, number]>;
    paymentMethod: PaymentMethod;
    cashierId: string;
    voided?: boolean;
    voidReason?: string;
    credit?: {
      planNumber: string;
      dp: number;
      rate: number;
      freq: 'WEEKLY' | 'MONTHLY';
      tenor: number;
      paidInstallments?: number;
      receiptNumber?: string;
      paidDaysAgo?: number;
    };
  }

  const specs: SeedTxSpec[] = [
    {
      seq: 1,
      daysAgo: 25,
      hour: 10,
      customerId: 'cst_01',
      items: [
        ['prd_07', 2],
        ['prd_08', 4],
      ],
      paymentMethod: 'CREDIT',
      cashierId: 'usr_kasir',
      credit: {
        planNumber: `KRD-${ym}-0001`,
        dp: 1000000,
        rate: 2,
        freq: 'WEEKLY',
        tenor: 3,
        paidInstallments: 1,
        receiptNumber: `KWT-${ym}-0001`,
        paidDaysAgo: 17,
      },
    },
    {
      seq: 2,
      daysAgo: 21,
      hour: 14,
      customerId: 'cst_02',
      items: [
        ['prd_01', 20],
        ['prd_09', 10],
      ],
      paymentMethod: 'CREDIT',
      cashierId: 'usr_manager',
      credit: {
        planNumber: `KRD-${ym}-0002`,
        dp: 500000,
        rate: 0,
        freq: 'WEEKLY',
        tenor: 2,
        paidInstallments: 2,
        receiptNumber: `KWT-${ym}-0002`,
        paidDaysAgo: 7,
      },
    },
    {
      seq: 3,
      daysAgo: 14,
      hour: 11,
      customerId: 'cst_03',
      items: [
        ['prd_02', 25],
        ['prd_10', 8],
      ],
      paymentMethod: 'TRANSFER',
      cashierId: 'usr_kasir',
    },
    {
      seq: 4,
      daysAgo: 12,
      hour: 16,
      customerId: 'cst_04',
      items: [
        ['prd_04', 15],
        ['prd_11', 10],
      ],
      paymentMethod: 'QRIS',
      cashierId: 'usr_kasir',
    },
    {
      seq: 5,
      daysAgo: 10,
      hour: 9,
      customerId: 'cst_05',
      items: [
        ['prd_07', 3],
        ['prd_12', 8],
      ],
      paymentMethod: 'TRANSFER',
      cashierId: 'usr_manager',
    },
    {
      seq: 6,
      daysAgo: 8,
      hour: 13,
      customerId: 'cst_06',
      items: [
        ['prd_01', 4],
        ['prd_05', 3],
        ['prd_11', 2],
      ],
      paymentMethod: 'CASH',
      cashierId: 'usr_kasir',
    },
    {
      seq: 7,
      daysAgo: 6,
      hour: 15,
      customerId: null,
      items: [
        ['prd_03', 6],
        ['prd_09', 4],
      ],
      paymentMethod: 'QRIS',
      cashierId: 'usr_kasir',
    },
    {
      seq: 8,
      daysAgo: 5,
      hour: 11,
      customerId: 'cst_03',
      items: [
        ['prd_06', 12],
        ['prd_08', 5],
      ],
      paymentMethod: 'CASH',
      cashierId: 'usr_kasir',
      voided: true,
      voidReason: 'Salah input kuantitas order agen, diganti invoice baru.',
    },
    {
      seq: 9,
      daysAgo: 4,
      hour: 12,
      customerId: 'cst_01',
      items: [
        ['prd_07', 2],
        ['prd_01', 15],
        ['prd_09', 12],
      ],
      paymentMethod: 'TRANSFER',
      cashierId: 'usr_manager',
    },
    {
      seq: 10,
      daysAgo: 3,
      hour: 10,
      customerId: 'cst_04',
      items: [
        ['prd_02', 18],
        ['prd_04', 12],
        ['prd_12', 5],
      ],
      paymentMethod: 'CREDIT',
      cashierId: 'usr_kasir',
      credit: {
        planNumber: `KRD-${ym}-0003`,
        dp: 800000,
        rate: 3,
        freq: 'MONTHLY',
        tenor: 3,
      },
    },
    {
      seq: 11,
      daysAgo: 2,
      hour: 14,
      customerId: 'cst_02',
      items: [
        ['prd_07', 1],
        ['prd_08', 6],
        ['prd_10', 10],
      ],
      paymentMethod: 'TRANSFER',
      cashierId: 'usr_kasir',
    },
    {
      seq: 12,
      daysAgo: 1,
      hour: 11,
      customerId: null,
      items: [
        ['prd_01', 5],
        ['prd_06', 4],
        ['prd_11', 3],
      ],
      paymentMethod: 'CASH',
      cashierId: 'usr_kasir',
    },
    {
      seq: 13,
      daysAgo: 0,
      hour: 9,
      customerId: 'cst_05',
      items: [
        ['prd_07', 1],
        ['prd_12', 6],
      ],
      paymentMethod: 'QRIS',
      cashierId: 'usr_kasir',
    },
    {
      seq: 14,
      daysAgo: 0,
      hour: 11,
      customerId: 'cst_06',
      items: [
        ['prd_01', 3],
        ['prd_05', 2],
      ],
      paymentMethod: 'CASH',
      cashierId: 'usr_kasir',
    },
  ];

  const userById = new Map(users.map((u) => [u.id, u]));

  for (const s of specs) {
    const items = makeItems(s.items);
    const subtotal = items.reduce((acc, it) => acc + it.subtotal, 0);
    const taxAmount = Math.round(subtotal * (taxRate / 100));
    const total = subtotal + taxAmount;
    const cust = s.customerId ? custById.get(s.customerId) : null;
    const cashier = userById.get(s.cashierId)!;
    const createdAt = tsAt(-s.daysAgo, s.hour, 15);
    const txId = `tx_${padSeq(s.seq)}`;
    const invoiceNumber = `IDB-${ym}-${padSeq(s.seq)}`;
    const suratJalanNumber = `SJ-${ym}-${padSeq(s.seq)}`;

    let amountPaid = total;
    let changeAmount = 0;
    let paymentPlanId: string | undefined;

    if (s.paymentMethod === 'CASH') {
      const rounded = Math.ceil(total / 50000) * 50000;
      amountPaid = rounded;
      changeAmount = rounded - total;
    } else if (s.paymentMethod === 'CREDIT' && s.credit) {
      amountPaid = s.credit.dp;
      changeAmount = 0;
      paymentPlanId = `pln_${padSeq(s.seq)}`;
      const schedRes = buildInstallmentSchedule({
        principalAmount: total,
        downPayment: s.credit.dp,
        interestRate: s.credit.rate,
        frequency: s.credit.freq,
        tenorCount: s.credit.tenor,
        startDate: createdAt.slice(0, 10),
      });

      const payments = [];
      let paidTotal = 0;
      const paidCnt = s.credit.paidInstallments || 0;
      if (paidCnt > 0) {
        let amt = 0;
        for (let i = 0; i < Math.min(paidCnt, schedRes.schedule.length); i += 1) {
          const item = schedRes.schedule[i];
          amt += item.amount;
          item.paidAmount = item.amount;
          item.paidAt = tsAt(-(s.credit.paidDaysAgo ?? 7), 14, 0);
        }
        paidTotal = amt;
        payments.push({
          id: `pay_${padSeq(s.seq)}_1`,
          receiptNumber: s.credit.receiptNumber || `KWT-${ym}-0001`,
          paidAt: tsAt(-(s.credit.paidDaysAgo ?? 7), 14, 0),
          amount: amt,
          paymentMethod: 'TRANSFER' as const,
          receivedById: 'usr_manager',
          receivedByName: 'Raka Wijaya',
          notes: `Pembayaran angsuran ${paidCnt} termin (${invoiceNumber})`,
          remainingBalanceAfter: Math.max(0, schedRes.totalPayable - paidTotal),
        });
      }

      paymentPlans.push({
        id: paymentPlanId,
        planNumber: s.credit.planNumber,
        transactionId: txId,
        invoiceNumber,
        customerId: cust!.id,
        customerName: cust!.name,
        createdAt,
        principalAmount: total,
        downPayment: s.credit.dp,
        interestRate: s.credit.rate,
        interestAmount: schedRes.interestAmount,
        totalPayable: schedRes.totalPayable,
        frequency: s.credit.freq,
        tenorCount: s.credit.tenor,
        schedule: schedRes.schedule,
        payments,
        status: paidTotal >= schedRes.totalPayable ? 'PAID' : 'ACTIVE',
        notes: `Kredit invoice ${invoiceNumber}`,
      });
    }

    const tx: Transaction = {
      id: txId,
      invoiceNumber,
      suratJalanNumber,
      createdAt,
      customerId: cust ? cust.id : null,
      customerName: cust ? cust.name : 'Pelanggan Umum',
      customerPhone: cust?.phone,
      customerAddress: cust?.address,
      items,
      subtotal,
      taxRate,
      taxAmount,
      total,
      paymentMethod: s.paymentMethod,
      amountPaid,
      changeAmount,
      status: s.voided ? 'VOIDED' : 'COMPLETED',
      cashierId: cashier.id,
      cashierName: cashier.name,
      paymentPlanId,
      voidedAt: s.voided ? tsAt(-s.daysAgo, s.hour + 1, 5) : undefined,
      voidedById: s.voided ? 'usr_manager' : undefined,
      voidedByName: s.voided ? 'Raka Wijaya' : undefined,
      voidReason: s.voidReason,
    };

    transactions.push(tx);

    for (const item of items) {
      const p = prodById.get(item.productId)!;
      stockMovements.push({
        id: `mov_${tx.id}_${item.productId}`,
        createdAt,
        productId: p.id,
        sku: p.sku,
        productName: p.name,
        type: 'SALE',
        qtyDelta: -item.qty,
        previousStock: p.stock + item.qty,
        newStock: p.stock,
        picId: cashier.id,
        picName: cashier.name,
        referenceId: invoiceNumber,
        notes: `Penjualan POS (${invoiceNumber})`,
      });
      if (s.voided) {
        stockMovements.push({
          id: `mov_${tx.id}_${item.productId}_void`,
          createdAt: tx.voidedAt!,
          productId: p.id,
          sku: p.sku,
          productName: p.name,
          type: 'VOID_RETURN',
          qtyDelta: item.qty,
          previousStock: p.stock,
          newStock: p.stock + item.qty,
          picId: 'usr_manager',
          picName: 'Raka Wijaya',
          referenceId: invoiceNumber,
          notes: `Pengembalian stok (Void): ${s.voidReason}`,
        });
      }
    }
  }

  // Add realistic warehouse inbound & damaged/expired adjustments
  stockMovements.push(
    {
      id: 'mov_wh_01',
      createdAt: tsAt(-7, 9, 20),
      productId: 'prd_01',
      sku: 'IDB-RJG-001',
      productName: 'Tembakau Gayor Temanggung Grade A (100g)',
      type: 'INBOUND',
      qtyDelta: 60,
      previousStock: 85,
      newStock: 145,
      picId: 'usr_manager',
      picName: 'Raka Wijaya',
      referenceId: 'PO-TMG-2026-08',
      notes: 'Penerimaan panen rajangan batch Temanggung #08',
    },
    {
      id: 'mov_wh_02',
      createdAt: tsAt(-3, 16, 40),
      productId: 'prd_05',
      sku: 'IDB-FLV-001',
      productName: 'Tingwe Flavour Cengkeh Gayo (50g)',
      type: 'DAMAGED_EXPIRED',
      qtyDelta: -4,
      previousStock: 12,
      newStock: 8,
      picId: 'usr_manager',
      picName: 'Raka Wijaya',
      referenceId: 'OPNAME-03',
      notes: 'Kaleng penyok saat bongkar muat gudang',
    }
  );

  // Sort transactions, movements, logs newest first
  transactions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  stockMovements.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  auditLogs.push(
    {
      id: 'aud_01',
      timestamp: tsAt(-7, 9, 20),
      userId: 'usr_manager',
      userName: 'Raka Wijaya',
      userRole: 'MANAGER',
      module: 'GUDANG',
      action: 'STOCK_INBOUND',
      summary: 'Tambah stok +60 Pouch untuk Tembakau Gayor Temanggung Grade A (100g)',
      before: { stock: 85 },
      after: { stock: 145, ref: 'PO-TMG-2026-08' },
    },
    {
      id: 'aud_02',
      timestamp: tsAt(-5, 12, 5),
      userId: 'usr_manager',
      userName: 'Raka Wijaya',
      userRole: 'MANAGER',
      module: 'TRANSAKSI',
      action: 'VOID_TRANSACTION',
      summary: `Void invoice IDB-${ym}-0008 (Salah input kuantitas order agen)`,
      before: { status: 'COMPLETED' },
      after: { status: 'VOIDED' },
    },
    {
      id: 'aud_03',
      timestamp: tsAt(-3, 16, 40),
      userId: 'usr_manager',
      userName: 'Raka Wijaya',
      userRole: 'MANAGER',
      module: 'GUDANG',
      action: 'STOCK_DAMAGED_EXPIRED',
      summary: 'Koreksi rusak -4 Kaleng untuk Tingwe Flavour Cengkeh Gayo (50g)',
      before: { stock: 12 },
      after: { stock: 8 },
    },
    {
      id: 'aud_04',
      timestamp: tsAt(0, 11, 15),
      userId: 'usr_kasir',
      userName: 'Sinta Dewi',
      userRole: 'KASIR',
      module: 'POS',
      action: 'CREATE_SALE',
      summary: `Transaksi tunai IDB-${ym}-0014 sebesar Rp 267.510`,
    }
  );

  const settings: CompanySettings = {
    companyName: 'PT Indobacco Tingwe Nusantara',
    tagline: 'Tingwe Tobacco Premium: Go International',
    address: 'Jl. Raya Industri Tembakau No. 45, Temanggung, Jawa Tengah 56212',
    phone: '(0293) 491-880 / WA 0811-2900-450',
    email: 'operasional@indobacco.co.id',
    taxRate,
    invoicePrefix: 'IDB',
    dailyTarget: 6500000,
    receiptFooter: 'Terima kasih telah mempercayai kualitas Indobacco Tingwe Premium.',
    nextInvoiceSeq: 15,
    nextReceiptSeq: 3,
    nextSuratJalanSeq: 15,
    nextPlanSeq: 4,
  };

  return {
    schemaVersion: 1,
    users,
    products,
    customers,
    transactions,
    stockMovements,
    paymentPlans,
    auditLogs,
    suppliers: [],
    purchaseOrders: [],
    expenses: [],
    holdOrders: [],
    shifts: [],
    settings,
  };
}

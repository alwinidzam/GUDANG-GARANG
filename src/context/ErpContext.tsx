import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getDefaultViewForRole, hasPermission, Permission } from '../lib/rbac';
import { createEmptyDatabase, createInitialDatabase } from '../lib/seedData';
import { hashPassword, toLocalDateISO } from '../lib/format';
import * as engine from '../lib/storeEngine';
import { CsvProductRow } from '../lib/csv';
import {
  AppView,
  CashierShift,
  CompanySettings,
  Customer,
  DatabaseState,
  HoldOrder,
  InstallmentPaymentRecord,
  PaymentPlan,
  PrintRequest,
  PurchaseOrder,
  ShippingStatus,
  Supplier,
  Transaction,
  User,
} from '../types/erp';

const LEGACY_DB_STORAGE_KEYS = [
  'indobacco_erp_v1',
  'indobacco_erp_v2',
  'indobacco_erp_v3',
  'indobacco_erp_v4',
];
const DB_STORAGE_KEY = 'indobacco_erp_v5';
const SESSION_STORAGE_KEY = 'indobacco_session_user_v1';

export interface ToastMessage {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ErpContextValue {
  db: DatabaseState;
  currentUser: User | null;
  activeView: AppView;
  setActiveView: (view: AppView) => void;
  can: (permission: Permission) => boolean;
  login: (username: string, password: string) => void;
  logout: () => void;
  printRequest: PrintRequest | null;
  openPrint: (req: PrintRequest) => void;
  closePrint: () => void;
  toast: ToastMessage | null;
  showToast: (type: ToastMessage['type'], message: string) => void;
  dismissToast: () => void;

  // Domain actions
  createSale: (input: engine.CreateSaleInput) => { transaction: Transaction; paymentPlan?: PaymentPlan };
  voidTransaction: (txId: string, reason: string) => void;
  createPartialReturn: (input: engine.PartialReturnInput) => void;
  updateTransactionShipping: (input: {
    txId: string;
    shippingStatus: ShippingStatus;
    courierName?: string;
    trackingNumber?: string;
  }) => void;
  adjustStock: (input: engine.AdjustStockInput) => void;
  recordInstallmentPayment: (
    input: engine.RecordInstallmentPaymentInput
  ) => { payment: InstallmentPaymentRecord; plan: PaymentPlan };
  recordCustomerBulkPayment: (input: engine.CustomerBulkPaymentInput) => {
    settledCount: number;
    affectedPlans: PaymentPlan[];
    receipts: InstallmentPaymentRecord[];
  };
  createManualPaymentPlan: (input: engine.CreateManualPlanInput) => PaymentPlan;
  upsertProduct: (input: engine.UpsertProductInput) => void;
  bulkUpdateProducts: (patches: engine.BulkProductPatch[]) => number;
  deleteProduct: (productId: string) => void;
  importProductsBulk: (rows: CsvProductRow[]) => { inserted: number; updated: number };
  upsertCustomer: (input: engine.UpsertCustomerInput) => Customer;
  deleteCustomer: (customerId: string) => void;
  upsertSupplier: (input: engine.UpsertSupplierInput) => Supplier;
  deleteSupplier: (supplierId: string) => void;
  createPurchaseOrder: (input: engine.CreatePurchaseOrderInput) => PurchaseOrder;
  payPurchaseOrder: (input: {
    poId: string;
    amount: number;
    paymentMethod: 'CASH' | 'TRANSFER' | 'QRIS';
    notes?: string;
  }) => void;
  createExpense: (input: engine.CreateExpenseInput) => void;
  deleteExpense: (expenseId: string) => void;
  saveHoldOrder: (input: Omit<HoldOrder, 'id' | 'createdAt'>) => void;
  deleteHoldOrder: (holdId: string) => void;
  openCashierShift: (openingCash: number, notes?: string) => void;
  closeCashierShift: (actualCash: number, notes?: string) => CashierShift;
  upsertUser: (input: engine.UpsertUserInput) => void;
  deleteUser: (userId: string) => void;
  updateSettings: (partial: Partial<CompanySettings>) => void;
  exportBackupJson: () => void;
  restoreBackupJson: (parsed: unknown) => void;
  resetOperationalData: () => void;
  clearAllData: () => void;
}

const ErpContext = createContext<ErpContextValue | null>(null);

function loadInitialDb(): DatabaseState {
  try {
    // Clean up prior demo/empty storage keys when initializing production product catalog
    for (const legacyKey of LEGACY_DB_STORAGE_KEYS) {
      if (localStorage.getItem(legacyKey)) {
        localStorage.removeItem(legacyKey);
      }
    }
    const raw = localStorage.getItem(DB_STORAGE_KEY);
    if (!raw) return createInitialDatabase();
    const parsed: unknown = JSON.parse(raw);
    if (engine.isValidDatabaseState(parsed)) {
      return parsed;
    }
    return createInitialDatabase();
  } catch {
    return createInitialDatabase();
  }
}

export const ErpProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [db, setDb] = useState<DatabaseState>(() => loadInitialDb());
  const [sessionUserId, setSessionUserId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SESSION_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [activeView, setActiveView] = useState<AppView>('dashboard');
  const [printRequest, setPrintRequest] = useState<PrintRequest | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const currentUser = useMemo(() => {
    if (!sessionUserId) return null;
    const found = db.users.find((u) => u.id === sessionUserId && u.isActive);
    return found || null;
  }, [db.users, sessionUserId]);

  useEffect(() => {
    try {
      localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(db));
    } catch {
      // Ignore quota errors gracefully
    }
  }, [db]);

  useEffect(() => {
    try {
      if (sessionUserId) {
        localStorage.setItem(SESSION_STORAGE_KEY, sessionUserId);
      } else {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch {
      // Ignore storage access errors
    }
  }, [sessionUserId]);

  // Keep multiple open browser tabs synchronized via localStorage events
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === DB_STORAGE_KEY && e.newValue) {
        try {
          const parsed: unknown = JSON.parse(e.newValue);
          if (engine.isValidDatabaseState(parsed)) {
            setDb(parsed);
          }
        } catch {
          // Ignore malformed external writes
        }
      } else if (e.key === SESSION_STORAGE_KEY) {
        setSessionUserId(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Ensure initial route matches role on reload
  useEffect(() => {
    if (currentUser && currentUser.role === 'KASIR' && activeView === 'dashboard') {
      setActiveView('pos');
    }
  }, [currentUser, activeView]);

  const showToast = useCallback((type: ToastMessage['type'], message: string) => {
    const id = Date.now();
    setToast({ id, type, message });
  }, []);

  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      setToast((curr) => (curr && curr.id === toast.id ? null : curr));
    }, 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const can = useCallback(
    (permission: Permission) => hasPermission(currentUser?.role, permission),
    [currentUser]
  );

  const requireActor = useCallback((): User => {
    if (!currentUser) {
      throw new Error('Sesi login telah berakhir. Silakan login kembali.');
    }
    return currentUser;
  }, [currentUser]);

  const login = useCallback(
    (username: string, password: string) => {
      const cleanUser = username.trim().toLowerCase();
      const found = db.users.find((u) => u.username.toLowerCase() === cleanUser);
      if (!found) {
        throw new Error('Username tidak ditemukan.');
      }
      if (!found.isActive) {
        throw new Error('Akun ini sedang dinonaktifkan oleh Super Admin.');
      }
      if (found.passwordHash !== hashPassword(password)) {
        throw new Error('Password salah.');
      }
      setSessionUserId(found.id);
      setActiveView(getDefaultViewForRole(found.role));
      showToast('success', `Selamat datang, ${found.name}!`);
    },
    [db.users, showToast]
  );

  const logout = useCallback(() => {
    setSessionUserId(null);
    setPrintRequest(null);
  }, []);

  const openPrint = useCallback((req: PrintRequest) => {
    setPrintRequest(req);
  }, []);

  const closePrint = useCallback(() => {
    setPrintRequest(null);
  }, []);

  const createSale = useCallback(
    (input: engine.CreateSaleInput) => {
      const actor = requireActor();
      const res = engine.createSale(db, actor, input);
      setDb(res.state);
      showToast('success', `Transaksi ${res.transaction.invoiceNumber} berhasil disimpan.`);
      return { transaction: res.transaction, paymentPlan: res.paymentPlan };
    },
    [db, requireActor, showToast]
  );

  const voidTransaction = useCallback(
    (txId: string, reason: string) => {
      const actor = requireActor();
      const next = engine.voidTransaction(db, actor, txId, reason);
      setDb(next);
      showToast('success', 'Transaksi dibatalkan & stok barang dikembalikan ke gudang.');
    },
    [db, requireActor, showToast]
  );

  const createPartialReturn = useCallback(
    (input: engine.PartialReturnInput) => {
      const actor = requireActor();
      const next = engine.createPartialReturn(db, actor, input);
      setDb(next);
      showToast('success', 'Retur sebagian dicatat & stok barang dikembalikan ke gudang.');
    },
    [db, requireActor, showToast]
  );

  const updateTransactionShipping = useCallback(
    (input: {
      txId: string;
      shippingStatus: ShippingStatus;
      courierName?: string;
      trackingNumber?: string;
    }) => {
      const actor = requireActor();
      const next = engine.updateTransactionShipping(db, actor, input);
      setDb(next);
      showToast('success', 'Status pengiriman & nomor resi diperbarui.');
    },
    [db, requireActor, showToast]
  );

  const adjustStock = useCallback(
    (input: engine.AdjustStockInput) => {
      const actor = requireActor();
      const next = engine.adjustStock(db, actor, input);
      setDb(next);
      showToast('success', 'Penyesuaian stok berhasil dicatat.');
    },
    [db, requireActor, showToast]
  );

  const recordInstallmentPayment = useCallback(
    (input: engine.RecordInstallmentPaymentInput) => {
      const actor = requireActor();
      const res = engine.recordInstallmentPayment(db, actor, input);
      setDb(res.state);
      showToast('success', `Pembayaran ${res.payment.receiptNumber} berhasil dicatat.`);
      return { payment: res.payment, plan: res.plan };
    },
    [db, requireActor, showToast]
  );

  const recordCustomerBulkPayment = useCallback(
    (input: engine.CustomerBulkPaymentInput) => {
      const actor = requireActor();
      const res = engine.recordCustomerBulkPayment(db, actor, input);
      setDb(res.state);
      showToast(
        'success',
        `Transfer dialokasikan otomatis ke ${res.affectedPlans.length} nota (${res.settledCount} lunas).`
      );
      return {
        settledCount: res.settledCount,
        affectedPlans: res.affectedPlans,
        receipts: res.receipts,
      };
    },
    [db, requireActor, showToast]
  );

  const createManualPaymentPlan = useCallback(
    (input: engine.CreateManualPlanInput) => {
      const actor = requireActor();
      const res = engine.createManualPaymentPlan(db, actor, input);
      setDb(res.state);
      showToast('success', `Skema kredit ${res.plan.planNumber} berhasil dibuat.`);
      return res.plan;
    },
    [db, requireActor, showToast]
  );

  const upsertProduct = useCallback(
    (input: engine.UpsertProductInput) => {
      const actor = requireActor();
      const next = engine.upsertProduct(db, actor, input);
      setDb(next);
      showToast('success', input.id ? 'Produk berhasil diperbarui.' : 'Produk baru ditambahkan.');
    },
    [db, requireActor, showToast]
  );

  const bulkUpdateProducts = useCallback(
    (patches: engine.BulkProductPatch[]) => {
      const actor = requireActor();
      const res = engine.bulkUpdateProducts(db, actor, patches);
      setDb(res.state);
      showToast('success', `Edit massal berhasil menyimpan ${res.updatedCount} SKU.`);
      return res.updatedCount;
    },
    [db, requireActor, showToast]
  );

  const deleteProduct = useCallback(
    (productId: string) => {
      const actor = requireActor();
      const next = engine.deleteProduct(db, actor, productId);
      setDb(next);
      showToast('success', 'Produk berhasil dihapus.');
    },
    [db, requireActor, showToast]
  );

  const importProductsBulk = useCallback(
    (rows: CsvProductRow[]) => {
      const actor = requireActor();
      const res = engine.importProductsBulk(db, actor, rows);
      setDb(res.state);
      showToast(
        'success',
        `Import CSV selesai: ${res.inserted} produk ditambah, ${res.updated} diperbarui.`
      );
      return { inserted: res.inserted, updated: res.updated };
    },
    [db, requireActor, showToast]
  );

  const upsertCustomer = useCallback(
    (input: engine.UpsertCustomerInput) => {
      const actor = requireActor();
      const res = engine.upsertCustomer(db, actor, input);
      setDb(res.state);
      showToast('success', input.id ? 'Data pelanggan diperbarui.' : 'Pelanggan baru ditambahkan.');
      return res.customer;
    },
    [db, requireActor, showToast]
  );

  const deleteCustomer = useCallback(
    (customerId: string) => {
      const actor = requireActor();
      const next = engine.deleteCustomer(db, actor, customerId);
      setDb(next);
      showToast('success', 'Data pelanggan dihapus.');
    },
    [db, requireActor, showToast]
  );

  const upsertSupplier = useCallback(
    (input: engine.UpsertSupplierInput) => {
      const actor = requireActor();
      const res = engine.upsertSupplier(db, actor, input);
      setDb(res.state);
      showToast('success', input.id ? 'Data supplier diperbarui.' : 'Supplier baru ditambahkan.');
      return res.supplier;
    },
    [db, requireActor, showToast]
  );

  const deleteSupplier = useCallback(
    (supplierId: string) => {
      const actor = requireActor();
      const next = engine.deleteSupplier(db, actor, supplierId);
      setDb(next);
      showToast('success', 'Supplier dihapus.');
    },
    [db, requireActor, showToast]
  );

  const createPurchaseOrder = useCallback(
    (input: engine.CreatePurchaseOrderInput) => {
      const actor = requireActor();
      const res = engine.createPurchaseOrder(db, actor, input);
      setDb(res.state);
      showToast('success', `PO ${res.po.poNumber} tersimpan, stok & HPP otomatis diperbarui.`);
      return res.po;
    },
    [db, requireActor, showToast]
  );

  const payPurchaseOrder = useCallback(
    (input: {
      poId: string;
      amount: number;
      paymentMethod: 'CASH' | 'TRANSFER' | 'QRIS';
      notes?: string;
    }) => {
      const actor = requireActor();
      const next = engine.payPurchaseOrder(db, actor, input);
      setDb(next);
      showToast('success', 'Pembayaran hutang supplier berhasil dicatat.');
    },
    [db, requireActor, showToast]
  );

  const createExpense = useCallback(
    (input: engine.CreateExpenseInput) => {
      const actor = requireActor();
      const next = engine.createExpense(db, actor, input);
      setDb(next);
      showToast('success', 'Pengeluaran operasional berhasil dicatat.');
    },
    [db, requireActor, showToast]
  );

  const deleteExpense = useCallback(
    (expenseId: string) => {
      const actor = requireActor();
      const next = engine.deleteExpense(db, actor, expenseId);
      setDb(next);
      showToast('success', 'Catatan pengeluaran dihapus.');
    },
    [db, requireActor, showToast]
  );

  const saveHoldOrder = useCallback(
    (input: Omit<HoldOrder, 'id' | 'createdAt'>) => {
      const actor = requireActor();
      const next = engine.saveHoldOrder(db, actor, input);
      setDb(next);
      showToast('info', 'Keranjang disimpan ke daftar Pesanan Ditahan.');
    },
    [db, requireActor, showToast]
  );

  const deleteHoldOrder = useCallback(
    (holdId: string) => {
      setDb((prev) => engine.deleteHoldOrder(prev, holdId));
    },
    []
  );

  const openCashierShift = useCallback(
    (openingCash: number, notes?: string) => {
      const actor = requireActor();
      const next = engine.openCashierShift(db, actor, openingCash, notes);
      setDb(next);
      showToast('success', 'Shift kasir dibuka.');
    },
    [db, requireActor, showToast]
  );

  const closeCashierShift = useCallback(
    (actualCash: number, notes?: string) => {
      const actor = requireActor();
      const res = engine.closeCashierShift(db, actor, actualCash, notes);
      setDb(res.state);
      showToast('success', 'Shift kasir ditutup & direkonsiliasi.');
      return res.closedShift;
    },
    [db, requireActor, showToast]
  );

  const upsertUser = useCallback(
    (input: engine.UpsertUserInput) => {
      const actor = requireActor();
      const next = engine.upsertUser(db, actor, input);
      setDb(next);
      showToast('success', input.id ? 'Akun user diperbarui.' : 'User baru berhasil dibuat.');
    },
    [db, requireActor, showToast]
  );

  const deleteUser = useCallback(
    (userId: string) => {
      const actor = requireActor();
      const next = engine.deleteUser(db, actor, userId);
      setDb(next);
      showToast('success', 'Akun user dihapus.');
    },
    [db, requireActor, showToast]
  );

  const updateSettings = useCallback(
    (partial: Partial<CompanySettings>) => {
      const actor = requireActor();
      const next = engine.updateSettings(db, actor, partial);
      setDb(next);
      showToast('success', 'Pengaturan sistem berhasil disimpan.');
    },
    [db, requireActor, showToast]
  );

  const exportBackupJson = useCallback(() => {
    const actor = requireActor();
    if (!hasPermission(actor.role, 'backup:manage')) {
      throw new Error('Hanya Super Admin yang dapat mengekspor backup basis data.');
    }
    const nowIso = new Date().toISOString();
    const stampedDb: DatabaseState = {
      ...db,
      settings: { ...db.settings, lastBackupAt: nowIso },
    };
    setDb(stampedDb);
    const payload = JSON.stringify(stampedDb, null, 2);
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `indobacco-backup-${toLocalDateISO()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('success', 'File backup JSON berhasil diunduh.');
  }, [db, requireActor, showToast]);

  const restoreBackupJson = useCallback(
    (parsed: unknown) => {
      const actor = requireActor();
      const next = engine.validateAndRestoreBackup(actor, parsed);
      setDb(next);
      showToast('success', 'Basis data berhasil di-restore dari file backup JSON.');
    },
    [requireActor, showToast]
  );

  const resetOperationalData = useCallback(() => {
    const actor = requireActor();
    if (!hasPermission(actor.role, 'backup:manage')) {
      throw new Error('Hanya Super Admin yang dapat mereset data operasional.');
    }
    setDb((prev) => ({
      ...prev,
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
        ...prev.settings,
        nextInvoiceSeq: 1,
        nextReceiptSeq: 1,
        nextSuratJalanSeq: 1,
        nextPlanSeq: 1,
        nextPoSeq: 1,
      },
    }));
    setActiveView('dashboard');
    showToast('info', 'Data operasional dikosongkan. Master produk & akun tetap aman.');
  }, [requireActor, showToast]);

  const clearAllData = useCallback(() => {
    const actor = requireActor();
    if (!hasPermission(actor.role, 'backup:manage')) {
      throw new Error('Hanya Super Admin yang dapat mengosongkan seluruh data.');
    }
    const fresh = createEmptyDatabase();
    setDb((prev) => ({
      ...fresh,
      users: prev.users,
      settings: {
        ...prev.settings,
        nextInvoiceSeq: 1,
        nextReceiptSeq: 1,
        nextSuratJalanSeq: 1,
        nextPlanSeq: 1,
        nextPoSeq: 1,
      },
    }));
    setActiveView('dashboard');
    showToast('info', 'Seluruh produk dan data operasional telah dikosongkan.');
  }, [requireActor, showToast]);

  const value: ErpContextValue = {
    db,
    currentUser,
    activeView,
    setActiveView,
    can,
    login,
    logout,
    printRequest,
    openPrint,
    closePrint,
    toast,
    showToast,
    dismissToast,
    createSale,
    voidTransaction,
    createPartialReturn,
    updateTransactionShipping,
    adjustStock,
    recordInstallmentPayment,
    recordCustomerBulkPayment,
    createManualPaymentPlan,
    upsertProduct,
    bulkUpdateProducts,
    deleteProduct,
    importProductsBulk,
    upsertCustomer,
    deleteCustomer,
    upsertSupplier,
    deleteSupplier,
    createPurchaseOrder,
    payPurchaseOrder,
    createExpense,
    deleteExpense,
    saveHoldOrder,
    deleteHoldOrder,
    openCashierShift,
    closeCashierShift,
    upsertUser,
    deleteUser,
    updateSettings,
    exportBackupJson,
    restoreBackupJson,
    resetOperationalData,
    clearAllData,
  };

  return <ErpContext.Provider value={value}>{children}</ErpContext.Provider>;
};

export function useErp(): ErpContextValue {
  const ctx = useContext(ErpContext);
  if (!ctx) throw new Error('useErp must be used inside ErpProvider');
  return ctx;
}

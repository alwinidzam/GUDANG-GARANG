import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getDefaultViewForRole, hasPermission, Permission } from '../lib/rbac';
import { createSeedData } from '../lib/seedData';
import { hashPassword, toLocalDateISO } from '../lib/format';
import * as engine from '../lib/storeEngine';
import { CsvProductRow } from '../lib/csv';
import {
  AppView,
  CompanySettings,
  Customer,
  DatabaseState,
  InstallmentPaymentRecord,
  PaymentPlan,
  PrintRequest,
  Transaction,
  User,
} from '../types/erp';

const DB_STORAGE_KEY = 'indobacco_erp_v1';
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
  quickDemoLogin: (userId: string) => void;
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
  adjustStock: (input: engine.AdjustStockInput) => void;
  recordInstallmentPayment: (
    input: engine.RecordInstallmentPaymentInput
  ) => { payment: InstallmentPaymentRecord; plan: PaymentPlan };
  createManualPaymentPlan: (input: engine.CreateManualPlanInput) => PaymentPlan;
  upsertProduct: (input: engine.UpsertProductInput) => void;
  deleteProduct: (productId: string) => void;
  importProductsBulk: (rows: CsvProductRow[]) => { inserted: number; updated: number };
  upsertCustomer: (input: engine.UpsertCustomerInput) => Customer;
  deleteCustomer: (customerId: string) => void;
  upsertUser: (input: engine.UpsertUserInput) => void;
  deleteUser: (userId: string) => void;
  updateSettings: (partial: Partial<CompanySettings>) => void;
  exportBackupJson: () => void;
  restoreBackupJson: (parsed: unknown) => void;
  resetDemoData: () => void;
}

const ErpContext = createContext<ErpContextValue | null>(null);

function loadInitialDb(): DatabaseState {
  try {
    const raw = localStorage.getItem(DB_STORAGE_KEY);
    if (!raw) return createSeedData();
    const parsed = JSON.parse(raw) as Partial<DatabaseState>;
    if (
      parsed &&
      parsed.schemaVersion === 1 &&
      Array.isArray(parsed.users) &&
      Array.isArray(parsed.products) &&
      Array.isArray(parsed.customers) &&
      Array.isArray(parsed.transactions) &&
      Array.isArray(parsed.stockMovements) &&
      Array.isArray(parsed.paymentPlans) &&
      Array.isArray(parsed.auditLogs) &&
      parsed.settings
    ) {
      return parsed as DatabaseState;
    }
    return createSeedData();
  } catch {
    return createSeedData();
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

  const quickDemoLogin = useCallback(
    (userId: string) => {
      const found = db.users.find((u) => u.id === userId && u.isActive);
      if (!found) {
        throw new Error('Akun demo tidak tersedia atau nonaktif.');
      }
      setSessionUserId(found.id);
      setActiveView(getDefaultViewForRole(found.role));
      showToast('info', `Masuk sebagai ${found.name} (${found.role}).`);
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
    const payload = JSON.stringify(db, null, 2);
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

  const resetDemoData = useCallback(() => {
    const actor = requireActor();
    if (!hasPermission(actor.role, 'backup:manage')) {
      throw new Error('Hanya Super Admin yang dapat mereset data demo.');
    }
    const fresh = createSeedData();
    setDb(fresh);
    setSessionUserId('usr_admin');
    setActiveView('dashboard');
    showToast('info', 'Basis data dikembalikan ke data awal Indobacco.');
  }, [requireActor, showToast]);

  const value: ErpContextValue = {
    db,
    currentUser,
    activeView,
    setActiveView,
    can,
    login,
    quickDemoLogin,
    logout,
    printRequest,
    openPrint,
    closePrint,
    toast,
    showToast,
    dismissToast,
    createSale,
    voidTransaction,
    adjustStock,
    recordInstallmentPayment,
    createManualPaymentPlan,
    upsertProduct,
    deleteProduct,
    importProductsBulk,
    upsertCustomer,
    deleteCustomer,
    upsertUser,
    deleteUser,
    updateSettings,
    exportBackupJson,
    restoreBackupJson,
    resetDemoData,
  };

  return <ErpContext.Provider value={value}>{children}</ErpContext.Provider>;
};

export function useErp(): ErpContextValue {
  const ctx = useContext(ErpContext);
  if (!ctx) throw new Error('useErp must be used inside ErpProvider');
  return ctx;
}

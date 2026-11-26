import React from 'react';
import { X, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import {
  CustomerType,
  PaymentMethod,
  PaymentPlanStatus,
  Role,
  StockMovementType,
  TransactionStatus,
} from '../../types/erp';
import { getRoleLabel } from '../../lib/rbac';
import { ToastMessage } from '../../context/ErpContext';

export const RoleBadge: React.FC<{ role: Role }> = ({ role }) => {
  const styles: Record<Role, string> = {
    SUPER_ADMIN: 'bg-red-950/15 text-red-800 border-red-300',
    MANAGER: 'bg-amber-500/15 text-amber-800 border-amber-300',
    KASIR: 'bg-sky-500/15 text-sky-800 border-sky-300',
    OWNER: 'bg-stone-800 text-amber-300 border-stone-700',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${styles[role]}`}
    >
      {getRoleLabel(role)}
    </span>
  );
};

export const PaymentMethodBadge: React.FC<{ method: PaymentMethod }> = ({ method }) => {
  const map: Record<PaymentMethod, { label: string; cls: string }> = {
    CASH: { label: 'Tunai', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    TRANSFER: { label: 'Transfer Bank', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    QRIS: { label: 'QRIS', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
    CREDIT: { label: 'Kredit / Tempo', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  };
  const item = map[method];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${item.cls}`}>
      {item.label}
    </span>
  );
};

export const TxStatusBadge: React.FC<{ status: TransactionStatus }> = ({ status }) => {
  if (status === 'VOIDED') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
        Dibatalkan (Void)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
      Selesai
    </span>
  );
};

export const MovementBadge: React.FC<{ type: StockMovementType }> = ({ type }) => {
  const map: Record<StockMovementType, { label: string; cls: string }> = {
    INBOUND: { label: 'Stok Masuk', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    OUTBOUND: { label: 'Stok Keluar', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
    DAMAGED_EXPIRED: {
      label: 'Rusak / Expired',
      cls: 'bg-rose-50 text-rose-700 border-rose-200',
    },
    SALE: { label: 'Penjualan POS', cls: 'bg-stone-100 text-stone-700 border-stone-200' },
    VOID_RETURN: {
      label: 'Retur Void',
      cls: 'bg-sky-50 text-sky-700 border-sky-200',
    },
  };
  const info = map[type];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${info.cls}`}>
      {info.label}
    </span>
  );
};

export const CustomerTypeBadge: React.FC<{ type: CustomerType }> = ({ type }) => {
  const map: Record<CustomerType, { label: string; cls: string }> = {
    RETAIL: { label: 'Retail', cls: 'bg-stone-100 text-stone-700 border-stone-200' },
    GROSIR: { label: 'Grosir', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
    DISTRIBUTOR: {
      label: 'Distributor',
      cls: 'bg-red-50 text-red-800 border-red-200',
    },
  };
  const info = map[type];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${info.cls}`}>
      {info.label}
    </span>
  );
};

export const PlanStatusBadge: React.FC<{ status: PaymentPlanStatus; isOverdue?: boolean }> = ({
  status,
  isOverdue,
}) => {
  if (status === 'VOIDED') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-stone-100 text-stone-500 border border-stone-200">
        Dibatalkan
      </span>
    );
  }
  if (status === 'PAID') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        Lunas
      </span>
    );
  }
  if (isOverdue) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-600 text-white border border-rose-700">
        Terlambat
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
      Berjalan
    </span>
  );
};

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidth?: string;
  children: React.ReactNode;
}> = ({ open, onClose, title, subtitle, maxWidth = 'max-w-lg', children }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px] p-4 overflow-y-auto">
      <div
        className={`relative w-full ${maxWidth} bg-white border border-[#E6E0D6] rounded-xl shadow-2xl overflow-hidden my-auto`}
      >
        <div className="flex items-start justify-between px-6 py-4 border-b border-[#E6E0D6] bg-[#F8F6F2]">
          <div>
            <h3 className="text-base font-bold text-[#1A1614]">{title}</h3>
            {subtitle && <p className="text-xs text-[#6B6257] mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#6B6257] hover:text-[#1A1614] hover:bg-[#E6E0D6]/50 transition-colors"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

export const ToastBanner: React.FC<{ toast: ToastMessage | null; onDismiss: () => void }> = ({
  toast,
  onDismiss,
}) => {
  if (!toast) return null;
  const styles = {
    success: 'bg-emerald-950 text-emerald-50 border-emerald-700',
    error: 'bg-rose-950 text-rose-50 border-rose-700',
    info: 'bg-[#14110F] text-amber-50 border-amber-700/60',
  }[toast.type];
  const Icon =
    toast.type === 'success' ? CheckCircle2 : toast.type === 'error' ? AlertCircle : Info;

  return (
    <div className="fixed bottom-5 right-5 z-[60] max-w-md animate-in fade-in slide-in-from-bottom-2">
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl ${styles}`}
      >
        <Icon className="w-5 h-5 shrink-0" />
        <p className="text-sm font-medium leading-snug">{toast.message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="ml-2 p-1 rounded hover:bg-white/10"
          aria-label="Tutup notifikasi"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

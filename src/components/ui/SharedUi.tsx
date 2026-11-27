import React, { useEffect, useId, useRef, useState } from 'react';
import { X, AlertCircle, CheckCircle2, Info, Sun, Moon, Monitor } from 'lucide-react';
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
import { ThemePreference, useTheme } from '../../context/ThemeContext';

export const MacWindowDots: React.FC<{
  onClose: () => void;
  onMinimize?: () => void;
  onToggleExpand?: () => void;
  isExpanded?: boolean;
  isMinimized?: boolean;
}> = ({ onClose, onMinimize, onToggleExpand, isExpanded, isMinimized }) => {
  return (
    <div className="inline-flex items-center gap-2 shrink-0" role="group" aria-label="Kontrol jendela">
      <button
        type="button"
        onClick={onClose}
        aria-label="Tutup jendela"
        title="Tutup (Esc)"
        className="w-3 h-3 rounded-full bg-[#FF5F57] ring-1 ring-inset ring-black/15 hover:brightness-90 active:brightness-75 transition"
      />
      <button
        type="button"
        onClick={onMinimize || onClose}
        aria-label={isMinimized ? 'Kembalikan isi jendela' : 'Perkecil isi jendela'}
        title={isMinimized ? 'Tampilkan isi jendela' : 'Perkecil isi jendela'}
        className="w-3 h-3 rounded-full bg-[#FEBC2E] ring-1 ring-inset ring-black/15 hover:brightness-90 active:brightness-75 transition"
      />
      <button
        type="button"
        onClick={onToggleExpand || onClose}
        aria-label={isExpanded ? 'Kembalikan ukuran jendela' : 'Perbesar ukuran jendela'}
        title={isExpanded ? 'Ukuran normal' : 'Perbesar jendela'}
        className="w-3 h-3 rounded-full bg-[#28C840] ring-1 ring-inset ring-black/15 hover:brightness-90 active:brightness-75 transition"
      />
    </div>
  );
};

const StatusIndicator: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <span style={{ color }} className="inline-flex items-center gap-1.5 text-xs font-semibold">
    <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" aria-hidden="true" />
    {label}
  </span>
);

export const RoleBadge: React.FC<{ role: Role }> = ({ role }) => {
  const colors: Record<Role, string> = {
    SUPER_ADMIN: 'var(--accent-primary-text)',
    MANAGER: 'var(--accent-gold)',
    KASIR: 'var(--status-info)',
    OWNER: 'var(--text-primary)',
  };
  return <StatusIndicator color={colors[role]} label={getRoleLabel(role)} />;
};

export const PaymentMethodBadge: React.FC<{ method: PaymentMethod }> = ({ method }) => {
  const map: Record<PaymentMethod, { label: string; color: string }> = {
    CASH: { label: 'Tunai', color: 'var(--status-positive)' },
    TRANSFER: { label: 'Transfer Bank', color: 'var(--status-info)' },
    QRIS: { label: 'QRIS', color: 'var(--text-primary)' },
    CREDIT: { label: 'Kredit / Tempo', color: 'var(--accent-gold)' },
  };
  const item = map[method];
  return <StatusIndicator color={item.color} label={item.label} />;
};

export const TxStatusBadge: React.FC<{ status: TransactionStatus }> = ({ status }) => {
  if (status === 'VOIDED') {
    return <StatusIndicator color="var(--status-danger)" label="Dibatalkan (Void)" />;
  }
  return <StatusIndicator color="var(--status-positive)" label="Selesai" />;
};

export const MovementBadge: React.FC<{ type: StockMovementType }> = ({ type }) => {
  const map: Record<StockMovementType, { label: string; color: string }> = {
    INBOUND: { label: 'Stok Masuk', color: 'var(--status-positive)' },
    PURCHASE: { label: 'Pembelian PO', color: 'var(--status-positive)' },
    OUTBOUND: { label: 'Stok Keluar', color: 'var(--accent-gold)' },
    DAMAGED_EXPIRED: { label: 'Rusak / Expired', color: 'var(--status-danger)' },
    SALE: { label: 'Penjualan POS', color: 'var(--text-primary)' },
    VOID_RETURN: { label: 'Retur Void', color: 'var(--status-info)' },
    PARTIAL_RETURN: { label: 'Retur Sebagian', color: 'var(--status-info)' },
  };
  const info = map[type];
  return <StatusIndicator color={info.color} label={info.label} />;
};

export const CustomerTypeBadge: React.FC<{ type: CustomerType }> = ({ type }) => {
  const map: Record<CustomerType, { label: string; color: string }> = {
    RETAIL: { label: 'Retail', color: 'var(--text-secondary)' },
    GROSIR: { label: 'Grosir', color: 'var(--accent-gold)' },
    DISTRIBUTOR: { label: 'Distributor', color: 'var(--accent-primary-text)' },
  };
  const info = map[type];
  return <StatusIndicator color={info.color} label={info.label} />;
};

export const PlanStatusBadge: React.FC<{ status: PaymentPlanStatus; isOverdue?: boolean }> = ({
  status,
  isOverdue,
}) => {
  if (status === 'VOIDED') {
    return <StatusIndicator color="var(--text-secondary)" label="Dibatalkan" />;
  }
  if (status === 'PAID') {
    return <StatusIndicator color="var(--status-positive)" label="Lunas" />;
  }
  if (isOverdue) {
    return <StatusIndicator color="var(--status-danger)" label="Terlambat" />;
  }
  return <StatusIndicator color="var(--accent-gold)" label="Berjalan" />;
};

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidth?: string;
  children: React.ReactNode;
}> = ({ open, onClose, title, subtitle, maxWidth = 'max-w-lg', children }) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!open) {
      setMinimized(false);
      setExpanded(false);
      return;
    }
    const prevFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      prevFocus?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-hairline)',
          color: 'var(--text-primary)',
          maxWidth: expanded ? 'min(92vw, 896px)' : undefined,
        }}
        className={`relative w-full ${expanded ? '' : maxWidth} border rounded-2xl shadow-2xl overflow-hidden my-auto`}
      >
        {/* Authentic macOS Window Title Bar: symmetric 3-column grid so title is mathematically centered */}
        <div
          style={{
            backgroundColor: 'var(--bg-subtle)',
            borderColor: 'var(--border-hairline)',
          }}
          className="grid grid-cols-[56px_1fr_56px] items-center h-11 px-4 border-b gap-2"
        >
          <MacWindowDots
            onClose={onClose}
            onMinimize={() => setMinimized((m) => !m)}
            onToggleExpand={() => {
              setMinimized(false);
              setExpanded((ex) => !ex);
            }}
            isMinimized={minimized}
            isExpanded={expanded}
          />
          <h3 id={titleId} className="text-[13px] font-semibold tracking-tight truncate text-center">
            {title}
          </h3>
          <span aria-hidden="true" />
        </div>

        {minimized ? (
          <div className="px-5 py-3 flex items-center justify-between text-xs">
            <span style={{ color: 'var(--text-secondary)' }}>
              Isi jendela diperkecil. Klik titik kuning atau Kembalikan untuk melanjutkan.
            </span>
            <button
              type="button"
              onClick={() => setMinimized(false)}
              className="min-h-[36px] px-3 py-1 rounded-lg hig-btn-secondary font-semibold"
            >
              Kembalikan
            </button>
          </div>
        ) : (
          <div className="p-6 max-h-[80vh] overflow-y-auto">
            {subtitle && (
              <p style={{ color: 'var(--text-secondary)' }} className="text-xs -mt-1 mb-4">
                {subtitle}
              </p>
            )}
            {children}
          </div>
        )}
      </div>
    </div>
  );
};

export const EmptyState: React.FC<{
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ icon: Icon, title, description, actionLabel, onAction }) => (
  <div className="py-10 px-6 text-center flex flex-col items-center justify-center">
    {Icon && (
      <div
        style={{ backgroundColor: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}
        className="w-11 h-11 rounded-full flex items-center justify-center mb-3"
      >
        <Icon className="w-5 h-5" aria-hidden="true" />
      </div>
    )}
    <p className="text-sm font-bold">{title}</p>
    <p style={{ color: 'var(--text-secondary)' }} className="text-xs mt-1 max-w-sm">
      {description}
    </p>
    {actionLabel && onAction && (
      <button
        type="button"
        onClick={onAction}
        className="mt-4 min-h-[44px] px-4 py-2 rounded-lg hig-btn-secondary text-xs font-semibold"
      >
        {actionLabel}
      </button>
    )}
  </div>
);

export const ThemeSegmentedControl: React.FC = () => {
  const { preference, setPreference } = useTheme();
  const options: Array<{
    id: ThemePreference;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'light', label: 'Terang', Icon: Sun },
    { id: 'dark', label: 'Gelap', Icon: Moon },
    { id: 'auto', label: 'Auto', Icon: Monitor },
  ];

  return (
    <div
      role="group"
      aria-label="Mode tampilan"
      style={{
        backgroundColor: 'var(--bg-subtle)',
        borderColor: 'var(--border-hairline)',
      }}
      className="inline-flex items-center p-0.5 rounded-lg border"
    >
      {options.map(({ id, label, Icon }) => {
        const active = preference === id;
        return (
          <button
            key={id}
            type="button"
            aria-label={`Mode ${label}`}
            aria-pressed={active}
            onClick={() => setPreference(id)}
            style={
              active
                ? {
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    borderColor: 'var(--border-hairline)',
                  }
                : {
                    color: 'var(--text-secondary)',
                    borderColor: 'transparent',
                  }
            }
            className="min-h-[38px] sm:min-h-[34px] px-2.5 py-1 rounded-md border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
          >
            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
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
    info: 'bg-[#18181B] text-white border-[#3F3F46]',
  }[toast.type];
  const Icon =
    toast.type === 'success' ? CheckCircle2 : toast.type === 'error' ? AlertCircle : Info;

  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      className="fixed top-16 right-4 z-[60] max-w-md"
    >
      <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border shadow-xl ${styles}`}>
        <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
        <p className="text-sm font-medium leading-snug">{toast.message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="ml-1 min-w-[44px] min-h-[44px] -mr-2 rounded-lg flex items-center justify-center hover:bg-white/10"
          aria-label="Tutup notifikasi"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

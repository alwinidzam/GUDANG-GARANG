import React, { useMemo, useState } from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  ReceiptText,
  CreditCard,
  Boxes,
  Users,
  BarChart3,
  ShieldAlert,
  UserCog,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { getPlanMetrics } from '../lib/calculations';
import { getRoleLabel, Permission } from '../lib/rbac';
import { formatDate, toLocalDateISO } from '../lib/format';
import { AppView } from '../types/erp';

interface NavItem {
  id: AppView;
  label: string;
  permission: Permission;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  badgeColor?: 'amber' | 'rose';
}

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { db, currentUser, activeView, setActiveView, can, logout } = useErp();
  const [mobileOpen, setMobileOpen] = useState(false);

  const alerts = useMemo(() => {
    const lowStock = db.products.filter((p) => p.stock <= p.minStock).length;
    const today = toLocalDateISO();
    const overdue = db.paymentPlans.filter(
      (pl) => pl.status === 'ACTIVE' && getPlanMetrics(pl, today).isOverdue
    ).length;
    return { lowStock, overdue };
  }, [db.products, db.paymentPlans]);

  const navGroups: Array<{ title: string; items: NavItem[] }> = useMemo(
    () => [
      {
        title: 'Utama & Operasional',
        items: [
          {
            id: 'dashboard',
            label: 'Dashboard Eksekutif',
            permission: 'view:dashboard',
            icon: LayoutDashboard,
          },
          {
            id: 'pos',
            label: 'Kasir & POS',
            permission: 'view:pos',
            icon: ShoppingCart,
          },
          {
            id: 'transactions',
            label: 'Transaksi & Invoice',
            permission: 'view:transactions',
            icon: ReceiptText,
          },
          {
            id: 'receivables',
            label: 'Piutang & Cicilan',
            permission: 'view:receivables',
            icon: CreditCard,
            badge: alerts.overdue || undefined,
            badgeColor: 'rose',
          },
        ],
      },
      {
        title: 'Gudang & Master Data',
        items: [
          {
            id: 'warehouse',
            label: 'Stok & Gudang',
            permission: 'view:warehouse',
            icon: Package,
            badge: alerts.lowStock || undefined,
            badgeColor: 'amber',
          },
          {
            id: 'products',
            label: 'Master Produk',
            permission: 'view:products',
            icon: Boxes,
          },
          {
            id: 'customers',
            label: 'Data Pelanggan',
            permission: 'view:customers',
            icon: Users,
          },
        ],
      },
      {
        title: 'Analitik & Kontrol',
        items: [
          {
            id: 'reports',
            label: 'Laporan Keuangan',
            permission: 'view:reports',
            icon: BarChart3,
          },
          {
            id: 'audit',
            label: 'Audit Logs',
            permission: 'view:audit',
            icon: ShieldAlert,
          },
          {
            id: 'users',
            label: 'Manajemen User',
            permission: 'view:users',
            icon: UserCog,
          },
          {
            id: 'settings',
            label: 'Pengaturan & Backup',
            permission: 'view:settings',
            icon: Settings,
          },
        ],
      },
    ],
    [alerts.lowStock, alerts.overdue]
  );

  const activeLabel = useMemo(() => {
    for (const g of navGroups) {
      const found = g.items.find((i) => i.id === activeView);
      if (found) return found.label;
    }
    return 'Indobacco ERP';
  }, [activeView, navGroups]);

  const handleNav = (view: AppView) => {
    setActiveView(view);
    setMobileOpen(false);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#14110F] text-[#E7E0D8] select-none">
      {/* Brand Header on Deep Obsidian */}
      <div className="px-4 py-4 border-b border-[#2A231E] flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-[#1D1815] border border-[#342B24] p-1 shrink-0 flex items-center justify-center">
          <img
            src="/Indobacco_transparent.svg"
            alt="Logo Indobacco"
            className="w-full h-full object-contain"
          />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-white tracking-tight truncate">
            INDOBACCO
          </p>
          <p className="text-[11px] text-amber-400/90 font-medium truncate">
            Tobacco ERP &amp; POS
          </p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter((item) => can(item.permission));
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.title}>
              <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-widest text-[#7E7367]">
                {group.title}
              </p>
              <div className="space-y-1">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeView === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNav(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-[#B91C1C] text-white shadow-sm'
                          : 'text-[#C8BFB4] hover:bg-[#221C18] hover:text-white'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Icon
                          className={`w-4 h-4 shrink-0 ${
                            isActive ? 'text-white' : 'text-[#9F9386]'
                          }`}
                        />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.badge !== undefined && (
                        <span
                          className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${
                            item.badgeColor === 'rose'
                              ? 'bg-rose-500 text-white'
                              : 'bg-amber-400 text-[#14110F]'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Current User Footer */}
      {currentUser && (
        <div className="p-3 border-t border-[#2A231E] bg-[#191512]">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">{currentUser.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-[11px] font-semibold text-amber-300">
                  {getRoleLabel(currentUser.role)}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={logout}
              title="Keluar dari sistem"
              className="p-2 rounded-lg text-[#B8AEA2] hover:text-white hover:bg-[#2C241E] transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#F8F6F2] text-[#1A1614]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 border-r border-[#2A231E] sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-68 max-w-[82vw] h-full z-10 shadow-2xl">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10"
              aria-label="Tutup menu"
            >
              <X className="w-5 h-5" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-[#E6E0D6] px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-[#E6E0D6] text-[#1A1614] hover:bg-[#F1EDE5]"
              aria-label="Buka menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-extrabold text-[#1A1614] truncate">
                {activeLabel}
              </h1>
              <p className="text-xs text-[#6B6257] truncate hidden sm:block">
                {db.settings.companyName} • {formatDate(toLocalDateISO())}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {alerts.overdue > 0 && can('view:receivables') && (
              <button
                type="button"
                onClick={() => setActiveView('receivables')}
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 cursor-pointer"
              >
                <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
                {alerts.overdue} Piutang Jatuh Tempo
              </button>
            )}
            {alerts.lowStock > 0 && can('view:warehouse') && (
              <button
                type="button"
                onClick={() => setActiveView('warehouse')}
                className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 cursor-pointer"
              >
                {alerts.lowStock} Stok Menipis
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-[1600px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

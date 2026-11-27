import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Search,
  ChevronDown,
  ChevronRight,
  Plus,
  Truck,
  Wallet,
} from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { getPlanMetrics } from '../lib/calculations';
import { getDefaultViewForRole, getRoleLabel, Permission } from '../lib/rbac';
import { toLocalDateISO } from '../lib/format';
import { AppView } from '../types/erp';
import { ThemeSegmentedControl } from './ui/SharedUi';

interface NavItem {
  id: AppView;
  label: string;
  permission: Permission;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  badgeType?: 'warning' | 'danger';
}

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { db, currentUser, activeView, setActiveView, can, logout } = useErp();
  const [menuOpen, setMenuOpen] = useState(false);
  const [navSearch, setNavSearch] = useState('');
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && menuOpen) {
        setMenuOpen(false);
        menuBtnRef.current?.focus();
        return;
      }
      if (
        e.key === '/' &&
        document.activeElement &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)
      ) {
        e.preventDefault();
        setMenuOpen(true);
        window.setTimeout(() => searchInputRef.current?.focus(), 40);
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [menuOpen]);

  const alerts = useMemo(() => {
    const lowStock = db.products.filter((p) => p.stock <= p.minStock).length;
    const today = toLocalDateISO();
    const overdue = db.paymentPlans.filter(
      (pl) => pl.status === 'ACTIVE' && getPlanMetrics(pl, today).isOverdue
    ).length;
    const unpaidPo = (db.purchaseOrders || []).filter(
      (po) => po.status === 'UNPAID' || po.status === 'PARTIAL'
    ).length;
    return { lowStock, overdue, unpaidPo };
  }, [db.products, db.paymentPlans, db.purchaseOrders]);

  const navGroups: Array<{ title: string; items: NavItem[] }> = useMemo(
    () => [
      {
        title: 'Utama',
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
            badgeType: 'danger',
          },
        ],
      },
      {
        title: 'Gudang & Master',
        items: [
          {
            id: 'warehouse',
            label: 'Stok & Gudang',
            permission: 'view:warehouse',
            icon: Package,
            badge: alerts.lowStock || undefined,
            badgeType: 'warning',
          },
          {
            id: 'purchases',
            label: 'Pembelian & Supplier',
            permission: 'view:purchases',
            icon: Truck,
            badge: alerts.unpaidPo || undefined,
            badgeType: 'warning',
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
        title: 'Analitik & Sistem',
        items: [
          {
            id: 'expenses',
            label: 'Kas & Pengeluaran',
            permission: 'view:expenses',
            icon: Wallet,
          },
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
    [alerts.lowStock, alerts.overdue, alerts.unpaidPo]
  );

  const activeLabel = useMemo(() => {
    for (const g of navGroups) {
      const found = g.items.find((i) => i.id === activeView);
      if (found) return found.label;
    }
    return 'Indobacco ERP';
  }, [activeView, navGroups]);

  const totalAlerts = useMemo(() => {
    let count = 0;
    if (can('view:receivables')) count += alerts.overdue;
    if (can('view:warehouse')) count += alerts.lowStock;
    if (can('view:purchases')) count += alerts.unpaidPo;
    return count;
  }, [alerts, can]);

  const closeMenu = () => {
    setMenuOpen(false);
    setNavSearch('');
    menuBtnRef.current?.focus();
  };

  const handleNav = (view: AppView) => {
    setActiveView(view);
    setMenuOpen(false);
    setNavSearch('');
  };

  const toggleGroup = (title: string) => {
    setClosedGroups((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const q = navSearch.trim().toLowerCase();
    if (!q) return;
    for (const g of navGroups) {
      const match = g.items.find(
        (it) => can(it.permission) && it.label.toLowerCase().includes(q)
      );
      if (match) {
        handleNav(match.id);
        return;
      }
    }
  };

  const initials = (currentUser?.name || 'ID')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const q = navSearch.trim().toLowerCase();

  return (
    <div
      style={{ backgroundColor: 'var(--bg-canvas)', color: 'var(--text-primary)' }}
      className="min-h-screen flex flex-col"
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[#18181B] focus:text-white focus:font-semibold"
      >
        Lewati ke konten utama
      </a>

      {/* Clean Slide-Over Navigation Drawer (triggered by Menu button on all screens) */}
      {menuOpen && (
        <div
          id="app-nav-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Menu navigasi sistem"
          className="fixed inset-0 z-50 flex"
        >
          <div className="fixed inset-0 bg-black/40" onClick={closeMenu} />
          <aside
            style={{
              backgroundColor: 'var(--bg-sidebar)',
              borderColor: 'var(--border-hairline)',
              color: 'var(--text-primary)',
            }}
            className="relative w-72 max-w-[85vw] h-full z-10 border-r shadow-2xl flex flex-col select-none"
          >
            {/* Brand Header */}
            <div
              style={{ borderColor: 'var(--border-hairline)' }}
              className="px-4 py-3.5 border-b flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#14110F] p-1 shrink-0 flex items-center justify-center border border-black/10">
                  <img
                    src="/Indobacco_transparent.svg"
                    alt="Logo Indobacco"
                    width={28}
                    height={28}
                    className="w-7 h-7 object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-bold tracking-tight truncate">Indobacco</p>
                    <span
                      style={{
                        backgroundColor: 'var(--cta-bg)',
                        color: 'var(--cta-text)',
                      }}
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    >
                      ERP
                    </span>
                  </div>
                  <p
                    style={{ color: 'var(--text-secondary)' }}
                    className="text-[11px] truncate"
                  >
                    {db.settings.email}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeMenu}
                style={{ color: 'var(--text-secondary)' }}
                className="min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                aria-label="Tutup menu navigasi"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {/* Quick Menu Search */}
            <div className="px-3.5 pt-3 pb-1">
              <div className="relative">
                <Search
                  style={{ color: 'var(--text-secondary)' }}
                  className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={navSearch}
                  onChange={(e) => setNavSearch(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  aria-label="Cari menu navigasi"
                  placeholder="Cari menu..."
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-hairline)',
                    color: 'var(--text-primary)',
                  }}
                  className="w-full min-h-[38px] pl-8 pr-8 py-1.5 rounded-lg border text-xs"
                />
                <kbd
                  style={{
                    backgroundColor: 'var(--bg-subtle)',
                    color: 'var(--text-secondary)',
                    borderColor: 'var(--border-hairline)',
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded border pointer-events-none"
                >
                  /
                </kbd>
              </div>
            </div>

            {/* Navigation Groups */}
            <nav aria-label="Menu utama" className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
              {navGroups.map((group) => {
                const visibleItems = group.items.filter(
                  (item) =>
                    can(item.permission) && (!q || item.label.toLowerCase().includes(q))
                );
                if (visibleItems.length === 0) return null;
                const isClosed = !q && Boolean(closedGroups[group.title]);

                return (
                  <div key={group.title}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.title)}
                      aria-expanded={!isClosed}
                      style={{ color: 'var(--text-secondary)' }}
                      className="w-full px-2 py-1 mb-1 flex items-center justify-between text-xs font-semibold hover:text-[var(--text-primary)] rounded"
                    >
                      <span>{group.title}</span>
                      {isClosed ? (
                        <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                    </button>

                    {!isClosed && (
                      <div className="space-y-0.5">
                        {visibleItems.map((item) => {
                          const Icon = item.icon;
                          const isActive = activeView === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => handleNav(item.id)}
                              aria-current={isActive ? 'page' : undefined}
                              style={
                                isActive
                                  ? {
                                      backgroundColor: 'var(--bg-surface)',
                                      borderColor: 'var(--border-hairline)',
                                      color: 'var(--text-primary)',
                                    }
                                  : {
                                      borderColor: 'transparent',
                                      color: 'var(--text-secondary)',
                                    }
                              }
                              className={`w-full min-h-[40px] flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-[13px] transition-colors ${
                                isActive
                                  ? 'font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.05)]'
                                  : 'font-medium hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                              }`}
                            >
                              <span className="flex items-center gap-2.5 min-w-0">
                                <Icon
                                  className={`w-4 h-4 shrink-0 ${
                                    isActive
                                      ? 'text-[var(--accent-primary-text)]'
                                      : 'text-[var(--text-secondary)]'
                                  }`}
                                  aria-hidden="true"
                                />
                                <span className="truncate">{item.label}</span>
                              </span>
                              {item.badge !== undefined && (
                                <span
                                  className={`ml-2 px-1.5 py-0.5 text-[11px] rounded font-bold tabular-nums text-white ${
                                    item.badgeType === 'danger' ? 'bg-[#B91C1C]' : 'bg-[#855D00]'
                                  }`}
                                >
                                  {item.badge}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>

            {/* Drawer Footer: Operator Profile & Logout */}
            {currentUser && (
              <div style={{ borderColor: 'var(--border-hairline)' }} className="p-3 border-t">
                <div
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-hairline)',
                  }}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-xl border"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      style={{
                        backgroundColor: 'var(--cta-bg)',
                        color: 'var(--cta-text)',
                      }}
                      className="w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center shrink-0"
                      aria-hidden="true"
                    >
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">{currentUser.name}</p>
                      <p
                        style={{ color: 'var(--text-secondary)' }}
                        className="text-[11px] truncate"
                      >
                        {getRoleLabel(currentUser.role)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={logout}
                    title="Keluar dari sistem"
                    aria-label="Keluar dari sistem"
                    style={{ color: 'var(--text-secondary)' }}
                    className="min-w-[38px] min-h-[38px] rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  >
                    <LogOut className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Clean Top Toolbar (No Permanent Sidebar — Full-Width Canvas) */}
      <header
        style={{
          backgroundColor: 'var(--toolbar-bg)',
          borderColor: 'var(--border-hairline)',
        }}
        className="sticky top-0 z-30 backdrop-blur-md border-b px-4 sm:px-6 h-14 flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            ref={menuBtnRef}
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-expanded={menuOpen}
            aria-controls="app-nav-drawer"
            className="min-h-[38px] px-3 py-1.5 rounded-lg hig-btn-secondary inline-flex items-center gap-2 text-xs font-semibold shrink-0"
          >
            <Menu className="w-4 h-4" aria-hidden="true" />
            <span>Menu</span>
            {totalAlerts > 0 && (
              <span
                className="w-2 h-2 rounded-full bg-[#B91C1C] shrink-0"
                aria-label={`${totalAlerts} notifikasi aktif`}
              />
            )}
          </button>

          {/* Compact Brand + Breadcrumb */}
          <button
            type="button"
            onClick={() =>
              currentUser && setActiveView(getDefaultViewForRole(currentUser.role))
            }
            className="flex items-center gap-2 min-w-0 rounded-lg py-1 pr-2 hover:opacity-90 text-left"
          >
            <div className="hidden sm:flex w-8 h-8 rounded-lg bg-[#14110F] p-1 shrink-0 items-center justify-center border border-black/10">
              <img
                src="/Indobacco_transparent.svg"
                alt="Logo Indobacco"
                width={24}
                height={24}
                className="w-6 h-6 object-contain"
              />
            </div>
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm min-w-0">
              <span
                style={{ color: 'var(--text-secondary)' }}
                className="hidden sm:inline font-medium truncate"
              >
                Indobacco
              </span>
              <span
                style={{ color: 'var(--text-secondary)' }}
                className="hidden sm:inline"
                aria-hidden="true"
              >
                /
              </span>
              <span className="font-semibold truncate">{activeLabel}</span>
            </nav>
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <ThemeSegmentedControl />
          {can('view:pos') && activeView !== 'pos' && (
            <button
              type="button"
              onClick={() => setActiveView('pos')}
              className="min-h-[38px] px-3.5 py-1.5 hig-btn-cta text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Transaksi POS</span>
              <span className="sm:hidden">POS</span>
            </button>
          )}
          {currentUser && (
            <div
              style={{ borderColor: 'var(--border-hairline)' }}
              className="hidden md:flex items-center gap-2 pl-2 ml-1 border-l"
            >
              <div
                style={{
                  backgroundColor: 'var(--bg-subtle)',
                  color: 'var(--text-primary)',
                  borderColor: 'var(--border-hairline)',
                }}
                className="w-8 h-8 rounded-full border text-[11px] font-bold flex items-center justify-center shrink-0"
                title={`${currentUser.name} (${getRoleLabel(currentUser.role)})`}
                aria-hidden="true"
              >
                {initials}
              </div>
              <div className="hidden xl:block leading-tight">
                <p className="text-xs font-bold">{currentUser.name}</p>
                <p style={{ color: 'var(--text-secondary)' }} className="text-[11px]">
                  {getRoleLabel(currentUser.role)}
                </p>
              </div>
              <button
                type="button"
                onClick={logout}
                title="Keluar dari sistem"
                aria-label="Keluar dari sistem"
                style={{ color: 'var(--text-secondary)' }}
                className="min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </header>

      <main id="main-content" className="flex-1 p-4 sm:p-7 max-w-[1440px] w-full mx-auto">
        {children}
      </main>
    </div>
  );
};

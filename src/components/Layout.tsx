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
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Truck,
  Wallet,
} from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { getPlanMetrics } from '../lib/calculations';
import { getRoleLabel, Permission } from '../lib/rbac';
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [navSearch, setNavSearch] = useState('');
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});
  const mobileMenuBtnRef = useRef<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileOpen) {
        setMobileOpen(false);
        mobileMenuBtnRef.current?.focus();
        return;
      }
      if (
        e.key === '/' &&
        !collapsed &&
        document.activeElement &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [mobileOpen, collapsed]);

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

  const handleNav = (view: AppView) => {
    setActiveView(view);
    setMobileOpen(false);
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
        setNavSearch('');
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

  const renderSidebar = (isMobileDrawer: boolean) => {
    const compact = !isMobileDrawer && collapsed;
    const q = navSearch.trim().toLowerCase();

    return (
      <div
        style={{
          backgroundColor: 'var(--bg-sidebar)',
          borderColor: 'var(--border-hairline)',
          color: 'var(--text-primary)',
        }}
        className="flex flex-col h-full select-none"
      >
        {/* Workspace Switcher Header (Image 1 aesthetic) */}
        <div
          style={{ borderColor: 'var(--border-hairline)' }}
          className={`px-3.5 py-3 border-b flex items-center ${
            compact ? 'justify-center' : 'justify-between gap-2'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#14110F] p-1 shrink-0 flex items-center justify-center border border-black/10">
              <img
                src="/Indobacco_transparent.svg"
                alt="Logo Indobacco"
                width={32}
                height={32}
                className="w-8 h-8 object-contain"
              />
            </div>
            {!compact && (
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
            )}
          </div>

          {!isMobileDrawer && !compact && (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-expanded={true}
              aria-label="Ciutkan bilah samping"
              title="Ciutkan bilah samping"
              style={{ color: 'var(--text-secondary)' }}
              className="min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)]"
            >
              <PanelLeftClose className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {!isMobileDrawer && compact && (
          <div className="px-2 pt-2 flex justify-center">
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              aria-expanded={false}
              aria-label="Luaskan bilah samping"
              title="Luaskan bilah samping"
              style={{ color: 'var(--text-secondary)' }}
              className="min-w-[44px] min-h-[44px] rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)]"
            >
              <PanelLeftOpen className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Quick Search Bar with "/" shortcut (Image 1 aesthetic) */}
        {!compact && (
          <div className="px-3 pt-3 pb-1">
            <div className="relative">
              <Search
                style={{ color: 'var(--text-secondary)' }}
                className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                ref={isMobileDrawer ? undefined : searchInputRef}
                type="text"
                value={navSearch}
                onChange={(e) => setNavSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                aria-label="Cari menu navigasi"
                placeholder="Cari menu"
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
        )}

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
                {!compact && (
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
                )}

                {(!isClosed || compact) && (
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
                          aria-label={compact ? item.label : undefined}
                          title={compact ? item.label : undefined}
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
                          className={`w-full min-h-[40px] flex items-center ${
                            compact ? 'justify-center px-2' : 'justify-between px-2.5'
                          } py-1.5 rounded-lg border text-[13px] transition-colors relative ${
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
                            {!compact && <span className="truncate">{item.label}</span>}
                          </span>
                          {item.badge !== undefined && (
                            <span
                              className={`${
                                compact
                                  ? 'absolute top-1 right-1 px-1 text-[9px]'
                                  : 'ml-2 px-1.5 py-0.5 text-[11px]'
                              } rounded font-bold tabular-nums text-white ${
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

        {/* Bottom User Profile Card (Image 1 aesthetic) */}
        {currentUser && (
          <div style={{ borderColor: 'var(--border-hairline)' }} className="p-3 border-t">
            <div
              style={{
                backgroundColor: compact ? 'transparent' : 'var(--bg-surface)',
                borderColor: compact ? 'transparent' : 'var(--border-hairline)',
              }}
              className={`flex items-center ${
                compact ? 'justify-center' : 'justify-between gap-2 p-2 rounded-xl border'
              }`}
            >
              {!compact && (
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
              )}
              <button
                type="button"
                onClick={logout}
                title="Keluar dari sistem"
                aria-label="Keluar dari sistem"
                style={{ color: 'var(--text-secondary)' }}
                className="min-w-[40px] min-h-[40px] rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      style={{ backgroundColor: 'var(--bg-canvas)', color: 'var(--text-primary)' }}
      className="min-h-screen flex"
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[#18181B] focus:text-white focus:font-semibold"
      >
        Lewati ke konten utama
      </a>

      {/* Desktop Collapsible Sidebar */}
      <aside
        style={{ borderColor: 'var(--border-hairline)' }}
        className={`hidden lg:block shrink-0 border-r sticky top-0 h-screen transition-[width] duration-200 ${
          collapsed ? 'w-[76px]' : 'w-64'
        }`}
      >
        {renderSidebar(false)}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div
          id="mobile-nav-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Navigasi aplikasi"
          className="fixed inset-0 z-50 lg:hidden flex"
        >
          <div
            className="fixed inset-0 bg-black/45"
            onClick={() => {
              setMobileOpen(false);
              mobileMenuBtnRef.current?.focus();
            }}
          />
          <aside className="relative w-72 max-w-[85vw] h-full z-10 shadow-2xl">
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                mobileMenuBtnRef.current?.focus();
              }}
              style={{ color: 'var(--text-secondary)' }}
              className="absolute top-2.5 right-2.5 min-w-[44px] min-h-[44px] rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)]"
              aria-label="Tutup menu navigasi"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
            {renderSidebar(true)}
          </aside>
        </div>
      )}

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Single glass toolbar (R-10 dose cap = 1) */}
        <header
          style={{
            backgroundColor: 'var(--toolbar-bg)',
            borderColor: 'var(--border-hairline)',
          }}
          className="sticky top-0 z-30 backdrop-blur-md border-b px-4 sm:px-6 h-14 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              ref={mobileMenuBtnRef}
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav-drawer"
              className="lg:hidden min-h-[40px] px-3 rounded-lg hig-btn-secondary inline-flex items-center gap-1.5 text-xs font-semibold"
            >
              <Menu className="w-4 h-4" aria-hidden="true" />
              <span>Menu</span>
            </button>

            {/* macOS / Image 1 Breadcrumb */}
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm min-w-0">
              <span
                style={{ color: 'var(--text-secondary)' }}
                className="hidden sm:inline truncate"
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
          </div>
        </header>

        <main id="main-content" className="flex-1 p-4 sm:p-7 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

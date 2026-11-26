import { AppView, Role } from '../types/erp';

export type Permission =
  | 'view:dashboard'
  | 'view:pos'
  | 'view:warehouse'
  | 'view:purchases'
  | 'view:transactions'
  | 'view:receivables'
  | 'view:products'
  | 'view:customers'
  | 'view:expenses'
  | 'view:reports'
  | 'view:audit'
  | 'view:users'
  | 'view:settings'
  | 'pos:checkout'
  | 'pos:quick_customer'
  | 'warehouse:adjust'
  | 'purchases:manage'
  | 'expenses:manage'
  | 'transactions:void'
  | 'receivables:pay'
  | 'receivables:create'
  | 'products:write'
  | 'products:delete'
  | 'products:view_cost'
  | 'customers:write'
  | 'customers:delete'
  | 'reports:export'
  | 'users:manage'
  | 'settings:write'
  | 'backup:manage';

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  SUPER_ADMIN: new Set<Permission>([
    'view:dashboard',
    'view:pos',
    'view:warehouse',
    'view:purchases',
    'view:transactions',
    'view:receivables',
    'view:products',
    'view:customers',
    'view:expenses',
    'view:reports',
    'view:audit',
    'view:users',
    'view:settings',
    'pos:checkout',
    'pos:quick_customer',
    'warehouse:adjust',
    'purchases:manage',
    'expenses:manage',
    'transactions:void',
    'receivables:pay',
    'receivables:create',
    'products:write',
    'products:delete',
    'products:view_cost',
    'customers:write',
    'customers:delete',
    'reports:export',
    'users:manage',
    'settings:write',
    'backup:manage',
  ]),
  MANAGER: new Set<Permission>([
    'view:dashboard',
    'view:pos',
    'view:warehouse',
    'view:purchases',
    'view:transactions',
    'view:receivables',
    'view:products',
    'view:customers',
    'view:expenses',
    'view:reports',
    'view:audit',
    'view:settings',
    'pos:checkout',
    'pos:quick_customer',
    'warehouse:adjust',
    'purchases:manage',
    'expenses:manage',
    'transactions:void',
    'receivables:pay',
    'receivables:create',
    'products:write',
    'products:view_cost',
    'customers:write',
    'reports:export',
    'settings:write',
  ]),
  KASIR: new Set<Permission>([
    'view:pos',
    'view:transactions',
    'view:products',
    'view:customers',
    'pos:checkout',
    'pos:quick_customer',
  ]),
  OWNER: new Set<Permission>([
    'view:dashboard',
    'view:warehouse',
    'view:purchases',
    'view:transactions',
    'view:receivables',
    'view:products',
    'view:customers',
    'view:expenses',
    'view:reports',
    'view:audit',
    'products:view_cost',
    'reports:export',
  ]),
};

export function hasPermission(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function getDefaultViewForRole(role: Role): AppView {
  if (role === 'KASIR') return 'pos';
  return 'dashboard';
}

export function getRoleLabel(role: Role): string {
  switch (role) {
    case 'SUPER_ADMIN':
      return 'Super Admin';
    case 'MANAGER':
      return 'Manager';
    case 'KASIR':
      return 'Kasir';
    case 'OWNER':
      return 'Owner';
  }
}

export function getRoleSummary(role: Role): string {
  switch (role) {
    case 'SUPER_ADMIN':
      return 'Kendali penuh sistem, manajemen user, void, hapus data, & backup/restore.';
    case 'MANAGER':
      return 'Operasional harian, gudang, laporan Laba Rugi, audit log, & void transaksi.';
    case 'KASIR':
      return 'Antarmuka POS kasir, transaksi belanja, cetak struk, & cek stok tersedia.';
    case 'OWNER':
      return 'Analitik eksekutif, pemantauan omset, piutang, laporan keuangan, & audit log.';
  }
}

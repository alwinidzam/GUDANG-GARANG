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
  | 'transactions:shipping'
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

export const VIEW_PERMISSION: Record<AppView, Permission> = {
  dashboard: 'view:dashboard',
  pos: 'view:pos',
  warehouse: 'view:warehouse',
  purchases: 'view:purchases',
  transactions: 'view:transactions',
  receivables: 'view:receivables',
  products: 'view:products',
  customers: 'view:customers',
  expenses: 'view:expenses',
  reports: 'view:reports',
  audit: 'view:audit',
  users: 'view:users',
  settings: 'view:settings',
};

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
    'transactions:shipping',
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
    'transactions:shipping',
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
    'view:receivables',
    'view:products',
    'view:customers',
    'pos:checkout',
    'pos:quick_customer',
    'transactions:shipping',
    'receivables:pay',
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

export interface RbacMatrixRow {
  module: string;
  description: string;
  permission: Permission;
}

export const RBAC_MATRIX_ROWS: readonly RbacMatrixRow[] = [
  { module: 'Dashboard Eksekutif', description: 'Ringkasan omset, laba bersih, piutang & stok', permission: 'view:dashboard' },
  { module: 'Kasir POS & Shift', description: 'Transaksi penjualan, transfer, tempo, & tutup shift', permission: 'pos:checkout' },
  { module: 'Pengiriman & Resi', description: 'Perbarui status kirim, kurir, dan nomor resi', permission: 'transactions:shipping' },
  { module: 'Void & Retur Parsial', description: 'Pembatalan nota dan retur barang ke stok/piutang', permission: 'transactions:void' },
  { module: 'Terima Cicilan & FIFO', description: 'Catat pelunasan transfer bertahap & cetak kuitansi', permission: 'receivables:pay' },
  { module: 'Skema Kredit Manual', description: 'Buat piutang di luar transaksi kasir langsung', permission: 'receivables:create' },
  { module: 'Opname & Mutasi Gudang', description: 'Penyesuaian stok masuk, keluar, dan rusak', permission: 'warehouse:adjust' },
  { module: 'Pembelian & Supplier', description: 'Kelola PO pemasok, update HPP, & bayar hutang', permission: 'purchases:manage' },
  { module: 'Kas & Pengeluaran Ops.', description: 'Catat biaya operasional & pantau arus dompet', permission: 'expenses:manage' },
  { module: 'Lihat HPP & Margin', description: 'Akses harga modal (HPP) dan margin keuntungan', permission: 'products:view_cost' },
  { module: 'Kelola Master Produk', description: 'Tambah/ubah SKU, edit massal, dan impor CSV', permission: 'products:write' },
  { module: 'Hapus Master Data', description: 'Hapus permanen data produk atau pelanggan', permission: 'products:delete' },
  { module: 'Ekspor Laporan CSV', description: 'Unduh laporan keuangan, piutang, dan transaksi', permission: 'reports:export' },
  { module: 'Audit Trail Sistem', description: 'Pantau seluruh riwayat aktivitas operator', permission: 'view:audit' },
  { module: 'Pengaturan Perusahaan', description: 'Ubah profil kop dokumen, PPN, dan rekening bank', permission: 'settings:write' },
  { module: 'Manajemen User & RBAC', description: 'Kelola akun karyawan, role, dan status aktif', permission: 'users:manage' },
  { module: 'Backup, Restore & Reset', description: 'Ekspor/impor database JSON dan reset operasional', permission: 'backup:manage' },
];

export function hasPermission(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function canAccessView(role: Role | undefined | null, view: AppView): boolean {
  if (!role) return false;
  return hasPermission(role, VIEW_PERMISSION[view]);
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
      return 'Akses penuh seluruh modul, manajemen user & RBAC, hapus data master, serta backup/restore.';
    case 'MANAGER':
      return 'Operasional pabrik harian: POS, gudang, pembelian PO, kas, piutang, void/retur, dan laporan.';
    case 'KASIR':
      return 'Kasir POS pabrik, cetak faktur/surat jalan, update resi, terima cicilan transfer, & cek stok.';
    case 'OWNER':
      return 'Pemantauan eksekutif read-only: dashboard, HPP, arus kas, piutang, laporan CSV, & audit log.';
  }
}

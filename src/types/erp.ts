export type Role = 'SUPER_ADMIN' | 'MANAGER' | 'KASIR' | 'OWNER';

export type CustomerType = 'RETAIL' | 'GROSIR' | 'DISTRIBUTOR';

export type PaymentMethod = 'CASH' | 'TRANSFER' | 'QRIS' | 'CREDIT';

export type InstallmentFrequency = 'WEEKLY' | 'MONTHLY';

export type TransactionStatus = 'COMPLETED' | 'VOIDED';

export type StockMovementType =
  | 'SALE'
  | 'VOID_RETURN'
  | 'INBOUND'
  | 'OUTBOUND'
  | 'DAMAGED_EXPIRED';

export type PaymentPlanStatus = 'ACTIVE' | 'PAID' | 'VOIDED';

export type AppView =
  | 'dashboard'
  | 'pos'
  | 'warehouse'
  | 'transactions'
  | 'receivables'
  | 'products'
  | 'customers'
  | 'reports'
  | 'audit'
  | 'users'
  | 'settings';

export interface User {
  id: string;
  username: string;
  name: string;
  role: Role;
  passwordHash: string;
  isActive: boolean;
  createdAt: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  costPrice: number;
  sellPrice: number;
  stock: number;
  minStock: number;
  description?: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string;
  address: string;
  type: CustomerType;
  createdAt: string;
}

export interface TransactionItem {
  productId: string;
  sku: string;
  productName: string;
  unit: string;
  qty: number;
  costPrice: number;
  sellPrice: number;
  subtotal: number;
}

export interface Transaction {
  id: string;
  invoiceNumber: string;
  suratJalanNumber: string;
  createdAt: string;
  customerId: string | null;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  items: TransactionItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  paymentMethod: PaymentMethod;
  amountPaid: number;
  changeAmount: number;
  status: TransactionStatus;
  cashierId: string;
  cashierName: string;
  voidedAt?: string;
  voidedById?: string;
  voidedByName?: string;
  voidReason?: string;
  paymentPlanId?: string;
  notes?: string;
}

export interface StockMovement {
  id: string;
  createdAt: string;
  productId: string;
  sku: string;
  productName: string;
  type: StockMovementType;
  qtyDelta: number;
  previousStock: number;
  newStock: number;
  picId: string;
  picName: string;
  referenceId?: string;
  notes: string;
}

export interface InstallmentItem {
  index: number;
  dueDate: string;
  amount: number;
  paidAmount: number;
  paidAt?: string;
}

export interface InstallmentPaymentRecord {
  id: string;
  receiptNumber: string;
  paidAt: string;
  amount: number;
  paymentMethod: 'CASH' | 'TRANSFER' | 'QRIS';
  receivedById: string;
  receivedByName: string;
  notes?: string;
  remainingBalanceAfter: number;
}

export interface PaymentPlan {
  id: string;
  planNumber: string;
  transactionId?: string;
  invoiceNumber?: string;
  customerId: string;
  customerName: string;
  createdAt: string;
  principalAmount: number;
  downPayment: number;
  interestRate: number;
  interestAmount: number;
  totalPayable: number;
  frequency: InstallmentFrequency;
  tenorCount: number;
  schedule: InstallmentItem[];
  payments: InstallmentPaymentRecord[];
  status: PaymentPlanStatus;
  notes?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: Role;
  module: string;
  action: string;
  summary: string;
  before?: unknown;
  after?: unknown;
}

export interface CompanySettings {
  companyName: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  taxRate: number;
  invoicePrefix: string;
  dailyTarget: number;
  receiptFooter: string;
  nextInvoiceSeq: number;
  nextReceiptSeq: number;
  nextSuratJalanSeq: number;
  nextPlanSeq: number;
}

export interface DatabaseState {
  schemaVersion: 1;
  users: User[];
  products: Product[];
  customers: Customer[];
  transactions: Transaction[];
  stockMovements: StockMovement[];
  paymentPlans: PaymentPlan[];
  auditLogs: AuditLog[];
  settings: CompanySettings;
}

export type PrintRequest =
  | {
      kind: 'thermal58' | 'thermal80' | 'invoiceA4' | 'suratJalan';
      transaction: Transaction;
      paymentPlan?: PaymentPlan;
    }
  | {
      kind: 'kuitansi';
      plan: PaymentPlan;
      payment: InstallmentPaymentRecord;
      customer?: Customer;
    };

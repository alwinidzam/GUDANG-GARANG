export type Role = 'SUPER_ADMIN' | 'MANAGER' | 'KASIR' | 'OWNER';

export type CustomerType = 'RETAIL' | 'GROSIR' | 'DISTRIBUTOR';

export type PaymentMethod = 'CASH' | 'TRANSFER' | 'QRIS' | 'CREDIT';

export type InstallmentFrequency = 'FLEXIBLE' | 'WEEKLY' | 'MONTHLY';

export type TransactionStatus = 'COMPLETED' | 'VOIDED';

export type StockMovementType =
  | 'SALE'
  | 'VOID_RETURN'
  | 'PARTIAL_RETURN'
  | 'PURCHASE'
  | 'INBOUND'
  | 'OUTBOUND'
  | 'DAMAGED_EXPIRED';

export type PaymentPlanStatus = 'ACTIVE' | 'PAID' | 'VOIDED';

export type ShippingStatus = 'PENDING' | 'PACKED' | 'SHIPPED' | 'DELIVERED';

export type ExpenseCategory =
  | 'GAJI'
  | 'LISTRIK_AIR'
  | 'KEMASAN'
  | 'ONGKIR_EKSPEDISI'
  | 'SEWA'
  | 'BAHAN_PENOLONG'
  | 'LAINNYA';

export type PurchaseOrderStatus = 'PAID' | 'PARTIAL' | 'UNPAID' | 'VOIDED';

export type AppView =
  | 'dashboard'
  | 'pos'
  | 'warehouse'
  | 'purchases'
  | 'transactions'
  | 'receivables'
  | 'products'
  | 'customers'
  | 'expenses'
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
  wholesalePrice?: number;
  distributorPrice?: number;
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
  creditLimit?: number;
  notes?: string;
  createdAt: string;
}

export interface TransactionReturnItem {
  productId: string;
  sku: string;
  productName: string;
  unit: string;
  qty: number;
  unitPrice: number;
  refundSubtotal: number;
}

export interface TransactionReturnRecord {
  id: string;
  createdAt: string;
  items: TransactionReturnItem[];
  refundAmount: number;
  reason: string;
  processedById: string;
  processedByName: string;
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
  discountAmount?: number;
  shippingCost?: number;
  taxEnabled?: boolean;
  taxRate: number;
  taxAmount: number;
  total: number;
  paymentMethod: PaymentMethod;
  dpPaymentMethod?: 'CASH' | 'TRANSFER' | 'QRIS';
  transferReference?: string;
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
  shippingStatus?: ShippingStatus;
  courierName?: string;
  trackingNumber?: string;
  returns?: TransactionReturnRecord[];
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
  transferReference?: string;
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
  dpPaymentMethod?: 'CASH' | 'TRANSFER' | 'QRIS';
  dpTransferReference?: string;
  interestRate: number;
  interestAmount: number;
  totalPayable: number;
  returnCreditAmount?: number;
  frequency: InstallmentFrequency;
  tenorCount: number;
  tempoDays?: number;
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

export interface Supplier {
  id: string;
  code: string;
  name: string;
  phone: string;
  address: string;
  notes?: string;
  createdAt: string;
}

export interface PurchaseOrderItem {
  productId: string;
  sku: string;
  productName: string;
  unit: string;
  qty: number;
  unitCost: number;
  subtotal: number;
}

export interface PurchaseOrderPayment {
  id: string;
  paidAt: string;
  amount: number;
  paymentMethod: 'CASH' | 'TRANSFER' | 'QRIS';
  paidById: string;
  paidByName: string;
  notes?: string;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  createdAt: string;
  supplierId: string;
  supplierName: string;
  items: PurchaseOrderItem[];
  totalCost: number;
  paymentMethod: 'CASH' | 'TRANSFER' | 'CREDIT';
  paidAmount: number;
  status: PurchaseOrderStatus;
  payments: PurchaseOrderPayment[];
  createdById: string;
  createdByName: string;
  notes?: string;
}

export interface ExpenseRecord {
  id: string;
  date: string;
  createdAt: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  paymentMethod: 'CASH' | 'TRANSFER' | 'QRIS';
  picId: string;
  picName: string;
  notes?: string;
}

export interface HoldOrder {
  id: string;
  label: string;
  createdAt: string;
  customerId: string | null;
  items: Array<{ productId: string; qty: number }>;
  discountAmount?: number;
  shippingCost?: number;
  taxEnabled?: boolean;
  notes?: string;
}

export interface CashierShift {
  id: string;
  openedAt: string;
  closedAt?: string;
  cashierId: string;
  cashierName: string;
  openingCash: number;
  expectedCash?: number;
  actualCash?: number;
  variance?: number;
  status: 'OPEN' | 'CLOSED';
  notes?: string;
}

export interface CompanySettings {
  companyName: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolder?: string;
  taxRate: number;
  invoicePrefix: string;
  dailyTarget: number;
  receiptFooter: string;
  lastBackupAt?: string;
  nextInvoiceSeq: number;
  nextReceiptSeq: number;
  nextSuratJalanSeq: number;
  nextPlanSeq: number;
  nextPoSeq?: number;
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
  suppliers?: Supplier[];
  purchaseOrders?: PurchaseOrder[];
  expenses?: ExpenseRecord[];
  holdOrders?: HoldOrder[];
  shifts?: CashierShift[];
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
    }
  | {
      kind: 'labels';
      products: Product[];
      copies: number;
    }
  | {
      kind: 'statement';
      customer: Customer;
      plans: PaymentPlan[];
    };

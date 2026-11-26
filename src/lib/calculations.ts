import {
  CustomerType,
  InstallmentFrequency,
  InstallmentItem,
  PaymentPlan,
  Product,
} from '../types/erp';
import { addDaysISO, addMonthsISO, diffDays, roundQty, toLocalDateISO } from './format';

export function getEffectiveUnitPrice(product: Product, customerType?: CustomerType | null): number {
  if (customerType === 'DISTRIBUTOR' && product.distributorPrice && product.distributorPrice > 0) {
    return product.distributorPrice;
  }
  if (customerType === 'GROSIR' && product.wholesalePrice && product.wholesalePrice > 0) {
    return product.wholesalePrice;
  }
  return product.sellPrice;
}

export function calcMarginPercent(costPrice: number, sellPrice: number): number {
  if (sellPrice <= 0) return 0;
  return Number((((sellPrice - costPrice) / sellPrice) * 100).toFixed(2));
}

export function calcMarkupPercent(costPrice: number, sellPrice: number): number {
  if (costPrice <= 0) return 0;
  return Number((((sellPrice - costPrice) / costPrice) * 100).toFixed(2));
}

export function calcUnitProfit(costPrice: number, sellPrice: number): number {
  return Math.round(sellPrice - costPrice);
}

export interface InventoryValuation {
  totalHppValue: number;
  totalRetailValue: number;
  potentialProfit: number;
  totalUnits: number;
  skuCount: number;
  lowStockCount: number;
  outOfStockCount: number;
}

export function calcInventoryValuation(products: Product[]): InventoryValuation {
  let totalHppValue = 0;
  let totalRetailValue = 0;
  let totalUnits = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;

  for (const p of products) {
    const qty = Math.max(0, p.stock);
    totalHppValue += qty * p.costPrice;
    totalRetailValue += qty * p.sellPrice;
    totalUnits += qty;
    if (qty === 0) {
      outOfStockCount += 1;
      lowStockCount += 1;
    } else if (qty <= p.minStock) {
      lowStockCount += 1;
    }
  }

  return {
    totalHppValue: Math.round(totalHppValue),
    totalRetailValue: Math.round(totalRetailValue),
    potentialProfit: Math.round(totalRetailValue - totalHppValue),
    totalUnits: roundQty(totalUnits),
    skuCount: products.length,
    lowStockCount,
    outOfStockCount,
  };
}

export interface InstallmentScheduleInput {
  principalAmount: number;
  downPayment: number;
  interestRate: number;
  frequency: InstallmentFrequency;
  tenorCount: number;
  tempoDays?: number;
  startDate?: string;
}

export interface InstallmentScheduleResult {
  financedAmount: number;
  interestAmount: number;
  totalPayable: number;
  installmentBaseAmount: number;
  schedule: InstallmentItem[];
}

export function buildInstallmentSchedule(
  input: InstallmentScheduleInput
): InstallmentScheduleResult {
  const principal = Math.round(input.principalAmount);
  const dp = Math.round(input.downPayment);
  const rate = Number(input.interestRate);
  const isFlexible = input.frequency === 'FLEXIBLE';
  const tenor = isFlexible ? 1 : Math.floor(input.tenorCount);
  const tempoDays = Math.max(1, Math.min(365, Math.floor(input.tempoDays || 30)));
  const startDate = (input.startDate || toLocalDateISO()).slice(0, 10);

  if (principal <= 0) {
    throw new Error('Pokok transaksi harus lebih besar dari Rp 0.');
  }
  if (dp < 0) {
    throw new Error('Uang muka (DP) tidak boleh negatif.');
  }
  if (dp >= principal) {
    throw new Error('DP harus lebih kecil dari total tagihan untuk skema kredit.');
  }
  if (rate < 0 || Number.isNaN(rate)) {
    throw new Error('Persentase bunga tidak valid.');
  }
  if (!isFlexible && (tenor < 1 || tenor > 60)) {
    throw new Error('Jumlah tenor harus antara 1 sampai 60 termin.');
  }

  const financedAmount = principal - dp;
  const interestAmount = Math.round(financedAmount * (rate / 100));
  const totalPayable = financedAmount + interestAmount;

  if (isFlexible) {
    return {
      financedAmount,
      interestAmount,
      totalPayable,
      installmentBaseAmount: totalPayable,
      schedule: [
        {
          index: 1,
          dueDate: addDaysISO(startDate, tempoDays),
          amount: totalPayable,
          paidAmount: 0,
        },
      ],
    };
  }

  const baseAmount = Math.floor(totalPayable / tenor);
  const remainder = totalPayable - baseAmount * tenor;

  const schedule: InstallmentItem[] = [];
  for (let i = 1; i <= tenor; i += 1) {
    const dueDate =
      input.frequency === 'WEEKLY'
        ? addDaysISO(startDate, i * 7)
        : addMonthsISO(startDate, i);
    const amount = i === tenor ? baseAmount + remainder : baseAmount;
    schedule.push({
      index: i,
      dueDate,
      amount,
      paidAmount: 0,
    });
  }

  return {
    financedAmount,
    interestAmount,
    totalPayable,
    installmentBaseAmount: baseAmount,
    schedule,
  };
}

export type InstallmentStatusKind = 'PAID' | 'OVERDUE' | 'PARTIAL' | 'UPCOMING';

export interface InstallmentStatusInfo {
  status: InstallmentStatusKind;
  remaining: number;
  overdueDays: number;
}

export function getInstallmentStatus(
  item: InstallmentItem,
  todayIso: string = toLocalDateISO()
): InstallmentStatusInfo {
  const remaining = Math.max(0, item.amount - item.paidAmount);
  if (remaining === 0) {
    return { status: 'PAID', remaining: 0, overdueDays: 0 };
  }
  const lateDays = diffDays(item.dueDate, todayIso);
  if (lateDays > 0) {
    return { status: 'OVERDUE', remaining, overdueDays: lateDays };
  }
  if (item.paidAmount > 0) {
    return { status: 'PARTIAL', remaining, overdueDays: 0 };
  }
  return { status: 'UPCOMING', remaining, overdueDays: 0 };
}

export interface PlanMetrics {
  totalPaid: number;
  remainingBalance: number;
  overdueAmount: number;
  overdueInstallmentCount: number;
  maxOverdueDays: number;
  isOverdue: boolean;
  nextDueDate: string | null;
  paidCount: number;
}

export function getPlanMetrics(
  plan: PaymentPlan,
  todayIso: string = toLocalDateISO()
): PlanMetrics {
  let totalPaid = 0;
  let overdueAmount = 0;
  let overdueInstallmentCount = 0;
  let maxOverdueDays = 0;
  let paidCount = 0;
  let nextDueDate: string | null = null;

  for (const item of plan.schedule) {
    totalPaid += item.paidAmount;
    const info = getInstallmentStatus(item, todayIso);
    if (info.status === 'PAID') {
      paidCount += 1;
    } else {
      if (!nextDueDate) {
        nextDueDate = item.dueDate;
      }
      if (plan.status === 'ACTIVE' && info.status === 'OVERDUE') {
        overdueAmount += info.remaining;
        overdueInstallmentCount += 1;
        if (info.overdueDays > maxOverdueDays) {
          maxOverdueDays = info.overdueDays;
        }
      }
    }
  }

  const remainingBalance =
    plan.status === 'VOIDED' ? 0 : Math.max(0, plan.totalPayable - totalPaid);

  return {
    totalPaid,
    remainingBalance,
    overdueAmount,
    overdueInstallmentCount,
    maxOverdueDays,
    isOverdue: plan.status === 'ACTIVE' && overdueInstallmentCount > 0,
    nextDueDate: plan.status === 'ACTIVE' ? nextDueDate : null,
    paidCount,
  };
}

export interface ReceivablesAgingBuckets {
  current: number;
  days1To30: number;
  days31To60: number;
  over60: number;
}

export function calcReceivablesAging(
  plans: PaymentPlan[],
  todayIso: string = toLocalDateISO()
): ReceivablesAgingBuckets {
  const buckets: ReceivablesAgingBuckets = {
    current: 0,
    days1To30: 0,
    days31To60: 0,
    over60: 0,
  };
  for (const pl of plans) {
    if (pl.status !== 'ACTIVE') continue;
    for (const item of pl.schedule) {
      const st = getInstallmentStatus(item, todayIso);
      if (st.remaining <= 0) continue;
      if (st.status !== 'OVERDUE' || st.overdueDays <= 0) {
        buckets.current += st.remaining;
      } else if (st.overdueDays <= 30) {
        buckets.days1To30 += st.remaining;
      } else if (st.overdueDays <= 60) {
        buckets.days31To60 += st.remaining;
      } else {
        buckets.over60 += st.remaining;
      }
    }
  }
  return buckets;
}

export interface FifoAllocationLine {
  plan: PaymentPlan;
  remainingBefore: number;
  allocatedAmount: number;
  remainingAfter: number;
  willSettle: boolean;
}

/**
 * Deterministic FIFO allocation across a customer's ACTIVE credit plans (oldest due date / overdue first).
 */
export function previewCustomerFifoAllocation(
  plans: PaymentPlan[],
  customerId: string,
  paymentAmount: number,
  todayIso: string = toLocalDateISO()
): { lines: FifoAllocationLine[]; totalRemaining: number; totalAllocated: number; unallocated: number } {
  const activePlans = plans
    .filter((pl) => pl.customerId === customerId && pl.status === 'ACTIVE')
    .map((pl) => ({ plan: pl, metrics: getPlanMetrics(pl, todayIso) }))
    .filter((x) => x.metrics.remainingBalance > 0)
    .sort((a, b) => {
      const dueA = a.metrics.nextDueDate || a.plan.createdAt.slice(0, 10);
      const dueB = b.metrics.nextDueDate || b.plan.createdAt.slice(0, 10);
      if (dueA !== dueB) return dueA.localeCompare(dueB);
      return a.plan.createdAt.localeCompare(b.plan.createdAt);
    });

  const totalRemaining = activePlans.reduce((sum, x) => sum + x.metrics.remainingBalance, 0);
  let pool = Math.max(0, Math.round(paymentAmount || 0));
  const lines: FifoAllocationLine[] = [];

  for (const { plan, metrics } of activePlans) {
    if (pool <= 0) break;
    const alloc = Math.min(pool, metrics.remainingBalance);
    pool -= alloc;
    const remAfter = Math.max(0, metrics.remainingBalance - alloc);
    lines.push({
      plan,
      remainingBefore: metrics.remainingBalance,
      allocatedAmount: alloc,
      remainingAfter: remAfter,
      willSettle: remAfter === 0,
    });
  }

  const totalAllocated = lines.reduce((sum, l) => sum + l.allocatedAmount, 0);
  return {
    lines,
    totalRemaining,
    totalAllocated,
    unallocated: Math.max(0, Math.round(paymentAmount || 0) - totalAllocated),
  };
}

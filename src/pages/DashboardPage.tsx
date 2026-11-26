import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  TrendingUp,
  Wallet,
  CreditCard,
  Boxes,
  AlertTriangle,
  ArrowUpRight,
} from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { calcInventoryValuation, getPlanMetrics } from '../lib/calculations';
import { addDaysISO, extractDateISO, formatRupiah, toLocalDateISO } from '../lib/format';

const METHOD_COLORS: Record<string, string> = {
  CASH: '#10B981',
  TRANSFER: '#2563EB',
  QRIS: '#7C3AED',
  CREDIT: '#D4A017',
};

const METHOD_NAMES: Record<string, string> = {
  CASH: 'Tunai',
  TRANSFER: 'Transfer Bank',
  QRIS: 'QRIS',
  CREDIT: 'Kredit / Tempo',
};

export const DashboardPage: React.FC = () => {
  const { db, setActiveView, can } = useErp();
  const today = toLocalDateISO();

  const stats = useMemo(() => {
    const cutoff30 = addDaysISO(today, -29);
    let revenue30 = 0;
    let grossProfit30 = 0;
    let txCount30 = 0;

    const methodTotals: Record<string, number> = {
      CASH: 0,
      TRANSFER: 0,
      QRIS: 0,
      CREDIT: 0,
    };

    const dailyMap = new Map<string, { omset: number; trx: number }>();
    for (let i = 13; i >= 0; i -= 1) {
      dailyMap.set(addDaysISO(today, -i), { omset: 0, trx: 0 });
    }

    for (const tx of db.transactions) {
      if (tx.status !== 'COMPLETED') continue;
      const d = extractDateISO(tx.createdAt);
      if (d >= cutoff30) {
        revenue30 += tx.total;
        txCount30 += 1;
        const cogs = tx.items.reduce((acc, it) => acc + it.costPrice * it.qty, 0);
        grossProfit30 += tx.subtotal - cogs;
        methodTotals[tx.paymentMethod] = (methodTotals[tx.paymentMethod] || 0) + tx.total;
      }
      if (dailyMap.has(d)) {
        const entry = dailyMap.get(d)!;
        entry.omset += tx.total;
        entry.trx += 1;
      }
    }

    const dailySeries = Array.from(dailyMap.entries()).map(([dateStr, val]) => ({
      date: dateStr.slice(5).replace('-', '/'),
      omset: val.omset,
      target: db.settings.dailyTarget,
      trx: val.trx,
    }));

    const methodSeries = Object.entries(methodTotals)
      .filter(([, val]) => val > 0)
      .map(([key, value]) => ({
        key,
        name: METHOD_NAMES[key] || key,
        value,
        color: METHOD_COLORS[key] || '#78716C',
      }));

    let activeReceivable = 0;
    let overduePlansCount = 0;
    const overdueList: Array<{
      id: string;
      planNumber: string;
      customerName: string;
      remaining: number;
      maxDays: number;
    }> = [];

    for (const pl of db.paymentPlans) {
      if (pl.status !== 'ACTIVE') continue;
      const m = getPlanMetrics(pl, today);
      activeReceivable += m.remainingBalance;
      if (m.isOverdue) {
        overduePlansCount += 1;
        overdueList.push({
          id: pl.id,
          planNumber: pl.planNumber,
          customerName: pl.customerName,
          remaining: m.remainingBalance,
          maxDays: m.maxOverdueDays,
        });
      }
    }

    const valuation = calcInventoryValuation(db.products);
    const lowStockProducts = db.products
      .filter((p) => p.stock <= p.minStock)
      .sort((a, b) => a.stock - b.stock);

    return {
      revenue30,
      grossProfit30,
      txCount30,
      dailySeries,
      methodSeries,
      activeReceivable,
      overduePlansCount,
      overdueList,
      valuation,
      lowStockProducts,
    };
  }, [db.transactions, db.paymentPlans, db.products, db.settings.dailyTarget, today]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E6E0D6] rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-[#6B6257]">
              Omset 30 Hari
            </p>
            <div className="p-2 rounded-lg bg-red-50 text-[#B91C1C]">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-extrabold text-[#1A1614] tabular-nums">
            {formatRupiah(stats.revenue30)}
          </p>
          <p className="mt-1 text-xs text-[#6B6257] tabular-nums">
            {stats.txCount30} transaksi selesai (termasuk PPN)
          </p>
        </div>

        <div className="bg-white border border-[#E6E0D6] rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-[#6B6257]">
              Laba Kotor (Ex-PPN)
            </p>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-extrabold text-emerald-800 tabular-nums">
            {formatRupiah(stats.grossProfit30)}
          </p>
          <p className="mt-1 text-xs text-[#6B6257]">
            Selisih penjualan bersih terhadap HPP modal
          </p>
        </div>

        <div className="bg-white border border-[#E6E0D6] rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-[#6B6257]">
              Piutang Aktif
            </p>
            <div className="p-2 rounded-lg bg-amber-50 text-[#B8860B]">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-extrabold text-[#1A1614] tabular-nums">
            {formatRupiah(stats.activeReceivable)}
          </p>
          <p className="mt-1 text-xs">
            {stats.overduePlansCount > 0 ? (
              <span className="font-semibold text-rose-700">
                {stats.overduePlansCount} tagihan melewati jatuh tempo
              </span>
            ) : (
              <span className="text-emerald-700 font-medium">Semua cicilan lancar</span>
            )}
          </p>
        </div>

        <div className="bg-white border border-[#E6E0D6] rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-[#6B6257]">
              Valuasi Aset Stok (HPP)
            </p>
            <div className="p-2 rounded-lg bg-stone-100 text-[#14110F]">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-extrabold text-[#1A1614] tabular-nums">
            {formatRupiah(stats.valuation.totalHppValue)}
          </p>
          <p className="mt-1 text-xs text-[#6B6257] tabular-nums">
            {stats.valuation.totalUnits.toLocaleString('id-ID')} unit •{' '}
            <span className={stats.valuation.lowStockCount > 0 ? 'text-amber-700 font-semibold' : ''}>
              {stats.valuation.lowStockCount} SKU menipis
            </span>
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 bg-white border border-[#E6E0D6] rounded-xl p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-sm font-extrabold text-[#1A1614]">
                Tren Omset Harian vs Target (14 Hari Terakhir)
              </h2>
              <p className="text-xs text-[#6B6257]">
                Target harian aktif: {formatRupiah(db.settings.dailyTarget)}
              </p>
            </div>
            {can('view:reports') && (
              <button
                type="button"
                onClick={() => setActiveView('reports')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#B91C1C] hover:underline cursor-pointer"
              >
                Buka Laporan Lengkap
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={stats.dailySeries} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EDE7DD" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6B6257' }} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#6B6257' }}
                  tickFormatter={(v: number) =>
                    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}jt` : `${Math.round(v / 1000)}rb`
                  }
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    formatRupiah(value),
                    name === 'omset' ? 'Omset Aktual' : 'Target Harian',
                  ]}
                  contentStyle={{
                    backgroundColor: '#14110F',
                    borderColor: '#2A231E',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="omset" name="omset" fill="#B91C1C" radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Line
                  type="monotone"
                  dataKey="target"
                  name="target"
                  stroke="#D4A017"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-[#E6E0D6] rounded-xl p-5 shadow-xs flex flex-col">
          <h2 className="text-sm font-extrabold text-[#1A1614]">Komposisi Metode Bayar (30 Hari)</h2>
          <p className="text-xs text-[#6B6257] mb-3">Distribusi nilai penjualan per saluran bayar</p>
          <div className="h-[210px] w-full">
            {stats.methodSeries.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.methodSeries}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={80}
                    paddingAngle={3}
                  >
                    {stats.methodSeries.map((entry) => (
                      <Cell key={entry.key} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: number) => formatRupiah(val)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-[#6B6257]">
                Belum ada transaksi 30 hari terakhir.
              </div>
            )}
          </div>
          <div className="mt-2 space-y-1.5 text-xs">
            {stats.methodSeries.map((m) => (
              <div key={m.key} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[#4A423A]">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: m.color }} />
                  {m.name}
                </span>
                <span className="font-bold tabular-nums">{formatRupiah(m.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Actionable Operational Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white border border-[#E6E0D6] rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <h3 className="text-sm font-extrabold text-[#1A1614]">Peringatan Stok Menipis</h3>
            </div>
            {can('view:warehouse') && (
              <button
                type="button"
                onClick={() => setActiveView('warehouse')}
                className="text-xs font-semibold text-[#B91C1C] hover:underline cursor-pointer"
              >
                Kelola Gudang
              </button>
            )}
          </div>
          {stats.lowStockProducts.length === 0 ? (
            <p className="text-xs text-emerald-700 py-4">Seluruh stok produk dalam batas aman.</p>
          ) : (
            <div className="divide-y divide-[#EDE7DD]">
              {stats.lowStockProducts.slice(0, 5).map((p) => (
                <div key={p.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#1A1614] truncate">{p.name}</p>
                    <p className="font-mono text-[#6B6257]">
                      {p.sku} • Min. {p.minStock} {p.unit}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded font-bold tabular-nums shrink-0 ${
                      p.stock === 0
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    Sisa {p.stock} {p.unit}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-[#E6E0D6] rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-rose-600" />
              <h3 className="text-sm font-extrabold text-[#1A1614]">Tagihan Piutang Terlambat</h3>
            </div>
            {can('view:receivables') && (
              <button
                type="button"
                onClick={() => setActiveView('receivables')}
                className="text-xs font-semibold text-[#B91C1C] hover:underline cursor-pointer"
              >
                Lihat Piutang
              </button>
            )}
          </div>
          {stats.overdueList.length === 0 ? (
            <p className="text-xs text-emerald-700 py-4">
              Tidak ada cicilan pelanggan yang melewati jatuh tempo.
            </p>
          ) : (
            <div className="divide-y divide-[#EDE7DD]">
              {stats.overdueList.map((o) => (
                <div key={o.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#1A1614] truncate">{o.customerName}</p>
                    <p className="font-mono text-[#6B6257]">{o.planNumber}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-[#1A1614] tabular-nums">
                      {formatRupiah(o.remaining)}
                    </p>
                    <p className="text-[11px] font-bold text-rose-600">
                      Telat {o.maxDays} hari
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

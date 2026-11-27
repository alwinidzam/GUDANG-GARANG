import React, { useMemo, useState } from 'react';
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
  CreditCard,
  Boxes,
  AlertTriangle,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { useTheme } from '../context/ThemeContext';
import {
  calcInventoryValuation,
  getPlanMetrics,
  getTransactionNetMetrics,
} from '../lib/calculations';
import { addDaysISO, extractDateISO, formatRupiah, toLocalDateISO } from '../lib/format';

const METHOD_COLORS: Record<string, string> = {
  CASH: '#047857',
  TRANSFER: '#1D4ED8',
  QRIS: '#52525B',
  CREDIT: '#B45309',
};

const METHOD_NAMES: Record<string, string> = {
  CASH: 'Tunai',
  TRANSFER: 'Transfer Bank',
  QRIS: 'QRIS',
  CREDIT: 'Kredit / Tempo',
};

export const DashboardPage: React.FC = () => {
  const { db, currentUser, setActiveView, can } = useErp();
  const { resolvedTheme } = useTheme();
  const [chartMode, setChartMode] = useState<'TREND' | 'METHODS'>('TREND');
  const [period, setPeriod] = useState<'TODAY' | '7D' | '30D'>('30D');
  const today = toLocalDateISO();

  const stats = useMemo(() => {
    const cutoff =
      period === 'TODAY'
        ? today
        : period === '7D'
        ? addDaysISO(today, -6)
        : addDaysISO(today, -29);
    let revenue30 = 0;
    let netSubtotal30 = 0;
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
      const net = getTransactionNetMetrics(tx);
      if (d >= cutoff) {
        revenue30 += net.netTotal;
        netSubtotal30 += net.netSubtotal;
        txCount30 += 1;
        grossProfit30 += net.netGrossProfit;
        methodTotals[tx.paymentMethod] = (methodTotals[tx.paymentMethod] || 0) + net.netTotal;
      }
      if (dailyMap.has(d)) {
        const entry = dailyMap.get(d)!;
        entry.omset += net.netTotal;
        entry.trx += 1;
      }
    }

    const expensesPeriod = (db.expenses || [])
      .filter((e) => e.date >= cutoff)
      .reduce((sum, e) => sum + e.amount, 0);
    const netProfitPeriod = grossProfit30 - expensesPeriod;

    const marginPct30 =
      netSubtotal30 > 0 ? Number(((grossProfit30 / netSubtotal30) * 100).toFixed(1)) : 0;

    const dailySeries = Array.from(dailyMap.entries()).map(([dateStr, val]) => ({
      date: dateStr.slice(5).replace('-', '/'),
      omset: val.omset,
      target: db.settings.dailyTarget,
      pct:
        db.settings.dailyTarget > 0
          ? Math.round((val.omset / db.settings.dailyTarget) * 100)
          : 0,
      trx: val.trx,
    }));

    const methodSeries = Object.entries(methodTotals)
      .filter(([, val]) => val > 0)
      .map(([key, value]) => ({
        key,
        name: METHOD_NAMES[key] || key,
        value,
        color: METHOD_COLORS[key] || '#71717A',
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
      expensesPeriod,
      netProfitPeriod,
      marginPct30,
      txCount30,
      dailySeries,
      methodSeries,
      activeReceivable,
      overduePlansCount,
      overdueList,
      valuation,
      lowStockProducts,
    };
  }, [db.transactions, db.expenses, db.paymentPlans, db.products, db.settings.dailyTarget, today, period]);

  const barPalette =
    resolvedTheme === 'dark'
      ? { hit: '#F4F4F5', mid: '#A1A1AA', low: '#71717A', targetLine: '#D4D4D8' }
      : { hit: '#18181B', mid: '#63636B', low: '#8E8E93', targetLine: '#52525B' };
  const getBarTone = (omset: number, target: number) => {
    if (target > 0 && omset >= target) return barPalette.hit;
    if (target > 0 && omset >= target * 0.5) return barPalette.mid;
    return barPalette.low;
  };
  const gridStroke = resolvedTheme === 'dark' ? '#2E2B28' : '#ECECEF';
  const axisTickColor = resolvedTheme === 'dark' ? '#AEA8A1' : '#52525B';

  const hasAlerts = stats.overduePlansCount > 0 || stats.lowStockProducts.length > 0;

  return (
    <div className="space-y-6">
      {/* Greeting Header + Period Filter */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            Selamat datang, {currentUser?.name || 'Operator'}
          </h2>
          <p style={{ color: 'var(--text-secondary)' }} className="text-sm mt-0.5">
            Ringkasan kinerja penjualan, arus kas operasional, piutang berjalan, dan stok gudang.
          </p>
        </div>
        <div
          role="group"
          aria-label="Filter periode ringkasan dashboard"
          style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-hairline)' }}
          className="inline-flex p-1 rounded-xl border"
        >
          {(
            [
              { id: 'TODAY', label: 'Hari Ini' },
              { id: '7D', label: '7 Hari' },
              { id: '30D', label: '30 Hari' },
            ] as const
          ).map((p) => {
            const active = period === p.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                onClick={() => setPeriod(p.id)}
                style={
                  active
                    ? { backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }
                    : { color: 'var(--text-secondary)' }
                }
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold ${
                  active ? 'shadow-xs' : ''
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Real Operational Alert Callout Bar (mirrors Image 1 horizontal callout strip) */}
      {hasAlerts && (
        <div
          style={{
            backgroundColor: 'var(--bg-subtle)',
            borderColor: 'var(--border-hairline)',
          }}
          className="border rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#14110F] p-1 shrink-0 flex items-center justify-center">
              <img
                src="/Indobacco_transparent.svg"
                alt=""
                width={24}
                height={24}
                className="w-6 h-6 object-contain"
              />
            </div>
            <p className="text-xs sm:text-sm font-medium leading-snug">
              <span className="font-bold">Perlu perhatian:</span>{' '}
              {stats.overduePlansCount > 0 && (
                <span>{stats.overduePlansCount} piutang melewati jatuh tempo</span>
              )}
              {stats.overduePlansCount > 0 && stats.lowStockProducts.length > 0 && ' dan '}
              {stats.lowStockProducts.length > 0 && (
                <span>{stats.lowStockProducts.length} SKU berada di bawah stok minimum</span>
              )}
              .
            </p>
          </div>
          {stats.overduePlansCount > 0 && can('view:receivables') ? (
            <button
              type="button"
              onClick={() => setActiveView('receivables')}
              className="min-h-[38px] px-3.5 py-1.5 hig-btn-secondary text-xs font-semibold shrink-0"
            >
              Tinjau Piutang
            </button>
          ) : can('view:warehouse') ? (
            <button
              type="button"
              onClick={() => setActiveView('warehouse')}
              className="min-h-[38px] px-3.5 py-1.5 hig-btn-secondary text-xs font-semibold shrink-0"
            >
              Cek Gudang
            </button>
          ) : null}
        </div>
      )}

      {/* Asymmetric Focal Metric Hierarchy (1 Hero Revenue Card + 2 Operational Cards) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Dominant Hero Card */}
        <div className="lg:col-span-6 hig-card p-5 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                style={{ backgroundColor: 'var(--cta-bg)', color: 'var(--cta-text)' }}
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              >
                <TrendingUp className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <p style={{ color: 'var(--text-secondary)' }} className="text-xs font-semibold">
                  {period === 'TODAY'
                    ? 'Pendapatan Hari Ini'
                    : period === '7D'
                    ? 'Pendapatan 7 Hari Terakhir'
                    : 'Pendapatan 30 Hari Terakhir'}
                </p>
                <p className="text-2xl sm:text-3xl font-bold tracking-tight tabular-nums mt-0.5">
                  {formatRupiah(stats.revenue30)}
                </p>
              </div>
            </div>

            {can('view:reports') && (
              <button
                type="button"
                onClick={() => setActiveView('reports')}
                style={{ color: 'var(--text-secondary)' }}
                className="min-h-[36px] px-2.5 py-1 rounded-lg hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] text-xs font-semibold inline-flex items-center gap-1 shrink-0"
              >
                <span>Lihat Detail</span>
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          <div
            style={{ borderColor: 'var(--border-hairline)' }}
            className="mt-5 pt-4 border-t grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs tabular-nums"
          >
            <div>
              <p style={{ color: 'var(--text-secondary)' }}>Laba Kotor</p>
              <p
                style={{ color: 'var(--status-positive)' }}
                className="text-sm font-bold mt-0.5"
              >
                {formatRupiah(stats.grossProfit30)}
              </p>
            </div>
            <div>
              <p style={{ color: 'var(--text-secondary)' }}>Pengeluaran Ops.</p>
              <p style={{ color: 'var(--status-danger)' }} className="text-sm font-bold mt-0.5">
                {formatRupiah(stats.expensesPeriod)}
              </p>
            </div>
            <div>
              <p style={{ color: 'var(--text-secondary)' }}>Laba Bersih</p>
              <p
                style={{
                  color:
                    stats.netProfitPeriod >= 0 ? 'var(--status-positive)' : 'var(--status-danger)',
                }}
                className="text-sm font-bold mt-0.5"
              >
                {formatRupiah(stats.netProfitPeriod)}
              </p>
            </div>
            <div>
              <p style={{ color: 'var(--text-secondary)' }}>Transaksi ({stats.marginPct30}%)</p>
              <p className="text-sm font-bold mt-0.5">{stats.txCount30} invoice</p>
            </div>
          </div>
        </div>

        {/* Secondary Card: Piutang */}
        <div className="lg:col-span-3 hig-card p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <div
              style={{ backgroundColor: 'var(--cta-bg)', color: 'var(--cta-text)' }}
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            >
              <CreditCard className="w-5 h-5" aria-hidden="true" />
            </div>
            {can('view:receivables') && (
              <button
                type="button"
                onClick={() => setActiveView('receivables')}
                style={{ color: 'var(--text-secondary)' }}
                className="min-h-[36px] px-2 py-1 rounded-lg hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] text-xs font-semibold inline-flex items-center gap-1"
              >
                <span>Detail</span>
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="mt-4">
            <p className="text-xl font-bold tabular-nums">{formatRupiah(stats.activeReceivable)}</p>
            <p style={{ color: 'var(--text-secondary)' }} className="text-xs mt-0.5">
              Piutang Aktif Pelanggan
            </p>
            <p className="mt-2 text-xs font-semibold">
              {stats.overduePlansCount > 0 ? (
                <span style={{ color: 'var(--status-danger)' }}>
                  {stats.overduePlansCount} tagihan melewati jatuh tempo
                </span>
              ) : (
                <span style={{ color: 'var(--status-positive)' }}>Semua cicilan lancar</span>
              )}
            </p>
          </div>
        </div>

        {/* Secondary Card: Valuasi Stok */}
        <div className="lg:col-span-3 hig-card p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <div
              style={{ backgroundColor: 'var(--cta-bg)', color: 'var(--cta-text)' }}
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            >
              <Boxes className="w-5 h-5" aria-hidden="true" />
            </div>
            {can('view:warehouse') && (
              <button
                type="button"
                onClick={() => setActiveView('warehouse')}
                style={{ color: 'var(--text-secondary)' }}
                className="min-h-[36px] px-2 py-1 rounded-lg hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] text-xs font-semibold inline-flex items-center gap-1"
              >
                <span>Detail</span>
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="mt-4">
            <p className="text-xl font-bold tabular-nums">
              {formatRupiah(stats.valuation.totalHppValue)}
            </p>
            <p style={{ color: 'var(--text-secondary)' }} className="text-xs mt-0.5">
              Valuasi Stok Gudang (HPP)
            </p>
            <p style={{ color: 'var(--text-secondary)' }} className="mt-2 text-xs tabular-nums">
              {stats.valuation.totalUnits.toLocaleString('id-ID')} unit,{' '}
              <span
                style={{
                  color:
                    stats.valuation.lowStockCount > 0
                      ? 'var(--accent-gold)'
                      : 'var(--status-positive)',
                }}
                className="font-semibold"
              >
                {stats.valuation.lowStockCount} SKU menipis
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Interactive Analytics View Switcher (Image 1 segmented bar + question-titled charts) */}
      <div className="hig-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold">
              {chartMode === 'TREND'
                ? 'Apakah omset 14 hari terakhir mencapai target harian?'
                : 'Bagaimana distribusi metode pembayaran 30 hari terakhir?'}
            </h3>
            <p style={{ color: 'var(--text-secondary)' }} className="text-xs mt-0.5">
              {chartMode === 'TREND'
                ? `Gradasi monokrom menunjukkan pencapaian terhadap target harian sebesar ${formatRupiah(
                    db.settings.dailyTarget
                  )}`
                : 'Perbandingan nilai penjualan berdasarkan saluran pembayaran pelanggan'}
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Pilih grafik ringkasan"
            style={{
              backgroundColor: 'var(--bg-subtle)',
              borderColor: 'var(--border-hairline)',
            }}
            className="inline-flex p-1 rounded-xl border"
          >
            <button
              type="button"
              role="tab"
              aria-selected={chartMode === 'TREND'}
              onClick={() => setChartMode('TREND')}
              style={
                chartMode === 'TREND'
                  ? {
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                    }
                  : { color: 'var(--text-secondary)' }
              }
              className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold ${
                chartMode === 'TREND' ? 'shadow-xs' : ''
              }`}
            >
              Tren Omset 14 Hari
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={chartMode === 'METHODS'}
              onClick={() => setChartMode('METHODS')}
              style={
                chartMode === 'METHODS'
                  ? {
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                    }
                  : { color: 'var(--text-secondary)' }
              }
              className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold ${
                chartMode === 'METHODS' ? 'shadow-xs' : ''
              }`}
            >
              Metode Pembayaran
            </button>
          </div>
        </div>

        {chartMode === 'TREND' ? (
          <div>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={stats.dailySeries}
                  margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: axisTickColor }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: axisTickColor }}
                    tickFormatter={(v: number) =>
                      v >= 1_000_000
                        ? `${(v / 1_000_000).toFixed(1)}jt`
                        : `${Math.round(v / 1000)}rb`
                    }
                  />
                  <Tooltip
                    formatter={(value: number, name: string, item: { payload?: { pct?: number } }) => {
                      if (name === 'omset') {
                        const pct = item?.payload?.pct ?? 0;
                        return [`${formatRupiah(value)} (${pct}% target)`, 'Omset Aktual'];
                      }
                      return [formatRupiah(value), 'Target Harian'];
                    }}
                    contentStyle={{
                      backgroundColor: '#18181B',
                      borderColor: '#3F3F46',
                      borderRadius: '10px',
                      color: '#FFFFFF',
                      fontSize: '12px',
                    }}
                    itemStyle={{ color: '#FFFFFF' }}
                    labelStyle={{ color: '#E4E4E7', fontWeight: 600 }}
                  />
                  <Bar
                    dataKey="omset"
                    name="omset"
                    fill={barPalette.hit}
                    radius={[5, 5, 0, 0]}
                    maxBarSize={32}
                  >
                    {stats.dailySeries.map((entry) => (
                      <Cell key={entry.date} fill={getBarTone(entry.omset, entry.target)} />
                    ))}
                  </Bar>
                  <Line
                    type="monotone"
                    dataKey="target"
                    name="target"
                    stroke={barPalette.targetLine}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div
              style={{ color: 'var(--text-secondary)' }}
              className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs"
              aria-label="Keterangan warna batang grafik omset"
            >
              <span className="inline-flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-xs shrink-0"
                  style={{ backgroundColor: barPalette.hit }}
                  aria-hidden="true"
                />
                Tembus target (&ge; 100%)
              </span>
              <span className="inline-flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-xs shrink-0"
                  style={{ backgroundColor: barPalette.mid }}
                  aria-hidden="true"
                />
                Mendekati (50% - 99%)
              </span>
              <span className="inline-flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-xs shrink-0"
                  style={{ backgroundColor: barPalette.low }}
                  aria-hidden="true"
                />
                Di bawah 50%
              </span>
              <span className="inline-flex items-center gap-2">
                <span
                  className="w-4 border-t-2 border-dashed shrink-0"
                  style={{ borderColor: barPalette.targetLine }}
                  aria-hidden="true"
                />
                Target harian
              </span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center py-2">
            <div className="h-[240px] w-full">
              {stats.methodSeries.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.methodSeries}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={56}
                      outerRadius={88}
                      paddingAngle={3}
                    >
                      {stats.methodSeries.map((entry) => (
                        <Cell key={entry.key} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: number) => formatRupiah(val)}
                      contentStyle={{
                        backgroundColor: '#18181B',
                        borderColor: '#3F3F46',
                        borderRadius: '10px',
                        color: '#FFFFFF',
                        fontSize: '12px',
                      }}
                      itemStyle={{ color: '#FFFFFF' }}
                      labelStyle={{ color: '#E4E4E7', fontWeight: 600 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div
                  style={{ color: 'var(--text-secondary)' }}
                  className="h-full flex items-center justify-center text-xs"
                >
                  Belum ada transaksi dalam 30 hari terakhir.
                </div>
              )}
            </div>
            <div className="space-y-2.5 text-xs">
              {stats.methodSeries.map((m) => (
                <div
                  key={m.key}
                  style={{
                    backgroundColor: 'var(--bg-subtle)',
                    borderColor: 'var(--border-hairline)',
                  }}
                  className="flex items-center justify-between p-3 rounded-xl border"
                >
                  <span className="flex items-center gap-2.5 font-semibold">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: m.color }}
                      aria-hidden="true"
                    />
                    {m.name}
                  </span>
                  <span className="font-bold tabular-nums">{formatRupiah(m.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action Queues (Image 1 soft pastel status pills) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="hig-card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle
                style={{ color: 'var(--accent-gold)' }}
                className="w-4 h-4"
                aria-hidden="true"
              />
              <h3 className="text-sm font-bold">Peringatan Stok Menipis</h3>
            </div>
            {can('view:warehouse') && (
              <button
                type="button"
                onClick={() => setActiveView('warehouse')}
                style={{ color: 'var(--accent-primary-text)' }}
                className="min-h-[36px] px-2 text-xs font-semibold hover:underline"
              >
                Kelola Gudang
              </button>
            )}
          </div>
          {stats.lowStockProducts.length === 0 ? (
            <div
              style={{ color: 'var(--status-positive)' }}
              className="py-5 flex items-center gap-2 text-xs font-medium"
            >
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              <span>Seluruh stok produk berada di atas batas minimum.</span>
            </div>
          ) : (
            <div className="space-y-1">
              {stats.lowStockProducts.slice(0, 5).map((p) => (
                <div
                  key={p.id}
                  className="px-2.5 -mx-2.5 py-2.5 rounded-lg hig-row-hover flex items-center justify-between gap-3 text-xs transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{p.name}</p>
                    <p style={{ color: 'var(--text-secondary)' }} className="font-mono mt-0.5">
                      {p.sku} · Min. {p.minStock} {p.unit}
                    </p>
                  </div>
                  <span
                    style={{
                      color:
                        p.stock === 0 ? 'var(--status-danger)' : 'var(--status-warning)',
                    }}
                    className="inline-flex items-center gap-1.5 font-semibold tabular-nums shrink-0"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-current shrink-0"
                      aria-hidden="true"
                    />
                    Sisa {p.stock} {p.unit}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="hig-card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CreditCard
                style={{ color: 'var(--status-danger)' }}
                className="w-4 h-4"
                aria-hidden="true"
              />
              <h3 className="text-sm font-bold">Tagihan Piutang Terlambat</h3>
            </div>
            {can('view:receivables') && (
              <button
                type="button"
                onClick={() => setActiveView('receivables')}
                style={{ color: 'var(--accent-primary-text)' }}
                className="min-h-[36px] px-2 text-xs font-semibold hover:underline"
              >
                Lihat Piutang
              </button>
            )}
          </div>
          {stats.overdueList.length === 0 ? (
            <div
              style={{ color: 'var(--status-positive)' }}
              className="py-5 flex items-center gap-2 text-xs font-medium"
            >
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              <span>Tidak ada cicilan pelanggan yang melewati jatuh tempo.</span>
            </div>
          ) : (
            <div className="space-y-1">
              {stats.overdueList.map((o) => (
                <div
                  key={o.id}
                  className="px-2.5 -mx-2.5 py-2.5 rounded-lg hig-row-hover flex items-center justify-between gap-3 text-xs transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{o.customerName}</p>
                    <p style={{ color: 'var(--text-secondary)' }} className="font-mono mt-0.5">
                      {o.planNumber}
                    </p>
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <p className="font-bold tabular-nums">{formatRupiah(o.remaining)}</p>
                    <span
                      style={{ color: 'var(--status-danger)' }}
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold"
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-current shrink-0"
                        aria-hidden="true"
                      />
                      Telat {o.maxDays} hari
                    </span>
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

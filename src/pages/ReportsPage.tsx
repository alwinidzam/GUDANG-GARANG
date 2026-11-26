import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Download, BarChart3 } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { useTheme } from '../context/ThemeContext';
import { downloadCsv } from '../lib/csv';
import { addDaysISO, extractDateISO, formatRupiah, toLocalDateISO } from '../lib/format';
import { EmptyState } from '../components/ui/SharedUi';

type ReportTab = 'DAILY' | 'MONTHLY' | 'BEST_SELLER' | 'TOP_CUSTOMERS' | 'TURNOVER';

export const ReportsPage: React.FC = () => {
  const { db, can } = useErp();
  const { resolvedTheme } = useTheme();
  const today = toLocalDateISO();

  const [tab, setTab] = useState<ReportTab>('DAILY');
  const [startDate, setStartDate] = useState(addDaysISO(today, -30));
  const [endDate, setEndDate] = useState(today);

  const completedTxs = useMemo(() => {
    return db.transactions.filter((t) => {
      if (t.status !== 'COMPLETED') return false;
      const d = extractDateISO(t.createdAt);
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });
  }, [db.transactions, startDate, endDate]);

  const dailyRows = useMemo(() => {
    const map = new Map<
      string,
      { date: string; txCount: number; grossRevenue: number; netSubtotal: number; hpp: number }
    >();
    for (const tx of completedTxs) {
      const d = extractDateISO(tx.createdAt);
      const curr = map.get(d) || {
        date: d,
        txCount: 0,
        grossRevenue: 0,
        netSubtotal: 0,
        hpp: 0,
      };
      curr.txCount += 1;
      curr.grossRevenue += tx.total;
      curr.netSubtotal += tx.subtotal;
      curr.hpp += tx.items.reduce((a, it) => a + it.costPrice * it.qty, 0);
      map.set(d, curr);
    }
    return Array.from(map.values())
      .map((r) => ({ ...r, grossProfit: r.netSubtotal - r.hpp }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [completedTxs]);

  const monthlyRows = useMemo(() => {
    const map = new Map<
      string,
      {
        month: string;
        txCount: number;
        grossRevenue: number;
        tax: number;
        hpp: number;
        expenses: number;
        netProfit: number;
      }
    >();
    for (const tx of completedTxs) {
      const ym = extractDateISO(tx.createdAt).slice(0, 7);
      const curr = map.get(ym) || {
        month: ym,
        txCount: 0,
        grossRevenue: 0,
        tax: 0,
        hpp: 0,
        expenses: 0,
        netProfit: 0,
      };
      const txHpp = tx.items.reduce((a, it) => a + it.costPrice * it.qty, 0);
      curr.txCount += 1;
      curr.grossRevenue += tx.total;
      curr.tax += tx.taxAmount;
      curr.hpp += txHpp;
      curr.netProfit += tx.subtotal - txHpp;
      map.set(ym, curr);
    }
    for (const exp of db.expenses || []) {
      if (startDate && exp.date < startDate) continue;
      if (endDate && exp.date > endDate) continue;
      const ym = exp.date.slice(0, 7);
      const curr = map.get(ym) || {
        month: ym,
        txCount: 0,
        grossRevenue: 0,
        tax: 0,
        hpp: 0,
        expenses: 0,
        netProfit: 0,
      };
      curr.expenses += exp.amount;
      curr.netProfit -= exp.amount;
      map.set(ym, curr);
    }
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [completedTxs, db.expenses, startDate, endDate]);

  const bestSellerRows = useMemo(() => {
    const map = new Map<
      string,
      { sku: string; name: string; unit: string; qtySold: number; revenue: number; profit: number }
    >();
    for (const tx of completedTxs) {
      for (const it of tx.items) {
        const curr = map.get(it.productId) || {
          sku: it.sku,
          name: it.productName,
          unit: it.unit,
          qtySold: 0,
          revenue: 0,
          profit: 0,
        };
        curr.qtySold += it.qty;
        curr.revenue += it.subtotal;
        curr.profit += (it.sellPrice - it.costPrice) * it.qty;
        map.set(it.productId, curr);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [completedTxs]);

  const topCustomerRows = useMemo(() => {
    const map = new Map<
      string,
      { name: string; txCount: number; totalSpend: number; avgOrder: number }
    >();
    for (const tx of completedTxs) {
      const key = tx.customerId || 'UMUM';
      const curr = map.get(key) || {
        name: tx.customerName,
        txCount: 0,
        totalSpend: 0,
        avgOrder: 0,
      };
      curr.txCount += 1;
      curr.totalSpend += tx.total;
      curr.avgOrder = Math.round(curr.totalSpend / curr.txCount);
      map.set(key, curr);
    }
    return Array.from(map.values()).sort((a, b) => b.totalSpend - a.totalSpend);
  }, [completedTxs]);

  const turnoverRows = useMemo(() => {
    const soldMap = new Map<string, number>();
    for (const tx of completedTxs) {
      for (const it of tx.items) {
        soldMap.set(it.productId, (soldMap.get(it.productId) || 0) + it.qty);
      }
    }
    return db.products
      .map((p) => {
        const qtySold = soldMap.get(p.id) || 0;
        const avgPool = Math.max(1, p.stock + qtySold / 2);
        const turnoverRate = Number((qtySold / avgPool).toFixed(2));
        return {
          sku: p.sku,
          name: p.name,
          unit: p.unit,
          currentStock: p.stock,
          qtySold,
          turnoverRate,
          hppStockValue: p.stock * p.costPrice,
        };
      })
      .sort((a, b) => b.turnoverRate - a.turnoverRate);
  }, [db.products, completedTxs]);

  const handleExportActiveTab = () => {
    if (tab === 'DAILY') {
      downloadCsv(
        `laporan-harian-${startDate}-${endDate}.csv`,
        ['Tanggal', 'Jumlah Transaksi', 'Omset (Incl. PPN)', 'Penjualan Bersih', 'HPP', 'Laba Kotor'],
        dailyRows.map((r) => [r.date, r.txCount, r.grossRevenue, r.netSubtotal, r.hpp, r.grossProfit])
      );
    } else if (tab === 'MONTHLY') {
      downloadCsv(
        `laporan-bulanan-laba-rugi.csv`,
        ['Bulan', 'Transaksi', 'Gross Revenue', 'PPN', 'Total HPP', 'Pengeluaran Ops.', 'Laba Bersih'],
        monthlyRows.map((r) => [r.month, r.txCount, r.grossRevenue, r.tax, r.hpp, r.expenses, r.netProfit])
      );
    } else if (tab === 'BEST_SELLER') {
      downloadCsv(
        `laporan-best-seller.csv`,
        ['SKU', 'Produk', 'Satuan', 'Terjual', 'Pendapatan', 'Laba Kotor'],
        bestSellerRows.map((r) => [r.sku, r.name, r.unit, r.qtySold, r.revenue, r.profit])
      );
    } else if (tab === 'TOP_CUSTOMERS') {
      downloadCsv(
        `laporan-top-pelanggan.csv`,
        ['Pelanggan', 'Jumlah Transaksi', 'Total Belanja', 'Rata-rata Order'],
        topCustomerRows.map((r) => [r.name, r.txCount, r.totalSpend, r.avgOrder])
      );
    } else {
      downloadCsv(
        `laporan-perputaran-stok.csv`,
        ['SKU', 'Produk', 'Stok Akhir', 'Terjual Periode', 'Rasio Perputaran', 'Valuasi HPP'],
        turnoverRows.map((r) => [
          r.sku,
          r.name,
          r.currentStock,
          r.qtySold,
          r.turnoverRate,
          r.hppStockValue,
        ])
      );
    }
  };

  const gridStroke = resolvedTheme === 'dark' ? '#2E2B28' : '#ECECEF';
  const axisTickColor = resolvedTheme === 'dark' ? '#AEA8A1' : '#52525B';
  const revenueBarColor = resolvedTheme === 'dark' ? '#F4F4F5' : '#18181B';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">
            Laporan Keuangan &amp; Analitik Multi-Dimensi
          </h2>
          <p style={{ color: 'var(--text-secondary)' }} className="text-xs mt-0.5">
            Analisis laba rugi, omset harian, produk terlaris, top pelanggan, dan perputaran stok.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input
            type="date"
            aria-label="Tanggal mulai laporan"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="min-h-[40px] px-2.5 py-1.5 hig-input"
          />
          <span style={{ color: 'var(--text-secondary)' }}>s/d</span>
          <input
            type="date"
            aria-label="Tanggal akhir laporan"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="min-h-[40px] px-2.5 py-1.5 hig-input"
          />
          {can('reports:export') && (
            <button
              type="button"
              onClick={handleExportActiveTab}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 hig-btn-cta font-semibold"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export CSV / Excel</span>
            </button>
          )}
        </div>
      </div>

      {/* Segmented Tabs (Image 1 style) */}
      <div
        role="tablist"
        aria-label="Jenis laporan keuangan"
        style={{
          backgroundColor: 'var(--bg-subtle)',
          borderColor: 'var(--border-hairline)',
        }}
        className="flex flex-wrap gap-1 border rounded-xl p-1"
      >
        {(
          [
            { id: 'DAILY', label: 'Laporan Harian' },
            { id: 'MONTHLY', label: 'Bulanan (Laba Rugi)' },
            { id: 'BEST_SELLER', label: 'Best Seller Produk' },
            { id: 'TOP_CUSTOMERS', label: 'Top Pelanggan' },
            { id: 'TURNOVER', label: 'Perputaran Stok' },
          ] as const
        ).map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              style={
                active
                  ? { backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }
                  : { color: 'var(--text-secondary)' }
              }
              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
                active ? 'shadow-xs' : 'hover:text-[var(--text-primary)]'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Monthly P&L Chart */}
      {tab === 'MONTHLY' && monthlyRows.length > 0 && (
        <div className="hig-card p-5">
          <h3 className="text-sm font-bold mb-3">
            Perbandingan Pendapatan Kotor, HPP, dan Laba Bersih Bulanan
          </h3>
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyRows}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: axisTickColor }} />
                <YAxis
                  tick={{ fontSize: 11, fill: axisTickColor }}
                  tickFormatter={(v: number) => `${Math.round(v / 1_000_000)}jt`}
                />
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
                <Legend />
                <Bar
                  dataKey="grossRevenue"
                  name="Gross Revenue"
                  fill={revenueBarColor}
                  radius={[4, 4, 0, 0]}
                />
                <Bar dataKey="hpp" name="HPP Modal" fill="#B45309" radius={[4, 4, 0, 0]} />
                <Bar
                  dataKey="netProfit"
                  name="Laba Bersih"
                  fill="#047857"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Report Table */}
      <div className="hig-card overflow-hidden">
        <div className="overflow-x-auto">
          {tab === 'DAILY' &&
            (dailyRows.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="Belum ada transaksi pada periode ini"
                description="Catat penjualan melalui Kasir & POS atau perluas rentang tanggal untuk melihat laporan harian."
              />
            ) : (
              <table className="w-full text-xs text-left">
                <thead className="hig-table-head">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Tanggal</th>
                    <th className="py-3 px-4 font-semibold text-right">Transaksi</th>
                    <th className="py-3 px-4 font-semibold text-right">Omset (Incl. PPN)</th>
                    <th className="py-3 px-4 font-semibold text-right">Penjualan Bersih</th>
                    <th className="py-3 px-4 font-semibold text-right">HPP</th>
                    <th className="py-3 px-4 font-semibold text-right">Laba Kotor</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {dailyRows.map((r) => (
                    <tr key={r.date} className="hig-row-hover">
                      <td className="py-3 px-4 font-mono font-bold">{r.date}</td>
                      <td className="py-3 px-4 text-right">{r.txCount}</td>
                      <td className="py-3 px-4 text-right font-bold">
                        {formatRupiah(r.grossRevenue)}
                      </td>
                      <td className="py-3 px-4 text-right">{formatRupiah(r.netSubtotal)}</td>
                      <td style={{ color: 'var(--text-secondary)' }} className="py-3 px-4 text-right">
                        {formatRupiah(r.hpp)}
                      </td>
                      <td
                        style={{ color: 'var(--status-positive)' }}
                        className="py-3 px-4 text-right font-bold"
                      >
                        {formatRupiah(r.grossProfit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}

          {tab === 'MONTHLY' &&
            (monthlyRows.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="Belum ada data laba rugi bulanan"
                description="Ringkasan bulanan akan muncul otomatis setelah transaksi penjualan tercatat."
              />
            ) : (
              <table className="w-full text-xs text-left">
                <thead className="hig-table-head">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Bulan</th>
                    <th className="py-3 px-4 font-semibold text-right">Transaksi</th>
                    <th className="py-3 px-4 font-semibold text-right">Gross Revenue</th>
                    <th className="py-3 px-4 font-semibold text-right">PPN Terkumpul</th>
                    <th className="py-3 px-4 font-semibold text-right">Total HPP</th>
                    <th className="py-3 px-4 font-semibold text-right">Pengeluaran Ops.</th>
                    <th className="py-3 px-4 font-semibold text-right">Laba Bersih Riil</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {monthlyRows.map((r) => (
                    <tr key={r.month} className="hig-row-hover">
                      <td className="py-3 px-4 font-mono font-bold">{r.month}</td>
                      <td className="py-3 px-4 text-right">{r.txCount}</td>
                      <td className="py-3 px-4 text-right font-bold">
                        {formatRupiah(r.grossRevenue)}
                      </td>
                      <td className="py-3 px-4 text-right">{formatRupiah(r.tax)}</td>
                      <td style={{ color: 'var(--text-secondary)' }} className="py-3 px-4 text-right">
                        {formatRupiah(r.hpp)}
                      </td>
                      <td style={{ color: 'var(--status-danger)' }} className="py-3 px-4 text-right">
                        {formatRupiah(r.expenses)}
                      </td>
                      <td
                        style={{
                          color:
                            r.netProfit >= 0 ? 'var(--status-positive)' : 'var(--status-danger)',
                        }}
                        className="py-3 px-4 text-right font-bold"
                      >
                        {formatRupiah(r.netProfit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}

          {tab === 'BEST_SELLER' &&
            (bestSellerRows.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="Belum ada produk terjual pada periode ini"
                description="Peringkat produk terlaris dihitung dari transaksi penjualan selesai."
              />
            ) : (
              <table className="w-full text-xs text-left">
                <thead className="hig-table-head">
                  <tr>
                    <th className="py-3 px-4 font-semibold">#</th>
                    <th className="py-3 px-4 font-semibold">SKU</th>
                    <th className="py-3 px-4 font-semibold">Nama Produk</th>
                    <th className="py-3 px-4 font-semibold text-right">Qty Terjual</th>
                    <th className="py-3 px-4 font-semibold text-right">Kontribusi Pendapatan</th>
                    <th className="py-3 px-4 font-semibold text-right">Laba Kotor</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {bestSellerRows.map((r, idx) => (
                    <tr key={r.sku} className="hig-row-hover">
                      <td
                        style={{ color: 'var(--accent-primary-text)' }}
                        className="py-3 px-4 font-bold"
                      >
                        #{idx + 1}
                      </td>
                      <td className="py-3 px-4 font-mono">{r.sku}</td>
                      <td className="py-3 px-4 font-bold">{r.name}</td>
                      <td className="py-3 px-4 text-right font-semibold">
                        {r.qtySold} {r.unit}
                      </td>
                      <td className="py-3 px-4 text-right font-bold">{formatRupiah(r.revenue)}</td>
                      <td
                        style={{ color: 'var(--status-positive)' }}
                        className="py-3 px-4 text-right font-bold"
                      >
                        {formatRupiah(r.profit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}

          {tab === 'TOP_CUSTOMERS' &&
            (topCustomerRows.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="Belum ada data belanja pelanggan"
                description="Kontribusi pelanggan teratas akan tampil setelah transaksi tercatat."
              />
            ) : (
              <table className="w-full text-xs text-left">
                <thead className="hig-table-head">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Peringkat</th>
                    <th className="py-3 px-4 font-semibold">Nama Pelanggan</th>
                    <th className="py-3 px-4 font-semibold text-right">Jumlah Transaksi</th>
                    <th className="py-3 px-4 font-semibold text-right">Rata-Rata Order</th>
                    <th className="py-3 px-4 font-semibold text-right">Total Kontribusi</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {topCustomerRows.map((r, idx) => (
                    <tr key={r.name} className="hig-row-hover">
                      <td style={{ color: 'var(--accent-gold)' }} className="py-3 px-4 font-bold">
                        #{idx + 1}
                      </td>
                      <td className="py-3 px-4 font-bold">{r.name}</td>
                      <td className="py-3 px-4 text-right">{r.txCount}</td>
                      <td className="py-3 px-4 text-right">{formatRupiah(r.avgOrder)}</td>
                      <td className="py-3 px-4 text-right font-bold">
                        {formatRupiah(r.totalSpend)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}

          {tab === 'TURNOVER' &&
            (turnoverRows.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="Belum ada produk di katalog"
                description="Tambahkan produk di Master Produk untuk memantau rasio perputaran stok."
              />
            ) : (
              <table className="w-full text-xs text-left">
                <thead className="hig-table-head">
                  <tr>
                    <th className="py-3 px-4 font-semibold">SKU</th>
                    <th className="py-3 px-4 font-semibold">Nama Produk</th>
                    <th className="py-3 px-4 font-semibold text-right">Stok Akhir</th>
                    <th className="py-3 px-4 font-semibold text-right">Terjual (Periode)</th>
                    <th className="py-3 px-4 font-semibold text-right">Rasio Perputaran</th>
                    <th className="py-3 px-4 font-semibold text-right">Valuasi Stok (HPP)</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {turnoverRows.map((r) => (
                    <tr key={r.sku} className="hig-row-hover">
                      <td className="py-3 px-4 font-mono whitespace-nowrap">{r.sku}</td>
                      <td className="py-3 px-4 font-bold">{r.name}</td>
                      <td className="py-3 px-4 text-right">
                        {r.currentStock} {r.unit}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold">
                        {r.qtySold} {r.unit}
                      </td>
                      <td
                        style={{ color: 'var(--accent-primary-text)' }}
                        className="py-3 px-4 text-right font-bold"
                      >
                        {r.turnoverRate}x
                      </td>
                      <td className="py-3 px-4 text-right font-bold">
                        {formatRupiah(r.hppStockValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
        </div>
      </div>
    </div>
  );
};

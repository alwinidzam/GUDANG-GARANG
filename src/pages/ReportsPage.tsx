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
import { Download } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { downloadCsv } from '../lib/csv';
import { addDaysISO, extractDateISO, formatRupiah, toLocalDateISO } from '../lib/format';

type ReportTab = 'DAILY' | 'MONTHLY' | 'BEST_SELLER' | 'TOP_CUSTOMERS' | 'TURNOVER';

export const ReportsPage: React.FC = () => {
  const { db, can } = useErp();
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

  // 1. Daily report
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

  // 2. Monthly P&L report (based on all completed transactions, or filtered range)
  const monthlyRows = useMemo(() => {
    const map = new Map<
      string,
      { month: string; txCount: number; grossRevenue: number; tax: number; hpp: number; netProfit: number }
    >();
    for (const tx of completedTxs) {
      const ym = extractDateISO(tx.createdAt).slice(0, 7);
      const curr = map.get(ym) || {
        month: ym,
        txCount: 0,
        grossRevenue: 0,
        tax: 0,
        hpp: 0,
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
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [completedTxs]);

  // 3. Best Seller report
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

  // 4. Top Spenders report
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

  // 5. Stock Turnover report
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
        ['Bulan', 'Transaksi', 'Gross Revenue', 'PPN', 'Total HPP', 'Laba Bersih (Ex-PPN)'],
        monthlyRows.map((r) => [r.month, r.txCount, r.grossRevenue, r.tax, r.hpp, r.netProfit])
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-[#1A1614]">
            Laporan Keuangan &amp; Analitik Multi-Dimensi
          </h2>
          <p className="text-xs text-[#6B6257]">
            Analisis laba rugi, omset harian, produk terlaris, top pelanggan, dan perputaran stok.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-[#D8D0C5] bg-white"
          />
          <span className="text-[#6B6257]">s/d</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-[#D8D0C5] bg-white"
          />
          {can('reports:export') && (
            <button
              type="button"
              onClick={handleExportActiveTab}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#14110F] hover:bg-[#B91C1C] text-white font-bold cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV / Excel
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 bg-white border border-[#E6E0D6] rounded-xl p-2">
        {(
          [
            { id: 'DAILY', label: 'Laporan Harian' },
            { id: 'MONTHLY', label: 'Bulanan (Laba Rugi)' },
            { id: 'BEST_SELLER', label: 'Best Seller Produk' },
            { id: 'TOP_CUSTOMERS', label: 'Top Pelanggan' },
            { id: 'TURNOVER', label: 'Perputaran Stok' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold cursor-pointer ${
              tab === t.id
                ? 'bg-[#B91C1C] text-white'
                : 'text-[#5C5349] hover:bg-[#F1EDE5]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Monthly P&L Chart */}
      {tab === 'MONTHLY' && monthlyRows.length > 0 && (
        <div className="bg-white border border-[#E6E0D6] rounded-xl p-5">
          <h3 className="text-sm font-extrabold text-[#1A1614] mb-3">
            Grafik Pendapatan Kotor, HPP &amp; Laba Bersih Bulanan
          </h3>
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EDE7DD" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `${Math.round(v / 1_000_000)}jt`}
                />
                <Tooltip formatter={(val: number) => formatRupiah(val)} />
                <Legend />
                <Bar dataKey="grossRevenue" name="Gross Revenue" fill="#14110F" radius={[4, 4, 0, 0]} />
                <Bar dataKey="hpp" name="HPP Modal" fill="#D4A017" radius={[4, 4, 0, 0]} />
                <Bar dataKey="netProfit" name="Laba Bersih" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Report Table */}
      <div className="bg-white border border-[#E6E0D6] rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          {tab === 'DAILY' && (
            <table className="w-full text-xs text-left">
              <thead className="bg-[#F8F6F2] border-b border-[#E6E0D6] text-[#5C5349] uppercase">
                <tr>
                  <th className="py-3 px-4 font-bold">Tanggal</th>
                  <th className="py-3 px-4 font-bold text-right">Transaksi</th>
                  <th className="py-3 px-4 font-bold text-right">Omset (Incl. PPN)</th>
                  <th className="py-3 px-4 font-bold text-right">Penjualan Bersih</th>
                  <th className="py-3 px-4 font-bold text-right">HPP</th>
                  <th className="py-3 px-4 font-bold text-right">Laba Kotor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDE7DD] tabular-nums">
                {dailyRows.map((r) => (
                  <tr key={r.date} className="hover:bg-[#FAF8F4]">
                    <td className="py-3 px-4 font-mono font-bold">{r.date}</td>
                    <td className="py-3 px-4 text-right">{r.txCount}</td>
                    <td className="py-3 px-4 text-right font-bold">
                      {formatRupiah(r.grossRevenue)}
                    </td>
                    <td className="py-3 px-4 text-right">{formatRupiah(r.netSubtotal)}</td>
                    <td className="py-3 px-4 text-right text-[#6B6257]">{formatRupiah(r.hpp)}</td>
                    <td className="py-3 px-4 text-right font-extrabold text-emerald-700">
                      {formatRupiah(r.grossProfit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'MONTHLY' && (
            <table className="w-full text-xs text-left">
              <thead className="bg-[#F8F6F2] border-b border-[#E6E0D6] text-[#5C5349] uppercase">
                <tr>
                  <th className="py-3 px-4 font-bold">Bulan</th>
                  <th className="py-3 px-4 font-bold text-right">Transaksi</th>
                  <th className="py-3 px-4 font-bold text-right">Gross Revenue</th>
                  <th className="py-3 px-4 font-bold text-right">PPN Terkumpul</th>
                  <th className="py-3 px-4 font-bold text-right">Total HPP</th>
                  <th className="py-3 px-4 font-bold text-right">Laba Bersih (Ex-PPN)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDE7DD] tabular-nums">
                {monthlyRows.map((r) => (
                  <tr key={r.month}>
                    <td className="py-3 px-4 font-mono font-bold">{r.month}</td>
                    <td className="py-3 px-4 text-right">{r.txCount}</td>
                    <td className="py-3 px-4 text-right font-bold">
                      {formatRupiah(r.grossRevenue)}
                    </td>
                    <td className="py-3 px-4 text-right">{formatRupiah(r.tax)}</td>
                    <td className="py-3 px-4 text-right text-[#6B6257]">{formatRupiah(r.hpp)}</td>
                    <td className="py-3 px-4 text-right font-extrabold text-emerald-700">
                      {formatRupiah(r.netProfit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'BEST_SELLER' && (
            <table className="w-full text-xs text-left">
              <thead className="bg-[#F8F6F2] border-b border-[#E6E0D6] text-[#5C5349] uppercase">
                <tr>
                  <th className="py-3 px-4 font-bold">#</th>
                  <th className="py-3 px-4 font-bold">SKU</th>
                  <th className="py-3 px-4 font-bold">Nama Produk</th>
                  <th className="py-3 px-4 font-bold text-right">Qty Terjual</th>
                  <th className="py-3 px-4 font-bold text-right">Kontribusi Pendapatan</th>
                  <th className="py-3 px-4 font-bold text-right">Laba Kotor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDE7DD] tabular-nums">
                {bestSellerRows.map((r, idx) => (
                  <tr key={r.sku}>
                    <td className="py-3 px-4 font-bold text-[#B91C1C]">#{idx + 1}</td>
                    <td className="py-3 px-4 font-mono">{r.sku}</td>
                    <td className="py-3 px-4 font-bold">{r.name}</td>
                    <td className="py-3 px-4 text-right font-semibold">
                      {r.qtySold} {r.unit}
                    </td>
                    <td className="py-3 px-4 text-right font-bold">{formatRupiah(r.revenue)}</td>
                    <td className="py-3 px-4 text-right font-extrabold text-emerald-700">
                      {formatRupiah(r.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'TOP_CUSTOMERS' && (
            <table className="w-full text-xs text-left">
              <thead className="bg-[#F8F6F2] border-b border-[#E6E0D6] text-[#5C5349] uppercase">
                <tr>
                  <th className="py-3 px-4 font-bold">Peringkat</th>
                  <th className="py-3 px-4 font-bold">Nama Pelanggan</th>
                  <th className="py-3 px-4 font-bold text-right">Jumlah Transaksi</th>
                  <th className="py-3 px-4 font-bold text-right">Rata-Rata Order</th>
                  <th className="py-3 px-4 font-bold text-right">Total Kontribusi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDE7DD] tabular-nums">
                {topCustomerRows.map((r, idx) => (
                  <tr key={r.name}>
                    <td className="py-3 px-4 font-bold text-[#B8860B]">#{idx + 1}</td>
                    <td className="py-3 px-4 font-bold">{r.name}</td>
                    <td className="py-3 px-4 text-right">{r.txCount}</td>
                    <td className="py-3 px-4 text-right">{formatRupiah(r.avgOrder)}</td>
                    <td className="py-3 px-4 text-right font-extrabold text-[#1A1614]">
                      {formatRupiah(r.totalSpend)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'TURNOVER' && (
            <table className="w-full text-xs text-left">
              <thead className="bg-[#F8F6F2] border-b border-[#E6E0D6] text-[#5C5349] uppercase">
                <tr>
                  <th className="py-3 px-4 font-bold">SKU</th>
                  <th className="py-3 px-4 font-bold">Nama Produk</th>
                  <th className="py-3 px-4 font-bold text-right">Stok Akhir</th>
                  <th className="py-3 px-4 font-bold text-right">Terjual (Periode)</th>
                  <th className="py-3 px-4 font-bold text-right">Rasio Perputaran</th>
                  <th className="py-3 px-4 font-bold text-right">Valuasi Stok (HPP)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDE7DD] tabular-nums">
                {turnoverRows.map((r) => (
                  <tr key={r.sku}>
                    <td className="py-3 px-4 font-mono">{r.sku}</td>
                    <td className="py-3 px-4 font-bold">{r.name}</td>
                    <td className="py-3 px-4 text-right">
                      {r.currentStock} {r.unit}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold">
                      {r.qtySold} {r.unit}
                    </td>
                    <td className="py-3 px-4 text-right font-extrabold text-[#B91C1C]">
                      {r.turnoverRate}x
                    </td>
                    <td className="py-3 px-4 text-right font-bold">
                      {formatRupiah(r.hppStockValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

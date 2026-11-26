import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { getPlanMetrics } from '../../lib/calculations';
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatRupiah,
  terbilangRupiah,
} from '../../lib/format';
import { PrintRequest } from '../../types/erp';
import { MacWindowDots } from '../ui/SharedUi';

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Tunai',
  TRANSFER: 'Transfer Bank',
  QRIS: 'QRIS',
  CREDIT: 'Kredit / Tempo',
};

const ThermalDocument: React.FC<{
  widthMm: 58 | 80;
  req: Extract<PrintRequest, { transaction: unknown }>;
}> = ({ widthMm, req }) => {
  const { db } = useErp();
  const { transaction: tx, paymentPlan } = req;
  const maxWidthStyle = widthMm === 58 ? '54mm' : '74mm';
  const fontSizeClass = widthMm === 58 ? 'text-[10px]' : 'text-[11px]';

  return (
    <div
      style={{ width: maxWidthStyle }}
      className={`mx-auto bg-white text-black font-mono ${fontSizeClass} leading-snug p-2`}
    >
      <div className="text-center border-b border-dashed border-black pb-2 mb-2">
        <div className="inline-flex items-center justify-center bg-[#14110F] px-2.5 py-1.5 rounded mb-1.5">
          <img
            src="/Indobacco_transparent.svg"
            alt="Indobacco"
            width={48}
            height={48}
            className="w-12 h-12 object-contain"
          />
        </div>
        <p className="font-bold text-xs uppercase">{db.settings.companyName}</p>
        <p className="text-[9px] leading-tight mt-0.5">{db.settings.address}</p>
        <p className="text-[9px]">Telp: {db.settings.phone}</p>
      </div>

      <div className="border-b border-dashed border-black pb-1.5 mb-2 space-y-0.5">
        <div className="flex justify-between">
          <span>No:</span>
          <span className="font-bold">{tx.invoiceNumber}</span>
        </div>
        <div className="flex justify-between">
          <span>Tgl:</span>
          <span>{formatDateTime(tx.createdAt)}</span>
        </div>
        <div className="flex justify-between">
          <span>Kasir:</span>
          <span>{tx.cashierName}</span>
        </div>
        <div className="flex justify-between">
          <span>Plg:</span>
          <span className="truncate max-w-[60%] text-right">{tx.customerName}</span>
        </div>
      </div>

      {tx.status === 'VOIDED' && (
        <div className="text-center font-bold border border-black py-0.5 mb-2">
          *** TRANSAKSI DIBATALKAN (VOID) ***
        </div>
      )}

      <div className="border-b border-dashed border-black pb-1.5 mb-2 space-y-1.5">
        {tx.items.map((item) => (
          <div key={item.productId}>
            <p className="font-semibold">{item.productName}</p>
            <div className="flex justify-between tabular-nums">
              <span>
                {item.qty} {item.unit} x {formatRupiah(item.sellPrice)}
              </span>
              <span className="font-semibold">{formatRupiah(item.subtotal)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="border-b border-dashed border-black pb-1.5 mb-2 space-y-0.5 tabular-nums">
        {(tx.discountAmount || 0) > 0 && (
          <div className="flex justify-between">
            <span>Diskon</span>
            <span>-{formatRupiah(tx.discountAmount || 0)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatRupiah(tx.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>PPN ({tx.taxRate}%)</span>
          <span>{formatRupiah(tx.taxAmount)}</span>
        </div>
        {(tx.shippingCost || 0) > 0 && (
          <div className="flex justify-between">
            <span>Ongkir</span>
            <span>{formatRupiah(tx.shippingCost || 0)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-xs pt-0.5">
          <span>TOTAL</span>
          <span>{formatRupiah(tx.total)}</span>
        </div>
      </div>

      <div className="border-b border-dashed border-black pb-2 mb-2 space-y-0.5 tabular-nums">
        <div className="flex justify-between">
          <span>Metode</span>
          <span className="font-semibold">{PAYMENT_LABELS[tx.paymentMethod]}</span>
        </div>
        {tx.paymentMethod === 'CREDIT' ? (
          <>
            <div className="flex justify-between">
              <span>Uang Muka (DP)</span>
              <span>{formatRupiah(tx.amountPaid)}</span>
            </div>
            {paymentPlan && (
              <>
                <div className="flex justify-between">
                  <span>Total Cicilan</span>
                  <span>{formatRupiah(paymentPlan.totalPayable)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Skema</span>
                  <span>
                    {paymentPlan.frequency === 'FLEXIBLE'
                      ? `Tempo ${paymentPlan.tempoDays || 30}hr`
                      : `${paymentPlan.tenorCount}x ${
                          paymentPlan.frequency === 'WEEKLY' ? 'Mingguan' : 'Bulanan'
                        }`}
                  </span>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div className="flex justify-between">
              <span>Bayar</span>
              <span>{formatRupiah(tx.amountPaid)}</span>
            </div>
            <div className="flex justify-between">
              <span>Kembali</span>
              <span>{formatRupiah(tx.changeAmount)}</span>
            </div>
          </>
        )}
      </div>

      <div className="text-center text-[9px] space-y-1">
        <p>{db.settings.receiptFooter}</p>
        <p className="font-bold">--- {tx.invoiceNumber} ---</p>
      </div>
    </div>
  );
};

const InvoiceA4Document: React.FC<{
  req: Extract<PrintRequest, { transaction: unknown }>;
}> = ({ req }) => {
  const { db } = useErp();
  const { transaction: tx, paymentPlan } = req;

  return (
    <div className="w-[210mm] min-h-[275mm] mx-auto bg-white text-[#18181B] p-10 text-sm">
      <div className="flex items-start justify-between border-b-2 border-[#14110F] pb-5 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-24 h-24 rounded-xl bg-[#14110F] p-2 shrink-0 flex items-center justify-center">
            <img
              src="/Indobacco_transparent.svg"
              alt="Logo Indobacco"
              width={80}
              height={80}
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-[#14110F]">
              {db.settings.companyName}
            </h1>
            <p className="text-xs font-semibold text-[#855D00] uppercase mt-0.5">
              {db.settings.tagline}
            </p>
            <p className="text-xs text-[#52525B] mt-1.5 max-w-sm">{db.settings.address}</p>
            <p className="text-xs text-[#52525B]">
              Telp: {db.settings.phone} · Email: {db.settings.email}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold text-[#B91C1C]">INVOICE</p>
          <p className="font-mono font-bold text-sm mt-1">{tx.invoiceNumber}</p>
          <p className="text-xs text-[#52525B] mt-1">Tanggal: {formatDateTime(tx.createdAt)}</p>
          <p className="text-xs mt-1">
            Status:{' '}
            <span className="font-bold">
              {tx.status === 'VOIDED'
                ? 'DIBATALKAN (VOID)'
                : tx.paymentMethod === 'CREDIT'
                ? 'KREDIT / TEMPO'
                : 'LUNAS'}
            </span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6 bg-[#F6F6F7] border border-[#E4E4E7] rounded-lg p-4 text-xs">
        <div>
          <p className="font-bold text-[#52525B] mb-1">Kepada Yth:</p>
          <p className="text-sm font-bold text-[#18181B]">{tx.customerName}</p>
          {tx.customerPhone && <p className="text-[#52525B] mt-0.5">Telp/WA: {tx.customerPhone}</p>}
          {tx.customerAddress && <p className="text-[#52525B] mt-0.5">{tx.customerAddress}</p>}
        </div>
        <div className="text-right space-y-1">
          <p>
            <span className="text-[#52525B]">No. Surat Jalan:</span>{' '}
            <span className="font-mono font-semibold">{tx.suratJalanNumber}</span>
          </p>
          <p>
            <span className="text-[#52525B]">Metode Pembayaran:</span>{' '}
            <span className="font-semibold">{PAYMENT_LABELS[tx.paymentMethod]}</span>
          </p>
          {tx.transferReference && (
            <p>
              <span className="text-[#52525B]">Ref. Transfer:</span>{' '}
              <span className="font-mono font-semibold">{tx.transferReference}</span>
            </p>
          )}
          <p>
            <span className="text-[#52525B]">Kasir / Admin:</span>{' '}
            <span className="font-semibold">{tx.cashierName}</span>
          </p>
        </div>
      </div>

      <table className="w-full border-collapse mb-6 text-xs">
        <thead>
          <tr className="bg-[#14110F] text-white">
            <th className="py-2.5 px-3 text-left font-semibold">No</th>
            <th className="py-2.5 px-3 text-left font-semibold">SKU</th>
            <th className="py-2.5 px-3 text-left font-semibold">Nama Produk</th>
            <th className="py-2.5 px-3 text-right font-semibold">Qty</th>
            <th className="py-2.5 px-3 text-right font-semibold">Harga Satuan</th>
            <th className="py-2.5 px-3 text-right font-semibold">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {tx.items.map((item, idx) => (
            <tr key={item.productId} className="border-b border-[#E4E4E7]">
              <td className="py-2.5 px-3 tabular-nums">{idx + 1}</td>
              <td className="py-2.5 px-3 font-mono">{item.sku}</td>
              <td className="py-2.5 px-3 font-medium">{item.productName}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">
                {item.qty} {item.unit}
              </td>
              <td className="py-2.5 px-3 text-right tabular-nums">
                {formatRupiah(item.sellPrice)}
              </td>
              <td className="py-2.5 px-3 text-right font-semibold tabular-nums">
                {formatRupiah(item.subtotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-between items-start gap-6 mb-10">
        <div className="w-1/2 text-xs text-[#52525B] space-y-1.5">
          <p className="font-bold text-[#18181B]">Catatan &amp; Ketentuan:</p>
          <p>
            1. Barang yang sudah diterima dan diperiksa tidak dapat dikembalikan kecuali cacat
            produksi.
          </p>
          <p>2. Dokumen ini dicetak otomatis oleh sistem {db.settings.companyName}.</p>
          {db.settings.bankName && db.settings.bankAccountNumber && (
            <div className="mt-2 p-2.5 rounded border border-[#E4E4E7] bg-[#F6F6F7] text-[#18181B]">
              <p className="font-bold">Info Transfer Pembayaran:</p>
              <p>
                {db.settings.bankName} · No. Rek{' '}
                <span className="font-mono font-bold">{db.settings.bankAccountNumber}</span>
                {db.settings.bankAccountHolder ? ` a.n. ${db.settings.bankAccountHolder}` : ''}
              </p>
            </div>
          )}
          {paymentPlan && (
            <div className="mt-2 p-2.5 rounded border border-amber-400 bg-amber-50 text-[#18181B]">
              <p className="font-bold">Rencana Kredit: {paymentPlan.planNumber}</p>
              <p>
                DP: {formatRupiah(paymentPlan.downPayment)} ·{' '}
                {paymentPlan.frequency === 'FLEXIBLE'
                  ? `Tempo Fleksibel ${paymentPlan.tempoDays || 30} hari`
                  : `Tenor: ${paymentPlan.tenorCount}x ${
                      paymentPlan.frequency === 'WEEKLY' ? 'Mingguan' : 'Bulanan'
                    }`}
                {paymentPlan.interestRate > 0 ? ` · Bunga ${paymentPlan.interestRate}%` : ''}
              </p>
            </div>
          )}
        </div>

        <div className="w-64 space-y-2 text-xs tabular-nums">
          {(tx.discountAmount || 0) > 0 && (
            <div className="flex justify-between text-[#065F46]">
              <span>Diskon</span>
              <span className="font-semibold">-{formatRupiah(tx.discountAmount || 0)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-[#52525B]">Subtotal</span>
            <span className="font-semibold">{formatRupiah(tx.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#52525B]">PPN ({tx.taxRate}%)</span>
            <span className="font-semibold">{formatRupiah(tx.taxAmount)}</span>
          </div>
          {(tx.shippingCost || 0) > 0 && (
            <div className="flex justify-between">
              <span className="text-[#52525B]">Ongkos Kirim</span>
              <span className="font-semibold">{formatRupiah(tx.shippingCost || 0)}</span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t-2 border-[#14110F] text-sm font-extrabold">
            <span>GRAND TOTAL</span>
            <span className="text-[#B91C1C]">{formatRupiah(tx.total)}</span>
          </div>
          <div className="flex justify-between text-[#52525B]">
            <span>{tx.paymentMethod === 'CREDIT' ? 'Uang Muka (DP)' : 'Dibayar'}</span>
            <span>{formatRupiah(tx.amountPaid)}</span>
          </div>
          {tx.paymentMethod === 'CASH' && (
            <div className="flex justify-between text-[#52525B]">
              <span>Kembalian</span>
              <span>{formatRupiah(tx.changeAmount)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-12 pt-8 text-center text-xs">
        <div>
          <p className="font-semibold">Tanda Terima Pelanggan,</p>
          <div className="h-20" />
          <p className="border-t border-[#18181B] inline-block px-10 pt-1 font-semibold">
            {tx.customerName}
          </p>
        </div>
        <div>
          <p className="font-semibold">Hormat Kami ({db.settings.companyName}),</p>
          <div className="h-20" />
          <p className="border-t border-[#18181B] inline-block px-10 pt-1 font-semibold">
            {tx.cashierName}
          </p>
        </div>
      </div>
    </div>
  );
};

/**
 * Official Delivery Note (Surat Jalan) with NO prices or monetary totals.
 */
const SuratJalanA4Document: React.FC<{
  req: Extract<PrintRequest, { transaction: unknown }>;
}> = ({ req }) => {
  const { db } = useErp();
  const { transaction: tx } = req;
  const totalQty = tx.items.reduce((acc, it) => acc + it.qty, 0);

  return (
    <div className="w-[210mm] min-h-[275mm] mx-auto bg-white text-[#18181B] p-10 text-sm">
      <div className="flex items-start justify-between border-b-2 border-[#14110F] pb-5 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-24 h-24 rounded-xl bg-[#14110F] p-2 shrink-0 flex items-center justify-center">
            <img
              src="/Indobacco_transparent.svg"
              alt="Logo Indobacco"
              width={80}
              height={80}
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-[#14110F]">{db.settings.companyName}</h1>
            <p className="text-xs font-semibold text-[#855D00] uppercase mt-0.5">
              Divisi Logistik &amp; Pengiriman Gudang
            </p>
            <p className="text-xs text-[#52525B] mt-1.5 max-w-sm">{db.settings.address}</p>
            <p className="text-xs text-[#52525B]">Telp: {db.settings.phone}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold text-[#14110F]">SURAT JALAN</p>
          <p className="font-mono font-bold text-sm text-[#B91C1C] mt-1">{tx.suratJalanNumber}</p>
          <p className="text-xs text-[#52525B] mt-1">Ref. Invoice: {tx.invoiceNumber}</p>
          <p className="text-xs text-[#52525B]">Tanggal Kirim: {formatDate(tx.createdAt)}</p>
        </div>
      </div>

      <div className="bg-[#F6F6F7] border border-[#E4E4E7] rounded-lg p-4 mb-6 text-xs">
        <p className="font-bold text-[#52525B] mb-1">Tujuan Pengiriman / Penerima:</p>
        <p className="text-sm font-bold text-[#18181B]">{tx.customerName}</p>
        <p className="text-[#52525B] mt-0.5">
          Alamat: {tx.customerAddress || 'Pengambilan langsung di gudang / toko'}
        </p>
        {tx.customerPhone && <p className="text-[#52525B] mt-0.5">Kontak: {tx.customerPhone}</p>}
        {(tx.courierName || tx.trackingNumber) && (
          <p className="text-[#18181B] font-semibold mt-1">
            Ekspedisi: {tx.courierName || '-'}
            {tx.trackingNumber ? ` · Resi: ${tx.trackingNumber}` : ''}
          </p>
        )}
      </div>

      <table className="w-full border-collapse mb-6 text-xs">
        <thead>
          <tr className="bg-[#14110F] text-white">
            <th className="py-2.5 px-3 text-left font-semibold w-12">No</th>
            <th className="py-2.5 px-3 text-left font-semibold w-36">Kode SKU</th>
            <th className="py-2.5 px-3 text-left font-semibold">Nama Barang / Deskripsi</th>
            <th className="py-2.5 px-3 text-right font-semibold w-24">Kuantitas</th>
            <th className="py-2.5 px-3 text-left font-semibold w-24">Satuan</th>
            <th className="py-2.5 px-3 text-center font-semibold w-24">Cek Fisik</th>
          </tr>
        </thead>
        <tbody>
          {tx.items.map((item, idx) => (
            <tr key={item.productId} className="border-b border-[#E4E4E7]">
              <td className="py-3 px-3 tabular-nums">{idx + 1}</td>
              <td className="py-3 px-3 font-mono">{item.sku}</td>
              <td className="py-3 px-3 font-semibold">{item.productName}</td>
              <td className="py-3 px-3 text-right font-bold tabular-nums">{item.qty}</td>
              <td className="py-3 px-3">{item.unit}</td>
              <td className="py-3 px-3 text-center">
                <span className="inline-block w-4 h-4 border border-[#18181B] rounded-xs" />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-[#F6F6F7] font-bold">
            <td colSpan={3} className="py-2.5 px-3 text-right">
              Total Muatan ({tx.items.length} jenis barang):
            </td>
            <td className="py-2.5 px-3 text-right tabular-nums">{formatNumber(totalQty)}</td>
            <td colSpan={2} className="py-2.5 px-3">
              Total Berat / Kemasan
            </td>
          </tr>
        </tfoot>
      </table>

      <div className="p-3 rounded border border-[#E4E4E7] text-xs text-[#52525B] mb-12">
        <p className="font-bold text-[#18181B] mb-1">Instruksi Ekspedisi:</p>
        <p>
          Mohon periksa kelengkapan jumlah kemasan dan kondisi segel barang sebelum menandatangani
          Surat Jalan ini. Dokumen ini khusus untuk keperluan pengiriman logistik tanpa rincian
          tagihan.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6 pt-4 text-center text-xs">
        <div>
          <p className="font-semibold">Kepala Gudang,</p>
          <div className="h-20" />
          <p className="border-t border-[#18181B] pt-1 font-semibold">
            ( _______________________ )
          </p>
        </div>
        <div>
          <p className="font-semibold">Supir / Ekspedisi,</p>
          <div className="h-20" />
          <p className="border-t border-[#18181B] pt-1 font-semibold">
            ( _______________________ )
          </p>
        </div>
        <div>
          <p className="font-semibold">Penerima Barang,</p>
          <div className="h-20" />
          <p className="border-t border-[#18181B] pt-1 font-semibold">{tx.customerName}</p>
        </div>
      </div>
    </div>
  );
};

const KuitansiDocument: React.FC<{
  req: Extract<PrintRequest, { kind: 'kuitansi' }>;
}> = ({ req }) => {
  const { db } = useErp();
  const { plan, payment, customer } = req;

  return (
    <div className="w-[210mm] mx-auto bg-white text-[#18181B] p-10 text-sm border border-[#E4E4E7]">
      <div className="flex items-center justify-between border-b-2 border-[#14110F] pb-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-xl bg-[#14110F] p-2 shrink-0 flex items-center justify-center">
            <img
              src="/Indobacco_transparent.svg"
              alt="Logo Indobacco"
              width={64}
              height={64}
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-[#14110F]">{db.settings.companyName}</h1>
            <p className="text-xs text-[#52525B] mt-0.5">{db.settings.address}</p>
            <p className="text-xs text-[#52525B]">Telp: {db.settings.phone}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-extrabold text-[#B91C1C]">KUITANSI CICILAN</p>
          <p className="font-mono font-bold text-sm mt-1">{payment.receiptNumber}</p>
          <p className="text-xs text-[#52525B]">Tanggal: {formatDateTime(payment.paidAt)}</p>
        </div>
      </div>

      <div className="space-y-4 text-xs sm:text-sm mb-8">
        <div className="grid grid-cols-[180px_1fr] gap-2 py-2 border-b border-[#E4E4E7]">
          <span className="font-semibold text-[#52525B]">Sudah Terima Dari</span>
          <span className="font-bold text-[#18181B]">
            : {plan.customerName}
            {customer?.phone ? ` (${customer.phone})` : ''}
          </span>
        </div>

        <div className="grid grid-cols-[180px_1fr] gap-2 py-2 border-b border-[#E4E4E7]">
          <span className="font-semibold text-[#52525B]">Uang Sejumlah</span>
          <span className="font-mono font-extrabold text-base text-[#B91C1C] tabular-nums">
            : {formatRupiah(payment.amount)}
          </span>
        </div>

        <div className="grid grid-cols-[180px_1fr] gap-2 py-2 items-center">
          <span className="font-semibold text-[#52525B]">Terbilang</span>
          <div className="bg-[#F6F6F7] border border-[#8A8680] rounded px-3 py-2 font-bold italic text-[#14110F]">
            # {terbilangRupiah(payment.amount)} #
          </div>
        </div>

        <div className="grid grid-cols-[180px_1fr] gap-2 py-2 border-b border-[#E4E4E7]">
          <span className="font-semibold text-[#52525B]">Untuk Pembayaran</span>
          <span>
            : Angsuran Piutang {plan.planNumber}
            {plan.invoiceNumber ? ` (Ref. Invoice ${plan.invoiceNumber})` : ''}
            {payment.notes ? `, catatan: ${payment.notes}` : ''}
          </span>
        </div>

        <div className="grid grid-cols-[180px_1fr] gap-2 py-2 border-b border-[#E4E4E7]">
          <span className="font-semibold text-[#52525B]">Metode Pembayaran</span>
          <span className="font-semibold">: {PAYMENT_LABELS[payment.paymentMethod]}</span>
        </div>

        <div className="grid grid-cols-[180px_1fr] gap-2 py-2 border-b border-[#E4E4E7]">
          <span className="font-semibold text-[#52525B]">Sisa Piutang Setelah Bayar</span>
          <span className="font-mono font-bold tabular-nums">
            : {formatRupiah(payment.remainingBalanceAfter)}
          </span>
        </div>
      </div>

      <div className="flex justify-between items-end pt-4 text-xs">
        <div className="border-2 border-[#14110F] rounded px-4 py-2 font-mono font-extrabold text-base tabular-nums">
          JUMLAH: {formatRupiah(payment.amount)}
        </div>

        <div className="text-center w-56">
          <p className="font-semibold">Diterima Oleh,</p>
          <div className="h-16" />
          <p className="border-t border-[#18181B] pt-1 font-bold">{payment.receivedByName}</p>
          <p className="text-[11px] text-[#52525B]">{db.settings.companyName}</p>
        </div>
      </div>
    </div>
  );
};

const LabelsDocument: React.FC<{
  req: Extract<PrintRequest, { kind: 'labels' }>;
}> = ({ req }) => {
  const { db } = useErp();
  const expanded = req.products.flatMap((p) =>
    Array.from({ length: Math.max(1, req.copies) }, (_, i) => ({ product: p, idx: i }))
  );

  return (
    <div className="w-[210mm] mx-auto bg-white text-[#18181B] p-8">
      <div className="grid grid-cols-3 gap-4">
        {expanded.map(({ product, idx }) => (
          <div
            key={`${product.id}-${idx}`}
            className="border border-dashed border-[#18181B] rounded-lg p-3.5 space-y-1.5"
          >
            <div className="flex items-center justify-between text-[10px] text-[#52525B]">
              <span className="font-bold uppercase truncate">{db.settings.companyName}</span>
              <span className="font-mono font-bold text-[#18181B]">{product.sku}</span>
            </div>
            <p className="text-sm font-extrabold leading-tight">{product.name}</p>
            <p className="text-[11px] text-[#52525B]">{product.category}</p>
            <div className="pt-1.5 border-t border-[#E4E4E7] flex items-baseline justify-between">
              <span className="text-base font-extrabold font-mono text-[#B91C1C] tabular-nums">
                {formatRupiah(product.sellPrice)}
              </span>
              <span className="text-[11px] font-semibold text-[#52525B]">/ {product.unit}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const StatementA4Document: React.FC<{
  req: Extract<PrintRequest, { kind: 'statement' }>;
}> = ({ req }) => {
  const { db } = useErp();
  const { customer, plans } = req;
  const enriched = plans.map((pl) => ({ plan: pl, metrics: getPlanMetrics(pl) }));
  const grandRemaining = enriched.reduce((sum, x) => sum + x.metrics.remainingBalance, 0);

  return (
    <div className="w-[210mm] min-h-[275mm] mx-auto bg-white text-[#18181B] p-10 text-sm">
      <div className="flex items-start justify-between border-b-2 border-[#14110F] pb-5 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-xl bg-[#14110F] p-2 shrink-0 flex items-center justify-center">
            <img
              src="/Indobacco_transparent.svg"
              alt="Logo Indobacco"
              width={64}
              height={64}
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-[#14110F]">{db.settings.companyName}</h1>
            <p className="text-xs text-[#52525B] mt-0.5 max-w-sm">{db.settings.address}</p>
            <p className="text-xs text-[#52525B]">Telp: {db.settings.phone}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-extrabold text-[#B91C1C]">REKAP TAGIHAN</p>
          <p className="text-xs text-[#52525B] mt-1">Statement of Account (B2B)</p>
          <p className="text-xs text-[#52525B]">Tanggal Cetak: {formatDate(new Date().toISOString())}</p>
        </div>
      </div>

      <div className="bg-[#F6F6F7] border border-[#E4E4E7] rounded-lg p-4 mb-6 text-xs flex justify-between gap-4">
        <div>
          <p className="font-bold text-[#52525B] mb-1">Kepada Mitra / Pemasok:</p>
          <p className="text-sm font-bold text-[#18181B]">
            {customer.name} ({customer.code})
          </p>
          <p className="text-[#52525B] mt-0.5">Kontak: {customer.phone}</p>
          {customer.address && <p className="text-[#52525B]">{customer.address}</p>}
        </div>
        <div className="text-right">
          <p className="text-[#52525B]">Total Sisa Kewajiban Aktif</p>
          <p className="text-xl font-extrabold font-mono text-[#B91C1C] tabular-nums mt-1">
            {formatRupiah(grandRemaining)}
          </p>
          <p className="text-[11px] text-[#52525B] mt-0.5">{plans.length} nota aktif</p>
        </div>
      </div>

      <table className="w-full border-collapse mb-6 text-xs">
        <thead>
          <tr className="bg-[#14110F] text-white">
            <th className="py-2.5 px-3 text-left font-semibold">No. Kredit / Invoice</th>
            <th className="py-2.5 px-3 text-left font-semibold">Tanggal</th>
            <th className="py-2.5 px-3 text-left font-semibold">Jatuh Tempo</th>
            <th className="py-2.5 px-3 text-right font-semibold">Total Tagihan</th>
            <th className="py-2.5 px-3 text-right font-semibold">Terbayar</th>
            <th className="py-2.5 px-3 text-right font-semibold">Sisa Kewajiban</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {enriched.map(({ plan, metrics }) => (
            <tr key={plan.id} className="border-b border-[#E4E4E7]">
              <td className="py-2.5 px-3 font-mono font-semibold">
                {plan.planNumber}
                {plan.invoiceNumber ? ` · ${plan.invoiceNumber}` : ''}
              </td>
              <td className="py-2.5 px-3">{formatDate(plan.createdAt)}</td>
              <td className="py-2.5 px-3">
                {metrics.nextDueDate ? formatDate(metrics.nextDueDate) : '-'}
              </td>
              <td className="py-2.5 px-3 text-right">{formatRupiah(plan.totalPayable)}</td>
              <td className="py-2.5 px-3 text-right text-[#065F46]">
                {formatRupiah(metrics.totalPaid)}
              </td>
              <td className="py-2.5 px-3 text-right font-bold">
                {formatRupiah(metrics.remainingBalance)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="bg-[#F6F6F7] border border-[#8A8680] rounded p-3 text-xs font-bold italic mb-6">
        Terbilang: # {terbilangRupiah(grandRemaining)} #
      </div>

      {db.settings.bankName && db.settings.bankAccountNumber && (
        <div className="p-4 rounded-lg border border-[#E4E4E7] text-xs space-y-1">
          <p className="font-bold text-[#14110F]">Informasi Transfer Pembayaran:</p>
          <p>
            Bank <strong>{db.settings.bankName}</strong> · No. Rekening{' '}
            <strong className="font-mono">{db.settings.bankAccountNumber}</strong> a.n.{' '}
            <strong>{db.settings.bankAccountHolder || db.settings.companyName}</strong>
          </p>
          <p className="text-[#52525B]">
            Mohon cantumkan nama mitra atau nomor nota pada berita transfer agar alokasi pembayaran
            bertahap tercatat otomatis.
          </p>
        </div>
      )}
    </div>
  );
};

export const PrintModal: React.FC = () => {
  const { printRequest, closePrint } = useErp();
  const [thermalWidth, setThermalWidth] = useState<58 | 80>(
    printRequest?.kind === 'thermal58' ? 58 : 80
  );
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (printRequest?.kind === 'thermal58') setThermalWidth(58);
    if (printRequest?.kind === 'thermal80') setThermalWidth(80);
    setMinimized(false);
    setExpanded(false);
  }, [printRequest]);

  useEffect(() => {
    if (!printRequest) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closePrint();
      }
    };
    window.addEventListener('keydown', handleKey, { capture: true });
    return () => window.removeEventListener('keydown', handleKey, { capture: true });
  }, [printRequest, closePrint]);

  if (!printRequest) return null;

  const activeKind =
    printRequest.kind === 'thermal58' || printRequest.kind === 'thermal80'
      ? thermalWidth === 58
        ? 'thermal58'
        : 'thermal80'
      : printRequest.kind;

  const pageCss =
    activeKind === 'thermal58'
      ? '@page { size: 58mm auto; margin: 2mm; }'
      : activeKind === 'thermal80'
      ? '@page { size: 80mm auto; margin: 2mm; }'
      : '@page { size: A4 portrait; margin: 10mm; }';

  const titleMap: Record<PrintRequest['kind'], string> = {
    thermal58: 'Struk Thermal (58mm / 80mm)',
    thermal80: 'Struk Thermal (58mm / 80mm)',
    invoiceA4: 'Pratinjau Invoice Resmi (A4)',
    suratJalan: 'Pratinjau Surat Jalan Logistik (A4)',
    kuitansi: 'Pratinjau Kuitansi Cicilan Piutang',
    labels: 'Pratinjau Label Harga & Kemasan (A4)',
    statement: 'Pratinjau Rekap Tagihan Mitra (A4)',
  };

  const renderDoc = () => {
    if (printRequest.kind === 'statement') {
      return <StatementA4Document req={printRequest} />;
    }
    if (printRequest.kind === 'labels') {
      return <LabelsDocument req={printRequest} />;
    }
    if (printRequest.kind === 'kuitansi') {
      return <KuitansiDocument req={printRequest} />;
    }
    if (printRequest.kind === 'invoiceA4') {
      return <InvoiceA4Document req={printRequest} />;
    }
    if (printRequest.kind === 'suratJalan') {
      return <SuratJalanA4Document req={printRequest} />;
    }
    return <ThermalDocument widthMm={thermalWidth} req={printRequest} />;
  };

  const printPortalTarget = document.getElementById('print-root');

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titleMap[printRequest.kind]}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6"
        onClick={(e) => {
          if (e.target === e.currentTarget) closePrint();
        }}
      >
        <div
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-hairline)',
            color: 'var(--text-primary)',
          }}
          className={`flex flex-col border rounded-2xl shadow-2xl overflow-hidden transition-all ${
            expanded ? 'w-full h-full max-w-none' : 'w-full max-w-4xl max-h-[92vh]'
          }`}
        >
          {/* macOS 3-dot Titlebar */}
          <div
            style={{
              backgroundColor: 'var(--bg-subtle)',
              borderColor: 'var(--border-hairline)',
            }}
            className="px-4 py-2.5 border-b flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-center gap-4 min-w-0">
              <MacWindowDots
                onClose={closePrint}
                onMinimize={() => setMinimized((m) => !m)}
                onToggleExpand={() => {
                  setMinimized(false);
                  setExpanded((ex) => !ex);
                }}
                isMinimized={minimized}
                isExpanded={expanded}
              />
              <div className="min-w-0">
                <h3 className="text-[13px] font-semibold tracking-tight truncate">
                  {titleMap[printRequest.kind]}
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {(printRequest.kind === 'thermal58' || printRequest.kind === 'thermal80') && (
                <div
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-hairline)',
                  }}
                  className="inline-flex rounded-lg p-0.5 border"
                >
                  <button
                    type="button"
                    onClick={() => setThermalWidth(58)}
                    aria-pressed={thermalWidth === 58}
                    className={`min-h-[36px] px-2.5 py-1 text-xs font-semibold rounded-md ${
                      thermalWidth === 58
                        ? 'hig-btn-cta'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    58mm
                  </button>
                  <button
                    type="button"
                    onClick={() => setThermalWidth(80)}
                    aria-pressed={thermalWidth === 80}
                    className={`min-h-[36px] px-2.5 py-1 text-xs font-semibold rounded-md ${
                      thermalWidth === 80
                        ? 'hig-btn-cta'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    80mm
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => window.print()}
                className="min-h-[38px] inline-flex items-center gap-2 px-4 py-1.5 rounded-lg hig-btn-cta text-xs font-semibold"
              >
                <Printer className="w-4 h-4" aria-hidden="true" />
                <span>Cetak / PDF</span>
              </button>
            </div>
          </div>

          {minimized ? (
            <div className="px-5 py-3 flex items-center justify-between text-xs">
              <span style={{ color: 'var(--text-secondary)' }}>
                Pratinjau cetak diperkecil. Klik Kembalikan untuk melihat dokumen.
              </span>
              <button
                type="button"
                onClick={() => setMinimized(false)}
                className="min-h-[36px] px-3 py-1 rounded-lg hig-btn-secondary font-semibold"
              >
                Kembalikan
              </button>
            </div>
          ) : (
            <div
              style={{ backgroundColor: 'var(--bg-subtle)' }}
              className="flex-1 overflow-auto p-4 sm:p-8 flex justify-center items-start"
            >
              <div className="shadow-lg border border-[#E4E4E7]">{renderDoc()}</div>
            </div>
          )}
        </div>
      </div>

      {printPortalTarget &&
        createPortal(
          <>
            <style>{pageCss}</style>
            {renderDoc()}
          </>,
          printPortalTarget
        )}
    </>
  );
};

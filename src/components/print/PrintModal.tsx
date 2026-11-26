import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import {
  formatDate,
  formatDateTime,
  formatRupiah,
  terbilangRupiah,
} from '../../lib/format';
import { PrintRequest } from '../../types/erp';

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
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatRupiah(tx.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>PPN ({tx.taxRate}%)</span>
          <span>{formatRupiah(tx.taxAmount)}</span>
        </div>
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
                  <span>Tenor</span>
                  <span>
                    {paymentPlan.tenorCount}x{' '}
                    {paymentPlan.frequency === 'WEEKLY' ? 'Mingguan' : 'Bulanan'}
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
    <div className="w-[210mm] min-h-[275mm] mx-auto bg-white text-[#1A1614] p-10 text-sm">
      {/* Header Kop */}
      <div className="flex items-start justify-between border-b-2 border-[#14110F] pb-5 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-24 h-24 rounded-xl bg-[#14110F] p-2 shrink-0 flex items-center justify-center">
            <img
              src="/Indobacco_transparent.svg"
              alt="Logo Indobacco"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-[#14110F]">
              {db.settings.companyName}
            </h1>
            <p className="text-xs font-semibold text-[#B8860B] uppercase tracking-wider mt-0.5">
              {db.settings.tagline}
            </p>
            <p className="text-xs text-[#5C5349] mt-1.5 max-w-sm">{db.settings.address}</p>
            <p className="text-xs text-[#5C5349]">
              Telp: {db.settings.phone} • Email: {db.settings.email}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold tracking-wider text-[#B91C1C]">INVOICE</p>
          <p className="font-mono font-bold text-sm mt-1">{tx.invoiceNumber}</p>
          <p className="text-xs text-[#6B6257] mt-1">Tanggal: {formatDateTime(tx.createdAt)}</p>
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

      {/* Customer & Transaction Meta */}
      <div className="grid grid-cols-2 gap-6 mb-6 bg-[#F8F6F2] border border-[#E6E0D6] rounded-lg p-4 text-xs">
        <div>
          <p className="font-bold uppercase tracking-wider text-[#6B6257] mb-1">Kepada Yth:</p>
          <p className="text-sm font-bold text-[#1A1614]">{tx.customerName}</p>
          {tx.customerPhone && <p className="text-[#5C5349] mt-0.5">Telp/WA: {tx.customerPhone}</p>}
          {tx.customerAddress && <p className="text-[#5C5349] mt-0.5">{tx.customerAddress}</p>}
        </div>
        <div className="text-right space-y-1">
          <p>
            <span className="text-[#6B6257]">No. Surat Jalan:</span>{' '}
            <span className="font-mono font-semibold">{tx.suratJalanNumber}</span>
          </p>
          <p>
            <span className="text-[#6B6257]">Metode Pembayaran:</span>{' '}
            <span className="font-semibold">{PAYMENT_LABELS[tx.paymentMethod]}</span>
          </p>
          <p>
            <span className="text-[#6B6257]">Kasir / Admin:</span>{' '}
            <span className="font-semibold">{tx.cashierName}</span>
          </p>
        </div>
      </div>

      {/* Items Table */}
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
            <tr key={item.productId} className="border-b border-[#E6E0D6]">
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

      {/* Totals */}
      <div className="flex justify-between items-start gap-6 mb-10">
        <div className="w-1/2 text-xs text-[#5C5349] space-y-1.5">
          <p className="font-bold text-[#1A1614]">Catatan &amp; Ketentuan:</p>
          <p>1. Barang yang sudah diterima dan diperiksa tidak dapat dikembalikan kecuali cacat produksi.</p>
          <p>2. Dokumen ini dicetak otomatis oleh sistem {db.settings.companyName}.</p>
          {paymentPlan && (
            <div className="mt-2 p-2.5 rounded border border-amber-300 bg-amber-50 text-[#1A1614]">
              <p className="font-bold">Rencana Kredit: {paymentPlan.planNumber}</p>
              <p>
                DP: {formatRupiah(paymentPlan.downPayment)} • Tenor: {paymentPlan.tenorCount}x{' '}
                {paymentPlan.frequency === 'WEEKLY' ? 'Mingguan' : 'Bulanan'} • Bunga{' '}
                {paymentPlan.interestRate}%
              </p>
            </div>
          )}
        </div>

        <div className="w-64 space-y-2 text-xs tabular-nums">
          <div className="flex justify-between">
            <span className="text-[#6B6257]">Subtotal</span>
            <span className="font-semibold">{formatRupiah(tx.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6B6257]">PPN ({tx.taxRate}%)</span>
            <span className="font-semibold">{formatRupiah(tx.taxAmount)}</span>
          </div>
          <div className="flex justify-between pt-2 border-t-2 border-[#14110F] text-sm font-extrabold">
            <span>GRAND TOTAL</span>
            <span className="text-[#B91C1C]">{formatRupiah(tx.total)}</span>
          </div>
          <div className="flex justify-between text-[#6B6257]">
            <span>{tx.paymentMethod === 'CREDIT' ? 'Uang Muka (DP)' : 'Dibayar'}</span>
            <span>{formatRupiah(tx.amountPaid)}</span>
          </div>
          {tx.paymentMethod === 'CASH' && (
            <div className="flex justify-between text-[#6B6257]">
              <span>Kembalian</span>
              <span>{formatRupiah(tx.changeAmount)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-2 gap-12 pt-8 text-center text-xs">
        <div>
          <p className="font-semibold">Tanda Terima Pelanggan,</p>
          <div className="h-20" />
          <p className="border-t border-[#1A1614] inline-block px-10 pt-1 font-semibold">
            {tx.customerName}
          </p>
        </div>
        <div>
          <p className="font-semibold">Hormat Kami ({db.settings.companyName}),</p>
          <div className="h-20" />
          <p className="border-t border-[#1A1614] inline-block px-10 pt-1 font-semibold">
            {tx.cashierName}
          </p>
        </div>
      </div>
    </div>
  );
};

/**
 * Official Delivery Note (Surat Jalan) — STRICTLY NO PRICES OR MONETARY TOTALS.
 */
const SuratJalanA4Document: React.FC<{
  req: Extract<PrintRequest, { transaction: unknown }>;
}> = ({ req }) => {
  const { db } = useErp();
  const { transaction: tx } = req;
  const totalQty = tx.items.reduce((acc, it) => acc + it.qty, 0);

  return (
    <div className="w-[210mm] min-h-[275mm] mx-auto bg-white text-[#1A1614] p-10 text-sm">
      <div className="flex items-start justify-between border-b-2 border-[#14110F] pb-5 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-24 h-24 rounded-xl bg-[#14110F] p-2 shrink-0 flex items-center justify-center">
            <img
              src="/Indobacco_transparent.svg"
              alt="Logo Indobacco"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-[#14110F]">
              {db.settings.companyName}
            </h1>
            <p className="text-xs font-semibold text-[#B8860B] uppercase tracking-wider mt-0.5">
              DIVISI LOGISTIK &amp; PENGIRIMAN GUDANG
            </p>
            <p className="text-xs text-[#5C5349] mt-1.5 max-w-sm">{db.settings.address}</p>
            <p className="text-xs text-[#5C5349]">Telp: {db.settings.phone}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold tracking-wider text-[#14110F]">SURAT JALAN</p>
          <p className="font-mono font-bold text-sm text-[#B91C1C] mt-1">
            {tx.suratJalanNumber}
          </p>
          <p className="text-xs text-[#6B6257] mt-1">Ref. Invoice: {tx.invoiceNumber}</p>
          <p className="text-xs text-[#6B6257]">Tanggal Kirim: {formatDate(tx.createdAt)}</p>
        </div>
      </div>

      <div className="bg-[#F8F6F2] border border-[#E6E0D6] rounded-lg p-4 mb-6 text-xs">
        <p className="font-bold uppercase tracking-wider text-[#6B6257] mb-1">
          Tujuan Pengiriman / Penerima:
        </p>
        <p className="text-sm font-bold text-[#1A1614]">{tx.customerName}</p>
        <p className="text-[#5C5349] mt-0.5">
          Alamat: {tx.customerAddress || 'Pengambilan langsung di gudang / toko'}
        </p>
        {tx.customerPhone && <p className="text-[#5C5349] mt-0.5">Kontak: {tx.customerPhone}</p>}
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
            <tr key={item.productId} className="border-b border-[#E6E0D6]">
              <td className="py-3 px-3 tabular-nums">{idx + 1}</td>
              <td className="py-3 px-3 font-mono">{item.sku}</td>
              <td className="py-3 px-3 font-semibold">{item.productName}</td>
              <td className="py-3 px-3 text-right font-bold tabular-nums">{item.qty}</td>
              <td className="py-3 px-3">{item.unit}</td>
              <td className="py-3 px-3 text-center">
                <span className="inline-block w-4 h-4 border border-[#1A1614] rounded-xs" />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-[#F8F6F2] font-bold">
            <td colSpan={3} className="py-2.5 px-3 text-right">
              Total Muatan ({tx.items.length} jenis barang):
            </td>
            <td className="py-2.5 px-3 text-right tabular-nums">{totalQty}</td>
            <td colSpan={2} className="py-2.5 px-3">
              Item / Kemasan
            </td>
          </tr>
        </tfoot>
      </table>

      <div className="p-3 rounded border border-[#E6E0D6] text-xs text-[#5C5349] mb-12">
        <p className="font-bold text-[#1A1614] mb-1">Instruksi Ekspedisi:</p>
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
          <p className="border-t border-[#1A1614] pt-1 font-semibold">
            ( _______________________ )
          </p>
        </div>
        <div>
          <p className="font-semibold">Supir / Ekspedisi,</p>
          <div className="h-20" />
          <p className="border-t border-[#1A1614] pt-1 font-semibold">
            ( _______________________ )
          </p>
        </div>
        <div>
          <p className="font-semibold">Penerima Barang,</p>
          <div className="h-20" />
          <p className="border-t border-[#1A1614] pt-1 font-semibold">{tx.customerName}</p>
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
    <div className="w-[210mm] mx-auto bg-white text-[#1A1614] p-10 text-sm border border-[#E6E0D6]">
      <div className="flex items-center justify-between border-b-2 border-[#14110F] pb-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-xl bg-[#14110F] p-2 shrink-0 flex items-center justify-center">
            <img
              src="/Indobacco_transparent.svg"
              alt="Logo Indobacco"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-[#14110F]">
              {db.settings.companyName}
            </h1>
            <p className="text-xs text-[#5C5349] mt-0.5">{db.settings.address}</p>
            <p className="text-xs text-[#5C5349]">Telp: {db.settings.phone}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-extrabold tracking-wider text-[#B91C1C]">
            KUITANSI CICILAN
          </p>
          <p className="font-mono font-bold text-sm mt-1">{payment.receiptNumber}</p>
          <p className="text-xs text-[#6B6257]">Tanggal: {formatDateTime(payment.paidAt)}</p>
        </div>
      </div>

      <div className="space-y-4 text-xs sm:text-sm mb-8">
        <div className="grid grid-cols-[180px_1fr] gap-2 py-2 border-b border-[#E6E0D6]">
          <span className="font-semibold text-[#6B6257]">Sudah Terima Dari</span>
          <span className="font-bold text-[#1A1614]">
            : {plan.customerName}
            {customer?.phone ? ` (${customer.phone})` : ''}
          </span>
        </div>

        <div className="grid grid-cols-[180px_1fr] gap-2 py-2 border-b border-[#E6E0D6]">
          <span className="font-semibold text-[#6B6257]">Uang Sejumlah</span>
          <span className="font-mono font-extrabold text-base text-[#B91C1C] tabular-nums">
            : {formatRupiah(payment.amount)}
          </span>
        </div>

        <div className="grid grid-cols-[180px_1fr] gap-2 py-2 items-center">
          <span className="font-semibold text-[#6B6257]">Terbilang</span>
          <div className="bg-[#F8F6F2] border border-[#D8D0C5] rounded px-3 py-2 font-bold italic text-[#14110F]">
            # {terbilangRupiah(payment.amount)} #
          </div>
        </div>

        <div className="grid grid-cols-[180px_1fr] gap-2 py-2 border-b border-[#E6E0D6]">
          <span className="font-semibold text-[#6B6257]">Untuk Pembayaran</span>
          <span>
            : Angsuran Piutang {plan.planNumber}
            {plan.invoiceNumber ? ` (Ref. Invoice ${plan.invoiceNumber})` : ''}
            {payment.notes ? ` — ${payment.notes}` : ''}
          </span>
        </div>

        <div className="grid grid-cols-[180px_1fr] gap-2 py-2 border-b border-[#E6E0D6]">
          <span className="font-semibold text-[#6B6257]">Metode Pembayaran</span>
          <span className="font-semibold">: {PAYMENT_LABELS[payment.paymentMethod]}</span>
        </div>

        <div className="grid grid-cols-[180px_1fr] gap-2 py-2 border-b border-[#E6E0D6]">
          <span className="font-semibold text-[#6B6257]">Sisa Piutang Setelah Bayar</span>
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
          <p className="border-t border-[#1A1614] pt-1 font-bold">{payment.receivedByName}</p>
          <p className="text-[11px] text-[#6B6257]">{db.settings.companyName}</p>
        </div>
      </div>
    </div>
  );
};

export const PrintModal: React.FC = () => {
  const { printRequest, closePrint } = useErp();
  const [thermalWidth, setThermalWidth] = useState<58 | 80>(
    printRequest?.kind === 'thermal58' ? 58 : 80
  );

  useEffect(() => {
    if (printRequest?.kind === 'thermal58') setThermalWidth(58);
    if (printRequest?.kind === 'thermal80') setThermalWidth(80);
  }, [printRequest]);

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
    thermal58: 'Cetak Struk Thermal (58mm / 80mm)',
    thermal80: 'Cetak Struk Thermal (58mm / 80mm)',
    invoiceA4: 'Pratinjau Invoice Resmi (A4)',
    suratJalan: 'Pratinjau Surat Jalan Logistik (A4)',
    kuitansi: 'Pratinjau Kuitansi Cicilan Piutang',
  };

  const renderDoc = () => {
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
      {/* Interactive Modal Preview */}
      <div className="fixed inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-xs">
        <div className="bg-[#14110F] text-white px-5 py-3.5 border-b border-[#2A231E] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold">{titleMap[printRequest.kind]}</h3>
            <p className="text-xs text-[#9F9386]">
              Pratinjau dokumen siap cetak. Klik tombol Cetak untuk mencetak atau simpan PDF.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(printRequest.kind === 'thermal58' || printRequest.kind === 'thermal80') && (
              <div className="inline-flex rounded-lg bg-[#241E1A] p-0.5 border border-[#3A3029] mr-2">
                <button
                  type="button"
                  onClick={() => setThermalWidth(58)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                    thermalWidth === 58 ? 'bg-[#B91C1C] text-white' : 'text-[#C8BFB4]'
                  }`}
                >
                  58mm
                </button>
                <button
                  type="button"
                  onClick={() => setThermalWidth(80)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                    thermalWidth === 80 ? 'bg-[#B91C1C] text-white' : 'text-[#C8BFB4]'
                  }`}
                >
                  80mm
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-bold cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Cetak / Simpan PDF
            </button>
            <button
              type="button"
              onClick={closePrint}
              className="p-2 rounded-lg text-[#B8AEA2] hover:text-white hover:bg-[#2A231E] cursor-pointer"
              aria-label="Tutup pratinjau cetak"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 sm:p-8 flex justify-center items-start bg-[#2E2925]">
          <div className="shadow-2xl">{renderDoc()}</div>
        </div>
      </div>

      {/* Dedicated Print Portal */}
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

import React, { useState } from 'react';
import { Save, Download, Upload, RotateCcw, Building2, Percent, Database } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { padSeq } from '../lib/format';
import { DatabaseState } from '../types/erp';
import { Modal } from '../components/ui/SharedUi';

export const SettingsPage: React.FC = () => {
  const {
    db,
    can,
    updateSettings,
    exportBackupJson,
    restoreBackupJson,
    resetDemoData,
    showToast,
  } = useErp();

  const [companyName, setCompanyName] = useState(db.settings.companyName);
  const [tagline, setTagline] = useState(db.settings.tagline);
  const [address, setAddress] = useState(db.settings.address);
  const [phone, setPhone] = useState(db.settings.phone);
  const [email, setEmail] = useState(db.settings.email);
  const [taxRate, setTaxRate] = useState(db.settings.taxRate);
  const [invoicePrefix, setInvoicePrefix] = useState(db.settings.invoicePrefix);
  const [dailyTarget, setDailyTarget] = useState(db.settings.dailyTarget);
  const [receiptFooter, setReceiptFooter] = useState(db.settings.receiptFooter);

  const [pendingRestore, setPendingRestore] = useState<DatabaseState | null>(null);

  const ym = new Date().toISOString().slice(0, 7).replace('-', '');
  const nextInvoicePreview = `${(invoicePrefix || 'IDB').toUpperCase()}-${ym}-${padSeq(
    db.settings.nextInvoiceSeq
  )}`;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      updateSettings({
        companyName,
        tagline,
        address,
        phone,
        email,
        taxRate,
        invoicePrefix,
        dailyTarget,
        receiptFooter,
      });
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.');
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as DatabaseState;
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.products)) {
        throw new Error('File JSON bukan backup Indobacco ERP yang valid.');
      }
      setPendingRestore(parsed);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal membaca file JSON.');
    }
    e.target.value = '';
  };

  const confirmRestore = () => {
    if (!pendingRestore) return;
    try {
      restoreBackupJson(pendingRestore);
      setPendingRestore(null);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Restore gagal.');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-lg font-extrabold text-[#1A1614]">
          Pengaturan Perusahaan, Pajak &amp; Basis Data
        </h2>
        <p className="text-xs text-[#6B6257]">
          Identitas resmi pada Struk/Invoice/Surat Jalan, konfigurasi PPN, serta Backup &amp; Restore
          basis data JSON.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Profil Perusahaan */}
        <div className="bg-white border border-[#E6E0D6] rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-extrabold text-[#1A1614]">
            <Building2 className="w-4 h-4 text-[#B91C1C]" />
            Profil Perusahaan (Kop Dokumen Cetak)
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <label className="block text-xs font-bold text-[#5C5349] mb-1">
                Nama Perusahaan *
              </label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5C5349] mb-1">Tagline</label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5C5349] mb-1">Nomor Telepon</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5C5349] mb-1">Email Resmi</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5]"
              />
            </div>
          </div>

          <div className="text-sm">
            <label className="block text-xs font-bold text-[#5C5349] mb-1">
              Alamat Operasional
            </label>
            <textarea
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5]"
            />
          </div>

          <div className="text-sm">
            <label className="block text-xs font-bold text-[#5C5349] mb-1">
              Catatan Kaki Struk Thermal
            </label>
            <input
              type="text"
              value={receiptFooter}
              onChange={(e) => setReceiptFooter(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5]"
            />
          </div>
        </div>

        {/* Pajak & Penomoran */}
        <div className="bg-white border border-[#E6E0D6] rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-extrabold text-[#1A1614]">
            <Percent className="w-4 h-4 text-[#B8860B]" />
            Pajak PPN, Penomoran &amp; Target Omset
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <label className="block text-xs font-bold text-[#5C5349] mb-1">Tarif PPN (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={taxRate}
                onChange={(e) => setTaxRate(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5] font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5C5349] mb-1">Prefix Invoice</label>
              <input
                type="text"
                required
                value={invoicePrefix}
                onChange={(e) => setInvoicePrefix(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5] font-mono uppercase"
              />
              <p className="text-[11px] text-[#6B6257] mt-1">
                Berikutnya: <span className="font-mono font-bold">{nextInvoicePreview}</span>
              </p>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5C5349] mb-1">
                Target Omset Harian (Rp)
              </label>
              <input
                type="number"
                min={0}
                value={dailyTarget}
                onChange={(e) => setDailyTarget(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5] font-mono tabular-nums"
              />
            </div>
          </div>

          {can('settings:write') && (
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-bold cursor-pointer"
              >
                <Save className="w-4 h-4" />
                Simpan Pengaturan
              </button>
            </div>
          )}
        </div>
      </form>

      {/* Backup & Restore */}
      {can('backup:manage') && (
        <div className="bg-white border border-[#E6E0D6] rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-extrabold text-[#1A1614]">
            <Database className="w-4 h-4 text-[#14110F]" />
            Manajemen Basis Data (Backup &amp; Restore JSON)
          </div>
          <p className="text-xs text-[#6B6257]">
            Ekspor seluruh data (produk, pelanggan, transaksi, mutasi stok, piutang, user, dan audit
            log) ke file JSON atau pulihkan kapan pun dibutuhkan.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={exportBackupJson}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#14110F] hover:bg-[#2A231E] text-white text-xs font-bold cursor-pointer"
            >
              <Download className="w-4 h-4 text-amber-400" />
              Ekspor Backup JSON
            </button>

            <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[#D8D0C5] bg-[#F8F6F2] hover:bg-[#EFEAE0] text-xs font-bold cursor-pointer">
              <Upload className="w-4 h-4 text-[#B91C1C]" />
              Impor / Restore JSON
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleRestoreFile}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    'Kembalikan seluruh basis data ke data demo awal Indobacco? Data baru yang belum di-backup akan hilang.'
                  )
                ) {
                  resetDemoData();
                }
              }}
              className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Data Demo
            </button>
          </div>
        </div>
      )}

      {/* Restore Confirmation Modal */}
      <Modal
        open={Boolean(pendingRestore)}
        onClose={() => setPendingRestore(null)}
        title="Konfirmasi Restore Basis Data JSON"
        subtitle="Pastikan Anda sudah mengunduh backup data saat ini sebelum menimpa"
      >
        {pendingRestore && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-lg bg-[#F8F6F2] border border-[#E6E0D6] space-y-1">
              <p className="font-bold text-[#1A1614]">Ringkasan Isi File Backup:</p>
              <p>• Produk: {pendingRestore.products.length} SKU</p>
              <p>• Pelanggan: {pendingRestore.customers.length} mitra</p>
              <p>• Transaksi: {pendingRestore.transactions.length} invoice</p>
              <p>• Rencana Cicilan Piutang: {pendingRestore.paymentPlans.length} data</p>
              <p>• Pengguna Sistem: {pendingRestore.users.length} akun</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingRestore(null)}
                className="px-4 py-2 rounded-lg border border-[#D8D0C5] font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmRestore}
                className="px-4 py-2 rounded-lg bg-[#B91C1C] text-white font-bold cursor-pointer"
              >
                Ya, Restore Sekarang
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

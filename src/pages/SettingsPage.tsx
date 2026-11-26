import React, { useEffect, useState } from 'react';
import { Save, Download, Upload, RotateCcw, Building2, Percent, Database } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { formatDateTime, padSeq, toLocalDateISO } from '../lib/format';
import { DatabaseState } from '../types/erp';
import { Modal } from '../components/ui/SharedUi';

export const SettingsPage: React.FC = () => {
  const {
    db,
    can,
    updateSettings,
    exportBackupJson,
    restoreBackupJson,
    resetOperationalData,
    clearAllData,
    showToast,
  } = useErp();

  const [companyName, setCompanyName] = useState(db.settings.companyName);
  const [tagline, setTagline] = useState(db.settings.tagline);
  const [address, setAddress] = useState(db.settings.address);
  const [phone, setPhone] = useState(db.settings.phone);
  const [email, setEmail] = useState(db.settings.email);
  const [bankName, setBankName] = useState(db.settings.bankName || '');
  const [bankAccountNumber, setBankAccountNumber] = useState(db.settings.bankAccountNumber || '');
  const [bankAccountHolder, setBankAccountHolder] = useState(db.settings.bankAccountHolder || '');
  const [taxRate, setTaxRate] = useState(db.settings.taxRate);
  const [invoicePrefix, setInvoicePrefix] = useState(db.settings.invoicePrefix);
  const [dailyTarget, setDailyTarget] = useState(db.settings.dailyTarget);
  const [receiptFooter, setReceiptFooter] = useState(db.settings.receiptFooter);

  const [pendingRestore, setPendingRestore] = useState<DatabaseState | null>(null);

  useEffect(() => {
    setCompanyName(db.settings.companyName);
    setTagline(db.settings.tagline);
    setAddress(db.settings.address);
    setPhone(db.settings.phone);
    setEmail(db.settings.email);
    setBankName(db.settings.bankName || '');
    setBankAccountNumber(db.settings.bankAccountNumber || '');
    setBankAccountHolder(db.settings.bankAccountHolder || '');
    setTaxRate(db.settings.taxRate);
    setInvoicePrefix(db.settings.invoicePrefix);
    setDailyTarget(db.settings.dailyTarget);
    setReceiptFooter(db.settings.receiptFooter);
  }, [db.settings]);

  const ym = toLocalDateISO().slice(0, 7).replace('-', '');
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
        bankName: bankName.trim() || undefined,
        bankAccountNumber: bankAccountNumber.trim() || undefined,
        bankAccountHolder: bankAccountHolder.trim() || undefined,
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
        <h2 className="text-lg font-bold tracking-tight">
          Pengaturan Perusahaan, Pajak &amp; Basis Data
        </h2>
        <p style={{ color: 'var(--text-secondary)' }} className="text-xs mt-0.5">
          Identitas resmi pada dokumen cetak, tarif PPN, serta Backup dan Restore basis data JSON
          lokal.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        <div className="hig-card p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Building2
              style={{ color: 'var(--accent-primary-text)' }}
              className="w-4 h-4"
              aria-hidden="true"
            />
            <span>Profil Perusahaan (Kop Dokumen Cetak)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <label htmlFor="st-comp" className="block text-xs font-semibold mb-1">
                Nama Perusahaan *
              </label>
              <input
                id="st-comp"
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 hig-input"
              />
            </div>
            <div>
              <label htmlFor="st-tag" className="block text-xs font-semibold mb-1">
                Tagline
              </label>
              <input
                id="st-tag"
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 hig-input"
              />
            </div>
            <div>
              <label htmlFor="st-phone" className="block text-xs font-semibold mb-1">
                Nomor Telepon
              </label>
              <input
                id="st-phone"
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 hig-input"
              />
            </div>
            <div>
              <label htmlFor="st-email" className="block text-xs font-semibold mb-1">
                Email Resmi
              </label>
              <input
                id="st-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 hig-input"
              />
            </div>
          </div>

          <div className="text-sm">
            <label htmlFor="st-addr" className="block text-xs font-semibold mb-1">
              Alamat Operasional
            </label>
            <textarea
              id="st-addr"
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 hig-input"
            />
          </div>

          <div className="text-sm">
            <label htmlFor="st-footer" className="block text-xs font-semibold mb-1">
              Catatan Kaki Struk Thermal
            </label>
            <input
              id="st-footer"
              type="text"
              value={receiptFooter}
              onChange={(e) => setReceiptFooter(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 hig-input"
            />
          </div>

          <div
            style={{ borderColor: 'var(--border-hairline)' }}
            className="pt-3 border-t grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm"
          >
            <div>
              <label htmlFor="st-bank" className="block text-xs font-semibold mb-1">
                Bank Perusahaan (Cetak Invoice)
              </label>
              <input
                id="st-bank"
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="BCA / Mandiri / BRI"
                className="w-full min-h-[42px] px-3 py-2 hig-input"
              />
            </div>
            <div>
              <label htmlFor="st-rek" className="block text-xs font-semibold mb-1">
                No. Rekening
              </label>
              <input
                id="st-rek"
                type="text"
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
                placeholder="1234-5678-90"
                className="w-full min-h-[42px] px-3 py-2 hig-input font-mono"
              />
            </div>
            <div>
              <label htmlFor="st-an" className="block text-xs font-semibold mb-1">
                Atas Nama Rekening
              </label>
              <input
                id="st-an"
                type="text"
                value={bankAccountHolder}
                onChange={(e) => setBankAccountHolder(e.target.value)}
                placeholder="PT Indobacco Tingwe Nusantara"
                className="w-full min-h-[42px] px-3 py-2 hig-input"
              />
            </div>
          </div>
        </div>

        <div className="hig-card p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Percent
              style={{ color: 'var(--accent-gold)' }}
              className="w-4 h-4"
              aria-hidden="true"
            />
            <span>Pajak PPN, Penomoran &amp; Target Omset</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <label htmlFor="st-tax" className="block text-xs font-semibold mb-1">
                Tarif PPN (%)
              </label>
              <input
                id="st-tax"
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={taxRate}
                onChange={(e) => setTaxRate(Number(e.target.value) || 0)}
                className="w-full min-h-[42px] px-3 py-2 hig-input font-mono tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="st-prefix" className="block text-xs font-semibold mb-1">
                Prefix Invoice
              </label>
              <input
                id="st-prefix"
                type="text"
                required
                value={invoicePrefix}
                onChange={(e) => setInvoicePrefix(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 hig-input font-mono uppercase"
              />
              <p style={{ color: 'var(--text-secondary)' }} className="text-[11px] mt-1">
                Berikutnya: <span className="font-mono font-bold">{nextInvoicePreview}</span>
              </p>
            </div>
            <div>
              <label htmlFor="st-target" className="block text-xs font-semibold mb-1">
                Target Omset Harian (Rp)
              </label>
              <input
                id="st-target"
                type="number"
                min={0}
                value={dailyTarget}
                onChange={(e) => setDailyTarget(Number(e.target.value) || 0)}
                className="w-full min-h-[42px] px-3 py-2 hig-input font-mono tabular-nums"
              />
            </div>
          </div>

          {can('settings:write') && (
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2 hig-btn-cta text-xs font-semibold"
              >
                <Save className="w-4 h-4" aria-hidden="true" />
                <span>Simpan Pengaturan</span>
              </button>
            </div>
          )}
        </div>
      </form>

      {can('backup:manage') && (
        <div className="hig-card p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Database className="w-4 h-4" aria-hidden="true" />
            <span>Manajemen Basis Data Lokal (Backup &amp; Restore JSON)</span>
          </div>
          <p style={{ color: 'var(--text-secondary)' }} className="text-xs">
            Ekspor seluruh data (produk, pelanggan, transaksi, pembelian PO, pengeluaran, piutang,
            user, dan audit log) ke file JSON lokal.{' '}
            <strong style={{ color: db.settings.lastBackupAt ? 'var(--status-positive)' : 'var(--status-warning)' }}>
              {db.settings.lastBackupAt
                ? `Terakhir backup: ${formatDateTime(db.settings.lastBackupAt)}`
                : 'Belum pernah di-backup pada perangkat ini.'}
            </strong>
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={exportBackupJson}
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 hig-btn-secondary text-xs font-semibold"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>Ekspor Backup JSON</span>
            </button>

            <label
              htmlFor="restore-json-input"
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 hig-btn-secondary text-xs font-semibold"
            >
              <Upload
                style={{ color: 'var(--accent-primary-text)' }}
                className="w-4 h-4"
                aria-hidden="true"
              />
              <span>Impor / Restore JSON</span>
              <input
                id="restore-json-input"
                type="file"
                accept=".json,application/json"
                onChange={handleRestoreFile}
                className="sr-only"
              />
            </label>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      'Reset transaksi, pelanggan, piutang, pembelian, pengeluaran, dan audit log sambil tetap mempertahankan Master Produk?'
                    )
                  ) {
                    resetOperationalData();
                  }
                }}
                className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 hig-btn-secondary text-xs font-semibold"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Reset Transaksi (Simpan Produk)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      'Hapus seluruh produk, pelanggan, transaksi, piutang, mutasi stok, dan audit log? Akun pengguna dan profil perusahaan tetap dipertahankan.'
                    )
                  ) {
                    clearAllData();
                  }
                }}
                style={{
                  backgroundColor: 'var(--status-danger-soft)',
                  color: 'var(--status-danger)',
                }}
                className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Kosongkan Semua</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Confirmation Modal (3 macOS dots) */}
      <Modal
        open={Boolean(pendingRestore)}
        onClose={() => setPendingRestore(null)}
        title="Konfirmasi Restore Basis Data JSON"
        subtitle="Pastikan Anda sudah mengunduh backup data saat ini sebelum menimpa"
      >
        {pendingRestore && (
          <div className="space-y-4 text-xs">
            <div className="hig-inset p-3.5 space-y-1">
              <p className="font-bold">Ringkasan Isi File Backup:</p>
              <p>Produk: {pendingRestore.products.length} SKU</p>
              <p>Pelanggan: {pendingRestore.customers.length} mitra</p>
              <p>Transaksi: {pendingRestore.transactions.length} invoice</p>
              <p>Rencana Cicilan Piutang: {pendingRestore.paymentPlans.length} data</p>
              <p>Pengguna Sistem: {pendingRestore.users.length} akun</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingRestore(null)}
                className="min-h-[44px] px-4 py-2 hig-btn-secondary font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmRestore}
                style={{ backgroundColor: 'var(--accent-primary)', color: '#FFFFFF' }}
                className="min-h-[44px] px-4 py-2 rounded-lg font-semibold"
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

import React, { useState } from 'react';
import { Lock, User as UserIcon, ShieldCheck, ArrowRight, KeyRound } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { getRoleLabel, getRoleSummary } from '../lib/rbac';

export const LoginScreen: React.FC = () => {
  const { db, login, quickDemoLogin } = useErp();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk.');
    }
  };

  const handleQuickLogin = (userId: string) => {
    setError(null);
    try {
      quickDemoLogin(userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk.');
    }
  };

  return (
    <div className="min-h-screen bg-[#14110F] flex flex-col lg:flex-row">
      {/* Left Brand Showcase (Dark Obsidian Surface for crisp white/crimson/gold SVG logo) */}
      <div className="lg:w-1/2 relative flex flex-col justify-between p-8 lg:p-14 bg-[#14110F] text-white border-b lg:border-b-0 lg:border-r border-[#2A231E] overflow-hidden">
        <div
          className="pointer-events-none absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-25 blur-3xl"
          style={{ background: 'radial-gradient(circle, #D4A017 0%, transparent 70%)' }}
        />
        <div
          className="pointer-events-none absolute -bottom-32 -right-20 w-96 h-96 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, #B91C1C 0%, transparent 70%)' }}
        />

        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#241E1A] border border-[#3A3029] text-xs font-semibold text-amber-300 tracking-wide">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
            ERP &amp; POS PABRIK TEMBAKAU
          </div>
        </div>

        <div className="relative z-10 my-10 flex flex-col items-center lg:items-start text-center lg:text-left">
          <div className="p-5 rounded-2xl bg-[#191512] border border-[#2F2722] shadow-2xl mb-7">
            <img
              src="/Indobacco_transparent.svg"
              alt="Indobacco Tingwe Tobacco Premium"
              className="w-48 h-48 sm:w-56 sm:h-56 object-contain"
            />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            {db.settings.companyName}
          </h1>
          <p className="mt-2 text-sm sm:text-base text-[#B8AEA2] max-w-md leading-relaxed">
            Sistem operasional terpadu untuk Kasir POS, Gudang &amp; Valuasi Stok HPP, Manajemen
            Piutang Cicilan, Cetak Surat Jalan, hingga Laporan Keuangan Multi-Role.
          </p>
        </div>

        <div className="relative z-10 grid grid-cols-3 gap-4 pt-6 border-t border-[#2A231E] text-xs">
          <div>
            <p className="text-[#8F8478]">Produk Aktif</p>
            <p className="text-lg font-bold text-amber-300 tabular-nums mt-0.5">
              {db.products.length} SKU
            </p>
          </div>
          <div>
            <p className="text-[#8F8478]">Mitra Pelanggan</p>
            <p className="text-lg font-bold text-white tabular-nums mt-0.5">
              {db.customers.length} Mitra
            </p>
          </div>
          <div>
            <p className="text-[#8F8478]">Dokumen Cetak</p>
            <p className="text-lg font-bold text-white mt-0.5">58/80mm &amp; A4</p>
          </div>
        </div>
      </div>

      {/* Right Login Card */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 sm:p-10 bg-[#F8F6F2]">
        <div className="w-full max-w-md bg-white border border-[#E6E0D6] rounded-2xl shadow-lg p-7 sm:p-8">
          <div className="mb-6">
            <h2 className="text-xl font-extrabold text-[#1A1614]">Masuk ke Sistem</h2>
            <p className="text-sm text-[#6B6257] mt-1">
              Gunakan kredensial akun atau pilih akun uji coba sesuai jabatan.
            </p>
          </div>

          {error && (
            <div className="mb-4 px-3.5 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#5C5349] mb-1.5">
                Username
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-[#8A7F73] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-[#D8D0C5] bg-white text-sm text-[#1A1614] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/25 focus:border-[#B91C1C]"
                  placeholder="Contoh: admin"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#5C5349] mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#8A7F73] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-[#D8D0C5] bg-white text-sm text-[#1A1614] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/25 focus:border-[#B91C1C]"
                  placeholder="Masukkan password"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
            >
              Masuk Sistem
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-7 pt-6 border-t border-[#E6E0D6]">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#6B6257] mb-3">
              <KeyRound className="w-3.5 h-3.5 text-[#B8860B]" />
              Akses Cepat Uji Role (RBAC Demo)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {db.users
                .filter((u) => u.isActive)
                .slice(0, 4)
                .map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleQuickLogin(u.id)}
                    className="text-left p-2.5 rounded-lg border border-[#E6E0D6] bg-[#F8F6F2] hover:bg-[#EFEAE0] hover:border-[#C9BFA9] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#1A1614]">
                        {getRoleLabel(u.role)}
                      </span>
                      <span className="text-[11px] font-mono text-[#7C7165]">@{u.username}</span>
                    </div>
                    <p className="text-[11px] text-[#6B6257] mt-1 line-clamp-2 leading-tight">
                      {getRoleSummary(u.role)}
                    </p>
                  </button>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

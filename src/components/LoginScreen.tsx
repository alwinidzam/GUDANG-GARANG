import React, { useRef, useState } from 'react';
import { Lock, User as UserIcon, KeyRound } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { getRoleLabel, getRoleSummary } from '../lib/rbac';
import { ThemeSegmentedControl } from './ui/SharedUi';

export const LoginScreen: React.FC = () => {
  const { db, login } = useErp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk.');
    }
  };

  const handleSelectAccount = (selectedUsername: string) => {
    setError(null);
    setUsername(selectedUsername);
    setPassword('');
    passwordInputRef.current?.focus();
  };

  return (
    <div
      style={{ backgroundColor: 'var(--bg-sidebar)', color: 'var(--text-primary)' }}
      className="min-h-screen flex flex-col justify-center items-center p-4 sm:p-8"
    >
      <div className="w-full max-w-lg mb-3 flex items-center justify-between">
        <span style={{ color: 'var(--text-secondary)' }} className="text-xs font-medium">
          Penyimpanan Lokal · Offline-First
        </span>
        <ThemeSegmentedControl />
      </div>

      <main className="w-full max-w-lg hig-card p-7 sm:p-9 shadow-sm">
        {/* Compact Brand Header (dark obsidian plaque keeps white "Indo" text crisp on pure white card) */}
        <div className="flex items-center gap-4 pb-6 mb-6 border-b border-[var(--border-hairline)]">
          <div className="w-20 h-20 rounded-2xl bg-[#14110F] p-2 shrink-0 flex items-center justify-center border border-black/10">
            <img
              src="/Indobacco_transparent.svg"
              alt="Logo Indobacco Tingwe Tobacco Premium"
              width={64}
              height={64}
              fetchPriority="high"
              className="w-16 h-16 object-contain"
            />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight leading-snug">
              {db.settings.companyName}
            </h1>
            <p style={{ color: 'var(--text-secondary)' }} className="text-xs mt-1 leading-relaxed">
              ERP dan Kasir POS lokal untuk stok gudang HPP, piutang cicilan, cetak Surat Jalan, dan
              laporan laba rugi.
            </p>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              backgroundColor: 'var(--status-danger-soft)',
              color: 'var(--status-danger)',
            }}
            className="mb-4 px-3.5 py-2.5 rounded-lg text-sm font-medium"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-username" className="block text-xs font-semibold mb-1.5">
              Username
            </label>
            <div className="relative">
              <UserIcon
                style={{ color: 'var(--text-secondary)' }}
                className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full min-h-[44px] pl-10 pr-3.5 py-2 hig-input text-sm"
                placeholder="admin"
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className="block text-xs font-semibold mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock
                style={{ color: 'var(--text-secondary)' }}
                className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                ref={passwordInputRef}
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full min-h-[44px] pl-10 pr-3.5 py-2 hig-input text-sm"
                placeholder="Masukkan password"
                autoComplete="current-password"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full min-h-[44px] py-2.5 px-4 hig-btn-cta font-semibold text-sm transition-colors"
          >
            Masuk Sistem
          </button>
        </form>

        <div style={{ borderColor: 'var(--border-hairline)' }} className="mt-7 pt-6 border-t">
          <div className="flex items-center gap-2 text-xs font-semibold mb-3">
            <KeyRound
              style={{ color: 'var(--accent-gold)' }}
              className="w-4 h-4"
              aria-hidden="true"
            />
            <span>Pilih Akun Operator (Wajib Password)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {db.users
              .filter((u) => u.isActive)
              .slice(0, 4)
              .map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => handleSelectAccount(u.username)}
                  style={{
                    backgroundColor: 'var(--bg-subtle)',
                    borderColor: 'var(--border-hairline)',
                  }}
                  className="text-left min-h-[44px] p-3 rounded-xl border hover:border-[var(--border-control)] transition-colors"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold">{getRoleLabel(u.role)}</span>
                    <span
                      style={{ color: 'var(--text-secondary)' }}
                      className="text-[11px] font-mono"
                    >
                      @{u.username}
                    </span>
                  </div>
                  <p
                    style={{ color: 'var(--text-secondary)' }}
                    className="text-[11px] mt-1 line-clamp-2 leading-tight"
                  >
                    {getRoleSummary(u.role)}
                  </p>
                </button>
              ))}
          </div>
        </div>
      </main>
    </div>
  );
};

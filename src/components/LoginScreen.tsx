import React, { useState } from 'react';
import { Eye, EyeOff, Lock, User as UserIcon } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { ThemeSegmentedControl } from './ui/SharedUi';

export const LoginScreen: React.FC = () => {
  const { db, login } = useErp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk ke sistem.');
    }
  };

  return (
    <div
      style={{ backgroundColor: 'var(--bg-sidebar)', color: 'var(--text-primary)' }}
      className="min-h-screen flex flex-col justify-center items-center p-4 sm:p-8"
    >
      <div className="w-full max-w-md mb-3 flex items-center justify-between">
        <span style={{ color: 'var(--text-secondary)' }} className="text-xs font-medium">
          Indobacco ERP · Sistem Operasional
        </span>
        <ThemeSegmentedControl />
      </div>

      <main className="w-full max-w-md hig-card p-7 sm:p-9 shadow-sm">
        {/* Compact Brand Header (dark obsidian plaque keeps white "Indo" text crisp on pure white card) */}
        <div className="flex items-center gap-4 pb-6 mb-6 border-b border-[var(--border-hairline)]">
          <div className="w-16 h-16 rounded-2xl bg-[#14110F] p-2 shrink-0 flex items-center justify-center border border-black/10">
            <img
              src="/Indobacco_transparent.svg"
              alt="Logo Indobacco Tingwe Tobacco Premium"
              width={48}
              height={48}
              fetchPriority="high"
              className="w-12 h-12 object-contain"
            />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight leading-snug">
              {db.settings.companyName}
            </h1>
            <p style={{ color: 'var(--text-secondary)' }} className="text-xs mt-1 leading-relaxed">
              Masuk menggunakan akun operator yang terdaftar untuk mengakses sistem ERP &amp; POS.
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
                placeholder="Masukkan username"
                autoComplete="username"
                autoFocus
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
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full min-h-[44px] pl-10 pr-11 py-2 hig-input text-sm"
                placeholder="Masukkan password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                style={{ color: 'var(--text-secondary)' }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Eye className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full min-h-[44px] py-2.5 px-4 hig-btn-cta font-semibold text-sm transition-colors mt-1"
          >
            Masuk Sistem
          </button>
        </form>

        <p
          style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-hairline)' }}
          className="mt-6 pt-4 border-t text-[11px] text-center"
        >
          Hubungi Super Admin apabila Anda lupa kredensial atau membutuhkan akun akses baru.
        </p>
      </main>
    </div>
  );
};

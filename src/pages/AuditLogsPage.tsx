import React, { useMemo, useState } from 'react';
import { Search, ChevronDown, ChevronUp, ShieldAlert } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { formatDateTime } from '../lib/format';
import { EmptyState, RoleBadge } from '../components/ui/SharedUi';

export const AuditLogsPage: React.FC = () => {
  const { db } = useErp();
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const modules = useMemo(() => {
    const s = new Set(db.auditLogs.map((l) => l.module));
    return ['ALL', ...Array.from(s)];
  }, [db.auditLogs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.auditLogs.filter((l) => {
      if (moduleFilter !== 'ALL' && l.module !== moduleFilter) return false;
      if (
        q &&
        !l.userName.toLowerCase().includes(q) &&
        !l.action.toLowerCase().includes(q) &&
        !l.summary.toLowerCase().includes(q) &&
        !l.module.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [db.auditLogs, search, moduleFilter]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
          <ShieldAlert
            style={{ color: 'var(--accent-primary-text)' }}
            className="w-5 h-5"
            aria-hidden="true"
          />
          <span>Audit Trail &amp; Activity Logs</span>
        </h2>
        <p style={{ color: 'var(--text-secondary)' }} className="text-xs mt-0.5">
          Jejak akuntabilitas otomatis untuk setiap aksi kritis beserta snapshot perubahan datanya.
        </p>
      </div>

      <div className="hig-card p-3.5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search
            style={{ color: 'var(--text-secondary)' }}
            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="text"
            aria-label="Cari aktivitas audit log"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari pelaku, modul, aksi, atau ringkasan..."
            className="w-full min-h-[38px] pl-9 pr-3 py-1.5 hig-input text-xs"
          />
        </div>
        <select
          aria-label="Filter modul audit"
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="min-h-[38px] px-3 py-1.5 hig-input text-xs font-semibold"
        >
          {modules.map((m) => (
            <option key={m} value={m}>
              {m === 'ALL' ? 'Semua Modul' : m}
            </option>
          ))}
        </select>
      </div>

      <div className="hig-card p-2 space-y-1 overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={ShieldAlert}
            title="Log aktivitas tidak ditemukan"
            description="Tidak ada catatan audit yang sesuai dengan filter atau kata kunci Anda."
            actionLabel="Reset Filter"
            onAction={() => {
              setSearch('');
              setModuleFilter('ALL');
            }}
          />
        ) : (
          filtered.map((log) => {
            const hasDiff = log.before !== undefined || log.after !== undefined;
            const isOpen = expandedId === log.id;
            return (
              <div key={log.id} className="p-3.5 rounded-xl hig-row-hover text-xs transition-colors">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        style={{
                          backgroundColor: 'var(--cta-bg)',
                          color: 'var(--cta-text)',
                        }}
                        className="font-mono text-[11px] font-bold px-2 py-0.5 rounded"
                      >
                        {log.module}
                      </span>
                      <span
                        style={{ color: 'var(--accent-primary-text)' }}
                        className="font-mono font-bold"
                      >
                        {log.action}
                      </span>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        · {formatDateTime(log.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm font-semibold">{log.summary}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span style={{ color: 'var(--text-secondary)' }} className="font-semibold">
                      {log.userName}
                    </span>
                    <RoleBadge role={log.userRole} />
                    {hasDiff && (
                      <button
                        type="button"
                        onClick={() => setExpandedId(isOpen ? null : log.id)}
                        aria-expanded={isOpen}
                        className="w-8 h-8 flex items-center justify-center hig-btn-secondary"
                        aria-label="Lihat rincian perubahan data"
                        title="Lihat rincian data"
                      >
                        {isOpen ? (
                          <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {isOpen && hasDiff && (
                  <div className="mt-3 hig-inset grid grid-cols-1 md:grid-cols-2 gap-3 p-3 font-mono text-[11px] overflow-x-auto">
                    {log.before !== undefined && (
                      <div>
                        <p style={{ color: 'var(--text-secondary)' }} className="font-bold mb-1">
                          SEBELUM:
                        </p>
                        <pre className="whitespace-pre-wrap break-all">
                          {JSON.stringify(log.before, null, 2)}
                        </pre>
                      </div>
                    )}
                    {log.after !== undefined && (
                      <div>
                        <p style={{ color: 'var(--status-positive)' }} className="font-bold mb-1">
                          SESUDAH:
                        </p>
                        <pre className="whitespace-pre-wrap break-all">
                          {JSON.stringify(log.after, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

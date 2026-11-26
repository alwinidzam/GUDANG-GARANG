import React, { useMemo, useState } from 'react';
import { Search, ChevronDown, ChevronUp, ShieldAlert } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { formatDateTime } from '../lib/format';
import { RoleBadge } from '../components/ui/SharedUi';

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
        <h2 className="text-lg font-extrabold text-[#1A1614] flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-[#B91C1C]" />
          Audit Trail &amp; Activity Logs
        </h2>
        <p className="text-xs text-[#6B6257]">
          Jejak akuntabilitas otomatis untuk setiap aksi kritis beserta snapshot perubahan datanya.
        </p>
      </div>

      <div className="bg-white border border-[#E6E0D6] rounded-xl p-3.5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[#8A7F73] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari pelaku, modul, aksi, atau ringkasan..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-[#D8D0C5] text-xs"
          />
        </div>
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-[#D8D0C5] text-xs bg-white font-semibold"
        >
          {modules.map((m) => (
            <option key={m} value={m}>
              {m === 'ALL' ? 'Semua Modul' : m}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-[#E6E0D6] rounded-xl shadow-xs divide-y divide-[#EDE7DD]">
        {filtered.map((log) => {
          const hasDiff = log.before !== undefined || log.after !== undefined;
          const isOpen = expandedId === log.id;
          return (
            <div key={log.id} className="p-4 hover:bg-[#FAF8F4] text-xs">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-[#14110F] text-white">
                      {log.module}
                    </span>
                    <span className="font-mono font-bold text-[#B91C1C]">{log.action}</span>
                    <span className="text-[#6B6257]">• {formatDateTime(log.timestamp)}</span>
                  </div>
                  <p className="text-sm font-semibold text-[#1A1614]">{log.summary}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#5C5349]">{log.userName}</span>
                  <RoleBadge role={log.userRole} />
                  {hasDiff && (
                    <button
                      type="button"
                      onClick={() => setExpandedId(isOpen ? null : log.id)}
                      className="p-1 rounded border border-[#D8D0C5] hover:bg-[#F1EDE5] cursor-pointer"
                      title="Lihat rincian data"
                    >
                      {isOpen ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {isOpen && hasDiff && (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 bg-[#F8F6F2] border border-[#E6E0D6] rounded-lg p-3 font-mono text-[11px] overflow-x-auto">
                  {log.before !== undefined && (
                    <div>
                      <p className="font-bold text-[#6B6257] mb-1">SEBELUM:</p>
                      <pre className="whitespace-pre-wrap break-all">
                        {JSON.stringify(log.before, null, 2)}
                      </pre>
                    </div>
                  )}
                  {log.after !== undefined && (
                    <div>
                      <p className="font-bold text-emerald-800 mb-1">SESUDAH:</p>
                      <pre className="whitespace-pre-wrap break-all">
                        {JSON.stringify(log.after, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

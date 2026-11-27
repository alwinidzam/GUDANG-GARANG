import React, { useState } from 'react';
import { UserPlus, Pencil, Trash2, ShieldCheck, Check, Minus } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { formatDate } from '../lib/format';
import { getRoleLabel, getRoleSummary, hasPermission, RBAC_MATRIX_ROWS } from '../lib/rbac';
import { Role, User } from '../types/erp';
import { Modal, RoleBadge } from '../components/ui/SharedUi';

const ALL_ROLES: Role[] = ['SUPER_ADMIN', 'MANAGER', 'KASIR', 'OWNER'];

export const UsersPage: React.FC = () => {
  const { db, currentUser, upsertUser, deleteUser, showToast } = useErp();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('KASIR');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(true);

  const openAdd = () => {
    setEditingId(undefined);
    setUsername('');
    setName('');
    setRole('KASIR');
    setPassword('');
    setIsActive(true);
    setModalOpen(true);
  };

  const openEdit = (u: User) => {
    setEditingId(u.id);
    setUsername(u.username);
    setName(u.name);
    setRole(u.role);
    setPassword('');
    setIsActive(u.isActive);
    setModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      upsertUser({ id: editingId, username, name, role, password, isActive });
      setModalOpen(false);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal menyimpan user.');
    }
  };

  const handleDelete = (u: User) => {
    if (!window.confirm(`Hapus akun user "${u.username}" (${u.name})?`)) return;
    try {
      deleteUser(u.id);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal menghapus user.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">
            Manajemen Pengguna &amp; Hak Akses (RBAC)
          </h2>
          <p style={{ color: 'var(--text-secondary)' }} className="text-xs mt-0.5">
            Kendali akun karyawan dan otorisasi berjenjang khusus Super Admin.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="min-h-[44px] inline-flex items-center gap-1.5 px-4 py-2 hig-btn-cta text-xs font-semibold"
        >
          <UserPlus className="w-4 h-4" aria-hidden="true" />
          <span>Tambah User Baru</span>
        </button>
      </div>

      {/* Role Reference Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {ALL_ROLES.map((r) => (
          <div key={r} className="hig-card p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <ShieldCheck
                style={{ color: 'var(--accent-gold)' }}
                className="w-4 h-4"
                aria-hidden="true"
              />
              <span className="text-xs font-bold">{getRoleLabel(r)}</span>
            </div>
            <p style={{ color: 'var(--text-secondary)' }} className="text-xs leading-relaxed">
              {getRoleSummary(r)}
            </p>
          </div>
        ))}
      </div>

      {/* Users Table */}
      <div className="hig-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="hig-table-head">
              <tr>
                <th className="py-3 px-4 font-semibold">Nama Lengkap</th>
                <th className="py-3 px-4 font-semibold">Username</th>
                <th className="py-3 px-4 font-semibold">Role</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold">Dibuat</th>
                <th className="py-3 px-4 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {db.users.map((u) => (
                <tr key={u.id} className="hig-row-hover">
                  <td className="py-3 px-4 font-bold">
                    {u.name}
                    {currentUser?.id === u.id && (
                      <span
                        style={{
                          backgroundColor: 'var(--cta-bg)',
                          color: 'var(--cta-text)',
                        }}
                        className="ml-2 text-[10px] px-1.5 py-0.5 rounded font-semibold"
                      >
                        Anda
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono">@{u.username}</td>
                  <td className="py-3 px-4">
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="py-3 px-4">
                    <span
                      style={{
                        color: u.isActive ? 'var(--status-positive)' : 'var(--text-secondary)',
                      }}
                      className="inline-flex items-center gap-1.5 font-semibold"
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-current shrink-0"
                        aria-hidden="true"
                      />
                      {u.isActive ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }} className="py-3 px-4">
                    {formatDate(u.createdAt)}
                  </td>
                  <td className="py-3 px-4 text-right space-x-1">
                    <button
                      type="button"
                      onClick={() => openEdit(u)}
                      className="w-8 h-8 inline-flex items-center justify-center hig-btn-secondary"
                      aria-label={`Edit ${u.username}`}
                      title="Edit akun"
                    >
                      <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    {currentUser?.id !== u.id && (
                      <button
                        type="button"
                        onClick={() => handleDelete(u)}
                        style={{
                          backgroundColor: 'var(--status-danger-soft)',
                          color: 'var(--status-danger)',
                        }}
                        className="w-8 h-8 inline-flex items-center justify-center rounded-lg"
                        aria-label={`Hapus ${u.username}`}
                        title="Hapus akun"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* RBAC Permission Matrix */}
      <div className="hig-card overflow-hidden">
        <div
          style={{ borderColor: 'var(--border-hairline)' }}
          className="px-5 py-4 border-b flex items-center justify-between gap-3"
        >
          <div>
            <h3 className="text-sm font-bold">Matriks Hak Akses per Role (RBAC)</h3>
            <p style={{ color: 'var(--text-secondary)' }} className="text-xs mt-0.5">
              Pembagian wewenang modul dan aksi operasional yang ditegakkan secara otomatis di antarmuka maupun mesin transaksi.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="hig-table-head">
              <tr>
                <th className="py-3 px-4 font-semibold">Modul / Wewenang</th>
                {ALL_ROLES.map((r) => (
                  <th key={r} className="py-3 px-4 font-semibold text-center whitespace-nowrap">
                    {getRoleLabel(r)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RBAC_MATRIX_ROWS.map((row) => (
                <tr key={row.permission} className="hig-row-hover">
                  <td className="py-2.5 px-4">
                    <p className="font-semibold">{row.module}</p>
                    <p style={{ color: 'var(--text-secondary)' }} className="text-[11px]">
                      {row.description}
                    </p>
                  </td>
                  {ALL_ROLES.map((r) => {
                    const allowed = hasPermission(r, row.permission);
                    return (
                      <td key={r} className="py-2.5 px-4 text-center">
                        {allowed ? (
                          <span
                            style={{ color: 'var(--status-positive)' }}
                            className="inline-flex items-center justify-center"
                            aria-label="Diizinkan"
                          >
                            <Check className="w-4 h-4" aria-hidden="true" />
                          </span>
                        ) : (
                          <span
                            style={{ color: 'var(--text-secondary)' }}
                            className="inline-flex items-center justify-center opacity-40"
                            aria-label="Tidak diizinkan"
                          >
                            <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Modal (3 macOS dots) */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit Pengguna' : 'Tambah Pengguna Baru'}
      >
        <form onSubmit={handleSave} className="space-y-3.5 text-sm">
          <div>
            <label htmlFor="usr-name" className="block text-xs font-semibold mb-1">
              Nama Lengkap *
            </label>
            <input
              id="usr-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 hig-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="usr-username" className="block text-xs font-semibold mb-1">
                Username *
              </label>
              <input
                id="usr-username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 hig-input font-mono lowercase"
              />
            </div>
            <div>
              <label htmlFor="usr-role" className="block text-xs font-semibold mb-1">
                Role / Jabatan *
              </label>
              <select
                id="usr-role"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="w-full min-h-[42px] px-3 py-2 hig-input"
              >
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {getRoleLabel(r)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="usr-pw" className="block text-xs font-semibold mb-1">
              {editingId ? 'Password Baru (kosongkan jika tidak diubah)' : 'Password *'}
            </label>
            <input
              id="usr-pw"
              type="password"
              required={!editingId}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimal 4 karakter"
              className="w-full min-h-[42px] px-3 py-2 hig-input"
            />
          </div>
          <label htmlFor="usr-active" className="inline-flex items-center gap-2 text-xs font-semibold">
            <input
              id="usr-active"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span>Akun Aktif (dapat login ke sistem)</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="min-h-[44px] px-4 py-2 hig-btn-secondary text-xs font-semibold"
            >
              Batal
            </button>
            <button
              type="submit"
              className="min-h-[44px] px-4 py-2 hig-btn-cta text-xs font-semibold"
            >
              Simpan User
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

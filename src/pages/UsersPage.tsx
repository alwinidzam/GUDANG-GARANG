import React, { useState } from 'react';
import { UserPlus, Pencil, Trash2, ShieldCheck } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { formatDate } from '../lib/format';
import { getRoleLabel, getRoleSummary } from '../lib/rbac';
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
          <h2 className="text-lg font-extrabold text-[#1A1614]">
            Manajemen Pengguna &amp; Hak Akses (RBAC)
          </h2>
          <p className="text-xs text-[#6B6257]">
            Kendali akun karyawan dan otorisasi berjenjang khusus Super Admin.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-bold cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          Tambah User Baru
        </button>
      </div>

      {/* Role Reference Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {ALL_ROLES.map((r) => (
          <div key={r} className="bg-white border border-[#E6E0D6] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <ShieldCheck className="w-4 h-4 text-[#B8860B]" />
              <span className="text-xs font-extrabold text-[#1A1614]">{getRoleLabel(r)}</span>
            </div>
            <p className="text-xs text-[#6B6257] leading-relaxed">{getRoleSummary(r)}</p>
          </div>
        ))}
      </div>

      {/* Users Table */}
      <div className="bg-white border border-[#E6E0D6] rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#F8F6F2] border-b border-[#E6E0D6] text-[#5C5349] uppercase">
              <tr>
                <th className="py-3 px-4 font-bold">Nama Lengkap</th>
                <th className="py-3 px-4 font-bold">Username</th>
                <th className="py-3 px-4 font-bold">Role</th>
                <th className="py-3 px-4 font-bold">Status</th>
                <th className="py-3 px-4 font-bold">Dibuat</th>
                <th className="py-3 px-4 font-bold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EDE7DD]">
              {db.users.map((u) => (
                <tr key={u.id} className="hover:bg-[#FAF8F4]">
                  <td className="py-3 px-4 font-bold text-[#1A1614]">
                    {u.name}
                    {currentUser?.id === u.id && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-[#14110F] text-white">
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
                      className={`px-2 py-0.5 rounded font-semibold ${
                        u.isActive
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-stone-100 text-stone-500'
                      }`}
                    >
                      {u.isActive ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-[#6B6257]">{formatDate(u.createdAt)}</td>
                  <td className="py-3 px-4 text-right space-x-1">
                    <button
                      type="button"
                      onClick={() => openEdit(u)}
                      className="p-1.5 rounded border border-[#D8D0C5] hover:bg-[#F1EDE5] cursor-pointer"
                      title="Edit akun"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {currentUser?.id !== u.id && (
                      <button
                        type="button"
                        onClick={() => handleDelete(u)}
                        className="p-1.5 rounded border border-rose-200 text-rose-700 hover:bg-rose-50 cursor-pointer"
                        title="Hapus akun"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit Pengguna' : 'Tambah Pengguna Baru'}
      >
        <form onSubmit={handleSave} className="space-y-3.5 text-sm">
          <div>
            <label className="block text-xs font-bold text-[#5C5349] mb-1">Nama Lengkap *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#5C5349] mb-1">Username *</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5] font-mono lowercase"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5C5349] mb-1">Role / Jabatan *</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5] bg-white"
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
            <label className="block text-xs font-bold text-[#5C5349] mb-1">
              {editingId ? 'Password Baru (kosongkan jika tidak diubah)' : 'Password *'}
            </label>
            <input
              type="password"
              required={!editingId}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimal 4 karakter"
              className="w-full px-3 py-2 rounded-lg border border-[#D8D0C5]"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Akun Aktif (dapat login ke sistem)
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-[#D8D0C5] text-xs font-bold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#B91C1C] text-white text-xs font-bold cursor-pointer"
            >
              Simpan User
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

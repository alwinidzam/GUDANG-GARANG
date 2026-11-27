export function formatRupiah(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  const sign = safe < 0 ? '-' : '';
  const abs = Math.abs(safe);
  return `${sign}Rp ${abs.toLocaleString('id-ID')}`;
}

export function formatNumber(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return safe.toLocaleString('id-ID', { maximumFractionDigits: 3 });
}

export function roundQty(qty: number): number {
  if (!Number.isFinite(qty)) return 0;
  return Math.round(qty * 1000) / 1000;
}

export function formatWhatsAppUrl(phone: string | undefined, message: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  const normalized = digits.startsWith('0')
    ? `62${digits.slice(1)}`
    : digits.startsWith('62')
    ? digits
    : digits
    ? `62${digits}`
    : '';
  const encoded = encodeURIComponent(message);
  return normalized ? `https://wa.me/${normalized}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

export function toLocalDateISO(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function extractDateISO(isoOrDate: string): string {
  if (!isoOrDate) return toLocalDateISO();
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate)) return isoOrDate;
  const parsed = new Date(isoOrDate);
  if (Number.isNaN(parsed.getTime())) return isoOrDate.slice(0, 10);
  return toLocalDateISO(parsed);
}

export function parseDateParts(isoDate: string): { y: number; m: number; d: number } {
  const clean = isoDate.slice(0, 10);
  const [yStr, mStr, dStr] = clean.split('-');
  return {
    y: Number(yStr) || 2026,
    m: Number(mStr) || 1,
    d: Number(dStr) || 1,
  };
}

export function addDaysISO(isoDate: string, days: number): string {
  const { y, m, d } = parseDateParts(isoDate);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function addMonthsISO(isoDate: string, months: number): string {
  const { y, m, d } = parseDateParts(isoDate);
  const totalMonths = y * 12 + (m - 1) + months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(d, daysInTargetMonth);
  const mm = String(targetMonth + 1).padStart(2, '0');
  const dd = String(clampedDay).padStart(2, '0');
  return `${targetYear}-${mm}-${dd}`;
}

export function diffDays(fromISO: string, toISO: string): number {
  const a = parseDateParts(fromISO);
  const b = parseDateParts(toISO);
  const utcA = Date.UTC(a.y, a.m - 1, a.d);
  const utcB = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((utcB - utcA) / (1000 * 60 * 60 * 24));
}

export function formatDate(iso: string): string {
  if (!iso) return '-';
  const clean = iso.length === 10 ? `${iso}T00:00:00` : iso;
  const d = new Date(clean);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(iso: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const SATUAN = [
  '',
  'Satu',
  'Dua',
  'Tiga',
  'Empat',
  'Lima',
  'Enam',
  'Tujuh',
  'Delapan',
  'Sembilan',
  'Sepuluh',
  'Sebelas',
];

function terbilangCore(n: number): string {
  const x = Math.floor(n);
  if (x === 0) return '';
  if (x < 12) return SATUAN[x];
  if (x < 20) return `${terbilangCore(x - 10)} Belas`;
  if (x < 100) {
    const puluhan = Math.floor(x / 10);
    const sisa = x % 10;
    return `${SATUAN[puluhan]} Puluh${sisa ? ` ${terbilangCore(sisa)}` : ''}`;
  }
  if (x < 200) {
    const sisa = x - 100;
    return `Seratus${sisa ? ` ${terbilangCore(sisa)}` : ''}`;
  }
  if (x < 1000) {
    const ratusan = Math.floor(x / 100);
    const sisa = x % 100;
    return `${SATUAN[ratusan]} Ratus${sisa ? ` ${terbilangCore(sisa)}` : ''}`;
  }
  if (x < 2000) {
    const sisa = x - 1000;
    return `Seribu${sisa ? ` ${terbilangCore(sisa)}` : ''}`;
  }
  if (x < 1_000_000) {
    const ribuan = Math.floor(x / 1000);
    const sisa = x % 1000;
    return `${terbilangCore(ribuan)} Ribu${sisa ? ` ${terbilangCore(sisa)}` : ''}`;
  }
  if (x < 1_000_000_000) {
    const jutaan = Math.floor(x / 1_000_000);
    const sisa = x % 1_000_000;
    return `${terbilangCore(jutaan)} Juta${sisa ? ` ${terbilangCore(sisa)}` : ''}`;
  }
  if (x < 1_000_000_000_000) {
    const miliaran = Math.floor(x / 1_000_000_000);
    const sisa = x % 1_000_000_000;
    return `${terbilangCore(miliaran)} Miliar${sisa ? ` ${terbilangCore(sisa)}` : ''}`;
  }
  const triliunan = Math.floor(x / 1_000_000_000_000);
  const sisa = x % 1_000_000_000_000;
  return `${terbilangCore(triliunan)} Triliun${sisa ? ` ${terbilangCore(sisa)}` : ''}`;
}

export function terbilangRupiah(amount: number): string {
  if (!Number.isFinite(amount)) return 'Nol Rupiah';
  const safe = Math.round(amount);
  if (safe === 0) return 'Nol Rupiah';
  if (safe < 0) return `Minus ${terbilangCore(Math.abs(safe)).trim()} Rupiah`;
  return `${terbilangCore(safe).trim()} Rupiah`;
}

/**
 * Deterministic lightweight hash for local multi-user browser storage.
 * Note: For internet-facing backend auth, replace with Argon2id/bcrypt on the server.
 */
export function hashPassword(plain: string): string {
  let h1 = 0xdeadbeef ^ plain.length;
  let h2 = 0x41c6ce57 ^ plain.length;
  for (let i = 0; i < plain.length; i += 1) {
    const ch = plain.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const combined = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return `idb_${combined.toString(36)}`;
}

export function generateId(prefix = 'id'): string {
  const rand = Math.random().toString(36).slice(2, 8);
  const ts = Date.now().toString(36);
  return `${prefix}_${ts}_${rand}`;
}

export function padSeq(seq: number, digits = 4): string {
  return String(seq).padStart(digits, '0');
}

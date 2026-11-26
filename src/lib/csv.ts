import { CustomerType } from '../types/erp';

export function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  let str = String(value);
  // Neutralize spreadsheet formula injection (=, +, -, @, tab, CR) on non-numeric strings
  const isPureNumber = typeof value === 'number' || /^-?\d+(\.\d+)?$/.test(str.trim());
  if (!isPureNumber && /^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>): string {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const dataLines = rows.map((row) => row.map(escapeCsvCell).join(','));
  return [headerLine, ...dataLines].join('\r\n');
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>
): void {
  const csvContent = `\uFEFF${toCsv(headers, rows)}`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * RFC-4180 CSV parser supporting quoted fields, escaped quotes (""), and CRLF/LF.
 */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(cell.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
      i += 1;
    } else if (ch === '\n' || ch === '\r') {
      row.push(cell.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell.trim());
    if (row.some((c) => c !== '')) rows.push(row);
  }

  return rows;
}

export interface CsvProductRow {
  sku: string;
  name: string;
  category: string;
  unit: string;
  costPrice: number;
  sellPrice: number;
  stock: number;
  minStock: number;
  description?: string;
}

export interface CsvProductParseResult {
  valid: CsvProductRow[];
  errors: string[];
}

export const PRODUCT_CSV_HEADERS = [
  'sku',
  'name',
  'category',
  'unit',
  'costPrice',
  'sellPrice',
  'stock',
  'minStock',
  'description',
];

function parseFlexibleNumber(raw: string): number {
  const trimmed = raw.trim().replace(/^rp\.?\s*/i, '');
  if (!trimmed) return 0;
  // Treat Indonesian dot-grouped thousands (e.g. 125.000 or 1.250.000) as integers
  if (/^-?\d{1,3}(\.\d{3})+$/.test(trimmed)) {
    return Number(trimmed.replace(/\./g, ''));
  }
  return Number(trimmed.replace(/[^\d.-]/g, ''));
}

export function parseProductsCsv(text: string): CsvProductParseResult {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return {
      valid: [],
      errors: ['File CSV kosong atau tidak memiliki baris data (minimal header + 1 baris).'],
    };
  }

  const headerMap = new Map<string, number>();
  rows[0].forEach((col, idx) => {
    headerMap.set(col.toLowerCase().replace(/[^a-z0-9]/g, ''), idx);
  });

  const getCol = (r: string[], ...aliases: string[]): string => {
    for (const a of aliases) {
      const idx = headerMap.get(a.toLowerCase().replace(/[^a-z0-9]/g, ''));
      if (idx !== undefined && r[idx] !== undefined) return r[idx];
    }
    return '';
  };

  const valid: CsvProductRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i];
    const lineNo = i + 1;
    const sku = getCol(r, 'sku', 'kodesku', 'kodebarang', 'kode').toUpperCase();
    const name = getCol(r, 'name', 'namaproduk', 'namabarang', 'produk');
    const category = getCol(r, 'category', 'kategori') || 'Tembakau Flavour';
    const unit = getCol(r, 'unit', 'satuan') || 'Kg';
    const costRaw = getCol(r, 'costprice', 'hpp', 'hargabeli');
    const sellRaw = getCol(r, 'sellprice', 'hargajual', 'harga');
    const stockRaw = getCol(r, 'stock', 'stok') || '0';
    const minStockRaw = getCol(r, 'minstock', 'stokminimum', 'minstok') || '0';
    const description = getCol(r, 'description', 'deskripsi', 'catatan');

    const costPrice = parseFlexibleNumber(costRaw);
    const sellPrice = parseFlexibleNumber(sellRaw);
    const stock = parseFlexibleNumber(stockRaw);
    const minStock = parseFlexibleNumber(minStockRaw);

    if (!sku || !name) {
      errors.push(`Baris ${lineNo}: SKU dan Nama Produk wajib diisi.`);
      continue;
    }
    if (!Number.isFinite(costPrice) || costPrice < 0) {
      errors.push(`Baris ${lineNo} (${sku}): Harga Beli/HPP tidak valid.`);
      continue;
    }
    if (!Number.isFinite(sellPrice) || sellPrice <= 0) {
      errors.push(`Baris ${lineNo} (${sku}): Harga Jual harus > 0.`);
      continue;
    }
    if (!Number.isFinite(stock) || stock < 0) {
      errors.push(`Baris ${lineNo} (${sku}): Stok harus angka >= 0.`);
      continue;
    }
    if (!Number.isFinite(minStock) || minStock < 0) {
      errors.push(`Baris ${lineNo} (${sku}): Stok Minimum harus angka >= 0.`);
      continue;
    }

    valid.push({
      sku,
      name,
      category,
      unit,
      costPrice: Math.round(costPrice),
      sellPrice: Math.round(sellPrice),
      stock: Math.round(stock * 1000) / 1000,
      minStock: Math.round(minStock * 1000) / 1000,
      description: description || undefined,
    });
  }

  return { valid, errors };
}

export function normalizeCustomerType(val: string): CustomerType {
  const upper = val.toUpperCase();
  if (upper === 'GROSIR' || upper === 'DISTRIBUTOR') return upper;
  return 'RETAIL';
}

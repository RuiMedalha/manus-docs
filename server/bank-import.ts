export type CsvMapping = {
  date: string;
  description: string;
  amount?: string | null;
  debit?: string | null;
  credit?: string | null;
  balance?: string | null;
  reference?: string | null;
};

export type NormalizedTransaction = {
  transactionDate: string;
  description: string;
  amountCents: number;
  balanceCents: number | null;
  reference: string | null;
  rawRow: Record<string, string>;
};

export function detectDelimiter(content: string) {
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  return (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
}

export function parseCsv(content: string) {
  const delimiter = detectDelimiter(content);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === delimiter && !quoted) { row.push(cell.trim()); cell = ""; continue; }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(value => value.length > 0)) rows.push(row);
      row = []; cell = ""; continue;
    }
    cell += char;
  }
  row.push(cell.trim());
  if (row.some(value => value.length > 0)) rows.push(row);
  if (!rows.length) return { headers: [] as string[], records: [] as Record<string, string>[] };
  const headers = rows[0].map((header, index) => header || `Coluna ${index + 1}`);
  const records = rows.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
  return { headers, records };
}

export function parseAmount(value: string | undefined | null, decimalSeparator: "virgula" | "ponto") {
  if (!value?.trim()) return null;
  const trimmed = value.trim().replace(/\s/g, "");
  const negative = /^\(.*\)$/.test(trimmed) || trimmed.startsWith("-");
  const unsigned = trimmed.replace(/[()\-€$]/g, "");
  const normalized = decimalSeparator === "virgula"
    ? unsigned.replace(/\./g, "").replace(",", ".")
    : unsigned.replace(/,/g, "");
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return null;
  return (negative ? -1 : 1) * Math.round(amount * 100);
}

export function parseBankDate(value: string | undefined | null, format: string) {
  if (!value?.trim()) return null;
  const text = value.trim();
  if (format === "YYYY-MM-DD") return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
  const parts = text.split(/[\/.\-]/);
  if (parts.length !== 3) return null;
  const [first, second, third] = parts.map(Number);
  const year = format.startsWith("YYYY") ? first : third;
  const month = format.startsWith("YYYY") ? second : second;
  const day = format.startsWith("YYYY") ? third : first;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normaliseBankRows(input: {
  records: Record<string, string>[];
  mapping: CsvMapping;
  dateFormat: string;
  decimalSeparator: "virgula" | "ponto";
}) {
  const transactions: NormalizedTransaction[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  input.records.forEach((record, index) => {
    const transactionDate = parseBankDate(record[input.mapping.date], input.dateFormat);
    const description = record[input.mapping.description]?.trim();
    const amount = input.mapping.amount ? parseAmount(record[input.mapping.amount], input.decimalSeparator) : null;
    const debit = input.mapping.debit ? parseAmount(record[input.mapping.debit], input.decimalSeparator) : null;
    const credit = input.mapping.credit ? parseAmount(record[input.mapping.credit], input.decimalSeparator) : null;
    const amountCents = amount ?? ((credit ?? 0) - Math.abs(debit ?? 0));
    if (!transactionDate) { errors.push({ row: index + 2, message: "Data inválida" }); return; }
    if (!description) { errors.push({ row: index + 2, message: "Descrição obrigatória" }); return; }
    if (amount === null && debit === null && credit === null) { errors.push({ row: index + 2, message: "Valor inválido" }); return; }
    transactions.push({
      transactionDate,
      description,
      amountCents,
      balanceCents: input.mapping.balance ? parseAmount(record[input.mapping.balance], input.decimalSeparator) : null,
      reference: input.mapping.reference ? record[input.mapping.reference]?.trim() || null : null,
      rawRow: record,
    });
  });
  return { transactions, errors };
}

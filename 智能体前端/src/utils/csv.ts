function neutralizeSpreadsheetFormula(value: string): string {
  return /^[\t\r\n ]*[=+\-@]/.test(value) ? `'${value}` : value;
}

export function csvCell(value: unknown): string {
  const safeValue = neutralizeSpreadsheetFormula(String(value ?? ''));
  return `"${safeValue.replace(/"/g, '""')}"`;
}

export function createCsv(rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
}

export function downloadCsv(filename, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;

  const headers = Object.keys(rows[0]);
  const escapeCell = (value) => {
    if (value == null) return '';
    const text = String(value).replace(/\r?\n|\r/g, ' ');
    return `"${text.replace(/"/g, '""')}"`;
  };

  const csv = [
    headers.map(escapeCell).join(','),
    ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(',')),
  ].join('\r\n');

  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

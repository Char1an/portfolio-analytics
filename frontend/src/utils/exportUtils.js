import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── CSV ────────────────────────────────────────────────────────
export function exportCSV(rows, headers, filename) {
  const escape = (v) => {
    const s = v == null ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [headers.map(escape).join(',')];
  rows.forEach(row => lines.push(row.map(escape).join(',')));
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename);
}

// ── Portfolio + transactions XLSX (one-click "download my data") ──
// Uses a single multi-sheet XLSX so browsers don't block the second file.
export function exportPortfolioXLSX(portfolio) {
  const stamp = new Date().toISOString().slice(0, 10);
  if (!portfolio || portfolio.length === 0) return;

  const holdingsSheet = {
    name: 'Holdings',
    headers: ['scheme_code', 'name', 'category', 'plan_type', 'investment_amount', 'monthly_sip', 'purchase_date', 'transaction_count'],
    rows: portfolio.map(f => [
      f.scheme_code,
      f.name || '',
      f.category || '',
      f.plan_type || 'Direct',
      f.investment_amount || 0,
      f.monthly_sip || 0,
      f.purchase_date || '',
      (f.transactions || []).length,
    ]),
  };

  const txnRows = portfolio.flatMap(f =>
    (f.transactions || []).map(t => [
      f.scheme_code, f.name || '', t.date, t.type, t.amount, t.note || '',
    ])
  );

  const sheets = [holdingsSheet];
  if (txnRows.length > 0) {
    sheets.push({
      name: 'Transactions',
      headers: ['scheme_code', 'fund_name', 'date', 'type', 'amount', 'note'],
      rows: txnRows,
    });
  }

  exportExcel(sheets, `folio-klarity-portfolio-${stamp}.xlsx`);
}

// Backwards-compat alias — some callers may still import the old name.
export const exportPortfolioCSV = exportPortfolioXLSX;

// ── Excel (multi-sheet) ────────────────────────────────────────
// sheets: [{ name, headers, rows }]
export function exportExcel(sheets, filename) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(({ name, headers, rows }) => {
    const data = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Column widths — auto-fit based on max content length
    const colWidths = headers.map((h, ci) => {
      const maxLen = Math.max(
        h.length,
        ...rows.map(r => (r[ci] == null ? 0 : String(r[ci]).length))
      );
      return { wch: Math.min(maxLen + 2, 40) };
    });
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, name);
  });
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([buf], { type: 'application/octet-stream' }), filename);
}

// ── PDF ────────────────────────────────────────────────────────
// sections: [{ title, subtitle?, headers, rows, footerRow? }]
export function exportPDF(sections, filename, reportTitle = 'Portfolio Report') {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const now = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  // Cover header
  doc.setFillColor(6, 9, 26);
  doc.rect(0, 0, pageWidth, 52, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(reportTitle, 36, 28);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(160, 160, 180);
  doc.text(`Generated on ${now} · For informational purposes only · Consult a SEBI-registered advisor`, 36, 44);

  let y = 66;

  sections.forEach((section, si) => {
    if (si > 0) {
      doc.addPage();
      // Repeat header on subsequent pages
      doc.setFillColor(6, 9, 26);
      doc.rect(0, 0, pageWidth, 36, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(reportTitle, 36, 22);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(160, 160, 180);
      doc.text(now, pageWidth - 36, 22, { align: 'right' });
      y = 50;
    }

    // Section title
    doc.setTextColor(30, 30, 50);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(section.title, 36, y);
    y += 14;

    if (section.subtitle) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 120);
      doc.text(section.subtitle, 36, y);
      y += 12;
    }

    // Table
    const bodyRows = section.rows.map(row =>
      row.map(cell => (cell == null ? '—' : String(cell)))
    );

    autoTable(doc, {
      startY: y,
      head: [section.headers],
      body: bodyRows,
      foot: section.footerRow ? [section.footerRow.map(c => (c == null ? '' : String(c)))] : undefined,
      margin: { left: 36, right: 36 },
      styles: { fontSize: 8, cellPadding: 5, overflow: 'linebreak' },
      headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [30, 30, 50], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 246, 252] },
      tableLineColor: [220, 220, 230],
      tableLineWidth: 0.3,
    });

    y = doc.lastAutoTable.finalY + 20;
  });

  // Footer on last page
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 180);
    doc.text(
      `Page ${i} of ${pageCount} · This report is for personal use only and does not constitute investment advice.`,
      pageWidth / 2, doc.internal.pageSize.getHeight() - 14,
      { align: 'center' }
    );
  }

  doc.save(filename);
}

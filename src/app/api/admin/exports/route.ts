import { z } from "zod";
import ExcelJS from "exceljs";
import { requireCompanyStaff, route } from "@/lib/api";
import { exportRows, logExport, recentExports } from "@/lib/company";

const Opts = z.object({
  period: z.string().regex(/^\d{4}-(W\d{2}|\d{2})$/),
  format: z.enum(["csv", "xlsx", "afas", "nmbrs", "loket", "json"]),
  grouping: z.enum(["registration", "day", "period"]),
  ids: z.boolean().default(true),
  corrections: z.boolean().default(false),
  overtime: z.boolean().default(false),
  approvedOnly: z.boolean().default(false),
});

export const GET = route(async () => ({ recent: await recentExports(await requireCompanyStaff()) }));

/**
 * POST opts → the file. POST ?preview=1 → {header, rows (first 8), total, fileName, unapproved…}.
 * AFAS / Nmbrs / Loket.nl are semicolon CSVs in the generic layout until their import mappings are verified.
 */
export const POST = route(async (req) => {
  const user = await requireCompanyStaff();
  const opts = Opts.parse(await req.json());
  const out = await exportRows(user, opts);
  if (new URL(req.url).searchParams.get("preview")) {
    return { header: out.header, rows: out.rows.slice(0, 8), total: out.rows.length, fileName: out.fileName, unapproved: out.unapproved, unapprovedExcluded: out.unapprovedExcluded };
  }
  await logExport(user, opts, out.fileName, out.rows.length);
  const disposition = `attachment; filename="${out.fileName}"`;
  if (opts.format === "json") {
    const items = out.rows.map((r) => Object.fromEntries(out.header.map((h, i) => [h, r[i]])));
    return new Response(JSON.stringify({ period: opts.period, grouping: opts.grouping, items }, null, 2), { headers: { "content-type": "application/json", "content-disposition": disposition } });
  }
  if (opts.format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Hours");
    ws.addRow(out.header).font = { bold: true };
    out.rows.forEach((r) => ws.addRow(r));
    ws.columns.forEach((c) => { c.width = 16; });
    const buf = await wb.xlsx.writeBuffer();
    return new Response(buf as ArrayBuffer, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": disposition } });
  }
  const cell = (v: string | number) => {
    const s = typeof v === "number" ? String(v).replace(".", ",") : v;
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "\uFEFF" + [out.header, ...out.rows].map((r) => r.map(cell).join(";")).join("\r\n");
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": disposition } });
});

import PDFDocument from "pdfkit";
import type { Prospectus } from "./types";

const PAGE_MARGIN = 28;
const PAD = 5;
const LABEL_SIZE = 7.5;
const VALUE_SIZE = 9;
const BORDER = 0.9;
const GAP = 6;

// The prospectus is always a single A4 page. Every section below has a fixed
// height, and the menu cell absorbs whatever vertical space is left over. Text
// that would not fit is scaled down rather than pushed to a second page.
const H_HEADER = 46;
const H_TITLE = 22;
const H_EVENT = 34;
const H_MONEY = 64;
const H_BOARD = 50;
const H_CHARGES = 62;
const H_BILLING = 50;
const H_DEPT_TITLE = 18;
const H_DEPT = 68;
const H_TIMESTAMP = 24;

const MIN_SCALE = 0.3;

interface Block {
  label?: string;
  value?: string;
}
interface Cell {
  width: number; // fraction of the content width
  blocks: Block[];
  align?: "left" | "center" | "right";
  noBorder?: boolean;
}

type Doc = PDFKit.PDFDocument;

/** Height a cell needs at a given font scale. */
function measureCell(doc: Doc, cell: Cell, width: number, scale: number) {
  const inner = width - PAD * 2;
  let height = PAD * 2;

  cell.blocks.forEach((block, i) => {
    if (block.label) {
      doc.font("Helvetica-Bold").fontSize(LABEL_SIZE * scale);
      height += doc.heightOfString(block.label, { width: inner }) + 1.5;
    }
    doc.font("Helvetica").fontSize(VALUE_SIZE * scale);
    height += doc.heightOfString(block.value || " ", { width: inner });
    if (i < cell.blocks.length - 1) height += 5 * scale;
  });

  return height;
}

/**
 * Largest font scale (<= 1) at which the cell fits its fixed height. Long
 * menus shrink instead of overflowing, which keeps the sheet to one page.
 */
function fitScale(doc: Doc, cell: Cell, width: number, height: number) {
  let scale = 1;
  while (scale > MIN_SCALE && measureCell(doc, cell, width, scale) > height) {
    scale -= 0.02;
  }
  return Math.max(scale, MIN_SCALE);
}

/** Draws one fixed-height bordered row. Never paginates. */
function drawRow(doc: Doc, cells: Cell[], y: number, height: number) {
  const contentWidth = doc.page.width - PAGE_MARGIN * 2;
  const widths = cells.map((c) => c.width * contentWidth);

  let x = PAGE_MARGIN;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const w = widths[i];

    if (!cell.noBorder) {
      doc.lineWidth(BORDER).rect(x, y, w, height).stroke("#000");
    }

    const scale = fitScale(doc, cell, w, height);
    const inner = w - PAD * 2;

    // Clip so nothing can bleed past the cell even at the minimum scale.
    doc.save();
    doc.rect(x, y, w, height).clip();

    const bottom = y + height - PAD;
    let ty = y + PAD;

    for (const block of cell.blocks) {
      if (ty >= bottom) break;

      if (block.label) {
        doc
          .font("Helvetica-Bold")
          .fontSize(LABEL_SIZE * scale)
          .fillColor("#000")
          // An explicit height stops PDFKit from spilling onto a new page.
          .text(block.label, x + PAD, ty, {
            width: inner,
            height: bottom - ty,
            align: cell.align || "left",
          });
        ty = doc.y + 1.5;
      }
      if (ty >= bottom) break;

      doc
        .font("Helvetica")
        .fontSize(VALUE_SIZE * scale)
        .fillColor("#000")
        .text(block.value || " ", x + PAD, ty, {
          width: inner,
          height: bottom - ty,
          align: cell.align || "left",
        });
      ty = doc.y + 5 * scale;
    }

    doc.restore();
    x += w;
  }

  return y + height;
}

function list(values: string[] | null | undefined) {
  return values && values.length ? values.join(", ") : "—";
}

function text(value: string | null | undefined) {
  const v = (value || "").trim();
  return v.length ? v : "—";
}

function formatDate(value: string | Date) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

export function renderProspectusPdf(record: Prospectus): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const usableHeight = doc.page.height - PAGE_MARGIN * 2;
    const fixedHeight =
      H_HEADER +
      H_TITLE +
      H_EVENT +
      GAP * 6 +
      H_MONEY +
      H_BOARD +
      H_CHARGES +
      H_BILLING +
      H_DEPT_TITLE +
      H_DEPT +
      H_TIMESTAMP;
    const menuHeight = usableHeight - fixedHeight;

    let y = PAGE_MARGIN;

    // Masthead — mirrors the borderless header table on the web form.
    y = drawRow(
      doc,
      [
        {
          width: 0.33,
          noBorder: true,
          blocks: [
            { label: "Reservation No", value: text(record.reservation_no) },
            { label: "Submitted By", value: text(record.submitted_by) },
          ],
        },
        { width: 0.34, noBorder: true, align: "center", blocks: [{ value: "PABLO" }] },
        { width: 0.33, noBorder: true, align: "right", blocks: [{ label: "PABLO FP / SR", value: record.fp_no }] },
      ],
      y,
      H_HEADER
    );

    doc
      .font("Helvetica-Bold")
      .fontSize(13)
      .fillColor("#000")
      .text("PABLO FUNCTION PROSPECTUS", PAGE_MARGIN, y + 4, {
        width: doc.page.width - PAGE_MARGIN * 2,
        align: "center",
        characterSpacing: 1,
      });
    y += H_TITLE;

    y = drawRow(
      doc,
      [
        { width: 0.17, blocks: [{ label: "Date", value: formatDate(record.event_date) }] },
        { width: 0.21, blocks: [{ label: "Time", value: text(record.time_slot) }] },
        { width: 0.17, blocks: [{ label: "Type of Function", value: text(record.function_type) }] },
        { width: 0.17, blocks: [{ label: "Venue", value: text(record.venue) }] },
        { width: 0.13, blocks: [{ label: "MG", value: text(record.mg) }] },
        { width: 0.15, blocks: [{ label: "Expected Pax", value: text(record.expected_pax) }] },
      ],
      y,
      H_EVENT
    );

    y += GAP;
    y = drawRow(
      doc,
      [
        { width: 0.45, blocks: [{ label: "MENU", value: text(record.menu) }] },
        {
          width: 0.55,
          blocks: [
            { label: "Name of Party", value: text(record.party_name) },
            { label: "Company Name", value: text(record.company_name) },
            { label: "GST No", value: text(record.gst_no) },
            { label: "PAN No", value: text(record.pan_no) },
            { label: "Address", value: text(record.address) },
            { label: "Contact Person", value: text(record.contact_person) },
            { label: "Telephone / Mobile", value: text(record.mobile) },
            { label: "Email", value: text(record.email) },
            { label: "Seating Arrangement", value: text(record.seating) },
            { label: "Add on Rooms", value: text(record.add_rooms) },
          ],
        },
      ],
      y,
      menuHeight
    );

    y += GAP;
    y = drawRow(
      doc,
      [
        { width: 0.2, blocks: [{ label: "Rate", value: text(record.rate) }] },
        { width: 0.2, blocks: [{ label: "Hall Rent", value: text(record.hall_rent) }] },
        { width: 0.25, blocks: [{ label: "Mode of Payment", value: list(record.payment) }] },
        {
          width: 0.35,
          blocks: [
            { label: "Advance Amt", value: text(record.advance) },
            { label: "Transaction Details", value: text(record.transaction_details) },
          ],
        },
      ],
      y,
      H_MONEY
    );

    y += GAP;
    y = drawRow(doc, [{ width: 1, blocks: [{ label: "BOARD TO READ", value: text(record.board_text) }] }], y, H_BOARD);

    y += GAP;
    y = drawRow(
      doc,
      [
        {
          width: 1,
          blocks: [
            { label: "OTHER CHARGES (ALCOHOL / DJ / AV / OTHER)", value: list(record.other_charges) },
            { label: "Details / Amount", value: text(record.other_charges_notes) },
          ],
        },
      ],
      y,
      H_CHARGES
    );

    y += GAP;
    y = drawRow(doc, [{ width: 1, blocks: [{ label: "BILLING INSTRUCTION", value: text(record.billing) }] }], y, H_BILLING);

    y += GAP;
    y = drawRow(doc, [{ width: 1, align: "center", blocks: [{ value: "DEPARTMENT INSTRUCTION" }] }], y, H_DEPT_TITLE);
    y = drawRow(
      doc,
      [
        { width: 1 / 3, blocks: [{ label: "Housekeeping", value: text(record.housekeeping) }] },
        { width: 1 / 3, blocks: [{ label: "F&B", value: text(record.fnb) }] },
        { width: 1 / 3, blocks: [{ label: "Kitchen", value: text(record.kitchen) }] },
      ],
      y,
      H_DEPT
    );

    doc.lineWidth(1.4).moveTo(PAGE_MARGIN, y + 6).lineTo(doc.page.width - PAGE_MARGIN, y + 6).stroke("#000");
    doc
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .fillColor("#000")
      .text(`Timestamp: ${record.generated_at || ""}`, PAGE_MARGIN, y + 12, {
        width: doc.page.width - PAGE_MARGIN * 2,
        align: "right",
      });

    doc.end();
  });
}

export function pdfFilename(record: Prospectus) {
  const safeParty = (record.party_name || "party").replace(/[^a-z0-9]+/gi, "-").slice(0, 40);
  return `${record.fp_no.replace(/[^a-z0-9]+/gi, "-")}-${safeParty}.pdf`;
}

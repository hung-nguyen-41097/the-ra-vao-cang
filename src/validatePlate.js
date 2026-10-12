/**
 * Validate biển số xe Việt Nam — STRICT, không chuẩn hoá.
 *
 * Định dạng chuẩn: [2 số mã tỉnh][seri]-[số thứ tự]
 *   - Số thứ tự: 4 số "1234" hoặc 5 số có dấu chấm "123.45"
 *   - Chữ in hoa, không khoảng trắng, đúng một dấu gạch "-" ngay sau seri
 *
 * Ô tô   seri = 1–2 chữ                          51H-1234, 72A-123.45, 29LD-123.45
 * Xe máy seri = 1–2 chữ | 1 chữ + 1 số | MĐ + 1 số
 *                                                72C1-095.36, 72AC-197.52,
 *                                                72A-811.44, 72MĐ2-012.04, 76K3-2840
 *
 * validatePlate(plate, type) trả về:
 *   { valid: boolean, errors: string[], suggestion: string | null }
 *   - errors: mô tả chính xác từng lỗi
 *   - suggestion: dạng đúng nếu suy ra được chắc chắn, ngược lại null
 */

const SERIAL = "-(?:\\d{4}|\\d{3}\\.\\d{2})";
const SERI = {
  car: "[A-Z]{2}|[A-Z]",
  moto: "MĐ\\d|[A-Z]\\d|[A-Z]{2}|[A-Z]",
};
export const PATTERNS = {
  car: new RegExp(`^\\d{2}(?:${SERI.car})${SERIAL}$`),
  moto: new RegExp(`^\\d{2}(?:${SERI.moto})${SERIAL}$`),
};

const q = (s) => `"${s}"`;

function describeSeparator(sep, where) {
  const errs = [];
  const spaces = (sep.match(/\s/g) || []).length;
  const dashes = (sep.match(/-/g) || []).length;
  if (spaces) errs.push(`Thừa ${spaces} khoảng trắng ${where}`);
  return { errs, dashes };
}

export function validatePlate(plate, type) {
  if (!PATTERNS[type]) throw new Error(`type phải là "moto" hoặc "car", nhận được: ${type}`);
  if (typeof plate !== "string" || plate.length === 0) {
    return { valid: false, errors: ["Biển số trống"], suggestion: null };
  }
  if (PATTERNS[type].test(plate)) return { valid: true, errors: [], suggestion: null };

  const errors = [];

  // Khoảng trắng đầu/cuối
  const lead = plate.match(/^\s*/)[0].length;
  const trail = plate.match(/\s*$/)[0].length;
  if (lead) errors.push(`Thừa ${lead} khoảng trắng ở đầu`);
  if (trail) errors.push(`Thừa ${trail} khoảng trắng ở cuối`);
  const body = plate.trim();

  // Chữ thường
  const lower = body.match(/[a-zđ]/g);
  if (lower) errors.push(`Có chữ thường ${lower.map(q).join(", ")} (phải viết hoa)`);
  const up = body.toUpperCase();

  // Tách: [mã tỉnh][sep1][seri][sep2][số thứ tự]
  const m = up.match(new RegExp(`^(\\d{2})([\\s.\\-]*)(${SERI[type]})([\\s.\\-]*)(\\d[\\d\\s.,]*)$`));

  if (m) {
    const [, prov, sep1, seri, sep2, numRaw] = m;

    // Giữa mã tỉnh và seri: không được có gì
    if (sep1) {
      const { errs, dashes } = describeSeparator(sep1, "giữa mã tỉnh và seri");
      errors.push(...errs);
      if (dashes) errors.push(`Thừa dấu gạch giữa mã tỉnh và seri (${q(prov + sep1 + seri)} → ${q(prov + seri)})`);
      if (sep1.includes(".")) errors.push("Thừa dấu chấm giữa mã tỉnh và seri");
    }

    // Giữa seri và số: đúng một dấu "-"
    const { errs, dashes } = describeSeparator(sep2, "giữa seri và số thứ tự");
    errors.push(...errs);
    if (dashes === 0) errors.push(`Thiếu dấu gạch "-" sau seri ${q(seri)}`);
    if (dashes > 1) errors.push(`Có ${dashes} dấu gạch sau seri (chỉ được 1)`);
    if (sep2.includes(".")) errors.push("Dùng dấu chấm thay dấu gạch sau seri");

    // Số thứ tự
    const numSpaces = (numRaw.match(/\s/g) || []).length;
    if (numSpaces) errors.push(`Thừa ${numSpaces} khoảng trắng trong số thứ tự`);
    if (numRaw.includes(",")) errors.push('Dùng dấu phẩy "," thay dấu chấm "."');
    const digits = numRaw.replace(/\D/g, "");
    const num = numRaw.replace(/\s/g, "").replace(/,/g, ".");

    let fixedNum = null;
    if (digits.length === 5) {
      fixedNum = `${digits.slice(0, 3)}.${digits.slice(3)}`;
      if (!num.includes(".")) errors.push(`Số thứ tự 5 chữ số thiếu dấu chấm (${q(digits)} → ${q(fixedNum)})`);
      else if (num !== fixedNum) errors.push(`Dấu chấm sai vị trí (${q(num)} → ${q(fixedNum)})`);
    } else if (digits.length === 4) {
      fixedNum = digits;
      if (num.includes(".")) errors.push(`Số thứ tự 4 chữ số không được có dấu chấm (${q(num)} → ${q(digits)})`);
    } else {
      errors.push(`Số thứ tự có ${digits.length} chữ số (phải là 4 hoặc 5)`);
    }

    const suggestion = fixedNum ? `${prov}${seri}-${fixedNum}` : null;
    return { valid: false, errors, suggestion };
  }

  // Seri bị đặt sau phần số: 72-847H6, 72.557Y
  const r = up.match(/^(\d{2})([\s.-]*)(\d+)([\s.-]*)([A-ZĐ]{1,2}\d?)$/);
  if (r) {
    const [, , sep1, numPart, , seri] = r;
    errors.push(`Seri ${q(seri)} bị đặt sau số thứ tự (phải đứng ngay sau mã tỉnh)`);
    if (numPart.length !== 4 && numPart.length !== 5) {
      errors.push(`Số thứ tự chỉ có ${numPart.length} chữ số ${q(numPart)} (phải là 4 hoặc 5)`);
    }
    if (sep1.includes(".")) errors.push('Dùng dấu chấm "." thay dấu gạch "-" sau mã tỉnh');
    const sp = (body.match(/\s/g) || []).length;
    if (sp) errors.push(`Thừa ${sp} khoảng trắng ở giữa`);
    return { valid: false, errors, suggestion: null };
  }

  if (!/^\d{2}/.test(up)) errors.push("Không bắt đầu bằng 2 chữ số mã tỉnh");
  errors.push(type === "car"
    ? "Seri không hợp lệ cho ô tô (phải là 1–2 chữ cái)"
    : "Không nhận dạng được seri/số thứ tự");
  return { valid: false, errors, suggestion: null };
}

export const isValidMotoPlate = (plate) => validatePlate(plate, "moto").valid;
export const isValidCarPlate = (plate) => validatePlate(plate, "car").valid;

/**
 * Độ dài ký tự tối đa của các trường in trên thẻ.
 *
 * validateFieldLength(value, field) trả về:
 *   { valid: boolean, errors: string[] }
 */
export const FIELD_MAX_LENGTH = {
  hoten: 19,
  chucvu: 21,
  donvi: 20,
};

export const FIELD_LABELS = {
  hoten: "Tên",
  chucvu: "Chức danh",
  donvi: "Đơn vị",
  soxe: "Số xe",
};

// Đếm theo ký tự hiển thị (NFC) để chữ có dấu chỉ tính 1 ký tự
const textLength = (s) => [...s.normalize("NFC")].length;

export function validateFieldLength(value, field) {
  const max = FIELD_MAX_LENGTH[field];
  if (max == null) throw new Error(`Không có giới hạn độ dài cho trường: ${field}`);
  const text = value == null ? "" : String(value).trim();
  const len = textLength(text);
  if (len > max) {
    return {
      valid: false,
      errors: [`${FIELD_LABELS[field]} dài ${len} ký tự (tối đa ${max}, thừa ${len - max})`],
    };
  }
  return { valid: true, errors: [] };
}

/**
 * Kiểm tra một dòng dữ liệu thẻ: độ dài Tên / Chức danh / Đơn vị và biển số.
 * type: "moto" | "car"
 *
 * validateRecord(record, type) trả về:
 *   { valid: boolean, fields: { [field]: { valid, errors, suggestion? } } }
 */
export function validateRecord(record, type) {
  const fields = {};
  for (const field of Object.keys(FIELD_MAX_LENGTH)) {
    fields[field] = validateFieldLength(record[field], field);
  }
  if (!String(record.hoten ?? "").trim()) {
    fields.hoten = { valid: false, errors: ["Tên trống"] };
  }
  fields.soxe = validatePlate(record.soxe == null ? "" : String(record.soxe), type);
  return { valid: Object.values(fields).every((f) => f.valid), fields };
}

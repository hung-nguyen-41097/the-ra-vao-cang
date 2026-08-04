import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { saveAs } from "file-saver";
import ImageModule from "docxtemplater-image-module-free";

// ---------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------

const defaultMotorbikeData = [
  "Nguyễn Văn An | 012345678901 | Nhân viên | PVC MS | 72A-123.45 | 28/07/2026 | https://drive.google.com/file/d/1WpaPcQhgykyT7P9fxSbuJBPbUOsolfg1/view?usp=sharing | https://drive.google.com/file/d/19TW8MO0vSs_NPFczYtk7bXMs9cXh57ny/view?usp=sharing",
  "Trần Thị Bích | 098765432109 | Nhân viên | PVC MS | 51B-987.65 | 28/07/2026 | https://drive.google.com/file/d/1CuWC6MooPed8ICeyYAGcqc5LNadnv00K/view?usp=sharing | https://drive.google.com/file/d/1xMzxeKW_ck-cSlSpE15CiKfvgly2fXpC/view?usp=sharing",
  "Lê Hoàng Cường | 035189001234 | Nhân viên | Logistics Vietnam | 60C-456.78 | 29/07/2026 | https://drive.google.com/file/d/1CuWC6MooPed8ICeyYAGcqc5LNadnv00K/view?usp=sharing | https://drive.google.com/file/d/1Om0J8ZKEfHHzenYz8kE7YeOIMLrNM3-I/view?usp=sharing",
];

const defaultCarData = [
  "Nguyễn Văn An | Nhân viên | PVC MS | 72C-888.99 | Ford Ranger | 0912345678 | 29/07/2026 | https://drive.google.com/file/d/1WpaPcQhgykyT7P9fxSbuJBPbUOsolfg1/view?usp=sharing",
  "Trần Thị Bích | Nhân viên | PVC MS | 70A-333.22 | Mazda CX5 | 0987654321 | 30/07/2026 | https://drive.google.com/file/d/1WpaPcQhgykyT7P9fxSbuJBPbUOsolfg1/view?usp=sharing",
];

const EMPTY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5lZ2kAAAAASUVORK5CYII=";
const EMPTY_PNG_BUFFER = Uint8Array.from(atob(EMPTY_PNG_BASE64), (c) =>
  c.charCodeAt(0),
).buffer;

const VEHICLE_CONFIG = {
  motorbike: {
    label: "Xe máy",
    sheetName: "Danh sách Xe máy",
    templateUrl: "/template-motorbike.docx",
    outputFilename: "Danh_Sach_The_Xe_May.docx",
    hasImages: true,
    // Column order in the textarea / Excel sheet
    columns: [
      "hoten",
      "cccd",
      "chucvu",
      "donvi",
      "soxe",
      "ngay",
      "qrCode", // Link hình người và xe -> {%qrCode}
      "idPhotoLink", // Link hình ảnh thẻ (chỉ người) -> {%idphoto}
    ],
    placeholder:
      "Họ tên | CCCD | Chức vụ | Đơn vị | Số xe | Ngày | Link hình người và xe | Link hình ảnh thẻ (chỉ người)...",
  },
  car: {
    label: "Xe ô tô",
    sheetName: "Danh sách xe ô tô",
    templateUrl: "/template-car.docx",
    outputFilename: "Danh_Sach_The_Oto.docx",
    hasImages: true,
    columns: [
      "hoten",
      "chucvu",
      "donvi",
      "soxe",
      "hieuxe",
      "sdt",
      "ngay",
      "qrCode",
    ],
    placeholder:
      "Họ tên | Chức vụ | Đơn vị | Số xe | Hiệu xe | Số điện thoại | Ngày | Link hình người và xe...",
  },
};

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function parseLine(line, columns) {
  const parts = line.split("|").map((s) => s.trim());
  const obj = {};
  columns.forEach((col, i) => {
    obj[col] = parts[i] || "";
  });
  return obj;
}

async function fetchQRCodeBuffer(link) {
  if (!link) return EMPTY_PNG_BUFFER;
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
    link,
  )}`;
  const response = await fetch(qrApiUrl);
  if (!response.ok) return EMPTY_PNG_BUFFER;
  return await response.arrayBuffer();
}

function extractGoogleDriveFileId(link) {
  if (!link) return "";
  const fileMatch = link.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
  if (fileMatch) return fileMatch[1];

  const idMatch = link.match(/[?&]id=([^&]+)/i);
  if (idMatch) return idMatch[1];

  return "";
}

function buildGoogleDriveImageUrls(link) {
  const fileId = extractGoogleDriveFileId(link);
  if (!fileId) return [];

  // lh3 endpoint is CORS-friendly in browser and works well for fetch().
  return [
    `https://lh3.googleusercontent.com/d/${fileId}=w800`,
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`,
    `https://drive.usercontent.google.com/download?id=${fileId}&export=download`,
  ];
}

async function fetchImageBuffer(link) {
  if (!link) return EMPTY_PNG_BUFFER;

  const normalizedLink = link.trim();
  const candidates = buildGoogleDriveImageUrls(normalizedLink);
  if (candidates.length === 0) {
    candidates.push(normalizedLink);
  }

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate);
      if (!response.ok) continue;
      return await response.arrayBuffer();
    } catch {
      // Try next candidate URL.
    }
  }

  return EMPTY_PNG_BUFFER;
}

// Build the exact {id}/{hoten}/... object the motorbike template needs
// for one card.
async function buildMotorbikeCard(row, index, startRow = 2) {
  const [qrCode, idphoto] = await Promise.all([
    fetchQRCodeBuffer(row.qrCode),
    fetchImageBuffer(row.idPhotoLink),
  ]);
  let startRowNum = Number.parseInt(startRow, 10);
  return {
    id: String(startRowNum + index).padStart(2, "0"),
    hoten: row.hoten,
    cccd: row.cccd,
    chucvu: row.chucvu,
    donvi: row.donvi,
    soxe: row.soxe,
    ngay: row.ngay,
    qrCode,
    idphoto,
  };
}

// Build the exact {id}/{phone}/{hieuxe}/{so xe}/{donvi}/{ngày} object
// the car template needs for one card. Note the literal-space and
// diacritic keys — they must match the template exactly.
async function buildCarCard(row, index, startRow = 2) {
  const [qrCode] = await Promise.all([fetchQRCodeBuffer(row.qrCode)]);
  let startRowNum = Number.parseInt(startRow, 10);
  return {
    id: String(startRowNum + index).padStart(2, "0"),
    phone: row.sdt,
    hieuxe: row.hieuxe,
    soxe: row.soxe,
    donvi: row.donvi,
    ngày: row.ngay,
    qrCode,
  };
}

// ---------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------

function App() {
  const [activeTab, setActiveTab] = useState("motorbike");
  const [dataText, setDataText] = useState({
    motorbike: defaultMotorbikeData.join("\n"),
    car: defaultCarData.join("\n"),
  });
  const [excelStartRow, setExcelStartRow] = useState({
    motorbike: 2,
    car: 2,
  });
  const [loading, setLoading] = useState({ motorbike: false, car: false });
  const fileInputRef = useRef(null);

  const config = VEHICLE_CONFIG[activeTab];

  const setTabText = (tab, text) =>
    setDataText((prev) => ({ ...prev, [tab]: text }));

  // -------------------------------------------------------------------
  // Word generation
  // -------------------------------------------------------------------

  const generateDocument = async (type) => {
    const cfg = VEHICLE_CONFIG[type];
    try {
      setLoading((prev) => ({ ...prev, [type]: true }));

      const response = await fetch(cfg.templateUrl);
      if (!response.ok) {
        throw new Error(`Không tải được template (${cfg.templateUrl})`);
      }
      const arrayBuffer = await response.arrayBuffer();

      const zip = new PizZip(arrayBuffer);
      const docOptions = { paragraphLoop: true, linebreaks: true };
      if (cfg.hasImages) {
        let size = type === "motorbike" ? [65, 65] : [120, 120];
        docOptions.modules = [
          new ImageModule({
            centered: false,
            getImage: (tagValue) => tagValue,
            getSize: () => size,
          }),
        ];
      }
      const doc = new Docxtemplater(zip, docOptions);

      const lines = dataText[type]
        .trim()
        .split("\n")
        .filter((l) => l.trim());

      const rows = lines.map((line) => parseLine(line, cfg.columns));

      const cards =
        type === "motorbike"
          ? await Promise.all(
              rows.map((row, i) =>
                buildMotorbikeCard(row, i, excelStartRow.motorbike),
              ),
            )
          : await Promise.all(
              rows.map((row, i) => buildCarCard(row, i, excelStartRow.car)),
            );

      if (cards.length === 0) {
        alert("Chưa có dữ liệu để tạo thẻ!");
        return;
      }

      // Template expects: { pages: [ { cards: [...] } ] }
      const data = { pages: [{ cards }] };

      if (cfg.hasImages) {
        await doc.renderAsync(data);
      } else {
        doc.render(data);
      }

      const blob = doc.getZip().generate({
        type: "blob",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      saveAs(blob, cfg.outputFilename);
    } catch (err) {
      console.error(`Error generating ${type} document:`, err);
      if (err.properties && err.properties.errors) {
        console.error(JSON.stringify(err.properties.errors, null, 2));
      }
      alert(
        `Lỗi khi tạo file Word cho ${cfg.label}. Vui lòng kiểm tra lại dữ liệu hoặc template!`,
      );
    } finally {
      setLoading((prev) => ({ ...prev, [type]: false }));
    }
  };

  // -------------------------------------------------------------------
  // Live HTML card preview (per active tab)
  // -------------------------------------------------------------------

  const escapeHtml = (text) => {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  };

  const generateCardsHtml = (text, type, cfg) => {
    const lines = text.trim().split("\n");
    let html = "";
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const row = parseLine(trimmed, cfg.columns);
      const qrLink = row.qrCode;
      const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(
        qrLink || "",
      )}`;

      const infoRows =
        type === "motorbike"
          ? [
              ["Họ tên:", row.hoten],
              ["CCCD:", row.cccd],
              ["Chức vụ:", row.chucvu],
              ["Đơn vị:", row.donvi],
              ["Số xe:", row.soxe],
              ["Ngày:", row.ngay],
            ]
          : [
              ["Họ tên:", row.hoten],
              ["Chức vụ:", row.chucvu],
              ["Đơn vị:", row.donvi],
              ["Số xe:", row.soxe],
              ["Hiệu xe:", row.hieuxe],
              ["Điện thoại:", row.sdt],
              ["Ngày:", row.ngay],
            ];

      html += `
        <div class="card">
          <div class="card-header">
            <h4>CẢNG PSB</h4>
            <span>THẺ RA VÀO CỔNG - ${cfg.label.toUpperCase()}</span>
          </div>
          <div class="card-body">
              <div class="qr-box"><img src="${qrApiUrl}" alt="QR Code" crossorigin="anonymous" /></div>
            <div class="info-box">
              <table>
                <tbody>
                  ${infoRows
                    .map(
                      ([label, value]) =>
                        `<tr><td>${label}</td><td>${escapeHtml(value || "")}</td></tr>`,
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          </div>
          <div class="card-footer">Xuất trình thẻ tại cổng bảo vệ</div>
        </div>
      `;
    });
    return (
      html ||
      '<p style="text-align:center;color:#999;padding:40px;">Không có dữ liệu để tạo thẻ.</p>'
    );
  };

  // -------------------------------------------------------------------
  // Toolbar handlers
  // -------------------------------------------------------------------

  const loadSampleData = () => {
    setDataText({
      motorbike: defaultMotorbikeData.join("\n"),
      car: defaultCarData.join("\n"),
    });
  };

  const downloadTemplate = () => {
    const link = document.createElement("a");
    link.href = "/Mau_The_Ra_Vao_PSB.xlsx";
    link.download = "Mau_The_Ra_Vao_PSB.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Reads BOTH sheets ("Danh sách Xe máy" and "Danh sách xe ô tô") out
  // of a single uploaded workbook and populates both tabs at once,
  // regardless of which tab is currently active.
  const importExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target.result);
        const workbook = XLSX.read(data, { type: "array" });

        const findSheet = (wantedName) =>
          workbook.SheetNames.find(
            (name) => name.trim().toLowerCase() === wantedName.toLowerCase(),
          );

        // Excel column order (per your sheets):
        //  Xe máy:  Họ tên | CCCD | Chức vụ | Đơn vị | Số xe | Hiệu xe | Ngày | Link người+xe | Link ảnh thẻ
        //  Xe ô tô: Họ tên | Chức vụ | Đơn vị | Số xe | Hiệu xe | Số điện thoại | Ngày | Link người+xe
        // These are mapped down to just the fields each template
        // actually uses (see VEHICLE_CONFIG columns above).
        const excelColumnMap = {
          motorbike: (row) => [
            row[0], // hoten
            row[1], // cccd
            row[2], // chucvu
            row[3], // donvi
            row[4], // soxe
            row[6], // ngay
            row[7], // driveLink
            row[8], // idPhotoLink
          ],
          car: (row) => [
            row[0], // hoten
            row[1], // chucvu
            row[2], // donvi
            row[3], // soxe
            row[4], // hieuxe
            row[5], // sdt (Số điện thoại)
            row[6], // ngay
            row[7], // qrCode (Link người+xe)
          ],
        };

        const updates = {};
        let foundAny = false;

        for (const type of Object.keys(VEHICLE_CONFIG)) {
          const cfg = VEHICLE_CONFIG[type];
          const sheetName = findSheet(cfg.sheetName);
          if (!sheetName) continue;

          const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
            header: 1,
          });

          const formattedRows = [];
          const startRow = Math.max(
            2,
            Number.parseInt(excelStartRow[type], 10) || 2,
          );
          for (let i = startRow - 1; i < rows.length; i++) {
            const row = rows[i];
            if (row && row.some((cell) => cell !== undefined && cell !== "")) {
              const mapped = excelColumnMap[type](row).map((v) => v ?? "");
              formattedRows.push(mapped.join(" | "));
            }
          }

          if (formattedRows.length > 0) {
            updates[type] = formattedRows.join("\n");
            foundAny = true;
          }
        }

        if (foundAny) {
          setDataText((prev) => ({ ...prev, ...updates }));
        } else {
          alert(
            'Không tìm thấy sheet "Danh sách Xe máy" hoặc "Danh sách xe ô tô" trong file Excel!',
          );
        }
      } catch (error) {
        console.error(error);
        alert(
          "Không thể đọc file Excel. Hãy chọn file .xlsx hoặc .xls hợp lệ.",
        );
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePrint = () => {
    window.print();
  };

  const cardsHtml = generateCardsHtml(dataText[activeTab], activeTab, config);

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  return (
    <div className="container">
      <header className="app-header">
        <h1>HỆ THỐNG TẠO &amp; IN THẺ RA VÀO CẢNG PSB</h1>
        <p className="subtitle">
          Tự động định dạng mã QR và chia bố cục linh hoạt để in ấn trực tiếp
          hoặc xuất file Word — hỗ trợ cả xe máy và xe ô tô.
        </p>
      </header>

      <div className="tabs" role="tablist">
        {Object.entries(VEHICLE_CONFIG).map(([key, cfg]) => (
          <button
            key={key}
            role="tab"
            aria-selected={activeTab === key}
            className={`tab-btn${activeTab === key ? " active" : ""}`}
            onClick={() => setActiveTab(key)}
          >
            {cfg.label}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <button className="btn btn-sample" onClick={loadSampleData}>
          ⚡ Nạp Dữ Liệu Mẫu (cả 2 loại)
        </button>

        <label className="btn btn-excel">
          📁 Import File Excel (2 sheets)
          <input
            type="file"
            ref={fileInputRef}
            accept=".xlsx, .xls"
            onChange={importExcel}
          />
        </label>

        <button className="btn btn-template" onClick={downloadTemplate}>
          📥 Tải File Mẫu Excel
        </button>

        <button
          className="btn btn-word"
          onClick={() => generateDocument(activeTab)}
          disabled={loading[activeTab]}
        >
          {loading[activeTab]
            ? "Đang tạo..."
            : `📄 Xuất Word - ${config.label}`}
        </button>

        <button className="btn btn-print" onClick={handlePrint}>
          🖨️ In Trực Tiếp
        </button>
      </div>

      <section className="data-section">
        <div className="row-start-grid">
          <label className="row-start-field" htmlFor="motorbikeStartRow">
            <span>Dòng bắt đầu xe máy</span>
            <input
              id="motorbikeStartRow"
              type="number"
              min="2"
              step="1"
              value={excelStartRow.motorbike}
              onChange={(e) =>
                setExcelStartRow((prev) => ({
                  ...prev,
                  motorbike: e.target.value,
                }))
              }
            />
            <small>Mặc định: 2</small>
          </label>

          <label className="row-start-field" htmlFor="carStartRow">
            <span>Dòng bắt đầu xe ô tô</span>
            <input
              id="carStartRow"
              type="number"
              min="2"
              step="1"
              value={excelStartRow.car}
              onChange={(e) =>
                setExcelStartRow((prev) => ({
                  ...prev,
                  car: e.target.value,
                }))
              }
            />
            <small>Mặc định: 2</small>
          </label>
        </div>
      </section>

      <section className="data-section">
        <label htmlFor="dataPreview" className="sr-only">
          Dữ liệu thẻ - {config.label}
        </label>
        <textarea
          id="dataPreview"
          value={dataText[activeTab]}
          onChange={(e) => setTabText(activeTab, e.target.value)}
          placeholder={config.placeholder}
        />
      </section>

      <section
        id="cardsContainer"
        className="cards-grid"
        aria-label={`Danh sách thẻ ra vào - ${config.label}`}
        dangerouslySetInnerHTML={{ __html: cardsHtml }}
      />
    </div>
  );
}

export default App;

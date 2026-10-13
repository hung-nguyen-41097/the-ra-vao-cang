import * as React from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Alert from "@mui/material/Alert";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import KeyboardArrowLeft from "@mui/icons-material/KeyboardArrowLeft";
import KeyboardArrowRight from "@mui/icons-material/KeyboardArrowRight";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DownloadIcon from "@mui/icons-material/Download";
import Stepper from "@mui/material/Stepper";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Divider from "@mui/material/Divider";
import * as XLSX from "xlsx";
import { validatePlate, validateRecord, FIELD_LABELS } from "./validatePlate.js";

const IMAGE_EXTENSIONS = /\.(png|jpe?g|jfif|webp|bmp|gif)$/i;

const steps = [
  { label: "Kiểm tra file Excel" },
  { label: "Kiểm tra tên ảnh thẻ" },
  { label: "Kiểm tra tên ảnh người + xe" },
];

const VEHICLE_CONFIG = {
  motorbike: {
    sheetName: "Danh sách Xe máy",
    plateType: "moto",
    columns: { hoten: 0, chucvu: 2, donvi: 3, soxe: 4 },
  },
  car: {
    sheetName: "Danh sách xe ô tô",
    plateType: "car",
    columns: { hoten: 0, chucvu: 1, donvi: 2, soxe: 3 },
  },
};

function normalizeName(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

const displayName = (name) =>
  String(name ?? "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();

function readRows(sheetRows, vehicleType, startRow, endRow) {
  const { columns } = VEHICLE_CONFIG[vehicleType];
  const endRowNumber = endRow === "" ? sheetRows.length : Number(endRow);

  if (endRowNumber < startRow) {
    throw new Error("Dòng kết thúc phải lớn hơn hoặc bằng dòng bắt đầu");
  }

  const result = [];
  for (let i = startRow - 1; i < sheetRows.length && i < endRowNumber; i++) {
    const row = sheetRows[i];
    if (!row || !row.some((cell) => cell !== "" && cell != null)) continue;

    const record = { excelRow: i + 1 };
    for (const [field, col] of Object.entries(columns)) {
      record[field] = row[col] ?? "";
    }
    result.push(record);
  }
  return result;
}

function checkExcelRows(rows, plateType) {
  const issues = [];
  for (const row of rows) {
    const { fields } = validateRecord(row, plateType);
    for (const [field, res] of Object.entries(fields)) {
      if (res.valid) continue;
      issues.push({
        excelRow: row.excelRow,
        hoten: row.hoten,
        field: FIELD_LABELS[field],
        value: String(row[field] ?? ""),
        message: res.errors.join("\n"),
        suggestion: res.suggestion ?? null,
      });
    }
  }
  return issues;
}

// Expected file names (the generator pairs images with Excel rows by sorting
// on the leading number, so the k-th image must belong to the k-th row):
//   portrait: "1. Họ tên.jpg"
//   vehicle:  "1. Họ tên Biển số.jpg" (biển số không có dấu chấm)
function parseImageName(fileName, withPlate) {
  // Keep the leading number even when the separator is wrong ("17, Tên"),
  // otherwise the file drops out and every later image shifts by one row.
  const match = fileName.match(/^(\d+)([^\p{L}\d]*)(.*)\.([^.]+)$/u);
  if (!match) {
    return { errors: ['Sai cú pháp: tên file phải bắt đầu bằng "STT. "'] };
  }

  const [, index, sep, rest, ext] = match;
  const errors = [];
  if (sep.trim() !== ".") {
    errors.push(`Sai cú pháp: sau "${index}" phải là dấu chấm và dấu cách ("${index}. ")`);
  } else if (sep === ".") {
    errors.push(`Thiếu dấu cách sau "${index}."`);
  } else if (sep !== ". ") {
    errors.push(`Thừa dấu cách sau "${index}."`);
  }
  if (/\S\s{2,}\S/.test(rest)) errors.push("Thừa dấu cách giữa các từ");
  if (/\s$/.test(rest)) errors.push("Thừa dấu cách ở cuối tên (trước đuôi file)");

  const parts = rest.trim().split(/\s+/);
  let plate = null;
  if (withPlate) {
    if (parts.length < 2) {
      errors.push("Thiếu biển số xe sau họ tên");
    } else {
      plate = parts.pop();
      if (plate.includes(".")) errors.push(`Biển số "${plate}" không được có dấu chấm`);
    }
  }

  return { index: Number(index), name: parts.join(" "), plate, ext, errors };
}

// Biển số trong tên ảnh: dạng chuẩn của Excel, bỏ dấu chấm
function expectedPlate(soxe, plateType) {
  const raw = String(soxe ?? "").trim();
  const { suggestion } = validatePlate(raw, plateType);
  return (suggestion ?? raw).replace(/\./g, "");
}

function expectedFileName(index, row, plate, ext) {
  const name = displayName(row.hoten);
  return `${index}. ${plate == null ? name : `${name} ${plate}`}.${ext}`;
}

function checkImageNames(files, rows, { withPlate, plateType }) {
  const issues = [];
  const parsed = [];

  for (const file of files) {
    const fileName = file.name.normalize("NFC");
    const info = parseImageName(fileName, withPlate);
    if (info.index == null) {
      issues.push({ severity: "error", file: fileName, message: info.errors.join("\n") });
      continue;
    }
    parsed.push({ ...info, file: fileName });
  }

  const byIndex = new Map();
  for (const img of parsed) {
    byIndex.set(img.index, [...(byIndex.get(img.index) || []), img.file]);
  }
  for (const [index, names] of byIndex) {
    if (names.length > 1) {
      issues.push({
        severity: "error",
        file: names.join(", "),
        message: `Trùng số thứ tự ${index}`,
      });
    }
  }

  parsed.sort((a, b) => a.index - b.index);

  const byName = new Map();
  for (const img of parsed) {
    const key = normalizeName(img.name);
    byName.set(key, [...(byName.get(key) || []), img.file]);
  }

  let matched = 0;
  const total = Math.max(rows.length, parsed.length);
  for (let i = 0; i < total; i++) {
    const row = rows[i];
    const img = parsed[i];

    if (!img) {
      issues.push({
        severity: "error",
        excelRow: row.excelRow,
        hoten: row.hoten,
        message: "Thiếu ảnh cho dòng này",
        hint: byName.get(normalizeName(row.hoten))?.join(", "),
      });
      continue;
    }
    if (!row) {
      issues.push({
        severity: "error",
        file: img.file,
        message: "Thừa ảnh, không có dòng Excel tương ứng",
      });
      continue;
    }

    const plate = withPlate ? expectedPlate(row.soxe, plateType) : null;
    const errors = [...img.errors];
    if (normalizeName(img.name) !== normalizeName(row.hoten)) {
      errors.push("Họ tên trong tên ảnh khác Excel");
    }
    if (withPlate && img.plate != null && img.plate.replace(/\./g, "") !== plate) {
      errors.push(`Biển số trong tên ảnh khác Excel ("${img.plate}" ≠ "${plate}")`);
    }

    if (errors.length) {
      const candidates = byName.get(normalizeName(row.hoten));
      issues.push({
        severity: "error",
        excelRow: row.excelRow,
        hoten: row.hoten,
        file: img.file,
        message: errors.join("\n"),
        hint: [
          `Tên đúng: ${expectedFileName(img.index, row, plate, img.ext)}`,
          candidates && !candidates.includes(img.file)
            ? `Ảnh cùng họ tên: ${candidates.join(", ")}`
            : null,
        ]
          .filter(Boolean)
          .join("\n"),
      });
      continue;
    }

    matched++;
  }

  return { issues, matched, imageCount: parsed.length };
}

function ResultSummary({ ok, okText, errorText }) {
  return ok ? (
    <Alert severity="success" icon={<CheckCircleIcon />}>
      {okText}
    </Alert>
  ) : (
    <Alert severity="error">{errorText}</Alert>
  );
}

function ExcelIssueTable({ issues }) {
  return (
    <Paper variant="outlined" sx={{ maxHeight: 360, overflow: "auto" }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell>Dòng</TableCell>
            <TableCell>Họ tên</TableCell>
            <TableCell>Trường</TableCell>
            <TableCell>Giá trị</TableCell>
            <TableCell>Lỗi</TableCell>
            <TableCell>Gợi ý</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {issues.map((issue, i) => (
            <TableRow key={i}>
              <TableCell>{issue.excelRow}</TableCell>
              <TableCell>{issue.hoten}</TableCell>
              <TableCell>{issue.field}</TableCell>
              <TableCell sx={{ fontFamily: "monospace", whiteSpace: "pre" }}>
                {`"${issue.value}"`}
              </TableCell>
              <TableCell sx={{ whiteSpace: "pre-line" }}>{issue.message}</TableCell>
              <TableCell sx={{ fontFamily: "monospace" }}>
                {issue.suggestion}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
}

function ImageIssueTable({ issues }) {
  return (
    <Paper variant="outlined" sx={{ maxHeight: 360, overflow: "auto" }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell>Dòng</TableCell>
            <TableCell>Họ tên (Excel)</TableCell>
            <TableCell>Tên file ảnh</TableCell>
            <TableCell>Lỗi</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {issues.map((issue, i) => (
            <TableRow key={i}>
              <TableCell>{issue.excelRow}</TableCell>
              <TableCell>{issue.hoten}</TableCell>
              <TableCell>{issue.file}</TableCell>
              <TableCell>
                <Typography
                  variant="body2"
                  sx={{ whiteSpace: "pre-line" }}
                >
                  {issue.message}
                </Typography>
                {issue.hint && (
                  <Typography
                    variant="caption"
                    display="block"
                    color="text.secondary"
                    sx={{ whiteSpace: "pre-line", mt: 0.5 }}
                  >
                    {issue.hint}
                  </Typography>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
}

function ImageFolderCheck({ title, format, files, onChange, result, rowCount }) {
  const errorCount = result?.issues.filter((i) => i.severity === "error").length ?? 0;

  return (
    <Stack spacing={2}>
      <Button variant="outlined" component="label">
        {title}
        <input
          type="file"
          hidden
          webkitdirectory="true"
          directory="true"
          multiple
          onChange={onChange}
        />
      </Button>
      <Typography variant="body2" color="text.secondary">
        Cú pháp tên ảnh: <b>{format}</b>
      </Typography>

      {files.length > 0 && result && (
        <>
          <Typography variant="body2" color="text.secondary">
            {result.imageCount.toLocaleString()} ảnh · {rowCount.toLocaleString()}{" "}
            dòng Excel · khớp {result.matched.toLocaleString()}
          </Typography>
          <ResultSummary
            ok={errorCount === 0}
            okText="Tên ảnh khớp với danh sách Excel."
            errorText={`Có ${errorCount} lỗi về tên ảnh.`}
          />
          {result.issues.length > 0 && <ImageIssueTable issues={result.issues} />}
        </>
      )}
    </Stack>
  );
}

const imagesFrom = (e) =>
  Array.from(e.target.files || []).filter((file) => IMAGE_EXTENSIONS.test(file.name));

export default function KiemTraPage() {
  const [activeStep, setActiveStep] = React.useState(0);
  const maxSteps = steps.length;

  const [excelFile, setExcelFile] = React.useState(null);
  const [workbook, setWorkbook] = React.useState(null);
  const [startRow, setStartRow] = React.useState("2");
  const [endRow, setEndRow] = React.useState("");
  const [vehicleType, setVehicleType] = React.useState("motorbike");
  const [portraitFiles, setPortraitFiles] = React.useState([]);
  const [vehicleFiles, setVehicleFiles] = React.useState([]);

  // Car cards have no portrait photo, so step 2 doesn't apply
  const skipsPortrait = vehicleType === "car";

  const { rows, readError } = React.useMemo(() => {
    if (!workbook) return { rows: [], readError: null };
    const { sheetName } = VEHICLE_CONFIG[vehicleType];
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      return { rows: [], readError: `Không tìm thấy sheet "${sheetName}"` };
    }
    try {
      const sheetRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      const start = Math.max(1, Number.parseInt(startRow, 10) || 1);
      return { rows: readRows(sheetRows, vehicleType, start, endRow), readError: null };
    } catch (err) {
      return { rows: [], readError: err.message };
    }
  }, [workbook, vehicleType, startRow, endRow]);

  const excelIssues = React.useMemo(
    () => checkExcelRows(rows, VEHICLE_CONFIG[vehicleType].plateType),
    [rows, vehicleType],
  );

  const portraitResult = React.useMemo(
    () =>
      portraitFiles.length
        ? checkImageNames(portraitFiles, rows, { withPlate: false })
        : null,
    [portraitFiles, rows],
  );

  const vehicleResult = React.useMemo(
    () =>
      vehicleFiles.length
        ? checkImageNames(vehicleFiles, rows, {
            withPlate: true,
            plateType: VEHICLE_CONFIG[vehicleType].plateType,
          })
        : null,
    [vehicleFiles, rows, vehicleType],
  );

  const handleExcelChange = async (e) => {
    const file = e.target.files?.[0] || null;
    setExcelFile(file);
    setWorkbook(null);
    if (!file) return;
    try {
      setWorkbook(XLSX.read(await file.arrayBuffer(), { type: "array" }));
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  const handleNext = () =>
    setActiveStep((prev) =>
      prev === 0 && skipsPortrait ? 2 : Math.min(prev + 1, maxSteps - 1),
    );

  const handleBack = () =>
    setActiveStep((prev) =>
      prev === 2 && skipsPortrait ? 0 : Math.max(prev - 1, 0),
    );

  const canGoNext = activeStep !== 0 || (rows.length > 0 && !readError);

  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        return (
          <Stack spacing={2}>
            <Button
              component="label"
              variant="contained"
              color="primary"
              sx={{ py: 2, borderRadius: 2 }}
            >
              Chọn file Excel (Mau_The_Ra_Vao_PSB)
              <input hidden type="file" accept=".xlsx,.xls" onChange={handleExcelChange} />
            </Button>

            <Button
              component="a"
              href="/Mau_Kiem_Tra_PSB.xlsx"
              download="Mau_Kiem_Tra_PSB.xlsx"
              variant="outlined"
              startIcon={<DownloadIcon />}
              sx={{ alignSelf: "flex-start" }}
            >
              Tải file Excel mẫu
            </Button>

            {excelFile && (
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  borderRadius: 2,
                  bgcolor: "success.50",
                }}
              >
                <CheckCircleIcon color="success" />
                <Typography>{excelFile.name}</Typography>
              </Paper>
            )}

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="Bắt đầu lấy dữ liệu từ dòng số:"
                type="number"
                size="small"
                value={startRow}
                onChange={(e) => setStartRow(e.target.value)}
                slotProps={{ htmlInput: { min: 1 } }}
                sx={{ width: 260 }}
              />
              <TextField
                label="Kết thúc ở dòng số:"
                type="number"
                size="small"
                value={endRow}
                onChange={(e) => setEndRow(Number(e.target.value) ? e.target.value : "")}
                sx={{ width: 260 }}
              />
            </Stack>

            <RadioGroup
              row
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value)}
            >
              <FormControlLabel value="motorbike" control={<Radio />} label="Xe máy" />
              <FormControlLabel value="car" control={<Radio />} label="Xe ô tô" />
            </RadioGroup>

            {readError && <Alert severity="error">{readError}</Alert>}

            {workbook && !readError && (
              <>
                <ResultSummary
                  ok={excelIssues.length === 0}
                  okText={`${rows.length} dòng hợp lệ.`}
                  errorText={`${new Set(excelIssues.map((i) => i.excelRow)).size}/${rows.length} dòng có lỗi (${excelIssues.length} lỗi).`}
                />
                {excelIssues.length > 0 && <ExcelIssueTable issues={excelIssues} />}
              </>
            )}
          </Stack>
        );

      case 1:
        return (
          <ImageFolderCheck
            title="Chọn thư mục ảnh thẻ chân dung"
            format="1. Họ tên.jpg"
            files={portraitFiles}
            onChange={(e) => setPortraitFiles(imagesFrom(e))}
            result={portraitResult}
            rowCount={rows.length}
          />
        );

      case 2:
        return (
          <ImageFolderCheck
            title="Chọn thư mục ảnh người + xe"
            format="1. Họ tên Biển số.jpg (biển số không có dấu chấm)"
            files={vehicleFiles}
            onChange={(e) => setVehicleFiles(imagesFrom(e))}
            result={vehicleResult}
            rowCount={rows.length}
          />
        );

      default:
        return null;
    }
  };

  return (
    <Box sx={{ maxWidth: 960, mx: "auto", mt: 5, px: 2 }}>
      <header className="app-header">
        <h1>KIỂM TRA DỮ LIỆU THẺ RA VÀO CẢNG PSB</h1>
        <p className="subtitle">
          Kiểm tra file Excel, tên ảnh thẻ và tên ảnh người + xe trước khi tạo thẻ.
        </p>
      </header>

      <Card elevation={4} sx={{ borderRadius: 3, minHeight: 400 }}>
        <CardContent sx={{ display: "flex", flexDirection: "column" }}>
          <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 5 }}>
            {steps.map((step, index) => (
              <Step key={step.label} completed={index === 1 && skipsPortrait ? false : undefined}>
                <StepLabel
                  optional={
                    index === 1 && skipsPortrait ? (
                      <Typography variant="caption">Không áp dụng cho ô tô</Typography>
                    ) : null
                  }
                >
                  {step.label}
                </StepLabel>
              </Step>
            ))}
          </Stepper>

          <Box sx={{ flex: 1 }}>{renderStepContent()}</Box>
          <Divider sx={{ my: 4 }} />

          <Stack direction="row" sx={{ justifyContent: "space-between" }}>
            <Button
              startIcon={<KeyboardArrowLeft />}
              onClick={handleBack}
              disabled={activeStep === 0}
            >
              Quay lại
            </Button>

            <Button
              variant="contained"
              endIcon={<KeyboardArrowRight />}
              onClick={handleNext}
              disabled={activeStep === maxSteps - 1 || !canGoNext}
            >
              Tiếp theo
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

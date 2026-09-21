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
import KeyboardArrowLeft from "@mui/icons-material/KeyboardArrowLeft";
import KeyboardArrowRight from "@mui/icons-material/KeyboardArrowRight";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import Stepper from "@mui/material/Stepper";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Divider from "@mui/material/Divider";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import SettingsIcon from "@mui/icons-material/Settings";
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibrary";
import DescriptionIcon from "@mui/icons-material/Description";
import PhotoSizeSelectLargeIcon from "@mui/icons-material/PhotoSizeSelectLarge";
import LinearProgress from "@mui/material/LinearProgress";
import * as XLSX from "xlsx";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import ImageModule from "docxtemplater-image-module-free";

const IMAGE_EXTENSIONS = /\.(png|jpe?g|jfif|webp|bmp|gif)$/i;

// Mirrors image-optimizer/optimize.js: portraits only ever get embedded at
// 65x65 or 120x120 in the exported Word docs, so anything beyond
// print-quality resolution is wasted memory.
const OPTIMIZE_MAX_DIMENSION = 800;
const OPTIMIZE_JPEG_QUALITY = 0.8;

const steps = [
  {
    label: "Tối ưu ảnh",
    icon: <PhotoSizeSelectLargeIcon />,
  },
  {
    label: "Nhập File Excel",
    icon: <UploadFileIcon />,
  },
  {
    label: "Lựa chọn",
    icon: <SettingsIcon />,
  },
  {
    label: "Chọn thư mục ảnh",
    icon: <PhotoLibraryIcon />,
  },
  {
    label: "Xuất file",
    icon: <DescriptionIcon />,
  },
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

export default function V2Page() {
  const [activeStep, setActiveStep] = React.useState(0);
  const maxSteps = steps.length;

  // ---- Wizard state -----------------------------------------------
  const [excelFile, setExcelFile] = React.useState(null);
  const [startRow, setStartRow] = React.useState("2");
  const [endRow, setEndRow] = React.useState("");
  const [vehicleType, setVehicleType] = React.useState("motorbike");
  const [portraitFiles, setPortraitFiles] = React.useState([]);
  const [outputFilename, setOutputFilename] = React.useState("The_Ra_Vao_Cang");
  const [generated, setGenerated] = React.useState(false);

  // ---- Image optimization state ------------------------------------
  const [imagesToOptimize, setImagesToOptimize] = React.useState([]);
  const [isOptimizing, setIsOptimizing] = React.useState(false);
  const [optimizeProgress, setOptimizeProgress] = React.useState(0);
  const [optimizeSummary, setOptimizeSummary] = React.useState(null);

  const nextButtonRef = React.useRef(null);
  const backButtonRef = React.useRef(null);
  const previousActiveStepRef = React.useRef(activeStep);

  React.useEffect(() => {
    const previousActiveStep = previousActiveStepRef.current;
    previousActiveStepRef.current = activeStep;
    if (activeStep === 0 && previousActiveStep === 1) {
      nextButtonRef.current?.focus();
      return;
    }
    if (activeStep === maxSteps - 1 && previousActiveStep === maxSteps - 2) {
      backButtonRef.current?.focus();
    }
  }, [activeStep, maxSteps]);

  const handleNext = () =>
    setActiveStep((prev) => {
      if (prev === 2 && vehicleType === "car") {
        return 4;
      }

      return Math.min(prev + 1, maxSteps - 1);
    });

  const handleBack = () =>
    setActiveStep((prev) => {
      if (prev === 4 && vehicleType === "car") {
        return 2;
      }

      return Math.max(prev - 1, 0);
    });

  const handleExcelChange = (e) => {
    const file = e.target.files?.[0] || null;
    setExcelFile(file);
  };

  const handleFolderChange = (e) => {
    const images = Array.from(e.target.files || []).filter((file) =>
      IMAGE_EXTENSIONS.test(file.name),
    );

    setPortraitFiles(images);
  };

  const handleOptimizeFolderChange = (e) => {
    const images = Array.from(e.target.files || []).filter((file) =>
      IMAGE_EXTENSIONS.test(file.name),
    );

    setImagesToOptimize(images);
    setOptimizeSummary(null);
  };

  const handleOptimizeAndDownload = async () => {
    if (imagesToOptimize.length === 0) return;

    setIsOptimizing(true);
    setOptimizeProgress(0);
    setOptimizeSummary(null);

    try {
      const zip = new JSZip();
      let totalBefore = 0;
      let totalAfter = 0;

      for (let i = 0; i < imagesToOptimize.length; i++) {
        const file = imagesToOptimize[i];
        const { blob } = await optimizeImageFile(file);

        const baseName = file.name.replace(/\.[^.]+$/, "");
        zip.file(`${baseName}.jpg`, blob);

        totalBefore += file.size;
        totalAfter += blob.size;
        setOptimizeProgress(i + 1);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const inputFolderName = getInputFolderName(imagesToOptimize[0]);
      const zipFilename = `${inputFolderName}.zip`;
      saveAs(zipBlob, zipFilename);

      setOptimizeSummary({
        count: imagesToOptimize.length,
        totalBefore,
        totalAfter,
        zipFilename,
      });
    } catch (err) {
      console.error(err);
      alert(err.message);
    } finally {
      setIsOptimizing(false);
    }
  };

  const getStartRowNumber = () =>
    Math.max(1, Number.parseInt(startRow, 10) || 1);

  const handleStartRowChange = (e) => {
    const value = e.target.value;

    if (value === "") {
      setStartRow("");
      return;
    }

    const nextStartRow = Math.max(1, Number.parseInt(value, 10) || 1);
    setStartRow(String(nextStartRow));
  };

  const handleEndRowChange = (e) => {
    const value = e.target.value;

    if (value === "") {
      setEndRow("");
      return;
    }

    const parsedValue = Number(value);

    if (!parsedValue) {
      setEndRow("");
      return;
    }

    setEndRow(String(parsedValue));
  };

  const handleGenerate = async () => {
    try {
      const rows = await readExcelFile(
        excelFile,
        vehicleType,
        getStartRowNumber(),
        endRow,
      );

      const startRowNumber = getStartRowNumber();

      let cards;

      if (vehicleType === "motorbike") {
        const portraitIndex = buildPortraitIndex(portraitFiles);
        console.log("Portrait Index:", portraitIndex);
        cards = await Promise.all(
          rows.map((row, index) =>
            buildMotorbikeCard(row, index, startRowNumber, portraitIndex),
          ),
        );

        console.log(cards);
      } else {
        cards = await Promise.all(
          rows.map((row, index) => buildCarCard(row, index, startRowNumber)),
        );
      }

      const cfg = VEHICLE_CONFIG[vehicleType];

      const response = await fetch(cfg.templateUrl);

      const zip = new PizZip(await response.arrayBuffer());

      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        modules: [
          new ImageModule({
            centered: false,
            getImage: (tagValue) => tagValue,
            getSize: () =>
              vehicleType === "motorbike" ? [65, 65] : [120, 120],
          }),
        ],
      });

      await doc.renderAsync({
        pages: [
          {
            cards,
          },
        ],
      });

      const blob = doc.getZip().generate({
        type: "blob",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      saveAs(blob, outputFilename + ".docx");

      setGenerated(true);
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  const canGoNext = React.useMemo(() => {
    if (activeStep === 1) return !!excelFile;
    if (activeStep === 3)
      return portraitFiles.length > 0 || vehicleType === "car";
    return true;
  }, [activeStep, excelFile, portraitFiles, vehicleType]);

  // ---- Step content -------------------------------------------------
  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        return (
          <Stack spacing={2}>
            <Button variant="outlined" component="label">
              Hãy chọn thư mục ảnh cần tối ưu
              <input
                type="file"
                hidden
                webkitdirectory="true"
                directory="true"
                multiple
                onChange={handleOptimizeFolderChange}
              />
            </Button>

            {imagesToOptimize.length > 0 && (
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  borderRadius: 2,
                }}
              >
                <Typography fontWeight={600}>
                  {imagesToOptimize.length.toLocaleString()} ảnh
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Ảnh sẽ được thu nhỏ tối đa {OPTIMIZE_MAX_DIMENSION}px và nén
                  JPEG chất lượng {Math.round(OPTIMIZE_JPEG_QUALITY * 100)}%.
                </Typography>
              </Paper>
            )}

            <Button
              variant="contained"
              disabled={imagesToOptimize.length === 0 || isOptimizing}
              onClick={handleOptimizeAndDownload}
            >
              {isOptimizing
                ? `Đang tối ưu ${optimizeProgress}/${imagesToOptimize.length}...`
                : "Tối ưu & Tải xuống (.zip)"}
            </Button>

            {isOptimizing && (
              <LinearProgress
                variant="determinate"
                value={
                  imagesToOptimize.length
                    ? (optimizeProgress / imagesToOptimize.length) * 100
                    : 0
                }
              />
            )}

            {optimizeSummary && (
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
                <Typography variant="body2">
                  Đã tối ưu {optimizeSummary.count} ảnh:{" "}
                  {(optimizeSummary.totalBefore / 1024 / 1024).toFixed(2)}MB
                  {" -> "}
                  {(optimizeSummary.totalAfter / 1024 / 1024).toFixed(2)}MB (-
                  {(
                    100 *
                    (1 - optimizeSummary.totalAfter / optimizeSummary.totalBefore)
                  ).toFixed(1)}
                  %). File {optimizeSummary.zipFilename} đã được tải xuống.
                </Typography>
              </Paper>
            )}
          </Stack>
        );

      case 1:
        return (
          <Stack spacing={2}>
            <Button
              component="label"
              variant="contained"
              color="primary"
              sx={{
                py: 2,
                borderRadius: 2,
              }}
            >
              Chọn file Excel (Mau_The_Ra_Vao_PSB)
              <input
                hidden
                type="file"
                accept=".xlsx,.xls"
                onChange={handleExcelChange}
              />
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
          </Stack>
        );

      case 2:
        return (
          <Stack
            spacing={2}
            sx={{
              padding: 0,
              paddingLeft: "50px",
            }}
          >
            <Stack direction="row" spacing={2}>
              <TextField
                label="Bắt đầu lấy dữ liệu từ dòng số:"
                type="number"
                size="small"
                value={startRow}
                onChange={handleStartRowChange}
                slotProps={{ htmlInput: { min: 1 } }}
                sx={{ width: 260 }}
              />
              <TextField
                label="Kết thúc ở dòng số:"
                type="number"
                size="small"
                value={endRow}
                onChange={handleEndRowChange}
                sx={{ width: 260 }}
              />
            </Stack>
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Loại phương tiện
              </Typography>
              <RadioGroup
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value)}
              >
                <FormControlLabel
                  value="motorbike"
                  control={<Radio />}
                  label="Xe máy"
                />
                <FormControlLabel
                  value="car"
                  control={<Radio />}
                  label="Xe ô tô"
                />
              </RadioGroup>
            </Box>
          </Stack>
        );

      case 3:
        if (vehicleType === "car") {
          return null;
        }

        return (
          <Stack spacing={2}>
            <Button variant="outlined" component="label">
              Hãy chọn thư mục ảnh thẻ chân dung
              <input
                type="file"
                hidden
                webkitdirectory="true"
                directory="true"
                multiple
                onChange={handleFolderChange}
              />
            </Button>
            {portraitFiles.length > 0 && (
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  borderRadius: 2,
                }}
              >
                <Typography fontWeight={600}>
                  {portraitFiles.length.toLocaleString()} ảnh
                </Typography>

                <Typography variant="body2" color="text.secondary">
                  Sẵn sàng để ghép với dữ liệu Excel.
                </Typography>
              </Paper>
            )}
          </Stack>
        );

      case 4:
        return (
          <Stack spacing={3}>
            <TextField
              label="Tên file xuất ra"
              size="small"
              value={outputFilename}
              onChange={(e) => setOutputFilename(e.target.value)}
              fullWidth
            />
            <Button variant="contained" onClick={handleGenerate}>
              Tạo file Word
            </Button>
            {generated && (
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <CheckCircleIcon color="success" fontSize="small" />
                <Typography variant="body2">Hoàn thành!</Typography>
              </Stack>
            )}
          </Stack>
        );

      default:
        return null;
    }
  };

  async function fetchQRCodeBuffer(link) {
    if (!link) return EMPTY_PNG_BUFFER;
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
      link,
    )}`;
    const response = await fetch(qrApiUrl);
    if (!response.ok) return EMPTY_PNG_BUFFER;
    return await response.arrayBuffer();
  }

  async function fetchImageBuffer(row, excelIndex, portraitIndex) {
    const portrait = portraitIndex[excelIndex];

    if (!portrait) {
      return EMPTY_PNG_BUFFER;
    }

    const excelName = normalizeName(row.hoten);

    if (portrait.name !== excelName) {
      console.warn(
        `Name mismatch:
          Excel : ${excelName}
          Image : ${portrait.name}`,
      );
    }

    return await portrait.file.arrayBuffer();
  }

  function getInputFolderName(file) {
    const relativePath = file.webkitRelativePath || "";
    const folderName = relativePath.split("/")[0];
    return folderName || "anh-toi-uu";
  }

  async function optimizeImageFile(file) {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

    let { width, height } = bitmap;
    if (width > OPTIMIZE_MAX_DIMENSION || height > OPTIMIZE_MAX_DIMENSION) {
      const scale = OPTIMIZE_MAX_DIMENSION / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", OPTIMIZE_JPEG_QUALITY),
    );

    return { blob };
  }

  function normalizeName(name) {
    return name
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase()
      .trim();
  }

  function buildPortraitIndex(portraitFiles) {
    return portraitFiles
      .map((file) => {
        const match = file.name.match(/^(\d+)\.\s*(.+)\.[^.]+$/);

        return {
          index: match ? Number(match[1]) : Number.MAX_SAFE_INTEGER,
          name: match ? normalizeName(match[2]) : "",
          file,
        };
      })
      .sort((a, b) => a.index - b.index);
  }

  async function readExcelFile(file, vehicleType, startRow, endRow) {
    const data = await file.arrayBuffer();

    const workbook = XLSX.read(data, {
      type: "array",
    });

    const sheetName =
      vehicleType === "motorbike" ? "Danh sách Xe máy" : "Danh sách xe ô tô";

    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      throw new Error(`Không tìm thấy sheet "${sheetName}"`);
    }

    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
    });

    const endRowNumber =
      endRow === "" || endRow == null
        ? rows.length
        : Number.parseInt(endRow, 10);

    if (endRowNumber < startRow) {
      throw new Error("Dòng kết thúc phải lớn hơn hoặc bằng dòng bắt đầu");
    }

    const result = [];

    for (let i = startRow - 1; i < rows.length && i <= endRowNumber - 1; i++) {
      const row = rows[i];

      if (!row) continue;

      if (!row.some((cell) => cell !== "" && cell != null)) continue;

      if (vehicleType === "motorbike") {
        result.push({
          hoten: row[0] ?? "",
          cccd: row[1] ?? "",
          chucvu: row[2] ?? "",
          donvi: row[3] ?? "",
          soxe: row[4] ?? "",
          ngay: row[6] ?? "",
          qrCode: row[7] ?? "",
        });
      } else {
        result.push({
          hoten: row[0] ?? "",
          chucvu: row[1] ?? "",
          donvi: row[2] ?? "",
          soxe: row[3] ?? "",
          hieuxe: row[4] ?? "",
          sdt: row[5] ?? "",
          ngay: row[6] ?? "",
          qrCode: row[7] ?? "",
        });
      }
    }

    return result;
  }

  const imageLookup = new Map();

  portraitFiles.forEach((file) => {
    imageLookup.set(file.name.toLowerCase(), file);
  });

  async function buildMotorbikeCard(row, index, startRow, portraitIndex) {
    const [qrCode, idphoto] = await Promise.all([
      fetchQRCodeBuffer(row.qrCode),
      fetchImageBuffer(row, index, portraitIndex),
    ]);

    return {
      id: String(startRow + index).padStart(2, "0"),
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

  async function buildCarCard(row, index, startRow = 1) {
    const [qrCode] = await Promise.all([fetchQRCodeBuffer(row.qrCode)]);
    let startRowNum = Number.parseInt(startRow, 10);
    return {
      id: String(startRowNum + index).padStart(1, "0"),
      phone: row.sdt,
      hieuxe: row.hieuxe,
      soxe: row.soxe,
      donvi: row.donvi,
      ngày: row.ngay,
      qrCode,
    };
  }

  return (
    <Box
      sx={{
        maxWidth: 760,
        mx: "auto",
        mt: 5,
        px: 2,
      }}
    >
      <header className="app-header">
        <h1>HỆ THỐNG TẠO &amp; IN THẺ RA VÀO CẢNG PSB</h1>
        <p className="subtitle">
          Tự động định dạng mã QR và chia bố cục linh hoạt để in ấn trực tiếp
          hoặc xuất file Word - hỗ trợ cả xe máy và xe ô tô.
        </p>
      </header>

      <Card
        elevation={4}
        sx={{
          borderRadius: 3,
          height: 400, // fixed height
        }}
      >
        <CardContent
          sx={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 5 }}>
            {steps.map((step) => (
              <Step key={step.label}>
                <StepLabel>{step.label}</StepLabel>
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

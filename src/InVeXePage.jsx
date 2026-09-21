import * as React from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  WidthType,
  PageOrientation,
  AlignmentType,
  BorderStyle,
} from "docx";
import { saveAs } from "file-saver";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const COLS = 2;
const ROWS = 4;
const PER_PAGE = ROWS; // 4 unique PDFs per page, each duplicated across the 2 columns (8 cards/page)
const RENDER_SCALE = 3;
const MAX_FILES = 800;

const CM_TO_PX = 96 / 2.54;
const CARD_W_PX = Math.round(10.3 * CM_TO_PX);
const CARD_H_PX = Math.round(7 * CM_TO_PX);

/** Render the first page of a PDF File to PNG bytes (browser canvas). */
async function pdfFileToPngBytes(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: RENDER_SCALE });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");

  await page.render({ canvasContext: ctx, viewport }).promise;

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { bytes, width: canvas.width, height: canvas.height };
}

const NO_MARGINS = { top: 0, bottom: 0, left: 0, right: 0 };

/**
 * Build one 2x4 table (one Word page's worth) from up to 4 unique images.
 * Each image fills its entire row, repeated in both columns (2 copies/row).
 */
function buildGridTable(images) {
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    const cells = [];
    const img = images[r];
    for (let c = 0; c < COLS; c++) {
      cells.push(
        new TableCell({
          width: { size: 100 / COLS, type: WidthType.PERCENTAGE },
          margins: NO_MARGINS,
          borders:
            c === 0
              ? {
                  right: {
                    style: BorderStyle.DASHED,
                    size: 16,
                    color: "2F80ED",
                  },
                }
              : undefined,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 0, after: 0 },
              children: img
                ? [
                    new ImageRun({
                      data: img.bytes,
                      transformation: {
                        width: CARD_W_PX,
                        height: CARD_H_PX,
                      },
                    }),
                  ]
                : [],
            }),
          ],
        }),
      );
    }
    rows.push(new TableRow({ children: cells }));
  }
  const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    margins: NO_MARGINS,
    borders: {
      top: NO_BORDER,
      bottom: NO_BORDER,
      left: NO_BORDER,
      right: NO_BORDER,
      insideHorizontal: NO_BORDER,
      insideVertical: NO_BORDER,
    },
  });
}

export default function InVeXePage() {
  const [status, setStatus] = React.useState("");
  const [progress, setProgress] = React.useState({ done: 0, total: 0 });
  const [busy, setBusy] = React.useState(false);

  const handleFolderSelect = React.useCallback(async (e) => {
    const files = Array.from(e.target.files || [])
      .filter((f) => f.name.toLowerCase().endsWith(".pdf"))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true }),
      );

    if (files.length === 0) {
      setStatus("Không tìm thấy file PDF nào trong thư mục đã chọn.");
      return;
    }

    const folderName =
      (files[0].webkitRelativePath || "").split("/")[0] || "output";

    let trimmedFiles = files;
    if (files.length > MAX_FILES) {
      setStatus(
        `Tìm thấy ${files.length} file PDF — chỉ lấy ${MAX_FILES} file đầu tiên.`,
      );
      trimmedFiles = files.slice(0, MAX_FILES);
    }

    setBusy(true);
    setProgress({ done: 0, total: trimmedFiles.length });
    setStatus("Đang xử lý các trang PDF...");

    const images = [];
    for (let i = 0; i < trimmedFiles.length; i++) {
      try {
        const img = await pdfFileToPngBytes(trimmedFiles[i]);
        images.push(img);
      } catch (err) {
        console.error(`Failed to render ${trimmedFiles[i].name}:`, err);
      }
      setProgress({ done: i + 1, total: trimmedFiles.length });
    }

    setStatus("Đang tạo file Word...");

    const children = [];
    for (let i = 0; i < images.length; i += PER_PAGE) {
      const chunk = images.slice(i, i + PER_PAGE);
      children.push(buildGridTable(chunk));
      if (i + PER_PAGE < images.length) {
        children.push(new Paragraph({ children: [], pageBreakBefore: false }));
      }
    }

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              size: { orientation: PageOrientation.PORTRAIT },
              margin: { top: 150, bottom: 0, left: 0, right: 0 },
            },
          },
          children,
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `Ve vao cang IN ${folderName}.docx`);

    setStatus(`Hoàn thành — đã ghép ${images.length} vé xe vào file Word.`);
    setBusy(false);
  }, []);

  return (
    <Box sx={{ maxWidth: 760, mx: "auto", mt: 5, px: 2 }}>
      <header className="app-header">
        <h1>IN VÉ XE — GHÉP PDF VÀO FILE WORD</h1>
        <p className="subtitle">
          Chọn thư mục chứa các file PDF vé xe (mỗi file 1 trang, tối đa{" "}
          {MAX_FILES} file). Hệ thống sẽ ghép 8 vé/trang (lưới 2x4, mỗi vé lặp
          lại 2 lần trên cùng một hàng) vào một file Word duy nhất.
        </p>
      </header>

      <Card elevation={4} sx={{ borderRadius: 3 }}>
        <CardContent>
          <Stack spacing={2}>
            <Button
              component="label"
              variant="contained"
              color="primary"
              startIcon={<UploadFileIcon />}
              sx={{ py: 2, borderRadius: 2 }}
              disabled={busy}
            >
              Chọn thư mục PDF
              <input
                type="file"
                hidden
                webkitdirectory="true"
                directory="true"
                multiple
                onChange={handleFolderSelect}
                disabled={busy}
              />
            </Button>

            {progress.total > 0 && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography variant="body2" gutterBottom>
                  Đã xử lý {progress.done} / {progress.total}
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={(progress.done / progress.total) * 100}
                />
              </Paper>
            )}

            {status && (
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                {!busy && progress.total > 0 && (
                  <CheckCircleIcon color="success" fontSize="small" />
                )}
                <Typography variant="body2">{status}</Typography>
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

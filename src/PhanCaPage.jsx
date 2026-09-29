import { useMemo, useState, useEffect } from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  analyzePerson, groupTeams, buildSchedule, personStats,
  daysInMonth, weekday, nextMonth, isWork, SHIFT_TEXT, WEEKDAY_VI, WORK,
} from "./shiftEngine.js";
import "./PhanCaPage.css";

// October 2026 roster from "Phan_Ca_Tren_Base.xlsx" — used until a file is loaded.
// [stt, name, title, codes for each day]  S=6h-12h C=12h-18h D=night O=off
const SAMPLE_ROWS = [[4, "Trần Phú Quảng", "TP", "CSDCSOOSDCSDOODCSDCOOCSDCSDOSDO"], [5, "Nguyễn Hữu Hiền", "TP", "OOSDCSDOODCSDCOOCSDCSDOOSCODCSD"], [6, "Nguyễn Văn Sơn", "TP", "SDOODCSDCOOCSDCSDOODCSDCODCSOCS"], [8, "Đặng Chu Giang", "NV", "SDOODCSDCOOCSDCSDOODCSDOODCSOCS"], [9, "Nguyễn Ngọc Lân", "NV", "CSDCSOOSDCSDOODCSDCOOCSDCSDOSDO"], [10, "Nguyễn Văn Tiến", "NV", "OOSDCSDOODCSDCOOCSDCSDOOSCODCSD"], [12, "Lê Thanh Hiểu", "NV", "OOSDCSDOODCSDCOOCSDCSDOOSCODCSD"], [13, "Nguyễn Quốc Hưng", "NV", "CSDCSOOSDCSDOODCODCOOCSDCSDOSDO"], [14, "Lê Khắc Hùng", "NV", "SDOODCSDCOOCSDCSDOODCSDOODCSOCS"], [15, "Phạm Trường An", "NV", "CSDCSOOSDCSDOODCODCOOCSDCSDOSDO"], [16, "Vũ Giáp", "NV", "SDOODCSDCOOCSDCSDOODCSDOODCSOCS"], [17, "Lưu Bá Trọng", "NV", "OOSDCSDOODCSDCOOCSDCSDOOSCODCSD"], [19, "Nguyễn Đăng Sáu", "NV", "CSDCSOOSDCSDOODCODCOOCSDCSDOSDO"], [20, "Phạm Minh Tuấn", "NV", "OOSDCSDOODCSDCOOCSDCSDOOSCODCSD"], [21, "Bùi Công Toản", "NV", "SDOODCSDCOOCSDCSDOODCSDOODCSOCS"], [22, "Trương Văn Công", "NV", "CSDCSOOSDCSDOODCODCOOCSDCSDOSDO"], [23, "Phan Văn Dân", "NV", "OOSDCSDOODCSDCOOCSDCSDOOSCODCSD"], [24, "Bùi Đức Trừu", "NV", "SDOODCSDCOOCSDCSDOODCSDOODCSOCS"], [25, "Trần Quang Bảo", "NV", "CSDCSOOSDCSDOODCODCOOCSDCSDOSDO"], [26, "Nguyễn Văn Hệ", "NV", "OOSDCSDOODCSDCOOCSDCSDOOSCODCSD"], [27, "Nguyễn Xuân Hùng", "NV", "SDOODCSDCOOCSDCSDOODCSDOODCSOCS"], [28, "Nguyễn Văn Tuyển", "NV", "CSDCSOOSDCSDOODCODCOOCSDCSDOSDO"], [29, "Trần Hữu Minh", "NV", "OOSDCSDOODCSDCOOCSDCSDOOSCODCSD"], [30, "Đào Anh Hùng", "NV", "SDOODCSDCOOCSDCSDOODCSDOODCSOCS"], [31, "Nguyễn Quang Thuận", "NV", "CSDCSOOSDCSDOODCODCOOCSDCSDOSDO"], [32, "Nguyễn Xuân Dũng", "NV", "OOSDCSDOODCSDCOOCSDCSDOOSCODCSD"], [33, "Nguyễn Xuân Túy", "NV", "SDOODCSDCOOCSDCSDOODCSDOODCSOCS"], [34, "Phạm Văn Cảnh", "NV", "CSDCSOOSDCSDOODCODCOOCSDCSDOSDO"], [35, "Nguyễn Trọng Lẫm", "NV", "OOSDCSDOODCSDCOOCSDCSDOOSCODCSD"], [36, "Đào Công Bằng", "NV", "SDOODCSDCOOCSDCSDOODCSDOODCSOCS"], [37, "Nguyễn Phước Hội", "NV", "CSDCSOOSDCSDOODCODCOOCSDCSDOSDO"], [38, "Mai Văn Ánh", "NV", "OOSDCSDOODCSDCOOCSDCSDOOSCODCSD"], [39, "Hồ Văn Thư", "NV", "SDOODCSDCOOCSDCSDOODCSDOODCSOCS"]];
const SAMPLE = {
  year: 2026, month: 10,
  org: "Chi nhánh Cảng Dầu khí và Dịch vụ Năng lương tái tạo",
  dept: "P. TCHC- Tổ Bảo vệ",
  staff: SAMPLE_ROWS.map(([stt, name, title, days]) => ({ stt, name, title, days })),
};

const LABEL = { S: "6–12", C: "12–18", D: "22–6 / 18–22", O: "0" };
const NAME = { S: "Sáng 6h–12h", C: "Chiều 12h–18h", D: "Đêm: 22h–6h và 18h–22h (2 ca riêng biệt)", O: "Nghỉ" };
const WEEKDAY_EN = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const MONTHS = ["Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"];

const DEFAULT_MAX_CONSECUTIVE = 6;
const DEFAULT_MIN_PER_SHIFT = 2;

// Every month from right after the source month through December of next year.
function monthOptionsFor(source) {
  const options = [];
  let cur = nextMonth(source.year, source.month);
  const endYear = source.year + 1;
  while (cur.year < endYear || (cur.year === endYear && cur.month <= 12)) {
    options.push(cur);
    cur = nextMonth(cur.year, cur.month);
  }
  return options;
}

// --------------------------------------------------------------------------
//  Excel export in the same layout as the source file
// --------------------------------------------------------------------------
async function buildWorkbook(source, target, staff, grid) {
  const { year, month } = target;
  const n = grid[0]?.length ?? daysInMonth(year, month);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Thang ${month}`);
  const font = { name: "Times New Roman", size: 11 };
  const border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
  const yellow = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
  const lastCol = 3 + n;

  ws.getCell("A1").value = source.org || SAMPLE.org;
  ws.getCell("A1").font = { ...font, size: 12 };
  ws.mergeCells("B2:E2");
  ws.getCell("B2").value = source.dept || SAMPLE.dept;
  ws.getCell("B2").font = { ...font, size: 12, bold: true };
  ws.getCell("B2").alignment = { horizontal: "center" };
  ws.mergeCells(4, 1, 4, lastCol);
  ws.getCell("A4").value = `BẢNG CHẤM CÔNG TRÊN BASE - THÁNG ${month} NĂM ${year}`;
  ws.getCell("A4").font = { ...font, size: 12, bold: true };
  ws.getCell("A4").alignment = { horizontal: "center" };

  [["A", "Stt"], ["B", "Họ và tên"], ["C", "Chức \ndanh"]].forEach(([col, v]) => {
    ws.mergeCells(`${col}6:${col}7`);
    const c = ws.getCell(`${col}6`);
    c.value = v; c.font = { ...font, bold: true }; c.border = border;
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  for (let d = 1; d <= n; d++) {
    const wd = weekday(year, month, d);
    const top = ws.getRow(6).getCell(3 + d), bot = ws.getRow(7).getCell(3 + d);
    top.value = WEEKDAY_VI[wd]; bot.value = d;
    [top, bot].forEach((c) => {
      c.font = { ...font, bold: true }; c.border = border;
      c.alignment = { horizontal: "center", vertical: "middle" };
      if (wd === 0 || wd === 6) c.fill = yellow;
    });
  }
  staff.forEach((p, i) => {
    const row = ws.getRow(8 + i);
    row.height = 27.9;
    row.getCell(1).value = p.stt;
    row.getCell(2).value = p.name;
    row.getCell(3).value = p.title;
    grid[i].forEach((code, d) => {
      const c = row.getCell(4 + d);
      c.value = SHIFT_TEXT[code];
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      if ([0, 6].includes(weekday(year, month, d + 1))) c.fill = yellow;
    });
    for (let c = 1; c <= lastCol; c++) {
      const cell = row.getCell(c);
      cell.font = font; cell.border = border;
      if (c <= 3) cell.alignment = { horizontal: c === 2 ? "left" : "center", vertical: "middle" };
    }
  });
  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 19.5;
  ws.getColumn(3).width = 6.5;
  for (let d = 1; d <= n; d++) ws.getColumn(3 + d).width = 7.6;
  ws.views = [{ state: "frozen", xSplit: 3, ySplit: 7 }];
  return wb.xlsx.writeBuffer();
}

// ==========================================================================
export default function PhanCaPage() {
  const source = SAMPLE;
  const [pins, setPins] = useState({});
  const [target, setTarget] = useState(() => nextMonth(SAMPLE.year, SAMPLE.month));
  const [editor, setEditor] = useState(null);
  const [status, setStatus] = useState(null);

  const monthOptions = useMemo(() => monthOptionsFor(source), [source]);
  const n = daysInMonth(target.year, target.month);

  const analyses = useMemo(
    () => source.staff.map((p) => analyzePerson(p.days, source.year, source.month)),
    [source]
  );
  const teams = useMemo(() => groupTeams(analyses), [analyses]);
  const staff = useMemo(() => source.staff.map((p, i) => ({ ...p, role: analyses[i].role })), [source, analyses]);

  // rest-day target = median rest days in the source month, scaled to the new month length
  const offs = analyses.map((a) => a.offCount).sort((a, b) => a - b);
  const med = offs[Math.floor(offs.length / 2)] ?? 8;
  const targetOff = Math.round((med / (source.staff[0]?.days.length || 31)) * n) || 8;

  const result = useMemo(
    () => buildSchedule(source, target, staff, analyses, pins, {
      targetOff, maxConsecutive: DEFAULT_MAX_CONSECUTIVE, minPerShift: DEFAULT_MIN_PER_SHIFT,
    }),
    [source, target, staff, analyses, pins, targetOff]
  );

  const teamSummary = useMemo(() => {
    const map = {};
    teams.forEach((t, i) => {
      if (!t) return;
      map[t] = map[t] || { members: 0, rest: analyses[i].offResidues, firstIdx: i };
      map[t].members++;
    });
    return Object.entries(map).map(([team, v]) => {
      const row = result.grid[v.firstIdx];
      const restDays = [...new Set(row.map((c, d) => (!isWork(c) ? weekday(target.year, target.month, d + 1) : null)).filter((x) => x !== null))];
      const counts = {}; row.forEach((c, d) => { if (!isWork(c)) { const w = weekday(target.year, target.month, d + 1); counts[w] = (counts[w] || 0) + 1; } });
      const usual = restDays.sort((a, b) => (counts[b] - counts[a])).slice(0, 2).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      return { team, members: v.members, usual, start: row.find(isWork) };
    });
  }, [teams, analyses, result, target]);

  const floaterCount = analyses.filter((a) => a.role === "floater").length;
  const lowDays = result.coverage.filter((c) => WORK.some((s) => c[s] < DEFAULT_MIN_PER_SHIFT)).length;

  function onTargetChange(e) {
    const [y, m] = e.target.value.split("-").map(Number);
    setPins({});
    setTarget({ year: y, month: m });
  }

  async function onExport() {
    try {
      const buf = await buildWorkbook(source, target, staff, result.grid);
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      saveAs(blob, `Phan_Ca_Tren_Base_T${target.month}_${target.year}.xlsx`);
      setStatus({ kind: "ok", text: "Đã tạo xong file Excel." });
    } catch (err) {
      setStatus({ kind: "err", text: `Xuất file thất bại: ${err?.message || err}` });
    }
  }

  function setCell(i, d, code) {
    setPins((prev) => {
      const next = { ...prev, [i]: { ...(prev[i] || {}) } };
      if (code === null) delete next[i][d]; else next[i][d] = code;
      return next;
    });
    setEditor(null);
  }

  useEffect(() => {
    if (!editor) return;
    const close = (e) => { if (!e.target.closest?.(".pc-editor")) setEditor(null); };
    const esc = (e) => { if (e.key === "Escape") setEditor(null); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", esc); };
  }, [editor]);

  const pinCount = Object.values(pins).reduce((s, p) => s + Object.keys(p).length, 0);

  return (
    <div className="pc-app">
      <header className="pc-top">
        <div className="pc-title">
          <p className="pc-org">{source.dept || "Tổ Bảo vệ"}</p>
          <h1>Bảng phân ca tháng {target.month}/{target.year}</h1>
          <p className="pc-sub">
            Tiếp nối từ bảng chấm công {MONTHS[source.month - 1]} {source.year}: {source.staff.length} người,
            {" "}{teamSummary.length} tổ xoay ca và {floaterCount} người cơ động.
          </p>
        </div>
        <div className="pc-actions">
          <button className="pc-btn pc-primary" onClick={onExport}>Tải xuống Excel</button>
        </div>
      </header>

      {status && <div className={`pc-status pc-${status.kind}`} role="status">{status.text}<button onClick={() => setStatus(null)} aria-label="Đóng">×</button></div>}

      <section className="pc-controls">
        <label>
          <span>Tháng phân ca</span>
          <select value={`${target.year}-${target.month}`} onChange={onTargetChange}>
            {monthOptions.map((o) => (
              <option key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`}>
                {MONTHS[o.month - 1]} {o.year}
              </option>
            ))}
          </select>
          <small>Từ tháng kế tiếp đến hết năm {source.year + 1}</small>
        </label>
        {pinCount > 0 && <button className="pc-btn pc-ghost pc-small" onClick={() => setPins({})}>Xóa {pinCount} chỉnh sửa thủ công</button>}
        <div className="pc-legend">
          {["S", "C", "D", "O"].map((c) => <span key={c}><i className={`pc-chip pc-s-${c}`} />{NAME[c]}</span>)}
        </div>
      </section>

      <div className="pc-grid-wrap">
        <table className="pc-grid">
          <thead>
            <tr>
              <th className="pc-sticky pc-c-no">#</th>
              <th className="pc-sticky pc-c-name">Họ tên</th>
              {Array.from({ length: n }, (_, d) => {
                const wd = weekday(target.year, target.month, d + 1);
                return <th key={d} className={`${wd === 0 || wd === 6 ? "pc-wknd" : ""} ${d === 0 ? "pc-first" : ""}`}><span>{WEEKDAY_EN[wd]}</span>{d + 1}</th>;
              })}
              <th className="pc-sum">Ngày</th>
              <th className="pc-sum">Giờ</th>
              <th className="pc-sum">Đêm</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((p, i) => {
              const st = personStats(result.grid[i]);
              return (
                <tr key={i}>
                  <td className="pc-sticky pc-c-no">{p.stt}</td>
                  <td className="pc-sticky pc-c-name"><b>{p.name}</b><em>{p.title}</em></td>
                  {result.grid[i].map((c, d) => {
                    const wd = weekday(target.year, target.month, d + 1);
                    return (
                      <td key={d} className={`${wd === 0 || wd === 6 ? "pc-wknd" : ""} ${d === 0 ? "pc-first" : ""}`}>
                        <button className={`pc-cell pc-s-${c} ${result.locked[i][d] ? "pc-pinned" : ""}`}
                          aria-label={`${p.name}, ngày ${d + 1}: ${NAME[c]}`}
                          onClick={(e) => {
                            const r = e.currentTarget.getBoundingClientRect();
                            setEditor({ i, d, x: r.left + r.width / 2, y: r.bottom + 6 });
                          }}>{LABEL[c]}</button>
                      </td>
                    );
                  })}
                  <td className="pc-sum">{st.work}</td>
                  <td className="pc-sum">{st.hours}</td>
                  <td className="pc-sum">{st.nights}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            {WORK.map((s, k) => (
              <tr key={s} className={k === 0 ? "pc-cov-first" : ""}>
                <td className="pc-sticky pc-c-no" />
                <td className="pc-sticky pc-c-name pc-cov-label" colSpan={1}><i className={`pc-chip pc-s-${s}`} />{NAME[s].split(" ")[0]} trực</td>
                {result.coverage.map((c, d) => (
                  <td key={d} className={`pc-cov ${c[s] < DEFAULT_MIN_PER_SHIFT ? "pc-low" : ""} ${d === 0 ? "pc-first" : ""}`}>{c[s]}</td>
                ))}
                <td className="pc-sum" colSpan={3} />
              </tr>
            ))}
          </tfoot>
        </table>
      </div>

      {editor && (
        <div className="pc-editor" style={{ left: Math.min(Math.max(editor.x, 120), window.innerWidth - 120), top: editor.y }}>
          <p>{staff[editor.i].name}, {editor.d + 1}/{target.month}</p>
          <div>
            {["S", "C", "D", "O"].map((c) => (
              <button key={c} className={`pc-opt pc-s-${c}`} onClick={() => setCell(editor.i, editor.d, c)}>{c === "O" ? "Nghỉ" : LABEL[c]}</button>
            ))}
          </div>
          {result.locked[editor.i][editor.d] && <button className="pc-unpin" onClick={() => setCell(editor.i, editor.d, null)}>Để chương trình tự quyết định</button>}
        </div>
      )}

      <section className="pc-notes">
        <div>
          <h2>Cách hệ thống đọc chu kỳ xoay ca</h2>
          <p>Mỗi người tiến một bước mỗi ngày theo chu kỳ <b>6–12 → đêm → 12–18</b>, ngày nghỉ vẫn tính là một bước, nên các tổ không bao giờ trùng ca nhau. Khi một tổ nghỉ, người cơ động sẽ trực thay ca đó.</p>
          <ul className="pc-teams">
            {teamSummary.map((t) => (
              <li key={t.team}><span className="pc-team-badge pc-team-static">{t.team}</span>{t.members} người, thường nghỉ vào {t.usual.map((w) => WEEKDAY_EN[w]).join(" và ")}, bắt đầu tháng bằng ca {NAME[t.start]?.toLowerCase()}</li>
            ))}
            <li><span className="pc-team-badge pc-floater pc-team-static">Cơ động</span>{floaterCount} người không có nhịp cố định, được xếp theo ngày vào ca đang mỏng người nhất</li>
          </ul>
        </div>
        <div>
          <h2>Kiểm tra</h2>
          <p className={lowDays ? "pc-warn" : ""}>
            {lowDays ? `${lowDays} ngày có ca dưới ${DEFAULT_MIN_PER_SHIFT} người (đánh dấu đỏ ở các hàng dưới cùng).` : `Mọi ca đều có ít nhất ${DEFAULT_MIN_PER_SHIFT} người.`}
          </p>
          {result.notes.length > 0 && (
            <details>
              <summary>{result.notes.length} điều chỉnh tự động</summary>
              <ul>{result.notes.map((t, k) => <li key={k}>{t}</li>)}</ul>
            </details>
          )}
          <p className="pc-hint">Bấm vào một ô để chỉnh tay (đổi ca, cho nghỉ); phần còn lại của tháng sẽ tự tính lại quanh ô đó. Bấm vào nhãn tổ để chuyển người giữa tổ xoay ca và cơ động.</p>
        </div>
      </section>
    </div>
  );
}

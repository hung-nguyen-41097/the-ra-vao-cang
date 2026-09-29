// ============================================================================
//  Shift engine — continues the "Phân ca trên Base" rotation into a new month
// ============================================================================
//  Codes:  S = 6h-12h   C = 12h-18h   D = 18h-22h + 22h-6h (night)   O = off   P = leave
//  Rotation observed in the source file: every worker cycles S → D → C → S …
//  one step per calendar day; off days still consume a step, so the three
//  teams always stay on different shifts.  Teams take 2 days off per week at
//  fixed weekdays.  "Floaters" (irregular rows) fill whichever shift a resting
//  team leaves uncovered.
// ============================================================================

export const CYCLE = ["S", "D", "C"];
export const WORK = ["S", "C", "D"];
export const SHIFT_TEXT = { S: "6h-12h", C: "12h-18h", D: "22h-6h\n18h-22h", O: 0, P: "P" };
export const SHIFT_HOURS = { S: 6, C: 6, D: 12, O: 0, P: 0 };
export const WEEKDAY_VI = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

const mod = (a, n) => ((a % n) + n) % n;
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-12
export const dayIndex = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / 86400000); // absolute day number
export const weekday = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
export const nextMonth = (y, m) => (m === 12 ? { year: y + 1, month: 1 } : { year: y, month: m + 1 });
export const isWork = (c) => c === "S" || c === "C" || c === "D";

// Map a raw Excel cell to a code
export function parseCell(v) {
  const s = String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!s || s === "0") return "O";
  if (s.includes("22h") || s.includes("18h-22h")) return "D";
  if (s.includes("6h-12h")) return "S";
  if (s.includes("12h-18h")) return "C";
  if (s === "p" || s.startsWith("phép") || s.startsWith("phep")) return "P";
  return "O";
}

// --------------------------------------------------------------------------
//  1. Learn each person's rhythm from the source month
// --------------------------------------------------------------------------
export function analyzePerson(days, year, month) {
  const t0 = dayIndex(year, month, 1);
  const n = days.length;

  // Phase: which step of S→D→C the person is on. Recent days weigh more,
  // because hand edits late in the month decide where next month starts.
  const phaseW = [0, 0, 0];
  const phaseAll = [0, 0, 0];
  let workCount = 0;
  for (let i = 0; i < n; i++) {
    const c = days[i];
    if (!CYCLE.includes(c)) continue;
    const k = mod(CYCLE.indexOf(c) - (t0 + i), 3);
    phaseAll[k] += 1;
    phaseW[k] += 1 + (i / n) * 3;
    workCount++;
  }
  const phase = phaseW.indexOf(Math.max(...phaseW));
  const phaseFit = workCount ? phaseAll[phase] / workCount : 0;

  // Weekly rest days: the two weekdays (mod 7 of absolute day) most often off
  const offW = Array(7).fill(0);
  let offCount = 0;
  for (let i = 0; i < n; i++) {
    if (!isWork(days[i])) { offW[mod(t0 + i, 7)]++; offCount++; }
  }
  const ranked = offW.map((w, r) => [w, r]).sort((a, b) => b[0] - a[0]);
  const offResidues = [ranked[0][1], ranked[1][1]].sort((a, b) => a - b);
  const offFit = offCount ? (ranked[0][0] + ranked[1][0]) / offCount : 0;

  const regular = phaseFit >= 0.8 && offFit >= 0.6;
  return { phase, phaseFit, offResidues, offFit, offCount, workCount, role: regular ? "team" : "floater" };
}

// Group regular staff into teams by identical (phase, weekly rest days)
export function groupTeams(analyses) {
  const keys = {};
  let next = 0;
  return analyses.map((a) => {
    if (a.role !== "team") return null;
    const key = a.phase + "|" + a.offResidues.join(",");
    if (!(key in keys)) keys[key] = String.fromCharCode(65 + next++);
    return keys[key];
  });
}

// --------------------------------------------------------------------------
//  2. Build next month
// --------------------------------------------------------------------------
//  staff:  [{ name, title, days: "SDC…" (source month), role: "team"|"floater" }]
//  pins:   { [personIdx]: { [dayIdx]: code } }  — manual overrides, always kept
//  opts:   { targetOff, maxConsecutive, minPerShift }
export function buildSchedule(source, target, staff, analyses, pins = {}, opts = {}) {
  const { year, month } = target;
  const n = daysInMonth(year, month);
  const t0 = dayIndex(year, month, 1);
  const maxConsec = opts.maxConsecutive ?? 6;
  const minPer = opts.minPerShift ?? 2;
  const targetOff = opts.targetOff ?? 9;

  const grid = staff.map(() => Array(n).fill(null));
  const locked = staff.map(() => Array(n).fill(false));
  const notes = []; // human-readable log of automatic adjustments

  // tail = trailing context from the source month (for rest / streak rules)
  const tail = staff.map((p) => p.days);
  const prevCode = (i, d) => (d > 0 ? grid[i][d - 1] : tail[i][tail[i].length - 1]);
  const streakBefore = (i, d) => {
    let s = 0;
    for (let k = d - 1; k >= 0; k--) { if (isWork(grid[i][k])) s++; else return s; }
    const src = tail[i];
    for (let k = src.length - 1; k >= 0; k--) { if (isWork(src[k])) s++; else break; }
    return s;
  };

  // Pins first
  staff.forEach((_, i) => {
    const p = pins[i] || {};
    for (const d in p) { grid[i][+d] = p[d]; locked[i][+d] = true; }
  });

  // --- Step A: rotating teams follow their phase + weekly rest days
  staff.forEach((p, i) => {
    if (p.role !== "team") return;
    const a = analyses[i];
    for (let d = 0; d < n; d++) {
      if (locked[i][d]) continue;
      const t = t0 + d;
      grid[i][d] = a.offResidues.includes(mod(t, 7)) ? "O" : CYCLE[mod(t + a.phase, 3)];
    }
  });

  // --- Step B: safety rules for teams (no S straight after a night, max streak)
  staff.forEach((p, i) => {
    if (p.role !== "team") return;
    for (let d = 0; d < n; d++) {
      if (locked[i][d]) continue;
      if (grid[i][d] === "S" && prevCode(i, d) === "D") {
        grid[i][d] = "O";
        notes.push(`${p.name}: day ${d + 1} set to off (night shift the day before)`);
      } else if (isWork(grid[i][d]) && streakBefore(i, d) >= maxConsec) {
        grid[i][d] = "O";
        notes.push(`${p.name}: day ${d + 1} set to off (${maxConsec}+ days in a row)`);
      }
    }
  });

  const coverage = () => {
    const cov = Array.from({ length: n }, () => ({ S: 0, C: 0, D: 0 }));
    grid.forEach((row) => row.forEach((c, d) => { if (isWork(c)) cov[d][c]++; }));
    return cov;
  };

  // --- Step C: floaters fill the thinnest shift each day.
  //     Rest days are staggered so the floaters never all rest together.
  const floaters = staff.map((p, i) => (p.role === "floater" ? i : -1)).filter((i) => i >= 0);
  const floaterMax = Math.min(maxConsec, opts.floaterMaxConsecutive ?? 4);
  const offsSoFar = {};
  floaters.forEach((i) => (offsSoFar[i] = 0));
  const cov = coverage();
  const typical = median(cov.flatMap((c) => WORK.map((s) => c[s])));
  for (let d = 0; d < n; d++) {
    const free = floaters.filter((i) => {
      if (locked[i][d]) { if (!isWork(grid[i][d])) offsSoFar[i]++; else cov[d][grid[i][d]]++; return false; }
      return true;
    });
    const thinnest = Math.min(...WORK.map((s) => cov[d][s]));
    const gap = thinnest < typical * 0.6; // a team rests on this shift today
    const daysLeft = n - d;
    const urgency = (i) => {
      const expected = (targetOff * (d + 1)) / n;
      return (expected - offsSoFar[i]) + streakBefore(i, d) * 0.4;
    };
    const rest = new Set();
    if (!gap) free.forEach((i) => rest.add(i));
    else {
      const byNeed = [...free].sort((a, b) => urgency(b) - urgency(a));
      // hard needs: streak limit or not enough days left to reach the rest target
      byNeed.forEach((i) => {
        if (streakBefore(i, d) >= floaterMax || targetOff - offsSoFar[i] >= daysLeft) rest.add(i);
      });
      // one extra, pace-based rest day while at least two others keep working
      const extra = byNeed.find((i) => !rest.has(i) && urgency(i) >= 1);
      if (extra !== undefined && free.length - rest.size - 1 >= 2) rest.add(extra);
      // never leave the gap completely empty because of soft needs
      if (rest.size === free.length && free.length > 0) {
        const keep = byNeed.slice().reverse().find((i) => streakBefore(i, d) < floaterMax);
        if (keep !== undefined) rest.delete(keep);
      }
    }
    // workers take the thinnest shift they are allowed to (no S right after D)
    const workers = free.filter((i) => !rest.has(i));
    for (const i of workers) {
      const allowed = WORK.filter((s) => !(s === "S" && prevCode(i, d) === "D"));
      const best = allowed.sort((a, b) => cov[d][a] - cov[d][b])[0];
      grid[i][d] = best; cov[d][best]++;
    }
    for (const i of rest) { grid[i][d] = "O"; offsSoFar[i]++; }
  }

  // --- Step D: top up rest days for anyone below the target,
  //     taking them from the most over-staffed shift of the month
  const offCount = (i) => grid[i].filter((c) => !isWork(c)).length;
  const cov2 = coverage();
  for (let guard = 0; guard < 2000; guard++) {
    let best = null;
    staff.forEach((p, i) => {
      if (offCount(i) >= targetOff) return;
      for (let d = 0; d < n; d++) {
        const c = grid[i][d];
        if (locked[i][d] || !isWork(c)) continue;
        if (cov2[d][c] - 1 < minPer) continue;
        // prefer busy shifts, and days far from existing rest days
        let gapDist = 9;
        for (let k = 1; k < 4; k++) {
          if ((d - k >= 0 && !isWork(grid[i][d - k])) || (d + k < n && !isWork(grid[i][d + k]))) { gapDist = k; break; }
        }
        const score = cov2[d][c] * 10 + gapDist;
        if (!best || score > best.score) best = { i, d, c, score };
      }
    });
    if (!best) break;
    grid[best.i][best.d] = "O";
    cov2[best.d][best.c]--;
  }

  // --- Step E: after removing days, a C→S transition may have turned into D→…
  //     (not possible: only work→off changes). Re-validate rest rule anyway.
  staff.forEach((p, i) => {
    for (let d = 0; d < n; d++) {
      if (!locked[i][d] && grid[i][d] === "S" && prevCode(i, d) === "D") grid[i][d] = "O";
    }
  });

  return { grid, locked, coverage: coverage(), notes, daysInMonth: n };
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

export function personStats(row) {
  const work = row.filter(isWork).length;
  const hours = row.reduce((h, c) => h + (SHIFT_HOURS[c] || 0), 0);
  const nights = row.filter((c) => c === "D").length;
  return { work, off: row.length - work, hours, nights };
}

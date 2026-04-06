/**
 * SysPulse — Dashboard JavaScript
 * ================================
 * Handles:
 *  • Login / logout (JWT-lite token stored in sessionStorage)
 *  • Real-time polling (system stats + process list every 2 s)
 *  • Chart.js charts (CPU history sparkline, mem/disk doughnuts)
 *  • Process search, filter, sort, kill
 *  • Dark/light theme toggle
 *  • CSV export
 *  • Toast notifications + alert banner
 */

"use strict";

/* ── Constants ─────────────────────────────────────────── */
const API            = "";          // same-origin; change to "http://localhost:5000" if separate
const POLL_INTERVAL  = 2000;        // ms between full refreshes
const CPU_WARN       = 50;
const CPU_CRIT       = 80;
const MEM_WARN       = 50;
const MEM_CRIT       = 80;

/* ── State ─────────────────────────────────────────────── */
let authToken   = sessionStorage.getItem("sysToken") || null;
let username    = sessionStorage.getItem("sysUser")  || "";
let pollTimer   = null;
let cpuChart    = null;
let memChart    = null;
let diskChart   = null;
let cpuHistory  = [];               // {time, value}[]

/* ══════════════════════════════════════════════════════════
   BOOT
══════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  if (authToken) {
    showApp();
  } else {
    showLogin();
  }

  // Clock tick
  updateClock();
  setInterval(updateClock, 1000);

  // Wire up static buttons
  document.getElementById("loginBtn").addEventListener("click",    doLogin);
  document.getElementById("logoutBtn").addEventListener("click",   doLogout);
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);
  document.getElementById("exportBtn").addEventListener("click",   exportCSV);
  document.getElementById("refreshBtn").addEventListener("click",  () => fetchAll());
  document.getElementById("searchBox").addEventListener("input",   () => fetchProcesses());
  document.getElementById("sortSelect").addEventListener("change", () => fetchProcesses());

  // Allow Enter key on login form
  document.getElementById("loginPass").addEventListener("keydown", e => {
    if (e.key === "Enter") doLogin();
  });
});

/* ── Clock ──────────────────────────────────────────────── */
function updateClock() {
  const now = new Date();
  document.getElementById("sysTime").textContent =
    now.toLocaleTimeString("en-GB", { hour12: false });
}

/* ══════════════════════════════════════════════════════════
   AUTH
══════════════════════════════════════════════════════════ */
async function doLogin() {
  const user = document.getElementById("loginUser").value.trim();
  const pass = document.getElementById("loginPass").value;
  const errEl = document.getElementById("loginError");

  errEl.textContent = "";
  if (!user || !pass) { errEl.textContent = "Please enter credentials."; return; }

  try {
    const res  = await fetch(`${API}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user, password: pass })
    });
    const data = await res.json();

    if (data.success) {
      authToken = data.token;
      username  = data.username;
      sessionStorage.setItem("sysToken", authToken);
      sessionStorage.setItem("sysUser",  username);
      showApp();
    } else {
      errEl.textContent = data.message || "Login failed.";
    }
  } catch (err) {
    errEl.textContent = "Cannot reach server. Is Flask running?";
  }
}

async function doLogout() {
  try {
    await fetch(`${API}/api/logout`, {
      method: "POST",
      headers: { "X-Auth-Token": authToken }
    });
  } catch (_) {}
  authToken = null; username = "";
  sessionStorage.removeItem("sysToken");
  sessionStorage.removeItem("sysUser");
  stopPolling();
  document.getElementById("app").classList.add("hidden");
  document.getElementById("loginOverlay").classList.remove("hidden");
}

/* ══════════════════════════════════════════════════════════
   APP INIT
══════════════════════════════════════════════════════════ */
function showLogin() {
  document.getElementById("loginOverlay").classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
}

function showApp() {
  document.getElementById("loginOverlay").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("currentUser").textContent = username || "admin";

  initCharts();
  fetchAll();
  startPolling();
}

/* ── Polling ────────────────────────────────────────────── */
function startPolling() {
  stopPolling();
  pollTimer = setInterval(fetchAll, POLL_INTERVAL);
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

/** Main refresh: fetch system stats + process list in parallel */
async function fetchAll() {
  await Promise.all([ fetchSystem(), fetchProcesses() ]);
}

/* ══════════════════════════════════════════════════════════
   SYSTEM STATS
══════════════════════════════════════════════════════════ */
async function fetchSystem() {
  try {
    const res  = await fetch(`${API}/api/system`);
    if (!res.ok) return;
    const d    = await res.json();
    renderSystem(d);

    // Fetch CPU history for sparkline
    const hr = await fetch(`${API}/api/cpu-history`);
    if (hr.ok) {
      cpuHistory = await hr.json();
      updateCpuChart();
    }
  } catch (err) {
    console.warn("System fetch error:", err);
  }
}

function renderSystem(d) {
  // ── CPU
  const cpu = d.cpu;
  setStatCard("cpuCard", cpu.percent, CPU_WARN, CPU_CRIT);
  document.getElementById("cpuPct").textContent  = cpu.percent.toFixed(1) + "%";
  document.getElementById("cpuFreq").textContent =
    (cpu.freq_mhz ? cpu.freq_mhz + " MHz · " : "") + cpu.count + " cores";
  setBar("cpuBar", cpu.percent, CPU_WARN, CPU_CRIT);

  // ── Memory
  const mem = d.memory;
  setStatCard("memCard", mem.percent, MEM_WARN, MEM_CRIT);
  document.getElementById("memPct").textContent    = mem.percent.toFixed(1) + "%";
  document.getElementById("memDetail").textContent =
    mem.used_gb.toFixed(1) + " / " + mem.total_gb.toFixed(1) + " GB";
  setBar("memBar", mem.percent, MEM_WARN, MEM_CRIT);
  updateMemChart(mem);

  // ── Disk
  if (d.disk) {
    const disk = d.disk;
    setStatCard("diskCard", disk.percent, 60, 85);
    document.getElementById("diskPct").textContent    = disk.percent.toFixed(1) + "%";
    document.getElementById("diskDetail").textContent =
      disk.used.toFixed(1) + " / " + disk.total.toFixed(1) + " GB";
    setBar("diskBar", disk.percent, 60, 85);
    updateDiskChart(disk);
  }

  // ── Network
  document.getElementById("netSent").textContent = d.network.bytes_sent_mb.toFixed(1) + " MB";
  document.getElementById("netRecv").textContent = d.network.bytes_recv_mb.toFixed(1) + " MB";

  // ── Uptime
  document.getElementById("uptime").textContent = "↑ " + d.uptime;
}

/** Set card border/glow based on usage level */
function setStatCard(id, value, warnThreshold, critThreshold) {
  const el = document.getElementById(id);
  el.classList.remove("warn", "crit");
  if (value >= critThreshold) el.classList.add("crit");
  else if (value >= warnThreshold) el.classList.add("warn");
}

/** Set progress bar width + colour */
function setBar(id, pct, warn, crit) {
  const bar = document.getElementById(id);
  bar.style.width = Math.min(pct, 100) + "%";
  bar.classList.remove("warn", "crit");
  if (pct >= crit)  bar.classList.add("crit");
  else if (pct >= warn) bar.classList.add("warn");
}

/* ══════════════════════════════════════════════════════════
   PROCESS LIST
══════════════════════════════════════════════════════════ */
async function fetchProcesses() {
  const search = document.getElementById("searchBox").value.trim();
  const sort   = document.getElementById("sortSelect").value;
  const order  = (sort === "name") ? "asc" : "desc";

  try {
    const url = `${API}/api/processes?search=${encodeURIComponent(search)}&sort=${sort}&order=${order}`;
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    renderProcesses(data);
  } catch (err) {
    console.warn("Process fetch error:", err);
  }
}

function renderProcesses({ count, processes }) {
  document.getElementById("procCount").textContent = count;

  const tbody = document.getElementById("procTableBody");
  if (!processes || processes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="loading-row">No processes found.</td></tr>`;
    return;
  }

  // Check for high-usage alerts
  const crits = processes.filter(p => p.cpu_level === "critical" || p.mem_level === "critical");
  renderAlerts(crits);

  // Build table rows
  tbody.innerHTML = processes.map(p => {
    const rowClass = p.cpu_level === "critical" || p.mem_level === "critical"
      ? "row-crit"
      : (p.cpu_level === "warning" || p.mem_level === "warning") ? "row-warn" : "";

    const cpuClass = `cpu-${p.cpu_level}`;
    const memClass = `cpu-${p.mem_level}`;

    return `
    <tr class="${rowClass}">
      <td class="pid-cell">${p.pid}</td>
      <td class="name-cell" title="${p.name}">${truncate(p.name, 22)}</td>
      <td>${statusBadge(p.status)}</td>
      <td class="${cpuClass}">${p.cpu.toFixed(1)}%</td>
      <td class="${cpuClass}">${p.mem_mb.toFixed(1)}</td>
      <td class="${memClass}">${p.mem_pct.toFixed(1)}%</td>
      <td class="pid-cell">${truncate(p.user, 14)}</td>
      <td class="pid-cell">${p.threads}</td>
      <td class="pid-cell">${p.started}</td>
      <td>
        <button class="btn-kill" onclick="killProcess(${p.pid}, '${escapeHtml(p.name)}')">
          KILL
        </button>
      </td>
    </tr>`;
  }).join("");
}

function statusBadge(status) {
  const map = {
    running:  "status-running",
    sleeping: "status-sleeping",
    stopped:  "status-stopped",
    zombie:   "status-zombie",
    dead:     "status-dead"
  };
  const cls = map[status] || "status-default";
  return `<span class="status-badge ${cls}">${status}</span>`;
}

function renderAlerts(crits) {
  const banner = document.getElementById("alertBanner");
  if (crits.length === 0) { banner.classList.add("hidden"); return; }

  banner.classList.remove("hidden");
  const names = crits.slice(0, 4).map(p => `${p.name} (PID ${p.pid})`).join(", ");
  const more  = crits.length > 4 ? ` +${crits.length - 4} more` : "";
  banner.innerHTML = `⚠ HIGH USAGE ALERT: ${names}${more}`;
}

/* ── Kill process ──────────────────────────────────────── */
async function killProcess(pid, name) {
  if (!confirm(`Terminate "${name}" (PID ${pid})?\n\nThis cannot be undone.`)) return;

  try {
    const res  = await fetch(`${API}/api/processes/${pid}/kill`, {
      method: "POST",
      headers: { "X-Auth-Token": authToken }
    });
    const data = await res.json();
    showToast(data.message, data.success ? "success" : "error");
    if (data.success) fetchProcesses();
  } catch (err) {
    showToast("Failed to reach server.", "error");
  }
}

/* ══════════════════════════════════════════════════════════
   CHARTS  (Chart.js)
══════════════════════════════════════════════════════════ */
function chartDefaults() {
  // Apply dark/light theme colours
  const dark = document.documentElement.getAttribute("data-theme") !== "light";
  return {
    gridColor:   dark ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.07)",
    textColor:   dark ? "#5a6680" : "#8891aa",
    accentColor: dark ? "#00e5ff" : "#0077cc"
  };
}

function initCharts() {
  const { gridColor, textColor, accentColor } = chartDefaults();

  /* ── CPU sparkline ── */
  const cpuCtx = document.getElementById("cpuChart").getContext("2d");
  cpuChart = new Chart(cpuCtx, {
    type: "line",
    data: {
      labels:   [],
      datasets: [{
        label:           "CPU %",
        data:            [],
        borderColor:     accentColor,
        backgroundColor: accentColor + "22",
        borderWidth:     2,
        fill:            true,
        tension:         0.4,
        pointRadius:     0
      }]
    },
    options: {
      animation:   false,
      responsive:  true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          display: false,
          grid:  { color: gridColor }
        },
        y: {
          min: 0, max: 100,
          grid:  { color: gridColor },
          ticks: { color: textColor, font: { family: "Space Mono", size: 10 },
                   callback: v => v + "%" }
        }
      }
    }
  });

  /* ── Memory doughnut ── */
  const memCtx = document.getElementById("memChart").getContext("2d");
  memChart = new Chart(memCtx, {
    type: "doughnut",
    data: {
      labels:   ["Used", "Free"],
      datasets: [{ data: [0, 100],
        backgroundColor: [accentColor, gridColor],
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      animation: false, responsive: true, maintainAspectRatio: true,
      cutout: "72%",
      plugins: {
        legend: { position: "bottom",
          labels: { color: textColor, font: { family: "Space Mono", size: 10 }, boxWidth: 10 }
        }
      }
    }
  });

  /* ── Disk doughnut ── */
  const diskCtx = document.getElementById("diskChart").getContext("2d");
  diskChart = new Chart(diskCtx, {
    type: "doughnut",
    data: {
      labels:   ["Used", "Free"],
      datasets: [{ data: [0, 100],
        backgroundColor: ["#7b61ff", gridColor],
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      animation: false, responsive: true, maintainAspectRatio: true,
      cutout: "72%",
      plugins: {
        legend: { position: "bottom",
          labels: { color: textColor, font: { family: "Space Mono", size: 10 }, boxWidth: 10 }
        }
      }
    }
  });
}

function updateCpuChart() {
  if (!cpuChart || cpuHistory.length === 0) return;
  cpuChart.data.labels   = cpuHistory.map(h => h.time);
  cpuChart.data.datasets[0].data = cpuHistory.map(h => h.value);
  cpuChart.update("none");
}

function updateMemChart(mem) {
  if (!memChart) return;
  memChart.data.datasets[0].data = [mem.percent, 100 - mem.percent];
  memChart.data.labels = [
    `Used ${mem.used_gb.toFixed(1)} GB`,
    `Free ${mem.available_gb.toFixed(1)} GB`
  ];
  memChart.update("none");
}

function updateDiskChart(disk) {
  if (!diskChart) return;
  diskChart.data.datasets[0].data = [disk.percent, 100 - disk.percent];
  diskChart.data.labels = [
    `Used ${disk.used.toFixed(1)} GB`,
    `Free ${disk.free.toFixed(1)} GB`
  ];
  diskChart.update("none");
}

/* ══════════════════════════════════════════════════════════
   THEME TOGGLE
══════════════════════════════════════════════════════════ */
function toggleTheme() {
  const html  = document.documentElement;
  const isDark = html.getAttribute("data-theme") !== "light";
  html.setAttribute("data-theme", isDark ? "light" : "dark");

  // Recreate charts with new colours
  if (cpuChart)  { cpuChart.destroy();  cpuChart  = null; }
  if (memChart)  { memChart.destroy();  memChart  = null; }
  if (diskChart) { diskChart.destroy(); diskChart = null; }
  initCharts();
  if (cpuHistory.length) updateCpuChart();
}

/* ══════════════════════════════════════════════════════════
   EXPORT CSV
══════════════════════════════════════════════════════════ */
function exportCSV() {
  window.open(`${API}/api/export/csv`, "_blank");
  showToast("CSV export started.", "success");
}

/* ══════════════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════════════ */
let _toastTimer = null;
function showToast(msg, type = "") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = `toast ${type}`;
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.classList.add("hidden"); }, 3500);
}

/* ══════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════ */
function truncate(str, n) {
  return str && str.length > n ? str.slice(0, n) + "…" : (str || "");
}
function escapeHtml(s) {
  return String(s).replace(/'/g, "\\'");
}

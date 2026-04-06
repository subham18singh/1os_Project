# 🖥️ SysPulse — Real-Time Process Monitoring Dashboard

A college-level full-stack project that demonstrates **Operating Systems** concepts, **real-time data handling**, and **system monitoring** in a polished web dashboard.

---

## 📁 Project Structure

```
process-monitor/
├── backend/
│   ├── app.py              ← Flask API server (all endpoints)
│   └── requirements.txt    ← Python dependencies
│
├── frontend/
│   ├── templates/
│   │   └── index.html      ← Main HTML page (served by Flask)
│   └── static/
│       ├── css/
│       │   └── dashboard.css   ← Full styling (dark + light theme)
│       └── js/
│           └── dashboard.js    ← All frontend logic + Chart.js
│
├── start.sh                ← One-command startup script
└── README.md               ← This file
```

---

## ⚙️ Setup Instructions (Step by Step)

### Prerequisites
- **Python 3.8+** (check: `python3 --version`)
- **pip** (comes with Python)

### Step 1 — Clone / Download the project
```bash
# Place all files in a folder called process-monitor/
cd process-monitor
```

### Step 2 — Install Python dependencies
```bash
cd backend
pip install -r requirements.txt
```

This installs:
| Package | Purpose |
|---------|---------|
| `flask` | Web framework — serves the HTML and REST API |
| `flask-cors` | Allows the browser to call the API |
| `psutil` | Cross-platform system/process info library |

### Step 3 — Run the server
```bash
python app.py
```

You will see:
```
🚀  Process Monitor running at  http://127.0.0.1:5000
```

### Step 4 — Open the dashboard
Open your browser and go to: **http://localhost:5000**

Log in with:
- **Username:** `admin`
- **Password:** `admin123`

---

## 🔑 Features Overview

| Feature | Description |
|---------|-------------|
| **Process Table** | Shows PID, name, CPU%, memory, status, user, threads, start time |
| **Kill Process** | Terminate any process (SIGTERM → SIGKILL) |
| **Real-time Updates** | Auto-refreshes every 2 seconds |
| **CPU History Chart** | Sparkline of last 60 seconds of CPU usage |
| **Memory Doughnut** | Used vs free RAM |
| **Disk Doughnut** | Used vs free disk space |
| **Search & Filter** | Filter processes by name or PID instantly |
| **Sort** | Sort by CPU, memory, PID, or name |
| **Alerts** | Yellow/red highlights for high-usage processes |
| **Alert Banner** | Top-of-table warning listing critical processes |
| **CSV Export** | Download all processes as a CSV file |
| **Dark/Light Mode** | Toggle with the ◑ button |
| **Auth (demo)** | Login system with SHA-256 hashed passwords |

---

## ⚡ How Real-Time Updates Work

```
Browser                          Flask Server
  │                                   │
  │  1. Page loads                    │
  │──────────────────────────────────►│
  │◄──────────────────────────────────│ HTML/CSS/JS served
  │                                   │
  │  2. JS starts setInterval(2000ms) │
  │                                   │
  │  3. Every 2 seconds:              │
  │──── GET /api/system ─────────────►│ psutil.cpu_percent()
  │◄──────────────────────────────────│ psutil.virtual_memory()
  │                                   │
  │──── GET /api/processes ──────────►│ psutil.process_iter()
  │◄──────────────────────────────────│ JSON list of processes
  │                                   │
  │  4. DOM is updated with new data  │
  │  5. Charts are re-rendered        │
```

**Key concept — non-blocking polling:**  
JavaScript's `setInterval` runs a callback every N milliseconds without freezing the page. Each callback fires two `fetch()` calls (Promises) in **parallel** using `Promise.all()`, so the UI stays responsive.

**Server-side — background CPU recorder:**  
A Python `threading.Thread` runs in the background every second, calling `psutil.cpu_percent(interval=1)` and appending to a `CPU_HISTORY` list. The `/api/cpu-history` endpoint returns this list for the sparkline chart.

---

## 🏗️ OS Concepts Demonstrated

| Concept | Where |
|---------|-------|
| **Process states** | `status` field (running, sleeping, stopped, zombie) |
| **PID** | Unique identifier for each process |
| **CPU scheduling** | `cpu_percent` shows how much CPU time a process gets |
| **Virtual memory** | `memory_percent` and RSS (Resident Set Size) |
| **Signals** | `SIGTERM` (graceful stop) and `SIGKILL` (force stop) |
| **Threads** | `num_threads` per process |
| **File system** | Disk usage via `psutil.disk_usage()` |
| **System uptime** | `psutil.boot_time()` |

---

## 🔌 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/login` | Authenticate user |
| `POST` | `/api/logout` | Invalidate session |
| `GET`  | `/api/system` | CPU, memory, disk, network stats |
| `GET`  | `/api/processes` | Process list (supports `?search=`, `?sort=`, `?order=`) |
| `POST` | `/api/processes/<pid>/kill` | Terminate a process |
| `GET`  | `/api/cpu-history` | Last 60 data points of CPU % |
| `GET`  | `/api/export/csv` | Download process list as CSV |

---


## 🛠 Troubleshooting

| Problem | Solution |
|---------|---------|
| `ModuleNotFoundError: psutil` | Run `pip install psutil` |
| `Permission denied` when killing | Run Python as root / sudo |
| Dashboard shows "Cannot reach server" | Make sure Flask is running on port 5000 |
| CPU always shows 0% | First poll is always 0 — wait one cycle |
| Port 5000 already in use | Change `port=5000` in `app.py` to another port |

---

## 📚 Technologies Used

| Layer | Technology | Reason |
|-------|-----------|--------|
| Backend | Python 3 + Flask | Simple, beginner-friendly web framework |
| System data | psutil | Cross-platform process/system library |
| Frontend | Vanilla HTML/CSS/JS | No build step required |
| Charts | Chart.js 4 | Easy-to-use, beautiful charts |
| Fonts | Google Fonts | Barlow Condensed + Space Mono |

---

*Built as a college OS project demonstrating process management, real-time data, and full-stack development.*

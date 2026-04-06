"""
Real-Time Process Monitoring Dashboard - Backend
================================================
Flask API that exposes system/process information via REST endpoints.
Uses psutil for cross-platform system stats collection.
"""

from flask import Flask, jsonify, request, render_template, send_from_directory
try:
    from flask_cors import CORS
    HAS_CORS = True
except ImportError:
    HAS_CORS = False          # Optional; not needed when Flask serves the frontend
import psutil
import signal
import os
import datetime
import csv
import io
import json
import hashlib
import time

app = Flask(
    __name__,
    template_folder="../frontend/templates",
    static_folder="../frontend/static"
)
if HAS_CORS:
    CORS(app)  # Allow cross-origin requests from the frontend

# ──────────────────────────────────────────────
# Simple in-memory "auth" (demo / college-level)
# Username: admin  |  Password: admin123
# ──────────────────────────────────────────────
USERS = {
    "admin": hashlib.sha256("admin123".encode()).hexdigest()
}
SESSIONS = {}   # token -> username

# Alert thresholds (percent)
CPU_WARN  = 50
CPU_CRIT  = 80
MEM_WARN  = 50
MEM_CRIT  = 80

# ── Helpers ──────────────────────────────────

def make_token(username: str) -> str:
    """Generate a simple session token."""
    raw = f"{username}{time.time()}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]

def require_auth(request):
    """Return username if request carries a valid token, else None."""
    token = request.headers.get("X-Auth-Token") or request.args.get("token")
    return SESSIONS.get(token)

def get_cpu_level(pct: float) -> str:
    if pct >= CPU_CRIT:  return "critical"
    if pct >= CPU_WARN:  return "warning"
    return "normal"

def get_mem_level(pct: float) -> str:
    if pct >= MEM_CRIT:  return "critical"
    if pct >= MEM_WARN:  return "warning"
    return "normal"

# ── Auth endpoints ───────────────────────────

@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(force=True)
    username = data.get("username", "")
    password  = data.get("password", "")
    hashed    = hashlib.sha256(password.encode()).hexdigest()

    if USERS.get(username) == hashed:
        token = make_token(username)
        SESSIONS[token] = username
        return jsonify({"success": True, "token": token, "username": username})

    return jsonify({"success": False, "message": "Invalid credentials"}), 401

@app.route("/api/logout", methods=["POST"])
def logout():
    token = request.headers.get("X-Auth-Token")
    SESSIONS.pop(token, None)
    return jsonify({"success": True})

# ── System overview ──────────────────────────

@app.route("/api/system", methods=["GET"])
def system_overview():
    """
    Returns high-level system metrics:
    - CPU usage (overall + per-core)
    - Memory usage
    - Disk usage
    - Uptime & timestamp
    """
    # CPU — non-blocking interval=None gives instant reading
    cpu_pct      = psutil.cpu_percent(interval=0.2)
    cpu_per_core = psutil.cpu_percent(interval=0.2, percpu=True)
    cpu_freq     = psutil.cpu_freq()
    cpu_count    = psutil.cpu_count(logical=True)

    # Memory
    mem = psutil.virtual_memory()

    # Disk (root partition)
    try:
        disk = psutil.disk_usage("/")
        disk_info = {
            "total":   round(disk.total / 1e9, 2),
            "used":    round(disk.used  / 1e9, 2),
            "free":    round(disk.free  / 1e9, 2),
            "percent": disk.percent
        }
    except Exception:
        disk_info = None

    # Uptime
    boot_time = psutil.boot_time()
    uptime_sec = int(time.time() - boot_time)
    uptime_str = str(datetime.timedelta(seconds=uptime_sec))

    # Network I/O (cumulative)
    net = psutil.net_io_counters()

    return jsonify({
        "timestamp": datetime.datetime.now().isoformat(),
        "cpu": {
            "percent":      cpu_pct,
            "per_core":     cpu_per_core,
            "count":        cpu_count,
            "freq_mhz":     round(cpu_freq.current, 1) if cpu_freq else None,
            "level":        get_cpu_level(cpu_pct)
        },
        "memory": {
            "total_gb":     round(mem.total  / 1e9, 2),
            "used_gb":      round(mem.used   / 1e9, 2),
            "available_gb": round(mem.available / 1e9, 2),
            "percent":      mem.percent,
            "level":        get_mem_level(mem.percent)
        },
        "disk":   disk_info,
        "uptime": uptime_str,
        "network": {
            "bytes_sent_mb": round(net.bytes_sent / 1e6, 2),
            "bytes_recv_mb": round(net.bytes_recv / 1e6, 2)
        }
    })

# ── Process list ─────────────────────────────

@app.route("/api/processes", methods=["GET"])
def process_list():
    """
    Returns a list of running processes.
    Supports optional query params:
      ?search=<name or PID>   filter by name/pid substring
      ?sort=cpu|mem|pid|name  sort field
      ?order=asc|desc
    """
    search = (request.args.get("search") or "").lower()
    sort   = request.args.get("sort",  "cpu")
    order  = request.args.get("order", "desc")

    procs = []
    attrs = ["pid","name","status","cpu_percent","memory_info",
             "memory_percent","username","create_time","num_threads"]

    for proc in psutil.process_iter(attrs=attrs):
        try:
            info = proc.info
            if info["memory_info"] is None:
                continue

            pid  = info["pid"]
            name = info["name"] or "?"
            cpu  = round(info["cpu_percent"] or 0, 2)
            mem_mb  = round(info["memory_info"].rss / 1e6, 2)
            mem_pct = round(info["memory_percent"] or 0, 2)
            status  = info["status"]
            user    = info["username"] or "?"
            threads = info["num_threads"] or 0

            # Human-readable start time
            try:
                started = datetime.datetime.fromtimestamp(
                    info["create_time"]).strftime("%H:%M:%S")
            except Exception:
                started = "?"

            # Apply search filter
            if search:
                if search not in name.lower() and search not in str(pid):
                    continue

            procs.append({
                "pid":      pid,
                "name":     name,
                "status":   status,
                "cpu":      cpu,
                "mem_mb":   mem_mb,
                "mem_pct":  mem_pct,
                "user":     user,
                "threads":  threads,
                "started":  started,
                "cpu_level": get_cpu_level(cpu),
                "mem_level": get_mem_level(mem_pct)
            })

        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue   # Process disappeared or no permission — skip

    # Sort
    reverse = (order == "desc")
    key_map = {
        "cpu":  lambda p: p["cpu"],
        "mem":  lambda p: p["mem_mb"],
        "pid":  lambda p: p["pid"],
        "name": lambda p: p["name"].lower()
    }
    procs.sort(key=key_map.get(sort, key_map["cpu"]), reverse=reverse)

    return jsonify({
        "count":     len(procs),
        "processes": procs
    })

# ── Kill a process ───────────────────────────

@app.route("/api/processes/<int:pid>/kill", methods=["POST"])
def kill_process(pid):
    """
    Terminates a process by PID.
    Requires auth token in header: X-Auth-Token
    First sends SIGTERM; if that fails, SIGKILL.
    """
    # Auth check (disabled for demo — comment out in production)
    # if not require_auth(request):
    #     return jsonify({"success": False, "message": "Unauthorized"}), 401

    # Safety: never kill PID 1 or our own process
    if pid <= 1 or pid == os.getpid():
        return jsonify({"success": False,
                        "message": "Cannot kill this process."}), 403

    try:
        proc = psutil.Process(pid)
        name = proc.name()
        proc.terminate()                    # SIGTERM — graceful
        try:
            proc.wait(timeout=3)            # wait up to 3 s
        except psutil.TimeoutExpired:
            proc.kill()                     # SIGKILL — forceful
        return jsonify({"success": True,
                        "message": f"Process '{name}' (PID {pid}) terminated."})
    except psutil.NoSuchProcess:
        return jsonify({"success": False, "message": "Process not found."}), 404
    except psutil.AccessDenied:
        return jsonify({"success": False,
                        "message": "Permission denied. Try running as root."}), 403
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

# ── CPU history (last 60 s) ──────────────────

CPU_HISTORY = []          # list of {time, value}
MAX_HISTORY = 60

@app.route("/api/cpu-history", methods=["GET"])
def cpu_history():
    """Returns the stored CPU % history for the sparkline chart."""
    return jsonify(CPU_HISTORY)

def record_cpu():
    """Called by a background thread every second."""
    import threading
    def _loop():
        while True:
            val = psutil.cpu_percent(interval=1)
            ts  = datetime.datetime.now().strftime("%H:%M:%S")
            CPU_HISTORY.append({"time": ts, "value": val})
            if len(CPU_HISTORY) > MAX_HISTORY:
                CPU_HISTORY.pop(0)
    t = threading.Thread(target=_loop, daemon=True)
    t.start()

# ── CSV export ───────────────────────────────

@app.route("/api/export/csv", methods=["GET"])
def export_csv():
    """Exports current process list as a CSV download."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["PID","Name","Status","CPU%","Mem(MB)","Mem%","User","Threads","Started"])

    for proc in psutil.process_iter(
            attrs=["pid","name","status","cpu_percent",
                   "memory_info","memory_percent","username",
                   "create_time","num_threads"]):
        try:
            i = proc.info
            if i["memory_info"] is None:
                continue
            started = datetime.datetime.fromtimestamp(
                i["create_time"]).strftime("%Y-%m-%d %H:%M:%S")
            writer.writerow([
                i["pid"], i["name"], i["status"],
                round(i["cpu_percent"] or 0, 2),
                round(i["memory_info"].rss / 1e6, 2),
                round(i["memory_percent"] or 0, 2),
                i["username"] or "?",
                i["num_threads"] or 0,
                started
            ])
        except Exception:
            continue

    from flask import Response
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment;filename=processes.csv"}
    )

# ── Serve frontend ───────────────────────────

@app.route("/")
def index():
    return render_template("index.html")

# ── Entry point ──────────────────────────────

if __name__ == "__main__":
    record_cpu()         # start background CPU recorder
    print("\n🚀  Process Monitor running at  http://127.0.0.1:5000\n")
    app.run(debug=True, port=5000, threaded=True, use_reloader=False)

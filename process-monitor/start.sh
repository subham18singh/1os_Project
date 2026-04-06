#!/usr/bin/env bash
# ─────────────────────────────────────────────
#  SysPulse Startup Script
#  Usage:  bash start.sh
# ─────────────────────────────────────────────
set -e

echo ""
echo "  ███████╗██╗   ██╗███████╗██████╗ ██╗   ██╗██╗     ███████╗███████╗"
echo "  ██╔════╝╚██╗ ██╔╝██╔════╝██╔══██╗██║   ██║██║     ██╔════╝██╔════╝"
echo "  ███████╗ ╚████╔╝ ███████╗██████╔╝██║   ██║██║     ███████╗█████╗  "
echo "  ╚════██║  ╚██╔╝  ╚════██║██╔═══╝ ██║   ██║██║     ╚════██║██╔══╝  "
echo "  ███████║   ██║   ███████║██║     ╚██████╔╝███████╗███████║███████╗"
echo "  ╚══════╝   ╚═╝   ╚══════╝╚═╝      ╚═════╝ ╚══════╝╚══════╝╚══════╝"
echo ""
echo "  Real-Time Process Monitoring Dashboard"
echo "─────────────────────────────────────────────────────────────────────"

# Check Python
if ! command -v python3 &>/dev/null; then
  echo "❌  Python 3 not found. Please install Python 3.8+"
  exit 1
fi

# Install deps if needed
if ! python3 -c "import psutil" &>/dev/null; then
  echo "📦  Installing dependencies..."
  pip install -r backend/requirements.txt
fi

echo ""
echo "✅  Dependencies OK"
echo "🚀  Starting Flask server on http://localhost:5000"
echo "🔑  Login: admin / admin123"
echo ""
echo "  Press Ctrl+C to stop"
echo "─────────────────────────────────────────────────────────────────────"
echo ""

cd backend
python3 app.py

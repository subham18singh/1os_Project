
#define _WIN32_IE 0x0600
#define _WIN32_WINNT 0x0600
#define WINVER 0x0600

#include <sdkddkver.h>
#include <windows.h>
#include <commctrl.h>
#include <tlhelp32.h>
#include <psapi.h>
#include <stdio.h>
#include <string.h>

#define ID_LISTVIEW 1001
#define ID_BTN_KILL 1002
#define TIMER_ID 1
#define REFRESH_RATE_MS 1000

#ifndef LVS_EX_DOUBLEBUFFER
#define LVS_EX_DOUBLEBUFFER 0x00010000
#endif

#define HISTORY_SIZE 60

// Color Constants
#define COLOR_GRAPH_BG     RGB(20, 20, 20)
#define COLOR_GRAPH_GRID   RGB(60, 60, 60)
#define COLOR_CPU_LINE     RGB(0, 200, 0)
#define COLOR_MEM_LINE     RGB(0, 150, 255)

// Globals
HINSTANCE hInst;
HWND hMainWnd, hListView, hBtnKill;
double cpuHistory[HISTORY_SIZE];
double memHistory[HISTORY_SIZE];
int historyMsgIndex = 0;

// CPU Calculation Globals
ULARGE_INTEGER lastIdleTime, lastKernelTime, lastUserTime;

void InitCPU(void) {
    FILETIME idleTime, kernelTime, userTime;
    GetSystemTimes(&idleTime, &kernelTime, &userTime);
    lastIdleTime.LowPart = idleTime.dwLowDateTime;
    lastIdleTime.HighPart = idleTime.dwHighDateTime;
    lastKernelTime.LowPart = kernelTime.dwLowDateTime;
    lastKernelTime.HighPart = kernelTime.dwHighDateTime;
    lastUserTime.LowPart = userTime.dwLowDateTime;
    lastUserTime.HighPart = userTime.dwHighDateTime;
}

// Calculates global CPU usage percentage by comparing system times
// between two intervals. Returns value between 0.0 and 100.0.
static double GetCPUUsage(void) {
    FILETIME idleTime, kernelTime, userTime;
    if (!GetSystemTimes(&idleTime, &kernelTime, &userTime)) return 0.0;

    ULARGE_INTEGER idle, kernel, user;
    idle.LowPart = idleTime.dwLowDateTime; idle.HighPart = idleTime.dwHighDateTime;
    kernel.LowPart = kernelTime.dwLowDateTime; kernel.HighPart = kernelTime.dwHighDateTime;
    user.LowPart = userTime.dwLowDateTime; user.HighPart = userTime.dwHighDateTime;

    ULONGLONG idleDiff = idle.QuadPart - lastIdleTime.QuadPart;
    ULONGLONG kernelDiff = kernel.QuadPart - lastKernelTime.QuadPart;
    ULONGLONG userDiff = user.QuadPart - lastUserTime.QuadPart;

    lastIdleTime = idle; lastKernelTime = kernel; lastUserTime = user;

    ULONGLONG total = kernelDiff + userDiff;
    if (total == 0) return 0.0;
    return (double)(total - idleDiff) * 100.0 / (double)total;
}

// Retrieves global memory usage percentage via GlobalMemoryStatusEx.
static double GetMemoryUsage(void) {
    MEMORYSTATUSEX statex;
    memset(&statex, 0, sizeof(statex));
    statex.dwLength = sizeof(statex);
    if (!GlobalMemoryStatusEx(&statex)) return 0.0;
    return (double)statex.dwMemoryLoad; // percent
}

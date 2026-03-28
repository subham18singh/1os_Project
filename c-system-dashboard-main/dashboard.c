#define _WIN32_IE 0x0600
#define _WIN32_WINNT 0x0600
#define WINVER 0x0600

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

#define COLOR_GRAPH_BG RGB(20, 20, 20)
#define COLOR_GRAPH_GRID RGB(60, 60, 60)
#define COLOR_CPU_LINE RGB(0, 200, 0)
#define COLOR_MEM_LINE RGB(0, 150, 255)

HINSTANCE hInst;
HWND hMainWnd, hListView, hBtnKill;
double cpuHistory[HISTORY_SIZE];
double memHistory[HISTORY_SIZE];
int historyMsgIndex = 0;

// CPU Calculation Globals
ULARGE_INTEGER lastIdleTime, lastKernelTime, lastUserTime;

void InitCPU(void)
{
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
static double GetCPUUsage(void)
{
    FILETIME idleTime, kernelTime, userTime;
    if (!GetSystemTimes(&idleTime, &kernelTime, &userTime))
        return 0.0;

    ULARGE_INTEGER idle, kernel, user;
    idle.LowPart = idleTime.dwLowDateTime;
    idle.HighPart = idleTime.dwHighDateTime;
    kernel.LowPart = kernelTime.dwLowDateTime;
    kernel.HighPart = kernelTime.dwHighDateTime;
    user.LowPart = userTime.dwLowDateTime;
    user.HighPart = userTime.dwHighDateTime;

    ULONGLONG idleDiff = idle.QuadPart - lastIdleTime.QuadPart;
    ULONGLONG kernelDiff = kernel.QuadPart - lastKernelTime.QuadPart;
    ULONGLONG userDiff = user.QuadPart - lastUserTime.QuadPart;

    lastIdleTime = idle;
    lastKernelTime = kernel;
    lastUserTime = user;

    ULONGLONG total = kernelDiff + userDiff;
    if (total == 0)
        return 0.0;
    return (double)(total - idleDiff) * 100.0 / (double)total;
}

// Retrieves global memory usage percentage via GlobalMemoryStatusEx.
static double GetMemoryUsage(void)
{
    MEMORYSTATUSEX statex;
    memset(&statex, 0, sizeof(statex));
    statex.dwLength = sizeof(statex);
    if (!GlobalMemoryStatusEx(&statex))
        return 0.0;
    return (double)statex.dwMemoryLoad; // percent
}

static void UpdateProcessList(void)
{
    // Save selected PID if any
    DWORD selectedPid = 0;
    int selIdx = ListView_GetNextItem(hListView, -1, LVNI_SELECTED);
    if (selIdx != -1)
    {
        LVITEM lvSel;
        memset(&lvSel, 0, sizeof(lvSel));
        lvSel.iItem = selIdx;
        lvSel.iSubItem = 0;
        lvSel.mask = LVIF_PARAM;
        if (ListView_GetItem(hListView, &lvSel))
            selectedPid = (DWORD)lvSel.lParam;
    }

    ListView_DeleteAllItems(hListView);

    HANDLE hSnapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (hSnapshot == INVALID_HANDLE_VALUE)
        return;

    PROCESSENTRY32 pe32;
    pe32.dwSize = sizeof(PROCESSENTRY32);

    int index = 0;
    if (Process32First(hSnapshot, &pe32))
    {
        do
        {
            LVITEM lvItem;
            memset(&lvItem, 0, sizeof(lvItem));
            lvItem.mask = LVIF_TEXT | LVIF_PARAM;
            lvItem.iItem = index;
            lvItem.iSubItem = 0;
            lvItem.pszText = pe32.szExeFile;
            lvItem.lParam = (LPARAM)pe32.th32ProcessID;
            ListView_InsertItem(hListView, &lvItem);

            char buf[64];
            snprintf(buf, sizeof(buf), "%lu", (unsigned long)pe32.th32ProcessID);
            ListView_SetItemText(hListView, index, 1, buf);

            snprintf(buf, sizeof(buf), "%lu", (unsigned long)pe32.cntThreads);
            ListView_SetItemText(hListView, index, 2, buf);

            HANDLE hProcess = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, FALSE, pe32.th32ProcessID);
            if (hProcess)
            {
                PROCESS_MEMORY_COUNTERS pmc;
                if (GetProcessMemoryInfo(hProcess, &pmc, sizeof(pmc)))
                {
                    snprintf(buf, sizeof(buf), "%.2f MB", (double)pmc.WorkingSetSize / (1024.0 * 1024.0));
                    ListView_SetItemText(hListView, index, 3, buf);
                }
                CloseHandle(hProcess);
            }
            else
            {
                ListView_SetItemText(hListView, index, 3, "N/A");
            }

            // Restore selection by PID after insertion
            if (selectedPid && selectedPid == (DWORD)pe32.th32ProcessID)
            {
                ListView_SetItemState(hListView, index, LVIS_SELECTED | LVIS_FOCUSED, LVIS_SELECTED | LVIS_FOCUSED);
                ListView_EnsureVisible(hListView, index, FALSE);
            }

            index++;
        } while (Process32Next(hSnapshot, &pe32));
    }

    CloseHandle(hSnapshot);
}

static void KillSelectedProcess(void)
{
    int iPos = ListView_GetNextItem(hListView, -1, LVNI_SELECTED);
    if (iPos == -1)
        return;

    LVITEM lvItem;
    memset(&lvItem, 0, sizeof(lvItem));
    lvItem.mask = LVIF_PARAM;
    lvItem.iItem = iPos;
    lvItem.iSubItem = 0;
    if (!ListView_GetItem(hListView, &lvItem))
        return;

    DWORD pid = (DWORD)lvItem.lParam;
    HANDLE hProcess = OpenProcess(PROCESS_TERMINATE, FALSE, pid);
    if (hProcess)
    {
        TerminateProcess(hProcess, 1);
        CloseHandle(hProcess);
        UpdateProcessList();
    }
    else
    {
        DWORD errCode = GetLastError();
        char msgBuf[128];
        snprintf(msgBuf, sizeof(msgBuf), "Failed to terminate process. Error code: %lu", errCode);
        MessageBox(hMainWnd, msgBuf, "Error", MB_OK | MB_ICONERROR);
    }
}
static void DrawGraph(HDC hdc, RECT rect, double* history, int historyIdx, COLORREF color, const char* label) {
    // Background
    HBRUSH hBrushBg = CreateSolidBrush(COLOR_GRAPH_BG);
    FillRect(hdc, &rect, hBrushBg);
    DeleteObject(hBrushBg);

    // Grid
    HPEN hPenGrid = CreatePen(PS_DOT, 1, COLOR_GRAPH_GRID);
    HPEN hOldPen = (HPEN)SelectObject(hdc, hPenGrid);
    for (int i = 0; i < 4; ++i) {
        int y = rect.top + i * (rect.bottom - rect.top) / 4;
        MoveToEx(hdc, rect.left, y, NULL);
        LineTo(hdc, rect.right, y);
    }
    SelectObject(hdc, hOldPen);
    DeleteObject(hPenGrid);

    // Label
    SetBkMode(hdc, TRANSPARENT);
    SetTextColor(hdc, color);
    TextOutA(hdc, rect.left + 6, rect.top + 4, label, (int)strlen(label));

    char valBuf[32];
    double lastVal = history[(historyIdx - 1 + HISTORY_SIZE) % HISTORY_SIZE];
    snprintf(valBuf, sizeof(valBuf), "%.1f%%", lastVal);
    TextOutA(hdc, rect.right - 60, rect.top + 4, valBuf, (int)strlen(valBuf));

    // Line
    HPEN hPenLine = CreatePen(PS_SOLID, 2, color);
    hOldPen = (HPEN)SelectObject(hdc, hPenLine);

    int width = rect.right - rect.left;
    int height = rect.bottom - rect.top;
    double stepX = (double)width / (HISTORY_SIZE - 1);

    for (int i = 0; i < HISTORY_SIZE; ++i) {
        int idx = (historyIdx + i) % HISTORY_SIZE;
        double val = history[idx];
        int x = rect.left + (int)(i * stepX + 0.5);
        int y = rect.bottom - (int)(val / 100.0 * (double)height + 0.5);
        if (i == 0) MoveToEx(hdc, x, y, NULL);
        else LineTo(hdc, x, y);
    }

    SelectObject(hdc, hOldPen);
    DeleteObject(hPenLine);
}
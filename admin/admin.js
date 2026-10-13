/**
 * ============================================================================
 * SADV LOGGER - ADMIN DASHBOARD CONTROLLER (admin/admin.js)
 * Full Staff & Telemetry Management Engine
 * ============================================================================
 */

const LOGIN_URL = "../index.html";
let currentSession = null;

let CACHED_LOGS_ARRAY = [];
let CACHED_SUMMARIES_ARRAY = [];
let CACHED_WEEKLY_ARRAY = [];
let CACHED_MONTHLY_ARRAY = [];
let CACHED_LEAVE_ARRAY = [];
let CACHED_EMPLOYEES_ARRAY = [];

document.addEventListener("DOMContentLoaded", () => {
  currentSession = requireSession("Admin", LOGIN_URL);
  if (!currentSession) return;

  const greetingEl = document.getElementById("adminGreeting");
  if (greetingEl) {
    greetingEl.innerText = `${currentSession.user.firstName}'s Operations Portal`;
  }

  loadAdminDashboard();
});

function logout() {
  clearSession();
  window.location.href = LOGIN_URL;
}

/* ==========================================================================
   DASHBOARD DATA LOADER
   ========================================================================== */

async function loadAdminDashboard() {
  showLoader(true, "Synchronizing SADV Telemetry Database...");

  try {
    const res = await callApi("getAdminDashboardData");
    showLoader(false);

    if (res.status === "success") {
      CACHED_LOGS_ARRAY = res.logs || [];
      CACHED_SUMMARIES_ARRAY = res.summaries || [];
      CACHED_WEEKLY_ARRAY = res.weeklySummaries || [];
      CACHED_MONTHLY_ARRAY = res.monthlySummaries || [];
      CACHED_LEAVE_ARRAY = res.leaveRequests || [];
      CACHED_EMPLOYEES_ARRAY = res.employees || [];

      // Set default filter values
      const todayStr = new Date().toISOString().split("T")[0];
      const curMonth = todayStr.substring(0, 7);

      const fDate = document.getElementById("filterDate");
      const fSumDate = document.getElementById("filterSummaryDate");
      const fMonth = document.getElementById("filterMonthlyMonth");
      const expStart = document.getElementById("exportStart");
      const expEnd = document.getElementById("exportEnd");

      if (fDate && !fDate.value) fDate.value = todayStr;
      if (fSumDate && !fSumDate.value) fSumDate.value = todayStr;
      if (fMonth && !fMonth.value) fMonth.value = curMonth;
      if (expStart && !expStart.value) expStart.value = todayStr;
      if (expEnd && !expEnd.value) expEnd.value = todayStr;

      // Populate employee dropdown in Export tab
      populateExportDropdown(res.employees);

      // Render tables
      renderStaffProfilesTable(res.employees);
      renderLeaveRequestsTable(CACHED_LEAVE_ARRAY);
      applyAdminLogFilters();
      applyAdminSummaryFilters();
      applyAdminWeeklyFilters();
      applyAdminMonthlyFilters();
    } else {
      alert("Error loading dashboard data: " + res.message);
    }
  } catch (err) {
    showLoader(false);
    alert("Connection Error loading SADV Logger: " + err.message);
  }
}

/* ==========================================================================
   NAVIGATION TABS
   ========================================================================== */

function switchAdminTab(tabName) {
  const tabs = ['logsTab', 'summariesTab', 'weeklyTab', 'monthlyTab', 'leaveTab', 'usersTab', 'exportTab'];
  tabs.forEach(t => {
    const btn = document.getElementById(`btn-${t}`);
    const content = document.getElementById(`content-${t}`);
    if (t === tabName) {
      if (btn) btn.classList.add("active");
      if (content) content.classList.remove("hidden");
    } else {
      if (btn) btn.classList.remove("active");
      if (content) content.classList.add("hidden");
    }
  });
}

/* ==========================================================================
   ADMIN SELF-ATTENDANCE CLOCK PANEL
   ========================================================================== */

function toggleAdminClockPanel() {
  const panel = document.getElementById("adminSelfClockPanel");
  const toggleBtn = document.getElementById("adminClockToggleText");
  if (!panel) return;

  if (panel.classList.contains("hidden")) {
    panel.classList.remove("hidden");
    if (toggleBtn) toggleBtn.innerText = "Hide Clocking Panel";
  } else {
    panel.classList.add("hidden");
    if (toggleBtn) toggleBtn.innerText = "Admin Attendance Logging";
  }
}

function triggerAdminClockAction(actionType) {
  hideAlert("adminLogAlert");
  showLoader(true, `Acquiring GPS coordinates for Admin ${actionType}...`);

  if (!navigator.geolocation) {
    showLoader(false);
    showAlert("adminLogAlert", "Geolocation is unsupported on this device.", "danger");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      showLoader(true, "Registering Admin attendance event...");
      try {
        const res = await callApi("processActivityLog", {
          email: currentSession.user.email,
          firstName: currentSession.user.firstName,
          lastName: currentSession.user.lastName,
          action: actionType,
          lat: pos.coords.latitude,
          lon: pos.coords.longitude
        });

        showLoader(false);
        if (res.status === "success") {
          showAlert("adminLogAlert", `Admin ${res.action} logged at ${res.time} (${res.location || "Coordinates verified"})`, "success");
          loadAdminDashboard();
        } else {
          showAlert("adminLogAlert", res.message || "Action blocked.", "danger");
        }
      } catch (err) {
        showLoader(false);
        showAlert("adminLogAlert", "Connection Error: " + err.message, "danger");
      }
    },
    (err) => {
      showLoader(false);
      showAlert("adminLogAlert", "GPS access denied. Please grant location permissions.", "danger");
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

/* ==========================================================================
   TAB 1: ACTIVITY LOGS
   ========================================================================== */

function applyAdminLogFilters() {
  const fDateEl = document.getElementById("filterDate");
  const fSearchEl = document.getElementById("filterSearch");
  const selectedDate = fDateEl ? fDateEl.value.trim() : "";
  const searchQuery = fSearchEl ? fSearchEl.value.trim().toLowerCase() : "";

  let loginsCount = 0;
  let logoutsCount = 0;

  const filtered = CACHED_LOGS_ARRAY.filter(log => {
    const matchesDate = (selectedDate === "") || (log.date === selectedDate);
    const fullName = `${log.firstName} ${log.lastName}`.toLowerCase();
    const matchesSearch = (searchQuery === "") || fullName.includes(searchQuery) || log.email.toLowerCase().includes(searchQuery);

    if (matchesDate && matchesSearch) {
      if (log.action === "Clock In") loginsCount++;
      if (log.action === "Clock Out") logoutsCount++;
      return true;
    }
    return false;
  });

  const statLogins = document.getElementById("statLogins");
  const statLogouts = document.getElementById("statLogouts");
  const statDate = document.getElementById("statDateDisplay");

  if (statLogins) statLogins.innerText = loginsCount;
  if (statLogouts) statLogouts.innerText = logoutsCount;
  if (statDate) statDate.innerText = selectedDate || "All Records";

  renderLogsTable(filtered);
}

function resetAdminLogFilters() {
  const todayStr = new Date().toISOString().split("T")[0];
  const fDate = document.getElementById("filterDate");
  const fSearch = document.getElementById("filterSearch");
  if (fDate) fDate.value = todayStr;
  if (fSearch) fSearch.value = "";
  applyAdminLogFilters();
}

function renderLogsTable(logs) {
  const tbody = document.getElementById("logsTableBody");
  if (!tbody) return;

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding: 2rem;">No matching telemetry logs found.</td></tr>`;
    return;
  }

  tbody.innerHTML = logs.map(log => {
    const isClockIn = log.action === "Clock In";
    const badgeClass = isClockIn ? "badge-info" : "badge-warning";
    const coordsBadge = (log.lat && log.lon && log.lat !== "0")
      ? `<span class="badge badge-purple" style="font-size: 0.65rem; margin-top: 0.25rem;">GPS: ${log.lat}, ${log.lon}</span>`
      : `<span class="badge" style="font-size: 0.65rem; background: #e2e8f0; color: #475569;">GPS: Cached</span>`;

    const editedBadge = log.editedBy 
      ? `<div style="margin-top: 0.25rem;"><span class="badge badge-pink" style="font-size: 0.65rem;">Edited by: ${log.editedBy}</span></div>` 
      : `<span class="text-muted" style="font-size: 0.75rem;">—</span>`;

    return `
      <tr>
        <td>
          <strong style="color: var(--text-primary); display: block;">${log.firstName} ${log.lastName}</strong>
          <span class="text-muted" style="font-size: 0.75rem;">${log.email}</span>
        </td>
        <td>
          <span style="font-weight: 600;">${log.date}</span><br>
          <span class="text-muted font-mono" style="font-size: 0.75rem;">${log.time}</span>
        </td>
        <td>
          <span class="badge ${badgeClass}">${log.action}</span>
        </td>
        <td style="max-width: 320px;">
          <div style="font-weight: 500; font-size: 0.8rem; line-height: 1.3;">${log.location}</div>
          ${coordsBadge}
        </td>
        <td>
          ${editedBadge}
        </td>
      </tr>
    `;
  }).join("");
}

/* ==========================================================================
   TAB 2: DAILY SUMMARIES & SHIFT EDITING / DELETING
   ========================================================================== */

function applyAdminSummaryFilters() {
  const fDateEl = document.getElementById("filterSummaryDate");
  const fSearchEl = document.getElementById("filterSummarySearch");
  const selectedDate = fDateEl ? fDateEl.value.trim() : "";
  const searchQuery = fSearchEl ? fSearchEl.value.trim().toLowerCase() : "";

  const filtered = CACHED_SUMMARIES_ARRAY.filter(sum => {
    const matchesDate = (selectedDate === "") || (sum.date === selectedDate);
    const fullName = `${sum.firstName} ${sum.lastName}`.toLowerCase();
    const matchesSearch = (searchQuery === "") || fullName.includes(searchQuery) || sum.email.toLowerCase().includes(searchQuery);
    return matchesDate && matchesSearch;
  });

  renderSummariesTable(filtered);
}

function resetAdminSummaryFilters() {
  const fDate = document.getElementById("filterSummaryDate");
  const fSearch = document.getElementById("filterSummarySearch");
  if (fDate) fDate.value = "";
  if (fSearch) fSearch.value = "";
  applyAdminSummaryFilters();
}

function renderSummariesTable(summaries) {
  const tbody = document.getElementById("summariesTableBody");
  if (!tbody) return;

  if (summaries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted" style="padding: 2rem;">No matching daily summaries on record.</td></tr>`;
    return;
  }

  tbody.innerHTML = summaries.map(sum => {
    const statusBadge = sum.status === "Completed"
      ? `<span class="badge badge-success">Completed</span>`
      : `<span class="badge badge-warning">In Progress</span>`;

    const hasOt = sum.overtime && sum.overtime !== "0 mins" && sum.overtime !== "N/A";
    const otBadge = hasOt
      ? `<span class="overtime-pill">${sum.overtime}</span>`
      : `<span class="text-muted" style="font-size: 0.75rem;">${sum.overtime}</span>`;

    return `
      <tr>
        <td>
          <strong style="color: var(--text-primary); display: block;">${sum.firstName} ${sum.lastName}</strong>
          <span class="text-muted" style="font-size: 0.75rem;">${sum.email}</span>
        </td>
        <td style="font-weight: 600;">${sum.date}</td>
        <td>
          <div style="font-size: 0.8rem;"><span class="text-muted">In:</span> ${sum.clockIn}</div>
          <div style="font-size: 0.8rem;"><span class="text-muted">Out:</span> ${sum.clockOut}</div>
        </td>
        <td>
          <div class="floor-time-tag floor-in"><span class="text-muted" style="font-size: 0.7rem;">In:</span> ${sum.floorIn}</div>
          <div class="floor-time-tag floor-out"><span class="text-muted" style="font-size: 0.7rem;">Out:</span> ${sum.floorOut}</div>
        </td>
        <td style="font-weight: 800; color: var(--text-primary);">${sum.totalHours}</td>
        <td>${otBadge}</td>
        <td>${statusBadge}</td>
        <td class="text-right" style="white-space: nowrap;">
          <button onclick="openSummaryEditModal('${sum.summaryId}', '${sum.firstName} ${sum.lastName}', '${sum.date}', '${sum.clockIn}', '${sum.clockOut}')" class="btn btn-secondary btn-sm" style="margin-right: 0.35rem;">
            Edit
          </button>
          <button onclick="deleteDailySummary('${sum.summaryId}', '${sum.date}', '${sum.email}')" class="btn btn-outline-danger btn-sm">
            Delete
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

function openSummaryEditModal(sumId, fullName, dateStr, clockIn, clockOut) {
  const modal = document.getElementById("editSummaryModal");
  if (!modal) return;

  document.getElementById("editSumId").value = sumId;
  document.getElementById("editSumName").innerText = fullName;
  document.getElementById("editSumDate").innerText = `Shift Date: ${dateStr}`;
  document.getElementById("editSumIn").value = formatTimeForInput(clockIn);
  document.getElementById("editSumOut").value = formatTimeForInput(clockOut);

  modal.classList.remove("hidden");
}

function closeSummaryEditModal() {
  const modal = document.getElementById("editSummaryModal");
  if (modal) modal.classList.add("hidden");
}

function formatTimeForInput(timeStr) {
  if (!timeStr || timeStr === "--" || timeStr === "N/A") return "";
  const parts = timeStr.split(":");
  if (parts.length >= 2) {
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:${parts.length > 2 ? parts[2].padStart(2, '0') : "00"}`;
  }
  return "";
}

async function handleSummaryUpdateSave(e) {
  e.preventDefault();
  showLoader(true, "Saving shift modifications and updating totals...");

  const sumId = document.getElementById("editSumId").value;
  const newIn = document.getElementById("editSumIn").value;
  const newOut = document.getElementById("editSumOut").value;

  try {
    const res = await callApi("adminUpdateDailySummary", {
      summaryId: sumId,
      clockIn: newIn,
      clockOut: newOut,
      adminEmail: currentSession.user.email
    });

    showLoader(false);
    closeSummaryEditModal();

    if (res.status === "success") {
      alert("Shift successfully updated!");
      loadAdminDashboard();
    } else {
      alert("Error updating summary: " + res.message);
    }
  } catch (err) {
    showLoader(false);
    alert("Connection Error: " + err.message);
  }
}

async function deleteDailySummary(summaryId, dateStr, email) {
  if (!confirm(`Are you sure you want to permanently delete this shift on ${dateStr}? This will also delete raw activity logs for this user on this day.`)) {
    return;
  }

  showLoader(true, "Deleting daily shift record...");

  try {
    const res = await callApi("adminDeleteDailySummary", {
      summaryId: summaryId,
      dateStr: dateStr,
      email: email,
      adminEmail: currentSession.user.email
    });

    showLoader(false);

    if (res.status === "success") {
      alert(res.message);
      loadAdminDashboard();
    } else {
      alert("Failed to delete record: " + res.message);
    }
  } catch (err) {
    showLoader(false);
    alert("Connection Error: " + err.message);
  }
}

/* ==========================================================================
   TAB 3: WEEKLY SUMMARIES
   ========================================================================== */

function applyAdminWeeklyFilters() {
  const fWeekEl = document.getElementById("filterWeeklyKey");
  const fSearchEl = document.getElementById("filterWeeklySearch");
  const selectedWeek = fWeekEl ? fWeekEl.value.trim().toUpperCase() : "";
  const searchQuery = fSearchEl ? fSearchEl.value.trim().toLowerCase() : "";

  const filtered = CACHED_WEEKLY_ARRAY.filter(w => {
    const matchesWeek = (selectedWeek === "") || (w.weekKey.toUpperCase().includes(selectedWeek));
    const fullName = `${w.firstName} ${w.lastName}`.toLowerCase();
    const matchesSearch = (searchQuery === "") || fullName.includes(searchQuery) || w.email.toLowerCase().includes(searchQuery);
    return matchesWeek && matchesSearch;
  });

  renderWeeklyTable(filtered);
}

function resetAdminWeeklyFilters() {
  const fWeek = document.getElementById("filterWeeklyKey");
  const fSearch = document.getElementById("filterWeeklySearch");
  if (fWeek) fWeek.value = "";
  if (fSearch) fSearch.value = "";
  applyAdminWeeklyFilters();
}

function renderWeeklyTable(weeklyData) {
  const tbody = document.getElementById("weeklyTableBody");
  if (!tbody) return;

  if (weeklyData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 2rem;">No matching weekly summaries found.</td></tr>`;
    return;
  }

  tbody.innerHTML = weeklyData.map(w => {
    let complianceBadge = `<span class="badge badge-warning">Under Target (&lt;45 hrs)</span>`;
    if (w.complianceStatus.includes("MAX CAP ALERT")) {
      complianceBadge = `<span class="badge badge-danger">🔴 MAX CAP ALERT (55+ hrs)</span>`;
    } else if (w.complianceStatus.includes("Target Met")) {
      complianceBadge = `<span class="badge badge-success">Target Met (Compliant)</span>`;
    }

    const hasOt = w.totalOvertime && w.totalOvertime !== "0 mins" && w.totalOvertime !== "N/A";
    const otBadge = hasOt 
      ? `<span class="overtime-pill">${w.totalOvertime}</span>` 
      : `<span class="text-muted" style="font-size: 0.75rem;">${w.totalOvertime}</span>`;

    return `
      <tr>
        <td>
          <strong style="color: var(--text-primary); display: block;">${w.firstName} ${w.lastName}</strong>
          <span class="text-muted" style="font-size: 0.75rem;">${w.email}</span>
        </td>
        <td><span class="badge badge-info font-mono" style="font-size: 0.8rem;">${w.weekKey}</span></td>
        <td style="font-weight: 800; color: var(--sadv-blue);">${w.totalHours}</td>
        <td>${otBadge}</td>
        <td style="font-weight: 600;">${w.daysWorked} days</td>
        <td>${complianceBadge}</td>
      </tr>
    `;
  }).join("");
}

/* ==========================================================================
   TAB 4: MONTHLY SUMMARIES
   ========================================================================== */

function applyAdminMonthlyFilters() {
  const fMonthEl = document.getElementById("filterMonthlyMonth");
  const fSearchEl = document.getElementById("filterMonthlySearch");
  const selectedMonth = fMonthEl ? fMonthEl.value.trim() : "";
  const searchQuery = fSearchEl ? fSearchEl.value.trim().toLowerCase() : "";

  const filtered = CACHED_MONTHLY_ARRAY.filter(m => {
    const matchesMonth = (selectedMonth === "") || (m.month === selectedMonth);
    const fullName = `${m.firstName} ${m.lastName}`.toLowerCase();
    const matchesSearch = (searchQuery === "") || fullName.includes(searchQuery) || m.email.toLowerCase().includes(searchQuery);
    return matchesMonth && matchesSearch;
  });

  renderMonthlyTable(filtered);
}

function resetAdminMonthlyFilters() {
  const fMonth = document.getElementById("filterMonthlyMonth");
  const fSearch = document.getElementById("filterMonthlySearch");
  if (fMonth) fMonth.value = "";
  if (fSearch) fSearch.value = "";
  applyAdminMonthlyFilters();
}

function renderMonthlyTable(monthlyData) {
  const tbody = document.getElementById("monthlyTableBody");
  if (!tbody) return;

  if (monthlyData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 2rem;">No matching monthly summaries found.</td></tr>`;
    return;
  }

  tbody.innerHTML = monthlyData.map(m => {
    const hasOt = m.totalOvertime && m.totalOvertime !== "0 mins" && m.totalOvertime !== "N/A";
    const otBadge = hasOt 
      ? `<span class="overtime-pill">${m.totalOvertime}</span>` 
      : `<span class="text-muted" style="font-size: 0.75rem;">${m.totalOvertime}</span>`;

    return `
      <tr>
        <td>
          <strong style="color: var(--text-primary); display: block;">${m.firstName} ${m.lastName}</strong>
          <span class="text-muted" style="font-size: 0.75rem;">${m.email}</span>
        </td>
        <td><strong style="color: var(--sadv-blue);">${m.month}</strong></td>
        <td style="font-weight: 800; font-size: 0.95rem;">${m.totalHours}</td>
        <td>${otBadge}</td>
        <td style="font-weight: 600; color: #065f46;">${m.daysWorked} days</td>
        <td class="font-mono text-muted" style="font-size: 0.75rem;">${m.lastUpdated}</td>
      </tr>
    `;
  }).join("");
}

/* ==========================================================================
   TAB 5: LEAVE APPLICATIONS
   ========================================================================== */

function renderLeaveRequestsTable(requests) {
  const tbody = document.getElementById("leaveTableBody");
  if (!tbody) return;

  if (requests.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding: 2rem;">No staff leave applications recorded yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = requests.map(req => {
    let badgeClass = "badge-warning";
    if (req.status === "Approved") badgeClass = "badge-success";
    if (req.status === "Rejected") badgeClass = "badge-danger";

    const actions = req.status === "Pending" ? `
      <div style="display: flex; justify-content: flex-end; gap: 0.4rem;">
        <button onclick="handleLeaveAction('${req.reqId}', 'Approved')" class="btn btn-primary btn-sm">Approve</button>
        <button onclick="handleLeaveAction('${req.reqId}', 'Rejected')" class="btn btn-outline-danger btn-sm">Reject</button>
      </div>
    ` : `<span class="text-muted" style="font-size: 0.8rem; font-style: italic;">Resolved</span>`;

    return `
      <tr>
        <td>
          <strong style="color: var(--text-primary); display: block;">${req.firstName} ${req.lastName}</strong>
          <span class="text-muted" style="font-size: 0.75rem;">${req.email}</span>
        </td>
        <td><strong style="color: var(--sadv-blue);">${req.type} Leave</strong></td>
        <td>
          <div style="font-size: 0.8rem; font-weight: 600;">${req.startDate} to ${req.endDate}</div>
          <span class="text-muted" style="font-size: 0.7rem;">Submitted: ${req.submittedDate}</span>
        </td>
        <td><span class="badge ${badgeClass}">${req.status}</span></td>
        <td class="text-right">${actions}</td>
      </tr>
    `;
  }).join("");
}

async function handleLeaveAction(reqId, newStatus) {
  showLoader(true, `Updating leave application ${reqId} to ${newStatus}...`);

  try {
    const res = await callApi("adminUpdateLeaveStatus", { reqId, newStatus });
    showLoader(false);

    if (res.status === "success") {
      alert(res.message);
      loadAdminDashboard();
    } else {
      alert("Error: " + res.message);
    }
  } catch (err) {
    showLoader(false);
    alert("Connection Error: " + err.message);
  }
}

/* ==========================================================================
   TAB 6: STAFF DIRECTORY
   ========================================================================== */

function renderStaffProfilesTable(employees) {
  const tbody = document.getElementById("usersTableBody");
  if (!tbody) return;

  if (employees.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding: 2rem;">No registered staff profiles found.</td></tr>`;
    return;
  }

  tbody.innerHTML = employees.map(emp => {
    const workBadge = emp.workStatus === "On Leave" 
      ? `<span class="badge badge-warning">On Leave</span>`
      : `<span class="badge badge-success">Active</span>`;

    const standingBadge = emp.accountStanding === "Verified"
      ? `<span class="badge badge-info">Verified</span>`
      : `<span class="badge badge-danger">Blocked</span>`;

    return `
      <tr>
        <td>
          <strong style="color: var(--text-primary); display: block;">${emp.firstName} ${emp.lastName}</strong>
          <span class="text-muted" style="font-size: 0.75rem;">${emp.email} &bull; ${emp.accountType}</span>
        </td>
        <td>${workBadge}</td>
        <td>${standingBadge}</td>
        <td class="text-right">
          <button onclick="openEditModal('${emp.email}', '${emp.firstName}', '${emp.lastName}', '${emp.accountStanding}')" class="btn btn-secondary btn-sm">
            Modify Profile
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

function openEditModal(email, first, last, standing) {
  const modal = document.getElementById("editModal");
  if (!modal) return;

  document.getElementById("editEmail").value = email;
  document.getElementById("editFirst").value = first;
  document.getElementById("editLast").value = last;
  document.getElementById("editStatus").value = standing;
  document.getElementById("editPassword").value = "";

  modal.classList.remove("hidden");
}

function closeEditModal() {
  const modal = document.getElementById("editModal");
  if (modal) modal.classList.add("hidden");
}

async function handleAdminUpdateSave(e) {
  e.preventDefault();
  showLoader(true, "Updating staff directory records...");

  const email = document.getElementById("editEmail").value;
  const firstName = document.getElementById("editFirst").value;
  const lastName = document.getElementById("editLast").value;
  const status = document.getElementById("editStatus").value;
  const newPassword = document.getElementById("editPassword").value;

  try {
    const res = await callApi("adminUpdateUser", {
      targetEmail: email,
      firstName: firstName,
      lastName: lastName,
      status: status,
      newPassword: newPassword
    });

    showLoader(false);
    closeEditModal();

    if (res.status === "success") {
      alert("Staff profile successfully updated!");
      loadAdminDashboard();
    } else {
      alert("Error: " + res.message);
    }
  } catch (err) {
    showLoader(false);
    alert("Connection Error: " + err.message);
  }
}

/* ==========================================================================
   TAB 7: TIMESHEET EXPORTS (PDF / CSV / ZIP)
   ========================================================================== */

function populateExportDropdown(employees) {
  const select = document.getElementById("exportEmail");
  if (!select) return;

  select.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "ALL";
  optAll.text = "All Registered Employees (ZIP Archive Only)";
  select.appendChild(optAll);

  employees.forEach(emp => {
    const opt = document.createElement("option");
    opt.value = emp.email;
    opt.text = `${emp.firstName} ${emp.lastName} (${emp.email})`;
    select.appendChild(opt);
  });
}

async function handleExport(format) {
  hideAlert("exportAlert");
  const email = document.getElementById("exportEmail").value;
  const startDate = document.getElementById("exportStart").value;
  const endDate = document.getElementById("exportEnd").value;

  if (email === "ALL") {
    showAlert("exportAlert", "Single PDF/CSV export requires a specific employee. Select an employee or use the ZIP export.", "danger");
    return;
  }

  if (!startDate || !endDate) {
    showAlert("exportAlert", "Please specify both Start Date and End Date.", "danger");
    return;
  }

  if (new Date(startDate) > new Date(endDate)) {
    showAlert("exportAlert", "Start Date cannot be after End Date.", "danger");
    return;
  }

  showLoader(true, `Generating official SADV ${format.toUpperCase()} timesheet...`);

  try {
    const res = await callApi("exportTimesheetData", { email, startDate, endDate, format });
    showLoader(false);

    if (res.status === "success") {
      triggerNativeDownload(res.base64, res.mimeType, res.filename);
      showAlert("exportAlert", `${format.toUpperCase()} timesheet generated and downloaded successfully!`, "success");
    } else {
      showAlert("exportAlert", res.message || "Failed to generate timesheet.", "danger");
    }
  } catch (err) {
    showLoader(false);
    showAlert("exportAlert", "Export Error: " + err.message, "danger");
  }
}

async function requestZipExport() {
  hideAlert("exportAlert");
  const email = document.getElementById("exportEmail").value;
  const startDate = document.getElementById("exportStart").value;
  const endDate = document.getElementById("exportEnd").value;

  if (!startDate || !endDate) {
    showAlert("exportAlert", "Please specify both Start Date and End Date.", "danger");
    return;
  }

  if (new Date(startDate) > new Date(endDate)) {
    showAlert("exportAlert", "Start Date cannot be after End Date.", "danger");
    return;
  }

  showLoader(true, "Compiling multi-employee SADV timesheet ZIP archive...");

  try {
    const res = await callApi("generateTimesheetsZip", { email, startDate, endDate });
    showLoader(false);

    if (res.status === "success") {
      triggerNativeDownload(res.base64, res.mimeType, res.filename);
      showAlert("exportAlert", "ZIP Archive downloaded successfully!", "success");
    } else {
      showAlert("exportAlert", res.message || "ZIP generation failed.", "danger");
    }
  } catch (err) {
    showLoader(false);
    showAlert("exportAlert", "ZIP Export Error: " + err.message, "danger");
  }
}

/* ==========================================================================
   MAINTENANCE UTILITIES
   ========================================================================== */

async function triggerSmartSync() {
  if (!confirm("Run Smart Sync? This will scan historical Activity Logs and recalculate Daily, Weekly, and Monthly summaries.")) return;
  showLoader(true, "Executing Smart Historical Sync on Google Sheets...");

  try {
    const res = await callApi("extractExistingLogsToDailySummaries");
    showLoader(false);
    alert(res.message);
    loadAdminDashboard();
  } catch (err) {
    showLoader(false);
    alert("Smart Sync Error: " + err.message);
  }
}

async function triggerFloorTimeReset() {
  if (!confirm("Reset all historical shift Clock-Out floor times to 17:00 (13:00 Saturday) and recalculate standard hours?")) return;
  showLoader(true, "Resetting floor times across database...");

  try {
    const res = await callApi("resetClockOutFloorTimes");
    showLoader(false);
    alert(res.message);
    loadAdminDashboard();
  } catch (err) {
    showLoader(false);
    alert("Reset Error: " + err.message);
  }
}

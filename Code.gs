/**
 * ============================================================================
 * SADV LOGGER - GOOGLE APPS SCRIPT BACKEND (Code.gs)
 * Brand: SADV (South African Digital Villages) - Live XTRA
 * Architecture: Headless Backend Web App returning JSON with CORS compatibility
 * ============================================================================
 */

const LOCATIONIQ_API_KEY = "pk.1be07ee2080691339d8fc4f1712dbc95";
const BRAND_NAME = "SADV";
const BRAND_LEGAL = "SA Digital Villages (Pty) Ltd";

/**
 * DATABASE INITIALIZATION SCRIPT
 * Run ONCE in Google Apps Script editor to initialize sheets & schemas.
 */
function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const schemas = {
    "Users": ["Email", "First Name", "Last Name", "Password Hash", "Salt", "Account Type", "Status", "Verification Token"],
    "Activity_Logs": ["Log ID", "Email", "First Name", "Last Name", "Date", "Time", "Action", "Latitude", "Longitude", "Resolved Location Name", "Edited By"],
    "Daily_Summaries": ["First Name", "Last Name", "Summary ID", "Date", "Email", "Clock In Time", "Clock Out Time", "Clock-In Floor Time", "Clock-Out Floor Time", "Total Hours worked", "Status", "Worked Overtime"],
    "Weekly_Summaries": ["First Name", "Last Name", "Email", "Week Identifier", "Total Hours Worked", "Total Overtime", "Days Worked", "Compliance Status", "Last Updated"],
    "Monthly_Summaries": ["First Name", "Last Name", "Email", "Month", "Total Hours Worked", "Total Overtime", "Days Worked", "Last Updated"],
    "Leave_Requests": ["Request ID", "Email", "First Name", "Last Name", "Leave Type", "Start Date", "End Date", "Status", "Submitted Date"]
  };

  for (const [sheetName, headers] of Object.entries(schemas)) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    } else {
      sheet.clear();
    }
    
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#0553a0");
    headerRange.setFontColor("#ffffff");
    headerRange.setBorder(true, true, true, true, false, false);
    
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
  }

  const sheet1 = ss.getSheetByName("Sheet1");
  if (sheet1 && ss.getSheets().length > 1) {
    try { ss.deleteSheet(sheet1); } catch (e) {}
  }

  return "SADV Logger Database Setup Complete! All tables and headers generated.";
}

/**
 * HELPER: Retrieve or create sheet
 */
function getOrCreateSheet(sheetName, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (headers && headers.length > 0) {
      sheet.appendRow(headers);
      const hRange = sheet.getRange(1, 1, 1, headers.length);
      hRange.setFontWeight("bold");
      hRange.setBackground("#0553a0");
      hRange.setFontColor("#ffffff");
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

/**
 * WEB APP API ROUTING
 * Crucial: Reads payload from e.parameter.payload to prevent CORS preflight friction.
 */
function doPost(e) {
  try {
    let payload = null;
    if (e && e.parameter && e.parameter.payload) {
      payload = JSON.parse(e.parameter.payload);
    } else if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    }

    if (!payload || !payload.method) {
      return createJsonResponse({ status: "error", message: "Invalid API request: missing payload or method." });
    }

    const result = handleApiRequest(payload.method, payload.args || {});
    return createJsonResponse(result);
  } catch (err) {
    return createJsonResponse({ status: "error", message: "API Execution Exception: " + err.toString() });
  }
}

function doGet(e) {
  return createJsonResponse({
    status: "online",
    system: "SADV Logger API Gateway",
    brand: BRAND_NAME,
    timestamp: new Date().toISOString()
  });
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Central API Dispatcher
 */
function handleApiRequest(method, args) {
  switch (method) {
    case "registerUser":
      return registerUser(args.email, args.firstName, args.lastName, args.password);
    case "loginUser":
      return loginUser(args.email, args.password);
    case "processActivityLog":
      return processActivityLog(args.email, args.firstName, args.lastName, args.action, args.lat, args.lon);
    case "getAdminDashboardData":
      return getAdminDashboardData();
    case "adminUpdateDailySummary":
      return adminUpdateDailySummary(args.summaryId, args.clockIn, args.clockOut, args.adminEmail);
    case "adminDeleteDailySummary":
      return adminDeleteDailySummary(args.summaryId, args.dateStr, args.email, args.adminEmail);
    case "adminUpdateUser":
      return adminUpdateUser(args.targetEmail, args.firstName, args.lastName, args.status, args.newPassword);
    case "submitLeaveRequest":
      return submitLeaveRequest(args.email, args.firstName, args.lastName, args.leaveType, args.startDate, args.endDate);
    case "adminUpdateLeaveStatus":
      return adminUpdateLeaveStatus(args.reqId, args.newStatus);
    case "exportTimesheetData":
      return exportTimesheetData(args.email, args.startDate, args.endDate, args.format);
    case "generateTimesheetsZip":
      return generateTimesheetsZip(args.email, args.startDate, args.endDate);
    case "extractExistingLogsToDailySummaries":
      return { status: "success", message: extractExistingLogsToDailySummaries() };
    case "resetClockOutFloorTimes":
      return { status: "success", message: resetClockOutFloorTimes() };
    default:
      return { status: "error", message: "Unknown API method: " + method };
  }
}

/* ==========================================================================
   AUTHENTICATION & SECURITY CORE (SHA-256 + Unique Salt)
   ========================================================================== */

function generateSalt(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789./';
  let salt = '';
  for (let i = 0; i < length; i++) {
    salt += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return salt;
}

function computeSHA256(password, salt) {
  const combined = password + salt;
  const signature = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, combined, Utilities.Charset.UTF_8);
  let hashStr = '';
  for (let i = 0; i < signature.length; i++) {
    let byteVal = signature[i];
    if (byteVal < 0) byteVal += 256;
    let byteString = byteVal.toString(16);
    if (byteString.length === 1) byteString = '0' + byteString;
    hashStr += byteString;
  }
  return hashStr;
}

function registerUser(email, firstName, lastName, password) {
  try {
    if (!email || !firstName || !lastName || !password) {
      return { status: "error", message: "All fields are required for registration." };
    }
    const sheet = getOrCreateSheet("Users", ["Email", "First Name", "Last Name", "Password Hash", "Salt", "Account Type", "Status", "Verification Token"]);
    const data = sheet.getDataRange().getValues();
    const cleanedEmail = email.trim().toLowerCase();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString().toLowerCase() === cleanedEmail) {
        return { status: "error", message: "Email is already registered in SADV Logger." };
      }
    }
    
    const salt = generateSalt();
    const passwordHash = computeSHA256(password, salt);
    const accountType = "Employee";
    const status = "Verified";
    const token = Utilities.getUuid();
    
    sheet.appendRow([cleanedEmail, firstName.trim(), lastName.trim(), passwordHash, salt, accountType, status, token]);
    return { status: "success", message: "Registration successful! You may now sign in." };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

function loginUser(email, password) {
  try {
    if (!email || !password) {
      return { status: "error", message: "Please provide both email and password." };
    }
    const sheet = getOrCreateSheet("Users", ["Email", "First Name", "Last Name", "Password Hash", "Salt", "Account Type", "Status", "Verification Token"]);
    const data = sheet.getDataRange().getValues();
    const cleanedEmail = email.trim().toLowerCase();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString().toLowerCase() === cleanedEmail) {
        const firstName = data[i][1];
        const lastName = data[i][2];
        const savedHash = data[i][3];
        const salt = data[i][4];
        const accountType = data[i][5];
        const status = data[i][6];
        
        if (status === "Blocked") {
          return { status: "error", message: "Your account has been deactivated. Please contact your SADV administrator." };
        }
        
        const computedHash = computeSHA256(password, salt);
        if (computedHash === savedHash) {
          return {
            status: "success",
            accountType: accountType,
            user: { email: cleanedEmail, firstName: firstName, lastName: lastName }
          };
        } else {
          return { status: "error", message: "Invalid password credentials provided." };
        }
      }
    }
    return { status: "error", message: "No SADV user profile found with that email." };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

/* ==========================================================================
   TIME & SHIFT CALCULATOR ENGINE (Floor Times & Overtime Lockdown)
   ========================================================================== */

function parseTimeToMinutes(timeStr) {
  if (!timeStr || timeStr === "--" || String(timeStr).includes("1899")) return null;
  const cleanStr = String(timeStr).trim().toUpperCase();
  const isPM = cleanStr.includes("PM");
  const isAM = cleanStr.includes("AM");
  
  const matches = cleanStr.match(/\d+/g);
  if (!matches || matches.length < 2) return null;
  
  let hours = parseInt(matches[0], 10);
  let minutes = parseInt(matches[1], 10);
  let seconds = matches.length >= 3 ? parseInt(matches[2], 10) : 0;
  
  if (isNaN(hours) || isNaN(minutes)) return null;
  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;
  
  return (hours * 60) + minutes + (seconds / 60);
}

function formatMinutesToTimeString(totalMinutes) {
  const hrs = Math.floor(totalMinutes / 60);
  const mins = Math.floor(totalMinutes % 60);
  const secs = Math.round((totalMinutes % 1) * 60);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Formats a given time string or Date object to exact HH:mm (excluding seconds).
 */
function formatTimeWithoutSeconds(timeStr) {
  if (!timeStr || timeStr === "--" || timeStr === "N/A") return "--";
  if (timeStr instanceof Date) {
    return Utilities.formatDate(timeStr, Session.getScriptTimeZone(), "HH:mm");
  }
  const cleanStr = String(timeStr).trim();
  if (cleanStr.includes("1899") || cleanStr.includes("GMT")) {
    const d = new Date(timeStr);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, Session.getScriptTimeZone(), "HH:mm");
    }
  }
  const isPM = cleanStr.toUpperCase().includes("PM");
  const isAM = cleanStr.toUpperCase().includes("AM");
  const matches = cleanStr.match(/\d+/g);
  if (matches && matches.length >= 2) {
    let hours = parseInt(matches[0], 10);
    const minutes = parseInt(matches[1], 10);
    if (isPM && hours < 12) hours += 12;
    if (isAM && hours === 12) hours = 0;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
  return cleanStr;
}

function parseDurationStringToMinutes(durationStr) {
  if (!durationStr || durationStr === "N/A" || durationStr === "--" || durationStr === "In Progress" || durationStr === "No Clock In") return 0;
  let totalMins = 0;
  const hrMatch = String(durationStr).match(/(\d+)\s*hr/i);
  const minMatch = String(durationStr).match(/(\d+)\s*min/i);
  if (hrMatch) totalMins += parseInt(hrMatch[1], 10) * 60;
  if (minMatch) totalMins += parseInt(minMatch[1], 10);
  return totalMins;
}

function formatMinutesToDurationString(totalMinutes) {
  if (totalMinutes <= 0) return "0 mins";
  const hrs = Math.floor(totalMinutes / 60);
  const mins = Math.round(totalMinutes % 60);
  if (hrs === 0) return `${mins} mins`;
  return `${hrs} hr${hrs > 1 ? 's' : ''} ${mins} min${mins > 1 ? 's' : ''}`;
}

function formatMinutesToDecimalHours(totalMinutes) {
  if (totalMinutes <= 0) return "0";
  return (totalMinutes / 60).toFixed(2);
}

/**
 * Floor Times & Shift Calculation Engine
 * Rule:
 *  - Clock-In Floor Time = exact clock-in time HH:mm (no seconds).
 *  - Clock-Out Floor Time = 17:00 (Mon-Fri) or 13:00 (Sat).
 *  - Overtime is 0 mins unless Admin edit explicitly stretched past standard end time.
 *  - Hours worked = Floor Clock-Out - Floor Clock-In, deduct 1 hr lunch if > 60m (no lunch on Sat).
 */
function calculateHoursAndOvertime(startTimeStr, endTimeStr, dateStr, isAdminEdit = false) {
  try {
    const rawStartMinutes = parseTimeToMinutes(startTimeStr);
    const endMinutes = parseTimeToMinutes(endTimeStr); 
    
    if (rawStartMinutes === null || endMinutes === null) {
      return { floorIn: "--", floorOut: "--", totalHours: "N/A", overtime: "0 mins" };
    }
    
    const dateObj = new Date(dateStr);
    const isSaturday = dateObj.getDay() === 6;
    
    let standardEndMins = isSaturday ? 780 : 1020; // 13:00 or 17:00
    let lunchDeductionMins = isSaturday ? 0 : 60;   
    
    const floorInStr = formatTimeWithoutSeconds(startTimeStr);
    const floorInMinutes = parseTimeToMinutes(floorInStr) || rawStartMinutes;
    
    const effectiveEndMinutes = isAdminEdit ? endMinutes : standardEndMins;
    const floorOutStr = formatTimeWithoutSeconds(formatMinutesToTimeString(effectiveEndMinutes));
    
    let standardWorkMinutes = 0;
    let otMinutes = 0;

    if (isAdminEdit) {
      if (endMinutes > standardEndMins) {
        otMinutes = endMinutes - standardEndMins;
        standardWorkMinutes = standardEndMins - floorInMinutes;
      } else {
        otMinutes = 0;
        standardWorkMinutes = endMinutes - floorInMinutes;
      }
    } else {
      // Normal employee clock out: Floor Out - Floor In
      standardWorkMinutes = standardEndMins - floorInMinutes;
      otMinutes = 0;
    }
    
    let netWorkMinutes = standardWorkMinutes;
    if (standardWorkMinutes > lunchDeductionMins) {
      netWorkMinutes = standardWorkMinutes - lunchDeductionMins;
    }
    if (netWorkMinutes < 0) netWorkMinutes = 0; 
    
    const totalHoursStr = formatMinutesToDurationString(netWorkMinutes);
    const overtimeStr = formatMinutesToDurationString(otMinutes);
    
    return { floorIn: floorInStr, floorOut: floorOutStr, totalHours: totalHoursStr, overtime: overtimeStr };
  } catch (e) {
    return { floorIn: "--", floorOut: "--", totalHours: "N/A", overtime: "0 mins" };
  }
}

/* ==========================================================================
   GEOLOCATION, TELEMETRY LOGGING & AUTO-FAILSAFES
   ========================================================================== */

function autoClosePreviousShifts(email, firstName, lastName, currentDateStr) {
  const summarySheet = getOrCreateSheet("Daily_Summaries", ["First Name", "Last Name", "Summary ID", "Date", "Email", "Clock In Time", "Clock Out Time", "Clock-In Floor Time", "Clock-Out Floor Time", "Total Hours worked", "Status", "Worked Overtime"]);
  const data = summarySheet.getDataRange().getDisplayValues();
  const logSheet = getOrCreateSheet("Activity_Logs", ["Log ID", "Email", "First Name", "Last Name", "Date", "Time", "Action", "Latitude", "Longitude", "Resolved Location Name", "Edited By"]);
  
  const targetEmail = email.trim().toLowerCase();
  
  for (let i = 1; i < data.length; i++) {
    const rowDateStr = String(data[i][3]).trim();
    const rowEmail = String(data[i][4]).trim().toLowerCase();
    const rowStatus = String(data[i][10]).trim(); 
    
    if (rowEmail === targetEmail && rowStatus === "In Progress" && rowDateStr !== "" && rowDateStr !== currentDateStr) {
      const isSat = new Date(rowDateStr).getDay() === 6;
      const autoOutTime = isSat ? "13:00:00" : "17:00:00";
      
      const logId = "LOG-" + Math.floor(100000 + Math.random() * 900000);
      logSheet.appendRow([logId, targetEmail, firstName, lastName, rowDateStr, autoOutTime, "Clock Out", "0", "0", "System Auto-Logout", "System Automation"]);
      
      const wasUpdated = updateDailySummaryTable(targetEmail, firstName, lastName, rowDateStr, autoOutTime, "Clock Out");
      
      if (wasUpdated) {
        const weekKey = getISOWeekKey(new Date(rowDateStr));
        syncWeeklySummariesForUser(targetEmail, weekKey);
        syncMonthlySummariesForUser(targetEmail, rowDateStr.substring(0, 7));
      }
    }
  }
}

function processActivityLog(userEmail, firstName, lastName, action, lat, lon) {
  try {
    const logSheet = getOrCreateSheet("Activity_Logs", ["Log ID", "Email", "First Name", "Last Name", "Date", "Time", "Action", "Latitude", "Longitude", "Resolved Location Name", "Edited By"]);
    
    const now = new Date();
    const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd");
    const timeStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "HH:mm:ss");
    
    const logData = logSheet.getDataRange().getDisplayValues(); 
    const targetEmail = userEmail.trim().toLowerCase();
    
    // Duplicate check for today
    for (let i = 1; i < logData.length; i++) {
      const rowEmail = String(logData[i][1]).trim().toLowerCase();
      const rowDateStr = String(logData[i][4]).trim();
      const rowAction = String(logData[i][6]).trim();
      
      if (rowEmail === targetEmail && rowDateStr === dateStr) {
        if (rowAction === action) {
          return { status: "error", message: `Duplicate blocked: You have already completed "${action}" today (${dateStr}).` };
        }
      }
    }

    // Auto-failsafe: Close dangling shifts from prior days
    if (action === "Clock In") {
      autoClosePreviousShifts(targetEmail, firstName, lastName, dateStr);
    }
    
    // Reverse Geocoding
    let locationName = "Unknown/Unresolved Coordinates";
    if (lat && lon) {
      const url = `https://us1.locationiq.com/v1/reverse?key=${LOCATIONIQ_API_KEY}&lat=${lat}&lon=${lon}&format=json`;
      try {
        const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        if (response.getResponseCode() === 200) {
          const parsed = JSON.parse(response.getContentText());
          locationName = parsed.display_name || locationName;
        }
      } catch (apiErr) {
        locationName = "Location IQ Resolved (Offline/Cached)";
      }
    }
    
    const logId = "LOG-" + Math.floor(100000 + Math.random() * 900000);
    logSheet.appendRow([logId, targetEmail, firstName, lastName, dateStr, timeStr, action, lat || "0", lon || "0", locationName, ""]);
    
    const wasUpdated = updateDailySummaryTable(targetEmail, firstName, lastName, dateStr, timeStr, action);
    if (wasUpdated) {
      const weekKey = getISOWeekKey(new Date(dateStr));
      syncWeeklySummariesForUser(targetEmail, weekKey);
      syncMonthlySummariesForUser(targetEmail, dateStr.substring(0, 7));
    }
    
    return { status: "success", action: action, location: locationName, time: timeStr, date: dateStr };
  } catch (e) {
    return { status: "error", message: "Server Processing Error: " + e.toString() };
  }
}

function updateDailySummaryTable(email, firstName, lastName, dateStr, timeStr, action) {
  const summarySheet = getOrCreateSheet("Daily_Summaries", ["First Name", "Last Name", "Summary ID", "Date", "Email", "Clock In Time", "Clock Out Time", "Clock-In Floor Time", "Clock-Out Floor Time", "Total Hours worked", "Status", "Worked Overtime"]);
  const data = summarySheet.getDataRange().getDisplayValues();
  let existingRow = -1;
  let currentStatus = "";
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][3]).trim() === dateStr && String(data[i][4]).trim().toLowerCase() === email) {
      existingRow = i + 1;
      currentStatus = String(data[i][10]).trim(); 
      break;
    }
  }
  
  if (currentStatus === "Completed") return false; 
  
  if (action === "Clock In") {
    const floorInTime = formatTimeWithoutSeconds(timeStr);
    if (existingRow !== -1) {
      summarySheet.getRange(existingRow, 6).setValue(timeStr);
      summarySheet.getRange(existingRow, 8).setValue(floorInTime);
      summarySheet.getRange(existingRow, 11).setValue("In Progress");
    } else {
      const summaryId = "SUM-" + Math.floor(100000 + Math.random() * 900000);
      summarySheet.appendRow([firstName, lastName, summaryId, dateStr, email, timeStr, "--", floorInTime, "--", "In Progress", "In Progress", "0 mins"]);
    }
    return false; 
  } else if (action === "Clock Out") {
    if (existingRow !== -1) {
      const clockInTime = summarySheet.getRange(existingRow, 6).getValue();
      let floorIn = "--"; 
      let floorOut = "--";
      let totalHours = "N/A"; 
      let overtime = "0 mins";
      
      if (clockInTime && clockInTime !== "--") {
        const calculated = calculateHoursAndOvertime(String(clockInTime), timeStr, dateStr, false);
        floorIn = calculated.floorIn;
        floorOut = calculated.floorOut;
        totalHours = calculated.totalHours;
        overtime = calculated.overtime;
      }
      
      summarySheet.getRange(existingRow, 7).setValue(timeStr);
      summarySheet.getRange(existingRow, 8).setValue(floorIn);
      summarySheet.getRange(existingRow, 9).setValue(floorOut);
      summarySheet.getRange(existingRow, 10).setValue(totalHours);
      summarySheet.getRange(existingRow, 11).setValue("Completed");
      summarySheet.getRange(existingRow, 12).setValue(overtime);
    } else {
      // Auto-failsafe: clocked out without clock in -> auto-generate clock in record first
      const summaryId = "SUM-" + Math.floor(100000 + Math.random() * 900000);
      summarySheet.appendRow([firstName, lastName, summaryId, dateStr, email, "--", timeStr, "--", "--", "No Clock In", "Completed", "0 mins"]);
    }
    return true; 
  }
  return false;
}

/* ==========================================================================
   ADMIN MANAGEMENT & SUMMARY EDITORS
   ========================================================================== */

function adminUpdateDailySummary(summaryId, newClockIn, newClockOut, adminEmail) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const summarySheet = ss.getSheetByName("Daily_Summaries");
    if (!summarySheet) return { status: "error", message: "Daily_Summaries sheet missing." };
    
    const data = summarySheet.getDataRange().getDisplayValues();
    let targetRow = -1;
    let email = "";
    let dateStr = "";
    let firstName = "";
    let lastName = "";
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][2]).trim() === String(summaryId).trim()) {
        targetRow = i + 1;
        firstName = String(data[i][0]).trim();
        lastName = String(data[i][1]).trim();
        dateStr = String(data[i][3]).trim();
        email = String(data[i][4]).trim().toLowerCase();
        break;
      }
    }
    if (targetRow === -1) return { status: "error", message: "Summary record not found." };
    
    const logSheet = getOrCreateSheet("Activity_Logs", ["Log ID", "Email", "First Name", "Last Name", "Date", "Time", "Action", "Latitude", "Longitude", "Resolved Location Name", "Edited By"]);
    const logData = logSheet.getDataRange().getDisplayValues();
    let foundOutLog = false;
    
    for (let j = 1; j < logData.length; j++) {
      const logEmail = String(logData[j][1]).trim().toLowerCase();
      const logDate = String(logData[j][4]).trim();
      const logAction = String(logData[j][6]).trim();
      
      if (logEmail === email && logDate === dateStr) {
        if (logAction === "Clock In" && newClockIn) {
          logSheet.getRange(j + 1, 6).setValue(newClockIn);
          logSheet.getRange(j + 1, 11).setValue(adminEmail);
        }
        if (logAction === "Clock Out" && newClockOut) {
          logSheet.getRange(j + 1, 6).setValue(newClockOut);
          logSheet.getRange(j + 1, 11).setValue(adminEmail); 
          foundOutLog = true;
        }
      }
    }
    
    if (newClockOut && newClockOut !== "--" && !foundOutLog) {
      const logId = "LOG-" + Math.floor(100000 + Math.random() * 900000);
      logSheet.appendRow([logId, email, firstName, lastName, dateStr, newClockOut, "Clock Out", "0", "0", "Manual Admin Adjustment", adminEmail]);
    }

    const finalIn = newClockIn && newClockIn.trim() !== "" ? newClockIn : "--";
    const finalOut = newClockOut && newClockOut.trim() !== "" ? newClockOut : "--";
    
    let floorIn = "--"; 
    let floorOut = "--";
    let totalHours = "N/A"; 
    let overtime = "0 mins";
    let status = "In Progress";
    
    if (finalIn !== "--" && finalOut !== "--") {
      const calc = calculateHoursAndOvertime(finalIn, finalOut, dateStr, true);
      floorIn = calc.floorIn;
      floorOut = calc.floorOut;
      totalHours = calc.totalHours;
      overtime = calc.overtime;
      status = "Completed";
    } else if (finalIn === "--" && finalOut !== "--") {
      totalHours = "No Clock In";
      status = "Completed";
    } else if (finalIn !== "--") {
      floorIn = formatTimeWithoutSeconds(finalIn);
    }
    
    summarySheet.getRange(targetRow, 6).setValue(finalIn);
    summarySheet.getRange(targetRow, 7).setValue(finalOut);
    summarySheet.getRange(targetRow, 8).setValue(floorIn);
    summarySheet.getRange(targetRow, 9).setValue(floorOut);
    summarySheet.getRange(targetRow, 10).setValue(totalHours);
    summarySheet.getRange(targetRow, 11).setValue(status);
    summarySheet.getRange(targetRow, 12).setValue(overtime);
    
    if (email && dateStr) {
      const weekKey = getISOWeekKey(new Date(dateStr));
      syncWeeklySummariesForUser(email, weekKey);
      syncMonthlySummariesForUser(email, dateStr.substring(0, 7));
    }
    return { status: "success", message: "Daily summary updated. Weekly and Monthly summaries synced." };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

function adminDeleteDailySummary(summaryId, dateStr, email, adminEmail) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const summarySheet = ss.getSheetByName("Daily_Summaries");
    const logSheet = ss.getSheetByName("Activity_Logs");

    const sumData = summarySheet.getDataRange().getDisplayValues();
    let sumRowDeleted = false;
    
    for (let i = sumData.length - 1; i >= 1; i--) {
      if (String(sumData[i][2]).trim() === String(summaryId).trim()) {
        summarySheet.deleteRow(i + 1);
        sumRowDeleted = true;
        break;
      }
    }

    if (!sumRowDeleted) return { status: "error", message: "Summary record not found." };

    const targetEmail = email.trim().toLowerCase();
    const logData = logSheet.getDataRange().getDisplayValues();
    
    for (let j = logData.length - 1; j >= 1; j--) {
      const lEmail = String(logData[j][1]).trim().toLowerCase();
      const lDate = String(logData[j][4]).trim();
      if (lEmail === targetEmail && lDate === dateStr) {
        logSheet.deleteRow(j + 1);
      }
    }

    if (targetEmail && dateStr) {
      const weekKey = getISOWeekKey(new Date(dateStr));
      syncWeeklySummariesForUser(targetEmail, weekKey);
      syncMonthlySummariesForUser(targetEmail, dateStr.substring(0, 7));
    }

    return { status: "success", message: "Daily shift and underlying activity logs deleted successfully." };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

/* ==========================================================================
   WEEKLY & MONTHLY SUMMARIES SYNCHRONIZATION
   ========================================================================== */

function getISOWeekKey(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function syncWeeklySummariesForUser(userEmail, targetWeekKey) {
  const weeklySheet = getOrCreateSheet("Weekly_Summaries", ["First Name", "Last Name", "Email", "Week Identifier", "Total Hours Worked", "Total Overtime", "Days Worked", "Compliance Status", "Last Updated"]);
  const dailySheet = getOrCreateSheet("Daily_Summaries", ["First Name", "Last Name", "Summary ID", "Date", "Email", "Clock In Time", "Clock Out Time", "Clock-In Floor Time", "Clock-Out Floor Time", "Total Hours worked", "Status", "Worked Overtime"]);
  
  const dailyData = dailySheet.getDataRange().getDisplayValues();
  let totalRegularMins = 0; 
  let totalOvertimeMins = 0; 
  let daysWorkedCount = 0;
  let firstName = ""; 
  let lastName = "";
  const targetEmail = userEmail.trim().toLowerCase();
  
  for (let i = 1; i < dailyData.length; i++) {
    const rowFirstName = String(dailyData[i][0] || "").trim();
    const rowLastName = String(dailyData[i][1] || "").trim();
    const rowDateStr = String(dailyData[i][3] || "").trim();
    const rowEmail = String(dailyData[i][4] || "").trim().toLowerCase();
    const rowTotalHoursStr = String(dailyData[i][9] || "").trim(); 
    const rowOvertimeStr = String(dailyData[i][11] || "").trim();  
    
    if (rowEmail === targetEmail && rowDateStr) {
      const rowWeekKey = getISOWeekKey(new Date(rowDateStr));
      if (rowWeekKey === targetWeekKey) {
        if (!firstName && rowFirstName) firstName = rowFirstName;
        if (!lastName && rowLastName) lastName = rowLastName;
        const regMins = parseDurationStringToMinutes(rowTotalHoursStr);
        const otMins = parseDurationStringToMinutes(rowOvertimeStr);
        if (regMins > 0 || otMins > 0 || dailyData[i][10] === "Completed") { 
          totalRegularMins += regMins; 
          totalOvertimeMins += otMins; 
          daysWorkedCount++;
        }
      }
    }
  }
  
  if (!firstName || !lastName) {
    const userSheet = getOrCreateSheet("Users", ["Email", "First Name", "Last Name", "Password Hash", "Salt", "Account Type", "Status", "Verification Token"]);
    const uData = userSheet.getDataRange().getDisplayValues();
    for (let u = 1; u < uData.length; u++) {
      if (String(uData[u][0]).trim().toLowerCase() === targetEmail) {
        firstName = uData[u][1];
        lastName = uData[u][2];
        break;
      }
    }
  }
  
  const totalCombinedMins = totalRegularMins + totalOvertimeMins;
  const totalHoursFloat = totalCombinedMins / 60;
  
  let complianceStatus = "Under Target (<45 hrs)";
  if (totalHoursFloat >= 55.0) complianceStatus = "🔴 MAX CAP ALERT (55+ hrs)";
  else if (totalHoursFloat >= 45.0) complianceStatus = "Target Met (Compliant)";
  
  const weeklyData = weeklySheet.getDataRange().getDisplayValues();
  let existingRow = -1;
  for (let w = 1; w < weeklyData.length; w++) {
    if (String(weeklyData[w][2]).trim().toLowerCase() === targetEmail && String(weeklyData[w][3]).trim() === targetWeekKey) {
      existingRow = w + 1; 
      break;
    }
  }
  
  const formattedHoursWorked = formatMinutesToDurationString(totalRegularMins);
  const formattedOvertime = formatMinutesToDurationString(totalOvertimeMins);
  const nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  
  if (existingRow !== -1) {
    weeklySheet.getRange(existingRow, 5, 1, 5).setValues([[formattedHoursWorked, formattedOvertime, daysWorkedCount, complianceStatus, nowStr]]);
  } else {
    weeklySheet.appendRow([firstName, lastName, targetEmail, targetWeekKey, formattedHoursWorked, formattedOvertime, daysWorkedCount, complianceStatus, nowStr]);
  }
}

function syncMonthlySummariesForUser(userEmail, monthStr) {
  const monthlySheet = getOrCreateSheet("Monthly_Summaries", ["First Name", "Last Name", "Email", "Month", "Total Hours Worked", "Total Overtime", "Days Worked", "Last Updated"]);
  const dailySheet = getOrCreateSheet("Daily_Summaries", ["First Name", "Last Name", "Summary ID", "Date", "Email", "Clock In Time", "Clock Out Time", "Clock-In Floor Time", "Clock-Out Floor Time", "Total Hours worked", "Status", "Worked Overtime"]);
  
  const dailyData = dailySheet.getDataRange().getDisplayValues();
  let totalRegularMins = 0; 
  let totalOvertimeMins = 0; 
  let daysWorkedCount = 0;
  let firstName = ""; 
  let lastName = "";
  const targetEmail = userEmail.trim().toLowerCase();
  
  for (let i = 1; i < dailyData.length; i++) {
    const rowFirstName = String(dailyData[i][0] || "").trim();
    const rowLastName = String(dailyData[i][1] || "").trim();
    const rowDate = String(dailyData[i][3] || "").trim();
    const rowEmail = String(dailyData[i][4] || "").trim().toLowerCase();
    const rowTotalHoursStr = String(dailyData[i][9] || "").trim(); 
    const rowOvertimeStr = String(dailyData[i][11] || "").trim(); 
    
    if (rowEmail === targetEmail && rowDate.startsWith(monthStr)) {
      if (!firstName && rowFirstName) firstName = rowFirstName;
      if (!lastName && rowLastName) lastName = rowLastName;
      const regMins = parseDurationStringToMinutes(rowTotalHoursStr);
      const otMins = parseDurationStringToMinutes(rowOvertimeStr);
      if (regMins > 0 || otMins > 0 || dailyData[i][10] === "Completed") {
        totalRegularMins += regMins; 
        totalOvertimeMins += otMins; 
        daysWorkedCount++;
      }
    }
  }
  
  if (!firstName || !lastName) return;
  
  const monthlyData = monthlySheet.getDataRange().getDisplayValues();
  let existingRow = -1;
  for (let m = 1; m < monthlyData.length; m++) {
    if (String(monthlyData[m][2]).trim().toLowerCase() === targetEmail && String(monthlyData[m][3]).trim() === monthStr) {
      existingRow = m + 1; 
      break;
    }
  }
  
  const formattedHoursWorked = formatMinutesToDurationString(totalRegularMins);
  const formattedOvertime = formatMinutesToDurationString(totalOvertimeMins);
  const nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  
  if (existingRow !== -1) {
    monthlySheet.getRange(existingRow, 5, 1, 4).setValues([[formattedHoursWorked, formattedOvertime, daysWorkedCount, nowStr]]);
  } else {
    monthlySheet.appendRow([firstName, lastName, targetEmail, monthStr, formattedHoursWorked, formattedOvertime, daysWorkedCount, nowStr]);
  }
}

/* ==========================================================================
   LEAVE APPLICATIONS & STAFF MANAGEMENT
   ========================================================================== */

function submitLeaveRequest(email, firstName, lastName, leaveType, startDate, endDate) {
  try {
    const sheet = getOrCreateSheet("Leave_Requests", ["Request ID", "Email", "First Name", "Last Name", "Leave Type", "Start Date", "End Date", "Status", "Submitted Date"]);
    const reqId = "LV-" + Math.floor(100000 + Math.random() * 900000);
    const submittedDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    
    sheet.appendRow([reqId, email.trim().toLowerCase(), firstName.trim(), lastName.trim(), leaveType, startDate, endDate, "Pending", submittedDate]);
    return { status: "success", message: `Leave request (${leaveType}) submitted for approval.` };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

function adminUpdateLeaveStatus(reqId, newStatus) {
  try {
    const sheet = getOrCreateSheet("Leave_Requests", ["Request ID", "Email", "First Name", "Last Name", "Leave Type", "Start Date", "End Date", "Status", "Submitted Date"]);
    const data = sheet.getDataRange().getDisplayValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(reqId).trim()) {
        sheet.getRange(i + 1, 8).setValue(newStatus);
        return { status: "success", message: `Leave request ${reqId} set to ${newStatus}.` };
      }
    }
    return { status: "error", message: "Leave record not found." };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

function adminUpdateUser(targetEmail, updatedFirst, updatedLast, updatedStatus, newPassword) {
  try {
    const sheet = getOrCreateSheet("Users", ["Email", "First Name", "Last Name", "Password Hash", "Salt", "Account Type", "Status", "Verification Token"]);
    const data = sheet.getDataRange().getValues();
    const targetClean = targetEmail.trim().toLowerCase();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString().toLowerCase() === targetClean) {
        const row = i + 1;
        if (updatedFirst) sheet.getRange(row, 2).setValue(updatedFirst.trim());
        if (updatedLast) sheet.getRange(row, 3).setValue(updatedLast.trim());
        if (updatedStatus) sheet.getRange(row, 7).setValue(updatedStatus);
        
        if (newPassword && newPassword.trim() !== "") {
          const newSalt = generateSalt();
          const newHash = computeSHA256(newPassword.trim(), newSalt);
          sheet.getRange(row, 4).setValue(newHash);
          sheet.getRange(row, 5).setValue(newSalt);
        }
        return { status: "success", message: "Staff profile updated successfully." };
      }
    }
    return { status: "error", message: "Target user not found." };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

/* ==========================================================================
   ADMIN DASHBOARD DATA COLLECTOR
   ========================================================================== */

function getAdminDashboardData() {
  try {
    const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    const todayMs = new Date(todayStr).getTime();
    
    const logSheet = getOrCreateSheet("Activity_Logs", ["Log ID", "Email", "First Name", "Last Name", "Date", "Time", "Action", "Latitude", "Longitude", "Resolved Location Name", "Edited By"]);
    const logDisplayData = logSheet.getDataRange().getDisplayValues();
    const logs = [];
    let totalLoginsToday = 0; 
    let totalLogoutsToday = 0;

    for (let i = 1; i < logDisplayData.length; i++) {
      let rawDateStr = String(logDisplayData[i][4] || "").trim();
      if (rawDateStr.includes("1899")) rawDateStr = "";
      const actionStr = String(logDisplayData[i][6] || "").trim();
      
      if (rawDateStr === todayStr) {
        if (actionStr === "Clock In") totalLoginsToday++;
        if (actionStr === "Clock Out") totalLogoutsToday++;
      }

      logs.push({
        id: String(logDisplayData[i][0] || ""),
        email: String(logDisplayData[i][1] || ""),
        firstName: String(logDisplayData[i][2] || ""),
        lastName: String(logDisplayData[i][3] || ""),
        date: rawDateStr, 
        time: String(logDisplayData[i][5] || ""),
        action: actionStr,
        lat: String(logDisplayData[i][7] || ""),
        lon: String(logDisplayData[i][8] || ""),
        location: String(logDisplayData[i][9] || "Unknown Location"),
        editedBy: String(logDisplayData[i][10] || "")
      });
    }
    
    const summarySheet = getOrCreateSheet("Daily_Summaries", ["First Name", "Last Name", "Summary ID", "Date", "Email", "Clock In Time", "Clock Out Time", "Clock-In Floor Time", "Clock-Out Floor Time", "Total Hours worked", "Status", "Worked Overtime"]);
    const summaryData = summarySheet.getDataRange().getDisplayValues();
    const summaries = [];
    for (let i = 1; i < summaryData.length; i++) {
      summaries.push({
        firstName: String(summaryData[i][0] || ""),
        lastName: String(summaryData[i][1] || ""),
        summaryId: String(summaryData[i][2] || ""),
        date: String(summaryData[i][3] || ""),
        email: String(summaryData[i][4] || ""),
        clockIn: String(summaryData[i][5] || "--"),
        clockOut: String(summaryData[i][6] || "--"),
        floorIn: String(summaryData[i][7] || "--"),
        floorOut: String(summaryData[i][8] || "--"),
        totalHours: String(summaryData[i][9] || "N/A"),
        status: String(summaryData[i][10] || "In Progress"),
        overtime: String(summaryData[i][11] || "0 mins")
      });
    }
    
    const weeklySheet = getOrCreateSheet("Weekly_Summaries", ["First Name", "Last Name", "Email", "Week Identifier", "Total Hours Worked", "Total Overtime", "Days Worked", "Compliance Status", "Last Updated"]);
    const weeklyData = weeklySheet.getDataRange().getDisplayValues();
    const weeklySummaries = [];
    for (let i = 1; i < weeklyData.length; i++) {
      weeklySummaries.push({
        firstName: String(weeklyData[i][0] || ""),
        lastName: String(weeklyData[i][1] || ""),
        email: String(weeklyData[i][2] || ""),
        weekKey: String(weeklyData[i][3] || ""),
        totalHours: String(weeklyData[i][4] || "0 mins"),
        totalOvertime: String(weeklyData[i][5] || "0 mins"),
        daysWorked: String(weeklyData[i][6] || "0"),
        complianceStatus: String(weeklyData[i][7] || "Under Target (<45 hrs)"),
        lastUpdated: String(weeklyData[i][8] || "")
      });
    }
    
    const monthlySheet = getOrCreateSheet("Monthly_Summaries", ["First Name", "Last Name", "Email", "Month", "Total Hours Worked", "Total Overtime", "Days Worked", "Last Updated"]);
    const monthlyData = monthlySheet.getDataRange().getDisplayValues();
    const monthlySummaries = [];
    for (let i = 1; i < monthlyData.length; i++) {
      monthlySummaries.push({
        firstName: String(monthlyData[i][0] || ""),
        lastName: String(monthlyData[i][1] || ""),
        email: String(monthlyData[i][2] || ""),
        month: String(monthlyData[i][3] || ""),
        totalHours: String(monthlyData[i][4] || "0 mins"),
        totalOvertime: String(monthlyData[i][5] || "0 mins"),
        daysWorked: String(monthlyData[i][6] || "0"),
        lastUpdated: String(monthlyData[i][7] || "")
      });
    }
    
    const leaveRequests = [];
    const onLeaveEmails = new Set();
    const leaveSheet = getOrCreateSheet("Leave_Requests", ["Request ID", "Email", "First Name", "Last Name", "Leave Type", "Start Date", "End Date", "Status", "Submitted Date"]);
    const leaveData = leaveSheet.getDataRange().getDisplayValues();
    
    for (let i = 1; i < leaveData.length; i++) {
      const reqId = String(leaveData[i][0] || "").trim();
      const empEmail = String(leaveData[i][1] || "").trim().toLowerCase();
      const fName = String(leaveData[i][2] || "").trim();
      const lName = String(leaveData[i][3] || "").trim();
      const lType = String(leaveData[i][4] || "").trim();
      const startDateStr = String(leaveData[i][5] || "").trim();
      const endDateStr = String(leaveData[i][6] || "").trim();
      const status = String(leaveData[i][7] || "").trim();
      const submittedDate = String(leaveData[i][8] || "").trim();

      leaveRequests.push({
        reqId: reqId, email: empEmail, firstName: fName, lastName: lName, type: lType, startDate: startDateStr, endDate: endDateStr, status: status, submittedDate: submittedDate
      });

      if (status === "Approved") {
        const startMs = new Date(startDateStr).getTime();
        const endMs = new Date(endDateStr).getTime();
        if (todayMs >= startMs && todayMs <= endMs) {
          onLeaveEmails.add(empEmail);
        }
      }
    }
    
    const userSheet = getOrCreateSheet("Users", ["Email", "First Name", "Last Name", "Password Hash", "Salt", "Account Type", "Status", "Verification Token"]);
    const userData = userSheet.getDataRange().getDisplayValues();
    const employees = [];
    for (let i = 1; i < userData.length; i++) {
      const empEmail = String(userData[i][0] || "").trim().toLowerCase();
      const standing = String(userData[i][6] || "Verified").trim();
      
      employees.push({
        email: empEmail,
        firstName: String(userData[i][1] || ""),
        lastName: String(userData[i][2] || ""),
        accountType: String(userData[i][5] || "Employee"),
        accountStanding: standing,
        workStatus: onLeaveEmails.has(empEmail) ? "On Leave" : "Active"
      });
    }
    
    return { 
      status: "success", 
      logs: logs.reverse(), 
      summaries: summaries.reverse(), 
      weeklySummaries: weeklySummaries.reverse(),
      monthlySummaries: monthlySummaries.reverse(),
      employees: employees,
      leaveRequests: leaveRequests.reverse(),
      dailyStats: { loginsToday: totalLoginsToday, logoutsToday: totalLogoutsToday }
    };
  } catch (e) {
    return { status: "error", message: "Database Error: " + e.toString() };
  }
}

/* ==========================================================================
   TIMESHEET EXPORT ENGINE (SADV Branded PDF & CSV)
   ========================================================================== */

function fetchTimesheetData(email, startDateStr, endDateStr) {
  const targetEmail = email.trim().toLowerCase();
  
  const userSheet = getOrCreateSheet("Users", []);
  const userData = userSheet.getDataRange().getDisplayValues();
  let employeeName = "Employee";
  for (let i = 1; i < userData.length; i++) {
    if (String(userData[i][0]).trim().toLowerCase() === targetEmail) {
      employeeName = `${String(userData[i][1]).trim()} ${String(userData[i][2]).trim()}`;
      break;
    }
  }

  const startDt = new Date(startDateStr);
  const endDt = new Date(endDateStr);
  const dateMap = {};
  let currentDt = new Date(startDt);
  
  while (currentDt <= endDt) {
    const isoDate = Utilities.formatDate(currentDt, Session.getScriptTimeZone(), "yyyy-MM-dd");
    const dayName = Utilities.formatDate(currentDt, Session.getScriptTimeZone(), "EEEE");
    dateMap[isoDate] = {
      date: isoDate, day: dayName, start: "", lunch: "", end: "", regMins: 0, otMins: 0, sick: "", annual: "", family: "", other: "", isLeave: false
    };
    currentDt.setDate(currentDt.getDate() + 1);
  }

  // Map approved leave
  const leaveSheet = getOrCreateSheet("Leave_Requests", []);
  const leaveData = leaveSheet.getDataRange().getDisplayValues();
  for (let i = 1; i < leaveData.length; i++) {
    const lEmail = String(leaveData[i][1]).trim().toLowerCase();
    const lType = String(leaveData[i][4]).trim();
    const lStart = new Date(String(leaveData[i][5]).trim());
    const lEnd = new Date(String(leaveData[i][6]).trim());
    const lStatus = String(leaveData[i][7]).trim();

    if (lEmail === targetEmail && lStatus === "Approved") {
      let lCurr = new Date(lStart);
      while (lCurr <= lEnd) {
        const lIso = Utilities.formatDate(lCurr, Session.getScriptTimeZone(), "yyyy-MM-dd");
        if (dateMap[lIso]) {
          dateMap[lIso].isLeave = true; 
          dateMap[lIso].regMins = 0; 
          dateMap[lIso].otMins = 0;
          if (lType === "Sick") dateMap[lIso].sick = "SL";
          else if (lType === "Annual") dateMap[lIso].annual = "AL";
          else if (lType === "Family Responsibility") dateMap[lIso].family = "FL";
          else dateMap[lIso].other = lType;
        }
        lCurr.setDate(lCurr.getDate() + 1);
      }
    }
  }

  const summarySheet = getOrCreateSheet("Daily_Summaries", []);
  const sumData = summarySheet.getDataRange().getDisplayValues();
  for (let i = 1; i < sumData.length; i++) {
    const sDate = String(sumData[i][3]).trim();
    const sEmail = String(sumData[i][4]).trim().toLowerCase();
    
    if (sEmail === targetEmail && dateMap[sDate] && !dateMap[sDate].isLeave) {
      const sFloorIn = String(sumData[i][7]).trim(); 
      const sFloorOut = String(sumData[i][8]).trim(); 
      const sReg = String(sumData[i][9]).trim();
      const sOt = String(sumData[i][11]).trim();
      
      const dObj = new Date(sDate);
      const isSat = dObj.getDay() === 6;
      
      // CRITICAL REQUIREMENT: Times MUST come from Clock-In Floor Time and Clock-Out Floor Time
      dateMap[sDate].start = (sFloorIn && sFloorIn !== "--") ? sFloorIn : "08:00";
      dateMap[sDate].end = (sFloorOut && sFloorOut !== "--") ? sFloorOut : (isSat ? "13:00" : "17:00");
      
      if (dateMap[sDate].start && dateMap[sDate].end) {
        dateMap[sDate].lunch = (isSat || dObj.getDay() === 0) ? "" : "1 hour";
      }
      
      dateMap[sDate].regMins = parseDurationStringToMinutes(sReg);
      dateMap[sDate].otMins = parseDurationStringToMinutes(sOt);
    }
  }

  const rows = Object.values(dateMap).sort((a, b) => new Date(a.date) - new Date(b.date));
  let finalRows = [];
  let currentWeekKey = "";
  let weekRegMins = 0;
  
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const wKey = getISOWeekKey(new Date(r.date));
    
    if (currentWeekKey !== "" && wKey !== currentWeekKey) {
      finalRows.push({ isTotal: true, label: "Total Weekly Hours", val: formatMinutesToDecimalHours(weekRegMins) + " Hours" });
      weekRegMins = 0;
    }
    
    currentWeekKey = wKey;
    weekRegMins += r.regMins;
    const dStr = Utilities.formatDate(new Date(r.date), Session.getScriptTimeZone(), "dd MMM yyyy");
    let roundedOtHours = Math.round(r.otMins / 60);
    
    finalRows.push({
      isTotal: false, 
      date: dStr, 
      day: r.day, 
      start: r.start, 
      lunch: r.lunch, 
      end: r.end,
      regStr: r.regMins > 0 ? formatMinutesToDecimalHours(r.regMins) + " hrs" : "",
      otStr: roundedOtHours > 0 ? roundedOtHours + " hrs" : "",
      sick: r.sick, 
      annual: r.annual, 
      family: r.family, 
      other: r.other
    });
    
    if (i === rows.length - 1) {
      finalRows.push({ isTotal: true, label: "Total Weekly Hours", val: formatMinutesToDecimalHours(weekRegMins) + " Hours" });
    }
  }
  
  const grandTotalMins = finalRows.filter(r => !r.isTotal).reduce((acc, r) => acc + (r.regStr ? parseFloat(r.regStr) * 60 : 0), 0);

  return {
    employeeName: employeeName,
    startDateStr: Utilities.formatDate(startDt, Session.getScriptTimeZone(), "MMM yyyy"),
    rows: finalRows,
    grandTotalStr: (grandTotalMins / 60).toFixed(2) + " Hours"
  };
}

function generateTimesheetHtml(data) {
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10px; color: #1e293b; margin: 20px; line-height: 1.4; }
        .header-container { width: 100%; border-bottom: 3px solid #0553a0; padding-bottom: 12px; margin-bottom: 20px; display: table; }
        .header-left { display: table-cell; vertical-align: middle; }
        .header-right { display: table-cell; vertical-align: middle; text-align: right; }
        .brand-badge { display: inline-block; background-color: #0553a0; color: #ffffff; font-weight: 900; font-size: 20px; padding: 4px 12px; border-radius: 4px; letter-spacing: 1px; }
        .brand-xtra { color: #ff40b4; font-weight: bold; }
        .title { font-size: 22px; font-weight: 800; color: #0553a0; margin: 6px 0 2px 0; }
        .subtitle { font-size: 13px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
        .info-box { margin-top: 10px; font-size: 11px; background: #f8fafc; padding: 10px 14px; border-radius: 6px; border: 1px solid #e2e8f0; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 20px; }
        th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: center; }
        th { background-color: #0553a0; color: #ffffff; font-weight: bold; font-size: 9px; text-transform: uppercase; letter-spacing: 0.03em; }
        .week-total td { background-color: #f0f7ff; font-weight: bold; color: #0553a0; border-top: 2px solid #0553a0; }
        .grand-total td { background-color: #0553a0; color: #ffffff; font-weight: bold; font-size: 11px; }
        .footer-table { width: 100%; margin-top: 35px; border-collapse: collapse; }
        .footer-table td { border: none; padding: 12px; vertical-align: bottom; }
        .sign-line { border-bottom: 1px solid #0f172a; width: 85%; margin-top: 30px; margin-bottom: 6px; }
        .company-info { margin-top: 25px; font-size: 9px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 12px; }
      </style>
    </head>
    <body>
      <div class="header-container">
        <div class="header-left">
          <span class="brand-badge">SADV <span class="brand-xtra">Live XTRA</span></span>
          <h1 class="title">MONTHLY WORK TIMESHEET</h1>
          <div class="subtitle">Geolocation & Floor Shift Verification</div>
        </div>
        <div class="header-right">
          <div class="info-box">
            <strong>Employee:</strong> ${data.employeeName}<br>
            <strong>Period:</strong> ${data.startDateStr}<br>
            <strong>Standard Floor:</strong> Mon-Fri 17:00 / Sat 13:00
          </div>
        </div>
      </div>
      
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Day</th>
            <th>Start (Floor)</th>
            <th>Lunch</th>
            <th>End (Floor)</th>
            <th>Regular Hrs</th>
            <th>Overtime</th>
            <th>Sick (SL)</th>
            <th>Annual (AL)</th>
            <th>Family (FL)</th>
            <th>Other</th>
          </tr>
        </thead>
        <tbody>
  `;
  
  data.rows.forEach(r => {
    if (r.isTotal) {
      html += `<tr class="week-total"><td colspan="5" style="text-align:left; padding-left:12px;">${r.label}</td><td>${r.val}</td><td colspan="5"></td></tr>`;
    } else {
      html += `<tr>
        <td>${r.date}</td><td>${r.day}</td><td>${r.start}</td><td>${r.lunch}</td><td>${r.end}</td>
        <td>${r.regStr}</td><td>${r.otStr}</td><td>${r.sick}</td><td>${r.annual}</td>
        <td>${r.family}</td><td>${r.other}</td>
      </tr>`;
    }
  });
  
  html += `<tr class="grand-total"><td colspan="5" style="text-align:left; padding-left:12px;">TOTAL ACCUMULATED HOURS</td><td>${data.grandTotalStr}</td><td colspan="5"></td></tr>`;
  html += `</tbody></table>
  
      <table class="footer-table">
        <tr>
          <td><div class="sign-line"></div>Employee Signature:<br>Date:</td>
          <td><div class="sign-line"></div>Manager / Supervisor Approval:<br>Date:</td>
        </tr>
      </table>
      
      <div class="company-info">
        <strong>SA Digital Villages (Pty) Ltd (SADV)</strong> &bull; Fast &amp; Affordable Fibre Internet South Africa<br>
        Verified by SADV Geolocation &amp; Device Attendance Engine &bull; https://sadv.co.za
      </div>
    </body>
    </html>
  `;
  return html;
}

function exportTimesheetData(email, startDate, endDate, format) {
  try {
    const data = fetchTimesheetData(email, startDate, endDate);
    
    if (format === 'csv') {
      let csvContent = "DATE,DAY,START TIME (FLOOR),LUNCH,END TIME (FLOOR),REGULAR HRS,OVERTIME HRS,SICK LEAVE,ANNUAL LEAVE,FAMILY LEAVE,OTHER\n";
      data.rows.forEach(r => {
        if (r.isTotal) {
          csvContent += `Total Weekly Hours,,,,,,${r.val},,,,\n`;
        } else {
          csvContent += `"${r.date}","${r.day}","${r.start}","${r.lunch}","${r.end}","${r.regStr}","${r.otStr}","${r.sick}","${r.annual}","${r.family}","${r.other}"\n`;
        }
      });
      csvContent += `TOTAL HOURS,,,,,,${data.grandTotalStr},,,,\n`;
      
      const blob = Utilities.newBlob(csvContent, "text/csv", `SADV_${data.employeeName.replace(/\s+/g,'_')}_Timesheet.csv`);
      return { status: "success", base64: Utilities.base64Encode(blob.getBytes()), filename: blob.getName(), mimeType: "text/csv" };
    } 
    
    if (format === 'pdf') {
      const html = generateTimesheetHtml(data);
      const blob = HtmlService.createHtmlOutput(html).getAs('application/pdf');
      blob.setName(`SADV_${data.employeeName.replace(/\s+/g,'_')}_Timesheet.pdf`);
      return { status: "success", base64: Utilities.base64Encode(blob.getBytes()), filename: blob.getName(), mimeType: "application/pdf" };
    }
    
    return { status: "error", message: "Invalid export format requested." };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

function generateTimesheetsZip(email, startDateStr, endDateStr) {
  try {
    const userSheet = getOrCreateSheet("Users", []);
    const userData = userSheet.getDataRange().getDisplayValues();
    
    let targetEmails = [];
    if (email === "ALL") {
      const seenEmails = new Set();
      for (let i = 1; i < userData.length; i++) {
        const e = String(userData[i][0]).trim().toLowerCase();
        if (e && !seenEmails.has(e)) {
          seenEmails.add(e);
          targetEmails.push(e);
        }
      }
    } else {
      targetEmails.push(email.trim().toLowerCase());
    }

    if (targetEmails.length === 0) {
      return { status: "error", message: "No employees found to generate timesheets." };
    }

    const pdfBlobs = [];
    const processedNames = new Set(); 

    targetEmails.forEach(empEmail => {
      const data = fetchTimesheetData(empEmail, startDateStr, endDateStr);
      const rawName = data.employeeName.trim();
      
      if (!processedNames.has(rawName)) {
        processedNames.add(rawName);
        const html = generateTimesheetHtml(data);
        const blob = HtmlService.createHtmlOutput(html).getAs('application/pdf');
        blob.setName(`SADV_${rawName.replace(/\s+/g,'_')}_Timesheet.pdf`);
        pdfBlobs.push(blob);
      }
    });

    if (pdfBlobs.length === 0) {
      return { status: "error", message: "No timesheets could be compiled." };
    }

    const dateStrZip = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT", "yyyyMMdd");
    const zipName = `SADV_Timesheets_${dateStrZip}.zip`;
    
    const zipBlob = Utilities.zip(pdfBlobs, zipName);
    const base64Data = Utilities.base64Encode(zipBlob.getBytes());

    return {
      status: "success",
      filename: zipName,
      mimeType: zipBlob.getContentType(),
      base64: base64Data
    };
  } catch (error) {
    return { status: "error", message: error.toString() };
  }
}

/* ==========================================================================
   MAINTENANCE UTILITIES
   ========================================================================== */

function extractExistingLogsToDailySummaries() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const logSheet = getOrCreateSheet("Activity_Logs", ["Log ID", "Email", "First Name", "Last Name", "Date", "Time", "Action", "Latitude", "Longitude", "Resolved Location Name", "Edited By"]);
  const summarySheet = getOrCreateSheet("Daily_Summaries", ["First Name", "Last Name", "Summary ID", "Date", "Email", "Clock In Time", "Clock Out Time", "Clock-In Floor Time", "Clock-Out Floor Time", "Total Hours worked", "Status", "Worked Overtime"]);
  
  const logData = logSheet.getDataRange().getDisplayValues();
  if (logData.length <= 1) return "No activity logs found to process.";

  const summaryData = summarySheet.getDataRange().getDisplayValues();
  const existingSummariesMap = {};

  for (let i = 1; i < summaryData.length; i++) {
    const dateStr = String(summaryData[i][3]).trim();
    const email = String(summaryData[i][4]).trim().toLowerCase();
    const status = String(summaryData[i][10]).trim();
    
    if (email && dateStr) {
      const key = `${email}_${dateStr}`;
      existingSummariesMap[key] = {
        rowIndex: i + 1, 
        status: status
      };
    }
  }

  const shiftMap = {};

  for (let i = 1; i < logData.length; i++) {
    const email = String(logData[i][1] || "").trim().toLowerCase();
    const firstName = String(logData[i][2] || "").trim();
    const lastName = String(logData[i][3] || "").trim();
    let dateStr = String(logData[i][4] || "").trim();
    if (dateStr.includes("1899")) dateStr = "";
    const timeStr = String(logData[i][5] || "").trim();
    const action = String(logData[i][6] || "").trim();

    if (!email || !dateStr) continue;
    const key = `${email}_${dateStr}`;

    if (!shiftMap[key]) {
      shiftMap[key] = {
        firstName: firstName,
        lastName: lastName,
        email: email,
        date: dateStr,
        clockIn: "--",
        clockOut: "--"
      };
    }

    if (action === "Clock In") shiftMap[key].clockIn = timeStr;
    else if (action === "Clock Out") shiftMap[key].clockOut = timeStr;
  }

  let newlyAdded = 0;
  let updatedInProgress = 0;
  let skippedCompleted = 0;
  
  const userWeeksToSync = new Set();
  const userMonthsToSync = new Set();

  for (const key in shiftMap) {
    const shift = shiftMap[key];

    if (existingSummariesMap[key] && existingSummariesMap[key].status === "Completed") {
      skippedCompleted++;
      continue; 
    }

    let floorIn = "--"; 
    let floorOut = "--";
    let totalHours = "N/A"; 
    let overtime = "0 mins";
    let status = "In Progress";

    if (shift.clockIn !== "--" && shift.clockOut !== "--") {
      const calculated = calculateHoursAndOvertime(shift.clockIn, shift.clockOut, shift.date, false);
      floorIn = calculated.floorIn;
      floorOut = calculated.floorOut;
      totalHours = calculated.totalHours;
      overtime = calculated.overtime;
      status = "Completed";
    } else if (shift.clockIn !== "--") {
      floorIn = formatTimeWithoutSeconds(shift.clockIn);
    } else if (shift.clockIn === "--" && shift.clockOut !== "--") {
      totalHours = "No Clock In";
      overtime = "N/A";
      status = "Completed";
    }

    if (existingSummariesMap[key]) {
      const row = existingSummariesMap[key].rowIndex;
      summarySheet.getRange(row, 6).setValue(shift.clockIn);
      summarySheet.getRange(row, 7).setValue(shift.clockOut);
      summarySheet.getRange(row, 8).setValue(floorIn);
      summarySheet.getRange(row, 9).setValue(floorOut);
      summarySheet.getRange(row, 10).setValue(totalHours);
      summarySheet.getRange(row, 11).setValue(status);
      summarySheet.getRange(row, 12).setValue(overtime);
      updatedInProgress++;
    } else {
      const summaryId = "SUM-" + Math.floor(100000 + Math.random() * 900000);
      summarySheet.appendRow([shift.firstName, shift.lastName, summaryId, shift.date, shift.email, shift.clockIn, shift.clockOut, floorIn, floorOut, totalHours, status, overtime]);
      newlyAdded++;
    }
    
    if (shift.date) {
      const weekKey = getISOWeekKey(new Date(shift.date));
      userWeeksToSync.add(`${shift.email}|${weekKey}`);
      userMonthsToSync.add(`${shift.email}|${shift.date.substring(0, 7)}`);
    }
  }

  userWeeksToSync.forEach(item => {
    const parts = item.split("|");
    syncWeeklySummariesForUser(parts[0], parts[1]);
  });

  userMonthsToSync.forEach(item => {
    const parts = item.split("|");
    syncMonthlySummariesForUser(parts[0], parts[1]);
  });

  return `Smart Sync Complete: Added ${newlyAdded} new shifts, Updated ${updatedInProgress} pending shifts, Skipped ${skippedCompleted} completed shifts.`;
}

function resetClockOutFloorTimes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const summarySheet = ss.getSheetByName("Daily_Summaries");
  const logSheet = ss.getSheetByName("Activity_Logs");
  
  if (!summarySheet || !logSheet) return "Error: Required sheets not found.";

  const logData = logSheet.getDataRange().getDisplayValues();
  const adminEditedDates = new Set();
  
  for (let j = 1; j < logData.length; j++) {
    const rowEmail = String(logData[j][1]).trim().toLowerCase();
    const rowDate = String(logData[j][4]).trim();
    const editedBy = String(logData[j][10]).trim();
    if (editedBy !== "" && editedBy !== "System Automation") {
      adminEditedDates.add(`${rowEmail}_${rowDate}`);
    }
  }

  const data = summarySheet.getDataRange().getDisplayValues();
  let updatedCount = 0;
  
  const userWeeksToSync = new Set();
  const userMonthsToSync = new Set();

  for (let i = 1; i < data.length; i++) {
    const row = i + 1;
    const dateStr = String(data[i][3]).trim();
    const email = String(data[i][4]).trim().toLowerCase();
    const clockIn = String(data[i][5]).trim();
    const clockOut = String(data[i][6]).trim();
    const status = String(data[i][10]).trim(); 
    
    if (dateStr && clockIn !== "--" && email) {
      let newFloorIn = formatTimeWithoutSeconds(clockIn); 
      let newFloorOut = "--";
      let totalHours = "N/A"; 
      let overtime = "0 mins";
      let newStatus = status;

      const dateObj = new Date(dateStr);
      const isSaturday = dateObj.getDay() === 6;
      const baselineFloorOut = isSaturday ? "13:00" : "17:00";

      if (clockIn !== "--" && clockOut !== "--") {
        const isAdminEdit = adminEditedDates.has(`${email}_${dateStr}`);
        const calc = calculateHoursAndOvertime(clockIn, clockOut, dateStr, isAdminEdit);
        
        newFloorIn = calc.floorIn;
        newFloorOut = isAdminEdit ? calc.floorOut : baselineFloorOut; 
        
        totalHours = calc.totalHours;
        overtime = calc.overtime;
        newStatus = "Completed";
      } else {
        newFloorOut = baselineFloorOut;
      }

      summarySheet.getRange(row, 8).setValue(newFloorIn);        
      summarySheet.getRange(row, 9).setValue(newFloorOut);       
      summarySheet.getRange(row, 10).setValue(totalHours);       
      summarySheet.getRange(row, 11).setValue(newStatus);        
      summarySheet.getRange(row, 12).setValue(overtime);         
      
      updatedCount++;

      const weekKey = getISOWeekKey(new Date(dateStr));
      userWeeksToSync.add(`${email}|${weekKey}`);
      userMonthsToSync.add(`${email}|${dateStr.substring(0, 7)}`);
    }
  }

  userWeeksToSync.forEach(item => {
    const parts = item.split("|");
    syncWeeklySummariesForUser(parts[0], parts[1]);
  });

  userMonthsToSync.forEach(item => {
    const parts = item.split("|");
    syncMonthlySummariesForUser(parts[0], parts[1]);
  });

  return `Reset Clock-Out Floor Times for ${updatedCount} historical shifts. Weekly & Monthly totals synced.`;
}

/**
 * ============================================================================
 * SADV LOGGER - EMPLOYEE PORTAL LOGIC (employee/employee.js)
 * ============================================================================
 */

const LOGIN_URL = "../index.html";
let currentSession = null;
let CURRENT_SHIFT_STATUS = null;

document.addEventListener("DOMContentLoaded", () => {
  // Enforce session
  currentSession = requireSession("Employee", LOGIN_URL);
  if (!currentSession) return;

  // Initialize UI
  const empNameEl = document.getElementById("empNameDisplay");
  const empEmailEl = document.getElementById("empEmailDisplay");
  if (empNameEl) empNameEl.innerText = `${currentSession.user.firstName} ${currentSession.user.lastName}`;
  if (empEmailEl) empEmailEl.innerText = currentSession.user.email;

  // Restore cached shift status if available
  if (currentSession.todayShift) {
    updateEmployeeShiftUI(currentSession.todayShift);
  }

  // Fetch real-time shift status from backend
  fetchTodayShiftStatus();

  // Start live clock
  updateLiveClock();
  setInterval(updateLiveClock, 1000);
});

async function fetchTodayShiftStatus() {
  if (!currentSession || !currentSession.user || !currentSession.user.email) return;

  try {
    const res = await callApi("getTodayShiftStatus", { email: currentSession.user.email });
    if (res && res.status === "success" && res.todayShift) {
      updateEmployeeShiftUI(res.todayShift);
      updateSessionShift(res.todayShift);
    }
  } catch (err) {
    console.warn("Could not retrieve real-time shift status:", err);
  }
}

function updateEmployeeShiftUI(shift) {
  CURRENT_SHIFT_STATUS = shift;

  const btnIn = document.getElementById("btnClockIn");
  const btnOut = document.getElementById("btnClockOut");
  const inSub = document.getElementById("clockInSubtitle");
  const outSub = document.getElementById("clockOutSubtitle");
  const inBadge = document.getElementById("clockInBadge");
  const outBadge = document.getElementById("clockOutBadge");

  if (!btnIn || !btnOut) return;

  const hasIn = shift && (shift.hasClockedIn || (shift.clockIn && shift.clockIn !== "--"));
  const hasOut = shift && (shift.hasClockedOut || (shift.clockOut && shift.clockOut !== "--"));
  const isCompleted = shift && (shift.status === "Completed" || hasOut);

  if (isCompleted) {
    btnIn.disabled = true;
    btnIn.title = "Shift finalized for today";
    if (inSub) inSub.innerText = "Shift completed for today";
    if (inBadge) {
      inBadge.classList.remove("hidden");
      inBadge.innerText = `✓ In: ${shift.clockIn || "--"}`;
    }

    btnOut.disabled = true;
    btnOut.title = "Shift finalized for today";
    if (outSub) outSub.innerText = `Shift finalized (${shift.clockOut || "--"})`;
    if (outBadge) {
      outBadge.classList.remove("hidden");
      outBadge.innerText = "✓ Completed";
    }
  } else if (hasIn) {
    btnIn.disabled = true;
    btnIn.title = `Already clocked in at ${shift.clockIn}`;
    if (inSub) {
      const displayInTime = shift.floorIn && shift.floorIn !== "--" ? shift.floorIn : shift.clockIn;
      inSub.innerText = `Active shift since ${displayInTime}`;
    }
    if (inBadge) {
      inBadge.classList.remove("hidden");
      inBadge.innerText = "✓ Clocked In";
    }

    btnOut.disabled = false;
    btnOut.title = "Conclude your shift for today";
    if (outSub) outSub.innerText = "Standard Floor: 17:00 / Sat: 13:00";
    if (outBadge) {
      outBadge.classList.add("hidden");
    }
  } else {
    // Has not clocked in yet -> strictly forbid clock-out
    btnIn.disabled = false;
    btnIn.title = "Clock in for your morning shift";
    if (inSub) inSub.innerText = "Record Exact Morning Floor Time";
    if (inBadge) {
      inBadge.classList.add("hidden");
    }

    btnOut.disabled = true;
    btnOut.title = "You cannot clock out until you have clocked in for today";
    if (outSub) outSub.innerText = "Clock in first to enable clock out";
    if (outBadge) {
      outBadge.classList.remove("hidden");
      outBadge.innerText = "Clock-In Required";
    }
  }
}

function updateLiveClock() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const dateStr = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });

  const clockEl = document.getElementById("liveClockTime");
  const dateEl = document.getElementById("liveClockDate");
  if (clockEl) clockEl.innerText = timeStr;
  if (dateEl) dateEl.innerText = dateStr;
}

function logout() {
  clearSession();
  window.location.href = LOGIN_URL;
}

function triggerClockAction(actionType) {
  hideAlert("clockAlert");

  // Strict Client-Side Guard: Prevent Clock Out without Clock In
  if (actionType === "Clock Out") {
    const isClockedIn = CURRENT_SHIFT_STATUS && (CURRENT_SHIFT_STATUS.hasClockedIn || (CURRENT_SHIFT_STATUS.clockIn && CURRENT_SHIFT_STATUS.clockIn !== "--"));
    if (!isClockedIn) {
      showAlert(
        "clockAlert",
        "Action Blocked: You cannot clock out because you have not clocked in for today yet. Please clock in first.",
        "danger"
      );
      return;
    }
  }

  showLoader(true, `Querying GPS coordinates for ${actionType}...`);

  if (!navigator.geolocation) {
    showLoader(false);
    showAlert("clockAlert", "Geolocation telemetry is not supported by your browser.", "danger");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;

      showLoader(true, `Verifying coordinates with SADV Logger Engine...`);

      try {
        const res = await callApi("processActivityLog", {
          email: currentSession.user.email,
          firstName: currentSession.user.firstName,
          lastName: currentSession.user.lastName,
          action: actionType,
          lat: lat,
          lon: lon
        });

        showLoader(false);

        if (res.status === "success") {
          const locText = res.location || "Coordinates logged";
          showAlert(
            "clockAlert",
            `<strong>${res.action} Logged!</strong> Time: ${res.time} | Location: ${locText}`,
            "success"
          );

          if (actionType === "Clock In") {
            const newShift = {
              date: res.date,
              clockIn: res.time,
              clockOut: "--",
              floorIn: res.time ? res.time.substring(0, 5) : "--",
              floorOut: "--",
              status: "In Progress",
              hasClockedIn: true,
              hasClockedOut: false
            };
            updateEmployeeShiftUI(newShift);
            updateSessionShift(newShift);
          } else if (actionType === "Clock Out") {
            const updatedShift = CURRENT_SHIFT_STATUS || {};
            updatedShift.hasClockedOut = true;
            updatedShift.clockOut = res.time;
            updatedShift.status = "Completed";
            updateEmployeeShiftUI(updatedShift);
            updateSessionShift(updatedShift);
          }
        } else {
          showAlert("clockAlert", res.message || "Failed to log action.", "danger");
        }
      } catch (err) {
        showLoader(false);
        showAlert("clockAlert", "Connection Error: " + err.message, "danger");
      }
    },
    (error) => {
      showLoader(false);
      let errMsg = "GPS access denied. Please allow location permissions in your browser.";
      if (error.code === error.TIMEOUT) {
        errMsg = "Location request timed out. Please retry.";
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        errMsg = "Location telemetry unavailable. Please check your GPS signal.";
      }
      showAlert("clockAlert", errMsg, "danger");
    },
    {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0
    }
  );
}

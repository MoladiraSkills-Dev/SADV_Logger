/**
 * ============================================================================
 * SADV LOGGER - EMPLOYEE PORTAL LOGIC (employee/employee.js)
 * ============================================================================
 */

const LOGIN_URL = "../index.html";
let currentSession = null;

document.addEventListener("DOMContentLoaded", () => {
  // Enforce session
  currentSession = requireSession("Employee", LOGIN_URL);
  if (!currentSession) return;

  // Initialize UI
  const empNameEl = document.getElementById("empNameDisplay");
  const empEmailEl = document.getElementById("empEmailDisplay");
  if (empNameEl) empNameEl.innerText = `${currentSession.user.firstName} ${currentSession.user.lastName}`;
  if (empEmailEl) empEmailEl.innerText = currentSession.user.email;

  // Start live clock
  updateLiveClock();
  setInterval(updateLiveClock, 1000);
});

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

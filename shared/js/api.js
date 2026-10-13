/**
 * ============================================================================
 * SADV LOGGER - SHARED API CLIENT & UTILITIES (shared/js/api.js)
 * Decoupled Google Apps Script Web App Client
 * ============================================================================
 */

// Replace this with your Google Apps Script Web App exec URL after deployment
const APPS_SCRIPT_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbygG1gU2wJz_CHANGE_ME_TO_YOUR_DEPLOYED_URL/exec";

const SESSION_STORAGE_KEY = "sadv_logger_session";

/**
 * Core Asynchronous Fetch Client
 * Uses POST + application/x-www-form-urlencoded with URLSearchParams('payload')
 * to seamlessly avoid CORS preflight failures on Google Apps Script Web Apps.
 */
async function callApi(method, args = {}) {
  if (!APPS_SCRIPT_WEB_APP_URL || APPS_SCRIPT_WEB_APP_URL.includes("CHANGE_ME")) {
    console.warn("SADV Logger: APPS_SCRIPT_WEB_APP_URL is not configured yet in shared/js/api.js");
  }

  const payload = JSON.stringify({ method, args });
  const params = new URLSearchParams();
  params.append("payload", payload);

  try {
    const response = await fetch(APPS_SCRIPT_WEB_APP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body: params
    });

    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();
    return json;
  } catch (error) {
    console.error("API Call Error:", error);
    throw error;
  }
}

/**
 * google.script.run emulation shim
 * Allows chaining .withSuccessHandler(fn).withFailureHandler(fn).methodName(...args)
 */
const google = {
  script: {
    run: (function () {
      let successFn = () => {};
      let failureFn = (err) => console.error("Unhandled API error:", err);

      const proxyTarget = {
        withSuccessHandler: function (fn) {
          successFn = fn;
          return proxy;
        },
        withFailureHandler: function (fn) {
          failureFn = fn;
          return proxy;
        }
      };

      const proxy = new Proxy(proxyTarget, {
        get(target, prop) {
          if (prop in target) return target[prop];

          return function (...args) {
            let apiArgs = {};

            // Map method argument signatures
            switch (prop) {
              case "registerUser":
                apiArgs = { email: args[0], firstName: args[1], lastName: args[2], password: args[3] };
                break;
              case "loginUser":
                apiArgs = { email: args[0], password: args[1] };
                break;
              case "processActivityLog":
                apiArgs = { email: args[0], firstName: args[1], lastName: args[2], action: args[3], lat: args[4], lon: args[5] };
                break;
              case "getAdminDashboardData":
                apiArgs = {};
                break;
              case "adminUpdateDailySummary":
                apiArgs = { summaryId: args[0], clockIn: args[1], clockOut: args[2], adminEmail: args[3] };
                break;
              case "adminDeleteDailySummary":
                apiArgs = { summaryId: args[0], dateStr: args[1], email: args[2], adminEmail: args[3] };
                break;
              case "adminUpdateUser":
                apiArgs = { targetEmail: args[0], firstName: args[1], lastName: args[2], status: args[3], newPassword: args[4] };
                break;
              case "submitLeaveRequest":
                apiArgs = { email: args[0], firstName: args[1], lastName: args[2], leaveType: args[3], startDate: args[4], endDate: args[5] };
                break;
              case "adminUpdateLeaveStatus":
                apiArgs = { reqId: args[0], newStatus: args[1] };
                break;
              case "exportTimesheetData":
                apiArgs = { email: args[0], startDate: args[1], endDate: args[2], format: args[3] };
                break;
              case "generateTimesheetsZip":
                apiArgs = { email: args[0], startDate: args[1], endDate: args[2] };
                break;
              default:
                apiArgs = typeof args[0] === "object" ? args[0] : { args };
                break;
            }

            const currentSuccess = successFn;
            const currentFailure = failureFn;
            // Reset handlers for next call
            successFn = () => {};
            failureFn = (err) => console.error(err);

            callApi(prop, apiArgs)
              .then((result) => currentSuccess(result))
              .catch((err) => currentFailure(err));
          };
        }
      });

      return proxy;
    })()
  }
};

/* ==========================================================================
   SESSION & AUTH STORAGE HELPERS
   ========================================================================== */

function saveSession(user, accountType) {
  const sessionData = {
    user: user,
    accountType: accountType,
    loginTimestamp: new Date().toISOString()
  };
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
}

function getSession() {
  const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function clearSession() {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

function requireSession(requiredRole = null, loginUrl = "../index.html") {
  const session = getSession();
  if (!session || !session.user) {
    window.location.href = loginUrl;
    return null;
  }

  if (requiredRole && session.accountType !== requiredRole) {
    // If Admin attempts to view Employee or vice versa, redirect appropriately
    if (session.accountType === "Admin") {
      window.location.href = "../admin/index.html";
    } else {
      window.location.href = "../employee/index.html";
    }
    return null;
  }

  return session;
}

/* ==========================================================================
   GLOBAL UI LOADERS & ALERTS
   ========================================================================== */

function showLoader(show, message = "Processing SADV telemetry...") {
  let spinner = document.getElementById("globalSpinner");
  if (!spinner) {
    spinner = document.createElement("div");
    spinner.id = "globalSpinner";
    spinner.className = "spinner-backdrop hidden";
    spinner.innerHTML = `
      <div class="spinner-disc"></div>
      <div class="spinner-message" id="spinnerMsg">Processing...</div>
    `;
    document.body.appendChild(spinner);
  }

  const msgEl = document.getElementById("spinnerMsg");
  if (msgEl) msgEl.innerText = message;

  if (show) {
    spinner.classList.remove("hidden");
  } else {
    spinner.classList.add("hidden");
  }
}

function showAlert(containerId, message, type = "info") {
  const container = document.getElementById(containerId);
  if (!container) return;

  const alertClass = type === "success" ? "alert-success" : (type === "danger" ? "alert-danger" : "alert-info");
  const icon = type === "success" ? "✓" : (type === "danger" ? "✕" : "ℹ");

  container.className = `alert ${alertClass}`;
  container.innerHTML = `<span><strong>${icon}</strong> ${message}</span>`;
  container.classList.remove("hidden");
}

function hideAlert(containerId) {
  const container = document.getElementById(containerId);
  if (container) container.classList.add("hidden");
}

/**
 * Triggers in-browser binary file download from Base64
 */
function triggerNativeDownload(base64Data, contentType, filename) {
  try {
    const byteCharacters = atob(base64Data);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }
    const blob = new Blob(byteArrays, { type: contentType });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 150);
  } catch (err) {
    console.error("Download Error:", err);
    alert("Unable to process file download. " + err.message);
  }
}

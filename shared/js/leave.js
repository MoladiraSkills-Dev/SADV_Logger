/**
 * ============================================================================
 * SADV LOGGER - SHARED LEAVE REQUEST LOGIC (shared/js/leave.js)
 * Used across both Employee Portal and Admin Portal
 * ============================================================================
 */

function openLeaveModal() {
  const modal = document.getElementById("leaveModal");
  if (!modal) return;

  const todayStr = new Date().toISOString().split("T")[0];
  const startInput = document.getElementById("leaveStartDate");
  const endInput = document.getElementById("leaveEndDate");

  if (startInput) startInput.value = todayStr;
  if (endInput) endInput.value = todayStr;

  const alertBox = document.getElementById("leaveAlert");
  if (alertBox) alertBox.classList.add("hidden");

  modal.classList.remove("hidden");
}

function closeLeaveModal() {
  const modal = document.getElementById("leaveModal");
  if (modal) modal.classList.add("hidden");
  const form = document.getElementById("leaveForm");
  if (form) form.reset();
}

async function handleLeaveSubmit(e, onSuccessCallback) {
  e.preventDefault();
  const session = getSession();
  if (!session || !session.user) {
    alert("Session expired. Please log in again.");
    window.location.href = "../index.html";
    return;
  }

  const leaveType = document.getElementById("leaveType").value;
  const startDate = document.getElementById("leaveStartDate").value;
  const endDate = document.getElementById("leaveEndDate").value;

  if (!startDate || !endDate) {
    showAlert("leaveAlert", "Please specify both Start Date and End Date.", "danger");
    return;
  }

  if (new Date(startDate) > new Date(endDate)) {
    showAlert("leaveAlert", "Start Date cannot be after End Date.", "danger");
    return;
  }

  showLoader(true, "Submitting SADV Leave Request...");

  try {
    const res = await callApi("submitLeaveRequest", {
      email: session.user.email,
      firstName: session.user.firstName,
      lastName: session.user.lastName,
      leaveType: leaveType,
      startDate: startDate,
      endDate: endDate
    });

    showLoader(false);

    if (res.status === "success") {
      closeLeaveModal();
      alert(`Success: ${res.message}`);
      if (typeof onSuccessCallback === "function") {
        onSuccessCallback();
      }
    } else {
      showAlert("leaveAlert", res.message || "Failed to submit leave request.", "danger");
    }
  } catch (err) {
    showLoader(false);
    showAlert("leaveAlert", "Connection Error: " + err.message, "danger");
  }
}

window.alert = function (msg) {
  showToast(msg, "info");
};


window.showToast = showToast;

function showToast(message, type = "info", duration = 2500, callback = null) {
  console.log(`[Toast] ${type}: ${message}`);
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  // Detect admin context
  const isAdminPage = window.location.pathname.includes('admin') || window.location.pathname.includes('error-logs');

  const toast = document.createElement("div");
  toast.className = `toast ${type} ${isAdminPage ? 'admin-theme' : ''}`;
  toast.textContent = message;
  toast.style.zIndex = "100000"; // Ensure it's above everything
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("show"));

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      toast.remove();
      if (callback && typeof callback === "function") callback();
    }, 300);
  }, duration);
}


const toastStyle = document.createElement("style");
toastStyle.innerHTML = `
.toast {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background-color: #333;
  color: #fff;
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  opacity: 0;
  transition: all 0.35s ease;
  z-index: 9999;
  text-align: center;
  min-width: 180px;
  max-width: 320px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  letter-spacing: 0.2px;
  line-height: 1.4;
}
.toast.show {
  opacity: 1;
  transform: translate(-50%, -50%);
}
.toast.success {
  background-color: #28a745;
}
.toast.error {
  background-color: #dc3545;
}
.toast.warning {
  background-color: #ffc107;
  color: #000;
}
.toast.info {
  background-color: #007bff;
}
.toast.admin-theme {
  border-bottom: 3px solid #6d28d9;
  box-shadow: 0 8px 24px rgba(109, 40, 217, 0.3);
}
.toast.success.admin-theme {
  background-color: #6d28d9;
}
.toast.error.admin-theme {
  background-color: #4c1d95;
}
`;
document.head.appendChild(toastStyle);



// Store native confirm
const nativeConfirm = window.confirm;

// Custom confirm - always uses styled modal
window.confirm = function (message, onConfirm, onCancel) {
  // Remove any existing modal
  document.querySelector(".confirm-modal")?.remove();

  const modal = document.createElement("div");
  modal.className = "confirm-modal";

  // Detect admin context
  const isAdminPage = window.location.pathname.includes('admin') || window.location.pathname.includes('error-logs');

  modal.innerHTML = `
    <div class="confirm-box ${isAdminPage ? 'admin-theme' : ''}">
      <p>${message}</p>
      <div class="confirm-actions">
        <button class="confirm-yes">Yes</button>
        <button class="confirm-no">No</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add("show"));

  // Callback mode
  if (onConfirm || onCancel) {
    console.log("[Confirm] Entering callback mode");
    modal.querySelector(".confirm-yes").onclick = () => {
      console.log("[Confirm] Yes clicked");
      modal.classList.remove("show");
      setTimeout(() => modal.remove(), 300);
      if (onConfirm) onConfirm();
    };

    modal.querySelector(".confirm-no").onclick = () => {
      console.log("[Confirm] No clicked");
      modal.classList.remove("show");
      setTimeout(() => modal.remove(), 300);
      if (onCancel) onCancel();
    };

    return;
  }

  // Synchronous mode fallback - use native confirm for now
  // (We can't truly block in JavaScript without freezing the browser)
  modal.remove();
  return nativeConfirm(message);
};


const confirmStyle = document.createElement("style");
confirmStyle.innerHTML = `
.confirm-modal {
  position: fixed;
  top: 0; left: 0;
  width: 100vw; height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.5);
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: 99999;
}
.confirm-modal.show {
  opacity: 1;
}
.confirm-box {
  background: #fff;
  color: #222;
  padding: 1.5rem;
  border-radius: 10px;
  width: 90%;
  max-width: 340px;
  box-shadow: 0 4px 18px rgba(0,0,0,0.2);
  text-align: center;
  animation: popIn 0.3s ease;
}
.confirm-box p {
  margin-bottom: 1rem;
  font-weight: 500;
  font-size: 0.95rem;
  line-height: 1.5;
}
.confirm-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
}
.confirm-actions button {
  padding: 10px 24px;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: 0.2s;
  font-size: 0.9rem;
}
.confirm-yes {
  background: #DCEF62;
  color: #1A1A1A;
}
.confirm-no {
  background: #1A1A1A;
  color: #fff;
}
.confirm-actions button:hover {
  opacity: 0.85;
  transform: translateY(-1px);
}
.confirm-actions button:active {
  transform: translateY(0);
}
.confirm-box.admin-theme {
  border: 1px solid rgba(109, 40, 217, 0.3);
  background: #111;
  color: #fff;
}
.confirm-box.admin-theme .confirm-yes {
  background: #6d28d9;
  color: #fff;
}
.confirm-box.admin-theme .confirm-no {
  background: #1e1b4b;
  color: #94a3b8;
}
.confirm-box.admin-theme .confirm-yes:hover {
  box-shadow: 0 0 15px rgba(109, 40, 217, 0.5);
}
@keyframes popIn {
  from { transform: scale(0.9); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
`;
document.head.appendChild(confirmStyle);

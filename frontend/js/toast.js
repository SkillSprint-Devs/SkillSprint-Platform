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
    modal.querySelector(".confirm-yes").onclick = () => {
      modal.classList.remove("show");
      setTimeout(() => modal.remove(), 300);
      if (onConfirm) onConfirm();
    };

    modal.querySelector(".confirm-no").onclick = () => {
      modal.classList.remove("show");
      setTimeout(() => modal.remove(), 300);
      if (onCancel) onCancel();
    };
    return;
  }

  // Synchronous mode fallback - use native confirm for now
  modal.remove();
  return nativeConfirm(message);
};

// Global showCustomConfirm that returns a promise
window.showCustomConfirm = function (message) {
  return new Promise((resolve) => {
    window.confirm(message, () => resolve(true), () => resolve(false));
  });
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
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(12px) saturate(180%);
  -webkit-backdrop-filter: blur(12px) saturate(180%);
  opacity: 0;
  transition: opacity 0.4s ease;
  z-index: 999999;
}
.confirm-modal.show {
  opacity: 1;
}
.confirm-box {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  color: #1a1a1a;
  padding: 2.5rem 2rem;
  border-radius: 28px;
  width: 90%;
  max-width: 400px;
  box-shadow: 0 30px 80px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.3);
  text-align: center;
  transform: scale(0.9) translateY(20px);
  transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.confirm-modal.show .confirm-box {
  transform: scale(1) translateY(0);
}
.confirm-box p {
  margin-bottom: 2rem;
  font-weight: 600;
  font-size: 1.2rem;
  line-height: 1.5;
  color: #1a1a1a;
  letter-spacing: -0.2px;
}
.confirm-actions {
  display: flex;
  gap: 1.2rem;
  justify-content: center;
}
.confirm-actions button {
  padding: 14px 32px;
  border: none;
  border-radius: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  font-size: 1rem;
  flex: 1;
}
.confirm-yes {
  background: var(--accent, #DCEF62);
  color: #000;
  box-shadow: 0 10px 25px rgba(220, 239, 98, 0.4);
}
.confirm-no {
  background: rgba(0, 0, 0, 0.05);
  color: #57606f;
}
.confirm-actions button:hover {
  transform: translateY(-4px);
  filter: brightness(1.05);
}
.confirm-yes:hover {
  box-shadow: 0 15px 35px rgba(220, 239, 98, 0.5);
}
.confirm-no:hover {
  background: rgba(0, 0, 0, 0.1);
  color: #1a1a1a;
}
.confirm-box.admin-theme {
  background: rgba(18, 18, 18, 0.9);
  color: #fff;
  border: 1px solid rgba(109, 40, 217, 0.3);
  box-shadow: 0 30px 80px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.05);
}
.confirm-box.admin-theme p {
  color: #f8fafc;
}
.confirm-box.admin-theme .confirm-yes {
  background: #6d28d9;
  color: #fff;
  box-shadow: 0 10px 25px rgba(109, 40, 217, 0.4);
}
.confirm-box.admin-theme .confirm-no {
  background: rgba(255, 255, 255, 0.05);
  color: #94a3b8;
}
`;
document.head.appendChild(confirmStyle);

window.alert = function (msg) {
  showToast(msg, "info");
};


function showToast(message, type = "info", duration = 2500, callback = null) {

  const existing = document.querySelector(".toast");
  if (existing) existing.remove();


  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
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
`;
document.head.appendChild(toastStyle);



window.confirm = function (message, onConfirm, onCancel) {
  // Remove any existing modal
  document.querySelector(".confirm-modal")?.remove();

  // If callbacks are provided, use async callback mode
  if (onConfirm || onCancel) {
    const modal = document.createElement("div");
    modal.className = "confirm-modal";

    modal.innerHTML = `
      <div class="confirm-box">
        <p>${message}</p>
        <div class="confirm-actions">
          <button class="confirm-yes">Yes</button>
          <button class="confirm-no">No</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add("show"));

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

    return; // Don't return a value for callback mode
  }

  // Otherwise, use native browser confirm for backwards compatibility
  return window.nativeConfirm(message);
};

// Store the native confirm before overriding
window.nativeConfirm = window.confirm;


const confirmStyle = document.createElement("style");
confirmStyle.innerHTML = `
.confirm-modal {
  position: fixed;
  top: 0; left: 0;
  width: 100vw; height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.45);
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
}
.confirm-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
}
.confirm-actions button {
  padding: 8px 20px;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: 0.2s;
}
.confirm-yes {
  background: #28a745;
  color: #fff;
}
.confirm-no {
  background: #dc3545;
  color: #fff;
}
.confirm-actions button:hover {
  opacity: 0.9;
}
@keyframes popIn {
  from { transform: scale(0.9); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
`;
document.head.appendChild(confirmStyle);


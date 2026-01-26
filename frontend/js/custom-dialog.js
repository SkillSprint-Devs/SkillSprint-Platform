/**
 * Custom Confirmation Dialog Utility
 * Creates a premium glass-morphism modal for confirmations.
 * Usage: await showConfirm("Title", "Message here", "Confirm Text");
 * Returns: true (confirmed) or false (cancelled)
 */

window.showConfirm = (title, message, confirmText = "Confirm", isDanger = false) => {
    return new Promise((resolve) => {
        // Remove existing if any
        const existing = document.getElementById('custom-confirm-modal');
        if (existing) existing.remove();

        const modalHtml = `
        <div id="custom-confirm-modal" style="
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px); z-index: 9999;
            display: flex; align-items: center; justify-content: center;
            opacity: 0; transition: opacity 0.2s ease-out; pointer-events: none;
        ">
            <div style="
                background: rgba(255, 255, 255, 0.95);
                backdrop-filter: blur(16px);
                border: 1px solid rgba(255, 255, 255, 0.5);
                border-radius: 24px;
                padding: 2rem;
                width: 90%; max-width: 400px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
                transform: scale(0.95); transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                text-align: center;
            ">
                <div style="
                    width: 60px; height: 60px; border-radius: 50%;
                    background: ${isDanger ? '#fee2e2' : '#f3f4f6'};
                    color: ${isDanger ? '#ef4444' : 'var(--user-accent, #DCEF62)'};
                    display: flex; align-items: center; justify-content: center;
                    font-size: 1.5rem; margin: 0 auto 1.5rem;
                ">
                    <i class="fa-solid fa-${isDanger ? 'triangle-exclamation' : 'circle-question'}"></i>
                </div>
                <h3 style="margin-bottom: 0.5rem; color: #1a1a1a; font-size: 1.3rem; text-align: center; width: 100%; display: block !important; margin: 0 auto 0.5rem;">${title}</h3>
                ${message ? `<p style="color: #666; margin-bottom: 2rem; line-height: 1.5;">${message}</p>` : '<div style="margin-bottom: 2rem;"></div>'}
                <div style="display: flex; gap: 1rem;">
                    <button id="confirm-cancel-btn" style="
                        flex: 1; padding: 0.8rem; border-radius: 12px; border: none;
                        background: #f3f4f6; color: #1a1a1a; font-weight: 600; cursor: pointer;
                        transition: all 0.2s;
                    ">Cancel</button>
                    <button id="confirm-ok-btn" style="
                        flex: 1; padding: 0.8rem; border-radius: 12px; border: none;
                        background: ${isDanger ? '#ef4444' : 'var(--text-main, #1A1A1A)'}; 
                        color: white; font-weight: 600; cursor: pointer;
                        transition: all 0.2s;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    ">${confirmText}</button>
                </div>
            </div>
        </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        const modal = document.getElementById('custom-confirm-modal');
        const okBtn = document.getElementById('confirm-ok-btn');
        const cancelBtn = document.getElementById('confirm-cancel-btn');

        // Animate In
        requestAnimationFrame(() => {
            modal.style.pointerEvents = 'auto'; // Enable clicks
            modal.style.opacity = '1';
            modal.querySelector('div').style.transform = 'scale(1)';
        });

        const cleanup = () => {
            modal.style.opacity = '0';
            modal.querySelector('div').style.transform = 'scale(0.95)';
            setTimeout(() => modal.remove(), 200);
        };

        okBtn.onclick = () => {
            cleanup();
            resolve(true);
        };

        cancelBtn.onclick = () => {
            cleanup();
            resolve(false);
        };

        // Close on backdrop click
        modal.onclick = (e) => {
            if (e.target === modal) {
                cleanup();
                resolve(false);
            }
        };
    });
};

// Alias for compatibility with dashboard.js and other legacy scripts
window.showCustomConfirm = window.showConfirm;

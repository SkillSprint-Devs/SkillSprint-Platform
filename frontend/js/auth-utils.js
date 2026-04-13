/**
 * auth-utils.js
 * Utility functions for authentication pages.
 */

window.authUtils = {
    /**
     * Freezes a button for a specified duration with a countdown.
     * @param {HTMLElement} btn - The button element to freeze.
     * @param {number} durationSeconds - Duration in seconds.
     * @param {string} originalText - The original text to restore.
     * @param {string} countPattern - Pattern for countdown, e.g., "Please wait {s}s"
     */
    freezeButton: function (btn, durationSeconds = 15, originalText = null, countPattern = "Please wait {s}s") {
        if (!btn) return;

        // Prevent multiple freezes on the same button
        if (btn.disabled && btn.classList.contains('button-frozen')) return;

        const originalBtnText = originalText || btn.innerText || btn.textContent;
        let remaining = durationSeconds;

        btn.disabled = true;
        btn.classList.add('button-frozen');

        // Ensure visual feedback
        btn.style.opacity = '0.6';
        btn.style.cursor = 'not-allowed';

        const updateText = () => {
            btn.innerText = countPattern.replace("{s}", remaining);
        };

        updateText();

        const interval = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(interval);
                btn.disabled = false;
                btn.classList.remove('button-frozen');
                btn.innerText = originalBtnText;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
            } else {
                updateText();
            }
        }, 1000);

        return interval;
    }
};

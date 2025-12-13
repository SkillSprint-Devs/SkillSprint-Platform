# Pair Programming User Guide

Welcome to the **SkillSprint Pair Programming** environment! This module allows you to write, edit, and run code collaboratively in real-time.

---

## 🚀 1. How to Start

1.  **Open a Workspace**: 
    -   Navigate to the **Library** or **Dashboard**.
    -   Click on an existing **Pair Programming Board** or create a **New Board**.
2.  **Invite Peers**: 
    -   Click the "Share" or "Invite" button to send a link to your coding partner.

---

## 📝 2. Creating & Managing Files

### **The File Tree**
On the left side of the screen is your project structure.
-   **Right-Click** on the empty area or an existing folder to open the menu.
-   **New Folder**: precise organization.
-   **New File**: Create a code file.

### **Naming Your Files**
To enable the correct features (colors and running), you **MUST** end your filename with the correct extension:

-   **JavaScript**: `filename.js`
-   **Python**: `script.py`
-   **PHP**: `page.php`
-   **HTML**: `index.html` (Visualization only, no run)
-   **CSS**: `style.css` (Visual only)

---

## 💻 3. Using the Editor

### **Editing**
-   Click a file in the tree to open it.
-   **Tabs**: You can have multiple files open. Click the `x` on a tab to close it.
-   **Real-Time**: You will see your partner's cursor and typing in real-time!

### **Saving**
-   Press `Ctrl + S` (Windows) or `Cmd + S` (Mac).
-   Or click the **Save** button in the toolbar.
-   *Always save before running your code!*

---

## ▶️ 4. How to Run Code

You can execute **JavaScript**, **Python**, and **PHP** code directly in the browser.

1.  **Select the file** you want to run.
2.  Make sure it is **Saved**.
3.  Click the **"Run Code"** button (or Play icon) in the toolbar.
4.  **View Output**: Results will appear in the **Terminal/Output** panel at the bottom.

### **Troubleshooting Errors**
-   **Timeout**: If your code takes longer than **5 seconds**, it will be stopped. Check for infinite loops!
-   **Syntax Error**: Red text usually means a typo. Check your spelling (e.g., missing `;` or `)`).

---

## ⚠️ 5. Limitations

-   **Supported Executable Languages**: Only JS (`.js`), Python (`.py`), and PHP (`.php`).
-   **Non-Executable**: HTML, CSS, C++, Java, etc. cannot be "Run" in this environment.
-   **Security**: Do not write code that tries to access the file system or install packages. It will likely fail or be blocked.
-   **Internet**: Your code cannot access the external internet reliably. Keep it local!

# Pair Programming Module Audit

## 1. Supported Languages & Extensions

The system supports the following languages. "Execution" means the code can be run on the server. "Highlighting" means the editor supports syntax coloring.

| Language | Extension(s) | Execution? | Highlighting? | Backend Key |
| :--- | :--- | :--- | :--- | :--- |
| **JavaScript** | `.js`, `.jsx` | Yes (Node.js) | Yes | `js` |
| **Python** | `.py` | Yes (Python 3*) | Yes | `python` |
| **PHP** | `.php` | Yes (PHP CLI) | Yes | `php` |
| **HTML** | `.html` | No | Yes | `html` |
| **CSS** | `.css` | No |  Yes | `css` |

*Note: Python version depends on the host system's `python` command alias (likely Python 3).*

## 2. Execution Requirements & Logic

### Environment
- **Backend**: Node.js Server.
- **Runners**: Requires `node`, `python`, and `php` installed and available in the system PATH.
- **Method**: Code is written to a temporary file in `os.tmpdir()` and executed via `child_process.exec`.

### Limitations & Rules
1.  **Timeout**: Execution is strictly limited to **5 seconds**.
2.  **File Naming**:
    -   Must end in a supported extension (`.js`, `.py`, `.php`) for the "Run" button to function correctly for that language.
    -   Files without extensions default to JavaScript syntax/execution.
3.  **Concurrency**: No specific concurrency limits per user, but `exec` runs asynchronously.
4.  **Security / Sandboxing**:
    -   **NO SANDBOX**: Code runs directly on the host OS user's permission level.
    -   **Vulnerability**: Access to file system (`fs`), network, and process objects is **NOT RESTRICTED**.
    -   **Recommendations**: This is highly insecure for a public environment. Use Docker or VM for isolation in production.

### File System
-   **Virtual**: Files are stored in MongoDB under the `PairProgramming` model.
-   **Physical**: Only temporary files are created during execution and deleted immediately after.

## 3. UI/UX Observations
-   **Context Menu**: Right-click on folders/files to Create New, Rename, Delete.
-   **Editor**: CodeMirror with `material-darker` (if dark mode) or default theme.
-   **Real-time**: Socket.IO handles typing indicators and content sync.

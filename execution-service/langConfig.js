// execution-service/langConfig.js
// ─────────────────────────────────────────────────────────────────────────────
// Language Registry — the ONLY file that needs to change when adding a new
// language. Each entry defines:
//   image   : pre-built Docker image tag for this runner
//   fileExt : file extension used when writing code to a temp file
//   command : function that returns the shell command to execute the file
//   timeout : default execution timeout in seconds (hard-capped at 15s)
// ─────────────────────────────────────────────────────────────────────────────

export const LANGUAGES = {
  js: {
    image: "skillsprint/runner-js:1.0",
    fileExt: "js",
    command: (file) => `node "${file}"`,
    timeout: 10,
  },
  python: {
    image: "skillsprint/runner-python:1.0",
    fileExt: "py",
    command: (file) => `python "${file}"`,
    timeout: 10,
  },
  php: {
    image: "skillsprint/runner-php:1.0",
    fileExt: "php",
    command: (file) => `php "${file}"`,
    timeout: 10,
  },

  // ── Add new languages below — no other file needs to change ───────────────
  //
  // java: {
  //   image: "skillsprint/runner-java:1.0",
  //   fileExt: "java",
  //   command: (file) => `cd /tmp && javac "${file}" && java Main`,
  //   timeout: 15,
  // },
  //
  // cpp: {
  //   image: "skillsprint/runner-cpp:1.0",
  //   fileExt: "cpp",
  //   command: (file) => `g++ "${file}" -o /tmp/prog && /tmp/prog`,
  //   timeout: 15,
  // },
  //
  // ruby: {
  //   image: "skillsprint/runner-ruby:1.0",
  //   fileExt: "rb",
  //   command: (file) => `ruby "${file}"`,
  //   timeout: 10,
  // },
};

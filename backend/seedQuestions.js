import mongoose from "mongoose";
import dotenv from "dotenv";
import Question from "./models/question.js";

dotenv.config();

const questions = [
    // ========== JAVASCRIPT - BASIC ==========
    {
        course: "javascript",
        level: "basic",
        topic: "variables",
        type: "output",
        question: "What will be logged to the console?",
        codeSnippet: "let x = 5;\nlet y = '5';\nconsole.log(x == y);",
        options: [
            { text: "true", isCorrect: true },
            { text: "false", isCorrect: false },
            { text: "undefined", isCorrect: false },
            { text: "Error", isCorrect: false }
        ],
        explanation: "== performs type coercion, so 5 equals '5'",
        difficulty: 2
    },
    {
        course: "javascript",
        level: "basic",
        topic: "variables",
        type: "output",
        question: "What is the output?",
        codeSnippet: "console.log(typeof null);",
        options: [
            { text: "\"object\"", isCorrect: true },
            { text: "\"null\"", isCorrect: false },
            { text: "\"undefined\"", isCorrect: false },
            { text: "Error", isCorrect: false }
        ],
        explanation: "typeof null returns 'object' - a known JavaScript quirk",
        difficulty: 3
    },
    {
        course: "javascript",
        level: "basic",
        topic: "variables",
        type: "mcq",
        question: "Which keyword creates a block-scoped variable?",
        options: [
            { text: "let", isCorrect: true },
            { text: "var", isCorrect: false },
            { text: "define", isCorrect: false },
            { text: "variable", isCorrect: false }
        ],
        explanation: "let and const are block-scoped, var is function-scoped",
        difficulty: 1
    },
    {
        course: "javascript",
        level: "basic",
        topic: "functions",
        type: "output",
        question: "What does this function return?",
        codeSnippet: "function test() {\n  return\n  {\n    name: 'John'\n  }\n}\nconsole.log(test());",
        options: [
            { text: "undefined", isCorrect: true },
            { text: "{ name: 'John' }", isCorrect: false },
            { text: "Error", isCorrect: false },
            { text: "null", isCorrect: false }
        ],
        explanation: "Automatic semicolon insertion adds ; after return",
        difficulty: 4
    },
    {
        course: "javascript",
        level: "basic",
        topic: "functions",
        type: "mcq",
        question: "What is a closure in JavaScript?",
        options: [
            { text: "A function with access to its outer scope", isCorrect: true },
            { text: "A way to close the browser", isCorrect: false },
            { text: "A loop that ends", isCorrect: false },
            { text: "An error handler", isCorrect: false }
        ],
        difficulty: 3
    },
    {
        course: "javascript",
        level: "basic",
        topic: "arrays",
        type: "output",
        question: "What is logged?",
        codeSnippet: "const arr = [1, 2, 3];\narr.push(4);\nconsole.log(arr.length);",
        options: [
            { text: "4", isCorrect: true },
            { text: "3", isCorrect: false },
            { text: "Error", isCorrect: false },
            { text: "undefined", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "javascript",
        level: "basic",
        topic: "arrays",
        type: "mcq",
        question: "Which method removes the last element from an array?",
        options: [
            { text: "pop()", isCorrect: true },
            { text: "shift()", isCorrect: false },
            { text: "splice()", isCorrect: false },
            { text: "slice()", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "javascript",
        level: "basic",
        topic: "loops",
        type: "output",
        question: "What is the output?",
        codeSnippet: "for (let i = 0; i < 3; i++) {\n  console.log(i);\n}",
        options: [
            { text: "0, 1, 2", isCorrect: true },
            { text: "1, 2, 3", isCorrect: false },
            { text: "0, 1, 2, 3", isCorrect: false },
            { text: "1, 2", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "javascript",
        level: "basic",
        topic: "strings",
        type: "output",
        question: "What is logged?",
        codeSnippet: "console.log('hello'.charAt(1));",
        options: [
            { text: "\"e\"", isCorrect: true },
            { text: "\"h\"", isCorrect: false },
            { text: "\"l\"", isCorrect: false },
            { text: "1", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "javascript",
        level: "basic",
        topic: "operators",
        type: "output",
        question: "What is the result?",
        codeSnippet: "console.log(3 + 2 + '7');",
        options: [
            { text: "\"57\"", isCorrect: true },
            { text: "12", isCorrect: false },
            { text: "\"327\"", isCorrect: false },
            { text: "57", isCorrect: false }
        ],
        difficulty: 3
    },
    {
        course: "javascript",
        level: "basic",
        topic: "operators",
        type: "output",
        question: "What is logged?",
        codeSnippet: "console.log(true + true);",
        options: [
            { text: "2", isCorrect: true },
            { text: "true", isCorrect: false },
            { text: "\"truetrue\"", isCorrect: false },
            { text: "NaN", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "javascript",
        level: "basic",
        topic: "objects",
        type: "output",
        question: "What is logged?",
        codeSnippet: "const obj = { a: 1 };\nobj.b = 2;\nconsole.log(Object.keys(obj).length);",
        options: [
            { text: "2", isCorrect: true },
            { text: "1", isCorrect: false },
            { text: "Error", isCorrect: false },
            { text: "undefined", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "javascript",
        level: "basic",
        topic: "conditionals",
        type: "output",
        question: "What is logged?",
        codeSnippet: "console.log(0 || 'default');",
        options: [
            { text: "\"default\"", isCorrect: true },
            { text: "0", isCorrect: false },
            { text: "true", isCorrect: false },
            { text: "false", isCorrect: false }
        ],
        difficulty: 3
    },
    {
        course: "javascript",
        level: "basic",
        topic: "conditionals",
        type: "output",
        question: "What is logged?",
        codeSnippet: "console.log(null ?? 'fallback');",
        options: [
            { text: "\"fallback\"", isCorrect: true },
            { text: "null", isCorrect: false },
            { text: "undefined", isCorrect: false },
            { text: "Error", isCorrect: false }
        ],
        difficulty: 3
    },
    {
        course: "javascript",
        level: "basic",
        topic: "scope",
        type: "output",
        question: "What is logged?",
        codeSnippet: "var x = 1;\nif (true) {\n  var x = 2;\n}\nconsole.log(x);",
        options: [
            { text: "2", isCorrect: true },
            { text: "1", isCorrect: false },
            { text: "undefined", isCorrect: false },
            { text: "Error", isCorrect: false }
        ],
        difficulty: 3
    },

    // ========== JAVASCRIPT - INTERMEDIATE ==========
    {
        course: "javascript",
        level: "intermediate",
        topic: "async",
        type: "output",
        question: "What is the order of logs?",
        codeSnippet: "console.log('1');\nsetTimeout(() => console.log('2'), 0);\nPromise.resolve().then(() => console.log('3'));\nconsole.log('4');",
        options: [
            { text: "1, 4, 3, 2", isCorrect: true },
            { text: "1, 2, 3, 4", isCorrect: false },
            { text: "1, 4, 2, 3", isCorrect: false },
            { text: "1, 3, 4, 2", isCorrect: false }
        ],
        explanation: "Microtasks (Promises) run before macrotasks (setTimeout)",
        difficulty: 4
    },
    {
        course: "javascript",
        level: "intermediate",
        topic: "async",
        type: "mcq",
        question: "What does async/await do?",
        options: [
            { text: "Makes async code look synchronous", isCorrect: true },
            { text: "Makes code run faster", isCorrect: false },
            { text: "Blocks the event loop", isCorrect: false },
            { text: "Creates new threads", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "javascript",
        level: "intermediate",
        topic: "this",
        type: "output",
        question: "What is logged?",
        codeSnippet: "const obj = {\n  name: 'Alice',\n  greet: () => console.log(this.name)\n};\nobj.greet();",
        options: [
            { text: "undefined", isCorrect: true },
            { text: "\"Alice\"", isCorrect: false },
            { text: "Error", isCorrect: false },
            { text: "null", isCorrect: false }
        ],
        explanation: "Arrow functions don't have their own 'this'",
        difficulty: 4
    },
    {
        course: "javascript",
        level: "intermediate",
        topic: "prototypes",
        type: "mcq",
        question: "What is the prototype chain used for?",
        options: [
            { text: "Inheritance in JavaScript", isCorrect: true },
            { text: "Chaining functions", isCorrect: false },
            { text: "Linking CSS files", isCorrect: false },
            { text: "Error handling", isCorrect: false }
        ],
        difficulty: 3
    },
    {
        course: "javascript",
        level: "intermediate",
        topic: "destructuring",
        type: "output",
        question: "What is logged?",
        codeSnippet: "const { a, b = 5 } = { a: 1 };\nconsole.log(b);",
        options: [
            { text: "5", isCorrect: true },
            { text: "undefined", isCorrect: false },
            { text: "1", isCorrect: false },
            { text: "Error", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "javascript",
        level: "intermediate",
        topic: "spread",
        type: "output",
        question: "What is logged?",
        codeSnippet: "const a = [1, 2];\nconst b = [...a, 3];\nconsole.log(b);",
        options: [
            { text: "[1, 2, 3]", isCorrect: true },
            { text: "[[1, 2], 3]", isCorrect: false },
            { text: "[3, 1, 2]", isCorrect: false },
            { text: "Error", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "javascript",
        level: "intermediate",
        topic: "array-methods",
        type: "output",
        question: "What is logged?",
        codeSnippet: "const nums = [1, 2, 3];\nconst doubled = nums.map(n => n * 2);\nconsole.log(doubled);",
        options: [
            { text: "[2, 4, 6]", isCorrect: true },
            { text: "[1, 2, 3]", isCorrect: false },
            { text: "6", isCorrect: false },
            { text: "[1, 4, 9]", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "javascript",
        level: "intermediate",
        topic: "array-methods",
        type: "output",
        question: "What is logged?",
        codeSnippet: "[1, 2, 3].reduce((a, b) => a + b, 0);",
        options: [
            { text: "6", isCorrect: true },
            { text: "[1, 2, 3]", isCorrect: false },
            { text: "0", isCorrect: false },
            { text: "123", isCorrect: false }
        ],
        difficulty: 3
    },
    {
        course: "javascript",
        level: "intermediate",
        topic: "classes",
        type: "mcq",
        question: "What keyword is used to inherit from a class?",
        options: [
            { text: "extends", isCorrect: true },
            { text: "inherits", isCorrect: false },
            { text: "implements", isCorrect: false },
            { text: "derive", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "javascript",
        level: "intermediate",
        topic: "modules",
        type: "mcq",
        question: "What is the correct way to export a default function?",
        options: [
            { text: "export default function() {}", isCorrect: true },
            { text: "export function default() {}", isCorrect: false },
            { text: "default export function() {}", isCorrect: false },
            { text: "module.default = function() {}", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "javascript",
        level: "intermediate",
        topic: "error-handling",
        type: "output",
        question: "What is logged?",
        codeSnippet: "try {\n  throw new Error('Oops');\n} catch (e) {\n  console.log(e.message);\n}",
        options: [
            { text: "\"Oops\"", isCorrect: true },
            { text: "Error: Oops", isCorrect: false },
            { text: "undefined", isCorrect: false },
            { text: "Nothing, it crashes", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "javascript",
        level: "intermediate",
        topic: "dom",
        type: "mcq",
        question: "Which method adds an event listener?",
        options: [
            { text: "addEventListener()", isCorrect: true },
            { text: "attachEvent()", isCorrect: false },
            { text: "onEvent()", isCorrect: false },
            { text: "bindEvent()", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "javascript",
        level: "intermediate",
        topic: "json",
        type: "output",
        question: "What is logged?",
        codeSnippet: "const obj = { a: 1, b: undefined };\nconsole.log(JSON.stringify(obj));",
        options: [
            { text: "{\"a\":1}", isCorrect: true },
            { text: "{\"a\":1,\"b\":undefined}", isCorrect: false },
            { text: "{\"a\":1,\"b\":null}", isCorrect: false },
            { text: "Error", isCorrect: false }
        ],
        explanation: "JSON.stringify omits undefined values",
        difficulty: 3
    },
    {
        course: "javascript",
        level: "intermediate",
        topic: "set-map",
        type: "output",
        question: "What is logged?",
        codeSnippet: "const set = new Set([1, 2, 2, 3]);\nconsole.log(set.size);",
        options: [
            { text: "3", isCorrect: true },
            { text: "4", isCorrect: false },
            { text: "2", isCorrect: false },
            { text: "Error", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "javascript",
        level: "intermediate",
        topic: "generators",
        type: "mcq",
        question: "What keyword is used to pause a generator?",
        options: [
            { text: "yield", isCorrect: true },
            { text: "pause", isCorrect: false },
            { text: "await", isCorrect: false },
            { text: "stop", isCorrect: false }
        ],
        difficulty: 3
    },

    // ========== JAVASCRIPT - ADVANCED ==========
    {
        course: "javascript",
        level: "advanced",
        topic: "performance",
        type: "scenario",
        question: "You have a function called 1000 times per second. How would you optimize it?",
        options: [
            { text: "Use debouncing or throttling", isCorrect: true },
            { text: "Add more setTimeout calls", isCorrect: false },
            { text: "Use synchronous code only", isCorrect: false },
            { text: "Increase the call frequency", isCorrect: false }
        ],
        difficulty: 4
    },
    {
        course: "javascript",
        level: "advanced",
        topic: "memory",
        type: "bug-hunt",
        question: "What causes a memory leak in this code?",
        codeSnippet: "function createHandler() {\n  const largeData = new Array(1000000);\n  return function() {\n    console.log(largeData.length);\n  };\n}\nconst handlers = [];\nfor (let i = 0; i < 100; i++) {\n  handlers.push(createHandler());\n}",
        options: [
            { text: "Closures retain references to largeData", isCorrect: true },
            { text: "The for loop is infinite", isCorrect: false },
            { text: "Array length is too small", isCorrect: false },
            { text: "No memory leak exists", isCorrect: false }
        ],
        difficulty: 5
    },
    {
        course: "javascript",
        level: "advanced",
        topic: "security",
        type: "scenario",
        question: "How do you prevent XSS attacks when displaying user input?",
        options: [
            { text: "Escape/sanitize HTML entities", isCorrect: true },
            { text: "Use eval() for validation", isCorrect: false },
            { text: "Store data in localStorage", isCorrect: false },
            { text: "Use innerHTML directly", isCorrect: false }
        ],
        difficulty: 4
    },
    {
        course: "javascript",
        level: "advanced",
        topic: "design-patterns",
        type: "mcq",
        question: "Which pattern ensures only one instance of a class exists?",
        options: [
            { text: "Singleton", isCorrect: true },
            { text: "Factory", isCorrect: false },
            { text: "Observer", isCorrect: false },
            { text: "Decorator", isCorrect: false }
        ],
        difficulty: 3
    },
    {
        course: "javascript",
        level: "advanced",
        topic: "event-loop",
        type: "output",
        question: "What is the order of logs?",
        codeSnippet: "async function test() {\n  console.log('1');\n  await Promise.resolve();\n  console.log('2');\n}\ntest();\nconsole.log('3');",
        options: [
            { text: "1, 3, 2", isCorrect: true },
            { text: "1, 2, 3", isCorrect: false },
            { text: "3, 1, 2", isCorrect: false },
            { text: "1, 3", isCorrect: false }
        ],
        difficulty: 4
    },
    {
        course: "javascript",
        level: "advanced",
        topic: "proxy",
        type: "mcq",
        question: "What is a Proxy used for?",
        options: [
            { text: "Intercepting object operations", isCorrect: true },
            { text: "Network requests", isCorrect: false },
            { text: "Creating copies of objects", isCorrect: false },
            { text: "Type checking", isCorrect: false }
        ],
        difficulty: 4
    },
    {
        course: "javascript",
        level: "advanced",
        topic: "web-apis",
        type: "mcq",
        question: "Which API allows running JS in a background thread?",
        options: [
            { text: "Web Workers", isCorrect: true },
            { text: "Service Workers only", isCorrect: false },
            { text: "setTimeout", isCorrect: false },
            { text: "requestAnimationFrame", isCorrect: false }
        ],
        difficulty: 3
    },
    {
        course: "javascript",
        level: "advanced",
        topic: "typescript",
        type: "mcq",
        question: "What TypeScript feature helps catch null errors?",
        options: [
            { text: "Strict null checks", isCorrect: true },
            { text: "Type inference", isCorrect: false },
            { text: "Generics", isCorrect: false },
            { text: "Decorators", isCorrect: false }
        ],
        difficulty: 3
    },
    {
        course: "javascript",
        level: "advanced",
        topic: "testing",
        type: "mcq",
        question: "What is the purpose of mocking in tests?",
        options: [
            { text: "Isolate units by replacing dependencies", isCorrect: true },
            { text: "Make tests run faster", isCorrect: false },
            { text: "Skip failing tests", isCorrect: false },
            { text: "Generate test data", isCorrect: false }
        ],
        difficulty: 3
    },
    {
        course: "javascript",
        level: "advanced",
        topic: "functional",
        type: "mcq",
        question: "What does 'pure function' mean?",
        options: [
            { text: "Same input always produces same output with no side effects", isCorrect: true },
            { text: "A function with no parameters", isCorrect: false },
            { text: "A function that returns undefined", isCorrect: false },
            { text: "An async function", isCorrect: false }
        ],
        difficulty: 3
    },
    {
        course: "javascript",
        level: "advanced",
        topic: "bundling",
        type: "mcq",
        question: "What is tree-shaking?",
        options: [
            { text: "Removing unused code from bundles", isCorrect: true },
            { text: "Organizing files in folders", isCorrect: false },
            { text: "Minifying variable names", isCorrect: false },
            { text: "Compressing images", isCorrect: false }
        ],
        difficulty: 3
    },
    {
        course: "javascript",
        level: "advanced",
        topic: "symbols",
        type: "mcq",
        question: "What is Symbol.iterator used for?",
        options: [
            { text: "Making objects iterable with for...of", isCorrect: true },
            { text: "Creating unique IDs", isCorrect: false },
            { text: "Symbol comparison", isCorrect: false },
            { text: "Defining private properties", isCorrect: false }
        ],
        difficulty: 4
    },

    // ========== HTML-CSS - BASIC ==========
    {
        course: "html-css",
        level: "basic",
        topic: "html-structure",
        type: "mcq",
        question: "Which tag defines the document type?",
        options: [
            { text: "<!DOCTYPE html>", isCorrect: true },
            { text: "<html>", isCorrect: false },
            { text: "<head>", isCorrect: false },
            { text: "<meta>", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "html-css",
        level: "basic",
        topic: "html-structure",
        type: "mcq",
        question: "Which tag is used for the main content of a page?",
        options: [
            { text: "<main>", isCorrect: true },
            { text: "<div>", isCorrect: false },
            { text: "<body>", isCorrect: false },
            { text: "<content>", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "html-css",
        level: "basic",
        topic: "selectors",
        type: "mcq",
        question: "Which CSS selector targets elements with class 'btn'?",
        options: [
            { text: ".btn", isCorrect: true },
            { text: "#btn", isCorrect: false },
            { text: "btn", isCorrect: false },
            { text: "*btn", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "html-css",
        level: "basic",
        topic: "selectors",
        type: "mcq",
        question: "Which selector has the highest specificity?",
        options: [
            { text: "#id", isCorrect: true },
            { text: ".class", isCorrect: false },
            { text: "element", isCorrect: false },
            { text: "*", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "html-css",
        level: "basic",
        topic: "box-model",
        type: "mcq",
        question: "What is the order of the box model from inside to outside?",
        options: [
            { text: "Content, Padding, Border, Margin", isCorrect: true },
            { text: "Margin, Border, Padding, Content", isCorrect: false },
            { text: "Content, Border, Padding, Margin", isCorrect: false },
            { text: "Padding, Content, Border, Margin", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "html-css",
        level: "basic",
        topic: "display",
        type: "mcq",
        question: "Which display value makes an element invisible but keeps its space?",
        options: [
            { text: "visibility: hidden", isCorrect: true },
            { text: "display: none", isCorrect: false },
            { text: "opacity: 0", isCorrect: false },
            { text: "position: absolute", isCorrect: false }
        ],
        difficulty: 3
    },
    {
        course: "html-css",
        level: "basic",
        topic: "colors",
        type: "mcq",
        question: "Which is a valid hex color code?",
        options: [
            { text: "#FF5733", isCorrect: true },
            { text: "#GG5733", isCorrect: false },
            { text: "FF5733", isCorrect: false },
            { text: "#FF57", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "html-css",
        level: "basic",
        topic: "units",
        type: "mcq",
        question: "Which unit is relative to the parent element's font size?",
        options: [
            { text: "em", isCorrect: true },
            { text: "rem", isCorrect: false },
            { text: "px", isCorrect: false },
            { text: "vh", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "html-css",
        level: "basic",
        topic: "links",
        type: "mcq",
        question: "Which attribute opens a link in a new tab?",
        options: [
            { text: "target=\"_blank\"", isCorrect: true },
            { text: "newtab=\"true\"", isCorrect: false },
            { text: "href=\"_blank\"", isCorrect: false },
            { text: "open=\"new\"", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "html-css",
        level: "basic",
        topic: "images",
        type: "mcq",
        question: "Which attribute is required for accessibility on <img>?",
        options: [
            { text: "alt", isCorrect: true },
            { text: "title", isCorrect: false },
            { text: "src", isCorrect: false },
            { text: "name", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "html-css",
        level: "basic",
        topic: "forms",
        type: "mcq",
        question: "Which input type is for email addresses?",
        options: [
            { text: "email", isCorrect: true },
            { text: "text", isCorrect: false },
            { text: "mail", isCorrect: false },
            { text: "address", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "html-css",
        level: "basic",
        topic: "text",
        type: "mcq",
        question: "Which property changes the text color?",
        options: [
            { text: "color", isCorrect: true },
            { text: "text-color", isCorrect: false },
            { text: "font-color", isCorrect: false },
            { text: "foreground", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "html-css",
        level: "basic",
        topic: "positioning",
        type: "mcq",
        question: "What is the default position value?",
        options: [
            { text: "static", isCorrect: true },
            { text: "relative", isCorrect: false },
            { text: "absolute", isCorrect: false },
            { text: "fixed", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "html-css",
        level: "basic",
        topic: "semantic",
        type: "mcq",
        question: "Which is a semantic HTML5 element?",
        options: [
            { text: "<article>", isCorrect: true },
            { text: "<div>", isCorrect: false },
            { text: "<span>", isCorrect: false },
            { text: "<b>", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "html-css",
        level: "basic",
        topic: "backgrounds",
        type: "mcq",
        question: "Which property sets a background image?",
        options: [
            { text: "background-image", isCorrect: true },
            { text: "background-src", isCorrect: false },
            { text: "image-background", isCorrect: false },
            { text: "bg-image", isCorrect: false }
        ],
        difficulty: 1
    }
];

async function seedQuestions() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");

        // Clear existing questions (optional)
        // await Question.deleteMany({});
        // console.log("Cleared existing questions");

        // Insert questions
        const result = await Question.insertMany(questions, { ordered: false });
        console.log(`Inserted ${result.length} questions`);

        // Show counts per course/level
        const stats = await Question.aggregate([
            { $group: { _id: { course: "$course", level: "$level" }, count: { $sum: 1 } } },
            { $sort: { "_id.course": 1, "_id.level": 1 } }
        ]);
        console.log("\nQuestion counts:");
        stats.forEach(s => console.log(`  ${s._id.course} - ${s._id.level}: ${s.count}`));

        await mongoose.disconnect();
        console.log("\nSeeding complete!");
    } catch (err) {
        if (err.code === 11000) {
            console.log("Some questions already exist (duplicate key error)");
        } else {
            console.error("Seeding error:", err);
        }
        process.exit(1);
    }
}

seedQuestions();

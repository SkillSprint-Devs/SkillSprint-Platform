import mongoose from "mongoose";
import dotenv from "dotenv";
import Question from "./models/question.js";

dotenv.config();

const moreQuestions = [
    // ========== GIT-GITHUB - BASIC ==========
    {
        course: "git-github",
        level: "basic",
        topic: "commands",
        type: "mcq",
        question: "Which command initializes a new Git repository?",
        options: [
            { text: "git init", isCorrect: true },
            { text: "git start", isCorrect: false },
            { text: "git create", isCorrect: false },
            { text: "git new", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "git-github",
        level: "basic",
        topic: "commands",
        type: "mcq",
        question: "Which command stages changes for commit?",
        options: [
            { text: "git add", isCorrect: true },
            { text: "git stage", isCorrect: false },
            { text: "git commit", isCorrect: false },
            { text: "git push", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "git-github",
        level: "basic",
        topic: "commits",
        type: "mcq",
        question: "What does git commit do?",
        options: [
            { text: "Saves staged changes to local repository", isCorrect: true },
            { text: "Uploads changes to remote", isCorrect: false },
            { text: "Downloads changes from remote", isCorrect: false },
            { text: "Deletes files", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "git-github",
        level: "basic",
        topic: "branches",
        type: "mcq",
        question: "What is the default branch name in Git?",
        options: [
            { text: "main or master", isCorrect: true },
            { text: "default", isCorrect: false },
            { text: "trunk", isCorrect: false },
            { text: "origin", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "git-github",
        level: "basic",
        topic: "remote",
        type: "mcq",
        question: "What does git clone do?",
        options: [
            { text: "Creates a copy of a remote repository", isCorrect: true },
            { text: "Creates a new branch", isCorrect: false },
            { text: "Deletes a repository", isCorrect: false },
            { text: "Merges branches", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "git-github",
        level: "basic",
        topic: "status",
        type: "mcq",
        question: "Which command shows the current status of the repository?",
        options: [
            { text: "git status", isCorrect: true },
            { text: "git info", isCorrect: false },
            { text: "git show", isCorrect: false },
            { text: "git check", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "git-github",
        level: "basic",
        topic: "history",
        type: "mcq",
        question: "Which command shows commit history?",
        options: [
            { text: "git log", isCorrect: true },
            { text: "git history", isCorrect: false },
            { text: "git commits", isCorrect: false },
            { text: "git timeline", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "git-github",
        level: "basic",
        topic: "remote",
        type: "mcq",
        question: "What does git push do?",
        options: [
            { text: "Uploads local commits to remote", isCorrect: true },
            { text: "Downloads changes from remote", isCorrect: false },
            { text: "Creates a branch", isCorrect: false },
            { text: "Reverts changes", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "git-github",
        level: "basic",
        topic: "remote",
        type: "mcq",
        question: "What does git pull do?",
        options: [
            { text: "Fetches and merges changes from remote", isCorrect: true },
            { text: "Pushes changes to remote", isCorrect: false },
            { text: "Deletes a branch", isCorrect: false },
            { text: "Creates a commit", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "git-github",
        level: "basic",
        topic: "branches",
        type: "mcq",
        question: "Which command creates a new branch?",
        options: [
            { text: "git branch <name>", isCorrect: true },
            { text: "git new <name>", isCorrect: false },
            { text: "git create-branch <name>", isCorrect: false },
            { text: "git fork <name>", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "git-github",
        level: "basic",
        topic: "branches",
        type: "mcq",
        question: "Which command switches to a different branch?",
        options: [
            { text: "git checkout <branch>", isCorrect: true },
            { text: "git switch-to <branch>", isCorrect: false },
            { text: "git move <branch>", isCorrect: false },
            { text: "git go <branch>", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "git-github",
        level: "basic",
        topic: "staging",
        type: "mcq",
        question: "What does 'staging area' mean in Git?",
        options: [
            { text: "Area where changes are prepared before commit", isCorrect: true },
            { text: "The remote repository", isCorrect: false },
            { text: "A backup location", isCorrect: false },
            { text: "The main branch", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "git-github",
        level: "basic",
        topic: "files",
        type: "mcq",
        question: "What file tells Git which files to ignore?",
        options: [
            { text: ".gitignore", isCorrect: true },
            { text: ".gitexclude", isCorrect: false },
            { text: ".ignore", isCorrect: false },
            { text: "ignore.git", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "git-github",
        level: "basic",
        topic: "merge",
        type: "mcq",
        question: "What does git merge do?",
        options: [
            { text: "Combines changes from two branches", isCorrect: true },
            { text: "Splits a branch into two", isCorrect: false },
            { text: "Deletes a branch", isCorrect: false },
            { text: "Creates a new remote", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "git-github",
        level: "basic",
        topic: "diff",
        type: "mcq",
        question: "Which command shows differences between commits?",
        options: [
            { text: "git diff", isCorrect: true },
            { text: "git compare", isCorrect: false },
            { text: "git changes", isCorrect: false },
            { text: "git delta", isCorrect: false }
        ],
        difficulty: 2
    },

    // ========== NODEJS-EXPRESS - BASIC ==========
    {
        course: "nodejs-express",
        level: "basic",
        topic: "fundamentals",
        type: "mcq",
        question: "What is Node.js?",
        options: [
            { text: "A JavaScript runtime built on V8", isCorrect: true },
            { text: "A web browser", isCorrect: false },
            { text: "A database", isCorrect: false },
            { text: "A CSS framework", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "nodejs-express",
        level: "basic",
        topic: "modules",
        type: "mcq",
        question: "Which keyword is used to import modules in Node.js CommonJS?",
        options: [
            { text: "require", isCorrect: true },
            { text: "import", isCorrect: false },
            { text: "include", isCorrect: false },
            { text: "load", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "nodejs-express",
        level: "basic",
        topic: "npm",
        type: "mcq",
        question: "What does npm stand for?",
        options: [
            { text: "Node Package Manager", isCorrect: true },
            { text: "New Project Manager", isCorrect: false },
            { text: "Node Program Manager", isCorrect: false },
            { text: "Network Package Manager", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "nodejs-express",
        level: "basic",
        topic: "express",
        type: "mcq",
        question: "What is Express.js?",
        options: [
            { text: "A web application framework for Node.js", isCorrect: true },
            { text: "A database", isCorrect: false },
            { text: "A testing library", isCorrect: false },
            { text: "A CSS preprocessor", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "nodejs-express",
        level: "basic",
        topic: "express",
        type: "output",
        question: "What does this code do?",
        codeSnippet: "app.get('/users', (req, res) => {\n  res.json({ users: [] });\n});",
        options: [
            { text: "Creates a GET endpoint at /users", isCorrect: true },
            { text: "Creates a POST endpoint", isCorrect: false },
            { text: "Starts the server", isCorrect: false },
            { text: "Imports a module", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "nodejs-express",
        level: "basic",
        topic: "http",
        type: "mcq",
        question: "Which HTTP method is typically used to create a resource?",
        options: [
            { text: "POST", isCorrect: true },
            { text: "GET", isCorrect: false },
            { text: "DELETE", isCorrect: false },
            { text: "OPTIONS", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "nodejs-express",
        level: "basic",
        topic: "middleware",
        type: "mcq",
        question: "What is middleware in Express?",
        options: [
            { text: "Functions that process requests before handlers", isCorrect: true },
            { text: "Database connections", isCorrect: false },
            { text: "HTML templates", isCorrect: false },
            { text: "Static files", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "nodejs-express",
        level: "basic",
        topic: "json",
        type: "mcq",
        question: "Which middleware parses JSON request bodies?",
        options: [
            { text: "express.json()", isCorrect: true },
            { text: "express.parse()", isCorrect: false },
            { text: "express.body()", isCorrect: false },
            { text: "express.data()", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "nodejs-express",
        level: "basic",
        topic: "response",
        type: "mcq",
        question: "Which method sends a JSON response?",
        options: [
            { text: "res.json()", isCorrect: true },
            { text: "res.write()", isCorrect: false },
            { text: "res.text()", isCorrect: false },
            { text: "res.data()", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "nodejs-express",
        level: "basic",
        topic: "routing",
        type: "mcq",
        question: "How do you get URL parameters in Express?",
        options: [
            { text: "req.params", isCorrect: true },
            { text: "req.url", isCorrect: false },
            { text: "req.path", isCorrect: false },
            { text: "req.args", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "nodejs-express",
        level: "basic",
        topic: "status",
        type: "mcq",
        question: "What status code indicates 'Not Found'?",
        options: [
            { text: "404", isCorrect: true },
            { text: "200", isCorrect: false },
            { text: "500", isCorrect: false },
            { text: "401", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "nodejs-express",
        level: "basic",
        topic: "files",
        type: "mcq",
        question: "What file lists project dependencies?",
        options: [
            { text: "package.json", isCorrect: true },
            { text: "index.js", isCorrect: false },
            { text: "node_modules", isCorrect: false },
            { text: "config.js", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "nodejs-express",
        level: "basic",
        topic: "async",
        type: "mcq",
        question: "Why is Node.js considered non-blocking?",
        options: [
            { text: "It uses asynchronous I/O", isCorrect: true },
            { text: "It runs in multiple threads", isCorrect: false },
            { text: "It has no I/O operations", isCorrect: false },
            { text: "It uses a faster CPU", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "nodejs-express",
        level: "basic",
        topic: "server",
        type: "output",
        question: "What does this code do?",
        codeSnippet: "app.listen(3000, () => console.log('Running'));",
        options: [
            { text: "Starts server on port 3000", isCorrect: true },
            { text: "Stops the server", isCorrect: false },
            { text: "Creates a route", isCorrect: false },
            { text: "Imports Express", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "nodejs-express",
        level: "basic",
        topic: "query",
        type: "mcq",
        question: "How do you access query string parameters?",
        options: [
            { text: "req.query", isCorrect: true },
            { text: "req.params", isCorrect: false },
            { text: "req.body", isCorrect: false },
            { text: "req.search", isCorrect: false }
        ],
        difficulty: 2
    },

    // ========== MONGODB - BASIC ==========
    {
        course: "mongodb",
        level: "basic",
        topic: "fundamentals",
        type: "mcq",
        question: "What type of database is MongoDB?",
        options: [
            { text: "NoSQL document database", isCorrect: true },
            { text: "Relational database", isCorrect: false },
            { text: "Graph database", isCorrect: false },
            { text: "Key-value store", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "mongodb",
        level: "basic",
        topic: "documents",
        type: "mcq",
        question: "What format does MongoDB use to store data?",
        options: [
            { text: "BSON (Binary JSON)", isCorrect: true },
            { text: "XML", isCorrect: false },
            { text: "CSV", isCorrect: false },
            { text: "Plain text", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "mongodb",
        level: "basic",
        topic: "crud",
        type: "mcq",
        question: "Which method inserts a document into a collection?",
        options: [
            { text: "insertOne()", isCorrect: true },
            { text: "create()", isCorrect: false },
            { text: "add()", isCorrect: false },
            { text: "push()", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "mongodb",
        level: "basic",
        topic: "crud",
        type: "mcq",
        question: "Which method finds all documents in a collection?",
        options: [
            { text: "find()", isCorrect: true },
            { text: "getAll()", isCorrect: false },
            { text: "select()", isCorrect: false },
            { text: "query()", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "mongodb",
        level: "basic",
        topic: "crud",
        type: "mcq",
        question: "Which method updates a single document?",
        options: [
            { text: "updateOne()", isCorrect: true },
            { text: "modify()", isCorrect: false },
            { text: "change()", isCorrect: false },
            { text: "set()", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "mongodb",
        level: "basic",
        topic: "crud",
        type: "mcq",
        question: "Which method deletes a single document?",
        options: [
            { text: "deleteOne()", isCorrect: true },
            { text: "remove()", isCorrect: false },
            { text: "drop()", isCorrect: false },
            { text: "erase()", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "mongodb",
        level: "basic",
        topic: "structure",
        type: "mcq",
        question: "What is a collection in MongoDB?",
        options: [
            { text: "A group of documents", isCorrect: true },
            { text: "A single document", isCorrect: false },
            { text: "A database", isCorrect: false },
            { text: "A field", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "mongodb",
        level: "basic",
        topic: "ids",
        type: "mcq",
        question: "What is the default unique identifier field in MongoDB?",
        options: [
            { text: "_id", isCorrect: true },
            { text: "id", isCorrect: false },
            { text: "uid", isCorrect: false },
            { text: "key", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "mongodb",
        level: "basic",
        topic: "mongoose",
        type: "mcq",
        question: "What is Mongoose?",
        options: [
            { text: "An ODM for MongoDB and Node.js", isCorrect: true },
            { text: "A MongoDB database", isCorrect: false },
            { text: "A web framework", isCorrect: false },
            { text: "A testing library", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "mongodb",
        level: "basic",
        topic: "mongoose",
        type: "mcq",
        question: "What does a Mongoose Schema define?",
        options: [
            { text: "The structure of documents", isCorrect: true },
            { text: "Database connection settings", isCorrect: false },
            { text: "API routes", isCorrect: false },
            { text: "User authentication", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "mongodb",
        level: "basic",
        topic: "queries",
        type: "output",
        question: "What does this query return?",
        codeSnippet: "db.users.find({ age: { $gt: 18 } })",
        options: [
            { text: "Users older than 18", isCorrect: true },
            { text: "Users exactly 18 years old", isCorrect: false },
            { text: "Users younger than 18", isCorrect: false },
            { text: "All users", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "mongodb",
        level: "basic",
        topic: "operators",
        type: "mcq",
        question: "What does $set operator do in an update?",
        options: [
            { text: "Sets the value of a field", isCorrect: true },
            { text: "Deletes a field", isCorrect: false },
            { text: "Creates a new collection", isCorrect: false },
            { text: "Adds to an array", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "mongodb",
        level: "basic",
        topic: "connection",
        type: "mcq",
        question: "Which method connects Mongoose to MongoDB?",
        options: [
            { text: "mongoose.connect()", isCorrect: true },
            { text: "mongoose.open()", isCorrect: false },
            { text: "mongoose.start()", isCorrect: false },
            { text: "mongoose.init()", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "mongodb",
        level: "basic",
        topic: "arrays",
        type: "mcq",
        question: "Which operator adds an element to an array?",
        options: [
            { text: "$push", isCorrect: true },
            { text: "$add", isCorrect: false },
            { text: "$append", isCorrect: false },
            { text: "$insert", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "mongodb",
        level: "basic",
        topic: "indexes",
        type: "mcq",
        question: "What is the purpose of indexes in MongoDB?",
        options: [
            { text: "Speed up query performance", isCorrect: true },
            { text: "Store backup data", isCorrect: false },
            { text: "Encrypt documents", isCorrect: false },
            { text: "Define relationships", isCorrect: false }
        ],
        difficulty: 2
    },

    // ========== PROBLEM-SOLVING - BASIC ==========
    {
        course: "problem-solving",
        level: "basic",
        topic: "arrays",
        type: "code-reasoning",
        question: "What is the time complexity of accessing an array element by index?",
        options: [
            { text: "O(1)", isCorrect: true },
            { text: "O(n)", isCorrect: false },
            { text: "O(log n)", isCorrect: false },
            { text: "O(n²)", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "problem-solving",
        level: "basic",
        topic: "loops",
        type: "output",
        question: "How many times does this loop run?",
        codeSnippet: "for (let i = 0; i < 5; i++) {\n  console.log(i);\n}",
        options: [
            { text: "5 times", isCorrect: true },
            { text: "4 times", isCorrect: false },
            { text: "6 times", isCorrect: false },
            { text: "Infinite", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "problem-solving",
        level: "basic",
        topic: "search",
        type: "mcq",
        question: "What is linear search?",
        options: [
            { text: "Checking each element one by one", isCorrect: true },
            { text: "Dividing array in half repeatedly", isCorrect: false },
            { text: "Using a hash table", isCorrect: false },
            { text: "Sorting then searching", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "problem-solving",
        level: "basic",
        topic: "strings",
        type: "output",
        question: "What does this return?",
        codeSnippet: "'hello'.split('').reverse().join('')",
        options: [
            { text: "'olleh'", isCorrect: true },
            { text: "'hello'", isCorrect: false },
            { text: "['o','l','l','e','h']", isCorrect: false },
            { text: "Error", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "problem-solving",
        level: "basic",
        topic: "math",
        type: "mcq",
        question: "What is the modulo operator used for?",
        options: [
            { text: "Finding the remainder of division", isCorrect: true },
            { text: "Multiplication", isCorrect: false },
            { text: "Exponentiation", isCorrect: false },
            { text: "Rounding numbers", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "problem-solving",
        level: "basic",
        topic: "conditionals",
        type: "output",
        question: "What is logged?",
        codeSnippet: "let x = 10;\nif (x > 5 && x < 15) {\n  console.log('yes');\n} else {\n  console.log('no');\n}",
        options: [
            { text: "'yes'", isCorrect: true },
            { text: "'no'", isCorrect: false },
            { text: "true", isCorrect: false },
            { text: "Error", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "problem-solving",
        level: "basic",
        topic: "sorting",
        type: "mcq",
        question: "Which sorting algorithm has O(n²) average time complexity?",
        options: [
            { text: "Bubble Sort", isCorrect: true },
            { text: "Merge Sort", isCorrect: false },
            { text: "Quick Sort", isCorrect: false },
            { text: "Heap Sort", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "problem-solving",
        level: "basic",
        topic: "recursion",
        type: "mcq",
        question: "What is the base case in recursion?",
        options: [
            { text: "The condition that stops recursion", isCorrect: true },
            { text: "The first function call", isCorrect: false },
            { text: "The largest input", isCorrect: false },
            { text: "The return statement", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "problem-solving",
        level: "basic",
        topic: "counting",
        type: "output",
        question: "What does this return?",
        codeSnippet: "[1, 2, 2, 3, 3, 3].filter(x => x === 2).length",
        options: [
            { text: "2", isCorrect: true },
            { text: "3", isCorrect: false },
            { text: "1", isCorrect: false },
            { text: "6", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "problem-solving",
        level: "basic",
        topic: "max-min",
        type: "output",
        question: "What does this return?",
        codeSnippet: "Math.max(...[3, 1, 4, 1, 5])",
        options: [
            { text: "5", isCorrect: true },
            { text: "1", isCorrect: false },
            { text: "[5]", isCorrect: false },
            { text: "4", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "problem-solving",
        level: "basic",
        topic: "sum",
        type: "output",
        question: "What does this return?",
        codeSnippet: "[1, 2, 3, 4].reduce((sum, n) => sum + n, 0)",
        options: [
            { text: "10", isCorrect: true },
            { text: "24", isCorrect: false },
            { text: "[1,2,3,4]", isCorrect: false },
            { text: "0", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "problem-solving",
        level: "basic",
        topic: "unique",
        type: "output",
        question: "What does this return?",
        codeSnippet: "[...new Set([1, 1, 2, 2, 3])]",
        options: [
            { text: "[1, 2, 3]", isCorrect: true },
            { text: "[1, 1, 2, 2, 3]", isCorrect: false },
            { text: "Set(1, 2, 3)", isCorrect: false },
            { text: "3", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "problem-solving",
        level: "basic",
        topic: "palindrome",
        type: "mcq",
        question: "What is a palindrome?",
        options: [
            { text: "A string that reads the same forwards and backwards", isCorrect: true },
            { text: "A string with all unique characters", isCorrect: false },
            { text: "A string of even length", isCorrect: false },
            { text: "A string with no vowels", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "problem-solving",
        level: "basic",
        topic: "frequency",
        type: "mcq",
        question: "Which data structure is best for counting character frequency?",
        options: [
            { text: "Object/Map", isCorrect: true },
            { text: "Array", isCorrect: false },
            { text: "Set", isCorrect: false },
            { text: "String", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "problem-solving",
        level: "basic",
        topic: "stacks",
        type: "mcq",
        question: "What is the order of a stack?",
        options: [
            { text: "LIFO (Last In, First Out)", isCorrect: true },
            { text: "FIFO (First In, First Out)", isCorrect: false },
            { text: "Random order", isCorrect: false },
            { text: "Sorted order", isCorrect: false }
        ],
        difficulty: 2
    }
];

async function seedMoreQuestions() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");

        const result = await Question.insertMany(moreQuestions, { ordered: false });
        console.log(`Inserted ${result.length} more questions`);

        const stats = await Question.aggregate([
            { $group: { _id: { course: "$course", level: "$level" }, count: { $sum: 1 } } },
            { $sort: { "_id.course": 1, "_id.level": 1 } }
        ]);
        console.log("\nTotal question counts:");
        stats.forEach(s => console.log(`  ${s._id.course} - ${s._id.level}: ${s.count}`));

        await mongoose.disconnect();
        console.log("\nDone!");
    } catch (err) {
        if (err.code === 11000) {
            console.log("Some questions already exist");
        } else {
            console.error("Error:", err);
        }
        process.exit(1);
    }
}

seedMoreQuestions();

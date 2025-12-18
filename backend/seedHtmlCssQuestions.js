import mongoose from "mongoose";
import dotenv from "dotenv";
import Question from "./models/question.js";

dotenv.config();

const htmlCssQuestions = [
    // ========== HTML-CSS - INTERMEDIATE (15 questions) ==========
    {
        course: "html-css",
        level: "intermediate",
        topic: "flexbox",
        type: "mcq",
        question: "Which property is used to align items along the main axis in Flexbox?",
        options: [
            { text: "justify-content", isCorrect: true },
            { text: "align-items", isCorrect: false },
            { text: "align-content", isCorrect: false },
            { text: "flex-direction", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "html-css",
        level: "intermediate",
        topic: "flexbox",
        type: "mcq",
        question: "What is the default value of flex-direction?",
        options: [
            { text: "row", isCorrect: true },
            { text: "column", isCorrect: false },
            { text: "row-reverse", isCorrect: false },
            { text: "column-reverse", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "html-css",
        level: "intermediate",
        topic: "grid",
        type: "mcq",
        question: "Which property defines the number of columns in a CSS Grid?",
        options: [
            { text: "grid-template-columns", isCorrect: true },
            { text: "grid-columns", isCorrect: false },
            { text: "grid-template-rows", isCorrect: false },
            { text: "grid-gap", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "html-css",
        level: "intermediate",
        topic: "grid",
        type: "mcq",
        question: "What does the 'fr' unit represent in CSS Grid?",
        options: [
            { text: "A fraction of the available space", isCorrect: true },
            { text: "Fixed resolution", isCorrect: false },
            { text: "Frequency", isCorrect: false },
            { text: "Frame rate", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "html-css",
        level: "intermediate",
        topic: "responsive-design",
        type: "mcq",
        question: "Which meta tag is essential for responsive web design?",
        options: [
            { text: "viewport", isCorrect: true },
            { text: "charset", isCorrect: false },
            { text: "description", isCorrect: false },
            { text: "keywords", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "html-css",
        level: "intermediate",
        topic: "responsive-design",
        type: "mcq",
        question: "At what width does a 'desktop-first' media query typicaly start?",
        options: [
            { text: "max-width", isCorrect: true },
            { text: "min-width", isCorrect: false },
            { text: "device-width", isCorrect: false },
            { text: "screen-width", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "html-css",
        level: "intermediate",
        topic: "css-variables",
        type: "output",
        question: "What is the correct syntax for defining a CSS variable?",
        codeSnippet: ":root {\n  --main-color: #ff0000;\n}",
        options: [
            { text: "--variable-name", isCorrect: true },
            { text: "$variable-name", isCorrect: false },
            { text: "@variable-name", isCorrect: false },
            { text: "var-variable-name", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "html-css",
        level: "intermediate",
        topic: "css-variables",
        type: "mcq",
        question: "How do you use a CSS variable?",
        options: [
            { text: "var(--main-color)", isCorrect: true },
            { text: "get(--main-color)", isCorrect: false },
            { text: "use(--main-color)", isCorrect: false },
            { text: "$main-color", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "html-css",
        level: "intermediate",
        topic: "transitions",
        type: "mcq",
        question: "Which property specifies the speed curve of a transition?",
        options: [
            { text: "transition-timing-function", isCorrect: true },
            { text: "transition-duration", isCorrect: false },
            { text: "transition-delay", isCorrect: false },
            { text: "transition-property", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "html-css",
        level: "intermediate",
        topic: "transitions",
        type: "mcq",
        question: "What is the default value of transition-timing-function?",
        options: [
            { text: "ease", isCorrect: true },
            { text: "linear", isCorrect: false },
            { text: "ease-in", isCorrect: false },
            { text: "ease-out", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "html-css",
        level: "intermediate",
        topic: "animations",
        type: "mcq",
        question: "Which rule is used to define keyframes for a CSS animation?",
        options: [
            { text: "@keyframes", isCorrect: true },
            { text: "@animate", isCorrect: false },
            { text: "@frames", isCorrect: false },
            { text: "@motion", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "html-css",
        level: "intermediate",
        topic: "selectors",
        type: "mcq",
        question: "What does the sibling selector '+' target?",
        options: [
            { text: "The very next sibling element", isCorrect: true },
            { text: "All following sibling elements", isCorrect: false },
            { text: "All child elements", isCorrect: false },
            { text: "The parent element", isCorrect: false }
        ],
        difficulty: 3
    },
    {
        course: "html-css",
        level: "intermediate",
        topic: "selectors",
        type: "mcq",
        question: "Which pseudo-class targets the first child of a parent?",
        options: [
            { text: ":first-child", isCorrect: true },
            { text: ":initial-child", isCorrect: false },
            { text: ":one-child", isCorrect: false },
            { text: ":top-child", isCorrect: false }
        ],
        difficulty: 1
    },
    {
        course: "html-css",
        level: "intermediate",
        topic: "box-sizing",
        type: "mcq",
        question: "Which box-sizing value includes padding and border in the element's total width and height?",
        options: [
            { text: "border-box", isCorrect: true },
            { text: "content-box", isCorrect: false },
            { text: "padding-box", isCorrect: false },
            { text: "total-box", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "html-css",
        level: "intermediate",
        topic: "z-index",
        type: "mcq",
        question: "What is required for z-index to work on an element?",
        options: [
            { text: "A position value other than static", isCorrect: true },
            { text: "A defined width and height", isCorrect: false },
            { text: "A background color", isCorrect: false },
            { text: "Display set to block", isCorrect: false }
        ],
        difficulty: 2
    },

    // ========== HTML-CSS - ADVANCED (15 questions) ==========
    {
        course: "html-css",
        level: "advanced",
        topic: "css-architecture",
        type: "mcq",
        question: "What does the 'B' in BEM naming convention stand for?",
        options: [
            { text: "Block", isCorrect: true },
            { text: "Body", isCorrect: false },
            { text: "Base", isCorrect: false },
            { text: "Boolean", isCorrect: false }
        ],
        difficulty: 3
    },
    {
        course: "html-css",
        level: "advanced",
        topic: "performance",
        type: "mcq",
        question: "Which CSS property change is most likely to cause a 'reflow' (layout)?",
        options: [
            { text: "width", isCorrect: true },
            { text: "opacity", isCorrect: false },
            { text: "transform", isCorrect: false },
            { text: "color", isCorrect: false }
        ],
        difficulty: 4
    },
    {
        course: "html-css",
        level: "advanced",
        topic: "accessibility",
        type: "mcq",
        question: "What is the purpose of the 'aria-label' attribute?",
        options: [
            { text: "To provide a string that labels the current element", isCorrect: true },
            { text: "To define the font size for screen readers", isCorrect: false },
            { text: "To link to an external accessibility document", isCorrect: false },
            { text: "To hide elements from sighted users", isCorrect: false }
        ],
        difficulty: 3
    },
    {
        course: "html-css",
        level: "advanced",
        topic: "specificity",
        type: "mcq",
        question: "What is the specificity of 'div.container#main'?",
        options: [
            { text: "1, 1, 1 (ID, Class, Element)", isCorrect: true },
            { text: "0, 1, 1", isCorrect: false },
            { text: "1, 0, 1", isCorrect: false },
            { text: "2, 1, 0", isCorrect: false }
        ],
        difficulty: 4
    },
    {
        course: "html-css",
        level: "advanced",
        topic: "grid",
        type: "mcq",
        question: "Which property allows a grid item to inherit the grid tracks of its parent?",
        options: [
            { text: "subgrid", isCorrect: true },
            { text: "inherit-grid", isCorrect: false },
            { text: "parent-grid", isCorrect: false },
            { text: "flex-grid", isCorrect: false }
        ],
        difficulty: 5
    },
    {
        course: "html-css",
        level: "advanced",
        topic: "container-queries",
        type: "mcq",
        question: "Unlike media queries, container queries allow styling based on...",
        options: [
            { text: "The size of a parent container", isCorrect: true },
            { text: "The size of the viewport", isCorrect: false },
            { text: "The height of the HTML document", isCorrect: false },
            { text: "The battery level of the device", isCorrect: false }
        ],
        difficulty: 4
    },
    {
        course: "html-css",
        level: "advanced",
        topic: "performance",
        type: "mcq",
        question: "Using the 'will-change' property too much can...",
        options: [
            { text: "Degrade performance by consuming too many resources", isCorrect: true },
            { text: "Improve page load time by 50%", isCorrect: false },
            { text: "Automatically minify your CSS", isCorrect: false },
            { text: "Disable all transitions", isCorrect: false }
        ],
        difficulty: 4
    },
    {
        course: "html-css",
        level: "advanced",
        topic: "svg",
        type: "mcq",
        question: "What does SVG stand for?",
        options: [
            { text: "Scalable Vector Graphics", isCorrect: true },
            { text: "Standard Visual Graphics", isCorrect: false },
            { text: "Static Vector Grid", isCorrect: false },
            { text: "Styled Variable Graphics", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "html-css",
        level: "advanced",
        topic: "filters",
        type: "output",
        question: "How do you apply a blur effect in CSS?",
        codeSnippet: ".box {\n  filter: blur(5px);\n}",
        options: [
            { text: "filter: blur(val)", isCorrect: true },
            { text: "effect: blur(val)", isCorrect: false },
            { text: "mask: blur(val)", isCorrect: false },
            { text: "blur: val", isCorrect: false }
        ],
        difficulty: 3
    },
    {
        course: "html-css",
        level: "advanced",
        topic: "pseudo-elements",
        type: "mcq",
        question: "Which pseudo-element is used to insert content before an element's content?",
        options: [
            { text: "::before", isCorrect: true },
            { text: ":front", isCorrect: false },
            { text: "::prepended", isCorrect: false },
            { text: ":pre", isCorrect: false }
        ],
        difficulty: 2
    },
    {
        course: "html-css",
        level: "advanced",
        topic: "masking",
        type: "mcq",
        question: "Which property is used to hide parts of an element based on a shape or image?",
        options: [
            { text: "clip-path", isCorrect: true },
            { text: "cut-out", isCorrect: false },
            { text: "intersect", isCorrect: false },
            { text: "shape-outside", isCorrect: false }
        ],
        difficulty: 4
    },
    {
        course: "html-css",
        level: "advanced",
        topic: "shadow-dom",
        type: "mcq",
        question: "What is the primary benefit of the Shadow DOM?",
        options: [
            { text: "Encapsulation of styles and markup", isCorrect: true },
            { text: "Faster rendering of images", isCorrect: false },
            { text: "Automatic SEO optimization", isCorrect: false },
            { text: "Increased storage capacity", isCorrect: false }
        ],
        difficulty: 5
    },
    {
        course: "html-css",
        level: "advanced",
        topic: "aspect-ratio",
        type: "mcq",
        question: "Which CSS property is used to set a preferred aspect ratio for a box?",
        options: [
            { text: "aspect-ratio", isCorrect: true },
            { text: "ratio", isCorrect: false },
            { text: "box-ratio", isCorrect: false },
            { text: "dim-ratio", isCorrect: false }
        ],
        difficulty: 3
    },
    {
        course: "html-css",
        level: "advanced",
        topic: "nesting",
        type: "mcq",
        question: "Native CSS nesting (supported in modern browsers) uses which symbol to reference the parent selector?",
        options: [
            { text: "&", isCorrect: true },
            { text: "$", isCorrect: false },
            { text: "@", isCorrect: false },
            { text: "#", isCorrect: false }
        ],
        difficulty: 4
    },
    {
        course: "html-css",
        level: "advanced",
        topic: "isolation",
        type: "mcq",
        question: "What does the 'isolation: isolate' property do?",
        options: [
            { text: "Creates a new stacking context", isCorrect: true },
            { text: "Prevents an element from being clicked", isCorrect: false },
            { text: "Moves an element to a new thread", isCorrect: false },
            { text: "Disconnects an element from the DOM", isCorrect: false }
        ],
        difficulty: 5
    }
];

async function seedHtmlCssQuestions() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");

        // Use ordered: false to continue even if some are duplicates
        const result = await Question.insertMany(htmlCssQuestions, { ordered: false });
        console.log(`Successfully inserted ${result.length} HTML-CSS questions`);

        // Show counts
        const stats = await Question.aggregate([
            { $match: { course: "html-css" } },
            { $group: { _id: "$level", count: { $sum: 1 } } }
        ]);
        console.log("\nHTML-CSS question counts:");
        stats.forEach(s => console.log(`  ${s._id}: ${s.count}`));

        await mongoose.disconnect();
        console.log("\nSeeding complete!");
    } catch (err) {
        if (err.code === 11000) {
            console.log("Note: Some questions were skipped as they already exist.");
        } else {
            console.error("Seeding error:", err);
        }
        process.exit(1);
    }
}

seedHtmlCssQuestions();

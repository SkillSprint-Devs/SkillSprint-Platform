import mongoose from "mongoose";

// Shared enums - export for use in routes
export const COURSES = [
    "html-css",
    "javascript",
    "git-github",
    "nodejs-express",
    "mongodb",
    "problem-solving"
];

export const LEVELS = ["basic", "intermediate", "advanced"];

export const QUESTION_TYPES = [
    "mcq",
    "output",
    "bug-hunt",
    "scenario",
    "code-reasoning"
];

const questionSchema = new mongoose.Schema({
    course: {
        type: String,
        enum: COURSES,
        required: true,
        index: true
    },
    level: {
        type: String,
        enum: LEVELS,
        required: true,
        index: true
    },
    topic: {
        type: String,
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: QUESTION_TYPES,
        default: "mcq"
    },
    question: {
        type: String,
        required: true
    },
    codeSnippet: {
        type: String,
        default: ""
    },
    options: [{
        text: { type: String, required: true },
        isCorrect: { type: Boolean, required: true }
    }],
    explanation: {
        type: String,
        default: ""
    },
    difficulty: {
        type: Number,
        min: 1,
        max: 5,
        default: 3
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Compound index for efficient quiz generation queries
questionSchema.index({ course: 1, level: 1, topic: 1 });

const Question = mongoose.model("Question", questionSchema);
export default Question;

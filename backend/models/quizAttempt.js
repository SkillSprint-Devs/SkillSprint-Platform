import mongoose from "mongoose";
import { COURSES, LEVELS } from "./question.js";

export const QUIZ_STATUS = ["in-progress", "submitted", "expired"];

const quizAttemptSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    course: {
        type: String,
        enum: COURSES,
        required: true
    },
    level: {
        type: String,
        enum: LEVELS,
        required: true
    },
    status: {
        type: String,
        enum: QUIZ_STATUS,
        default: "in-progress",
        index: true
    },
    // Session locking: quiz expires at this time
    expiresAt: {
        type: Date,
        required: true,
        index: true
    },
    // Question IDs for this attempt (answers stay server-side)
    questionIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Question"
    }],
    // Per-question shuffled option indexes (e.g., [[2,0,3,1], [1,3,0,2], ...])
    shuffledOptionIndexes: [[Number]],
    // User's selected answers (index into shuffled options, -1 = unanswered)
    userAnswers: [{
        type: Number,
        default: -1
    }],
    // Results (populated after submission)
    score: {
        type: Number,
        default: 0
    },
    correctCount: {
        type: Number,
        default: 0
    },
    wrongCount: {
        type: Number,
        default: 0
    },
    passed: {
        type: Boolean,
        default: false
    },
    // Topic-wise performance: { "variables": { correct: 3, total: 5 }, ... }
    topicPerformance: {
        type: Object,
        default: {}
    },
    startedAt: {
        type: Date,
        default: Date.now
    },
    submittedAt: {
        type: Date
    }
});

// Compound index for finding active quizzes
quizAttemptSchema.index({ user: 1, course: 1, level: 1, status: 1 });

// Index for daily attempt counting
quizAttemptSchema.index({ user: 1, course: 1, level: 1, startedAt: 1 });

const QuizAttempt = mongoose.model("QuizAttempt", quizAttemptSchema);
export default QuizAttempt;

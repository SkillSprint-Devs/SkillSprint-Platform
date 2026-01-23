import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import Library from "../models/library.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import User from "../models/user.js";

const router = express.Router();

import { storage } from "../config/cloudinary.js";

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            ".docx",
            ".pdf",
            ".pptx",
            ".xlsx",
            ".xls",
            ".mp4",
            ".txt"
        ];

        const ext = path.extname(file.originalname).toLowerCase();

        if (!allowedTypes.includes(ext)) {
            return cb(
                new Error(
                    "file format not supported please uplaod in this format (docx, pdf, pptx, xl, mp4, xlx, txt)"
                )
            );
        }

        cb(null, true);
    },
});

// Create a new entry (Upload file or save Note)
router.post("/upload", verifyToken, upload.single("file"), async (req, res) => {
    try {
        const { title, description, visibility, type } = req.body;
        const userId = req.user.id;
        const user = await User.findById(userId);

        if (!title) return res.status(400).json({ success: false, message: "Title is required" });

        let fileUrl = "";
        let fileSize = 0;
        let fileExt = "";

        if (req.file) {
            fileUrl = req.file.path || req.file.secure_url;
            fileSize = req.file.size;
            fileExt = path.extname(req.file.originalname).toLowerCase();
        }

        const newItem = new Library({
            user_id: userId,
            title,
            description: description || "",
            type: type || (req.file ? "Document" : "Note"),
            file_url: fileUrl,
            file_size: fileSize,
            file_ext: fileExt,
            visibility: visibility || "Private",
            owner_name: user ? user.name : "Unknown",
        });

        await newItem.save();
        res.status(201).json({ success: true, data: newItem });
    } catch (error) {
        console.error("Library upload error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get library items (Own + Public)
router.get("/", verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const items = await Library.find({
            user_id: userId
        }).sort({ date_added: -1 });

        res.json({ success: true, data: items });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update an item (Title, Visibility, Description)
router.patch("/:id", verifyToken, async (req, res) => {
    try {
        const { title, visibility, description } = req.body;
        const item = await Library.findById(req.params.id);

        if (!item) return res.status(404).json({ success: false, message: "Item not found" });
        if (item.user_id.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        if (title) item.title = title;
        if (visibility) item.visibility = visibility;
        if (description) item.description = description;

        await item.save();
        res.json({ success: true, data: item });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete an item
router.delete("/:id", verifyToken, async (req, res) => {
    try {
        console.log(`[DELETE] Library Item ID: ${req.params.id} for User: ${req.user.id}`);
        const item = await Library.findById(req.params.id);

        if (!item) {
            return res.status(404).json({ success: false, message: "Item not found" });
        }

        if (item.user_id.toString() !== req.user.id.toString()) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        await item.deleteOne();
        res.json({ success: true, message: "Item deleted successfully" });
    } catch (error) {
        console.error("Library delete error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

export default router;

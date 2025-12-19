import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import Library from "../models/library.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import User from "../models/user.js";

const router = express.Router();

// Ensure uploads/library folder exists
const uploadDir = path.resolve("uploads/library");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer config for library assets
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, "lib-" + uniqueSuffix + path.extname(file.originalname));
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = [".pdf", ".doc", ".docx", ".txt", ".mp4", ".webm", ".png", ".jpg", ".jpeg"];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error("Invalid file type"));
        }
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
            fileUrl = `${req.protocol}://${req.get("host")}/uploads/library/${req.file.filename}`;
            fileSize = req.file.size;
            fileExt = path.extname(req.file.originalname).toLowerCase();
        } else if (type === "Note") {
            // Notes might not have a physical file, or they could be text files
            // For simplicity, we just save the description as the note content if no file is provided
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
            $or: [{ user_id: userId }, { visibility: "Public" }],
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
            console.warn(`Library item ${req.params.id} not found`);
            return res.status(404).json({ success: false, message: "Item not found" });
        }

        // Use toString() for reliable ID comparison
        if (item.user_id.toString() !== req.user.id.toString()) {
            console.warn(`User ${req.user.id} unauthorized to delete item ${req.params.id} owned by ${item.user_id}`);
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        // Optionally delete the physical file if it exists
        if (item.file_url) {
            try {
                const filename = item.file_url.split("/").pop();
                const filePath = path.join(uploadDir, filename);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (fileErr) {
                console.error("Error deleting physical file:", fileErr);
            }
        }

        await item.deleteOne();
        console.log(`Library item ${req.params.id} deleted successfully`);
        res.json({ success: true, message: "Item deleted successfully" });
    } catch (error) {
        console.error("Library delete error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

export default router;

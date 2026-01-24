
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const frontendPath = path.join(__dirname, "../frontend");
console.log("Resolved Frontend Path:", frontendPath);

try {
    const index = path.join(frontendPath, "index.html");
    if (fs.existsSync(index)) {
        console.log("index.html found at:", index);
    } else {
        console.error("index.html NOT found at:", index);
    }

    const getstarted = path.join(frontendPath, "getstarted.html");
    if (fs.existsSync(getstarted)) {
        console.log("getstarted.html found at:", getstarted);
    } else {
        console.error("getstarted.html NOT found at:", getstarted);
    }
} catch (error) {
    console.error("Error accessing files:", error);
}

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

import ErrorLog from './models/ErrorLog.js';

async function checkErrors() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const latestErrors = await ErrorLog.find().sort({ timestamp: -1 }).limit(20);
        console.log(`Latest ${latestErrors.length} Errors:`);
        latestErrors.forEach((err, i) => {
            console.log(`--- Error ${i + 1} ---`);
            console.log(`Time: ${err.timestamp}`);
            console.log(`Message: ${err.errorMessage}`);
            console.log(`Type: ${err.errorType}`);
        });

        await mongoose.disconnect();
    } catch (err) {
        console.error('Failed to check errors:', err);
    }
}

checkErrors();

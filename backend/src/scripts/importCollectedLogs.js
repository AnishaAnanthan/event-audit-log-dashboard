import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import { importCollectedLogFiles } from "../services/logFileImport.service.js";

dotenv.config();

const run = async () => {
  try {
    await connectDB();
    const result = await importCollectedLogFiles({ clearExistingImported: false });
    console.log("Import completed:");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Import failed:", error?.message || error);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

run();

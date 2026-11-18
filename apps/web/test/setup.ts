import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Each test worker gets its own data folder, so parallel test files never share a store file.
process.env.POTTED_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "potted-test-"));

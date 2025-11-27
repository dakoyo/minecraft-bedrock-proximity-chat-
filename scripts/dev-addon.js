const chokidar = require('chokidar');
const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config();

const BP_SRC_DIR = path.join(__dirname, '../apps/addon/BP');
const RP_SRC_DIR = path.join(__dirname, '../apps/addon/RP');

const MC_ADDON_BP_PATH = process.env.MC_ADDON_BP_PATH;
const MC_ADDON_RP_PATH = process.env.MC_ADDON_RP_PATH;

if (!MC_ADDON_BP_PATH) {
    console.error('Error: MC_ADDON_BP_PATH is not defined in .env');
    process.exit(1);
}
if (!MC_ADDON_RP_PATH) {
    console.error('Error: MC_ADDON_RP_PATH is not defined in .env');
    process.exit(1);
}

console.log(`Target BP Path: ${MC_ADDON_BP_PATH}`);
console.log(`Target RP Path: ${MC_ADDON_RP_PATH}`);

// --- Behavior Pack Handling ---

// 1. Start TypeScript Compiler in Watch Mode for BP
const tscProcess = spawn('npx', ['tsc', '-w', '-p', path.join(BP_SRC_DIR, 'tsconfig.json')], {
    stdio: 'inherit',
    shell: true
});

tscProcess.on('error', (err) => {
    console.error('Failed to start tsc for BP:', err);
});

// 2. Watch and Copy BP Files
const bpWatcher = chokidar.watch(BP_SRC_DIR, {
    ignored: [
        /(^|[\/\\])\../, // ignore dotfiles
        '**/node_modules/**',
        '**/*.ts', // ignore ts files (they are compiled to js)
        '**/tsconfig.json' // ignore tsconfig
    ],
    persistent: true
});

async function copyFile(filePath, srcDir, targetDir) {
    const relativePath = path.relative(srcDir, filePath);
    const targetPath = path.join(targetDir, relativePath);

    try {
        await fs.copy(filePath, targetPath);
        console.log(`[${path.basename(srcDir)}] Copied: ${relativePath}`);
    } catch (err) {
        console.error(`[${path.basename(srcDir)}] Error copying ${relativePath}:`, err);
    }
}

async function removeFile(filePath, srcDir, targetDir) {
    const relativePath = path.relative(srcDir, filePath);
    const targetPath = path.join(targetDir, relativePath);
    try {
        await fs.remove(targetPath);
        console.log(`[${path.basename(srcDir)}] Removed: ${relativePath}`);
    } catch (err) {
        console.error(`[${path.basename(srcDir)}] Error removing ${relativePath}:`, err);
    }
}

bpWatcher
    .on('add', path => copyFile(path, BP_SRC_DIR, MC_ADDON_BP_PATH))
    .on('change', path => copyFile(path, BP_SRC_DIR, MC_ADDON_BP_PATH))
    .on('unlink', path => removeFile(path, BP_SRC_DIR, MC_ADDON_BP_PATH));

console.log(`Watching for changes in BP: ${BP_SRC_DIR}...`);

// --- Resource Pack Handling ---

// 3. Watch and Copy RP Files
const rpWatcher = chokidar.watch(RP_SRC_DIR, {
    ignored: [
        /(^|[\/\\])\../, // ignore dotfiles
        '**/node_modules/**'
    ],
    persistent: true
});

rpWatcher
    .on('add', path => copyFile(path, RP_SRC_DIR, MC_ADDON_RP_PATH))
    .on('change', path => copyFile(path, RP_SRC_DIR, MC_ADDON_RP_PATH))
    .on('unlink', path => removeFile(path, RP_SRC_DIR, MC_ADDON_RP_PATH));

console.log(`Watching for changes in RP: ${RP_SRC_DIR}...`);

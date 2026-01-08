/**
 * PWA Icon Generator Script
 * Generates PNG icons from the SVG icon for PWA manifest
 *
 * Run: node scripts/generate-icons.js
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ICONS_DIR = path.join(__dirname, '../frontend/icons');
const SVG_PATH = path.join(ICONS_DIR, 'icon.svg');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

async function generateIcons() {
    console.log('Generating PWA icons...\n');

    // Check if SVG exists
    if (!fs.existsSync(SVG_PATH)) {
        console.error('Error: icon.svg not found at', SVG_PATH);
        process.exit(1);
    }

    const svgBuffer = fs.readFileSync(SVG_PATH);

    for (const size of sizes) {
        const outputPath = path.join(ICONS_DIR, `icon-${size}.png`);

        try {
            await sharp(svgBuffer)
                .resize(size, size)
                .png()
                .toFile(outputPath);

            console.log(`  Created: icon-${size}.png`);
        } catch (error) {
            console.error(`  Error creating icon-${size}.png:`, error.message);
        }
    }

    console.log('\nDone! Icons generated in frontend/icons/');
    console.log('\nMake sure to update manifest.json if needed.');
}

generateIcons().catch(console.error);

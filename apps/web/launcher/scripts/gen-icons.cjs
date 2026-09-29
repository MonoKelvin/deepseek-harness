const sharp = require('E:/work/code/deepseek-harness/node_modules/.pnpm/sharp@0.35.3_@types+node@22.20.0/node_modules/sharp');
const fs = require('fs');
const path = require('path');

const base = 'E:/work/code/deepseek-harness/apps/web/launcher';
const sizes = [16, 24, 32, 48, 64, 80, 96, 128, 256, 384, 512];
const svg = fs.readFileSync(path.join(base, 'src-tauri/icons/icon.svg'));

async function generate() {
  for (const s of sizes) {
    await sharp(svg).resize(s, s).png().toFile(path.join(base, 'src-tauri/icons/icon-' + s + '.png'));
    console.log('Generated icon-' + s + '.png');
  }
  await sharp(path.join(base, 'src-tauri/icons/icon-256.png')).toFile(path.join(base, 'src-tauri/icons/icon.ico'));
  console.log('Generated icon.ico');
}

generate().catch(e => { console.error(e); process.exit(1); });

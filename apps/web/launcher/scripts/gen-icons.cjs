#!/usr/bin/env node
/**
 * Generate launcher app icons: a smooth rounded-rectangle (squircle) plate in a
 * solid color with an input image centered on top, exported at every icon size.
 *
 * The corners use Figma-style corner smoothing: the straight edge flows into the
 * corner through cubic Beziers before a short arc, giving curvature-continuous
 * ("D1" smooth) corners instead of a circular arc tangent to the edge. Algorithm
 * ported from figma-squircle (MIT), see https://github.com/phamfoo/figma-squircle
 * and https://www.figma.com/blog/desperately-seeking-squircles/.
 *
 * Usage:
 *   node gen-icons.cjs [options]
 *
 * Options (single dash, space-separated value; the value after a flag is always
 * consumed so negative offsets like `-x -10` work):
 *   -src <path>       Source image, default public/appicon-dsh-girl.png
 *   -size <px>        Master canvas size; radius/x/y are in this space. Default 512
 *   -radius <px>      Corner radius in master-size pixels. Default round(size*0.2237)
 *   -smoothing <0..1> Corner smoothing amount (0 = plain rounded rect). Default 0.6
 *   -x <px>           Horizontal image offset from center (right positive). Default 0
 *   -y <px>           Vertical image offset from center (down positive). Default 0
 *   -scale <0..1>     Image size as a fraction of the canvas. Default 1
 *   -bgcolor <color>  Squircle fill color (any CSS/SVG color). Default #ffffff
 *   -out <dir>        Output directory, default the launcher public/ directory
 *
 * Example:
 *   node gen-icons.cjs -size 512 -radius 48 -x -10 -y 20 -bgcolor '#fff'
 */
const fs = require('fs');
const path = require('path');

const sharp = resolveSharp();

const LAUNCHER_ROOT = path.resolve(__dirname, '..');
// Standalone PNGs actually referenced: 32 (HTML favicon) and 512 (Tauri PNG
// master). Other Windows sizes live inside appicon.ico, not as loose files.
const ICON_SIZES = [32, 512];

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const master = await renderMaster(opts);
  fs.mkdirSync(opts.out, { recursive: true });

  for (const s of ICON_SIZES.filter((size) => size <= opts.size)) {
    const file = path.join(opts.out, `appicon-${s}.png`);
    await sharp(master).resize(s, s).png().toFile(file);
    console.log('Generated', path.relative(LAUNCHER_ROOT, file));
  }

  const icoFile = path.join(opts.out, 'appicon.ico');
  await writeIco(master, [32, 64, 128, 256].filter((s) => s <= opts.size), icoFile);
  console.log('Generated', path.relative(LAUNCHER_ROOT, icoFile));
}

/**
 * Assemble a real multi-resolution ICO container that embeds one PNG per size.
 * sharp cannot encode ICO, and writing PNG bytes to a `.ico` file yields a file
 * the Windows/Tauri icon loader rejects, so build the container by hand: a 6-byte
 * header, one 16-byte directory entry per image, then the PNG payloads.
 */
async function writeIco(master, sizes, outFile) {
  const images = [];
  for (const size of sizes) {
    images.push({ size, png: await sharp(master).resize(size, size).png().toBuffer() });
  }

  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // image type: icon
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(images.length * 16);
  let offset = header.length + directory.length;
  images.forEach((image, i) => {
    const entry = i * 16;
    // A 256px image is encoded as 0 in the single-byte width/height fields.
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, entry);
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, entry + 1);
    directory.writeUInt16LE(1, entry + 4); // color planes
    directory.writeUInt16LE(32, entry + 6); // bits per pixel
    directory.writeUInt32LE(image.png.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += image.png.length;
  });

  fs.writeFileSync(outFile, Buffer.concat([header, directory, ...images.map((image) => image.png)]));
}

/**
 * Compose the squircle plate and the source image into one master PNG buffer at
 * `size`x`size`, clipped to the squircle so nothing bleeds past its corners.
 */
async function renderMaster({ src, size, radius, smoothing, x, y, scale, bgcolor }) {
  const pathData = squirclePath(size, radius, smoothing);
  const plate = svgBuffer(size, pathData, bgcolor);
  const mask = svgBuffer(size, pathData, '#ffffff');

  const imageSize = Math.round(size * scale);
  const image = await sharp(src)
    .resize(imageSize, imageSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const offset = Math.round((size - imageSize) / 2);
  const composed = await sharp(plate)
    .composite([{ input: image, left: offset + x, top: offset + y }])
    .png()
    .toBuffer();

  return sharp(composed)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

function svgBuffer(size, pathData, fill) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      `<path d="${pathData}" fill="${fill}"/></svg>`,
  );
}

/** Build the squircle outline path for a `size`x`size` box with equal corners. */
function squirclePath(size, radius, smoothing) {
  const budget = size / 2;
  const cornerRadius = Math.min(radius, budget);
  const pp = cornerParams(cornerRadius, smoothing, budget);
  const n = (v) => v.toFixed(4);
  return (
    `M ${n(size - pp.p)} 0 ` +
    drawTopRight(pp, n) +
    `L ${n(size)} ${n(size - pp.p)} ` +
    drawBottomRight(pp, n) +
    `L ${n(pp.p)} ${n(size)} ` +
    drawBottomLeft(pp, n) +
    `L 0 ${n(pp.p)} ` +
    drawTopLeft(pp, n) +
    'Z'
  );
}

function cornerParams(cornerRadius, cornerSmoothing, roundingAndSmoothingBudget) {
  let smoothing = cornerSmoothing;
  let p = (1 + smoothing) * cornerRadius;
  const maxSmoothing = roundingAndSmoothingBudget / cornerRadius - 1;
  smoothing = Math.min(smoothing, maxSmoothing);
  p = Math.min(p, roundingAndSmoothingBudget);

  const arcMeasure = 90 * (1 - smoothing);
  const arcSectionLength = Math.sin(toRadians(arcMeasure / 2)) * cornerRadius * Math.sqrt(2);
  const angleAlpha = (90 - arcMeasure) / 2;
  const p3ToP4Distance = cornerRadius * Math.tan(toRadians(angleAlpha / 2));
  const angleBeta = 45 * smoothing;
  const c = p3ToP4Distance * Math.cos(toRadians(angleBeta));
  const d = c * Math.tan(toRadians(angleBeta));
  const b = (p - arcSectionLength - c - d) / 3;
  const a = 2 * b;

  return { a, b, c, d, p, arcSectionLength, cornerRadius };
}

function drawTopRight({ a, b, c, d, arcSectionLength, cornerRadius }, n) {
  return (
    `c ${n(a)} 0 ${n(a + b)} 0 ${n(a + b + c)} ${n(d)} ` +
    `a ${n(cornerRadius)} ${n(cornerRadius)} 0 0 1 ${n(arcSectionLength)} ${n(arcSectionLength)} ` +
    `c ${n(d)} ${n(c)} ${n(d)} ${n(b + c)} ${n(d)} ${n(a + b + c)} `
  );
}

function drawBottomRight({ a, b, c, d, arcSectionLength, cornerRadius }, n) {
  return (
    `c 0 ${n(a)} 0 ${n(a + b)} ${n(-d)} ${n(a + b + c)} ` +
    `a ${n(cornerRadius)} ${n(cornerRadius)} 0 0 1 ${n(-arcSectionLength)} ${n(arcSectionLength)} ` +
    `c ${n(-c)} ${n(d)} ${n(-(b + c))} ${n(d)} ${n(-(a + b + c))} ${n(d)} `
  );
}

function drawBottomLeft({ a, b, c, d, arcSectionLength, cornerRadius }, n) {
  return (
    `c ${n(-a)} 0 ${n(-(a + b))} 0 ${n(-(a + b + c))} ${n(-d)} ` +
    `a ${n(cornerRadius)} ${n(cornerRadius)} 0 0 1 ${n(-arcSectionLength)} ${n(-arcSectionLength)} ` +
    `c ${n(-d)} ${n(-c)} ${n(-d)} ${n(-(b + c))} ${n(-d)} ${n(-(a + b + c))} `
  );
}

function drawTopLeft({ a, b, c, d, arcSectionLength, cornerRadius }, n) {
  return (
    `c 0 ${n(-a)} 0 ${n(-(a + b))} ${n(d)} ${n(-(a + b + c))} ` +
    `a ${n(cornerRadius)} ${n(cornerRadius)} 0 0 1 ${n(arcSectionLength)} ${n(-arcSectionLength)} ` +
    `c ${n(c)} ${n(-d)} ${n(b + c)} ${n(-d)} ${n(a + b + c)} ${n(-d)} `
  );
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function parseArgs(argv) {
  const raw = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('-')) {
      raw[token.slice(1)] = argv[i + 1];
      i += 1;
    }
  }

  const size = num(raw.size, 512);
  return {
    src: raw.src ? path.resolve(raw.src) : path.join(LAUNCHER_ROOT, 'public/appicon-dsh-girl.png'),
    size,
    radius: num(raw.radius, Math.round(size * 0.2237)),
    smoothing: num(raw.smoothing, 0.6),
    x: Math.round(num(raw.x, 0)),
    y: Math.round(num(raw.y, 0)),
    scale: num(raw.scale, 1),
    bgcolor: raw.bgcolor ?? '#ffffff',
    out: raw.out ? path.resolve(raw.out) : path.join(LAUNCHER_ROOT, 'public'),
  };
}

function num(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) throw new Error(`Expected a number but got "${value}"`);
  return parsed;
}

/**
 * Resolve `sharp` even though it is a hoisted transitive dependency rather than a
 * direct one: try the normal resolver first, then the pnpm virtual store found by
 * walking up to the repository root.
 */
function resolveSharp() {
  try {
    return require('sharp');
  } catch {
    let dir = __dirname;
    while (true) {
      const store = path.join(dir, 'node_modules/.pnpm');
      if (fs.existsSync(store)) {
        const entry = fs.readdirSync(store).find((name) => name.startsWith('sharp@'));
        if (entry) return require(path.join(store, entry, 'node_modules/sharp'));
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    throw new Error('Could not resolve the "sharp" module from ' + __dirname);
  }
}

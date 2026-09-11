const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 implementation for PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);

  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(body), 0);

  return Buffer.concat([len, body, crcBuf]);
}

function createPngBuffer(width, height, getPixel) {
  // Signature
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR Chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bit depth
  ihdr[9] = 6; // Color type 6: RGBA
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);

  // IDAT Chunk - raw scanlines with 0 filter byte at start of each line
  const rawData = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;

  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter 0
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y, width, height);
      rawData[offset++] = r;
      rawData[offset++] = g;
      rawData[offset++] = b;
      rawData[offset++] = a;
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressedData);

  // IEND Chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Generate eFootball Icon Pixel Generator
function drawEFootballIcon(x, y, size, isMaskable = false) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * (isMaskable ? 0.42 : 0.46);

  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Background color: Emerald Green (#0B3323 -> 11, 51, 35)
  let r = 11;
  let g = 51;
  let b = 35;
  let a = 255;

  // Outer Circle / Rounded boundary for non-maskable
  if (!isMaskable && dist > radius) {
    return [0, 0, 0, 0]; // Transparent outside circle for normal icon
  }

  // Gold Inner Accent Ring (#F59E0B -> 245, 158, 11)
  const innerRadius = radius * 0.85;
  const ringWidth = size * 0.035;
  if (Math.abs(dist - innerRadius) < ringWidth / 2) {
    return [245, 158, 11, 255];
  }

  // Central Trophy / Ball Symbol (Simplified geometric trophy shape)
  const normY = dy / (size * 0.3);
  const normX = dx / (size * 0.3);

  // Trophy Cup Top
  if (normY > -0.6 && normY < 0.1) {
    const bowlX = Math.sqrt(Math.max(0, 0.45 - (normY + 0.2) * (normY + 0.2)));
    if (Math.abs(normX) <= bowlX) {
      // Golden Gradient (#FBBF24)
      return [251, 191, 36, 255];
    }
  }

  // Trophy Stem
  if (normY >= 0.1 && normY <= 0.45) {
    if (Math.abs(normX) <= 0.08) {
      return [245, 158, 11, 255];
    }
  }

  // Trophy Base
  if (normY > 0.45 && normY <= 0.65) {
    const baseW = 0.2 + (normY - 0.45) * 0.5;
    if (Math.abs(normX) <= baseW) {
      return [251, 191, 36, 255];
    }
  }

  // Star above trophy
  if (normY >= -0.85 && normY <= -0.65 && Math.abs(normX) <= 0.1) {
    return [255, 255, 255, 255];
  }

  return [r, g, b, a];
}

// Target output directory
const outputDir = path.join(__dirname, '..', 'public', 'icons');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('Generating PWA Icons...');

// Generate 192x192
const buf192 = createPngBuffer(192, 192, (x, y) => drawEFootballIcon(x, y, 192, false));
fs.writeFileSync(path.join(outputDir, 'icon-192x192.png'), buf192);
console.log('Created public/icons/icon-192x192.png');

// Generate 512x512
const buf512 = createPngBuffer(512, 512, (x, y) => drawEFootballIcon(x, y, 512, false));
fs.writeFileSync(path.join(outputDir, 'icon-512x512.png'), buf512);
console.log('Created public/icons/icon-512x512.png');

// Generate Maskable 512x512
const bufMaskable = createPngBuffer(512, 512, (x, y) => drawEFootballIcon(x, y, 512, true));
fs.writeFileSync(path.join(outputDir, 'icon-maskable.png'), bufMaskable);
console.log('Created public/icons/icon-maskable.png');

// Generate Apple Touch Icon 180x180
const bufApple = createPngBuffer(180, 180, (x, y) => drawEFootballIcon(x, y, 180, true));
fs.writeFileSync(path.join(outputDir, 'apple-touch-icon.png'), bufApple);
console.log('Created public/icons/apple-touch-icon.png');

console.log('All PWA Icons successfully generated!');

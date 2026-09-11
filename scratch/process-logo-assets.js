const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const elogoDir = path.join(__dirname, '..', 'elogo');
const publicLogosDir = path.join(__dirname, '..', 'public', 'logos');
const publicIconsDir = path.join(__dirname, '..', 'public', 'icons');

if (!fs.existsSync(publicLogosDir)) {
  fs.mkdirSync(publicLogosDir, { recursive: true });
}
if (!fs.existsSync(publicIconsDir)) {
  fs.mkdirSync(publicIconsDir, { recursive: true });
}

console.log('Processing official logo assets from /elogo...');

// 1. Copy master logo files to public/logos/
const filesToCopy = [
  { src: 'efootball-logo-title-dark-green-black-white-background-transparent.png', dest: 'logo-header-light.png' },
  { src: 'efootball-logo-title-dark-green-black-white-background.png', dest: 'logo-header-light-solid.png' },
  { src: 'efootball-logo-title-white-dark-green-transparent.png', dest: 'logo-header-dark.png' },
  { src: 'efootball-logo-title-white-dark-green.png', dest: 'logo-header-dark-solid.png' },
  { src: 'logo-mark-transparent.png', dest: 'logo-mark-transparent.png' },
  { src: 'logo-mark.png', dest: 'logo-mark.png' },
  { src: 'efootball-tournament-green-text.png', dest: 'logo-text-green.png' },
];

filesToCopy.forEach(({ src, dest }) => {
  const srcPath = path.join(elogoDir, src);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, path.join(publicLogosDir, dest));
    console.log(`Copied public/logos/${dest}`);
  } else {
    console.warn(`Warning: Source file ${src} not found in /elogo`);
  }
});

// PNG Helper functions for decoding RGBA PNG and resizing cleanly
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

function decodePng(filePath) {
  const buf = fs.readFileSync(filePath);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const colorType = buf[25];

  let pos = 8;
  const idatChunks = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.subarray(pos + 4, pos + 8).toString('ascii');
    if (type === 'IDAT') idatChunks.push(buf.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const idat = Buffer.concat(idatChunks);
  const raw = zlib.inflateSync(idat);

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const stride = 1 + w * bytesPerPixel;

  const pixels = Buffer.alloc(w * h * 4);
  let prevRow = Buffer.alloc(w * bytesPerPixel);

  for (let y = 0; y < h; y++) {
    const filter = raw[y * stride];
    const currentRow = Buffer.alloc(w * bytesPerPixel);
    const rawRow = raw.subarray(y * stride + 1, (y + 1) * stride);

    for (let x = 0; x < w * bytesPerPixel; x++) {
      const a = x >= bytesPerPixel ? currentRow[x - bytesPerPixel] : 0;
      const b = prevRow[x];
      const c = x >= bytesPerPixel ? prevRow[x - bytesPerPixel] : 0;

      let val = rawRow[x];
      if (filter === 1) val = (val + a) & 0xff;
      else if (filter === 2) val = (val + b) & 0xff;
      else if (filter === 3) val = (val + Math.floor((a + b) / 2)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        let pr = c;
        if (pa <= pb && pa <= pc) pr = a;
        else if (pb <= pc) pr = b;
        val = (val + pr) & 0xff;
      }
      currentRow[x] = val;
    }

    for (let x = 0; x < w; x++) {
      const outIdx = (y * w + x) * 4;
      const inIdx = x * bytesPerPixel;
      pixels[outIdx] = currentRow[inIdx];
      pixels[outIdx + 1] = currentRow[inIdx + 1];
      pixels[outIdx + 2] = currentRow[inIdx + 2];
      pixels[outIdx + 3] = bytesPerPixel === 4 ? currentRow[inIdx + 3] : 255;
    }
    prevRow = currentRow;
  }
  return { w, h, pixels };
}

function resizePng(srcPngObj, newW, newH, innerPaddingRatio = 0) {
  const { w: srcW, h: srcH, pixels: srcPixels } = srcPngObj;
  const outPixels = Buffer.alloc(newW * newH * 4);

  const padding = Math.floor(newW * innerPaddingRatio);
  const targetW = newW - padding * 2;
  const targetH = newH - padding * 2;

  for (let destY = 0; destY < newH; destY++) {
    for (let destX = 0; destX < newW; destX++) {
      const destIdx = (destY * newW + destX) * 4;

      if (
        innerPaddingRatio > 0 &&
        (destX < padding || destX >= newW - padding || destY < padding || destY >= newH - padding)
      ) {
        outPixels[destIdx] = 0;
        outPixels[destIdx + 1] = 0;
        outPixels[destIdx + 2] = 0;
        outPixels[destIdx + 3] = 0;
        continue;
      }

      const innerX = destX - padding;
      const innerY = destY - padding;

      const srcX = Math.min(srcW - 1, Math.floor((innerX / targetW) * srcW));
      const srcY = Math.min(srcH - 1, Math.floor((innerY / targetH) * srcH));

      const srcIdx = (srcY * srcW + srcX) * 4;

      outPixels[destIdx] = srcPixels[srcIdx];
      outPixels[destIdx + 1] = srcPixels[srcIdx + 1];
      outPixels[destIdx + 2] = srcPixels[srcIdx + 2];
      outPixels[destIdx + 3] = srcPixels[srcIdx + 3];
    }
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(newW, 0);
  ihdr.writeUInt32BE(newH, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const ihdrChunk = makeChunk('IHDR', ihdr);

  const rawData = Buffer.alloc(newH * (1 + newW * 4));
  let offset = 0;
  for (let y = 0; y < newH; y++) {
    rawData[offset++] = 0;
    for (let x = 0; x < newW; x++) {
      const idx = (y * newW + x) * 4;
      rawData[offset++] = outPixels[idx];
      rawData[offset++] = outPixels[idx + 1];
      rawData[offset++] = outPixels[idx + 2];
      rawData[offset++] = outPixels[idx + 3];
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Generate PWA and Favicon assets from logo-mark-transparent.png
const logoMarkSrc = path.join(elogoDir, 'logo-mark-transparent.png');
if (fs.existsSync(logoMarkSrc)) {
  console.log('Resizing PWA & Favicon assets from logo-mark-transparent.png...');
  const markObj = decodePng(logoMarkSrc);

  const buf192 = resizePng(markObj, 192, 192, 0);
  fs.writeFileSync(path.join(publicIconsDir, 'icon-192x192.png'), buf192);
  console.log('Created public/icons/icon-192x192.png');

  const buf512 = resizePng(markObj, 512, 512, 0);
  fs.writeFileSync(path.join(publicIconsDir, 'icon-512x512.png'), buf512);
  console.log('Created public/icons/icon-512x512.png');

  const bufMaskable = resizePng(markObj, 512, 512, 0.1); // 10% safe zone padding
  fs.writeFileSync(path.join(publicIconsDir, 'icon-maskable.png'), bufMaskable);
  console.log('Created public/icons/icon-maskable.png');

  const bufApple = resizePng(markObj, 180, 180, 0);
  fs.writeFileSync(path.join(publicIconsDir, 'apple-touch-icon.png'), bufApple);
  console.log('Created public/icons/apple-touch-icon.png');

  const bufFavicon = resizePng(markObj, 32, 32, 0);
  fs.writeFileSync(path.join(publicIconsDir, 'favicon-32x32.png'), bufFavicon);
  console.log('Created public/icons/favicon-32x32.png');
}

console.log('Logo asset processing completed successfully!');

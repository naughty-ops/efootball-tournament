const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function optimizeImages() {
  const images = [
    { src: 'public/images/banner1.jpg', webp: 'public/images/banner1.webp', jpg: 'public/images/banner1.jpg' },
    { src: 'public/images/banner2.jpg', webp: 'public/images/banner2.webp', jpg: 'public/images/banner2.jpg' },
    { src: 'public/images/banner3.jpg', webp: 'public/images/banner3.webp', jpg: 'public/images/banner3.jpg' },
    { src: 'public/images/banners/efootball-stadium.jpg', webp: 'public/images/banners/efootball-stadium.webp', jpg: 'public/images/banners/efootball-stadium.jpg' },
    { src: 'public/images/banners/efootball-championship.jpg', webp: 'public/images/banners/efootball-championship.webp', jpg: 'public/images/banners/efootball-championship.jpg' },
  ];

  console.log('=== OPTIMIZING BANNER IMAGES ===');
  const results = [];

  for (const img of images) {
    const inputBuf = fs.readFileSync(img.src);
    const origSize = inputBuf.length;

    // 1. Generate WebP (quality 82, effort 6)
    const webpBuf = await sharp(inputBuf)
      .webp({ quality: 82, effort: 6 })
      .toBuffer();
    fs.writeFileSync(img.webp, webpBuf);

    // 2. Also re-compress the JPEG in-place (quality 82, mozjpeg: true)
    const jpgBuf = await sharp(inputBuf)
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    fs.writeFileSync(img.jpg, jpgBuf);

    results.push({
      file: img.src,
      originalKB: (origSize / 1024).toFixed(1),
      webpKB: (webpBuf.length / 1024).toFixed(1),
      optimizedJpgKB: (jpgBuf.length / 1024).toFixed(1),
      reductionPct: (((origSize - webpBuf.length) / origSize) * 100).toFixed(1) + '%',
    });
  }

  console.table(results);

  console.log('\n=== OPTIMIZING LOGO ===');
  const logoPath = 'public/logos/logo-mark-transparent.png';
  const logoInputBuf = fs.readFileSync(logoPath);
  const logoOrigSize = logoInputBuf.length;

  // Resize to 512x512 high density PNG
  const logoBuf = await sharp(logoInputBuf)
    .resize(512, 512, { fit: 'contain' })
    .png({ compressionLevel: 9 })
    .toBuffer();
  fs.writeFileSync(logoPath, logoBuf);

  // Also create WebP version
  const logoWebpBuf = await sharp(logoInputBuf)
    .resize(512, 512, { fit: 'contain' })
    .webp({ quality: 90, effort: 6 })
    .toBuffer();
  fs.writeFileSync('public/logos/logo-mark-transparent.webp', logoWebpBuf);

  console.table([{
    logo: logoPath,
    originalKB: (logoOrigSize / 1024).toFixed(1),
    optimizedPngKB: (logoBuf.length / 1024).toFixed(1),
    webpKB: (logoWebpBuf.length / 1024).toFixed(1),
    reductionPct: (((logoOrigSize - logoBuf.length) / logoOrigSize) * 100).toFixed(1) + '%',
  }]);
}

optimizeImages().catch(console.error);

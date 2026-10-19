import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

async function generateIcons() {
  const iconSvg = fs.readFileSync(path.resolve('public/icon.svg'));
  const maskableSvg = fs.readFileSync(path.resolve('public/icon-maskable.svg'));

  // 1. pwa-192x192.png
  await sharp(iconSvg)
    .resize(192, 192)
    .png()
    .toFile(path.resolve('public/pwa-192x192.png'));
  console.log('✓ Created public/pwa-192x192.png');

  // 2. pwa-512x512.png
  await sharp(iconSvg)
    .resize(512, 512)
    .png()
    .toFile(path.resolve('public/pwa-512x512.png'));
  console.log('✓ Created public/pwa-512x512.png');

  // 3. pwa-maskable-512x512.png
  await sharp(maskableSvg)
    .resize(512, 512)
    .png()
    .toFile(path.resolve('public/pwa-maskable-512x512.png'));
  console.log('✓ Created public/pwa-maskable-512x512.png');

  // 4. apple-touch-icon.png (180x180)
  await sharp(iconSvg)
    .resize(180, 180)
    .png()
    .toFile(path.resolve('public/apple-touch-icon.png'));
  console.log('✓ Created public/apple-touch-icon.png');

  // 5. favicon.ico / favicon.png
  await sharp(iconSvg)
    .resize(32, 32)
    .png()
    .toFile(path.resolve('public/favicon.ico'));
  console.log('✓ Created public/favicon.ico');
}

generateIcons().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});

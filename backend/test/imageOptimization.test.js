const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const {
  detectedImageMime,
  optimizeImage,
} = require('../src/utils/imageOptimization');

async function samplePng(width = 3200, height = 1800) {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 30, g: 120, b: 200, alpha: 1 },
    },
  }).png().toBuffer();
}

test('event media is resized, re-encoded to WebP, and bounded by policy', async () => {
  const source = await samplePng();
  const result = await optimizeImage({
    buffer: source,
    declaredMimeType: 'image/png',
    purpose: 'event_media',
  });
  const metadata = await sharp(result.buffer).metadata();

  assert.equal(result.contentType, 'image/webp');
  assert.equal(result.extension, '.webp');
  assert.equal(detectedImageMime(result.buffer), 'image/webp');
  assert.ok(metadata.width <= 2560);
  assert.ok(metadata.height <= 2560);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
  assert.equal(result.sourceSizeBytes, source.length);
  assert.equal(result.sizeBytes, result.buffer.length);
});

test('payment QR remains PNG to preserve hard edges', async () => {
  const source = await samplePng(800, 800);
  const result = await optimizeImage({
    buffer: source,
    declaredMimeType: 'image/png',
    purpose: 'payment_qr',
  });

  assert.equal(result.contentType, 'image/png');
  assert.equal(detectedImageMime(result.buffer), 'image/png');
});

test('image upload rejects declared MIME that does not match magic bytes', async () => {
  const source = await samplePng(100, 100);
  await assert.rejects(
    optimizeImage({ buffer: source, declaredMimeType: 'image/jpeg', purpose: 'avatar' }),
    (error) => error.code === 'IMAGE_SIGNATURE_INVALID' && error.statusCode === 400
  );
});

test('image upload rejects non-image payloads', async () => {
  await assert.rejects(
    optimizeImage({
      buffer: Buffer.from('<script>alert(1)</script>'),
      declaredMimeType: 'image/png',
      purpose: 'payment_slip',
    }),
    (error) => error.code === 'IMAGE_SIGNATURE_INVALID'
  );
});

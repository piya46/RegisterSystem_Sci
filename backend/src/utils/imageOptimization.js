const sharp = require('sharp');

const PURPOSE_POLICIES = Object.freeze({
  event_media: Object.freeze({ maxSourceBytes: 5 * 1024 * 1024, width: 2560, height: 2560, format: 'webp', quality: 82 }),
  payment_qr: Object.freeze({ maxSourceBytes: 5 * 1024 * 1024, width: 1600, height: 1600, format: 'png' }),
  payment_slip: Object.freeze({ maxSourceBytes: 5 * 1024 * 1024, width: 2000, height: 2000, format: 'webp', quality: 88 }),
  avatar: Object.freeze({ maxSourceBytes: 2 * 1024 * 1024, width: 512, height: 512, format: 'webp', quality: 80 }),
});

function detectedImageMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  const hex = buffer.subarray(0, 12).toString('hex');
  if (hex.startsWith('ffd8ff')) return 'image/jpeg';
  if (hex.startsWith('89504e470d0a1a0a')) return 'image/png';
  const gif = buffer.subarray(0, 6).toString('ascii');
  if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

function imagePolicy(purpose) {
  const policy = PURPOSE_POLICIES[purpose];
  if (!policy) {
    const error = new Error('Unsupported image purpose');
    error.code = 'IMAGE_PURPOSE_UNSUPPORTED';
    error.statusCode = 400;
    throw error;
  }
  return policy;
}

async function optimizeImage({ buffer, declaredMimeType, purpose }) {
  const policy = imagePolicy(purpose);
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    const error = new Error('ไม่พบข้อมูลไฟล์รูปภาพ');
    error.code = 'IMAGE_EMPTY';
    error.statusCode = 400;
    throw error;
  }
  if (buffer.length > policy.maxSourceBytes) {
    const error = new Error('ไฟล์รูปภาพมีขนาดใหญ่เกินกำหนด');
    error.code = 'IMAGE_TOO_LARGE';
    error.statusCode = 413;
    throw error;
  }
  const detectedMimeType = detectedImageMime(buffer);
  if (!detectedMimeType || detectedMimeType !== declaredMimeType) {
    const error = new Error('ชนิดไฟล์รูปภาพไม่ตรงกับข้อมูลภายในไฟล์');
    error.code = 'IMAGE_SIGNATURE_INVALID';
    error.statusCode = 400;
    throw error;
  }

  try {
    let pipeline = sharp(buffer, {
      animated: false,
      failOn: 'error',
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .resize({
        width: policy.width,
        height: policy.height,
        fit: 'inside',
        withoutEnlargement: true,
      });
    if (policy.format === 'png') {
      pipeline = pipeline.png({ compressionLevel: 9, palette: false });
    } else {
      pipeline = pipeline.webp({ quality: policy.quality, effort: 4, smartSubsample: true });
    }
    const output = await pipeline.toBuffer({ resolveWithObject: true });
    return {
      buffer: output.data,
      contentType: policy.format === 'png' ? 'image/png' : 'image/webp',
      extension: policy.format === 'png' ? '.png' : '.webp',
      width: output.info.width,
      height: output.info.height,
      sourceSizeBytes: buffer.length,
      sizeBytes: output.data.length,
      savedBytes: Math.max(0, buffer.length - output.data.length),
      detectedMimeType,
    };
  } catch (cause) {
    const error = new Error('ไม่สามารถประมวลผลไฟล์รูปภาพได้');
    error.code = 'IMAGE_PROCESSING_FAILED';
    error.statusCode = 400;
    error.cause = cause;
    throw error;
  }
}

module.exports = {
  PURPOSE_POLICIES,
  detectedImageMime,
  imagePolicy,
  optimizeImage,
};

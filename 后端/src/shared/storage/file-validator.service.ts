import {
  Injectable,
  PayloadTooLargeException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';

@Injectable()
export class FileValidatorService {
  // Magic byte signatures for common file types
  private readonly MAGIC_BYTES: Record<string, Uint8Array[]> = {
    'image/jpeg': [new Uint8Array([0xff, 0xd8, 0xff])],
    'image/png': [new Uint8Array([0x89, 0x50, 0x4e, 0x47])],
    'image/webp': [new Uint8Array([0x52, 0x49, 0x46, 0x46])],
    'image/gif': [new Uint8Array([0x47, 0x49, 0x46, 0x38])],
    'application/pdf': [new Uint8Array([0x25, 0x50, 0x44, 0x46])],
  };

  // Allowed image MIME types for re-encoding
  private readonly REENCODEABLE_MIMES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/tiff',
    'image/avif',
  ]);

  // Default per-org upload limit (in bytes); can be overridden per org via config
  private readonly defaultOrgUploadLimitBytes: number;

  constructor(private readonly configService: ConfigService) {
    this.defaultOrgUploadLimitBytes = this.configService.get<number>(
      'ORG_UPLOAD_LIMIT_BYTES',
      500 * 1024 * 1024,
    ); // 500 MB default
  }

  /**
   * Validate that the file's magic bytes match the declared MIME type.
   * Prevents MIME-type spoofing and polyglot attacks.
   */
  validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
    const signatures = this.MAGIC_BYTES[mimeType];
    if (!signatures) {
      return true; // unknown type, skip magic check (trust but verify externally)
    }
    if (buffer.length < 4) {
      return false; // buffer too small to contain any known magic signature
    }
    return signatures.some((sig) => sig.every((byte, i) => buffer[i] === byte));
  }

  /**
   * Re-encode an image buffer using sharp to strip EXIF/metadata
   * and prevent polyglot attacks. Returns the cleaned buffer.
   * Throws if the input is not a supported image type.
   */
  async reencodeImage(buffer: Buffer, mimeType: string): Promise<Buffer> {
    if (!this.REENCODEABLE_MIMES.has(mimeType)) {
      // Not an image type we can re-encode; return as-is
      return buffer;
    }

    try {
      const image = sharp(buffer, {
        failOn: 'error' as const, // fail on truncated/corrupt images
        pages: 1, // only process first page (strip animated GIFs/TIFFs to single frame)
      });

      const metadata = await image.metadata();

      // Determine output format based on input MIME type
      switch (mimeType) {
        case 'image/jpeg':
          return image
            .jpeg({
              quality: 90,
              mozjpeg: true,
              chromaSubsampling: '4:4:4',
              // force output to JPEG even if input was PNG → strips all non-image data
            })
            .toBuffer();
        case 'image/png':
          return image
            .png({
              compressionLevel: 9,
            })
            .toBuffer();
        case 'image/webp':
          return image.webp({ quality: 90 }).toBuffer();
        case 'image/gif':
          return image.gif().toBuffer();
        case 'image/tiff':
          return image.tiff({ quality: 90 }).toBuffer();
        case 'image/avif':
          return image.avif({ quality: 85 }).toBuffer();
        default:
          return buffer;
      }
    } catch (err) {
      throw new BadRequestException(
        `Image re-encoding failed: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Validate file size against configurable per-org upload limit.
   * Optionally pass orgLimit to override the default.
   */
  validateSize(size: number, orgLimit?: number): void {
    const limit = orgLimit ?? this.defaultOrgUploadLimitBytes;
    if (size > limit) {
      throw new PayloadTooLargeException(
        `File size ${size} exceeds the ${limit / (1024 * 1024)}MB upload limit for this organization`,
      );
    }
  }
}

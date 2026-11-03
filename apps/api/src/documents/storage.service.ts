import { Injectable, HttpStatus } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import { DocumentSourceType, ErrorCode, Limits } from '@xs-rag/shared';
import { ApiException } from '../common/error-envelope.filter.js';
import { getEnv } from '../config/env.js';

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  size: number;
  mimetype?: string;
}

export interface VerifiedFile {
  buffer: Buffer;
  sourceType: DocumentSourceType;
  mimeType: string;
  sizeBytes: number;
  originalFileName: string;
  extension: string;
}

@Injectable()
export class StorageService {
  async verifyFile(file?: UploadedFile | null): Promise<VerifiedFile> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new ApiException(
        ErrorCode.VALIDATION_FAILED,
        'No file part uploaded',
        HttpStatus.BAD_REQUEST,
        { fields: [{ field: 'file', issue: 'required' }] },
      );
    }

    if (file.buffer.length > Limits.UPLOAD_MAX_BYTES) {
      throw new ApiException(
        ErrorCode.FILE_TOO_LARGE,
        'File exceeds the 20 MB size limit',
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    const originalName = file.originalname || 'document';
    const ext = path.extname(originalName).toLowerCase();

    const allowedExtensions = ['.pdf', '.docx', '.md', '.markdown'];
    if (!allowedExtensions.includes(ext)) {
      throw new ApiException(
        ErrorCode.FILE_TYPE_NOT_SUPPORTED,
        `File extension ${ext} is not supported. Allowed: .pdf, .docx, .md`,
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }

    const detected = await fileTypeFromBuffer(file.buffer);

    let sourceType: DocumentSourceType;
    let mimeType: string;

    if (ext === '.pdf') {
      if (!detected || detected.ext !== 'pdf') {
        throw new ApiException(
          ErrorCode.FILE_TYPE_NOT_SUPPORTED,
          'File content does not match PDF magic bytes',
          HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        );
      }
      sourceType = DocumentSourceType.PDF;
      mimeType = 'application/pdf';
    } else if (ext === '.docx') {
      if (!detected || (detected.ext !== 'docx' && detected.ext !== 'zip')) {
        throw new ApiException(
          ErrorCode.FILE_TYPE_NOT_SUPPORTED,
          'File content does not match DOCX format',
          HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        );
      }
      sourceType = DocumentSourceType.DOCX;
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else {
      // Markdown
      if (detected !== undefined) {
        throw new ApiException(
          ErrorCode.FILE_TYPE_NOT_SUPPORTED,
          'Binary file detected for Markdown document',
          HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        );
      }

      if (file.buffer.includes(0x00)) {
        throw new ApiException(
          ErrorCode.FILE_TYPE_NOT_SUPPORTED,
          'Markdown file contains binary null bytes',
          HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        );
      }

      try {
        new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
      } catch {
        throw new ApiException(
          ErrorCode.FILE_TYPE_NOT_SUPPORTED,
          'Markdown file is not valid UTF-8',
          HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        );
      }

      sourceType = DocumentSourceType.MARKDOWN;
      mimeType = 'text/markdown';
    }

    return {
      buffer: file.buffer,
      sourceType,
      mimeType,
      sizeBytes: file.buffer.length,
      originalFileName: originalName,
      extension: ext,
    };
  }

  async saveFile(buffer: Buffer, extension: string): Promise<string> {
    const env = getEnv();
    const storageDir = path.resolve(env.STORAGE_DIR);
    await fs.mkdir(storageDir, { recursive: true });

    const randomFilename = `${randomUUID()}${extension}`;
    const filePath = path.join(storageDir, randomFilename);
    await fs.writeFile(filePath, buffer);
    return filePath;
  }

  async deleteFile(filePath?: string | null): Promise<void> {
    if (!filePath) return;
    try {
      await fs.unlink(filePath);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code !== 'ENOENT') {
        // Log or silently ignore non-critical delete failure
      }
    }
  }
}

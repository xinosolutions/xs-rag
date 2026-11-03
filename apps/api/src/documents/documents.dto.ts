import { z } from 'zod';
import { DocumentStatus, DocumentVisibility } from '@xs-rag/shared';

export const createUrlDocumentSchema = z.object({
  url: z.string().min(1, 'URL is required'),
  title: z.string().max(255).optional(),
  visibility: z.nativeEnum(DocumentVisibility).optional(),
  memberIds: z.array(z.string().uuid()).optional(),
});

export type CreateUrlDocumentDto = z.infer<typeof createUrlDocumentSchema>;

export const updateDocumentAccessSchema = z.object({
  visibility: z.nativeEnum(DocumentVisibility),
  memberIds: z.array(z.string().uuid()).optional(),
});

export type UpdateDocumentAccessDto = z.infer<typeof updateDocumentAccessSchema>;

export const uploadDocumentBodySchema = z.object({
  visibility: z.nativeEnum(DocumentVisibility).optional(),
  memberIds: z
    .preprocess((val) => {
      if (typeof val === 'string') {
        const trimmed = val.trim();
        if (trimmed.startsWith('[')) {
          try {
            return JSON.parse(trimmed);
          } catch {
            return [];
          }
        }
        return trimmed ? trimmed.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
      }
      return val;
    }, z.array(z.string().uuid()).optional())
    .optional(),
});

export type UploadDocumentBodyDto = z.infer<typeof uploadDocumentBodySchema>;

export const listDocumentsQuerySchema = z.object({
  status: z.nativeEnum(DocumentStatus).optional(),
  limit: z.union([z.string(), z.number()]).optional(),
  cursor: z.string().optional(),
});

export type ListDocumentsQueryDto = z.infer<typeof listDocumentsQuerySchema>;

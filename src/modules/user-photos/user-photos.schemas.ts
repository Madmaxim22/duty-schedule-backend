import { z } from 'zod';

export const photoIdParamSchema = z.object({
  photoId: z.string().uuid(),
});

export const uploadPhotoQuerySchema = z.object({
  setAsCurrent: z.string().optional(),
});

export function parseSetAsCurrent(query: z.infer<typeof uploadPhotoQuerySchema>): boolean {
  return query.setAsCurrent !== 'false';
}

export const updatePhotoFocusBodySchema = z.object({
  focusX: z.number().min(0).max(100),
  focusY: z.number().min(0).max(100),
});

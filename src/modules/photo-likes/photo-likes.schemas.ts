import { z } from 'zod';

export const photoIdParamSchema = z.object({
  photoId: z.string().uuid(),
});

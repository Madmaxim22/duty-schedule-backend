import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(6, 'Пароль не менее 6 символов'),
  fullName: z.string().min(2, 'Укажите ФИО'),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

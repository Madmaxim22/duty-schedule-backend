import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  deleteUserAvatar,
  getMe,
  loginUser,
  logoutUser,
  refreshSession,
  registerUser,
  uploadUserAvatar,
} from './auth.service.js';
import { loginSchema, registerSchema } from './auth.schemas.js';
import { authenticate, type AuthRequest } from '../../middleware/auth.js';
import { env } from '../../config/env.js';
import { avatarUpload } from './avatar-upload.js';
import { AppError } from '../../lib/errors.js';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { message: 'Слишком много попыток, попробуйте позже' },
});

const avatarLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: 'Слишком много загрузок, попробуйте позже' },
});

export const authRouter = Router();

authRouter.post('/register', authLimiter, async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const user = await registerUser(body);
    res.status(201).json({
      message: 'Регистрация отправлена. Ожидайте подтверждения администратора.',
      user,
    });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/login', authLimiter, async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const result = await loginUser(body);

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: env.cookieSecure,
      sameSite: 'lax',
      maxAge: env.refreshTokenDays * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    });

    res.json({ accessToken: result.accessToken, user: result.user });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken as string | undefined;
    if (!token) {
      res.status(401).json({ message: 'Refresh-токен отсутствует' });
      return;
    }
    const result = await refreshSession(token);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

authRouter.post('/logout', authenticate, async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken as string | undefined;
    await logoutUser(token);
    res.clearCookie('refreshToken', { path: '/api/auth' });
    res.json({ message: 'Вы вышли из системы' });
  } catch (e) {
    next(e);
  }
});

authRouter.get('/me', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const user = await getMe(req.user!.sub);
    res.json({ user });
  } catch (e) {
    next(e);
  }
});

authRouter.post(
  '/me/avatar',
  avatarLimiter,
  authenticate,
  avatarUpload.single('avatar'),
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.file) {
        throw new AppError(400, 'Файл не передан');
      }
      const user = await uploadUserAvatar(req.user!.sub, req.file.buffer);
      res.json({ user });
    } catch (e) {
      next(e);
    }
  },
);

authRouter.delete('/me/avatar', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const user = await deleteUserAvatar(req.user!.sub);
    res.json({ user });
  } catch (e) {
    next(e);
  }
});

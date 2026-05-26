import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, type AuthRequest } from '../../middleware/auth.js';
import { requireApproved } from '../../middleware/requireApproved.js';
import {
  createDirectSchema,
  createGroupSchema,
  messageBodySchema,
  messageIdParamSchema,
  messagesQuerySchema,
  reactionBodySchema,
  roomIdParamSchema,
} from './chat.schemas.js';
import {
  createGroupRoom,
  findOrCreateDirectRoom,
  getMessages,
  getRoom,
  getTotalUnread,
  listContacts,
  listMyRooms,
  markRoomRead,
  postMessage,
  removeMessageReaction,
  setMessageReaction,
} from './chat.service.js';

const postLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => (req as AuthRequest).user?.sub ?? req.ip ?? 'unknown',
  message: { message: 'Слишком много сообщений, попробуйте позже' },
});

const reactionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  keyGenerator: (req) => (req as AuthRequest).user?.sub ?? req.ip ?? 'unknown',
  message: { message: 'Слишком много реакций, попробуйте позже' },
});

export const chatRouter = Router();

chatRouter.use(authenticate, requireApproved);

chatRouter.get('/unread-count', async (req: AuthRequest, res, next) => {
  try {
    const data = await getTotalUnread(req.user!.sub);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

chatRouter.get('/contacts', async (req: AuthRequest, res, next) => {
  try {
    const data = await listContacts(req.user!.sub);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

chatRouter.get('/rooms', async (req: AuthRequest, res, next) => {
  try {
    const data = await listMyRooms(req.user!.sub);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

chatRouter.post('/rooms/direct', async (req: AuthRequest, res, next) => {
  try {
    const body = createDirectSchema.parse(req.body);
    const data = await findOrCreateDirectRoom(req.user!.sub, body.userId);
    res.status(201).json(data);
  } catch (e) {
    next(e);
  }
});

chatRouter.post('/rooms/group', async (req: AuthRequest, res, next) => {
  try {
    const body = createGroupSchema.parse(req.body);
    const data = await createGroupRoom(req.user!.sub, body.title, body.memberIds);
    res.status(201).json(data);
  } catch (e) {
    next(e);
  }
});

chatRouter.get('/rooms/:id', async (req: AuthRequest, res, next) => {
  try {
    const id = roomIdParamSchema.parse(req.params.id);
    const data = await getRoom(id, req.user!.sub);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

chatRouter.get('/rooms/:id/messages', async (req: AuthRequest, res, next) => {
  try {
    const id = roomIdParamSchema.parse(req.params.id);
    const query = messagesQuerySchema.parse(req.query);
    const data = await getMessages(id, req.user!.sub, query.before, query.limit);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

chatRouter.post(
  '/rooms/:id/messages',
  postLimiter,
  async (req: AuthRequest, res, next) => {
    try {
      const id = roomIdParamSchema.parse(req.params.id);
      const body = messageBodySchema.parse(req.body);
      const data = await postMessage(id, req.user!.sub, body.body);
      res.status(201).json(data);
    } catch (e) {
      next(e);
    }
  },
);

chatRouter.patch('/rooms/:id/read', async (req: AuthRequest, res, next) => {
  try {
    const id = roomIdParamSchema.parse(req.params.id);
    const data = await markRoomRead(id, req.user!.sub);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

chatRouter.put(
  '/rooms/:id/messages/:messageId/reactions',
  reactionLimiter,
  async (req: AuthRequest, res, next) => {
    try {
      const roomId = roomIdParamSchema.parse(req.params.id);
      const messageId = messageIdParamSchema.parse(req.params.messageId);
      const body = reactionBodySchema.parse(req.body);
      const data = await setMessageReaction(roomId, messageId, req.user!.sub, body.emoji);
      res.json(data);
    } catch (e) {
      next(e);
    }
  },
);

chatRouter.delete(
  '/rooms/:id/messages/:messageId/reactions',
  reactionLimiter,
  async (req: AuthRequest, res, next) => {
    try {
      const roomId = roomIdParamSchema.parse(req.params.id);
      const messageId = messageIdParamSchema.parse(req.params.messageId);
      const data = await removeMessageReaction(roomId, messageId, req.user!.sub);
      res.json(data);
    } catch (e) {
      next(e);
    }
  },
);

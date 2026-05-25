import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyAccessToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';
import type { ClientMessage, ServerMessage } from './chat-ws.types.js';

const WS_PATH = '/api/ws/chat';

type ClientState = {
  userId: string;
  subscribedRooms: Set<string>;
};

const roomSubscribers = new Map<string, Set<WebSocket>>();
const socketState = new WeakMap<WebSocket, ClientState>();

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function addToRoom(roomId: string, ws: WebSocket): void {
  let set = roomSubscribers.get(roomId);
  if (!set) {
    set = new Set();
    roomSubscribers.set(roomId, set);
  }
  set.add(ws);
}

function removeFromRoom(roomId: string, ws: WebSocket): void {
  const set = roomSubscribers.get(roomId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) {
    roomSubscribers.delete(roomId);
  }
}

function removeSocket(ws: WebSocket): void {
  const state = socketState.get(ws);
  if (!state) return;
  for (const roomId of state.subscribedRooms) {
    removeFromRoom(roomId, ws);
  }
  socketState.delete(ws);
}

export function broadcastToRoom(roomId: string, msg: ServerMessage, except?: WebSocket): void {
  const set = roomSubscribers.get(roomId);
  if (!set) return;
  for (const ws of set) {
    if (ws !== except) {
      send(ws, msg);
    }
  }
}

export function broadcastToUser(userId: string, msg: ServerMessage): void {
  for (const [ws, state] of getAllSockets()) {
    if (state.userId === userId) {
      send(ws, msg);
    }
  }
}

function getAllSockets(): Iterable<[WebSocket, ClientState]> {
  const entries: [WebSocket, ClientState][] = [];
  // WeakMap has no iterator — track via room subscribers
  for (const set of roomSubscribers.values()) {
    for (const ws of set) {
      const state = socketState.get(ws);
      if (state) entries.push([ws, state]);
    }
  }
  return entries;
}

async function handleAuth(ws: WebSocket, token: string): Promise<boolean> {
  try {
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { status: true },
    });
    if (!user || user.status !== 'approved') {
      send(ws, { type: 'error', code: 'FORBIDDEN', message: 'Доступ только для подтверждённых пользователей' });
      ws.close(4403);
      return false;
    }
    socketState.set(ws, { userId: payload.sub, subscribedRooms: new Set() });
    send(ws, { type: 'auth.ok', userId: payload.sub });
    return true;
  } catch {
    send(ws, { type: 'error', code: 'UNAUTHORIZED', message: 'Недействительный токен' });
    ws.close(4401);
    return false;
  }
}

async function handleSubscribe(ws: WebSocket, roomIds: string[]): Promise<void> {
  const state = socketState.get(ws);
  if (!state) {
    send(ws, { type: 'error', code: 'UNAUTHORIZED', message: 'Сначала выполните auth' });
    return;
  }

  if (roomIds.length === 0) return;

  const memberships = await prisma.chatMember.findMany({
    where: {
      userId: state.userId,
      roomId: { in: roomIds },
    },
    select: { roomId: true },
  });
  const allowed = new Set(memberships.map((m) => m.roomId));

  for (const roomId of roomIds) {
    if (!allowed.has(roomId)) continue;
    if (state.subscribedRooms.has(roomId)) continue;
    state.subscribedRooms.add(roomId);
    addToRoom(roomId, ws);
  }
}

function handleUnsubscribe(ws: WebSocket, roomIds: string[]): void {
  const state = socketState.get(ws);
  if (!state) return;

  for (const roomId of roomIds) {
    if (!state.subscribedRooms.has(roomId)) continue;
    state.subscribedRooms.delete(roomId);
    removeFromRoom(roomId, ws);
  }
}

function handleClientMessage(ws: WebSocket, raw: string): void {
  let parsed: ClientMessage;
  try {
    parsed = JSON.parse(raw) as ClientMessage;
  } catch {
    send(ws, { type: 'error', code: 'BAD_JSON', message: 'Неверный формат сообщения' });
    return;
  }

  if (parsed.type === 'auth') {
    void handleAuth(ws, parsed.token);
    return;
  }

  if (parsed.type === 'subscribe') {
    void handleSubscribe(ws, parsed.roomIds);
    return;
  }

  if (parsed.type === 'unsubscribe') {
    handleUnsubscribe(ws, parsed.roomIds);
    return;
  }

  if (parsed.type === 'typing') {
    void handleTyping(ws, parsed.roomId, parsed.active);
  }
}

async function handleTyping(ws: WebSocket, roomId: string, active: boolean): Promise<void> {
  const state = socketState.get(ws);
  if (!state) {
    send(ws, { type: 'error', code: 'UNAUTHORIZED', message: 'Сначала выполните auth' });
    return;
  }

  const membership = await prisma.chatMember.findFirst({
    where: { userId: state.userId, roomId },
    select: { roomId: true },
  });
  if (!membership) return;

  broadcastToRoom(
    roomId,
    { type: 'typing', roomId, userId: state.userId, active: Boolean(active) },
    ws,
  );
}

export function attachChatWebSocket(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '', `http://${request.headers.host ?? 'localhost'}`);
    if (url.pathname !== WS_PATH) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
    ws.on('message', (data) => {
      const raw = typeof data === 'string' ? data : data.toString();
      if (!socketState.has(ws)) {
        try {
          const parsed = JSON.parse(raw) as ClientMessage;
          if (parsed.type !== 'auth') {
            send(ws, { type: 'error', code: 'UNAUTHORIZED', message: 'Первое сообщение должно быть auth' });
            ws.close(4401);
            return;
          }
          void handleAuth(ws, parsed.token);
          return;
        } catch {
          send(ws, { type: 'error', code: 'BAD_JSON', message: 'Неверный формат сообщения' });
          ws.close(4401);
          return;
        }
      }
      handleClientMessage(ws, raw);
    });

    ws.on('close', () => {
      removeSocket(ws);
    });

    request.on('error', () => {
      removeSocket(ws);
    });
  });
}

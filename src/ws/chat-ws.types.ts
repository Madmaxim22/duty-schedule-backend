export type ChatMessageDto = {
  id: string;
  body: string;
  createdAt: string;
  status?: 'sent' | 'delivered' | 'read';
  author: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
    currentPhotoId: string | null;
    role: string;
  };
};

export type ChatRoomListItemDto = {
  id: string;
  type: 'direct' | 'group';
  title: string | null;
  displayName: string;
  displayAvatarUrl: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  updatedAt: string;
};

export type ClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'subscribe'; roomIds: string[] }
  | { type: 'unsubscribe'; roomIds: string[] }
  | { type: 'typing'; roomId: string; active: boolean }
  | { type: 'message.delivered'; roomId: string; messageId: string };

export type ServerMessage =
  | { type: 'auth.ok'; userId: string }
  | { type: 'message.new'; roomId: string; message: ChatMessageDto }
  | { type: 'message.status'; roomId: string; messageId: string; status: 'delivered' | 'read' }
  | { type: 'read.updated'; roomId: string; userId: string; lastReadAt: string }
  | { type: 'room.updated'; room: ChatRoomListItemDto }
  | { type: 'typing'; roomId: string; userId: string; active: boolean }
  | { type: 'error'; code: string; message: string };

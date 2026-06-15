import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { MessagesService } from './messages.service';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/chat' })
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  // userId → Set<socketId>
  private onlineUsers = new Map<string, Set<string>>();

  constructor(
    private jwt: JwtService,
    private messages: MessagesService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.split(' ')[1];
      const payload = this.jwt.verify(token);
      client.data.userId = payload.sub;

      if (!this.onlineUsers.has(payload.sub)) this.onlineUsers.set(payload.sub, new Set());
      this.onlineUsers.get(payload.sub)!.add(client.id);

      // Kullanıcıyı kendi odasına al (konuşma event'leri için)
      client.join(`user:${payload.sub}`);
      this.server.emit('user:online', { userId: payload.sub });
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (!userId) return;
    const sockets = this.onlineUsers.get(userId);
    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.onlineUsers.delete(userId);
        this.server.emit('user:offline', { userId });
      }
    }
  }

  // Konuşma odasına katıl
  @SubscribeMessage('join:conversation')
  async joinConversation(@ConnectedSocket() client: Socket, @MessageBody() data: { conversationId: string }) {
    client.join(`conv:${data.conversationId}`);
    return { ok: true };
  }

  // Mesaj gönder (REST ile paralel — socket üzerinden de gönderilebilir)
  @SubscribeMessage('message:send')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; body: string },
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    try {
      const message = await this.messages.sendMessage(userId, data.conversationId, data.body);
      // Konuşma odasındaki herkese gönder
      this.server.to(`conv:${data.conversationId}`).emit('message:new', message);
      return message;
    } catch (e: any) {
      return { error: e.message };
    }
  }

  // Okundu bildirimi
  @SubscribeMessage('message:read')
  async handleRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = client.data.userId;
    if (!userId) return;
    await this.messages.markRead(userId, data.conversationId);
    // Konuşma odasına "karşı taraf okudu" bildir
    this.server.to(`conv:${data.conversationId}`).emit('message:read', {
      conversationId: data.conversationId,
      userId,
      readAt: new Date(),
    });
  }

  // Yazıyor... bildirimi
  @SubscribeMessage('message:typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; typing: boolean },
  ) {
    const userId = client.data.userId;
    if (!userId) return;
    client.to(`conv:${data.conversationId}`).emit('message:typing', { userId, typing: data.typing });
  }

  isUserOnline(userId: string): boolean {
    return (this.onlineUsers.get(userId)?.size ?? 0) > 0;
  }

  // Bir kullanıcıya gerçek zamanlı bildirim gönder (dışarıdan çağrılabilir)
  notifyUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }
}

import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from './encryption.service';
import { SocialService } from '../social/social.service';
import { MessageFilterService } from './message-filter.service';
import { WebPushService } from '../users/webpush.service';

@Injectable()
export class MessagesService {
  constructor(
    private prisma: PrismaService,
    private encryption: EncryptionService,
    private social: SocialService,
    private filter: MessageFilterService,
    private webPush: WebPushService,
  ) {}

  // Konuşma başlat veya mevcut olanı getir
  async getOrCreateConversation(userId: string, otherUserId: string, listingId?: string) {
    if (userId === otherUserId) throw new ForbiddenException('Kendinizle mesajlaşamazsınız');
    if (await this.social.isBlocked(userId, otherUserId)) throw new ForbiddenException('Bu kullanıcıyla mesajlaşamazsınız');

    // Mevcut konuşmayı bul — kullanıcının konuşmalarına bak, karşı tarafın da katılımcı olduğunu filtrele
    const myConversations = await this.prisma.conversationParticipant.findMany({
      where: { userId },
      select: { conversationId: true },
    });
    const myConvIds = myConversations.map(p => p.conversationId);

    const existing = myConvIds.length > 0 ? await this.prisma.conversation.findFirst({
      where: {
        id: { in: myConvIds },
        ...(listingId ? { listingId } : {}),
        participants: { some: { userId: otherUserId } },
      },
      include: { participants: { include: { user: { select: { id: true, displayName: true, avatarUrl: true } } } } },
    }) : null;

    if (existing) return existing;

    const { conversationKey, encryptedKey } = this.encryption.generateConversationKey();

    const conversation = await this.prisma.conversation.create({
      data: {
        listingId: listingId || null,
        encryptedKey,
        participants: {
          create: [
            { user: { connect: { id: userId } } },
            { user: { connect: { id: otherUserId } } },
          ],
        },
      },
      include: { participants: { include: { user: { select: { id: true, displayName: true, avatarUrl: true } } } } },
    });

    return conversation;
  }

  // Kullanıcının tüm konuşmaları (son mesaj + okunmamış sayısı ile)
  async getConversations(userId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: { participants: { some: { userId } } },
      orderBy: { updatedAt: 'desc' },
      include: {
        listing: { select: { id: true, title: true, images: { take: 1, orderBy: { sortOrder: 'asc' } } } },
        participants: {
          include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
        },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return conversations.map(conv => {
      const myParticipant = conv.participants.find(p => p.userId === userId);
      const otherParticipant = conv.participants.find(p => p.userId !== userId);
      const lastMsg = conv.messages[0];

      let lastMessageText: string | null = null;
      if (lastMsg) {
        try {
          const key = this.encryption.unwrapKey(conv.encryptedKey);
          lastMessageText = this.encryption.decryptMessage(lastMsg.encryptedBody, key);
        } catch {
          lastMessageText = '🔒 Şifreli mesaj';
        }
      }

      return {
        id: conv.id,
        listing: conv.listing,
        otherUser: otherParticipant?.user ?? null,
        lastMessage: lastMsg ? {
          id: lastMsg.id,
          body: lastMessageText,
          senderId: lastMsg.senderId,
          createdAt: lastMsg.createdAt,
        } : null,
        lastReadAt: myParticipant?.lastReadAt ?? null,
        otherReadAt: otherParticipant?.lastReadAt ?? null,
        updatedAt: conv.updatedAt,
      };
    });
  }

  // Bir konuşmanın mesajlarını getir (sayfalı)
  async getMessages(userId: string, conversationId: string, cursor?: string, limit = 30) {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      include: { conversation: true },
    });
    if (!participant) throw new ForbiddenException('Bu konuşmaya erişiminiz yok');

    const messages = await this.prisma.message.findMany({
      where: { conversationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { sender: { select: { id: true, displayName: true, avatarUrl: true } } },
    });

    const key = this.encryption.unwrapKey(participant.conversation.encryptedKey);

    const decrypted = messages.map(msg => ({
      id: msg.id,
      conversationId: msg.conversationId,
      sender: msg.sender,
      body: (() => { try { return this.encryption.decryptMessage(msg.encryptedBody, key); } catch { return '🔒'; } })(),
      createdAt: msg.createdAt,
    })).reverse();

    // Son okunma zamanını güncelle
    await this.prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    });

    return { messages: decrypted, nextCursor: messages.length === limit ? messages[messages.length - 1].id : null };
  }

  // Mesaj gönder
  async sendMessage(userId: string, conversationId: string, body: string) {
    this.filter.assertClean(body);

    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      include: { conversation: true },
    });
    if (!participant) throw new ForbiddenException('Bu konuşmaya erişiminiz yok');

    const key = this.encryption.unwrapKey(participant.conversation.encryptedKey);
    const encryptedBody = this.encryption.encryptMessage(body, key);

    const otherParticipant = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, userId: { not: userId } },
    });

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: { conversationId, senderId: userId, encryptedBody },
        include: { sender: { select: { id: true, displayName: true, avatarUrl: true } } },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      }),
    ]);

    // Karşı tarafa bildirim (fire-and-forget)
    if (otherParticipant) {
      this.prisma.notification.create({
        data: {
          userId: otherParticipant.userId,
          type: 'message.new',
          title: `${message.sender.displayName} mesaj gönderdi`,
          body,
          payload: { conversationId },
        },
      }).catch(() => null);

      // Push bildiriminde mesaj içeriğini taşımıyoruz — şifreli mesajlaşmanın gizliliğini
      // 3. parti push servisine (FCM/Mozilla push relay) sızdırmamak için generic metin kullanıyoruz.
      this.webPush.sendToUser(otherParticipant.userId, {
        title: `${message.sender.displayName} mesaj gönderdi`,
        body: 'Yeni bir mesajınız var.',
        url: `/mesajlarim?c=${conversationId}`,
      }, 'messages').catch(() => null);
    }

    return {
      id: message.id,
      conversationId: message.conversationId,
      sender: message.sender,
      body,
      createdAt: message.createdAt,
    };
  }

  // Okundu işaretle
  async markRead(userId: string, conversationId: string) {
    await this.prisma.conversationParticipant.updateMany({
      where: { conversationId, userId },
      data: { lastReadAt: new Date() },
    });
    return { ok: true };
  }

  // SUPER_ADMIN: dispute için mesajları şifresiz getir + audit log
  async getMessagesForAdmin(adminId: string, conversationId: string, reason: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
        participants: { include: { user: { select: { id: true, displayName: true, email: true } } } },
      },
    });
    if (!conversation) throw new NotFoundException('Konuşma bulunamadı');

    const key = this.encryption.unwrapKey(conversation.encryptedKey);

    const messages = conversation.messages.map(msg => ({
      id: msg.id,
      senderId: msg.senderId,
      body: (() => { try { return this.encryption.decryptMessage(msg.encryptedBody, key); } catch { return '[çözümlenemedi]'; } })(),
      createdAt: msg.createdAt,
    }));

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'conversation.admin_read',
        entity: 'Conversation',
        entityId: conversationId,
        meta: { reason, participantCount: conversation.participants.length },
      },
    });

    return {
      conversationId,
      participants: conversation.participants.map(p => p.user),
      messages,
    };
  }
}

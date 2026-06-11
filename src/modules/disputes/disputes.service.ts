import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenDisputeDto, AddDisputeMessageDto, ResolveDisputeDto } from './dto/disputes.dto';

@Injectable()
export class DisputesService {
  constructor(private prisma: PrismaService) {}

  async openDispute(userId: string, dto: OpenDisputeDto) {
    const order = await this.prisma.order.findUnique({ where: { id: dto.orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== userId && order.sellerId !== userId) throw new ForbiddenException();
    if (!['PAID_ESCROW', 'SHIPPED', 'DELIVERED'].includes(order.status)) {
      throw new BadRequestException('Dispute can only be opened on orders in progress');
    }

    const existing = await this.prisma.dispute.findUnique({ where: { orderId: dto.orderId } });
    if (existing) throw new BadRequestException('A dispute is already open for this order');

    const [dispute] = await this.prisma.$transaction([
      this.prisma.dispute.create({
        data: { orderId: dto.orderId, openedById: userId, reason: dto.reason },
        include: { messages: true },
      }),
      this.prisma.order.update({ where: { id: dto.orderId }, data: { status: 'DISPUTED' } }),
    ]);

    return dispute;
  }

  async addMessage(disputeId: string, senderId: string, dto: AddDisputeMessageDto) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { order: true },
    });
    if (!dispute) throw new NotFoundException('Dispute not found');

    const isParty = dispute.order.buyerId === senderId || dispute.order.sellerId === senderId;
    const sender = await this.prisma.user.findUnique({ where: { id: senderId } });
    const isAdmin = sender && ['ADMIN', 'SUPER_ADMIN', 'MODERATOR'].includes(sender.role);

    if (!isParty && !isAdmin) throw new ForbiddenException();
    if (dispute.status === 'CLOSED') throw new BadRequestException('Dispute is closed');

    return this.prisma.disputeMessage.create({
      data: { disputeId, senderId, body: dto.body },
    });
  }

  async getDispute(id: string, requesterId: string) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id },
      include: {
        order: true,
        messages: { orderBy: { createdAt: 'asc' } },
        openedBy: { select: { id: true, displayName: true } },
      },
    });
    if (!dispute) throw new NotFoundException('Dispute not found');

    const isParty = dispute.order.buyerId === requesterId || dispute.order.sellerId === requesterId;
    const requester = await this.prisma.user.findUnique({ where: { id: requesterId } });
    const isAdmin = requester && ['ADMIN', 'SUPER_ADMIN', 'MODERATOR'].includes(requester.role);

    if (!isParty && !isAdmin) throw new ForbiddenException();
    return dispute;
  }

  async listDisputes() {
    return this.prisma.dispute.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        order: { select: { id: true, amount: true, buyerId: true, sellerId: true } },
        openedBy: { select: { id: true, displayName: true } },
      },
    });
  }

  async resolveDispute(id: string, adminId: string, dto: ResolveDisputeDto) {
    const dispute = await this.prisma.dispute.findUnique({ where: { id } });
    if (!dispute) throw new NotFoundException('Dispute not found');
    if (['RESOLVED_REFUND', 'RESOLVED_RELEASE', 'CLOSED'].includes(dispute.status)) {
      throw new BadRequestException('Dispute is already resolved');
    }

    const orderStatus =
      dto.status === 'RESOLVED_REFUND' ? 'REFUNDED' :
      dto.status === 'RESOLVED_RELEASE' ? 'COMPLETED' : 'CANCELLED';

    const [resolved] = await this.prisma.$transaction([
      this.prisma.dispute.update({
        where: { id },
        data: {
          status: dto.status,
          resolutionNote: dto.resolutionNote,
          resolvedBy: adminId,
          resolvedAt: new Date(),
        },
      }),
      this.prisma.order.update({
        where: { id: dispute.orderId },
        data: { status: orderStatus as any },
      }),
    ]);

    return resolved;
  }

  async getMyDisputes(userId: string) {
    return this.prisma.dispute.findMany({
      where: {
        OR: [
          { order: { buyerId: userId } },
          { order: { sellerId: userId } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          select: { id: true, amount: true, listing: { select: { id: true, title: true } } },
        },
      },
    });
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface LogParams {
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  meta?: Record<string, any>;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  // Fire-and-forget: audit kaydı kritik akışı bloklamamalı/bozmamalı.
  log({ actorId, action, entity, entityId, meta, ip, userAgent }: LogParams): void {
    this.prisma.auditLog
      .create({
        data: {
          actorId,
          action,
          entity,
          entityId,
          meta: { ...(meta ?? {}), ...(ip ? { ip } : {}), ...(userAgent ? { userAgent } : {}) },
        },
      })
      .catch((err) => this.logger.warn(`Audit log yazılamadı: ${action} ${entity}:${entityId} — ${err.message}`));
  }
}

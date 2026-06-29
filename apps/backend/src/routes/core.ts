import { Router } from 'express';
import { AuditAction, LeadStatus, RegistrationStatus, Role, TrafficType } from '@prisma/client';
import { z } from 'zod';
import { auth, requireRole } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

export const coreRouter = Router();
coreRouter.use(auth);

coreRouter.get('/me', (req, res) => res.json(req.user));

coreRouter.get('/handlers/active', requireRole(Role.ADMIN, Role.TRAFFIC), async (_req, res) => {
  const handlers = await prisma.user.findMany({
    where: { role: Role.HANDLER, shift: { isOnShift: true } },
    select: { id: true, name: true, username: true, telegramId: true, shift: true },
    orderBy: { name: 'asc' },
  });
  res.json(handlers);
});

coreRouter.patch('/handler/shift/start', requireRole(Role.HANDLER), async (req, res) => {
  const now = new Date();
  const shift = await prisma.handlerShift.upsert({
    where: { handlerId: req.user!.id },
    update: { isOnShift: true, startedAt: now, endedAt: null },
    create: { handlerId: req.user!.id, isOnShift: true, startedAt: now },
  });
  await prisma.auditLog.create({ data: { action: AuditAction.SHIFT_STARTED, actorId: req.user!.id } });
  res.json(shift);
});

coreRouter.patch('/handler/shift/end', requireRole(Role.HANDLER), async (req, res) => {
  const shift = await prisma.handlerShift.upsert({
    where: { handlerId: req.user!.id },
    update: { isOnShift: false, endedAt: new Date() },
    create: { handlerId: req.user!.id, isOnShift: false, endedAt: new Date() },
  });
  await prisma.auditLog.create({ data: { action: AuditAction.SHIFT_ENDED, actorId: req.user!.id } });
  res.json(shift);
});

const targetSchema = z.object({ handlerId: z.string().uuid() });
coreRouter.patch('/traffic/target', requireRole(Role.TRAFFIC), async (req, res) => {
  const { handlerId } = targetSchema.parse(req.body);
  const handler = await prisma.user.findFirst({ where: { id: handlerId, role: Role.HANDLER, shift: { isOnShift: true } } });
  if (!handler) return res.status(400).json({ error: 'Handler is not active' });

  const target = await prisma.trafficTarget.upsert({
    where: { trafficId: req.user!.id },
    update: { handlerId },
    create: { trafficId: req.user!.id, handlerId },
    include: { handler: { select: { id: true, name: true, username: true, telegramId: true } } },
  });
  await prisma.auditLog.create({
    data: { action: AuditAction.HANDLER_TARGET_SELECTED, actorId: req.user!.id, metadata: { handlerId } },
  });
  res.json(target);
});

coreRouter.get('/traffic/target', requireRole(Role.TRAFFIC), async (req, res) => {
  const target = await prisma.trafficTarget.findUnique({
    where: { trafficId: req.user!.id },
    include: { handler: { select: { id: true, name: true, username: true, telegramId: true, shift: true } } },
  });
  res.json(target);
});

const leadSchema = z.object({
  name: z.string().min(1),
  contact: z.string().min(1),
  trafficId: z.string().min(1),
  trafficType: z.nativeEnum(TrafficType),
  comment: z.string().optional(),
});
coreRouter.post('/lead/manual', requireRole(Role.HANDLER), async (req, res) => {
  const input = leadSchema.parse(req.body);
  const lead = await prisma.lead.create({ data: { ...input, handlerId: req.user!.id } });
  await prisma.auditLog.create({
    data: { action: AuditAction.LEAD_CREATED, actorId: req.user!.id, leadId: lead.id, metadata: { trafficId: input.trafficId } },
  });
  res.status(201).json(lead);
});

coreRouter.get('/handler/leads', requireRole(Role.HANDLER, Role.ADMIN), async (req, res) => {
  const handlerId = req.user!.role === Role.ADMIN ? req.query.handlerId?.toString() : req.user!.id;
  const leads = await prisma.lead.findMany({ where: handlerId ? { handlerId } : {}, orderBy: { createdAt: 'desc' } });
  res.json(leads);
});

const statusSchema = z.object({ status: z.nativeEnum(LeadStatus) });
coreRouter.patch('/lead/:id/status', requireRole(Role.HANDLER, Role.ADMIN), async (req, res) => {
  const { status } = statusSchema.parse(req.body);
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: req.params.id } });
  if (req.user!.role === Role.HANDLER && lead.handlerId !== req.user!.id) return res.status(403).json({ error: 'Forbidden' });

  const updated = await prisma.lead.update({ where: { id: lead.id }, data: { status } });
  await prisma.auditLog.create({
    data: { action: AuditAction.LEAD_STATUS_CHANGED, actorId: req.user!.id, leadId: lead.id, metadata: { from: lead.status, to: status } },
  });
  res.json(updated);
});

coreRouter.get('/traffic/stats', requireRole(Role.TRAFFIC, Role.ADMIN), async (req, res) => {
  const trafficId = req.user!.role === Role.ADMIN ? req.query.trafficId?.toString() : req.user!.trafficId;
  if (!trafficId) return res.status(400).json({ error: 'traffic_id is not assigned' });

  const [total, byHandler] = await Promise.all([
    prisma.lead.count({ where: { trafficId } }),
    prisma.lead.groupBy({ by: ['handlerId'], where: { trafficId }, _count: true }),
  ]);
  res.json({ trafficId, total, byHandler });
});

coreRouter.get('/handler/stats', requireRole(Role.HANDLER, Role.ADMIN), async (req, res) => {
  const handlerId = req.user!.role === Role.ADMIN ? req.query.handlerId?.toString() : req.user!.id;
  const [total, byTrafficId] = await Promise.all([
    prisma.lead.count({ where: handlerId ? { handlerId } : {} }),
    prisma.lead.groupBy({ by: ['trafficId'], where: handlerId ? { handlerId } : {}, _count: true }),
  ]);
  res.json({ handlerId, total, byTrafficId });
});


coreRouter.get('/admin/users', requireRole(Role.ADMIN), async (req, res) => {
  const status = req.query.status?.toString() as RegistrationStatus | undefined;
  const users = await prisma.user.findMany({
    where: status ? { registrationStatus: status } : {},
    orderBy: { createdAt: 'desc' },
  });
  res.json(users);
});

const approveUserSchema = z.object({
  role: z.nativeEnum(Role),
  trafficId: z.string().optional(),
});
coreRouter.patch('/admin/users/:id/approve', requireRole(Role.ADMIN), async (req, res) => {
  const input = approveUserSchema.parse(req.body);
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { role: input.role, trafficId: input.trafficId, registrationStatus: RegistrationStatus.APPROVED, isActive: true },
  });
  if (input.trafficId) {
    await prisma.auditLog.create({
      data: { action: AuditAction.TRAFFIC_ID_ASSIGNED, actorId: req.user!.id, metadata: { userId: user.id, trafficId: input.trafficId } },
    });
  }
  res.json(user);
});

const userSchema = z.object({
  telegramId: z.string(),
  name: z.string(),
  username: z.string().optional(),
  role: z.nativeEnum(Role),
  trafficId: z.string().optional(),
});
coreRouter.post('/admin/users', requireRole(Role.ADMIN), async (req, res) => {
  const input = userSchema.parse(req.body);
  const user = await prisma.user.upsert({
    where: { telegramId: input.telegramId },
    update: { ...input, registrationStatus: RegistrationStatus.APPROVED },
    create: { ...input, registrationStatus: RegistrationStatus.APPROVED },
  });
  if (input.trafficId) {
    await prisma.auditLog.create({
      data: { action: AuditAction.TRAFFIC_ID_ASSIGNED, actorId: req.user!.id, metadata: { userId: user.id, trafficId: input.trafficId } },
    });
  }
  res.json(user);
});

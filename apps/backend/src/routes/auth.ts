import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

export const authRouter = Router();
const loginSchema = z.object({ telegramId: z.string(), username: z.string().optional(), name: z.string().min(1), roleHint: z.nativeEnum(Role).optional() });

authRouter.post('/telegram', async (req, res) => {
  const input = loginSchema.parse(req.body);
  const existingUsers = await prisma.user.count();
  const role = existingUsers === 0 ? Role.ADMIN : input.roleHint ?? Role.HANDLER;
  const user = await prisma.user.upsert({
    where: { telegramId: input.telegramId },
    update: { username: input.username, name: input.name },
    create: { telegramId: input.telegramId, username: input.username, name: input.name, role },
  });
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '30d' });
  res.json({ token, user });
});

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { RegistrationStatus, Role } from '@prisma/client';
import { z } from 'zod';
import { isBootstrapAdmin } from '../lib/config.js';
import { prisma } from '../lib/prisma.js';
import { notifyAdmins } from '../lib/telegram.js';

export const authRouter = Router();

const telegramUserSchema = z.object({
  telegramId: z.string(),
  username: z.string().optional(),
  name: z.string().min(1),
});

function signToken(userId: string) {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '30d' });
}

authRouter.post('/telegram', async (req, res) => {
  const input = telegramUserSchema.parse(req.body);
  const bootstrapAdmin = isBootstrapAdmin(input.telegramId);

  const user = await prisma.user.upsert({
    where: { telegramId: input.telegramId },
    update: { username: input.username, name: input.name },
    create: {
      telegramId: input.telegramId,
      username: input.username,
      name: input.name,
      role: bootstrapAdmin ? Role.ADMIN : null,
      registrationStatus: bootstrapAdmin ? RegistrationStatus.APPROVED : RegistrationStatus.PENDING,
    },
  });

  if (user.registrationStatus !== RegistrationStatus.APPROVED || !user.role) {
    return res.json({ registered: false, status: user.registrationStatus, user });
  }

  return res.json({ registered: true, token: signToken(user.id), user });
});

authRouter.post('/register-request', async (req, res) => {
  const input = telegramUserSchema.parse(req.body);
  const user = await prisma.user.upsert({
    where: { telegramId: input.telegramId },
    update: { username: input.username, name: input.name, registrationStatus: RegistrationStatus.PENDING },
    create: { telegramId: input.telegramId, username: input.username, name: input.name, registrationStatus: RegistrationStatus.PENDING },
  });

  await notifyAdmins(`Новая заявка в CRM: ${user.name} @${user.username || '-'} telegram_id=${user.telegramId}`);
  res.status(202).json({ message: 'Вы подали заявку на регистрацию. Подождите, с вами свяжутся.', user });
});

CREATE TYPE "Role" AS ENUM ('ADMIN', 'TRAFFIC', 'HANDLER');
CREATE TYPE "TrafficType" AS ENUM ('fb', 'tiktok', 'google', 'native', 'push', 'seo', 'other');
CREATE TYPE "LeadStatus" AS ENUM ('new', 'in_progress', 'closed', 'rejected');
CREATE TYPE "AuditAction" AS ENUM ('LEAD_CREATED', 'LEAD_STATUS_CHANGED', 'SHIFT_STARTED', 'SHIFT_ENDED', 'TRAFFIC_ID_ASSIGNED', 'HANDLER_TARGET_SELECTED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "telegramId" TEXT NOT NULL,
  "username" TEXT,
  "name" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "trafficId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HandlerShift" (
  "id" TEXT NOT NULL,
  "handlerId" TEXT NOT NULL,
  "isOnShift" BOOLEAN NOT NULL DEFAULT false,
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HandlerShift_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrafficTarget" (
  "id" TEXT NOT NULL,
  "trafficId" TEXT NOT NULL,
  "handlerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrafficTarget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Lead" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "contact" TEXT NOT NULL,
  "trafficId" TEXT NOT NULL,
  "trafficType" "TrafficType" NOT NULL,
  "comment" TEXT,
  "status" "LeadStatus" NOT NULL DEFAULT 'new',
  "handlerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "action" "AuditAction" NOT NULL,
  "actorId" TEXT,
  "leadId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");
CREATE UNIQUE INDEX "User_trafficId_key" ON "User"("trafficId");
CREATE UNIQUE INDEX "HandlerShift_handlerId_key" ON "HandlerShift"("handlerId");
CREATE UNIQUE INDEX "TrafficTarget_trafficId_key" ON "TrafficTarget"("trafficId");
CREATE INDEX "TrafficTarget_handlerId_idx" ON "TrafficTarget"("handlerId");
CREATE INDEX "Lead_trafficId_idx" ON "Lead"("trafficId");
CREATE INDEX "Lead_handlerId_idx" ON "Lead"("handlerId");

ALTER TABLE "HandlerShift" ADD CONSTRAINT "HandlerShift_handlerId_fkey" FOREIGN KEY ("handlerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrafficTarget" ADD CONSTRAINT "TrafficTarget_trafficId_fkey" FOREIGN KEY ("trafficId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrafficTarget" ADD CONSTRAINT "TrafficTarget_handlerId_fkey" FOREIGN KEY ("handlerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_handlerId_fkey" FOREIGN KEY ("handlerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

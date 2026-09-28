-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "existingClientId" TEXT;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "retainerId" TEXT;

-- AlterTable
ALTER TABLE "video_versions" ADD COLUMN     "releasedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "leads_existingClientId_idx" ON "leads"("existingClientId");

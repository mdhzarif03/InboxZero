ALTER TABLE "ConnectedAccount"
  ADD COLUMN "syncProgressStatus" TEXT NOT NULL DEFAULT 'idle',
  ADD COLUMN "syncProgressStage" TEXT,
  ADD COLUMN "syncProgressCurrent" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "syncProgressTotal" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "syncProgressUpdatedAt" TIMESTAMP(3);

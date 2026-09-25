-- Pass-the-gate: grace period becomes the "away" time, plus a lock between passes.
ALTER TABLE "Company" RENAME COLUMN "graceMinutes" TO "awayMinutes";
ALTER TABLE "Company" ADD COLUMN "passLockMinutes" INTEGER NOT NULL DEFAULT 15;

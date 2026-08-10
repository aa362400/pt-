CREATE TYPE "ImageQaStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'ERROR');

ALTER TABLE "file_assets"
ADD COLUMN "sha256" TEXT;

ALTER TABLE "image_prompt_projects"
ADD COLUMN "referenceAssetId" TEXT,
ADD COLUMN "qaStatus" "ImageQaStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "qaVersion" TEXT NOT NULL DEFAULT 'visual-qa/v1',
ADD COLUMN "qaResult" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "qaCompletedAt" TIMESTAMP(3);

ALTER TABLE "product_launches"
ADD COLUMN "referenceAssetId" TEXT,
ADD COLUMN "referenceAssetSha256" TEXT;

CREATE INDEX "image_prompt_projects_referenceAssetId_idx"
ON "image_prompt_projects"("referenceAssetId");
CREATE INDEX "image_prompt_projects_qaStatus_idx"
ON "image_prompt_projects"("qaStatus");
CREATE INDEX "product_launches_referenceAssetId_idx"
ON "product_launches"("referenceAssetId");
CREATE INDEX "product_launches_imageProjectId_idx"
ON "product_launches"("imageProjectId");

ALTER TABLE "image_prompt_projects"
ADD CONSTRAINT "image_prompt_projects_referenceAssetId_fkey"
FOREIGN KEY ("referenceAssetId") REFERENCES "file_assets"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "product_launches"
ADD CONSTRAINT "product_launches_referenceAssetId_fkey"
FOREIGN KEY ("referenceAssetId") REFERENCES "file_assets"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "product_launches"
ADD CONSTRAINT "product_launches_imageProjectId_fkey"
FOREIGN KEY ("imageProjectId") REFERENCES "image_prompt_projects"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

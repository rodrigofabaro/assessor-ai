-- High-frequency list and latest-run access paths used by submissions workspace and QA.
CREATE INDEX "Submission_uploadedAt_id_idx" ON "Submission"("uploadedAt", "id");
CREATE INDEX "Submission_status_uploadedAt_idx" ON "Submission"("status", "uploadedAt");
CREATE INDEX "SubmissionExtractionRun_submissionId_startedAt_idx" ON "SubmissionExtractionRun"("submissionId", "startedAt");
CREATE INDEX "Assessment_submissionId_createdAt_idx" ON "Assessment"("submissionId", "createdAt");
CREATE INDEX "Assessment_createdAt_idx" ON "Assessment"("createdAt");

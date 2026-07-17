-- FORWARD_ONLY: this migration closes fail-open proof-validation paths.
-- Do not restore the nullable validators after any publish snapshot has been
-- accepted. Roll the application forward, or restore the verified pre-deploy
-- database backup before accepting post-migration writes.


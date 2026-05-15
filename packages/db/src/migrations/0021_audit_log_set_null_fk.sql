-- 0021_audit_log_set_null_fk.sql
-- Audit log FK'lerini SET NULL'a çevir.
-- KVKK md.16 hard-delete (account-cleanup) sırasında user/org silinirse
-- audit_log.actor_user_id veya audit_log.org_id orphan kalmıyor — FK
-- constraint hatası vermek yerine NULL'a iniyor.
-- Production audit bulgusu K9.

DO $$
BEGIN
  -- audit_log.actor_user_id → users.id (SET NULL)
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'audit_log_actor_user_id_users_id_fk'
      AND table_name = 'audit_log'
  ) THEN
    EXECUTE 'ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_actor_user_id_users_id_fk"';
  END IF;
END $$;

ALTER TABLE "audit_log"
  ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk"
  FOREIGN KEY ("actor_user_id")
  REFERENCES "users"("id")
  ON DELETE SET NULL;

-- audit_log.org_id → orgs.id (SET NULL)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'audit_log_org_id_orgs_id_fk'
      AND table_name = 'audit_log'
  ) THEN
    EXECUTE 'ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_org_id_orgs_id_fk"';
  END IF;
END $$;

ALTER TABLE "audit_log"
  ADD CONSTRAINT "audit_log_org_id_orgs_id_fk"
  FOREIGN KEY ("org_id")
  REFERENCES "orgs"("id")
  ON DELETE SET NULL;

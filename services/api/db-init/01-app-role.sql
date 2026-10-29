-- Runs once, when the PostgreSQL volume is first created (docker-entrypoint-initdb.d).
-- Demo-only credentials for a synthetic environment: never reuse them anywhere real.
-- The API connects as halt_app. When the API creates the schema (as the owner, HALT_DB_MIGRATE_URL), it
-- grants halt_app SELECT and INSERT only on audit_log and operations (halt.db.grant_app_role), so the
-- application role cannot change or delete the record; triggers refuse that for the owner as well.
CREATE ROLE halt_app LOGIN PASSWORD 'halt_app';

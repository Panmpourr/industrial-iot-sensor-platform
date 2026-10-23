-- Least-privilege login for the backend: it can read and write data, but it cannot create,
-- alter or drop tables. The schema stays owned by DB_USER, which only the init scripts use.
-- Runs automatically on a new database; safe to run again (e.g. to change the password).

\getenv app_user DB_APP_USER
\getenv app_password DB_APP_PASSWORD

SELECT format('CREATE ROLE %I LOGIN', :'app_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'app_user', :'app_password') \gexec

GRANT CONNECT ON DATABASE :"DBNAME" TO :"app_user";
GRANT USAGE ON SCHEMA public TO :"app_user";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_user";

-- Tables added later by DB_USER get the same rights
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";

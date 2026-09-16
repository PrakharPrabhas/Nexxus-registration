-- NEXXUS / NEXXATHON database schema
-- Run this in Supabase SQL Editor before production deployment.
-- Secrets are intentionally NOT stored in this file.

-- DEVELOPMENT RESET: this script intentionally replaces the existing NEXXUS tables.
-- It deletes all rows in these tables. Do not run this against a production database
-- unless you intentionally want to start from an empty database.
DROP TABLE IF EXISTS public.team_members CASCADE;
DROP TABLE IF EXISTS public.team_invitations CASCADE;
DROP TABLE IF EXISTS public.teams CASCADE;
DROP TABLE IF EXISTS public.problem_statements CASCADE;
DROP TABLE IF EXISTS public.support_tickets CASCADE;
DROP TABLE IF EXISTS public.announcements CASCADE;
DROP TABLE IF EXISTS public.app_users CASCADE;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_user_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  year TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.problem_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  summary TEXT DEFAULT '',
  description TEXT DEFAULT '',
  track TEXT NOT NULL DEFAULT 'General',
  difficulty TEXT NOT NULL DEFAULT 'Intermediate',
  technologies TEXT DEFAULT '',
  constraints TEXT DEFAULT '',
  expected_outcome TEXT DEFAULT '',
  judging_focus TEXT DEFAULT '',
  published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id TEXT UNIQUE,
  name TEXT NOT NULL,
  track TEXT NOT NULL DEFAULT 'Unassigned',
  abstract TEXT DEFAULT '',
  leader_id UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  problem_statement_id UUID REFERENCES public.problem_statements(id) ON DELETE SET NULL,
  shortlisted_round INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'MEMBER',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id,user_id)
);

CREATE TABLE IF NOT EXISTS public.team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  email TEXT,
  code TEXT,
  status TEXT DEFAULT 'PENDING',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  category TEXT DEFAULT 'Other',
  message TEXT NOT NULL,
  status TEXT DEFAULT 'OPEN',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  priority TEXT NOT NULL DEFAULT 'Normal',
  track TEXT NOT NULL DEFAULT 'All challenges',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS problem_statement_id UUID REFERENCES public.problem_statements(id) ON DELETE SET NULL;
ALTER TABLE public.teams ALTER COLUMN track SET DEFAULT 'Unassigned';


-- Registration fields and team round progression (safe for existing databases).
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS year TEXT;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS shortlisted_round INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'app_users_year_check'
  ) THEN
    ALTER TABLE public.app_users
      ADD CONSTRAINT app_users_year_check
      CHECK (year IS NULL OR year IN ('1st','2nd','3rd','4th'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teams_shortlisted_round_check'
  ) THEN
    ALTER TABLE public.teams
      ADD CONSTRAINT teams_shortlisted_round_check
      CHECK (shortlisted_round IS NULL OR shortlisted_round IN (2,3,4));
  END IF;
END $$;

-- Compatibility-safe capacity trigger: prevents a fifth member in normal concurrent inserts.
CREATE OR REPLACE FUNCTION public.enforce_team_capacity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE member_count INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.team_id::text));
  SELECT COUNT(*) INTO member_count FROM public.team_members WHERE team_id = NEW.team_id;
  IF member_count >= 4 THEN
    RAISE EXCEPTION 'TEAM_CAPACITY_EXCEEDED';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS team_capacity_trigger ON public.team_members;
CREATE TRIGGER team_capacity_trigger BEFORE INSERT ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.enforce_team_capacity();

-- Explicit server-side privileges. The NEXXUS backend uses the Supabase secret key,
-- which maps to the elevated service_role database role and bypasses RLS.
GRANT ALL ON TABLE public.app_users TO service_role;
GRANT ALL ON TABLE public.problem_statements TO service_role;
GRANT ALL ON TABLE public.teams TO service_role;
GRANT ALL ON TABLE public.team_members TO service_role;
GRANT ALL ON TABLE public.team_invitations TO service_role;
GRANT ALL ON TABLE public.support_tickets TO service_role;
GRANT ALL ON TABLE public.announcements TO service_role;

-- The Express server is the application security boundary. Keep public table access closed.
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.problem_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read users" ON public.app_users;
DROP POLICY IF EXISTS "Allow public insert users" ON public.app_users;
DROP POLICY IF EXISTS "Allow public update users" ON public.app_users;
DROP POLICY IF EXISTS "Allow public delete users" ON public.app_users;
DROP POLICY IF EXISTS "Allow public read teams" ON public.teams;
DROP POLICY IF EXISTS "Allow public insert teams" ON public.teams;
DROP POLICY IF EXISTS "Allow public update teams" ON public.teams;
DROP POLICY IF EXISTS "Allow public delete teams" ON public.teams;
DROP POLICY IF EXISTS "Allow public read members" ON public.team_members;
DROP POLICY IF EXISTS "Allow public insert members" ON public.team_members;
DROP POLICY IF EXISTS "Allow public update members" ON public.team_members;
DROP POLICY IF EXISTS "Allow public delete members" ON public.team_members;
DROP POLICY IF EXISTS "Allow public read announcements" ON public.announcements;
DROP POLICY IF EXISTS "Allow public insert announcements" ON public.announcements;
DROP POLICY IF EXISTS "Allow public update announcements" ON public.announcements;
DROP POLICY IF EXISTS "Allow public delete announcements" ON public.announcements;
DROP POLICY IF EXISTS "Allow public read tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Allow public insert tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Allow public update tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Allow public delete tickets" ON public.support_tickets;

-- Public users can only see published challenges and public announcements through the Express API.
-- No direct anon policies are created intentionally.

CREATE TABLE IF NOT EXISTS referral_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'created',
      'referrer_response',
      'submitted',
      'hr_decision',
      'converted',
      'status_change'
    )
  ),
  from_status TEXT CHECK (
    from_status IS NULL
    OR from_status IN (
      'requested',
      'declined',
      'in_progress',
      'submitted',
      'under_review',
      'interview',
      'rejected',
      'hired',
      'converted'
    )
  ),
  to_status TEXT CHECK (
    to_status IS NULL
    OR to_status IN (
      'requested',
      'declined',
      'in_progress',
      'submitted',
      'under_review',
      'interview',
      'rejected',
      'hired',
      'converted'
    )
  ),
  note TEXT CHECK (char_length(note) <= 600),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS referral_events_referral_idx ON referral_events (referral_id, created_at);
CREATE INDEX IF NOT EXISTS referral_events_company_idx ON referral_events (company_id, created_at);

CREATE OR REPLACE FUNCTION create_referral_event_from_transition()
RETURNS TRIGGER AS $$
DECLARE
  event_type_value TEXT;
  actor_id_value UUID;
  note_value TEXT;
  metadata_value JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    actor_id_value := CASE
      WHEN NEW.initiated_by = 'applicant' THEN NEW.applicant_id
      ELSE NEW.referrer_id
    END;

    note_value := CASE
      WHEN NEW.applicant_note IS NULL OR btrim(NEW.applicant_note) = '' THEN NULL
      ELSE left(NEW.applicant_note, 600)
    END;

    metadata_value := jsonb_build_object('initiated_by', NEW.initiated_by);

    INSERT INTO referral_events (
      referral_id, company_id, actor_id, event_type, from_status, to_status, note, metadata
    ) VALUES (
      NEW.id, NEW.company_id, actor_id_value, 'created', NULL, NEW.status, note_value, metadata_value
    );
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'requested' AND NEW.status IN ('in_progress', 'declined') THEN
      event_type_value := 'referrer_response';
      actor_id_value := NEW.referrer_id;
      note_value := CASE WHEN NEW.status = 'declined' THEN 'Referrer declined request' ELSE 'Referrer accepted request' END;
      metadata_value := '{}'::jsonb;
    ELSIF OLD.status = 'in_progress' AND NEW.status = 'submitted' THEN
      event_type_value := 'submitted';
      actor_id_value := NEW.referrer_id;
      note_value := CASE
        WHEN NEW.recommendation_text IS NULL OR btrim(NEW.recommendation_text) = '' THEN 'Referral submitted'
        ELSE left(NEW.recommendation_text, 600)
      END;
      metadata_value := jsonb_build_object(
        'overall_rating', NEW.overall_rating,
        'relationship_type', NEW.relationship_type
      );
    ELSIF NEW.status IN ('under_review', 'interview', 'rejected', 'hired') THEN
      event_type_value := 'hr_decision';
      actor_id_value := NEW.hr_decision_by;
      note_value := CASE
        WHEN NEW.hr_decision_note IS NULL OR btrim(NEW.hr_decision_note) = '' THEN initcap(replace(NEW.status, '_', ' '))
        ELSE left(NEW.hr_decision_note, 600)
      END;
      metadata_value := '{}'::jsonb;
    ELSIF NEW.status = 'converted' THEN
      event_type_value := 'converted';
      actor_id_value := NEW.applicant_id;
      note_value := 'Applicant marked as converted';
      metadata_value := '{}'::jsonb;
    ELSE
      event_type_value := 'status_change';
      actor_id_value := NULL;
      note_value := NULL;
      metadata_value := '{}'::jsonb;
    END IF;

    INSERT INTO referral_events (
      referral_id, company_id, actor_id, event_type, from_status, to_status, note, metadata
    ) VALUES (
      NEW.id, NEW.company_id, actor_id_value, event_type_value, OLD.status, NEW.status, note_value, metadata_value
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS referral_events_on_referrals ON referrals;
CREATE TRIGGER referral_events_on_referrals
AFTER INSERT OR UPDATE OF status ON referrals
FOR EACH ROW EXECUTE FUNCTION create_referral_event_from_transition();

CREATE OR REPLACE FUNCTION prevent_referral_events_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'referral_events are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS referral_events_block_update ON referral_events;
DROP TRIGGER IF EXISTS referral_events_block_delete ON referral_events;

CREATE TRIGGER referral_events_block_update
BEFORE UPDATE ON referral_events
FOR EACH ROW EXECUTE FUNCTION prevent_referral_events_mutation();

CREATE TRIGGER referral_events_block_delete
BEFORE DELETE ON referral_events
FOR EACH ROW EXECUTE FUNCTION prevent_referral_events_mutation();

ALTER TABLE referral_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referral_events_read ON referral_events;
CREATE POLICY referral_events_read ON referral_events
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM referrals r
    WHERE r.id = referral_events.referral_id
      AND (
        r.applicant_id = (SELECT id FROM users WHERE auth_id = auth.uid())
        OR r.referrer_id = (SELECT id FROM users WHERE auth_id = auth.uid())
        OR r.company_id IN (
          SELECT company_id
          FROM company_members
          WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
            AND role IN ('hr', 'admin')
            AND confirmed = true
        )
      )
  )
);

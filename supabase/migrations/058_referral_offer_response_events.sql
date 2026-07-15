-- The 'requested' -> 'in_progress'/'declined' transition previously always
-- attributed the response to the referrer. Referrals can now also be
-- initiated by the referrer ("offer a referral"), in which case the
-- applicant is the one accepting or declining. Fix actor attribution to
-- match whichever party did NOT initiate the referral.
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
      actor_id_value := CASE WHEN NEW.initiated_by = 'referrer' THEN NEW.applicant_id ELSE NEW.referrer_id END;
      note_value := CASE
        WHEN NEW.initiated_by = 'referrer' THEN
          CASE WHEN NEW.status = 'declined' THEN 'Applicant declined referral offer' ELSE 'Applicant accepted referral offer' END
        ELSE
          CASE WHEN NEW.status = 'declined' THEN 'Referrer declined request' ELSE 'Referrer accepted request' END
      END;
      metadata_value := jsonb_build_object('initiated_by', NEW.initiated_by);
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

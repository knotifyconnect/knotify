-- Seed test users for Discover/Search testing.
-- Safe to run multiple times.

INSERT INTO users (
  id, auth_id, email, full_name, username, bio,
  location_city, location_lat, location_lng, location_point,
  status, university, current_company, contact_email,
  is_hr, referral_score, is_online
)
VALUES
  (
    '5fe264d8-6f93-4f7c-80b0-b4c36d7049a1',
    '9b6a35f1-a0ee-4b9f-9188-a9c64525a8d5',
    'lena.fischer@nodenet.test',
    'Lena Fischer',
    'lena_fischer',
    'Computer Science student focused on backend systems and distributed services.',
    'Munich', 48.1501, 11.5676,
    ST_SetSRID(ST_MakePoint(11.5676, 48.1501), 4326)::geography,
    'open_to_work', 'TUM', NULL, 'lena.fischer@nodenet.test',
    false, 0, false
  ),
  (
    '7f878987-358b-4f44-a66f-a8edfef6db37',
    'f9796775-a897-4417-9306-6fd5a6a8ff5f',
    'maximilian.weber@nodenet.test',
    'Maximilian Weber',
    'max_weber',
    'Junior frontend engineer building accessible React interfaces and design systems.',
    'Munich', 48.1379, 11.5754,
    ST_SetSRID(ST_MakePoint(11.5754, 48.1379), 4326)::geography,
    'employed', 'LMU Munich', 'Celonis', 'maximilian.weber@nodenet.test',
    false, 0, false
  ),
  (
    '70cb4c5f-c6e6-4436-a95e-cd703f4ae146',
    'bd166cea-bdcc-40f0-9938-aaea705ba8bc',
    'sophie.neumann@nodenet.test',
    'Sophie Neumann',
    'sophie_neumann',
    'Data analyst experienced in Python, SQL, and experimentation for product teams.',
    'Munich', 48.1284, 11.6021,
    ST_SetSRID(ST_MakePoint(11.6021, 48.1284), 4326)::geography,
    'open_to_work', 'TUM', 'Personio', 'sophie.neumann@nodenet.test',
    false, 0, false
  ),
  (
    'f42c7520-77a7-4c1e-a5bf-aa2b975a0b2c',
    '60a84d9f-2fca-4e81-9915-4e0b6311fe4f',
    'jonas.keller@nodenet.test',
    'Jonas Keller',
    'jonas_keller',
    'Machine learning engineer working on recommendation systems and model deployment.',
    'Munich', 48.1762, 11.5598,
    ST_SetSRID(ST_MakePoint(11.5598, 48.1762), 4326)::geography,
    'employed', 'TU Munich', 'BMW Group', 'jonas.keller@nodenet.test',
    false, 0, false
  ),
  (
    '74f3368d-739a-485a-a83e-f0bd714f2c9f',
    '14c43450-d829-4d90-a981-eb99216c85b8',
    'amina.haddad@nodenet.test',
    'Amina Haddad',
    'amina_haddad',
    'Business informatics graduate interested in product operations and growth.',
    'Munich', 48.1415, 11.5332,
    ST_SetSRID(ST_MakePoint(11.5332, 48.1415), 4326)::geography,
    'studying', 'HM Munich', NULL, 'amina.haddad@nodenet.test',
    false, 0, false
  )
ON CONFLICT (username) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  bio = EXCLUDED.bio,
  location_city = EXCLUDED.location_city,
  location_lat = EXCLUDED.location_lat,
  location_lng = EXCLUDED.location_lng,
  location_point = EXCLUDED.location_point,
  status = EXCLUDED.status,
  university = EXCLUDED.university,
  current_company = EXCLUDED.current_company,
  updated_at = NOW();

INSERT INTO skills (user_id, name, category, source, is_verified)
SELECT *
FROM (
  VALUES
    ('5fe264d8-6f93-4f7c-80b0-b4c36d7049a1'::uuid, 'Node.js', 'technical', 'manual', true),
    ('5fe264d8-6f93-4f7c-80b0-b4c36d7049a1'::uuid, 'PostgreSQL', 'technical', 'manual', true),
    ('7f878987-358b-4f44-a66f-a8edfef6db37'::uuid, 'React', 'technical', 'manual', true),
    ('7f878987-358b-4f44-a66f-a8edfef6db37'::uuid, 'Accessibility', 'soft', 'manual', false),
    ('70cb4c5f-c6e6-4436-a95e-cd703f4ae146'::uuid, 'Python', 'technical', 'manual', true),
    ('70cb4c5f-c6e6-4436-a95e-cd703f4ae146'::uuid, 'SQL', 'technical', 'manual', true),
    ('f42c7520-77a7-4c1e-a5bf-aa2b975a0b2c'::uuid, 'Machine Learning', 'technical', 'manual', true),
    ('74f3368d-739a-485a-a83e-f0bd714f2c9f'::uuid, 'Product Operations', 'domain', 'manual', false)
) AS v(user_id, name, category, source, is_verified)
WHERE NOT EXISTS (
  SELECT 1 FROM skills s
  WHERE s.user_id = v.user_id AND s.name = v.name
);

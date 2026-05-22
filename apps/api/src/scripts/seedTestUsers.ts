import 'dotenv/config'
import { pool } from '../db/pool.js'

type SeedUser = {
  id: string
  authId: string
  email: string
  fullName: string
  username: string
  bio: string
  status: 'studying' | 'open_to_work' | 'employed'
  university: string | null
  currentCompany: string | null
  locationLat: number
  locationLng: number
}

const users: SeedUser[] = [
  {
    id: '5fe264d8-6f93-4f7c-80b0-b4c36d7049a1',
    authId: '9b6a35f1-a0ee-4b9f-9188-a9c64525a8d5',
    email: 'lena.fischer@nodenet.test',
    fullName: 'Lena Fischer',
    username: 'lena_fischer',
    bio: 'Computer Science student focused on backend systems and distributed services.',
    status: 'open_to_work',
    university: 'TUM',
    currentCompany: null,
    locationLat: 48.1501,
    locationLng: 11.5676,
  },
  {
    id: '7f878987-358b-4f44-a66f-a8edfef6db37',
    authId: 'f9796775-a897-4417-9306-6fd5a6a8ff5f',
    email: 'maximilian.weber@nodenet.test',
    fullName: 'Maximilian Weber',
    username: 'max_weber',
    bio: 'Junior frontend engineer building accessible React interfaces and design systems.',
    status: 'employed',
    university: 'LMU Munich',
    currentCompany: 'Celonis',
    locationLat: 48.1379,
    locationLng: 11.5754,
  },
  {
    id: '70cb4c5f-c6e6-4436-a95e-cd703f4ae146',
    authId: 'bd166cea-bdcc-40f0-9938-aaea705ba8bc',
    email: 'sophie.neumann@nodenet.test',
    fullName: 'Sophie Neumann',
    username: 'sophie_neumann',
    bio: 'Data analyst experienced in Python, SQL, and experimentation for product teams.',
    status: 'open_to_work',
    university: 'TUM',
    currentCompany: 'Personio',
    locationLat: 48.1284,
    locationLng: 11.6021,
  },
  {
    id: 'f42c7520-77a7-4c1e-a5bf-aa2b975a0b2c',
    authId: '60a84d9f-2fca-4e81-9915-4e0b6311fe4f',
    email: 'jonas.keller@nodenet.test',
    fullName: 'Jonas Keller',
    username: 'jonas_keller',
    bio: 'Machine learning engineer working on recommendation systems and model deployment.',
    status: 'employed',
    university: 'TU Munich',
    currentCompany: 'BMW Group',
    locationLat: 48.1762,
    locationLng: 11.5598,
  },
  {
    id: '74f3368d-739a-485a-a83e-f0bd714f2c9f',
    authId: '14c43450-d829-4d90-a981-eb99216c85b8',
    email: 'amina.haddad@nodenet.test',
    fullName: 'Amina Haddad',
    username: 'amina_haddad',
    bio: 'Business informatics graduate interested in product operations and growth.',
    status: 'studying',
    university: 'HM Munich',
    currentCompany: null,
    locationLat: 48.1415,
    locationLng: 11.5332,
  },
]

const skills = [
  { userId: users[0].id, name: 'Node.js', category: 'technical', isVerified: true },
  { userId: users[0].id, name: 'PostgreSQL', category: 'technical', isVerified: true },
  { userId: users[1].id, name: 'React', category: 'technical', isVerified: true },
  { userId: users[1].id, name: 'Accessibility', category: 'soft', isVerified: false },
  { userId: users[2].id, name: 'Python', category: 'technical', isVerified: true },
  { userId: users[2].id, name: 'SQL', category: 'technical', isVerified: true },
  { userId: users[3].id, name: 'Machine Learning', category: 'technical', isVerified: true },
  { userId: users[4].id, name: 'Product Operations', category: 'domain', isVerified: false },
]

async function seed() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    for (const user of users) {
      await client.query(
        `INSERT INTO users (
          id, auth_id, email, full_name, username, bio, location_city, location_lat, location_lng,
          location_point, status, university, current_company, contact_email, is_hr, referral_score, is_online
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 'Munich', $7, $8,
          ST_SetSRID(ST_MakePoint($8, $7), 4326)::geography, $9, $10, $11, $3, false, 0, false
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
          updated_at = NOW()`,
        [
          user.id,
          user.authId,
          user.email,
          user.fullName,
          user.username,
          user.bio,
          user.locationLat,
          user.locationLng,
          user.status,
          user.university,
          user.currentCompany,
        ]
      )
    }

    for (const skill of skills) {
      await client.query(
        `INSERT INTO skills (user_id, name, category, source, is_verified)
         VALUES ($1, $2, $3, 'manual', $4)
         ON CONFLICT DO NOTHING`,
        [skill.userId, skill.name, skill.category, skill.isVerified]
      )
    }

    await client.query('COMMIT')
    console.log(`Seeded ${users.length} users and ${skills.length} skills.`)
    console.log('Usernames:', users.map((u) => `@${u.username}`).join(', '))
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

seed().catch((error) => {
  console.error(error)
  process.exit(1)
})

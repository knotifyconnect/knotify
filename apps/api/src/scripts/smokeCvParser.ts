import { analyseCv } from '../services/cvAnalysis.js'

function assert(
  condition: unknown,
  message: string
): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

async function main() {
  const completeCv = `
Jay Example
Product Analyst
jay@example.com

PROFILE
Product analyst focused on experimentation, dashboards, and product decisions.

EXPERIENCE
Product Analyst | Acme GmbH
Jan 2023 - Present
â€¢ Built product dashboards and analysed experiments.

EDUCATION
Technical University of Munich
M.Sc. Consumer Science
2021 - 2023

SKILLS
SQL, Python, Tableau, Stakeholder Management

LANGUAGES
English C1, German B2
`

  const result = await analyseCv(completeCv)

  assert(result.provider === 'local', 'Provider must be local')
  assert(
    result.profileExtract.headline === 'Product Analyst',
    'Explicit headline was not extracted'
  )
  assert(
    result.profileExtract.bio?.startsWith(
      'Product analyst focused'
    ),
    'Explicit profile summary was not extracted'
  )
  assert(
    result.profileExtract.education.length === 1,
    'Expected one education entry'
  )
  assert(
    result.profileExtract.education[0].institution.includes(
      'Technical University'
    ),
    'Education institution was not extracted'
  )
  assert(
    result.profileExtract.experience.length === 1,
    'Expected one experience entry'
  )
  assert(
    result.profileExtract.experience[0].company === 'Acme GmbH',
    'Experience company was not extracted'
  )
  assert(
    result.profileExtract.experience[0].role ===
      'Product Analyst',
    'Experience role was not extracted'
  )
  assert(
    result.extractedSkills.some(
      (skill) => skill.name === 'SQL'
    ),
    'SQL was not extracted'
  )
  assert(
    result.extractedSkills.some(
      (skill) =>
        skill.name === 'English' &&
        skill.category === 'language'
    ),
    'English was not extracted as a language'
  )
  assert(
    result.extractedSkills.some(
      (skill) =>
        skill.name === 'German' &&
        skill.category === 'language'
    ),
    'German was not extracted as a language'
  )

  const minimalCv = await analyseCv(`
SKILLS
Python
`)

  assert(
    minimalCv.profileExtract.education.length === 0,
    'Parser invented education'
  )
  assert(
    minimalCv.profileExtract.experience.length === 0,
    'Parser invented experience'
  )
  assert(
    minimalCv.profileExtract.bio === null,
    'Parser invented a bio'
  )
  assert(
    minimalCv.profileExtract.headline === null,
    'Parser invented a headline'
  )

  console.log('LOCAL CV PARSER SMOKE: PASS')
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : String(error)
  )
  process.exitCode = 1
})

import { createSyntheticPdf } from '../../document/__fixtures__/syntheticPdf.js'

export const englishCvFixture = createSyntheticPdf([
  {
    text: [
      { text: 'JAY EXAMPLE', x: 72, y: 755, size: 18 },
      { text: 'Product Analyst', x: 72, y: 730, size: 12 },
      { text: 'SUMMARY', x: 72, y: 695, size: 13 },
      {
        text: 'Product analyst focused on evidence-based decisions.',
        x: 72,
        y: 672,
      },
      { text: 'EXPERIENCE', x: 72, y: 635, size: 13 },
      { text: 'Product Analyst', x: 72, y: 612 },
      { text: 'Acme GmbH', x: 72, y: 592 },
      { text: 'Jan 2023 - Present', x: 72, y: 572 },
      { text: 'Built product dashboards.', x: 72, y: 552 },
      { text: 'Business Analyst', x: 72, y: 512 },
      { text: 'Beta AG', x: 72, y: 492 },
      { text: '2021 - 2022', x: 72, y: 472 },
      { text: 'Analysed customer journeys.', x: 72, y: 452 },
      { text: 'EDUCATION', x: 72, y: 410, size: 13 },
      {
        text: 'Technical University of Munich',
        x: 72,
        y: 387,
      },
      { text: 'M.Sc. Consumer Science', x: 72, y: 367 },
      { text: '2019 - 2021', x: 72, y: 347 },
      { text: 'SKILLS', x: 72, y: 305, size: 13 },
      { text: 'SQL, Python, Tableau', x: 72, y: 282 },
      { text: 'LANGUAGES', x: 72, y: 240, size: 13 },
      { text: 'English C1', x: 72, y: 217 },
      { text: 'German B2', x: 72, y: 197 },
    ],
  },
])

export const germanCvFixture = createSyntheticPdf([
  {
    text: [
      { text: 'MAX MUSTER', x: 72, y: 750, size: 18 },
      { text: 'KURZPROFIL', x: 72, y: 710, size: 13 },
      {
        text: 'Datenanalyst mit Erfahrung in Reporting.',
        x: 72,
        y: 687,
      },
      { text: 'BERUFSERFAHRUNG', x: 72, y: 645, size: 13 },
      { text: 'Data Analyst', x: 72, y: 622 },
      { text: 'Beispiel AG', x: 72, y: 602 },
      { text: '03/2020 - 12/2022', x: 72, y: 582 },
      { text: 'AUSBILDUNG', x: 72, y: 540, size: 13 },
      {
        text: 'Technische Universitaet Muenchen',
        x: 72,
        y: 517,
      },
      { text: 'M.Sc. Informatik', x: 72, y: 497 },
      { text: '2018 - 2020', x: 72, y: 477 },
      { text: 'KENNTNISSE', x: 72, y: 435, size: 13 },
      { text: 'SQL; Python', x: 72, y: 412 },
      { text: 'SPRACHKENNTNISSE', x: 72, y: 370, size: 13 },
      { text: 'Deutsch Muttersprache', x: 72, y: 347 },
      { text: 'Englisch C1', x: 72, y: 327 },
    ],
  },
])

export const undatedCvFixture = createSyntheticPdf([
  {
    text: [
      { text: 'SAM EXAMPLE', x: 72, y: 750, size: 18 },
      { text: 'EXPERIENCE', x: 72, y: 710, size: 13 },
      { text: 'Freelance Consultant', x: 72, y: 682 },
      { text: 'Independent', x: 72, y: 662 },
      { text: 'Supported early-stage teams.', x: 72, y: 642 },
    ],
  },
])
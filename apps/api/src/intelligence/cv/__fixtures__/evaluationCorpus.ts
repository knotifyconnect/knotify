import { createSyntheticPdf } from '../../document/__fixtures__/syntheticPdf.js'

export interface CvEvaluationPdfFixture {
  id: string
  buffer: Buffer
}

export const cvEvaluationPdfFixtures: CvEvaluationPdfFixture[] = [
  {
    id: 'english-one-column',
    buffer: createSyntheticPdf([
      {
        text: [
          { text: 'JAY EXAMPLE', x: 72, y: 755, size: 18 },
          { text: 'SUMMARY', x: 72, y: 715, size: 13 },
          { text: 'Product analyst focused on evidence.', x: 72, y: 692 },
          { text: 'EXPERIENCE', x: 72, y: 650, size: 13 },
          { text: 'Product Analyst', x: 72, y: 627 },
          { text: 'Acme GmbH', x: 72, y: 607 },
          { text: 'Jan 2023 - Present', x: 72, y: 587 },
          { text: 'Business Analyst', x: 72, y: 547 },
          { text: 'Beta AG', x: 72, y: 527 },
          { text: '2021 - 2022', x: 72, y: 507 },
          { text: 'EDUCATION', x: 72, y: 465, size: 13 },
          { text: 'Technical University of Munich', x: 72, y: 442 },
          { text: 'M.Sc. Consumer Science', x: 72, y: 422 },
          { text: '2019 - 2021', x: 72, y: 402 },
          { text: 'SKILLS', x: 72, y: 360, size: 13 },
          { text: 'SQL, Python, Tableau', x: 72, y: 337 },
          { text: 'LANGUAGES', x: 72, y: 295, size: 13 },
          { text: 'English C1', x: 72, y: 272 },
          { text: 'German B2', x: 72, y: 252 },
        ],
      },
    ]),
  },
  {
    id: 'english-two-column-right-dates',
    buffer: createSyntheticPdf([
      {
        text: [
          { text: 'ALEX EXAMPLE', x: 220, y: 755, size: 18 },
          { text: 'SKILLS', x: 58, y: 705, size: 13 },
          { text: 'TypeScript', x: 58, y: 680 },
          { text: 'PostgreSQL', x: 58, y: 660 },
          { text: 'LANGUAGES', x: 58, y: 620, size: 13 },
          { text: 'English C2', x: 58, y: 595 },
          { text: 'German B1', x: 58, y: 575 },
          { text: 'EXPERIENCE', x: 330, y: 705, size: 13 },
          { text: 'Acme GmbH', x: 330, y: 680 },
          { text: 'Senior Engineer', x: 330, y: 660 },
          { text: 'Feb 2022 - Present', x: 470, y: 640 },
          { text: 'Beta Labs', x: 330, y: 600 },
          { text: 'Software Engineer', x: 330, y: 580 },
          { text: '2019 - 2021', x: 470, y: 560 },
          { text: 'EDUCATION', x: 330, y: 515, size: 13 },
          { text: 'Example University', x: 330, y: 490 },
          { text: 'B.Sc. Computer Science', x: 330, y: 470 },
          { text: '2015 - 2019', x: 470, y: 450 },
        ],
      },
    ]),
  },
  {
    id: 'german-named-months',
    buffer: createSyntheticPdf([
      {
        text: [
          { text: 'MAX MUSTER', x: 72, y: 755, size: 18 },
          { text: 'PRAXISERFAHRUNG', x: 72, y: 710, size: 13 },
          { text: 'Data Analyst', x: 72, y: 687 },
          { text: 'Beispiel AG', x: 72, y: 667 },
          { text: 'Maerz 2020 - gegenwaertig', x: 72, y: 647 },
          { text: 'AKADEMISCHER WERDEGANG', x: 72, y: 605, size: 13 },
          { text: 'Technische Universitaet Muenchen', x: 72, y: 582 },
          { text: 'M.Sc. Informatik', x: 72, y: 562 },
          { text: '2018 - 2020', x: 72, y: 542 },
          { text: 'KENNTNISSE', x: 72, y: 500, size: 13 },
          { text: 'SQL; Python', x: 72, y: 477 },
          { text: 'SPRACHKENNTNISSE', x: 72, y: 435, size: 13 },
          { text: 'Deutsch Muttersprache', x: 72, y: 412 },
          { text: 'Englisch fliessend', x: 72, y: 392 },
        ],
      },
    ]),
  },
  {
    id: 'unusual-headings-undated',
    buffer: createSyntheticPdf([
      {
        text: [
          { text: 'SAM EXAMPLE', x: 72, y: 755, size: 18 },
          { text: 'CAREER HISTORY', x: 72, y: 710, size: 13 },
          { text: 'Independent', x: 72, y: 687 },
          { text: 'Freelance Consultant', x: 72, y: 667 },
          { text: 'Supported early-stage teams.', x: 72, y: 647 },
          { text: 'ACADEMIC BACKGROUND', x: 72, y: 605, size: 13 },
          { text: 'Example College', x: 72, y: 582 },
          { text: 'B.A. Economics', x: 72, y: 562 },
        ],
      },
    ]),
  },
  {
    id: 'table-multiple-degrees',
    buffer: createSyntheticPdf([
      {
        text: [
          { text: 'TAYLOR EXAMPLE', x: 72, y: 755, size: 18 },
          { text: 'EDUCATION', x: 72, y: 710, size: 13 },
          { text: 'Example University', x: 72, y: 680 },
          { text: 'M.Sc. Data Science', x: 270, y: 680 },
          { text: '2020 - 2022', x: 480, y: 680 },
          { text: 'Example College', x: 72, y: 640 },
          { text: 'B.Sc. Statistics', x: 270, y: 640 },
          { text: '2016 - 2020', x: 480, y: 640 },
        ],
      },
    ]),
  },
  {
    id: 'multi-page-cv',
    buffer: createSyntheticPdf([
      {
        text: [
          { text: 'MORGAN EXAMPLE', x: 72, y: 755, size: 18 },
          { text: 'EXPERIENCE', x: 72, y: 710, size: 13 },
          { text: 'Product Manager', x: 72, y: 687 },
          { text: 'Northstar GmbH', x: 72, y: 667 },
          { text: '2022 - Present', x: 72, y: 647 },
        ],
      },
      {
        text: [
          { text: 'EXPERIENCE', x: 72, y: 755, size: 13 },
          { text: 'Business Analyst', x: 72, y: 732 },
          { text: 'Southstar AG', x: 72, y: 712 },
          { text: '2019 - 2021', x: 72, y: 692 },
          { text: 'EDUCATION', x: 72, y: 650, size: 13 },
          { text: 'Example University', x: 72, y: 627 },
          { text: 'M.A. Management', x: 72, y: 607 },
          { text: '2017 - 2019', x: 72, y: 587 },
        ],
      },
    ]),
  },
  {
    id: 'icons-and-proficiency',
    buffer: createSyntheticPdf([
      {
        rectangles: [
          { x: 54, y: 696, width: 8, height: 8 },
          { x: 54, y: 656, width: 8, height: 8 },
          { x: 54, y: 596, width: 8, height: 8 },
        ],
        text: [
          { text: 'CASEY EXAMPLE', x: 72, y: 755, size: 18 },
          { text: 'SKILLS', x: 72, y: 710, size: 13 },
          { text: 'Research | Facilitation', x: 72, y: 687 },
          { text: 'LANGUAGES', x: 72, y: 647, size: 13 },
          { text: 'French (C1)', x: 72, y: 624 },
          { text: 'Spanish intermediate', x: 72, y: 604 },
          { text: 'EXPERIENCE', x: 72, y: 562, size: 13 },
          { text: 'Researcher', x: 72, y: 539 },
          { text: 'Example Institute', x: 72, y: 519 },
          { text: '2020 - 2023', x: 72, y: 499 },
        ],
      },
    ]),
  },

  {
    id: 'nested-employer-education-boundary',
    buffer: createSyntheticPdf([
      {
        text: [
          { text: 'JORDAN EXAMPLE', x: 72, y: 755, size: 18 },
          { text: 'PROFILE SUMMARY', x: 72, y: 725, size: 13 },
          { text: 'Analytical operator focused on execution.', x: 72, y: 705 },
          { text: 'SKILLS', x: 72, y: 675, size: 13 },
          { text: 'Tools: Excel (advanced), Power BI', x: 90, y: 655 },
          { text: 'EXPERIENCE', x: 72, y: 625, size: 13 },
          { text: '> Acme Mobility GmbH, Munich, Germany', x: 72, y: 605 },
          { text: 'Working Student - Project Management | March 2022 - Present', x: 90, y: 585 },
          { text: 'Internship - Project Management | October 2021 - February 2022', x: 90, y: 565 },
          { text: '* Prepared presentations and decision briefs.', x: 90, y: 545 },
          { text: '> Beta Logistics GmbH, Munich, Germany', x: 72, y: 515 },
          { text: 'Working Student - Logistics Operation | July 2020 - March 2021', x: 90, y: 495 },
          { text: '> Gamma Electronics, Test City (Founder Start-up) | September 2017 - February 2018', x: 72, y: 465 },
          { text: 'EDUCATION', x: 72, y: 425, size: 13 },
          { text: '> Technical University of Example, Germany', x: 72, y: 405 },
          { text: 'M.Sc. in Consumer Science | October 2023 - Present', x: 90, y: 385 },
          { text: '* Coursework: Analytics and research.', x: 90, y: 365 },
          { text: '> Example University, Germany', x: 72, y: 335 },
          { text: 'B.Eng. Industrial Engineering | October 2018 - September 2023', x: 90, y: 315 },
          { text: '> Example Institute, India', x: 72, y: 285 },
          { text: 'Diploma in Mechanical Engineering | July 2014 - June 2017', x: 90, y: 265 },
          { text: 'LANGUAGES', x: 72, y: 225, size: 13 },
          { text: 'English (Fluent) | German (B2)', x: 90, y: 205 },
          { text: 'INTERESTS', x: 72, y: 165, size: 13 },
          { text: 'Startups | Photography | Reading', x: 90, y: 145 },
        ],
      },
    ]),
  },

  {
    id: 'hierarchical-multi-entry-boundaries',
    buffer: createSyntheticPdf([
      {
        text: [
          { text: 'ALEX EXAMPLE', x: 72, y: 755, size: 18 },
          { text: 'PROFESSIONAL EXPERIENCE', x: 72, y: 715, size: 13 },
          { text: '> Example Automotive GmbH, Munich, Germany', x: 72, y: 685 },
          { text: 'Working Student PM | March 2022 - Present Internship PM | October 2021 - February 2022', x: 90, y: 660 },
          { text: '* Supported cross-functional projects.', x: 90, y: 635 },
          { text: '> Investment Analyst, Private | April 2019 - Present', x: 72, y: 600 },
          { text: '* Conduct personal investment research.', x: 90, y: 575 },
          { text: '> Example Electronics, Surat, India (Start-up) | September 2017 - February 2018', x: 72, y: 540 },
        ],
      },
      {
        text: [
          { text: 'EDUCATION', x: 72, y: 755, size: 13 },
          { text: '> Example Technical University, Germany', x: 72, y: 725 },
          { text: 'M.Sc. in Consumer Science | October 2023 - Present', x: 90, y: 700 },
          { text: '* Notable Project: Market analysis.', x: 90, y: 675 },
          { text: '> Example University, Germany', x: 72, y: 640 },
          { text: 'B.Eng. Industrial Engineering | October 2018 - September 2023', x: 90, y: 615 },
          { text: '* Bachelor thesis: Oil markets.', x: 90, y: 590 },
          { text: 'KEY ACHIEVEMENTS & EXTRACURRICULARS', x: 72, y: 545, size: 13 },
          { text: '* Market Maker Trading Simulation', x: 90, y: 520 },
          { text: '* Startup, Example Electronics (2017-18)', x: 90, y: 495 },
        ],
      },
    ]),
  },
  {
    id: 'wrapped-continuation-lines',
    buffer: createSyntheticPdf([
      {
        text: [
          { text: 'RILEY EXAMPLE', x: 72, y: 755, size: 18 },
          { text: 'EDUCATION', x: 72, y: 715, size: 13 },
          { text: '> Example Technical University, Germany', x: 72, y: 685 },
          { text: 'M.Sc. Energy Systems | October 2020 - September 2022', x: 90, y: 660 },
          { text: '* Notable Project:', x: 90, y: 635 },
          { text: 'Hybrid Redox Flow Battery - Conducted R&D on electrolyte flow.', x: 108, y: 618 },
          { text: '> Example Applied University, Germany', x: 72, y: 588 },
          { text: 'B.Eng. Chemical Engineering | October 2016 - September 2020', x: 90, y: 563 },
          { text: '* Research focus: electro-', x: 90, y: 538 },
          { text: 'chemical storage systems for long-duration energy.', x: 108, y: 521 },
          { text: 'KEY ACHIEVEMENTS & EXTRACURRICULARS', x: 72, y: 480, size: 13 },
          { text: '* Market Maker Trading Simulation', x: 90, y: 455 },
        ],
      },
    ]),
  },

]

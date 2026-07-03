export interface SyntheticPdfText {
  text: string
  x: number
  y: number
  size?: number
}

export interface SyntheticPdfRectangle {
  x: number
  y: number
  width: number
  height: number
}

export interface SyntheticPdfPage {
  width?: number
  height?: number
  text: SyntheticPdfText[]
  rectangles?: SyntheticPdfRectangle[]
}

function escapePdfText(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

function contentStream(page: SyntheticPdfPage) {
  const rectangles = (page.rectangles ?? []).map((item) =>
    [
      'q',
      '0.5 w',
      `${item.x} ${item.y} ${item.width} ${item.height} re`,
      'S',
      'Q',
    ].join('\n')
  )
  const text = page.text
    .map((item) => {
      const size = item.size ?? 11
      return [
        'BT',
        `/F1 ${size} Tf`,
        `1 0 0 1 ${item.x} ${item.y} Tm`,
        `(${escapePdfText(item.text)}) Tj`,
        'ET',
      ].join('\n')
    })

  return [...rectangles, ...text].join('\n')
}

export function createSyntheticPdf(
  pages: SyntheticPdfPage[]
): Buffer {
  if (pages.length === 0) {
    throw new Error('A synthetic PDF requires at least one page')
  }

  const objects: string[] = []
  const pageObjectNumbers: number[] = []
  const contentObjectNumbers: number[] = []
  const fontObjectNumber = 3 + pages.length * 2

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'

  pages.forEach((_page, index) => {
    pageObjectNumbers.push(3 + index * 2)
    contentObjectNumbers.push(4 + index * 2)
  })

  objects[2] = [
    '<< /Type /Pages',
    `/Count ${pages.length}`,
    `/Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(' ')}]`,
    '>>',
  ].join(' ')

  pages.forEach((page, index) => {
    const pageObjectNumber = pageObjectNumbers[index]
    const contentObjectNumber = contentObjectNumbers[index]
    const width = page.width ?? 612
    const height = page.height ?? 792
    const stream = contentStream(page).replace(/\n/g, '\r\n')
    const streamLength = Buffer.byteLength(stream, 'ascii')

    objects[pageObjectNumber] = [
      '<< /Type /Page',
      '/Parent 2 0 R',
      `/MediaBox [0 0 ${width} ${height}]`,
      `/Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >>`,
      `/Contents ${contentObjectNumber} 0 R`,
      '>>',
    ].join(' ')

    objects[contentObjectNumber] = [
      `<< /Length ${streamLength} >>`,
      'stream',
      stream,
      'endstream',
    ].join('\r\n')
  })

  objects[fontObjectNumber] =
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'

  const chunks: Buffer[] = [
    Buffer.from('%PDF-1.4\r\n', 'ascii'),
    Buffer.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0d, 0x0a]),
  ]
  const offsets: number[] = [0]
  let byteLength = chunks.reduce(
    (total, chunk) => total + chunk.length,
    0
  )

  for (let index = 1; index < objects.length; index += 1) {
    const object = objects[index]
    if (!object) continue

    offsets[index] = byteLength
    const chunk = Buffer.from(
      `${index} 0 obj\r\n${object}\r\nendobj\r\n`,
      'ascii'
    )
    chunks.push(chunk)
    byteLength += chunk.length
  }

  const xrefOffset = byteLength
  const xrefLines = [
    'xref',
    `0 ${objects.length}`,
    '0000000000 65535 f',
  ]

  for (let index = 1; index < objects.length; index += 1) {
    xrefLines.push(
      `${String(offsets[index] ?? 0).padStart(10, '0')} 00000 n`
    )
  }

  xrefLines.push(
    'trailer',
    `<< /Size ${objects.length} /Root 1 0 R >>`,
    'startxref',
    String(xrefOffset),
    '%%EOF',
    ''
  )

  chunks.push(Buffer.from(xrefLines.join('\r\n'), 'ascii'))

  return Buffer.concat(chunks)
}

export const oneColumnFixture = createSyntheticPdf([
  {
    text: [
      { text: 'JAY EXAMPLE', x: 72, y: 740, size: 18 },
      { text: 'EXPERIENCE', x: 72, y: 700, size: 13 },
      { text: 'Product Analyst', x: 72, y: 675 },
      { text: 'Acme GmbH', x: 72, y: 655 },
      { text: '2023 - Present', x: 72, y: 635 },
      { text: 'EDUCATION', x: 72, y: 590, size: 13 },
      { text: 'Technical University of Munich', x: 72, y: 565 },
    ],
  },
])

export const twoColumnFixture = createSyntheticPdf([
  {
    text: [
      {
        text: 'JAY EXAMPLE - PRODUCT ANALYST',
        x: 180,
        y: 750,
        size: 18,
      },
      { text: 'SKILLS', x: 60, y: 700, size: 13 },
      { text: 'SQL', x: 60, y: 675 },
      { text: 'Python', x: 60, y: 655 },
      { text: 'Tableau', x: 60, y: 635 },
      { text: 'LANGUAGES', x: 60, y: 595, size: 13 },
      { text: 'English C1', x: 60, y: 570 },
      { text: 'German B2', x: 60, y: 550 },
      { text: 'EXPERIENCE', x: 340, y: 700, size: 13 },
      { text: 'Product Analyst', x: 340, y: 675 },
      { text: 'Acme GmbH', x: 340, y: 655 },
      { text: '2023 - Present', x: 340, y: 635 },
      { text: 'EDUCATION', x: 340, y: 595, size: 13 },
      {
        text: 'Technical University of Munich',
        x: 340,
        y: 570,
      },
      { text: 'M.Sc. Consumer Science', x: 340, y: 550 },
    ],
  },
])

export const rightAlignedDatesFixture = createSyntheticPdf([
  {
    text: [
      { text: 'JAY EXAMPLE', x: 72, y: 750, size: 18 },
      { text: 'EXPERIENCE', x: 72, y: 710, size: 13 },
      { text: 'Product Analyst - Acme GmbH', x: 72, y: 680 },
      { text: '2023 - Present', x: 470, y: 680 },
      { text: 'Business Analyst - Beta AG', x: 72, y: 640 },
      { text: '2021 - 2023', x: 470, y: 640 },
      { text: 'Research Assistant - University', x: 72, y: 600 },
      { text: '2019 - 2021', x: 470, y: 600 },
      { text: 'Intern - Example Labs', x: 72, y: 560 },
      { text: '2018 - 2019', x: 470, y: 560 },
    ],
  },
])

export const multiPageFixture = createSyntheticPdf([
  {
    text: [
      { text: 'PAGE ONE', x: 72, y: 740, size: 16 },
      { text: 'First page content', x: 72, y: 700 },
    ],
  },
  {
    text: [
      { text: 'PAGE TWO', x: 72, y: 740, size: 16 },
      { text: 'Second page content', x: 72, y: 700 },
    ],
  },
])
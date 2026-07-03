export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface DocumentSpan extends BoundingBox {
  id: string
  page: number
  text: string
  fontSize: number
  fontName: string | null
  sourceOrder: number
}

export interface ExtractedDocumentPage {
  page: number
  width: number
  height: number
  spans: DocumentSpan[]
}

export interface ExtractedDocumentLayout {
  pageCount: number
  pages: ExtractedDocumentPage[]
}

export interface DetectedColumn {
  index: number
  x: number
  width: number
}

export interface DocumentLine extends BoundingBox {
  id: string
  page: number
  column: number
  text: string
  spans: DocumentSpan[]
  sourceOrder: number
  readingOrder: number
}

export type DocumentBlockKind =
  | 'heading'
  | 'paragraph'
  | 'list-item'
  | 'unknown'

export interface DocumentBlock extends BoundingBox {
  id: string
  page: number
  column: number
  kind: DocumentBlockKind
  text: string
  lines: DocumentLine[]
  sourceOrder: number
  readingOrder: number
}

export interface StructuredDocumentPage {
  page: number
  width: number
  height: number
  columns: DetectedColumn[]
  spans: DocumentSpan[]
  lines: DocumentLine[]
  blocks: DocumentBlock[]
}

export interface StructuredDocument {
  version: '1.0'
  pageCount: number
  pages: StructuredDocumentPage[]
  blocks: DocumentBlock[]
}
const value = (input: string | undefined, fallback: string) => input?.trim() || fallback

export const LEGAL = {
  operatorName: value(import.meta.env.VITE_LEGAL_OPERATOR_NAME, 'knotify'),
  representative: value(import.meta.env.VITE_LEGAL_REPRESENTATIVE, 'knotify project team'),
  street: value(import.meta.env.VITE_LEGAL_STREET, ''),
  postalCode: value(import.meta.env.VITE_LEGAL_POSTAL_CODE, ''),
  city: value(import.meta.env.VITE_LEGAL_CITY, 'Munich'),
  country: value(import.meta.env.VITE_LEGAL_COUNTRY, 'Germany'),
  email: value(import.meta.env.VITE_LEGAL_EMAIL, 'hello@knotify.pro'),
  privacyEmail: value(import.meta.env.VITE_LEGAL_PRIVACY_EMAIL, 'hello@knotify.pro'),
  phone: value(import.meta.env.VITE_LEGAL_PHONE, ''),
  registerCourt: value(import.meta.env.VITE_LEGAL_REGISTER_COURT, ''),
  registerNumber: value(import.meta.env.VITE_LEGAL_REGISTER_NUMBER, ''),
  vatId: value(import.meta.env.VITE_LEGAL_VAT_ID, ''),
}

export const LEGAL_ADDRESS = [
  LEGAL.street,
  [LEGAL.postalCode, LEGAL.city].filter(Boolean).join(' '),
  LEGAL.country,
].filter(Boolean)

export const LEGAL_OPERATOR_INLINE = [
  LEGAL.operatorName,
  LEGAL.street,
  [LEGAL.postalCode, LEGAL.city].filter(Boolean).join(' '),
  LEGAL.country,
].filter(Boolean).join(', ')

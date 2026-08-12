// Pautan WhatsApp untuk naik taraf ke Akses Penuh.
// Bayaran diuruskan secara manual buat masa ini: user WhatsApp, bayar, dan
// admin tandakan paid: true dalam Firebase Console.

import { ACCESS_PERIOD_LABEL, PRICE_LABEL } from './access'

const WHATSAPP_NUMBER = '60196880830'

export const upgradeWhatsappUrl = (email?: string | null): string => {
  const base = `Hai, saya nak naik taraf akaun SifuLaser ke Akses Penuh (${PRICE_LABEL} untuk ${ACCESS_PERIOD_LABEL}).`
  const text = email ? `${base} Email akaun saya: ${email}` : base
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`
}

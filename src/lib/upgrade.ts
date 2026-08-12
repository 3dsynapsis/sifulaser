// Pautan WhatsApp untuk naik taraf ke Akses Penuh.
// Bayaran diuruskan secara manual buat masa ini: user WhatsApp, bayar, dan
// admin tandakan paid: true dalam Firebase Console.

import { PRICE_LABEL } from './access'

const WHATSAPP_NUMBER = '60196880830'

export const upgradeWhatsappUrl = (email?: string | null): string => {
  const text = email
    ? `Hai, saya nak naik taraf akaun SifuLaser ke Akses Penuh (${PRICE_LABEL}). Email akaun saya: ${email}`
    : `Hai, saya nak naik taraf akaun SifuLaser ke Akses Penuh (${PRICE_LABEL}).`
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`
}

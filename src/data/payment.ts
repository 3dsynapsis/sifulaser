// Maklumat pembayaran untuk naik taraf ke Akses Penuh.
//
// PENTING: isi butiran bank yang betul di bawah. Nombor akaun salah bermakna
// pelanggan menghantar wang ke akaun orang lain.

import { ACCESS_PERIOD_LABEL, PRICE_LABEL } from '../lib/access'

/** Nombor WhatsApp KHAS untuk pengesahan pembayaran (bukan nombor kedai). */
const PAYMENT_WHATSAPP_NUMBER = '60193644423'
export const PAYMENT_WHATSAPP_DISPLAY = '+60 19-364 4423'

export interface BankAccount {
  /** Nama bank atau eWallet penerima. */
  bankName: string
  accountName: string
  accountNumber: string
}

/** Butiran akaun untuk pemindahan / DuitNow. */
export const BANK_ACCOUNT: BankAccount = {
  bankName: "Touch 'n Go eWallet",
  accountName: 'Badrul Hisham bin Burhanuddin',
  accountNumber: '160887030314',
}

/** Panduan ringkas untuk pengguna bank lain. */
export const TRANSFER_HINT =
  "Dari aplikasi bank lain: pilih DuitNow → Transfer to Account, kemudian pilih “Touch 'n Go eWallet” sebagai bank penerima dan masukkan nombor akaun di atas."

/**
 * Laluan gambar QR DuitNow dalam docs/images/payment/.
 * Biarkan kosong jika belum ada — bahagian QR akan disembunyikan.
 */
export const QR_IMAGE = ''

export const IS_PAYMENT_CONFIGURED = Boolean(
  BANK_ACCOUNT.bankName && BANK_ACCOUNT.accountNumber,
)

/** Mesej WhatsApp selepas pelanggan membuat pembayaran. */
export const paymentProofWhatsappUrl = (email?: string | null): string => {
  const base =
    `Hai, saya sudah membuat pembayaran ${PRICE_LABEL} untuk Akses Penuh SifuLaser (${ACCESS_PERIOD_LABEL}).` +
    ' Saya lampirkan resit pembayaran.'
  const text = email ? `${base} Email akaun saya: ${email}` : base
  return `https://wa.me/${PAYMENT_WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`
}

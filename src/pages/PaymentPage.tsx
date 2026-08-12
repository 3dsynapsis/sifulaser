import { useState } from 'react'
import {
  ArrowLeft,
  BadgeCheck,
  Banknote,
  Check,
  Copy,
  LogIn,
  MessageCircle,
  QrCode,
} from 'lucide-react'
import {
  BANK_ACCOUNT,
  IS_PAYMENT_CONFIGURED,
  PAYMENT_WHATSAPP_DISPLAY,
  QR_IMAGE,
  TRANSFER_HINT,
  paymentProofWhatsappUrl,
} from '../data/payment'
import {
  ACCESS_PERIOD_LABEL,
  ORIGINAL_PRICE_LABEL,
  PRICE_LABEL,
  SAVING_LABEL,
} from '../lib/access'
import { useAuth } from '../lib/auth'

const Step = ({
  number,
  title,
  children,
}: {
  number: number
  title: string
  children: React.ReactNode
}) => (
  <section className="card flex flex-col gap-3 p-4 sm:p-5">
    <div className="flex items-center gap-3">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e07514] text-sm font-bold text-white"
        aria-hidden="true"
      >
        {number}
      </span>
      <h2 className="text-base font-bold text-ink sm:text-lg">{title}</h2>
    </div>
    {children}
  </section>
)

export const PaymentPage = () => {
  const { configured, user, paid, signIn } = useAuth()
  const [copied, setCopied] = useState(false)

  const copyAccount = async () => {
    try {
      await navigator.clipboard.writeText(BANK_ACCOUNT.accountNumber)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-4 py-5 sm:py-8">
        <a
          href="#/pakej"
          className="inline-flex w-fit min-h-11 items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-muted transition-colors hover:bg-white hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Pakej &amp; Harga
        </a>

        <header className="card flex flex-col items-center gap-2 p-5 text-center sm:p-6">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#fdf3e8]">
            <Banknote className="h-7 w-7 text-[#e07514]" aria-hidden="true" />
          </span>
          <h1 className="text-xl font-extrabold text-ink sm:text-2xl">
            Cara Bayar
          </h1>
          <p className="text-sm text-muted">
            Naik taraf ke Akses Penuh — {ACCESS_PERIOD_LABEL} akses penuh.
          </p>
          <p className="mt-1 flex items-baseline justify-center gap-2">
            <span className="text-lg font-bold text-muted line-through">
              {ORIGINAL_PRICE_LABEL}
            </span>
            <span className="text-3xl font-extrabold text-[#e07514]">
              {PRICE_LABEL}
            </span>
          </p>
          <p className="inline-flex items-center rounded-full bg-[#edf9f1] px-2.5 py-0.5 text-xs font-bold text-[#147a37]">
            {SAVING_LABEL} — harga pengenalan
          </p>
        </header>

        {paid && configured ? (
          <p className="flex items-center justify-center gap-2 rounded-2xl border border-[#c9ecd6] bg-[#edf9f1] p-4 text-sm font-semibold text-[#147a37]">
            <BadgeCheck className="h-5 w-5" aria-hidden="true" />
            Anda sudah mempunyai Akses Penuh — tiada pembayaran diperlukan.
          </p>
        ) : null}

        {/* Langkah 1 — bayar */}
        <Step number={1} title="Buat pembayaran">
          {IS_PAYMENT_CONFIGURED ? (
            <>
              <dl className="flex flex-col gap-2 rounded-xl border border-line bg-canvas p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-xs font-semibold text-muted">
                    Bank / eWallet
                  </dt>
                  <dd className="text-right text-sm font-bold text-ink">
                    {BANK_ACCOUNT.bankName}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-xs font-semibold text-muted">
                    Nama akaun
                  </dt>
                  <dd className="text-right text-sm font-bold text-ink">
                    {BANK_ACCOUNT.accountName}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-xs font-semibold text-muted">
                    Nombor akaun
                  </dt>
                  <dd className="text-right text-base font-extrabold tracking-wide text-ink">
                    {BANK_ACCOUNT.accountNumber}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2">
                  <dt className="text-xs font-semibold text-muted">Jumlah</dt>
                  <dd className="text-base font-extrabold text-[#e07514]">
                    {PRICE_LABEL}
                  </dd>
                </div>
              </dl>

              <button
                type="button"
                onClick={() => void copyAccount()}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-canvas"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-screw-3" aria-hidden="true" />
                    Nombor akaun disalin
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    Salin nombor akaun
                  </>
                )}
              </button>

              <p className="rounded-xl border border-[#cfe0f5] bg-[#eef5fd] p-3 text-xs text-[#2b4d73] sm:text-sm">
                {TRANSFER_HINT}
              </p>

              {QR_IMAGE ? (
                <figure className="flex flex-col items-center gap-2 rounded-xl border border-line bg-white p-4">
                  <figcaption className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted">
                    <QrCode className="h-4 w-4" aria-hidden="true" />
                    Atau imbas QR dengan aplikasi bank / eWallet anda
                  </figcaption>
                  <img
                    src={`${import.meta.env.BASE_URL}${QR_IMAGE}`}
                    alt={`Kod QR Malaysia National QR untuk ${BANK_ACCOUNT.accountName}`}
                    className="w-full max-w-[280px] rounded-lg"
                  />
                </figure>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted">
              Butiran pembayaran akan dikemas kini sebentar lagi. Sementara itu,
              hubungi kami di WhatsApp {PAYMENT_WHATSAPP_DISPLAY}.
            </p>
          )}
        </Step>

        {/* Langkah 2 — hantar resit */}
        <Step number={2} title="Hantar resit ke WhatsApp">
          <p className="text-sm text-muted">
            Selepas bayar, hantar resit ke{' '}
            <span className="font-bold text-ink">
              {PAYMENT_WHATSAPP_DISPLAY}
            </span>{' '}
            bersama email akaun Google yang anda guna untuk log masuk.
          </p>

          {configured && !user ? (
            <>
              <p className="text-xs text-muted">
                Log masuk dahulu supaya email anda dimasukkan secara automatik
                dalam mesej.
              </p>
              <button
                type="button"
                onClick={() => void signIn()}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-screw-2 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1a67b6]"
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                Log masuk dengan Google
              </button>
            </>
          ) : null}

          <a
            href={paymentProofWhatsappUrl(user?.email)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1faa4e] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#188a3f]"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            Hantar resit di WhatsApp
          </a>
        </Step>

        {/* Langkah 3 — akses dibuka */}
        <Step number={3} title="Akses dibuka">
          <p className="text-sm text-muted">
            Kami akan sahkan pembayaran dan buka Akses Penuh untuk akaun anda.
            Skrin anda akan dikemas kini secara automatik — tiada perlu
            mendaftar semula. Tarikh luput {ACCESS_PERIOD_LABEL} akan dipaparkan
            pada akaun anda.
          </p>
        </Step>

        <p className="pb-4 text-center text-xs text-muted">
          Simpan resit pembayaran anda sehingga akses dibuka.
        </p>
      </div>
    </div>
  )
}

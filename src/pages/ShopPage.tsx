import { ArrowLeft, ExternalLink, MessageCircle, ShoppingBag, Star } from 'lucide-react'
import {
  SHOP_NAME,
  SHOP_PRODUCTS,
  SHOP_URL,
  WHATSAPP_NUMBER_DISPLAY,
  whatsappUrlFor,
} from '../data/shop'

export const ShopPage = () => (
  <div className="min-h-screen bg-canvas">
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-4 py-5 sm:py-8">
      <a
        href="#/"
        className="inline-flex w-fit min-h-11 items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-muted transition-colors hover:bg-white hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Utama
      </a>

      <header className="card flex items-center gap-4 p-4 sm:p-5">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#fdf3e8]">
          <ShoppingBag className="h-7 w-7 text-[#e07514]" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-ink sm:text-xl">
            Kedai {SHOP_NAME}
          </h1>
          <p className="text-sm text-muted">
            Barang keperluan kerja laser — beli di Shopee atau order terus via
            WhatsApp.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {SHOP_PRODUCTS.map((product) => (
          <div
            key={product.name}
            className="card flex flex-col gap-3 p-3 transition-transform hover:-translate-y-0.5 sm:p-4"
          >
            <a
              href={product.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Lihat ${product.name} di Shopee`}
              className="relative block"
            >
              <img
                src={`${import.meta.env.BASE_URL}${product.image}`}
                alt={product.imageAlt}
                loading="lazy"
                className="aspect-square w-full rounded-xl border border-line bg-white object-cover"
              />
              {product.soldOut && (
                <span className="absolute left-2 top-2 rounded-lg bg-ink/80 px-2 py-1 text-[11px] font-semibold text-white">
                  Stok Habis
                </span>
              )}
            </a>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-ink sm:text-base">
                {product.name}
              </h2>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-bold text-[#e07514] sm:text-base">
                  {product.price}
                </span>
                <span className="inline-flex items-center gap-0.5 text-[11px] text-muted sm:text-xs">
                  <Star
                    className="h-3 w-3 fill-[#f5a623] text-[#f5a623]"
                    aria-hidden="true"
                  />
                  {product.rating} · {product.sold}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted sm:text-sm">
                {product.description}
              </p>
            </div>
            <a
              href={product.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#e07514] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#c76409] sm:text-sm"
            >
              {product.soldOut ? 'Lihat di Shopee' : 'Beli di Shopee'}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        ))}
      </div>

      <a
        href={SHOP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 rounded-2xl border border-[#f6ddc0] bg-[#fdf3e8] p-4 text-sm font-semibold text-[#a3540b] transition-colors hover:bg-[#fbe9d4]"
      >
        <ShoppingBag className="h-5 w-5" aria-hidden="true" />
        Lawati kedai penuh kami di Shopee
        <ExternalLink className="h-4 w-4" aria-hidden="true" />
      </a>

      <a
        href={whatsappUrlFor()}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 rounded-2xl border border-[#c9ecd6] bg-[#edf9f1] p-4 text-sm font-semibold text-[#147a37] transition-colors hover:bg-[#def3e6]"
      >
        <MessageCircle className="h-5 w-5" aria-hidden="true" />
        WhatsApp kami: {WHATSAPP_NUMBER_DISPLAY}
      </a>

      <p className="pb-4 text-center text-xs text-muted">
        Link Shopee dan WhatsApp akan dibuka dalam tab baharu.
      </p>
    </div>
  </div>
)

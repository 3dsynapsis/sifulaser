// Produk kedai Shopee LCM Supplies.
// Untuk tambah produk baharu: tambah satu entri di sini (gambar dalam
// training/images/shop/) dan build semula.

export const SHOP_URL = 'https://shopee.com.my/lcmsupplies'
export const SHOP_NAME = 'LCM Supplies'

export const WHATSAPP_NUMBER_DISPLAY = '+60 19-688 0830'
const WHATSAPP_NUMBER = '60196880830'

export const whatsappUrlFor = (productName?: string): string => {
  const text = productName
    ? `Hai, saya berminat dengan ${productName} dari SifuLaser.`
    : 'Hai, saya berminat dengan produk dari SifuLaser.'
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`
}

export interface ShopProduct {
  name: string
  description: string
  price: string
  rating: string
  sold: string
  image: string
  imageAlt: string
  url: string
  soldOut?: boolean
}

const IMG = 'images/shop/'

export const SHOP_PRODUCTS: ShopProduct[] = [
  {
    name: 'Double Tape LCM333',
    description:
      'Double tape industri 30cm × 50 meter — kuat untuk veneer, plywood 3mm dan acrylic 2–5mm. Tape yang kami guna sendiri untuk production.',
    price: 'RM180.00',
    rating: '5.0',
    sold: '95 terjual',
    image: `${IMG}double-tape.jpg`,
    imageAlt: 'Gulung double tape LCM333 30cm',
    url: 'https://shopee.com.my/Double-Tape-LCM333-For-Laser-Cut-i.1212580306.25569781584',
  },
  {
    name: 'Lanyard 20mm Polyester AAA',
    description:
      'Lanyard polyester gred AAA (putih, 100 meter) untuk sublimation heat transfer — sesuai untuk tag nama, event dan pas pekerja. Pilihan lebar 20mm & 25mm.',
    price: 'RM36.00',
    rating: '5.0',
    sold: '221 terjual',
    image: `${IMG}lanyard.jpg`,
    imageAlt: 'Gulung lanyard polyester putih 20mm',
    url: 'https://shopee.com.my/Lanyard-20mm-Polyester-AAA-Grade-for-Sublimation-Heat-Transfer-100meters-LCM-i.1212580306.26958718910',
  },
  {
    name: 'Oval Hook 20mm / 25mm',
    description:
      'Cangkuk oval gred AAA untuk lanyard dan tag — padankan hook 20mm dengan lanyard 20mm, 25mm dengan 25mm. Lebih 10,000 pcs telah kami hasilkan menggunakannya.',
    price: 'RM0.65',
    rating: '4.8',
    sold: '1k+ terjual',
    image: `${IMG}oval-hook.jpg`,
    imageAlt: 'Oval hook logam untuk lanyard',
    url: 'https://shopee.com.my/Oval-Hook-20mm-25mm-Lanyard-Accesories-Ready-Stock-Malaysia-LCM-i.1212580306.27308724044',
    soldOut: true,
  },
]

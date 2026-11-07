// Salin ke clipboard - dikongsi oleh Blog dan rujukan Kelas Website AI.

/**
 * Clipboard API kadang kadang tergantung tanpa jawapan (contohnya bila tab
 * tak fokus) — bukan gagal, cuma tak balas. Jadi kita beri had masa supaya
 * butang tidak tersangkut menunggu selamanya.
 */
export const settleWithin = (promise: Promise<unknown>, ms: number): Promise<boolean> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms)
    promise.then(
      () => {
        clearTimeout(timer)
        resolve(true)
      },
      () => {
        clearTimeout(timer)
        resolve(false)
      },
    )
  })

/**
 * Salin teks biasa. Ramai pembaca buka pautan ini dari dalam WhatsApp,
 * dan browser dalam app tu kadang kadang tak bagi Clipboard API — jadi ada
 * kaedah lama sebagai sandaran.
 */
export const copyPlainText = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) {
      const ok = await settleWithin(navigator.clipboard.writeText(text), 1200)
      if (ok) return true
    }
  } catch {
    /* jatuh ke kaedah lama di bawah */
  }

  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '-1000px'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

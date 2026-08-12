// Panel admin: hanya satu akaun dibenarkan.
//
// Senarai ini juga dikuatkuasakan di Firestore security rules — menukar nilai
// di sini sahaja TIDAK memberi sesiapa kuasa admin.

import type { User } from 'firebase/auth'
import { ACCESS_PERIOD_YEARS } from './access'
import { loadFirebase } from './firebase'

export const ADMIN_EMAIL = '3dsynapsis@gmail.com'

export const isAdmin = (user: User | null): boolean =>
  Boolean(user?.email && user.email.toLowerCase() === ADMIN_EMAIL)

export interface AdminUserRow {
  uid: string
  email: string
  name: string
  paid: boolean
  paidUntil: Date | null
  createdAt: Date | null
}

const toDate = (value: unknown): Date | null => {
  if (!value) return null
  const fn = (value as { toDate?: () => Date }).toDate
  return typeof fn === 'function' ? (value as { toDate: () => Date }).toDate() : null
}

/** true jika akses masih sah pada masa ini. */
export const isAccessActive = (row: AdminUserRow): boolean => {
  if (!row.paid) return false
  if (!row.paidUntil) return true
  return row.paidUntil.getTime() > Date.now()
}

/** Dengar senarai pengguna secara langsung. Mengembalikan fungsi berhenti. */
export const subscribeUsers = (
  onData: (rows: AdminUserRow[]) => void,
  onError: (message: string) => void,
): (() => void) => {
  const pending = loadFirebase()
  if (!pending) {
    onError('Firebase belum dikonfigurasi.')
    return () => {}
  }

  let unsubscribe: (() => void) | undefined
  let cancelled = false

  void pending
    .then(({ db, storeApi }) => {
      if (cancelled) return
      const ref = storeApi.collection(db, 'users')
      unsubscribe = storeApi.onSnapshot(
        ref,
        (snapshot) => {
          const rows = snapshot.docs.map((entry) => {
            const data = entry.data()
            return {
              uid: entry.id,
              email: typeof data.email === 'string' ? data.email : '',
              name: typeof data.name === 'string' ? data.name : '',
              paid: data.paid === true,
              paidUntil: toDate(data.paidUntil),
              createdAt: toDate(data.createdAt),
            }
          })
          rows.sort(
            (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
          )
          onData(rows)
        },
        () => onError('Gagal membaca senarai pengguna.'),
      )
    })
    .catch(() => onError('Gagal menyambung ke pangkalan data.'))

  return () => {
    cancelled = true
    unsubscribe?.()
  }
}

/**
 * Beri atau lanjutkan akses. Jika akses sedia ada masih sah, tempoh baharu
 * disambung dari tarikh luput sedia ada; jika tidak, dari hari ini.
 */
export const grantAccess = async (row: AdminUserRow): Promise<void> => {
  const pending = loadFirebase()
  if (!pending) return
  const { db, storeApi } = await pending

  const stillActive = isAccessActive(row) && row.paidUntil !== null
  const start = stillActive ? new Date(row.paidUntil as Date) : new Date()
  const expiry = new Date(start)
  expiry.setFullYear(expiry.getFullYear() + ACCESS_PERIOD_YEARS)

  await storeApi.updateDoc(storeApi.doc(db, 'users', row.uid), {
    paid: true,
    paidUntil: storeApi.Timestamp.fromDate(expiry),
  })
}

/** Tarik balik akses serta-merta. */
export const revokeAccess = async (uid: string): Promise<void> => {
  const pending = loadFirebase()
  if (!pending) return
  const { db, storeApi } = await pending
  await storeApi.updateDoc(storeApi.doc(db, 'users', uid), {
    paid: false,
    paidUntil: null,
  })
}

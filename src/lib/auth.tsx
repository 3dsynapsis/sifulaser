// Login Google + status bayaran, dikongsi ke seluruh app melalui context.
//
// Status bayaran disimpan di Firestore: users/{uid} dengan medan
//   paid: boolean
//   paidUntil: Timestamp | null   (null = tiada tarikh luput)
// Hanya admin (melalui Firebase Console) boleh menukar medan ini — lihat
// firestore.rules. User hanya boleh baca rekod sendiri.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { User } from 'firebase/auth'
import { IS_CONFIGURED, loadFirebase } from './firebase'

interface AuthValue {
  /** true jika Firebase sudah dikonfigurasi (butang login dipaparkan). */
  configured: boolean
  user: User | null
  paid: boolean
  /** true semasa status login/bayaran masih dimuatkan. */
  loading: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  error: string | null
}

const AuthContext = createContext<AuthValue | null>(null)

const isStillValid = (paid: unknown, paidUntil: unknown): boolean => {
  if (paid !== true) return false
  if (!paidUntil) return true
  const millis = (paidUntil as { toMillis?: () => number }).toMillis
  if (typeof millis === 'function') {
    return (paidUntil as { toMillis: () => number }).toMillis() > Date.now()
  }
  return true
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [paid, setPaid] = useState(false)
  const [loading, setLoading] = useState(IS_CONFIGURED)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const pending = loadFirebase()
    if (!pending) return

    let unsubscribe: (() => void) | undefined
    let cancelled = false

    void pending
      .then(({ auth, authApi }) => {
        if (cancelled) return
        unsubscribe = authApi.onAuthStateChanged(auth, (nextUser) => {
          setUser(nextUser)
          if (!nextUser) {
            setPaid(false)
            setLoading(false)
          }
        })
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  // Dengar rekod user; cipta rekod baharu (paid: false) pada login pertama.
  useEffect(() => {
    const pending = loadFirebase()
    if (!pending || !user) return

    let unsubscribe: (() => void) | undefined
    let cancelled = false

    void pending.then(({ db, storeApi }) => {
      if (cancelled) return
      const ref = storeApi.doc(db, 'users', user.uid)
      unsubscribe = storeApi.onSnapshot(
        ref,
        (snapshot) => {
          if (!snapshot.exists()) {
            void storeApi.setDoc(ref, {
              email: user.email ?? '',
              name: user.displayName ?? '',
              paid: false,
              paidUntil: null,
              createdAt: storeApi.Timestamp.now(),
            })
            setPaid(false)
          } else {
            const data = snapshot.data()
            setPaid(isStillValid(data.paid, data.paidUntil))
          }
          setLoading(false)
        },
        () => {
          setPaid(false)
          setLoading(false)
        },
      )
    })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [user])

  const signIn = useCallback(async () => {
    const pending = loadFirebase()
    if (!pending) return
    setError(null)
    try {
      const { auth, authApi } = await pending
      await authApi.signInWithPopup(auth, new authApi.GoogleAuthProvider())
    } catch (caught) {
      const code = (caught as { code?: string }).code ?? ''
      if (
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request'
      ) {
        return
      }
      setError('Login gagal. Sila cuba lagi.')
    }
  }, [])

  const signOut = useCallback(async () => {
    const pending = loadFirebase()
    if (!pending) return
    const { auth, authApi } = await pending
    await authApi.signOut(auth)
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      configured: IS_CONFIGURED,
      user,
      // Selagi Firebase belum dikonfigurasi, tiada cara untuk log masuk — jadi
      // app kekal terbuka sepenuhnya dan bukan terkunci untuk semua orang.
      paid: IS_CONFIGURED ? paid : true,
      loading,
      signIn,
      signOut,
      error,
    }),
    [user, paid, loading, signIn, signOut, error],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = (): AuthValue => {
  const value = useContext(AuthContext)
  if (!value) {
    // Fallback selamat jika provider tiada — app kekal terbuka.
    return {
      configured: false,
      user: null,
      paid: true,
      loading: false,
      signIn: async () => {},
      signOut: async () => {},
      error: null,
    }
  }
  return value
}

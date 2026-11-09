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
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { User } from 'firebase/auth'
import { IS_CONFIGURED, loadFirebase } from './firebase'
import { publishSession, safeNext } from './session'

interface AuthValue {
  /** true jika Firebase sudah dikonfigurasi (butang login dipaparkan). */
  configured: boolean
  user: User | null
  paid: boolean
  /** Tarikh luput Akses Penuh; null jika tiada tarikh luput ditetapkan. */
  paidUntil: Date | null
  /** true jika pelanggan ini peserta kelas bersemuka. */
  isClassParticipant: boolean
  /** true semasa status login/bayaran masih dimuatkan. */
  loading: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  error: string | null
}

const AuthContext = createContext<AuthValue | null>(null)

/** Tukar Firestore Timestamp kepada Date; null jika medan kosong. */
const toDate = (value: unknown): Date | null => {
  if (!value) return null
  const toDateFn = (value as { toDate?: () => Date }).toDate
  return typeof toDateFn === 'function'
    ? (value as { toDate: () => Date }).toDate()
    : null
}

const isStillValid = (paid: unknown, expiry: Date | null): boolean => {
  if (paid !== true) return false
  if (!expiry) return true
  return expiry.getTime() > Date.now()
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [paid, setPaid] = useState(false)
  const [paidUntil, setPaidUntil] = useState<Date | null>(null)
  const [classParticipant, setClassParticipant] = useState(false)
  const [loading, setLoading] = useState(IS_CONFIGURED)
  const [error, setError] = useState<string | null>(null)
  const signInRef = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    const pending = loadFirebase()
    if (!pending) return

    let unsubscribe: (() => void) | undefined
    let unsubToken: (() => void) | undefined
    let cancelled = false

    void pending
      .then(({ auth, authApi }) => {
        if (cancelled) return
        // Two listeners on purpose. onAuthStateChanged drives what this app
        // shows; onIdTokenChanged also fires each time Firebase refreshes the
        // token, roughly hourly, which is what keeps the note the tools read
        // from going stale under them an hour into a session.
        unsubToken = authApi.onIdTokenChanged(auth, (tokenUser) => {
          if (!tokenUser) { publishSession(null); return }
          void tokenUser.getIdTokenResult().then((result) => {
            publishSession({
              email: tokenUser.email ?? '',
              uid: tokenUser.uid,
              token: result.token,
              exp: Date.parse(result.expirationTime),
            })
          }).catch(() => publishSession(null))
        })

        unsubscribe = authApi.onAuthStateChanged(auth, (nextUser) => {
          setUser(nextUser)
          if (!nextUser) {
            setPaid(false)
            setPaidUntil(null)
            setClassParticipant(false)
            setLoading(false)
          }
        })
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      unsubToken?.()
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
              plan: null,
              createdAt: storeApi.Timestamp.now(),
            })
            setPaid(false)
            setPaidUntil(null)
            setClassParticipant(false)
          } else {
            const data = snapshot.data()
            const expiry = toDate(data.paidUntil)
            setPaid(isStillValid(data.paid, expiry))
            setPaidUntil(expiry)
            setClassParticipant(data.plan === 'class')
          }
          setLoading(false)
        },
        () => {
          setPaid(false)
          setPaidUntil(null)
          setClassParticipant(false)
          setLoading(false)
        },
      )
    })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [user])

  // A tool sent somebody here to sign in, and wants them back afterwards.
  //
  // The popup is opened from an effect rather than waiting for a click,
  // because they already clicked - in the tool. A browser that blocks a popup
  // with no gesture behind it will block this one, and that is survivable: the
  // sign-in button on this page is right there, so the worst case is one more
  // click rather than a dead end.
  useEffect(() => {
    if (loading) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('signin') !== '1') return
    const next = safeNext(params.get('next'))

    if (!user) {
      void signInRef.current?.()
      return
    }
    // Signed in. Clear the parameters so a refresh does not repeat this, and
    // put them back in the tool they came from.
    if (next) {
      window.location.replace(next)
      return
    }
    window.history.replaceState(null, '', window.location.pathname)
  }, [user, loading])

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

  // Declared after the effect above, which reaches it through this ref rather
  // than forcing the callback to be hoisted.
  signInRef.current = signIn

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
      paidUntil,
      isClassParticipant: classParticipant,
      loading,
      signIn,
      signOut,
      error,
    }),
    [user, paid, paidUntil, classParticipant, loading, signIn, signOut, error],
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
      paidUntil: null,
      isClassParticipant: false,
      loading: false,
      signIn: async () => {},
      signOut: async () => {},
      error: null,
    }
  }
  return value
}

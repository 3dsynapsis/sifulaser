// Konfigurasi Firebase untuk login Google + rekod status bayaran.
//
// Nilai di bawah bukan rahsia — config web Firebase memang didedahkan kepada
// browser. Keselamatan sebenar datang dari Firestore security rules (lihat
// firestore.rules), bukan dari menyembunyikan kunci ini.
//
// Firebase dimuatkan secara lazy (dynamic import) supaya bundle utama kekal
// ringan; ia hanya dimuat turun jika config di bawah telah diisi.

export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
}

export const IS_CONFIGURED = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId,
)

type FirebaseBundle = {
  auth: import('firebase/auth').Auth
  db: import('firebase/firestore').Firestore
  authApi: typeof import('firebase/auth')
  storeApi: typeof import('firebase/firestore')
}

let cached: Promise<FirebaseBundle> | null = null

/** Muatkan Firebase atas permintaan. Null jika config belum diisi. */
export const loadFirebase = (): Promise<FirebaseBundle> | null => {
  if (!IS_CONFIGURED) return null
  if (!cached) {
    cached = (async () => {
      const [appApi, authApi, storeApi] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/firestore'),
      ])
      const app = appApi.initializeApp(firebaseConfig)
      return {
        auth: authApi.getAuth(app),
        db: storeApi.getFirestore(app),
        authApi,
        storeApi,
      }
    })()
  }
  return cached
}

// Ciri animasi motion, dimuat secara malas oleh LazyMotion dalam HomePage.
//
// Fail berasingan supaya Vite memotongnya ke chunk sendiri: halaman utama
// dicat dahulu dengan komponen `m` yang ringan, dan animasi menyusul selepas
// chunk ini tiba. Pada telefon dengan data perlahan, teks dan butang tidak
// menunggu pustaka animasi.
export { domAnimation as default } from 'motion/react'

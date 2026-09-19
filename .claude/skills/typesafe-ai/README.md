# Skill TypeSafe — salinan dalam repo

`SKILL.md` dan `LICENSE` di sini ialah salinan **bulat-bulat** daripada hulu.
Jangan edit `SKILL.md`; kalau perlu kemas kini, tarik semula dari sumber supaya
diff kekal bersih.

| Perkara | Nilai |
|---|---|
| Sumber | https://github.com/typesafe-ai/skills |
| Laluan hulu | `skills/typesafe-ai/SKILL.md` |
| Versi plugin | `typesafe@typesafe-ai` 0.5.7 |
| Commit | `65a39f393687675ce170e6094757de20370365b9` |
| Lesen | MIT (lihat `LICENSE`) |

## Kenapa disalin, bukan dipasang sebagai plugin

Sesi Claude Code di web jalan dalam container sementara. Pemasangan plugin
(`claude plugin install`) duduk dalam `~/.claude` dan **hilang** bila container
mati. Salinan dalam repo ini dimuatkan terus dari checkout — tiada rangkaian,
tiada pemasangan semula, dan semua orang yang clone repo dapat skill yang sama.

Sebab itu juga jangan tambah `typesafe@typesafe-ai` ke dalam
`.claude/settings.json`: nanti skill yang sama muncul dua kali.

## Cara kemas kini

```bash
git clone --depth 1 https://github.com/typesafe-ai/skills /tmp/ts-skills
cp /tmp/ts-skills/skills/typesafe-ai/SKILL.md \
   /tmp/ts-skills/skills/typesafe-ai/LICENSE \
   .claude/skills/typesafe-ai/
```

Kemudian kemas kini baris Versi dan Commit dalam jadual di atas.

## Sebelum guna dalam SifuLaser

Dua benda perlu beres dahulu:

1. **Docs hulu disekat.** `docs.typesafe.ai` ditolak oleh network egress policy
   sesi web (403 pada CONNECT). `SKILL.md` kata docs live ialah sumber sahih
   untuk kontrak API dan SDK — jadi jangan tulis kod integrasi sebelum domain
   itu dibenarkan, nanti jadi reka-reka.
2. **Tiada server.** SifuLaser laman statik di GitHub Pages; `firebase.json`
   ada Firestore rules sahaja, tiada `functions/`. Kunci API TypeSafe TIDAK
   boleh masuk bundle client. Perlu proxy dahulu — Firebase Cloud Functions
   atau Cloudflare Worker (DNS memang sudah di Cloudflare).

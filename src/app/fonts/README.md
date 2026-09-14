# Vendored application fonts

These variable fonts are bundled through `next/font/local`. Builds and browsers do not fetch font assets from third-party origins. Every binary and license below is pinned to an immutable upstream commit and verified by `src/app/local-fonts.test.ts`.

## Font provenance

| File                          | Official immutable source                                                                                                                                                                                                                                    | SHA-256                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `Geist-Variable.ttf`          | Vercel `geist-font` commit `10dc7658f13c38a474cde201bb09a4617267545b`: [`fonts/Geist/variable/Geist[wght].ttf`](https://github.com/vercel/geist-font/blob/10dc7658f13c38a474cde201bb09a4617267545b/fonts/Geist/variable/Geist%5Bwght%5D.ttf)                 | `73894e0448cae90a92b6c2f8732b7bb9acb7b94c418bff559dad4a18e1de9659` |
| `GeistMono-Variable.ttf`      | Vercel `geist-font` commit `10dc7658f13c38a474cde201bb09a4617267545b`: [`fonts/GeistMono/variable/GeistMono[wght].ttf`](https://github.com/vercel/geist-font/blob/10dc7658f13c38a474cde201bb09a4617267545b/fonts/GeistMono/variable/GeistMono%5Bwght%5D.ttf) | `87c2aff9723544a9adaea19d92e42a33705c9723624801b6e0224c2206a6af0d` |
| `NotoKufiArabic-Variable.ttf` | Google Fonts commit `0cf764bb712367b6079cbb4fd2353e6f54ec6850`: [`ofl/notokufiarabic/NotoKufiArabic[wght].ttf`](https://github.com/google/fonts/blob/0cf764bb712367b6079cbb4fd2353e6f54ec6850/ofl/notokufiarabic/NotoKufiArabic%5Bwght%5D.ttf)               | `494f6b61469d7a02a2d63f0fc4930bb007388d8cfe551de5eb98354e100889f3` |

## License provenance

- `Geist-OFL-1.1.txt` is the exact [`OFL.txt`](https://github.com/vercel/geist-font/blob/10dc7658f13c38a474cde201bb09a4617267545b/OFL.txt) from Vercel commit `10dc7658f13c38a474cde201bb09a4617267545b`; SHA-256 `c683bfbcc7e087f5d37a54ef628f10387c451a83ddc459b151403a164ac46c90`.
- `NotoKufiArabic-OFL-1.1.txt` is the exact [`ofl/notokufiarabic/OFL.txt`](https://github.com/google/fonts/blob/0cf764bb712367b6079cbb4fd2353e6f54ec6850/ofl/notokufiarabic/OFL.txt) from Google Fonts commit `0cf764bb712367b6079cbb4fd2353e6f54ec6850`; SHA-256 `07fc70bfeb985cc1a87a8587d0a0c80bab11c86c9dc3fd95b6f0cb332f983e96`.

All three font binaries are unmodified and licensed under the SIL Open Font License 1.1.

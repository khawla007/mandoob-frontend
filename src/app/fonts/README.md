# Vendored application fonts

These variable fonts are bundled through `next/font/local`. Builds and browsers do not fetch font assets from third-party origins. Every binary and license below is pinned to an immutable upstream commit and verified by `src/app/local-fonts.test.ts`.

## Font provenance

| File                          | Official immutable source                                                                                                                                                                                                                                    | SHA-256                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `Geist-Variable.ttf`          | Vercel `geist-font` commit `10dc7658f13c38a474cde201bb09a4617267545b`: [`fonts/Geist/variable/Geist[wght].ttf`](https://github.com/vercel/geist-font/blob/10dc7658f13c38a474cde201bb09a4617267545b/fonts/Geist/variable/Geist%5Bwght%5D.ttf)                 | `73894e0448cae90a92b6c2f8732b7bb9acb7b94c418bff559dad4a18e1de9659` |
| `GeistMono-Variable.ttf`      | Vercel `geist-font` commit `10dc7658f13c38a474cde201bb09a4617267545b`: [`fonts/GeistMono/variable/GeistMono[wght].ttf`](https://github.com/vercel/geist-font/blob/10dc7658f13c38a474cde201bb09a4617267545b/fonts/GeistMono/variable/GeistMono%5Bwght%5D.ttf) | `87c2aff9723544a9adaea19d92e42a33705c9723624801b6e0224c2206a6af0d` |
| `NotoKufiArabic-Variable.ttf` | Google Fonts commit `0cf764bb712367b6079cbb4fd2353e6f54ec6850`: [`ofl/notokufiarabic/NotoKufiArabic[wght].ttf`](https://github.com/google/fonts/blob/0cf764bb712367b6079cbb4fd2353e6f54ec6850/ofl/notokufiarabic/NotoKufiArabic%5Bwght%5D.ttf)               | `494f6b61469d7a02a2d63f0fc4930bb007388d8cfe551de5eb98354e100889f3` |

## License provenance

- `Geist-OFL-1.1.txt` is the accepted normalized [`OFL.txt`](https://github.com/vercel/geist-font/blob/10dc7658f13c38a474cde201bb09a4617267545b/OFL.txt) from Vercel commit `10dc7658f13c38a474cde201bb09a4617267545b`; SHA-256 `942560b236adfa83745b2c64e5fc09ebaf91cb331751b1157eb92187e5d6e930`.
- `NotoKufiArabic-OFL-1.1.txt` is the accepted normalized [`ofl/notokufiarabic/OFL.txt`](https://github.com/google/fonts/blob/0cf764bb712367b6079cbb4fd2353e6f54ec6850/ofl/notokufiarabic/OFL.txt) from Google Fonts commit `0cf764bb712367b6079cbb4fd2353e6f54ec6850`; SHA-256 `df5143cdf3380169f2d03bf6d2cd243e85621fd097e608c3607cf7f9c9884ae6`.

All three font binaries are unmodified and licensed under the SIL Open Font License 1.1.

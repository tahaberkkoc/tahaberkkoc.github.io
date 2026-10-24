# Taha Berk Koç — Portfolio

Sitedeki **bütün yazılar LaTeX dosyalarından** gelir. Tasarım `src/` klasöründe,
içerik `content/` klasöründedir. `.tex` dosyalarını güncelleyip kaydetmen yeterli.

## Çalıştırma

Gerekenler: [Node.js](https://nodejs.org) 18.11 veya üstü.

```bash
npm install      # ilk seferde bir kere
npm run dev      # http://localhost:5173  (her .tex kaydında sayfa kendini yeniler)
npm run build    # yayınlanacak site dist/ klasörüne çıkar
npm run pdf      # (isteğe bağlı) content/main.tex'ten tüm yazıların PDF önizlemesi
```

### Tek komutla: `run.py`

```bash
python3 run.py            # siteyi açar (http://localhost:5173) + preview.html'i her kayıtta yeniler
python3 run.py --no-open  # tarayıcıyı otomatik açmaz
python3 run.py --once     # sadece preview.html'i bir kere üretir
```

İlk çalıştırmada `npm install`'ı kendisi yapar. `content/` ya da `src/` içinde bir dosyayı kaydettiğinde
hem site hem de çift tıklayıp açılan `preview.html` (telefonda / başka bilgisayarda bakmak için) güncellenir.

## Klasör yapısı

```
content/                      ← SADECE BURAYI DÜZENLEMEN YETERLİ
├── site.tex                  isim, sekme başlığı, e-posta / GitHub / LinkedIn, menü
├── pages/
│   ├── home.tex              "Hi!", fotoğraf, hakkımda yazısı
│   ├── background.tex        Background sayfası (aşağıdaki dosyaları \input eder)
│   ├── background/
│   │   ├── education.tex
│   │   ├── experience.tex
│   │   ├── communities.tex
│   │   ├── achievements.tex
│   │   └── skills.tex
│   ├── projects.tex          Projects sayfa başlığı + küçük arayüz yazıları
│   ├── interests.tex
│   └── contact.tex           yazı, form etiketleri, buton metni
├── projects/
│   └── <proje-klasoru>/
│       ├── project.tex       listede görünen başlık, özet, kapak, etiketler
│       ├── main.tex          ← Overleaf projesinin dosyaları (proje sayfası buradan)
│       ├── references.bib
│       └── figures/…
├── assets/profile.jpg        ana sayfadaki fotoğraf
├── icons/                    (isteğe bağlı) kendi .svg ikonların
├── portfolio.sty             komut tanımları (Overleaf'te derlenebilsin diye)
└── main.tex                  tüm içeriğin PDF önizlemesi (site bunu kullanmaz)
src/                          tasarım (CSS, JS, HTML şablonu, ikonlar)
scripts/                      LaTeX → HTML dönüştürücü, build ve dev sunucusu
```

## İçerik komutları

| Dosya | Komut | Açıklama |
|---|---|---|
| site.tex | `\SiteName{…}` | Sol üstteki isim (animasyonla küçülen) |
| | `\Social{ikon}{url}{yazı}` | Ana sayfa alt sekmesi ve Contact sayfasındaki linkler |
| | `\Nav[renk]{anahtar}{Yazı}` | Menü. Sırası menü sırasıdır, renk o sayfanın vurgu rengidir |
| home.tex | `\Greeting{Hi!}`, `\Photo[alt]{assets/profile.jpg}`, `\begin{About}…\end{About}` | |
| background/*.tex | `\Section[renk]{Başlık}` | Altı renkli çizgili bölüm başlığı |
| | `\Entry[link]{Başlık}{Tarih}{Yer}{Sağdaki not}` | Bir okul / iş girdisi |
| | `\Role{…}` | Başlığın altındaki italik satır(lar) |
| | `\begin{Highlights} \item … \end{Highlights}` | Madde işaretleri |
| | `\SkillGroup{Grup}{a, b, c}` | Virgülle ayrılmış beceriler (etiket olarak gösterilir) |
| interests.tex | `\Interest[ikon]{Başlık}{Alt başlık}{Açıklama}` | |
| contact.tex | `\FormTitle`, `\FormField[tip]{ad}{Etiket}{placeholder}`, `\FormButton`, `\FormNote` | |
| her sayfa | `\PageTitle[renk]{…}`, `\begin{Intro}…\end{Intro}`, `\Label{anahtar}{yazı}` | |

**Renkler:** `red, green, cyan, orange, yellow, blue, purple, pink, gray` ya da `#`'siz hex kod (ör. `ff3131`).

**İkonlar:** `src/icons/` içindeki herhangi bir dosya adı (`.svg` olmadan): `music, guitar, tent, target,
mountain-snow, plane, camera, book, code, cpu, globe, mail, github, linkedin, …`.
Kendi ikonunu `content/icons/isim.svg` olarak ekleyebilirsin.

Yazılarda normal LaTeX kullanabilirsin: `\textbf`, `\emph`, `\href{url}{yazı}`, `\url{…}`, `$x^2$`,
`--` (–), ` ``tırnak'' `, Türkçe karakterler (doğrudan ya da `\u{g}`, `\c{s}` …). URL içinde `%` varsa `\%` yaz.

## Yeni proje ekleme (Overleaf'ten)

1. `content/projects/` altında yeni bir klasör aç (klasör adı adreste görünür: `/projects/klasor-adi/`).
2. Overleaf'te **Menu → Download → Source** ile projeyi zip olarak indir ve içeriğini bu klasöre aç.
3. Aynı klasöre bir `project.tex` koy (mevcut projelerden kopyala):

```latex
\ProjectTitle{Projenin adı}
\ProjectCategory{research}             % grup: research veya coursework (projects.tex'te tanımlı)
\ProjectOrder{3}                       % grubun içindeki sıra
\ProjectDate{2026}
\ProjectTags{MPC, Robotics}
\ProjectCover{figures/cover.jpg}       % listede ve proje sayfasında görünen resim
\ProjectLink{Code}{https://github.com/...}
\begin{ProjectSummary}
Projeler sayfasında üzerine gelince sağda görünen kısa açıklama.
\end{ProjectSummary}
\ProjectDocument{main.tex}             % Overleaf'teki ana dosyanın adı farklıysa değiştir
```

Proje sayfasında Overleaf dokümanından şunlar otomatik çıkar: bölümler (+ sağda içindekiler),
denklemler (numaralı, KaTeX ile), `\ref`/`\eqref`/`\cref` ve `\cite` (tıklanınca ilgili yere kayar),
`\href`/`\url` linkleri, dipnotlar, şekiller ve alt şekiller (`\includegraphics`, PDF şekiller
otomatik PNG'ye çevrilir), tablolar (booktabs dahil), algoritmalar (`algorithmic`/`algpseudocode`),
teorem/ispat ortamları, `\newcommand` makroların ve `.bib` kaynakçası. `\input`/`\include` ile
bölünmüş dosyalar da okunur. Desteklenmeyen bir komut olursa build uyarı verir ve komutu yazı olarak geçer.

**Gruplar:** Projects sayfasındaki başlıklar `content/pages/projects.tex` içindeki `\Category[renk]{anahtar}{Başlık}` (renk isteğe bağlı: başlığın altçizgisi)
satırlarıdır (sıra da buradan gelir). Yeni grup eklemek için bir `\Category` satırı yaz ve projede
`\ProjectCategory{anahtar}` kullan. Kategorisi olmayan projeler başlıksız olarak en üstte görünür.

TikZ çizimleri web'de gösterilemez: Overleaf'te PDF/PNG olarak dışa aktarıp `\includegraphics` ile kullan.

## Yayınlama

`npm run build` sonrası `dist/` klasörü herhangi bir statik hostinge (GitHub Pages, Netlify,
Vercel, Cloudflare Pages) yüklenebilir. GitHub Pages için `.github/workflows/deploy.yml` hazır:
repoyu GitHub'a gönder, **Settings → Pages → Source: GitHub Actions** seç; her push'ta site yenilenir.
Site bir alt klasörde yayınlanacaksa `BASE_PATH=/repo-adi/ npm run build` kullan (workflow bunu kendisi yapar).

## İletişim formu

Form şu an bilerek bağlı değil (gönder'e basınca `\FormNote` yazısı görünür). Bağlamak için
`src/js/app.js` içindeki `initContact` fonksiyonundaki yorumlu `fetch(...)` satırını bir form
servisine (Formspree, Web3Forms, …) yönlendirmek yeterli.

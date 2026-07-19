Ya, bahkan menurut saya ini **jauh lebih kuat** daripada mengerjakan dua proyek terpisah. Anda bisa membuat **satu produk** yang memenuhi dua kompetisi sekaligus:

1. **OpenAI Devpost Build Challenge** → menunjukkan penggunaan AI (Agents, Responses API, Codex, GPT-5.5, dsb.).
2. **Squarespace Make It Real Challenge** → menunjukkan website yang profesional dengan Finish Layer.

Jadi bukan "website parfum", tetapi sebuah **AI-powered fragrance discovery platform**.

---

# Konsep

## ScentSphere AI

> **The world's first AI fragrance intelligence platform.**

Bukan sekadar katalog parfum.

Tetapi AI yang membantu pengguna menemukan parfum berdasarkan:

* personality
* occasion
* cuaca
* budget
* fragrance notes
* preferensi aroma
* review komunitas
* harga pasar

Data berasal dari scraping/API/dataset publik.

AI menjadi "brain".

Squarespace menjadi "beautiful frontend".

---

# Arsitektur

```
                 Squarespace Website
              (Finish Layer UI/UX)

                     │
                     │
        Custom API / External Endpoint
                     │
      ┌──────────────┴──────────────┐
      │                             │
 Scraper Pipeline             AI Backend
      │                             │
 PostgreSQL                OpenAI GPT
      │                             │
 Vector DB                 Responses API
      │
 Search
```

---

# AI Features (untuk Devpost)

Ini yang akan menjadi nilai jual.

---

## 1. AI Fragrance Consultant ⭐⭐⭐⭐⭐

User berkata

> Saya pria 24 tahun.
>
> Tinggal di Surabaya.
>
> Kerja kantoran.
>
> Budget 700 ribu.
>
> Tidak suka aroma terlalu manis.

GPT menjawab

```
Recommendation

Prada L'Homme

Why

Fresh iris

Professional

Office friendly

Long lasting

Alternatives

Versace Pour Homme

Afnan Turathi Blue

Terre d'Hermès
```

---

## 2. AI Compare

User

```
Dior Sauvage

vs

Bleu de Chanel
```

GPT

menganalisis

* smell
* longevity
* projection
* compliment factor
* value

Lalu menyimpulkan

> Untuk cuaca tropis Indonesia,
> Bleu lebih versatile.

---

## 3. AI Review Summarizer ⭐⭐⭐⭐⭐

Anda scrape

* Fragrantica
* Parfumo
* Reddit
* YouTube transcript (jika sesuai kebijakan dan sumber)

Lalu GPT membuat

```
Summary

People love:

Fresh opening

Great projection

Office friendly

Compliment magnet

Common complaints

Expensive

Overused

Weak batch
```

Ini sangat cocok menggunakan model GPT.

---

## 4. AI Personality Quiz

10 pertanyaan

```
Morning?

Night?

Beach?

Coffee?

Formal?

Adventure?
```

AI membuat profil

```
Fragrance DNA

Fresh Citrus Woody

Confidence

92%

Recommended
...
```

---

## 5. AI Layering Assistant ⭐⭐⭐⭐⭐

User punya

```
CDNIM

Versace Pour Homme

Lattafa Asad
```

AI menjawab

```
Possible layering

CDNIM

+

Versace

Result

Smoky Citrus

Rating

8.9/10
```

Jarang ada aplikasi seperti ini.

---

## 6. AI Gift Finder

User

```
Cari hadiah ulang tahun.

Perempuan

26 tahun

Budget 800 ribu.
```

AI memilih.

---

## 7. AI Clone Finder ⭐⭐⭐⭐⭐

User

```
Saya suka Creed Aventus.
```

AI

```
Affordable Alternatives

CDNIM

L'Aventure

Supremacy Silver

Turathi Blue
```

---

## 8. AI Fragrance Chat

Seperti ChatGPT.

```
Apa parfum untuk interview?
```

```
Apa parfum yang cocok saat hujan?
```

```
Apa parfum mirip YSL Y?
```

---

# Scraping Pipeline

Data

```
Fragrantica

Parfumo

Official Brand

Price Marketplace

Reddit

YouTube

Blogs
```

Lalu normalisasi

```
Perfume

Notes

Performance

Price

Season

Gender

Occasion

Ratings
```

---

# AI RAG

Buat embedding

```
Perfume descriptions

Reviews

Notes

Recommendations
```

Lalu GPT menggunakan RAG.

Jadi jawaban AI tidak mengarang.

---

# Squarespace

Homepage

```
Luxury Hero

↓

Trending

↓

AI Quiz

↓

Discover by Notes

↓

Top Picks

↓

Testimonials

↓

Footer
```

---

Gunakan Finish Layer

✅ Block Animation

Botol parfum muncul perlahan.

---

✅ Block Transform

Card miring.

Asimetris.

Premium.

---

✅ Font Upload

Upload

Canela

atau

Cormorant

---

✅ Stack

Responsive.

---

# Teknologi

Frontend

* Squarespace
* Finish Layer

Backend

* FastAPI
* Go
* Node

Database

* PostgreSQL

Vector

* pgvector

AI

* OpenAI Responses API
* GPT-5.5

Search

* Hybrid Search

Scraping

* Playwright
* BeautifulSoup
* Firecrawl (jika diperlukan)

Deployment

* Docker
* Kubernetes (opsional)
* Cloudflare

---

# Video Demo

30–60 detik

1. Homepage
2. AI Quiz
3. AI Chat
4. Compare
5. Price Tracker
6. Review Summary
7. Mobile responsive

---

# Kenapa ide ini kuat?

### Untuk Squarespace

✔ desain premium

✔ UX

✔ Finish Layer

✔ animasi

✔ typography

✔ storytelling

---

### Untuk OpenAI

✔ AI Agent

✔ Responses API

✔ RAG

✔ tool calling

✔ reasoning

✔ recommendation engine

✔ AI search

---

## Roadmap pengerjaan (6 hari)

| Hari | Fokus                                                        | Output                                   |
| ---- | ------------------------------------------------------------ | ---------------------------------------- |
| 1    | Riset + scraping + desain informasi                          | Dataset parfum terstruktur dan wireframe |
| 2    | Backend API + database + pipeline ingest                     | API rekomendasi dan data parfum          |
| 3    | Integrasi OpenAI (chat, RAG, summarizer, rekomendasi)        | AI Fragrance Assistant berfungsi         |
| 4    | Membangun website di Squarespace + Finish Layer              | Landing page premium dan halaman utama   |
| 5    | Integrasi frontend–backend, pengujian, optimasi mobile       | Produk end-to-end siap demo              |
| 6    | Dokumentasi Devpost, video walkthrough, posting media sosial | Submission lengkap untuk kedua kompetisi |

## Agar peluang menang lebih tinggi

Daripada membuat "website rekomendasi parfum", saya akan memposisikannya sebagai **platform AI untuk eksplorasi dunia parfum**. Fokus presentasi bukan pada teknik scraping, tetapi pada bagaimana AI mengubah data yang tersebar menjadi rekomendasi yang benar-benar personal dan mudah dipahami.

Judul yang lebih menarik misalnya:

> **ScentSphere AI — An AI-powered fragrance intelligence platform built with OpenAI and Squarespace.**

Dengan positioning ini, Anda memiliki satu produk yang dapat memenuhi narasi kedua hackathon: **OpenAI sebagai mesin kecerdasan**, dan **Squarespace sebagai pengalaman web yang profesional dan menarik**.

# Amazon GEO Engine

**Get recommended by Rufus & Alexa. Not just found.**

Amazon GEO Engine is a Chrome extension that analyzes your Amazon listing's "semantic health" through the lens of the **COSMO algorithm** — the AI that powers Rufus and Alexa product recommendations. It scores your title and bullet points across five dimensions, then gives you a concrete checklist and rewritten copy you can paste straight into Seller Central.

---

## 🔒 Privacy

**This extension only scrapes publicly visible listing text (title, bullet points). Only this text is sent to the analysis engine API. We never collect, store, or upload any account data, sales data, or browsing history.**

---

## 🎯 Features

| Feature | Description |
|---|---|
| **One-Click Diagnosis** | Open the extension on any Amazon product page — auto-scrapes title, bullets, ASIN |
| **5-Dimension GEO Score** | Scenario · Audience · Material · Evidence · Emotion — each scored /25 |
| **Actionable Checklist** | 4+ specific action items telling you exactly what to change and why |
| **Quantitative Reasoning** | Per-dimension score gaps, missing signal counts, estimated absorption rate uplift |
| **Bullet Rewrites** | 5 optimized bullet points with data-backed claims — one-click copy to clipboard |
| **Item Highlights** | Auto-generated 125-char highlights field (Amazon's July 27, 2026 mandate) |
| **Alexa Voice FAQ** | 3 Q&A pairs optimized for voice-search queries |
| **Seller Central Jump** | One click from diagnosis to the inventory edit page — 17 marketplaces supported |
| **History** | Auto-saves analysis history; survives popup close |

---

## 🚀 Install (30 seconds)

### From Chrome Web Store (Recommended)

> *Under review — coming soon*

### Manual Load

1. Clone the repo:
   ```
   git clone https://github.com/onlyJin/amazona_geo.git
   ```
2. Open `chrome://extensions/` → enable **Developer mode**
3. Click **Load unpacked** → select the `extension/` folder
4. Open any Amazon product detail page, click the extension icon

---

## 💰 Pricing

| Plan | Price | Analyses |
|---|---|---|
| **Free** | $0 | 5 / month |
| **Pro** | Coming soon | Unlimited |

No credit card. No signup. The analysis engine runs in the cloud — you just click a button on any Amazon product page.

---

## 📊 Benchmark Report

We tested 72 real Amazon listings across 5 popular categories (47 Best Sellers vs. 25 low-ranked products):

| Dimension | Best Seller | Control | Gap |
|---|---|---|---|
| Scenario Coverage | 16.0 | 14.2 | +1.8 |
| Audience Precision | 13.5 | 11.2 | +2.3 |
| Material Authority | 15.6 | 13.6 | +2.0 |
| **Evidence Density** | **12.7** | **9.3** | **+3.4** |
| Emotional Benefit | 15.6 | 17.2 | −1.6 |
| **Total Score** | **73.1** | **65.4** | **+7.7** |

**Key finding: Evidence Density is the #1 differentiator.** Top-ranked listings back claims with specific data and certifications. Lower-ranked listings pile on emotional language but skip the proof.

[→ Full benchmark report](promo/benchmark_report.html)

---

## 🛠️ What's in This Repo

- **Chrome Extension** (Manifest V3, open source — MIT)
- **Benchmark data & report**
- **Landing page**

The analysis engine backend is a closed-source SaaS. For API access or enterprise customization, contact [your email].

---

## 📄 License

- Chrome Extension — MIT License
- Analysis Engine — Proprietary

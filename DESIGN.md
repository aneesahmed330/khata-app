# Design System — "Khata"

Ek hi visual identity, poori app mein. Koi component apna hex, apni duration, apna radius nahi likhega — sab tokens se aayega.

---

## 1. Direction: the khata, not the dashboard

Is app ka asli kaam chart dikhana nahi hai. Asli kaam **ye transformation** hai:

> tum kuch loose, human, Roman Urdu mein bolte ho → app usay ek precise, ruled ledger line bana deta hai

To design ka anchor bhi wahi hoga: **bahi khata** (cloth-bound ledger — hand-ruled columns, running balance right margin mein) aur **rukka** (udhaar ki handwritten parchi — literally `loans` collection).

Dashboard UI nahi. Cards-in-a-grid nahi. **Ek continuous ruled column, right margin mein running balance.** Wahi tumhara data model bhi hai.

**Jo consciously avoid kiya:** cream `#F4F1EA` + serif + terracotta (har AI design), black + acid-green fintech look (bohot tempting tha, isi liye chhoda), aur truck-art pastiche (Pakistani design ka cliché trap).

---

## 2. Palette — PKR 1000-note se derive kiya

1000-rupee note deep petrol-teal hai. Wahan se ground liya; accent **marigold/genda** — value ka rang, bina literal gold gradient ke.

```css
@theme {
  /* ground — ledger cover, not generic dark mode */
  --color-ink:        #0E1A1C;   /* app background */
  --color-ink-lift:   #152426;   /* raised surface, sheet */
  --color-ink-sunk:   #0A1416;   /* input wells */

  /* paper — light mode. cool bone, deliberately NOT cream */
  --color-paper:      #E8E9E4;
  --color-paper-lift: #F2F3EF;

  /* the rule — depth ka zariya. shadow ki jagah. */
  --color-rule:       #24373A;   /* dark */
  --color-rule-soft:  #1B2C2F;

  /* text */
  --color-fg:         #EDEFEA;
  --color-fg-muted:   #8CA0A2;
  --color-fg-faint:   #566B6D;

  /* accent — marigold. amounts, primary action, focus. */
  --color-accent:     #E8A33D;
  --color-accent-dim: #A8762C;

  /* semantic — SIRF summary/state pe, har row pe nahi (§3 dekho) */
  --color-out:        #C2544A;   /* madder — expense */
  --color-in:         #4E9E7F;   /* jade — income */
  --color-pending:    #6B7BA8;   /* dusty indigo — loan outstanding */
}
```

7 named colors. Bas. `--color-red-500` type generic scale kabhi nahi.

---

## 3. Aesthetic risk: rows monochrome rahenge

Har app har expense row ko laal aur har income ko hara karta hai. **Hum nahi karenge.**

Asli khata mein sab kuch **ek hi ink** mein hota hai — *column* batata hai debit ya credit. To:

- Saare amounts `--color-fg` mein, tabular figures, ek fixed right column
- Direction ek chhote leading glyph se: `↓` out · `↑` in · `→` udhaar diya · `←` wapas aaya — **ink mein, colored nahi**
- **Color sirf 3 jagah aata hai:** balance delta, budget state, loan outstanding

**Kyun ye behtar hai:** ye list tum din mein 50 dafa scroll karo ge. Rainbow list thakati hai. Monochrome list padhne mein aasan hai aur ledger jaisi lagti hai. Aur jab color aata hai, to uska matlab hota hai.

---

## 4. Typography

| Role | Face | Kyun |
|---|---|---|
| Display | **Bricolage Grotesque** (variable) | Thoda off, condensed-optical — signage/stamp jaisa. Inter/Roboto/Playfair/Fraunces sab defaults hain, isi liye nahi. |
| UI / body | **Archivo** + Archivo Narrow (dense labels) | Grotesque, chhote size pe saaf, numerals achhe |
| Numerals / data | **Spline Sans Mono** | Amounts, dates, account numbers. Courier/JetBrains nahi — humanist warm mono. |
| Urdu script | **Noto Nastaliq Urdu** | Voice se Urdu script aata hai. **Nastaliq, Naskh nahi** — Urdu ka sahi style. Raw transcript isi mein render hoga. |

```css
--text-display: 'Bricolage Grotesque', sans-serif;
--text-ui:      'Archivo', sans-serif;
--text-num:     'Spline Sans Mono', monospace;
--text-urdu:    'Noto Nastaliq Urdu', serif;
```

**Scale — 7 steps, bas:**
```
balance   44px / 0.95 / -0.03em   display, tnum
amount    17px / 1.0  /  0em      num, tnum
title     20px / 1.2  / -0.01em   display
body      15px / 1.5             ui
label     13px / 1.3  /  0.01em   ui
micro     11px / 1.2  /  0.06em   ui, uppercase — eyebrows only
urdu      17px / 2.1              urdu (Nastaliq ko leading chahiye)
```

**Har number pe `font-feature-settings: "tnum" 1;`** — warna scroll pe digits hilte hain aur poora ledger effect mar jata hai.

**Pakistani digit grouping — non-negotiable:** `1,24,500` na ke `124,500`. Lakh system: pehle 3 digits, phir 2-2. `3,00,000`. Shorthand bhi: `1.2 lakh`. Ye ek `formatPKR()` util hai, aur yahi cheez app ko "yahan ka" banati hai.

---

## 5. Layout

### Home
```
┌──────────────────────────────────┐
│ JULY 2026                     ⋯  │  micro eyebrow
│                                  │
│ 1,24,500                         │  44px display, tnum, accent
│ PKR · 4 accounts                 │  label, muted
│                                  │
│ ┌─────┐┌─────┐┌─────┐┌─────┐     │  account strip, h-scroll
│ │Mzn  ││Cash ││Jzc  ││Card │     │  snap, 1px rule border
│ │78,2 ││12,3 ││ 4,0 ││-2,1 │     │
│ └─────┘└─────┘└─────┘└─────┘     │
│                                  │
│ SPENT                            │
│ ████████████████░░░░░░░  68%     │  1px-tall bar. ring NAHI.
│ 34,200 of 50,000                 │
│                                  │
│──── aaj ─────────────────────────│  ruled date divider
│ ↓  Palao                    350  │
│    Food · Meezan                 │
│ ↓  Rickshaw                 120  │
│    Transport · Cash              │
│──── kal ─────────────────────────│
│ ↑  Salary               3,00,000 │
│    Salary · Meezan               │
│ →  Bilal                  5,000  │
│    Udhaar diya · Cash            │
│                                  │
└──────────────────────────────────┘
   Home        ⬤        Log   More
```

- **Ruled date dividers** with `aaj` / `kal` / `parso` phir dates — khata ka page break. Ye real information encode karta hai (time grouping), decoration nahi.
- **Amounts ek fixed right column mein**, tabular — digits vertically stack honge. Ledger ka poora point yahi hai aur koi app theek se nahi karta.
- Budget ek **1px bar**, ring nahi. Ring har fintech template mein hai.

### Add sheet — the signature
```
┌──────────────────────────────────┐
│                               ✕  │
│                                  │
│  ╭────────────────────────────╮  │  tumhare alfaaz — loose bubble
│  │ ma na aj palao khaya 350   │  │  radius 18, ink-lift bg
│  │ rupees kharch howay        │  │  relaxed leading
│  ╰────────────────────────────╯  │
│                                  │
│              ↓                   │  ~450ms morph
│                                  │
│ ─────────────────────────────── │  ruled line left se draw hoti hai
│  ↓  Palao                  350  │  amount right column mein slide
│     Food · Meezan · aaj         │
│ ─────────────────────────────── │
│                                  │
│  [ Food ▾ ]  [ Meezan ▾ ]        │  editable chips, stamp-in
│                                  │
│  ┌────────────────────────────┐  │
│  │           Save             │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

**Ye poori app ka signature moment hai.** Bubble → ledger line ka morph:
1. `border-radius` 18px → 2px
2. background `ink-lift` → transparent
3. hairline rule left se right draw
4. amount right column mein slide + tabular pe snap
5. category chip stamp-in (scale 0.9 → 1, 90ms late)

Ek orchestrated sequence, ~450ms. **Baqi poori app mein is se bara koi motion nahi hoga.** Boldness ek jagah kharch karo.

Urdu voice input aaye to bubble **Nastaliq** mein render hoga — wo apne aap mein khoobsurat hai aur is app ke ilawa kahin nahi milega.

---

## 6. Motion system

```ts
// lib/motion.ts — har component yahan se import karega, inline kabhi nahi
export const ease = {
  out:    [0.2, 0.8, 0.2, 1],    // primary — confident decel
  inOut:  [0.5, 0, 0.5, 1],
} as const

export const dur = {
  micro: 0.12,   // hover, press, chip toggle
  state: 0.22,   // color/opacity change, tab switch
  enter: 0.34,   // list item, sheet content
  morph: 0.45,   // SIRF bubble → ledger line
} as const

export const spring = { type: 'spring', stiffness: 420, damping: 34 } // sheet
```

| Kahan | Kya |
|---|---|
| Bubble → ledger | `motion` ka `layoutId` — morph almost free mil jata hai |
| Sheet | `vaul` drawer — spring, drag-to-dismiss, native feel |
| Route change | View Transitions API jahan support ho, warna crossfade |
| List enter | stagger 24ms, `y: 6 → 0` + fade. Sirf naye items, mount pe poori list nahi. |
| Balance change | count-up, tabular so **zero layout shift**. Sirf change pe. |
| Commit | `navigator.vibrate(8)` — Android, subtle |
| Undo toast | slide-up + 5s hairline countdown bar |

**Reduced motion — non-negotiable:**
```ts
const reduce = useReducedMotion()
// morph → simple crossfade, stagger → 0, count-up → instant set
```

---

## 7. Consistency mechanism ("ek jesa UI" ka enforcement)

Ye rules hi asal mein consistency dete hain — taste nahi, constraints:

1. **Tailwind v4 `@theme`** single source of truth. Component mein hex likhna = review reject.
2. **Spacing: sirf 6 steps** — `4 8 12 16 24 40`. Beech ka kuch nahi. Restrict karna hi consistent banata hai.
3. **Radius: sirf 3** — `2px` (ledger row) · `12px` (chip, button) · `20px` (sheet). Aur kuch nahi.
4. **Shadows: zero.** Depth `1px rule` + background lift se. Shadows hi cheezon ko templated banate hain, aur inke baghair ledger feel automatically aati hai.
5. **Motion sirf `lib/motion.ts` se.** Inline duration/easing = reject.
6. **shadcn/ui use karo, lekin tokens se restyle karo** — default shadcn look ship nahi hoga.
7. Ek `<Amount>` component. Ek `<LedgerRow>`. Ek `<DateRule>`. Amount kabhi raw `<span>` mein nahi.

**Ek accessory hata di:** paper grain / noise texture overlay ka plan tha — cut. Flat ink surfaces. Signature morph ko akela chamakna chahiye.

---

## 8. Theme

Default **ink** (dark). Kyun: ye phone app hai jo raat mein khane ke baad expense log karte waqt khulta hai, aur marigold amounts dark teal pe chamakte hain. **Paper** (light) mode first-class hai, afterthought nahi — `[data-theme]` pe token swap, `prefers-color-scheme` respect.

---

## 9. Quality floor (announce nahi karna, just build)

- 360px se 430px tak perfect; horizontal scroll kabhi nahi
- Touch targets ≥ 44px, `env(safe-area-inset-bottom)`
- Visible keyboard focus — 2px accent ring, `:focus-visible`
- Reduced motion respected
- Amount input pe custom numeric keypad (native keyboard nahi)
- Empty states direction dete hain, mood nahi: *"Koi entry nahi. Neeche `+` dabao ya bolo — 'aj 200 ka petrol'."*
- Errors apologize nahi karte, bas batate hain kya karna hai: *"Amount samajh nahi aaya. Number likh do ya manual form use karo."*
- Har button apna kaam batata hai — `Save`, na ke `Submit`. Naam poore flow mein ek hi rahega.

---

## 10. Copy rules

- Roman Urdu + English mix — Anees ki natural zubaan. UI labels bhi: `aaj`, `kal`, `Udhaar diya`, `Baqi hai`.
- Sentence case, filler nahi, plain verbs.
- Specific > clever. `Bilal ko 5,000 dene hain` na ke `Outstanding receivable`.
- Ek action ka naam poore flow mein na badle.

---

## 11. Reporting & Charts

Insights ka **reporting is not a rainbow bolted on the ledger.** Method: form pehle (data ka job kya hai), phir color — aur color **computed** hai, eyeball nahi. Har chart-color decision `scripts/validate_palette.js` se guzar kar aayi hai; numbers niche likhe hain.

### 11.1 Form — job se decide, chart se nahi

| Sawal | Job | Form | Color |
|---|---|---|---|
| "Is mahine kis category pe zyada laga?" | **Rank magnitude** | Horizontal bar, sorted desc | Sequential — **ek hue** (§11.2), koi rainbow nahi |
| "Roz ka spend trend" | **Trend over time** | Line/area, single series | Sequential — same hue |
| "Income vs expense" | **Polarity** | Diverging bars ya split | Diverging — `in`/`out` (§11.3) |
| "Budget kitna use hua" | **Ratio vs limit** | Meter (already §DESIGN §home) | 1px bar, same-ramp track — **ring nahi** |
| "Ek mahine ka total" | **Single number** | Stat tile / hero figure | Text token, no chart |

**Categorical (rainbow) palette is deliberately absent.** ~10 root categories exceed the skill's own ceiling (7–8 max, phir "Other" mein fold karo) — aur categorical color ka asli kaam hai *identity* dikhana, jab ke tumhara sawal *ranking* hai ("sab se zyada kahan laga"), jo **sequential** ka job hai, categorical ka nahi. Anti-pattern list ka pehla entry hi ye hai: *"a value-ramp on nominal categories"* ko color na karo har bar apna hue — **ek hue, sirf length farq karti hai.** Ye Khata ke §3 (monochrome rows) ke ain mutabiq hai, us se tootne wala nahi.

**Agar kabhi "category mix over time" chahiye** (stacked area, top-5 + Other) — tab hi true categorical palette chahiye hogi, aur wo alag se derive + validate hogi us waqt. Abhi ke MVP mein nahi banai — evidence ke baghair rainbow banana khud ek anti-pattern hai.

### 11.2 Sequential — accent, dono modes ke liye alag step

Marigold accent raw hex **dark surface pe theek hai, paper pe fail karta hai**:
```
#E8A33D vs ink   (#0E1A1C):  8.23:1   PASS
#E8A33D vs paper (#E8E9E4):  1.77:1   FAIL — 3:1 se bohot neeche
```
Isi liye chart marks (bars, lines) **mode ke hisaab se alag token** lete hain — same jaisa reference palette ka apna light/dark step pattern hai. `--color-accent-dim` (jo already DESIGN.md §2 mein hai) exactly yehi kaam ke liye theek nikla:
```
--color-accent-dim #A8762C vs ink:   4.47:1   PASS
--color-accent-dim #A8762C vs paper: 3.25:1   PASS
```
```css
--chart-magnitude-dark:  var(--color-accent);       /* #E8A33D — dark surface only */
--chart-magnitude-light: var(--color-accent-dim);   /* #A8762C — paper surface */
```
Naya token nahi banana para — existing accent-dim ne dono jagah kaam kar diya.

### 11.3 Diverging — `in`/`out` already ek diverging pair hain

Har direction-color decision Khata mein pehle se hai (`--color-out` madder, `--color-in` jade) — ye reuse karna hai, doosri categorical palette nahi banani. Validator chalaya (dark surface, `#0E1A1C`):
```
#C2544A (out) ↔ #4E9E7F (in)
  Lightness band     PASS
  Chroma floor        FAIL — jade C 0.093, floor 0.10 (thoda "gray" reads)
  CVD separation      WARN (floor band) — ΔE 7.5 deutan — sirf secondary encoding ke saath legal
  Normal-vision floor PASS — ΔE 22.8
  Contrast vs surface PASS — dono ≥3:1
```
Ek masla mila: **jade chart mark ke liye thora kam saturated hai.** UI mein chhote dots/badges pe theek hai (jahan icon+label hamesha saath hota hai — Khata ka rule §3), lekin bara data mark (bar/area fill) chahiye to chroma floor clear nahi karta.

**Fix — chart-specific jade step, UI token nahi badla:**
```
--color-in-chart: #3E9B78     /* jade family, thora zyada chroma — CHARTS ONLY */
```
```
#C2544A ↔ #3E9B78:  chroma PASS · CVD floor-band PASS (both modes) · normal-vision PASS
```
**CVD floor-band (6–8, WARN nahi FAIL) legal hai kyunki secondary encoding hamesha maujood hai** — `↓`/`↑` glyph + label, koi bhi rang akela meaning nahi karta. Ye Khata ka §3 rule hai, aur yahi wajah hai ye WARN acceptable hai.

Diverging midpoint = neutral `--color-rule` (light `--color-rule-soft`), never a hue.

### 11.4 Marks & interaction — same rules, sab charts pe

- Bar: **≤24px thick**, 4px rounded data-end, square baseline
- Line: 2px, round join
- Area fill: series hue **~10% opacity** — wash, block nahi
- Gridlines: hairline (1px), `--color-rule`, solid — **dashed kabhi nahi**
- 2px surface gap between touching bars/segments — border kabhi nahi khenchna
- **Hover hai by default** — crosshair on line/area, per-mark tooltip on bar. `textContent` se render karo, `innerHTML` nahi (labels untrusted data hain)
- **Tooltip gate nahi karta** — jo bhi tooltip mein hai wo table view mein bhi hona chahiye
- **Filter row ek hi jagah**, charts ke upar, sab pe asar — per-chart filter kabhi nahi
- Refetch pe purana render reduced-opacity pe hold karo — skeleton flash nahi

### 11.5 Tokens summary

```css
@theme {
  /* existing */
  --color-accent-dim: #A8762C;   /* already tha — light-mode chart magnitude */

  /* new — chart-only, UI tokens nahi badle */
  --color-in-chart: #3E9B78;     /* jade, chart-safe chroma */
}
```
Sirf **ek** naya token. Baqi sab existing DESIGN.md palette ka reuse hai — yahi consistency ka poora point hai.

# AI Expense Tracker — Plan

Natural-language, mobile-first expense tracker. Roman Urdu mein **bolo ya likho** → app khud sahi category + subcategory + account mein entry kare, aur **bataye ke kya hua**.

**Stack (100% free):** Next.js 14 (FE + BE, ek project) · MongoDB Atlas M0 · Gemini API free tier · Vercel Hobby

**Docs:** `plan.md` (ye — features, architecture, data) · [`DESIGN.md`](DESIGN.md) (visual system: palette, type, motion)

---

## 1. Core Idea

```
voice (Web Speech) ──┐
                     ├──→ same text pipeline
text input ──────────┘
        ↓
[Layer 1] Deterministic parse — dictionary + rules (0 LLM call, 0 cost)
        ↓ confidence ≥ 0.85 aur kuch ambiguous nahi → ~80% inputs yahin khatam
        ↓ warna
[Layer 2] Gemini call — top 15 similar examples DB se retrieve karke inject
        ↓
[Layer 3] resolveOrCreate() gate → Zod validate → preview → chips → Confirm
        ↓
[Commit]  ledger write + ActionReceipt   ← app batata hai kya kya hua
        ↓
[Learning] correction? → naya alias + naya example DB mein save
```

Char non-negotiable rules:

1. **App nayi categories / subcategories / tags / people / loans / accounts bana sakta hai** — lekin `resolveOrCreate()` gate ke through, aur **LLM khud DB mein kabhi nahi likhta**. LLM sirf *intent* deta hai; server validate karke execute karta hai. Silent invention se `Food` / `Foods` / `Khana` ban jate hain — data rot. §4.
2. **Account sirf tab banega jab tum balance batao** — `"Meezan mein 78,000 pari hai"` → banega. Ek expense se jahan account ka naam hi nahi liya → **kabhi nahi**. §4.6.
3. **Money-moving ambiguity pe commit nahi hoga** — udhaar / income, account confirm ke bina nahi.
4. **Account balances kabhi LLM ko nahi bheje jayenge** — parsing ke liye zaroorat nahi, sirf names chahiye. (Gemini free tier ka data Google product improvement ke liye use ho sakta hai.)

Aur ek promise: **har action ke baad app batata hai kya hua** — kuch bhi chup chaap nahi. §5.

---

## 2. Knowledge Base — "apna data" wala system

### 2.1 Pehle sach: 100,000 examples prompt mein nahi ja sakte
- 100k × ~30 tokens = **~3M tokens**. Gemini Flash ka context 1M hai — fit hi nahi hoga.
- Free tier quota tight hai (~10–15 RPM, ~250–1500 requests/day, aur Google ne Dec 2025 mein bina notice 50–80% cut kiya tha).
- In-context examples ka faida **~20–40 ke baad flat ho jata hai**. Uske baad noise.
- Aur asli baat: **tumhari personal vocabulary 100k nahi hai.** Saal bhar mein ~150 items, ~30 categories, ~5 accounts, ~15 log. ~500 distinct facts. Generic 100k ka 99% bekaar.

### 2.2 Sahi tareeqa — dataset **database** mein, prompt mein nahi

**Layer 1 — Dictionary + rules (LLM ko chhuye bina, ~80% inputs)**

```
aliases  _id, user_id, term, term_normalized,          # ALWAYS per-user (§8.1)
         maps_to: { kind: "category"|"account"|"person"|"tag", id },
         script: "latin"|"urdu", weight, hit_count, source: seed|correction
```
`aliases` per-user hain kyunki wo **per-user category IDs** pe point karte hain — global alias kisi doosre user ki category id pe point nahi kar sakta. Seed aliases user bootstrap ke waqt copy hote hain (§8.1).
- `indrive, in drive, indriver` → **Transport › InDrive** (child id pe point karta hai)
- `palao, biryani, khana, nashta` → **Food › Dhaba/Hotel**
- `rickshaw, chingchi` → **Transport › Rickshaw** · `petrol, diesel, cng` → **Transport › Fuel**
- Alias hamesha **sab se specific** category pe point karta hai (child, root nahi). `root_category_id` usi se derive ho jata hai — alias schema mein koi change nahi chahiye.
- Pure TypeScript parsers (koi API call nahi):
  - **Amount:** `350`, `350 rupay`, `3.5k`, `dhai hazaar`, `saarhay teen sau`, `paune do sau`, Urdu digits `۳۵۰`
  - **Date:** `aj`, `kal`, `parso`, `pichlay hafte`, `1 tareekh`, `pichlay mahinay`
  - **Intent signals:** `udhaar/diya` → loan_given · `udhaar/liya` → loan_taken · `mila/aaya/salary` → income · `nikaale/transfer` → transfer · `pari hai/mein hain` → declare_account
- Confidence: amount mila (+0.40) · category match (+0.25) · intent clear (+0.20) · account resolve ya safe default (+0.15)
- `≥ 0.85` aur koi ambiguity nahi → **seedha commit, Gemini call hi nahi hogi.**
- **Layer 1 kuch create nahi kar sakti** — sirf known aliases match karti hai. Creation Layer 2 pe escalate hoti hai (§4.4 — self-limiting hai).

**Layer 2 — Dynamic few-shot retrieval (yahan bara dataset kaam aata hai)**

```
examples  _id, user_id|null, raw_text,
          expected: { intent, amount, item, category_path?, person?, account?, tags? },
          source: seed|correction|verified, hit_count, created_at
```
`category_path` **string** hoti hai — `"Transport › InDrive"` — na ke raw id. Isi wajah se `examples` **global reh sakti hai** (`user_id: null`): koi per-user id reference nahi karti, sirf text→shape mapping hai. Retrieval query: `{ $or: [{user_id: null}, {user_id: me}] }`, user ke apne examples ko higher score.

- Mongo `$text` index `raw_text` pe. Per request: `$text` search → `$meta: "textScore"` sort → **top 15** → prompt mein inject.
- **MVP mein: lexical `$text`, koi extra API call nahi.** Vector upgrade path niche (§2.2a) — gated, abhi nahi.
- Dataset 100k ho ya 2k — prompt hamesha 15 examples ka. Yahi trick hai.

### 2.2a Upgrade path: vector RAG (optional, evals se gated — abhi mat banao)

**Pehli baat: Layer 2 already RAG hai.** "Retrieval-Augmented Generation" ka matlab hai *retrieve karo, phir prompt mein daal kar generate karo* — $text search se top-15 examples nikaal kar Gemini ko dena **exactly yehi hai**. Bas retrieval method **lexical** (token overlap) hai, **semantic** (embeddings) nahi. Log "RAG" bolte waqt aksar vector DB samajhte hain, lekin wo ek implementation detail hai, RAG ki definition nahi.

**Kya vector search possible hai — verify kiya:**
- MongoDB Atlas Vector Search **free M0 tier pe kaam karta hai** — koi paid upgrade nahi chahiye. Ek catch: M0 pe vector index **Atlas UI se manually** banana parta hai (script se automate nahi hota) — one-time global step, per-user nahi.
- Gemini embedding model (`gemini-embedding-001`, ID AI Studio pe confirm karo) ka quota **generation model se alag pool** hai — free tier ~10M tokens/min, jo Flash ke 250 RPD se kahin zyada generous hai. Matlab embedding calls tumhare parsing budget (§8.3) ko **nahi khaten**.

**Kyun abhi nahi:**
- Tumhari vocabulary chhoti aur personal hai (§2.1 ka wahi argument) — same alfaaz repeat hote hain, is liye lexical overlap already achha kaam karta hai. Semantic generalization ka faida sirf **naye phrasing** pe hai jo tum ne pehle kabhi nahi bole — yani Layer 2 ke escalation cases ka ek subset.
- Har upgrade extra cost hai: har seed/correction example ko embed karna (write-time), har Layer-2 query ko embed karna (read-time) — do calls ki jagah ek extra call.
- Eval set (§11 Risks) hi batayega ke masla parsing hai ya retrieval — pehle wo dekho.

**Kab upgrade karna hai:** 50-case eval set chalao (§11). Agar zyada tar misses **retrieval ki wajah se** hain (theek example DB mein hai, lekin `$text` usay top-15 mein nahi la raha kyunki alfaaz mach nahi karte) — tab vector search add karo. Ye ek **contained swap** hai, poori architecture nahi badalti:
```
examples  + embedding: number[]     # naya field, generate karte waqt add hoga
```
```ts
// retrieval.ts — sirf ye function badlega
$text search + textScore  →  $vectorSearch aggregation stage
```
`aliases`, `resolveOrCreate`, `INTENT_SCHEMA`, poora Layer 1/3 waisa hi rehta hai.

**Layer 3 — Correction learning loop (asli "apna data")**

```
corrections  _id, user_id, raw_text, wrong{...}, correct{...}, created_at
```
Har correction se: (1) naya `aliases` row → agli baar Layer 1 pakad lega, Gemini call bachi. (2) naya `examples` row `source:"correction"` → retrieval mein priority.

2–3 mahine mein app **tumhari** vocabulary pe near-perfect. Generic coverage ki zaroorat nahi.

### 2.3 Seed dataset — ek dafa banao

**Do alag seeders, do alag scopes:**

| Script | Scope | Kab chalta hai |
|---|---|---|
| `scripts/seed-examples.ts` | **Global** (`user_id: null`) | Ek dafa, poori app ke liye |
| `scripts/seed-user.ts` | **Per-user** | Har naye user pe (§8.2) |

- `seed-examples.ts`: har **leaf** ke liye Gemini se 20–30 Roman Urdu variations. ~60 leaves × 25 = **~1,500 examples, ~60 API calls**. Plus loans / income / transfer / declare_account / multi-item / tags ke batches → total **~2,000–3,000**.
- `category_path` string hone ki wajah se ye corpus har user ke liye kaam karta hai, chahe unki category IDs alag hon.
- Seed **aliases** in examples se auto-extract hoti hain, lekin **`seed-user.ts` ke waqt** us user ki category IDs pe map ho kar likhi jati hain — global nahi.
- 3k → 100k ka faida almost zero (retrieval sirf 15 uthata hai). Pehle 3k pe accuracy naapo.

### 2.4 Quota math (kyun Layer 1 zaroori hai)

**Verified live quota (2026-07-31): `gemini-2.5-flash` free tier = 20 RPD, na ke assumed 250.** Neeche wali table originally 250 RPD assume karti thi — real numbers bohot tight hain:

| | Layer 1 ke bina | Layer 1 ke saath (80% hit) |
|---|---|---|
| 250 entries/din | 250 API calls | **50 API calls** |
| Free tier (**actual: 20 RPD**) | quota din ke ~8% mein khatam | 50 calls bhi 20 RPD se **2.5x zyada** — abhi bhi overshoot |
| Latency (typical entry) | ~1.5–3s | **~20ms** |

**Matlab 80% Layer-1 hit rate bhi kaafi nahi hai** jab tak vocabulary itni mature na ho jaye ke Layer 2 escalation din mein 20 se kam ho. Layer 3 correction loop (naya alias turant save karna) isi liye pehle se zyada zaroori hai — har naya alias ek future Gemini call bachata hai.

---

## 3. NL Engine — Gemini call ka shape

```ts
// lib/llm.ts — poora LLM layer sirf is ek function ke peeche
export async function parseIntent(text: string, ctx: UserContext): Promise<ParsedIntent>
```
Gemini Roman Urdu pe struggle kare to provider swap **ek file ka change**.

```ts
import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const res = await ai.models.generateContent({
  model: "gemini-3.6-flash",              // free-tier model list verify karo
  contents: buildPrompt(examples, ctx, text),
  config: {
    responseMimeType: "application/json",
    responseSchema: INTENT_SCHEMA,         // guaranteed valid JSON
    temperature: 0,
    systemInstruction: SYSTEM_RULES,
  },
});
```

**Structured output, tool use nahi.** Phir bhi server pe **Zod se dobara validate** — schema conformance ≠ semantic correctness.

`INTENT_SCHEMA`:
```
intent: enum[add_expense, add_income, lend_money, borrow_money,
             record_repayment, transfer, declare_account,
             query_data, need_clarification, multi]

amount?, item?, date?, note?, direction?
category_id?                        # existing pick — sab se SPECIFIC (child preferred)
account_id?, to_account_id?
person_id?

# creation proposals — LLM sirf propose karta hai, server decide karta hai (§4)
new_category?:     { name, type: expense|income,
                     parent_id?,        # existing root ki id
                     parent_name?,      # ya naam, agar id na mile
                     reason }
new_person?:       { name }
new_tags?:         string[]
declared_account?: { name, type: bank|cash|wallet, balance }
loan_action?:      enum[new, append, repayment]

missing?: string[]
confidence: number
actions?: [...]     # multi ke liye
```

**Prompt mein kya jata hai (order matters):**
```
1. SYSTEM_RULES              (stable)
2. Top 15 retrieved examples (per-request, DB se)
3. Today: 2026-07-30 (Thursday), TZ: Asia/Karachi
4. Accounts: [{id, name, type}]      ← balance NAHI
5. Categories: indented 2-level tree —
     Transport (id: c_tr)
       › InDrive (id: c_tr_ind)
       › Rickshaw (id: c_tr_rick)
       › Fuel (id: c_tr_fuel)
     Food (id: c_fd)
       › Dhaba/Hotel (id: c_fd_dhaba)
       ...
6. People: [{id, name}] + har ek ka open loan (amount, direction)
7. Tags: [{id, name}]  (top 30 by usage)
8. User text
```
Tree indented text ke tor pe bhejo, nested JSON nahi — kam tokens, aur model hierarchy behtar samajhta hai.

**SYSTEM_RULES ke ahem points:**
- **Sab se specific category pick karo.** `"150 indrive"` → `Transport › InDrive`, na ke sirf `Transport`. Koi child fit na kare to root chalega — wo legitimate hai.
- Naya category propose karte waqt **parent bhi batao** (`parent_id` ya `parent_name`). Root-level naya category sirf tab jab kisi maujooda root mein fit hi na ho.
- **Depth 2 max.** Child ke andar child kabhi propose na karo.
- Route / context (`"flat sa office"`) **`note` mein rakho** — drop na karo, wo user ne bola hai.
- Account: naam liya hai to match karo. `"X account mein N pari hai"` → `declare_account`. Expense/income mein naam nahi: default account + amount ≤ threshold → default; warna `need_clarification`. **Expense se account propose karna mana hai.**
- Person ka open loan ho to `loan_action` set karo, guess na karo.
- Relative dates → absolute `YYYY-MM-DD`. Ambiguous ho to `need_clarification`.
- Urdu script input bhi handle karo (voice se aata hai).
- `query_data` mein koi `new_*` field kabhi nahi.

---

## 4. Entity Resolution & Auto-Creation

App ko itna intelligent hona chahiye ke tumhari baat se **nayi category / subcategory / income source / tag / person / loan / account** khud bana le. Distinction:

- **Silently invent karna = bura.** 2 mahine mein `Food`/`Foods`/`Khana` — budgets aur reports tabah.
- **Propose → confirm pe create → phir hamesha auto-use = sahi.**

**Architectural rule: LLM DB mein khud kabhi nahi likhega.** Wo intent deta hai; server `resolveOrCreate()` se guzar kar execute karta hai.

### 4.1 `resolveOrCreate()` — anti-rot gate
```
LLM: { new_category: { name: "Indrive", parent_name: "Transport", ... } }
   ↓
0. Parent resolve karo (root hona chahiye, warna reject)
1. Exact match (parent ke andar, name_normalized)?     → existing id
2. Alias hit?                                          → mapped id
3. Fuzzy ≥ 0.85 (Levenshtein/trigram) — SAME PARENT ke andar?
                                                       → existing id + naya alias
                                                          "Indrive" → "InDrive"
4. Doosre parent mein exact match nikla?                → chip: [Move here] [New under Transport]
5. Kuch nahi mila                                      → PROPOSE creation (ek dafa confirm)
```

**Fuzzy matching parent-scoped hai** — ye ahem hai. `Transport › Other` aur `Food › Other` **legitimately alag** hain; global fuzzy match unhein merge kar dega. Isi liye unique index bhi `(user_id, parent_id, name_normalized)` hai, na ke `(user_id, name_normalized)`.

```ts
// lib/resolve.ts — LLM ye kabhi call nahi karta, server karta hai
resolveOrCreateCategory(name, type, parentRef?, opts): { id, rootId, created, proposal? }
resolveOrCreatePerson(name):               { id, created }
resolveOrCreateTag(name):                  { id, created }
resolveOrDeclareAccount(name, type, bal):  { id, created, adjustment? }   // §4.6
resolveLoan(personId, amount, direction):  { action: "new"|"append"|"repay", loanId?, ambiguous? }
```

### 4.2 Kya auto banega, kya confirm mangega

| Entity | Auto? | Kyun |
|---|---|---|
| **Tag** | Auto, chup chaap | Zero blast radius. `"shaadi ke liye suit 5000"` → tag `shaadi` |
| **Person** | Auto, chup chaap | "Bilal ko udhaar diya" — record banana obvious |
| **Subcategory** (child) | **Ek dafa confirm** | Parent ke andar. Chip: `[+ Transport › InDrive]` `[Use Rickshaw]` |
| **Root category** | **Ek dafa confirm, extra friction** | Naya root banana rare hona chahiye — pehle koi maujooda root suggest karo |
| **Income source** | **Ek dafa confirm** | `categories` hi hai `type:"income"` — Income root ke children |
| **Account** | **Sirf `declare_account` se, balance ke saath** | Balance tum de rahe ho to objection khatam. §4.6 |
| **Loan** | Auto — **account confirm mandatory** | Loan ka existence obvious; kis account se paisa gaya wo nahi. §4.3 |

**Account vs Income source** — do alag cheezein:
- **Account** = paisa jahan **para** hai (Meezan, Cash, JazzCash) — iska **balance** hota hai
- **Income source** = paisa jahan se **aata** hai (Salary, Freelance) — `category` hai `type:"income"`, balance nahi

### 4.3 Loan ka special case
"Bilal ko 5000 diye" — Bilal ka pehle se 3,000 ka open loan hai. Naya? Add? Wapas kar raha? Guess khatarnaak:
```
→  Bilal ko 5,000
   Bilal ka 3,000 baqi hai
   [ Naya loan ]  [ 3,000 mein add ]  [ Bilal wapas kar raha ]
```
LLM `loan_action` mein raay deta hai, **confirm hamesha user se**.

### 4.4 Creation self-limiting hai (quota pe zero pressure)
Layer 1 create nahi kar sakti, to creation Gemini pe escalate hoti hai:

**Pehli dafa "indrive" = 1 API call. Us call ke baad alias ban jata hai → har agli dafa "indrive" Layer 1 pakad leta hai = 0 calls.**

### 4.5 Safety guards
- **Max 8 nayi subcategories / din**, **max 2 naye roots / din**
- **Accounts pe koi daily cap nahi** (decision, 2026-07-31) — cap sirf LLM-driven category proposals ke liye tha (ambiguous parse se sprawl), account declaration hamesha explicit user-stated balance + one-time confirm chip se hoti hai, koi runaway path nahi. Solo user ek hi baithak mein apne saare real bank/cash/wallet accounts declare kar sakta hai.
- `query_data` intent se **kabhi create nahi**
- Name validation: 2–30 chars, control chars reject, emoji-only reject, trim + collapse whitespace
- **Depth 2 enforce at write** — `parent_id` sirf aise category pe point kar sakta hai jiska `parent_id` null hai. Warna reject.
- **Monthly hygiene job:** `auto_created` + `usage_count ≤ 2` → merge suggestion; ek hi naam ke children multiple parents mein → merge suggestion
- Har auto-created row mein `created_from_text` — audit trail

### 4.6 Account declaration
```
"mere Meezan bank account mein 78,000 pari hai"
   → intent: declare_account
   → declared_account: { name: "Meezan", type: "bank", balance: 78000 }
```
Teen outcomes, **teenon ka receipt** (koi silent nahi):

**A. Nahi hai → banao** — `✓ Meezan account banaya · Bank · 78,000 opening`
**B. Hai, balance same → skip** — `· Meezan pehle se maujood — 78,000 · Kuch change nahi hua`
**C. Hai, balance farq → reconcile** — `⟳ 72,500 → 78,000 (+5,500) · Adjustment entry ledger mein`

**Kyun overwrite nahi:** core rule hai `account.balance == sum(transactions)`. Chup chaap overwrite karo to `recompute` (§7) tumhara declared balance mita dega. Is liye farq ka ek **`adjustment` transaction** post hota hai — ledger sum bhi sahi, history bhi sach.

Type naam se infer karo (`meezan|hbl|ubl|allied|bank` → bank · `jazzcash|easypaisa|sadapay|nayapay` → wallet · `cash|naqdi` → cash). Confident na ho to chip mango.

**Credit card support nahi hai — jaan boojh kar.** Anees credit card use nahi karta, aur uski asli logic sasti nahi hai (negative balance, statement cycle, due date, available limit, bill payment = bank→card transfer). Chahiye hoga to alag se add karenge.

### 4.7 Category hierarchy — tumhara InDrive example

```
"indrive sa 150 rupa ma flat sa office gya"
```
Is ek jumle mein **char** cheezein hain:

| Nikla | Kahan gaya |
|---|---|
| 150 | `amount` |
| InDrive | `category_id` → **Transport › InDrive** (child) |
| `flat → office` | `note` — user ne bola hai, drop nahi karna |
| (implicit) | `root_category_id` → Transport, child se derive |

**Exactly 2 levels — na kam, na zyada.** Root (Transport) → child (InDrive). Bas.

**Kyun sirf 2:** arbitrary depth mein teen cheezein tootti hain — MongoDB mein recursive roll-up queries (M0 pe `$graphLookup` mehnga hai), budgets ambiguous ho jate hain, aur category picker ek tree widget ban jata hai. Depth 2 tumhari zaroorat poori karta hai aur ye teenon masle khatam kar deta hai.

**Roll-up ka trick — `root_category_id` denormalized:**
```
transactions: { category_id: "c_tr_ind", root_category_id: "c_tr", ... }
```
Depth 2 hone ki wajah se `root_id = parent_id ?? _id` — write pe ek dafa compute, phir:
- **"Transport pe kitna laga?"** → `group by root_category_id` — ek field, koi join nahi, koi recursion nahi
- **"InDrive pe kitna?"** → `group by category_id`
- Dono queries M0 pe instant

**Root pe direct entry bilkul valid hai.** `"200 transport"` → `category_id = root_category_id = Transport`. Ye khud hi "Other" ka case handle kar leta hai — fake `Other` child banane ki zaroorat nahi.

**Budgets ka rule:** parent budget **roll-up hota hai** — Transport ka 8,000 budget InDrive + Rickshaw + Fuel sab cover karta hai. Child ka apna budget bhi lag sakta hai (`InDrive: 3,000`) — wo parent ke andar ek sub-limit hai. Dono maujood hon to dono track hote hain, aur child pehle red hota hai.

**Insights UI:** default pe sirf roots dikhao; tap karo to indented children khul jayen. DESIGN.md ke ledger style mein perfect baithta hai — root row → indented child rows, same ruled column.

**Seed tree (Pakistani context, ~60 leaves):**
```
Food          › Dhaba/Hotel · Groceries · Delivery (Foodpanda) · Chai/Nashta · Sweets
Transport     › InDrive · Careem · Rickshaw · Fuel · Public · Maintenance · Parking
Bills         › Electricity (K-Electric/LESCO) · Sui Gas · Internet · Mobile Load · Water
Home          › Rent · Maintenance · Kitchen items · Maid/Help
Health        › Doctor · Medicine · Tests · Gym
Shopping      › Clothes · Electronics · Online (Daraz) · Shoes
Family        › Kids · Parents · Gifts · Shaadi/Events
Education     › Fees · Books · Courses
Charity       › Sadqa · Zakat
Personal      › Salon · Subscriptions · Entertainment · Travel
Income        › Salary · Freelance · Dividend · Rental · Gift · Bonus
```

**Merchants alag entity nahi bane — jaan boojh kar.** "InDrive" ko subcategory rakha hai, alag `merchants` collection nahi. Ek merchant do categories mein aa sakta hai (Foodpanda = Food, pandamart = Groceries) — us surat mein do rows ban jayengi, jo ek nayi schema se sasta hai. Agar ye masla asal mein bara nikla, tab `merchant_id` add karenge.

---

## 5. Action Receipts — "app mjy bataye kya hua"

Har commit ek structured receipt return karta hai. **Ek jumle se 4 cheezein ho sakti hain**, to receipt itemized hai.

```ts
type ActionReceipt = {
  summary: string        // ek line, headline
  effects: Effect[]      // itemized — har ek alag verifiable
  undo_token: string
  spoken?: string        // chhota version, TTS ke liye
}

type Effect =
  | { kind: 'account_created',     name, accountType, balance }
  | { kind: 'balance_adjusted',    name, from, to, delta }
  | { kind: 'category_created',    name, type, parent?: string }   // parent = root ka naam
  | { kind: 'tag_created',         name }
  | { kind: 'person_created',      name }
  | { kind: 'transaction_added',   item, amount, categoryPath, account }  // "Transport › InDrive"
  | { kind: 'loan_opened',         person, amount }
  | { kind: 'loan_updated',        person, added, outstanding }
  | { kind: 'loan_settled',        person }
  | { kind: 'transfer_made',       from, to, amount }
  | { kind: 'nothing_changed',     what, reason }    // ← skip case
```

**`nothing_changed` sab se ahem hai.** Skip hone par bhi screen pe kuch aana chahiye — warna silence aur failure mein farq nahi rehta.

**Tumhara InDrive example, pehli dafa:**
```
─────────────────────────────────
 ✓  Transport › InDrive banaya
 ↓  InDrive                  150
    Transport › InDrive · Cash
    flat → office
─────────────────────────────────
    [ Undo ]              [ Theek ]
```
Doosri dafa se sirf transaction line aayegi — InDrive maujood hai, Layer 1 pakad lega, koi API call nahi.

**Multi-effect example** — `"Bilal ko 5000 udhaar diye Meezan se"`:
```
 ✓  Bilal add kiya
 ✓  Udhaar khola — 5,000
 →  Meezan se 5,000 nikle
    Meezan: 78,000 → 73,000
```

Receipt DESIGN.md ke ledger style mein render hoga — har effect ek ruled line, leading glyph, amounts tabular right column. Naya component nahi chahiye.

**Voice output (TTS):** `spoken` field + browser ka `speechSynthesis`, visual se chhota. **Default OFF** — phone zor se bank balance na bole. Settings mein toggle.

**Undo:** har receipt ke saath `undo_token`. Saare effects reverse — created entities bhi (agar unpe kuch aur depend na kar raha ho). 5s hairline countdown (DESIGN.md §6).

---

## 6. Input — voice aur text, dono first-class

**Dono ek hi pipeline mein milte hain.** Voice ek *input adapter* hai, alag feature nahi:
```
mic → Web Speech API → text ─┐
                             ├→ parseIntent() → ... → ActionReceipt
keyboard → text ─────────────┘
```
Isi liye voice **Phase 2d mein hai, Phase 5 mein nahi** — text pipeline ke baad ~30 lines ka kaam.

### 6.1 Web Speech API — primary
- **Bilkul free, unlimited, koi API quota nahi.** Chrome on Android Google ka apna engine use karta hai.
- `lang = "ur-PK"` → **Urdu script** (اردو), Roman nahi. Masla nahi: Gemini Urdu natively padhta hai, aur `aliases` mein `script:"urdu"` rows bhi.
- Fallback `en-IN` mixed speech ke liye. Settings mein choose karo.
- Interim results live dikhao (bubble mein type hote hue), final pe parse chalao.
- **Caveats:** Firefox nahi. iOS Safari partial (14.5+). Text input hamesha available.

### 6.2 Gemini audio — fallback (Phase 5)
Free tier **audio input support karta hai** — transcribe + parse **ek hi call** mein, ~32 tokens/second:
```ts
contents: createUserContent([
  createPartFromUri(uploaded.uri, uploaded.mimeType),
  "Transcribe and parse this expense.",
])
```
Tokens problem nahi (10-sec ≈ 320 tokens), **requests-per-day problem hai** — har voice note 1 RPD, worst case 250 RPD total. Is liye "didn't catch that? send audio" button ke peeche, primary nahi.

Realtime Live API (`gemini-3.1-flash-live-preview`) — WebSocket + tight session limits, is app ke liye over-engineering.

---

## 7. Data Model (MongoDB)

```
users        _id, email, password_hash, name, currency="PKR",
             timezone="Asia/Karachi", default_account_id?,
             tts_enabled: false, speech_lang: "ur-PK", created_at

accounts     _id, user_id, name, name_normalized,
             type: bank|cash|wallet,
             balance, archived, auto_created, created_from_text?, created_at

categories   _id, user_id, name, name_normalized, type: expense|income,
             parent_id: ObjectId|null,     # null = root. DEPTH 2 MAX.
             root_id: ObjectId,            # = parent_id ?? _id (denormalized)
             icon, color, from_seed: bool,  # seed tree se aayi thi (reset ke liye)
             auto_created, created_from_text?, usage_count
             # user_id NEVER null — seed tree har user ko COPY hoti hai (§8.2)

tags         _id, user_id, name, name_normalized, color,
             auto_created, created_from_text?, usage_count

people       _id, user_id, name, name_normalized, phone?,
             auto_created, created_from_text?

transactions _id, user_id, type, amount, item, note,
             category_id?, root_category_id?,      # roll-up ke liye
             account_id, to_account_id?,
             person_id?, loan_id?, tag_ids: [],
             date, raw_text, input_mode: text|voice,
             source: dict|llm|manual|recurring|adjustment,
             confidence?, receipt_id?, deleted_at?, created_at
             # type: expense|income|transfer|loan_given|loan_taken
             #       |repayment_in|repayment_out|adjustment

loans        _id, user_id, person_id, direction: given|taken,
             principal, outstanding, account_id,
             status: open|settled, due_date?, created_at

receipts     _id, user_id, summary, effects: [], undo_token,
             undone_at?, created_at        # §5 — audit + undo

budgets      _id, user_id, category_id, amount, period="monthly", start
             # category root ho to roll-up (children include), child ho to sub-limit

recurring    _id, user_id, template{...}, rrule, next_run, active

aliases      # §2.2 — per-user (category IDs pe point karti hai)
examples     # §2.2 — user_id: null = global corpus, + per-user corrections
corrections  # §2.2 — per-user
```

**Scoping rule (multi-user):** jo collection **kisi per-user entity ki ID reference karti hai, wo per-user hogi.** Sirf `examples` global reh sakti hai kyunki wo `category_path` *string* rakhti hai, id nahi. Isi liye §2.2 mein `category_path` string rakha tha — ab wo decision kaam aa raha hai.

**Indexes:**
`transactions(user_id, date desc)` · `transactions(user_id, root_category_id, date)` · `transactions(user_id, category_id, date)` · `transactions(user_id, tag_ids)` · `accounts(user_id, name_normalized)` unique · **`categories(user_id, parent_id, name_normalized)` unique** · `categories(user_id, root_id)` · `tags(user_id, name_normalized)` unique · `people(user_id, name_normalized)` unique · `loans(user_id, status)` · `aliases(user_id, term_normalized)` · `receipts(user_id, created_at desc)` · `examples` **text index** on `raw_text`

Category ka unique index **`parent_id` include karta hai** — `Transport › Other` aur `Food › Other` dono valid hain. Global unique hota to inhein galat merge kar deta.

**Balance rule:** transactions source of truth, `account.balance` cached via `$inc`. Edit/delete = reverse `$inc`. Declared balance mismatch = `adjustment` transaction (§4.6), overwrite **nahi**. Safety net: `POST /api/accounts/[id]/recompute` + nightly cron reconcile.

**`root_category_id` integrity:** category ka parent badle (child ko doosre root mein move karo) to us category ke saare transactions ka `root_category_id` backfill karna hoga — ek `$set` bulk update. Move sirf Settings se hota hai, NL se nahi.

---

## 8. Architecture — Next.js only

```
expense-tracker/
├── app/
│   ├── (auth)/login/             # register UI nahi — user seeder se banta hai (§8.2)
│   ├── (app)/
│   │   ├── page.tsx              # Home
│   │   ├── add/                  # NL sheet (text + mic) + manual form
│   │   ├── history/  loans/  insights/
│   │   └── settings/accounts  categories  tags  budgets  voice
│   └── api/
│       ├── nl/parse/route.ts     # Layer 1 → (Layer 2) → preview
│       ├── nl/commit/route.ts    # resolveOrCreate() + ledger + ActionReceipt
│       ├── nl/undo/route.ts      # receipt effects reverse
│       └── cron/daily/route.ts   # recurring + hygiene (Hobby = 1 cron)
├── actions/                      # Server Actions — mutations
│   └── transactions.ts  accounts.ts  categories.ts  loans.ts  budgets.ts
├── lib/
│   ├── db.ts                     # Mongo client singleton (globalThis cache)
│   ├── scope.ts                  # §8.1 — forUser(userId) — har query user-scoped
│   ├── bootstrap.ts              # §8.2 — naye user ka poora starting state
│   ├── auth.ts                   # jose JWT + bcryptjs
│   ├── llm.ts                    # parseIntent() — sirf yahan LLM hai
│   ├── parser/                   # Layer 1: amount date intent dict
│   ├── retrieval.ts              # $text search → top 15 examples
│   ├── resolve.ts                # §4 — resolveOrCreate* + parent-scoped fuzzy
│   ├── taxonomy.ts               # §4.7 — tree build, path string, root derive, depth guard
│   ├── ledger.ts                 # balance $inc / reverse / adjustment
│   ├── receipt.ts                # §5 — Effect[] build + render + undo
│   ├── speech.ts                 # §6 — Web Speech wrapper + TTS
│   ├── motion.ts                 # DESIGN.md §6
│   ├── format.ts                 # formatPKR() — lakh grouping
│   └── schemas.ts                # Zod
├── scripts/
│   ├── seed-examples.ts          # GLOBAL, ek dafa
│   └── seed-user.ts              # PER-USER, bootstrap.ts ko call karta hai
├── middleware.ts                 # auth guard
└── vercel.json                   # crons
```

- **Server Actions** for user-triggered mutations. **Route Handlers** sirf NL parse/commit/undo aur cron.
- **Server Components** for reads — DB se seedha.
- `lib/db.ts` mein Mongo client `globalThis` pe cache — warna dev hot-reload aur warm invocations mein pool exhaust.

### 8.1 Multi-user — scoping is the whole ballgame

App multi-user hai. Har collection mein `user_id` hai aur har index `(user_id, ...)` se shuru hota hai. Lekin schema sahi hona kaafi nahi — **ek bhi unscoped query = doosre user ka bank balance leak.** Is liye rules:

1. **`user_id` client se kabhi accept na karo.** Hamesha request ke JWT se derive karo. Multi-tenant apps ka #1 bug yahi hai.
2. **Raw `db.collection(...)` route/action mein na likho.** `lib/scope.ts` ek wrapper deta hai:
   ```ts
   const q = forUser(session.userId)
   await q.transactions.find({ date: { $gte: from } })   // user_id auto-inject
   ```
   Ek jagah audit karni paray gi, 40 jagah nahi.
3. **`resolveOrCreate` ka har lookup scoped ho.** Warna user A ka "InDrive" user B ki category id pe resolve ho jayega — silent, severe leak.
4. **Undo token bhi scoped:** `receipts.findOne({ undo_token, user_id })` — sirf token se lookup karo to token guess karke cross-tenant undo ho sakta hai.
5. **Daily creation caps aur rate limits per-user** (§4.5).
6. **Gemini quota per-user nahi hai** — §8.3, ye multi-user ki asli nayi constraint hai.

**Auth:** `jose` signed JWT (userId + email), httpOnly + secure + sameSite cookie. `bcryptjs` for password. Ek domain = cross-site cookie ka jhagra nahi. NextAuth ki zaroorat nahi (~50 lines).

### 8.2 Seed tree har user ko **copy** hoti hai (shared nahi)

`categories.user_id` **kabhi null nahi** — 60-leaf seed tree har naye user ko copy hoti hai (~60 rows), shared `user_id: null` rows nahi.

**Kyun copy, shared nahi:** poora plan rename / move / merge / delete / hygiene pe khara hai (§4.5, §9 Settings). Shared immutable rows pe ye sab special-case chahiye — ek "hidden category IDs" list user pe, ya shadow override table. Copy karne se `resolveOrCreate` ka **ek hi code path** rehta hai. 60 rows × N users M0 (512MB) pe kuch bhi nahi.

`from_seed: true` flag rehta hai — "reset to defaults" ke liye, aur hygiene job seeded categories pe aggressive merge suggest na kare.

**`lib/bootstrap.ts`** — naye user ka poora starting state, ek function:
```
bootstrapUser({ email, password, name })
  1. user doc (bcrypt hash, timezone Asia/Karachi, currency PKR)
  2. 60-leaf category tree copy → root_id set, depth 2
  3. seed aliases copy → is user ki category IDs pe map
  4. default "Cash" account, balance 0 → default_account_id set
  5. return userId
```

`scripts/seed-user.ts` isi function ko call karta hai. **Signup UI baad mein aayega to wo bhi yahi function call karega** — Phase 1 mein signup na hone se koi kaam dobara nahi karna paray ga.

### 8.3 Gemini quota — single user, aaram se

**Decision: filhal sirf Anees use karega.** Schema multi-user hai (har collection mein `user_id`, saare indexes `(user_id, ...)`) — wo muft mila hai aur baad mein signup kholna `bootstrapUser()` call karne ka kaam hai.

**Update (2026-07-31), verified live:** `gemini-2.5-flash` free tier ka actual quota **20 requests/day** nikla — assumed 250 se bohot kam. Matlab is doc ka "quota koi masla nahi" wala andaza ab sahi nahi. Layer 1 ke 80% hit rate pe bhi ~50 calls/din ki zaroorat 20 RPD se bohot upar hai. **Practical asar:** Layer 1 dictionary hits (zero-cost) ab pehle se kahin zyada zaroori hain — jab bhi koi naya alias/correction milay wo turant save karo taake wahi phrase dobara Gemini na maangay. Audio path (`parseIntentFromAudio`) bhi isi 20/din pool se khaata hai, alag nahi. Din khatam hone pe 429 aata hai, app Layer 1 + manual form pe degrade ho jati hai (neeche dekho) — ye already handle hai.

Is liye ye **nahi** bana rahe (over-engineering hota):
- ~~per-user daily LLM budget~~
- ~~app-level circuit breaker~~
- ~~abuse rate limiting~~

**Jo bana rahe hain — ek sasta safety net:**
- `users.llm_calls_today` counter + daily reset (cron mein already hai). Sirf visibility ke liye, Settings mein dikhega.
- Quota exhaust ho jaye (429) to graceful degrade: Layer 1 + manual form, saaf message — *"AI parsing aaj ki limit tak pohanch gayi. Manual entry use karo ya kal try karo."* Ye counter ke baghair bhi kaam karta hai, kyunki 429 handle karna hi padta hai.

**Jab signup kholo (2+ users):** tab per-user cap (~40 calls/din) aur circuit breaker add karo. Counter already maujood hoga to wo ~20 lines ka kaam hoga.

**Env:** `MONGODB_URI` · `GEMINI_API_KEY` · `JWT_SECRET` · `CRON_SECRET`
Atlas M0 IP allowlist `0.0.0.0/0` (Vercel IPs static nahi).

**Free tier limits:**
- Vercel Hobby: non-commercial, 100GB bandwidth, **1 cron job, din mein ek dafa** — recurring + hygiene ek hi `cron/daily` mein
- Atlas M0: 512MB — saalon tak kaafi
- Gemini: **verified 20 RPD** for `gemini-2.5-flash` free tier (2026-07-31) — bohot kam originally assumed 250-1500 se. Google bina notice cut karta hai, is liye [aistudio.google.com](https://aistudio.google.com) pe apna current quota dobara verify karo agar ye stale lage.

---

## 9. Frontend — mobile-first

> **Visual system — palette, typography, motion, consistency rules → [DESIGN.md](DESIGN.md)**
> Direction: **"Khata"** — bahi khata ledger, dashboard nahi. Ink-teal ground (`#0E1A1C`) +
> marigold accent (`#E8A33D`), **monochrome rows** (color sirf balance/budget/loan pe),
> Bricolage Grotesque + Archivo + Spline Sans Mono + Noto Nastaliq Urdu.
> **Signature:** speech bubble → ledger line morph (~450ms) — poori app ka sab se bara motion.

**Screens**
- **Home** — balance (tabular, lakh grouping), account strip (h-scroll), 1px budget bar, ruled ledger with `aaj`/`kal` dividers. Row pe category path chhote label mein: `Transport › InDrive`
- **Add** — bottom sheet. Text input **+ mic**. Bubble (voice ke liye live interim text) → morph → ledger line → chips → Save → **receipt**
- **History** — infinite scroll, date-grouped, sticky filter. Category filter **2-level**: root tap = poora roll-up, child tap = sirf wo
- **Insights** — reporting. Poori chart-level detail (form, color, tokens, validator output) → [DESIGN.md §11](DESIGN.md#11-reporting--charts). Summary: **rank magnitude = ek hue horizontal bar** (rainbow-per-category nahi — root categories 10+ hain, categorical palette ka ceiling 7-8 hai, aur "sab se zyada kahan laga" ranking hai, identity nahi), trend = same hue line/area, income-vs-expense = existing `in`/`out` diverging pair (naye rang nahi, jo pehle se DESIGN.md mein hain). Filter row ek hi jagah, sab charts pe asar. Har chart ka table-view twin. Default pe **roots only**; tap se indented children (same ruled column). Budget bar root pe roll-up, child pe sub-limit.
- **Loans** — given/taken tabs, per-person outstanding, partial repay sheet
- **Settings** — accounts, **categories (2-level tree: reorder, rename, move child, merge suggestions)**, tags, budgets, voice (lang + TTS)

**Rules**
- Bottom nav (thumb reach), center FAB = Add
- Bottom sheets, centered modals **nahi** (vaul)
- Touch targets ≥ 44px, `env(safe-area-inset-bottom)`, `viewport-fit=cover`
- Amount ke liye custom numeric keypad
- Optimistic UI + Undo, skeleton loaders, horizontal scroll kabhi nahi
- **Layer 1 hit = preview skip**, seedha commit + receipt + Undo
- Creation chips: `[+ Transport › InDrive]` `[Use Rickshaw]` — ek dafa, phir kabhi nahi
- Category picker: root list → tap se children expand. Tree widget **nahi** (depth 2 hai, list kaafi hai)
- Mic button: idle → listening (pulse) → processing. Reduced-motion pe pulse ki jagah static ring

---

## 10. Phases

| Phase | Kya | Status |
|---|---|---|
| 0 | Repo, Next.js scaffold, Atlas connect, deploy skeleton | ☐ |
| 0b | **Design tokens** — `@theme`, fonts, `lib/motion.ts`, `formatPKR()`, `<Amount>` `<LedgerRow>` `<DateRule>` | ☐ |
| 1 | **Login only** (no register UI) + `lib/scope.ts` + `lib/bootstrap.ts` + `scripts/seed-user.ts`, accounts CRUD, **2-level category seed tree** + `lib/taxonomy.ts`, manual txn CRUD, ledger + recompute | ☐ |
| 2a | **Layer 1** — amount/date/intent parsers + alias dictionary (child-pointing) + confidence | ☐ |
| 2b | `scripts/seed-examples.ts` → ~2–3k examples (per leaf) + aliases seed | ☐ |
| 2c | **Layer 2** — indented tree in prompt, `$text` retrieval, Gemini `responseSchema`, Zod | ☐ |
| 2d | **Layer 3 + input** — Add sheet, **text + voice**, bubble→ledger morph, chips | ☐ |
| 2e | **Action Receipts** — `Effect[]`, render, undo, optional TTS | ☐ |
| 2f | Correction loop → aliases + examples auto-grow | ☐ |
| 2g | **`resolveOrCreate()`** — parent-scoped fuzzy, subcategory + root creation chips, tags, `declare_account` + adjustment, depth guard, hygiene | ☐ |
| 3 | People, loans (+ `loan_action`), repayments, transfers | ☐ |
| 4 | Budgets (**root roll-up + child sub-limit**), **Insights charts** (rank bar + trend, ek hue; income/expense diverging — DESIGN.md §11; hover + table-view twin), recurring cron, NL queries, CSV export | ☐ |
| 5 | Gemini audio fallback, PWA, offline queue | ☐ |

Phase 2 poori app ki value hai. **2a pehle karo** — wo akela ~80% inputs handle kar lega, LLM ke baghair.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| **Cross-tenant leak** (user A ko B ka data dikhe) | `lib/scope.ts` — raw `db.collection()` route mein banned; `user_id` client se kabhi na lo; `resolveOrCreate` + undo token bhi scoped (§8.1) |
| Gemini 429 / quota exhaust | Layer 1 (80% zero-call) → 250 entries/din pe sirf ~50 calls. 429 pe graceful degrade: Layer 1 + manual form + saaf message (§8.3) |
| Gemini free quota khatam / Google cut kar de | Layer 1 pehle (80% calls bachao), rate-limit guard + manual-form fallback, quota counter |
| Roman Urdu parse fail | Seed 2–3k examples, `$text` retrieval, correction loop, 50-case eval set har prompt change pe |
| **Category rot** (Food/Foods/Khana) | Parent-scoped fuzzy + `(user_id, parent_id, name_normalized)` unique + monthly merge suggestions |
| **Subcategory sprawl** (60 leaves → 200) | Max 8 children/din, LLM ko "sab se specific existing pick karo" instruct, hygiene job `usage_count ≤ 2` pe merge suggest kare |
| **Wrong parent** (InDrive under Food) | Creation chip par parent visible: `[+ Transport › InDrive]` — galat ho to wahin badlo. Settings mein move + `root_category_id` backfill |
| **Depth creep** (child ke andar child) | Write-time guard: `parent_id` sirf root pe point kar sakta hai. Schema level pe reject. |
| **Balance/ledger divergence** | Declared balance overwrite nahi — `adjustment` txn; `recompute` + nightly reconcile |
| **Runaway creation** (injection / typo storm) | Daily caps, name validation, `query_data` se block, LLM DB mein direct nahi likhta |
| **Silent action** | Har commit ka `ActionReceipt`, `nothing_changed` bhi explicit |
| Loan ambiguity | Kabhi guess nahi — 3-way chips, `loan_action` sirf hint |
| Web Speech Urdu accuracy | `ur-PK` / `en-IN` toggle, live interim text, Gemini audio fallback Phase 5 |
| Free tier privacy | Balances kabhi na bhejo. Layer 1-only mode toggle. TTS default OFF. |
| Vercel Hobby non-commercial | Personal use theek; monetize karo to paid plan |

---

## 12. Decisions — sab lock (2026-07-30)

Koi open decision nahi bacha. Jo bhi ambiguous tha, simplest/safest option pe lock kiya — jahan bhi shak ho, MVP kam-feature wale side pe giraya, kyunki wo dobara kholna hamesha barhana se aasan hai.

| # | Sawal | Faisla | Asar |
|---|---|---|---|
| A | Kitne users? | **Sirf Anees.** Schema multi-user rahega, signup UI nahi | §8.3 se per-user budget + circuit breaker nikal diye |
| B | Purana data import? | **Nahi, zero se** | Phase 1 mein importer nahi |
| C | Credit card? | **Nahi** | Sirf bank / cash / wallet |
| D | Category depth? | **2 levels** | `root_category_id` roll-up |
| E | Default account | **Haan, expense ke liye.** Loan/income/transfer ke liye **kabhi nahi** | §3 SYSTEM_RULES mein already likha |
| F | Auth | **Email+password (bcrypt), login only.** Signup UI nahi — `seed-user.ts` se user banega | `bootstrap.ts` ready hoga to signup baad mein ~10 lines ka kaam, jab chahiye ho |
| G | Seed dataset size | **2–3k examples, ek dafa.** Eval set pe accuracy naapo, phir zaroorat pare to barhao | 100k pe jump nahi — §2.1 ki wajah |
| H | Urdu script aliases | **Deferred.** Pehle Gemini ko bhejo (natively parhta hai); voice ship hone ke baad top-50 terms ke Urdu aliases add karo | Text pipeline pe koi asar nahi, sirf Phase 5 ka scope |
| I | Income sources | **Alag collection nahi.** `categories` with `type:"income"` — Income root ke children | Same resolve/dedup/UI code path jo expense categories use karti hain |
| J | Creation confirm | **Hamesha ek dafa confirm — koi threshold-based auto nahi.** Subcategory, root, account teenon | Simplicity: ek hi rule, "N ke baad auto" jaisa special-case counter nahi chahiye. Confirm bhi ek-tap chip hai, modal nahi — friction chhota hai |
| K | Receipt persist | **Permanent.** 30-din purge nahi | Collection chhoti hai (§7); poora audit trail + undo history milta hai muft |
| L | Budget alerts | **In-app only.** PWA push Phase 5 mein | — |

Ab code shuru karne se pehle koi decision baqi nahi. Agla kaam: **Phase 0** (repo, Next.js scaffold, Atlas connect) + **Phase 0b** (design tokens, `lib/motion.ts`, `formatPKR()`, `<Amount>`/`<LedgerRow>`/`<DateRule>`).

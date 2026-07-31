# Khata

Roman Urdu mein bolo ya likho — app khud sahi category, subcategory, aur account mein entry kar deta hai. Full design/architecture spec: [`plan.md`](plan.md) aur [`DESIGN.md`](DESIGN.md).

## Setup

### 1. Dependencies

```bash
npm install
```

### 2. Environment

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Kahan se milega |
|---|---|
| `MONGODB_URI` | [MongoDB Atlas](https://cloud.mongodb.com) → free M0 cluster banao → Database → Connect → Drivers → connection string copy karo. Apna username/password/cluster daalo, `/expense-tracker` database name rakho. |
| `GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) — free tier, koi card nahi chahiye. **Verified quota: 20 requests/din** (2026-07-31) — assume kiya gaya 250-1500 se bohot kam nikla. |
| `GROQ_API_KEY` | [console.groq.com/keys](https://console.groq.com/keys) — free, koi card nahi chahiye. Gemini ka quota khatam hone pe text parsing (voice nahi) isi pe fallback hoti hai — ~1,000 requests/din. |
| `JWT_SECRET` | `openssl rand -base64 32` chalao, output paste karo |
| `CRON_SECRET` | koi bhi random string — Vercel Cron deploy karte waqt yehi value env var mein set karo |
| `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` / `SEED_USER_NAME` | tumhara login — pehla (abhi ke liye sirf) user isi se banega |

Atlas IP allowlist mein `0.0.0.0/0` add karo (Vercel ka IP static nahi hai).

### 3. User banao

```bash
npm run seed:user
```

Ye ek dafa chalta hai: user account (bcrypt password), 52-leaf category tree (Food/Transport/Bills/Home/Property/...), default "Cash" account, aur starter aliases (`palao`, `indrive`, `careem`, wagera) — sab is user ke liye.

`Home` wo jagah hai jahan tum **rehte** ho; `Property` ek alag property hai (doosre shehar ka flat, family ka flat, office) — dono ka hisaab jaan boojh kar alag rakha hai, warna dono numbers bekaar ho jate hain.

### 4. Example corpus seed karo (Layer 2 ke liye)

```bash
npm run seed:examples
```

~461 hand-written Roman Urdu phrasings, sab 52 leaf categories cover karte hain (har ek ~9-13 phrasings ke saath, real variety — verb/amount-format alag, na ke sirf number badla hua) + loans/declare_account/transfer. Layer 2 (Gemini) retrieval ke liye ye kaafi bara base hai. **Phir bhi poora `plan.md`§2.3 ka 2-3k corpus nahi hai** — real usage se `EXAMPLES` / `LOAN_TRANSFER_ACCOUNT_EXAMPLES` (`scripts/seed-examples.ts`) barhate rehna.

Ye script **replace** karta hai, append nahi — `user_id:null` + `source:"seed"` rows delete kar ke dobara likhta hai, taake ek example theek karne ke baad purana galat mapping DB mein na reh jaye. Tumhari corrections (`source:"correction"`/`"verified"`) chhoot jati hain.

### 4b. Taxonomy sync (agar `lib/taxonomy.ts` badla ho)

```bash
npm run sync:taxonomy            # dry run — sirf batata hai kya badlega
npm run sync:taxonomy -- --apply # likhta hai
```

`SEED_TREE` har user mein **copy** hoti hai (`plan.md`§8.2), to `lib/taxonomy.ts` edit karne se sirf naye users pe asar hota hai. Ye script farq maujooda users mein backfill karta hai — idempotent, dobara chalane se kuch add nahi hota.

### 5. Chalao

```bash
npm run dev
```

`http://localhost:3000/login` pe `SEED_USER_EMAIL`/`SEED_USER_PASSWORD` se login karo.

## Kya kaam kar raha hai (E2E)

- **Auth** — login-only (JWT + bcrypt), signup UI nahi hai abhi (plan.md §12.F)
- **Layer 1** — deterministic parser: amount (`350`, `3.5k`, `dhai hazaar`, `saarhay teen sau`, Urdu digits), date (`aj`/`kal`/`parso`), intent keywords, alias dictionary. Confidence ≥ 0.85 → seedha commit, koi Gemini call nahi.
- **Layer 2** — Gemini (`gemini-2.5-flash` by default, `GEMINI_MODEL` env se override) + `$text` retrieval (top-15 similar examples) + structured JSON output. Gemini ka **20 RPD** quota khatam ho to text parsing khud-ba-khud **Groq** (`openai/gpt-oss-20b`, ~1,000 RPD) pe fallback ho jati hai — same Zod schema, `lib/llm.ts`'s `stripNulls()` Groq ke strict-mode nulls ko Gemini jaisi shape mein convert karta hai. Voice ka koi fallback nahi (Groq audio samajhta nahi) — dono quota khatam ho to `LLMQuotaError` (manual entry / Layer 1 pe degrade).
- **`resolveOrCreate()` gate** — categories/subcategories/tags/people/accounts kabhi silently invent nahi hote; ek dafa confirm chip, phir hamesha auto-use.
- **Declare account** — `"Meezan mein 78000 pari hai"` → naya account banega, ya existing ka balance `adjustment` transaction se reconcile hoga (overwrite nahi).
- **Loans** — `lend_money`/`borrow_money`, open loan ho to naya/append/repayment ka 3-way chip.
- **Transfer** — dono accounts ka naam text mein ho to Layer 1 hi handle kar leta hai.
- **Action Receipts** — har commit ka itemized receipt + Undo (5 min tak).
- **Edit / delete** — ledger ki koi bhi row tap karo → `/txn/[id]`. Amount, item, category, account, date, note edit ho sakte hain; balance ek hi Mongo transaction mein correct hota hai (`updateTransaction`). Delete soft hai — `reverseTransaction` balance aur loan dono reverse karta hai, row record mein rehti hai. Udhaar/transfer rows ka amount+account lock hain (loan ka `outstanding` bhi rework karna parta, aur aadha-applied loan edit refuse karne se bura hai).
- **Voice** — Web Speech API (`ur-PK`), text input jaisa hi pipeline.
- **Insights** — is mahine ka category ranking (ek hue, DESIGN.md §11), income vs expense.
- **Ledger transactions** — postTransaction/reverseTransaction Mongo session ke saath atomic (Atlas M0 replica set hai, transactions kaam karte hain).

## Kya deliberately deferred hai (honest scope)

Plan ka poora roadmap ek session mein nahi ban sakta tha. Jo nahi bana:

| Feature | Status |
|---|---|
| `record_repayment` as its own top-level intent | Loan repayment `lend_money`/`borrow_money` ke andar 3-way chip se hoti hai; standalone repayment intent commit route mein reject hota hai |
| `multi` (ek jumle mein kai entries) | Schema mein field hi nahi, commit route reject karta hai |
| `query_data` (NL se "kitna kharch howa" poochna) | Reject hota hai — ye read hai, ledger-write endpoint mein nahi hona chahiye |
| Add as a bottom sheet (`vaul`) | Abhi `/add` **full page** hai, DESIGN.md ke bottom-sheet-from-anywhere spec ke mutabiq nahi. `vaul` package.json mein hai (istemal nahi hua) — is ko sheet banane ke liye `(app)` layout mein global `<Drawer>` mount karna paray ga, FAB link ki jagah client state se trigger |
| Budgets | Schema hai (`budgets` collection), UI/logic nahi bana |
| Recurring transactions | `recurring` collection schema hai, cron mein processing nahi |
| Category hygiene / merge suggestions | Nahi bana |
| History filters (category/account/person/tag) | History page sirf last 200, unfiltered |
| Loan/transfer ka amount+account edit | Lock hai — delete kar ke dobara likho (`lib/ledger.ts` mein wajah likhi hai) |
| Manual entry form (NL fail ho to fallback) | Nahi bana — abhi sirf NL input |
| Gemini audio fallback, PWA, offline queue | Phase 5, nahi bana |
| Vector search upgrade (embeddings) | Jaan boojh kar deferred — plan.md §2.2a |
| Bubble→ledger morph animation | CSS transitions se (lib/motion.ts durations/easings), `motion`/`framer-motion` library nahi add ki |

Ye sab `plan.md` ke Phase 3/4/5 mein already listed hain — koi surprise gap nahi, bas is session ka scope yahan tak tha.

## Known limitation

`npm audit` mein ek moderate `uuid` advisory hai, 3 levels deep (`@google/genai` → `gaxios` → `uuid`) — apne control ke bahar hai abhi, `@google/genai` ke update ka intezar. Next.js 14.2.35 (latest patch) pe hai; kuch advisories sirf `next@16` (major bump) pe fix hoti hain — ye deliberately nahi kiya, kyunki plan.md ne "Next.js 14" lock kiya tha aur major upgrade alag decision honi chahiye.

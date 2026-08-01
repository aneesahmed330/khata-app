// Mirrors plan.md §7 Data Model. Every per-user collection carries user_id —
// see lib/scope.ts for why raw db.collection() is banned outside it.
import type { ObjectId } from "mongodb";

export type AccountType = "bank" | "cash" | "wallet";
export type CategoryType = "expense" | "income";
export type TxnType =
  | "expense"
  | "income"
  | "transfer"
  | "loan_given"
  | "loan_taken"
  | "repayment_in"
  | "repayment_out"
  | "adjustment"
  | "investment_buy"
  | "investment_sell"
  | "dividend";
// "llm_audio" is tracked separately from "llm" so the accuracy of the speech
// path can be measured against the text path later — they fail differently.
export type TxnSource = "dict" | "llm" | "llm_audio" | "manual" | "recurring" | "adjustment";
export type InputMode = "text" | "voice";
export type LoanDirection = "given" | "taken";
export type LoanStatus = "open" | "settled";
export type InvestmentType = "stock" | "mutual_fund" | "gold" | "crypto" | "real_estate" | "other";
export type HoldingStatus = "open" | "closed";

export interface UserDoc {
  _id: ObjectId;
  email: string;
  password_hash: string;
  name: string;
  currency: "PKR";
  timezone: string;
  default_account_id: ObjectId | null;
  tts_enabled: boolean;
  // Global net-worth switches — absent means "on" (existing users shouldn't
  // silently lose loans/investments from a total they've never touched this
  // setting for). Off zeroes the WHOLE category regardless of any per-item
  // exclude_from_total, which only ever narrows further, never overrides this.
  count_loans_in_net_worth?: boolean;
  count_investments_in_net_worth?: boolean;
  // No speech_lang: voice is recorded as audio and sent to Gemini, which
  // handles Roman Urdu / Urdu / English without being told which to expect.
  // Browser ASR (which needed a BCP-47 tag) is no longer used at all.
  llm_calls_today: number;
  llm_calls_reset_at: Date;
  created_at: Date;
}

export interface AccountDoc {
  _id: ObjectId;
  user_id: ObjectId;
  name: string;
  name_normalized: string;
  type: AccountType;
  balance: number;
  archived: boolean;
  // These two are deliberately separate flags, not one "private" setting.
  // Hiding is about the screen; excluding is about the arithmetic. A joint
  // account you'd rather not display over someone's shoulder still spends
  // real money, and a wallet you hold for someone else is perfectly fine to
  // look at while being none of your net worth. Collapsing them would force
  // one to imply the other.
  /** Mask this account's balance even when the global privacy toggle is off. */
  hide_balance?: boolean;
  /** Keep the balance out of net worth and the "in accounts" total. The
   *  account still records transactions normally. */
  exclude_from_total?: boolean;
  auto_created: boolean;
  created_from_text?: string;
  created_at: Date;
}

export interface CategoryDoc {
  _id: ObjectId;
  user_id: ObjectId;
  name: string;
  name_normalized: string;
  type: CategoryType;
  parent_id: ObjectId | null; // null = root. Depth 2 max — enforced in resolve.ts
  root_id: ObjectId; // = parent_id ?? _id, denormalized for roll-up
  icon?: string;
  color?: string;
  from_seed: boolean;
  auto_created: boolean;
  created_from_text?: string;
  created_at: Date; // needed to enforce the daily creation cap — resolve.ts §4.5
  usage_count: number;
}

export interface TagDoc {
  _id: ObjectId;
  user_id: ObjectId;
  name: string;
  name_normalized: string;
  color?: string;
  auto_created: boolean;
  created_from_text?: string;
  usage_count: number;
}

export interface PersonDoc {
  _id: ObjectId;
  user_id: ObjectId;
  name: string;
  name_normalized: string;
  phone?: string;
  auto_created: boolean;
  created_from_text?: string;
}

export interface TransactionDoc {
  _id: ObjectId;
  user_id: ObjectId;
  type: TxnType;
  amount: number;
  item?: string;
  note?: string;
  category_id?: ObjectId;
  root_category_id?: ObjectId;
  // Optional ONLY for investment_buy/investment_sell/dividend — every other
  // type always has a funding account. Unset means "money moved, source
  // account not recorded" (the user genuinely doesn't remember) — it never
  // touches any account's balance, by design (lib/ledger.ts).
  account_id?: ObjectId;
  to_account_id?: ObjectId;
  person_id?: ObjectId;
  loan_id?: ObjectId;
  holding_id?: ObjectId;
  // Shares/grams/units moved by an investment_buy or investment_sell — always
  // positive, same convention as `amount`; direction comes from `type`.
  quantity_delta?: number;
  tag_ids: ObjectId[];
  date: Date;
  raw_text?: string;
  input_mode?: InputMode;
  source: TxnSource;
  confidence?: number;
  receipt_id?: ObjectId;
  deleted_at?: Date | null;
  created_at: Date;
}

export interface LoanDoc {
  _id: ObjectId;
  user_id: ObjectId;
  person_id: ObjectId;
  direction: LoanDirection;
  principal: number;
  outstanding: number;
  /** Optional: a loan recorded long after the fact often has no account the
   *  user can still name. Absent means "money moved, source not recorded" —
   *  no balance was touched, which is correct for a historical entry whose
   *  cash left the account before the app ever saw it. */
  account_id?: ObjectId;
  status: LoanStatus;
  // Same idea as AccountDoc/HoldingDoc's flag of the same name: this loan's
  // outstanding stops counting toward net worth. Layered under the global
  // count_loans_in_net_worth switch — that one turns the whole category off;
  // this one carves a single loan out while the category stays on.
  exclude_from_total?: boolean;
  due_date?: Date;
  /** Set when a loan was closed without the remainder being repaid — forgiven,
   *  rounded off, or settled outside the ledger. Kept so a settled loan can
   *  still explain why its outstanding reached zero with no final payment. */
  written_off?: number;
  settled_at?: Date;
  created_at: Date;
}

export interface HoldingDoc {
  _id: ObjectId;
  user_id: ObjectId;
  name: string;
  symbol?: string;
  type: InvestmentType;
  quantity: number;
  // Free text since it varies by type ("shares", "grams", "tola", "units") —
  // never assumed, always what the user typed when creating the holding.
  quantity_unit?: string;
  invested_total: number;
  dividends_received: number;
  // No live price feed in this app — purely a manual snapshot the user
  // updates themselves (a separate PSX data project owns real price fetching).
  current_value?: number;
  current_value_updated_at?: Date;
  // Same pair of flags as AccountDoc, and separate for the same reason: one is
  // about the screen, the other about the arithmetic. A holding you manage on
  // someone else's behalf is fine to look at but isn't your net worth.
  /** Mask this holding's figures even when the global privacy toggle is off. */
  hide_value?: boolean;
  /** Keep this holding out of net worth and the portfolio totals. It still
   *  records buys, sells and dividends normally. */
  exclude_from_total?: boolean;
  status: HoldingStatus;
  created_at: Date;
}

export interface ReceiptDoc {
  _id: ObjectId;
  user_id: ObjectId;
  summary: string;
  effects: unknown[]; // Effect[] — see lib/receipt.ts
  transaction_ids: ObjectId[]; // what undo actually reverses
  undo_token: string;
  undone_at?: Date | null;
  created_at: Date;
}

export interface BudgetDoc {
  _id: ObjectId;
  user_id: ObjectId;
  category_id: ObjectId;
  amount: number;
  period: "monthly";
  start: Date;
}

export interface AliasDoc {
  _id: ObjectId;
  user_id: ObjectId;
  term: string;
  term_normalized: string;
  maps_to: { kind: "category" | "account" | "person" | "tag"; id: ObjectId };
  script: "latin" | "urdu";
  weight: number;
  hit_count: number;
  source: "seed" | "correction";
}

export interface ExampleDoc {
  _id: ObjectId;
  user_id: ObjectId | null; // null = global corpus
  raw_text: string;
  expected: {
    intent: string;
    amount?: number;
    item?: string;
    category_path?: string;
    person?: string;
    account?: string;
    tags?: string[];
  };
  source: "seed" | "correction" | "verified";
  hit_count: number;
  created_at: Date;
}

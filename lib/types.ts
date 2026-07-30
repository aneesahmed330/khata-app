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
  | "adjustment";
// "llm_audio" is tracked separately from "llm" so the accuracy of the speech
// path can be measured against the text path later — they fail differently.
export type TxnSource = "dict" | "llm" | "llm_audio" | "manual" | "recurring" | "adjustment";
export type InputMode = "text" | "voice";
export type LoanDirection = "given" | "taken";
export type LoanStatus = "open" | "settled";

export interface UserDoc {
  _id: ObjectId;
  email: string;
  password_hash: string;
  name: string;
  currency: "PKR";
  timezone: string;
  default_account_id: ObjectId | null;
  tts_enabled: boolean;
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
  account_id: ObjectId;
  to_account_id?: ObjectId;
  person_id?: ObjectId;
  loan_id?: ObjectId;
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
  account_id: ObjectId;
  status: LoanStatus;
  due_date?: Date;
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

// The multi-user safety boundary — plan.md §8.1.
//
// Rule: raw `db.collection(...)` is banned everywhere except this file.
// Every query goes through forUser(userId), which injects/enforces user_id
// so one unscoped query can never leak another user's data. user_id is
// NEVER accepted from the client — it is always the JWT-derived id passed
// in here.

import type {
  Collection,
  Document,
  Filter,
  FindOptions,
  OptionalUnlessRequiredId,
  UpdateFilter,
  AggregateOptions,
} from "mongodb";
import { ObjectId } from "mongodb";
import { getDb } from "./db";
import type {
  AccountDoc,
  CategoryDoc,
  TagDoc,
  PersonDoc,
  TransactionDoc,
  LoanDoc,
  ReceiptDoc,
  BudgetDoc,
  AliasDoc,
} from "./types";

const PER_USER_COLLECTIONS = [
  "accounts",
  "categories",
  "tags",
  "people",
  "transactions",
  "loans",
  "receipts",
  "budgets",
  "aliases",
] as const;

class ScopedCollection<T extends Document & { user_id: ObjectId }> {
  constructor(
    private col: Collection<T>,
    private userId: ObjectId,
  ) {}

  private scoped(filter: Filter<T> = {}): Filter<T> {
    return { ...filter, user_id: this.userId } as Filter<T>;
  }

  find(filter: Filter<T> = {}, options?: FindOptions) {
    return this.col.find(this.scoped(filter), options);
  }

  findOne(filter: Filter<T> = {}, options?: FindOptions) {
    return this.col.findOne(this.scoped(filter), options);
  }

  countDocuments(filter: Filter<T> = {}) {
    return this.col.countDocuments(this.scoped(filter));
  }

  insertOne(doc: Omit<T, "user_id">) {
    const withUser = { ...doc, user_id: this.userId } as OptionalUnlessRequiredId<T>;
    return this.col.insertOne(withUser);
  }

  updateOne(filter: Filter<T>, update: UpdateFilter<T>) {
    return this.col.updateOne(this.scoped(filter), update);
  }

  updateMany(filter: Filter<T>, update: UpdateFilter<T>) {
    return this.col.updateMany(this.scoped(filter), update);
  }

  deleteOne(filter: Filter<T>) {
    return this.col.deleteOne(this.scoped(filter));
  }

  /** Prepends a $match on user_id so the pipeline can never see other users' docs. */
  aggregate<R extends Document = Document>(pipeline: Document[], options?: AggregateOptions) {
    return this.col.aggregate<R>(
      [{ $match: { user_id: this.userId } }, ...pipeline],
      options,
    );
  }

  /** Escape hatch for the rare case a raw filter is genuinely needed — still scoped. */
  raw() {
    return this.col;
  }
}

export interface UserScope {
  userId: ObjectId;
  accounts: ScopedCollection<AccountDoc>;
  categories: ScopedCollection<CategoryDoc>;
  tags: ScopedCollection<TagDoc>;
  people: ScopedCollection<PersonDoc>;
  transactions: ScopedCollection<TransactionDoc>;
  loans: ScopedCollection<LoanDoc>;
  receipts: ScopedCollection<ReceiptDoc>;
  budgets: ScopedCollection<BudgetDoc>;
  aliases: ScopedCollection<AliasDoc>;
}

export async function forUser(userId: ObjectId | string): Promise<UserScope> {
  const uid = typeof userId === "string" ? new ObjectId(userId) : userId;
  const db = await getDb();
  return {
    userId: uid,
    accounts: new ScopedCollection<AccountDoc>(db.collection("accounts"), uid),
    categories: new ScopedCollection<CategoryDoc>(db.collection("categories"), uid),
    tags: new ScopedCollection<TagDoc>(db.collection("tags"), uid),
    people: new ScopedCollection<PersonDoc>(db.collection("people"), uid),
    transactions: new ScopedCollection<TransactionDoc>(db.collection("transactions"), uid),
    loans: new ScopedCollection<LoanDoc>(db.collection("loans"), uid),
    receipts: new ScopedCollection<ReceiptDoc>(db.collection("receipts"), uid),
    budgets: new ScopedCollection<BudgetDoc>(db.collection("budgets"), uid),
    aliases: new ScopedCollection<AliasDoc>(db.collection("aliases"), uid),
  };
}

export { PER_USER_COLLECTIONS };

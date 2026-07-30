// Depth-2 category tree — plan.md §4.7. Root -> child, never deeper.
// Enforced at write time in resolve.ts, not just by convention.
import type { ObjectId } from "mongodb";
import type { CategoryDoc } from "./types";

export interface SeedRoot {
  name: string;
  type: "expense" | "income";
  children: string[];
}

// Pakistani-context seed tree, ~60 leaves. Copied into every user at
// bootstrap (plan.md §8.2) — never shared, so rename/move/merge stays a
// single code path.
export const SEED_TREE: SeedRoot[] = [
  {
    name: "Food",
    type: "expense",
    children: ["Dhaba/Hotel", "Groceries", "Delivery", "Chai/Nashta", "Sweets"],
  },
  {
    name: "Transport",
    type: "expense",
    children: ["InDrive", "Careem", "Rickshaw", "Fuel", "Public", "Maintenance", "Parking"],
  },
  {
    name: "Bills",
    type: "expense",
    children: ["Electricity", "Sui Gas", "Internet", "Mobile Load", "Water"],
  },
  {
    name: "Home",
    type: "expense",
    children: ["Rent", "Maintenance", "Kitchen Items", "Maid/Help"],
  },
  // A property that is NOT where you live — a flat rented in another city, one
  // kept for family, one used as an office. Kept out of "Home" deliberately:
  // rolling it up with household spending makes both numbers meaningless.
  // The leaf is "Flat Rent", not "Rent", so it can never be confused with
  // "Home › Rent" — the unique index is (user_id, parent_id, name_normalized),
  // so two "Rent" leaves would be legal but ambiguous to the parser.
  {
    name: "Property",
    type: "expense",
    children: ["Flat Rent", "Bills", "Maintenance", "Tax"],
  },
  {
    name: "Health",
    type: "expense",
    children: ["Doctor", "Medicine", "Tests", "Gym"],
  },
  {
    name: "Shopping",
    type: "expense",
    children: ["Clothes", "Electronics", "Online", "Shoes"],
  },
  {
    name: "Family",
    type: "expense",
    children: ["Kids", "Parents", "Gifts", "Shaadi/Events"],
  },
  {
    name: "Education",
    type: "expense",
    children: ["Fees", "Books", "Courses"],
  },
  {
    name: "Charity",
    type: "expense",
    children: ["Sadqa", "Zakat"],
  },
  {
    name: "Personal",
    type: "expense",
    children: ["Salon", "Subscriptions", "Entertainment", "Travel"],
  },
  {
    name: "Income",
    type: "income",
    children: ["Salary", "Freelance", "Dividend", "Rental", "Gift", "Bonus"],
  },
];

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** parent_id ?? _id — every category's root, computed once at write time. */
export function deriveRootId(category: Pick<CategoryDoc, "_id" | "parent_id">): ObjectId {
  return category.parent_id ?? category._id;
}

export function isRoot(category: Pick<CategoryDoc, "parent_id">): boolean {
  return category.parent_id === null;
}

/** "Transport" or "Transport › InDrive" — the string form sent to the LLM
 *  and stored on examples (plan.md §2.2), so it never carries a per-user id. */
export function categoryPath(
  category: Pick<CategoryDoc, "name">,
  parent: Pick<CategoryDoc, "name"> | null,
): string {
  return parent ? `${parent.name} › ${category.name}` : category.name;
}

/** Depth-2 write guard — a new category's parent must itself be a root.
 *  Throws rather than silently flattening, so a bug surfaces immediately. */
export function assertValidParent(parent: Pick<CategoryDoc, "parent_id"> | null): void {
  if (parent && parent.parent_id !== null) {
    throw new Error("Depth-2 violation: cannot create a category under a non-root category.");
  }
}

/** Indented tree text for the Gemini prompt — cheaper in tokens than nested
 *  JSON, and the model reads hierarchy from indentation reliably (§3). */
export function renderCategoryTreeForPrompt(
  categories: Pick<CategoryDoc, "_id" | "name" | "parent_id">[],
): string {
  const roots = categories.filter((c) => c.parent_id === null);
  const lines: string[] = [];
  for (const root of roots) {
    lines.push(`${root.name} (id: ${root._id.toHexString()})`);
    const children = categories.filter((c) => c.parent_id?.equals(root._id));
    for (const child of children) {
      lines.push(`  › ${child.name} (id: ${child._id.toHexString()})`);
    }
  }
  return lines.join("\n");
}

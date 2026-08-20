"use client";

import { useEffect, useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import clsx from "clsx";

export interface TagOption {
  id: string;
  name: string;
}

// Web port of KhataMobile's src/components/TagPicker.tsx — multi-select
// chips plus a free-text "find or create" input, backed by the same
// GET/POST /api/tags route mobile already uses (cookie auth works there
// exactly like Bearer auth does, per lib/auth.ts's getSession).
export function TagPicker({
  selected,
  onChange,
  initialTags = [],
}: {
  selected: TagOption[];
  onChange: (tags: TagOption[]) => void;
  initialTags?: TagOption[];
}) {
  const [allTags, setAllTags] = useState<TagOption[]>(initialTags);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tags")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((data: { tags: TagOption[] }) => {
        setAllTags((prev) => {
          const byId = new Map(prev.map((t) => [t.id, t] as const));
          data.tags.forEach((t) => byId.set(t.id, t));
          return [...byId.values()];
        });
      })
      .catch(() => {
        /* picker still works from initialTags/newly-created ones */
      });
  }, []);

  function toggle(tag: TagOption) {
    const isSelected = selected.some((t) => t.id === tag.id);
    onChange(isSelected ? selected.filter((t) => t.id !== tag.id) : [...selected, tag]);
  }

  async function addNew() {
    const name = input.trim();
    if (!name) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const tag = (await res.json()) as TagOption & { error?: string };
      if (!res.ok || tag.error) throw new Error(tag.error ?? "Couldn't add tag.");
      setAllTags((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]));
      if (!selected.some((t) => t.id === tag.id)) onChange([...selected, { id: tag.id, name: tag.name }]);
      setInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add tag.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {allTags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {allTags.map((tag) => {
            const isSelected = selected.some((t) => t.id === tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggle(tag)}
                className={clsx(
                  "rounded-full border px-3 py-1.5 text-[13px] transition-colors",
                  isSelected
                    ? "border-accent bg-accent text-on-accent"
                    : "border-rule bg-surface-lift text-fg-muted hover:text-fg",
                )}
              >
                #{tag.name}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void addNew();
            }
          }}
          placeholder="New tag…"
          maxLength={30}
          className="min-w-0 flex-1 rounded-chip border border-rule bg-surface-sunk px-3 py-2 text-[13px] text-fg outline-none placeholder:text-fg-faint focus:border-accent"
        />
        <button
          type="button"
          onClick={() => void addNew()}
          disabled={adding || !input.trim()}
          aria-label="Add tag"
          className="flex items-center justify-center rounded-chip bg-accent p-2 text-on-accent transition-opacity disabled:opacity-40"
        >
          {adding ? (
            <Loader2 size={16} strokeWidth={2} className="animate-spin" aria-hidden />
          ) : (
            <Plus size={16} strokeWidth={2} aria-hidden />
          )}
        </button>
      </div>
      {error ? <p className="t-label text-out">{error}</p> : null}
    </div>
  );
}

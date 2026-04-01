"use client";

import React, { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { NotesApiClient } from "@/lib/apiClient";
import {
  Note,
  NoteId,
  NotesState,
  createEmptyState,
  createNote,
  deleteNote,
  listNotes,
  loadState,
  matchesQuery,
  parseTags,
  saveState,
  tagsToString,
  upsertNote,
} from "@/lib/notesStore";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";

type SaveStatus = "saved" | "saving" | "error";

function formatUpdated(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString();
}

function clampOneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export default function NotesApp() {
  const api = useMemo(() => new NotesApiClient(), []);
  const [apiOk, setApiOk] = useState<boolean | null>(null);

  const [state, setState] = useState<NotesState>(createEmptyState);
  const [activeId, setActiveId] = useState<NoteId | null>(null);

  const [search, setSearch] = useState("");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");

  // Load local state on mount (client-only).
  useEffect(() => {
    const loaded = loadState();
    let s = loaded;

    // Ensure at least one note exists for first-run UX.
    if (Object.keys(s.notesById).length === 0) {
      const first = createNote({ title: "Welcome", content: "# Welcome\n\nStart writing…", tags: ["getting started"] });
      s = upsertNote(s, first);
      saveState(s);
    }

    setState(s);
    setActiveId((prev) => prev ?? s.noteOrder[0] ?? null);
  }, []);

  // Optional backend indicator.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await api.health();
      if (!cancelled) setApiOk(res.ok);
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const notes = useMemo(() => listNotes(state), [state]);
  const filteredNotes = useMemo(
    () => notes.filter((n) => matchesQuery(n, search)),
    [notes, search]
  );

  const activeNote: Note | null = useMemo(() => {
    if (!activeId) return null;
    return state.notesById[activeId] ?? null;
  }, [activeId, state.notesById]);

  const persistDebounced = useDebouncedCallback((next: NotesState) => {
    try {
      saveState(next);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }, 450);

  function updateState(next: NotesState) {
    setState(next);
    setSaveStatus("saving");
    persistDebounced(next);
  }

  function handleCreate() {
    const n = createNote();
    const next = upsertNote(state, n);
    updateState(next);
    setActiveId(n.id);
    setMobileSidebarOpen(false);
  }

  function handleDelete(noteId: NoteId) {
    const next = deleteNote(state, noteId);
    updateState(next);

    if (activeId === noteId) {
      const remaining = next.noteOrder[0] ?? null;
      setActiveId(remaining);
    }
  }

  function handleUpdateActive(patch: Partial<Pick<Note, "title" | "content" | "tags">>) {
    if (!activeNote) return;
    const updated: Note = {
      ...activeNote,
      ...patch,
      updatedAt: Date.now(),
    };
    updateState(upsertNote(state, updated));
  }

  const sidebar = (
    <aside className="w-full md:w-80 md:border-r border-slate-200 bg-white">
      <div className="p-4 border-b border-slate-200 flex items-center gap-2">
        <div className="flex-1">
          <div className="text-sm font-semibold text-slate-900">Notes</div>
          <div className="text-xs text-slate-500">
            {api.isEnabled() ? (
              apiOk === null ? "Backend: checking…" : apiOk ? "Backend: connected" : "Backend: unavailable"
            ) : (
              "Local-only mode"
            )}
          </div>
        </div>
        <button
          type="button"
          className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          onClick={handleCreate}
        >
          New
        </button>
      </div>

      <div className="p-4 border-b border-slate-200">
        <label className="text-xs font-medium text-slate-600" htmlFor="search">
          Search
        </label>
        <input
          id="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-2 w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Title, content, tags…"
        />
      </div>

      <nav className="p-2 overflow-auto max-h-[calc(100vh-9.5rem)] md:max-h-[calc(100vh-8.5rem)]">
        {filteredNotes.length === 0 ? (
          <div className="p-3 text-sm text-slate-500">No matching notes.</div>
        ) : (
          <ul className="space-y-1">
            {filteredNotes.map((n) => {
              const active = n.id === activeId;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    className={[
                      "w-full text-left p-3 rounded-lg border",
                      active
                        ? "border-blue-200 bg-blue-50"
                        : "border-transparent hover:bg-slate-50",
                    ].join(" ")}
                    onClick={() => {
                      setActiveId(n.id);
                      setMobileSidebarOpen(false);
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">
                          {n.title || "Untitled"}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          {clampOneLine(n.content).slice(0, 80) || "No content"}
                        </div>
                        {n.tags.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {n.tags.slice(0, 3).map((t) => (
                              <span
                                key={t}
                                className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200"
                              >
                                {t}
                              </span>
                            ))}
                            {n.tags.length > 3 ? (
                              <span className="text-[11px] text-slate-500">
                                +{n.tags.length - 3}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                      <span className="text-[10px] text-slate-400 whitespace-nowrap">
                        {new Date(n.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </button>

                  <div className="px-3 pb-2">
                    <button
                      type="button"
                      className="text-xs text-red-600 hover:text-red-700"
                      onClick={() => handleDelete(n.id)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </aside>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top bar (mobile) */}
      <header className="md:hidden sticky top-0 z-10 bg-white border-b border-slate-200">
        <div className="flex items-center justify-between p-3">
          <button
            type="button"
            className="px-3 py-2 rounded-md border border-slate-300 text-sm bg-white hover:bg-slate-50"
            onClick={() => setMobileSidebarOpen((v) => !v)}
            aria-expanded={mobileSidebarOpen}
            aria-controls="mobile-sidebar"
          >
            Notes
          </button>

          <div className="text-xs text-slate-500">
            {saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Save failed" : "Saved"}
          </div>
        </div>
      </header>

      <div className="md:flex">
        {/* Desktop sidebar */}
        <div className="hidden md:block md:sticky md:top-0 md:h-screen">{sidebar}</div>

        {/* Mobile sidebar drawer */}
        {mobileSidebarOpen ? (
          <div className="md:hidden fixed inset-0 z-20">
            <div
              className="absolute inset-0 bg-black/30"
              onClick={() => setMobileSidebarOpen(false)}
              aria-hidden="true"
            />
            <div
              id="mobile-sidebar"
              className="absolute left-0 top-0 bottom-0 w-[88vw] max-w-sm shadow-xl"
              role="dialog"
              aria-modal="true"
            >
              {sidebar}
            </div>
          </div>
        ) : null}

        {/* Main */}
        <main className="flex-1 p-4 md:p-6">
          {activeNote ? (
            <div className="max-w-6xl mx-auto">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <input
                    value={activeNote.title}
                    onChange={(e) => handleUpdateActive({ title: e.target.value })}
                    className="w-full text-2xl md:text-3xl font-semibold bg-transparent border-b border-slate-200 focus:outline-none focus:border-blue-400 pb-2"
                    placeholder="Title"
                    aria-label="Note title"
                  />
                  <div className="mt-2 text-xs text-slate-500">
                    Updated {formatUpdated(activeNote.updatedAt)}
                  </div>
                </div>

                <div className="hidden md:block text-xs text-slate-500 pt-2">
                  {saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Save failed" : "Saved"}
                </div>
              </div>

              <div className="mt-4">
                <label className="text-xs font-medium text-slate-600" htmlFor="tags">
                  Tags (comma-separated)
                </label>
                <input
                  id="tags"
                  value={tagsToString(activeNote.tags)}
                  onChange={(e) => handleUpdateActive({ tags: parseTags(e.target.value) })}
                  className="mt-2 w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="work, personal, ideas"
                />
              </div>

              <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 text-sm font-medium">
                    Editor (Markdown)
                  </div>
                  <textarea
                    value={activeNote.content}
                    onChange={(e) => handleUpdateActive({ content: e.target.value })}
                    className="w-full min-h-[50vh] p-4 text-sm leading-6 font-mono focus:outline-none"
                    placeholder="Write markdown here…"
                    aria-label="Markdown editor"
                  />
                </section>

                <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 text-sm font-medium">
                    Preview
                  </div>
                  <div className="p-4 prose prose-slate max-w-none prose-pre:bg-slate-950 prose-pre:text-slate-50">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {activeNote.content || "_Nothing to preview yet._"}
                    </ReactMarkdown>
                  </div>
                </section>
              </div>

              <div className="mt-6 text-xs text-slate-500">
                Tip: Your notes are saved locally in this browser. Set{" "}
                <code className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded">
                  NEXT_PUBLIC_API_BASE_URL
                </code>{" "}
                to enable optional backend connectivity (health check for now).
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-lg p-6">
              <h1 className="text-xl font-semibold">No note selected</h1>
              <p className="mt-2 text-sm text-slate-600">
                Create a new note from the sidebar to get started.
              </p>
              <button
                type="button"
                onClick={handleCreate}
                className="mt-4 px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                New note
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

import {
  createIcons,
  NotebookPen,
  Folder,
  Layers,
  BookOpen,
  Search,
  Plus,
  ArrowLeft,
  Ellipsis,
  RefreshCw,
  Settings2,
  Moon,
  FileCode,
  History,
  Paperclip,
  Trash2,
  X,
  Check,
  Pencil,
  Download,
  LogOut,
} from "lucide";
const icon = (name: string) =>
  `<i data-lucide="${name}" aria-hidden="true"></i>`;
export const phoneHTML = {
  header: `<header class="phone-header phone-only"><div class="phone-brand-row"><span class="phone-brand"><span class="phone-mark">q</span> quiccie</span><div class="phone-header-actions"><button id="phone-sync" class="phone-icon" aria-label="Sync notes">${icon("refresh-cw")}<span class="sync-dot"></span></button><button id="phone-settings" class="phone-icon" aria-label="Settings">${icon("settings-2")}</button></div></div><div class="phone-title-row"><div><p id="phone-subtitle">Your library</p><h1 id="phone-title">Notes</h1></div><button id="phone-new" class="phone-create" aria-label="New note">${icon("plus")}<span>New note</span></button></div><div id="phone-browse-views" role="group" aria-label="Browse view" hidden><button data-phone-tab="files">Folders</button><button data-phone-tab="projects">Projects</button></div><div id="phone-chips" role="group" aria-label="Filter notes"><button data-phone-filter="recent" aria-pressed="true">Recent</button><button data-phone-filter="all">All notes</button><button data-phone-filter="indexes" hidden>Imported indexes</button></div><button id="phone-folder-back" class="phone-folder-back" hidden>${icon("arrow-left")}<span>Back to folders</span></button></header>`,
  noteHeader: `<header class="phone-note-header phone-only"><button id="phone-back" class="phone-icon" aria-label="Back to library">${icon("arrow-left")}</button><div class="phone-note-name"><strong id="phone-note-title">Note</strong><span id="phone-note-location"></span></div><button id="phone-edit" class="phone-edit">Edit</button><button id="phone-more" class="phone-icon" aria-label="Note actions">${icon("ellipsis")}</button></header>`,
  nav: `<nav class="phone-nav phone-only" aria-label="Library"><button data-phone-tab="notes" aria-current="page">${icon("notebook-pen")}<span>Notes</span></button><button data-phone-tab="memory">${icon("book-open")}<span>Memory</span></button><button data-phone-tab="browse">${icon("folder")}<span>Browse</span></button><button data-phone-tab="search">${icon("search")}<span>Search</span></button></nav>`,
  dialogs: `<dialog id="phone-actions" class="phone-sheet" aria-labelledby="phone-actions-title"><div class="sheet-handle"></div><div class="sheet-title"><div><h2 id="phone-actions-title">Note actions</h2><p id="phone-actions-path"></p></div><button class="phone-icon" data-close-sheet aria-label="Close note actions">${icon("x")}</button></div><button data-phone-action="source">${icon("file-code")}<span>Edit Markdown</span></button><button data-phone-action="history">${icon("history")}<span>Note history</span></button><button data-phone-action="attach">${icon("paperclip")}<span>Add attachment</span></button><button data-phone-action="new-note">${icon("plus")}<span>New note</span></button><button class="danger" data-phone-action="delete">${icon("trash-2")}<span>Delete note</span></button></dialog><dialog id="phone-preferences" class="phone-sheet" aria-labelledby="phone-preferences-title"><div class="sheet-handle"></div><div class="sheet-title"><h2 id="phone-preferences-title">Settings</h2><button class="phone-icon" data-close-sheet aria-label="Close settings">${icon("x")}</button></div><div class="phone-account"><span class="phone-mark">owner</span><div><strong>Workspace</strong><p id="phone-sync-status" role="status">Connecting…</p></div></div><button id="phone-sync-now">${icon("refresh-cw")}<span>Sync now</span></button><button data-phone-action="theme">${icon("moon")}<span>Change theme</span></button><a href="/download/quiccie.apk">${icon("download")}<span>Download Android app</span></a><button data-phone-action="logout">${icon("log-out")}<span>Sign out</span></button><p class="phone-local-hint">Downloaded notes stay on this device after sign-out.</p></dialog>`,
};
export function phoneIcons() {
  createIcons({
    icons: {
      NotebookPen,
      Folder,
      Layers,
  BookOpen,
      Search,
      Plus,
      ArrowLeft,
      Ellipsis,
      RefreshCw,
      Settings2,
      Moon,
      FileCode,
      History,
      Paperclip,
      Trash2,
      X,
      Check,
      Pencil,
      Download,
      LogOut,
    },
    attrs: { width: 21, height: 21, "stroke-width": 1.8 },
  });
}

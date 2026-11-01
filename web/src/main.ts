import {resolveNote,scrollToNoteAnchor} from "./links";
import {bindProperties,hasPropertyQuery,matchesPropertyQuery} from "./properties";
import {breadcrumbs,folderLabel,displayPath,parentFolder,childFolder,notePresentation,location,importedIndex,noteProjects} from "./organization";
import {mountSpaces,loadSpaces,inSpace,inKind,chooseSpace,notePath,spaces,activeSpace,contentKind} from './spaces';
import { syncDialog, paintSync } from "./sync-ui";
import { phoneHTML, phoneIcons } from "./phone";
import { renderNote, canEditRich } from "./render";
import { buildTree, treeHTML, projectHTML,ordinaryProjectHTML } from "./navigation";
import "./style.css";
import "./phone.css";
import "./reviewed.css";
import "./dark-navigation.css";
import "./design.css";
import { createIcons, Moon } from "lucide";
import { makeEditor, toolbar, splitFrontmatter } from "./editor";
import {
  api,
  syncState, refreshSyncState, localSave,
  library,
  edit,
  sync,
  pendingFor,
  resolve,
  addAttachment, localAttachmentPaths,
  type Note,
} from "./sync";
const root = document.querySelector<HTMLDivElement>("#app")!;
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
let attachmentPaths:string[]=[];
let reading = true;
let navMode = localStorage.getItem("quiccie-nav-mode") || "files";
let folder = localStorage.getItem("quiccie-folder") || "";
let folderBrowsing=!!folder || localStorage.getItem("quiccie-browsing")==="true";
let expanded = new Set<string>();
try {
  expanded = new Set(
    JSON.parse(localStorage.getItem("quiccie-expanded") || "[]"),
  );
} catch {}
type PhoneSection = "notes" | "memory" | "files" | "projects" | "search";
let phoneSection: PhoneSection = "notes";
let restoringPhone = false;
let appStarting = false;
let phoneNavigationVersion = 0;
let selectionVersion = 0;
let phoneDialog: string | undefined;
let dialogFocus: HTMLElement | null = null;
let dialogBack: Promise<void> | undefined;
let finishDialogBack: (() => void) | undefined;
async function openPhoneDialog(id: string) {
  if (dialogBack) await dialogBack;
  const dialog = qs<HTMLDialogElement>(id);
  if(isPhone()&&appStarting){phoneNavigationVersion++;appStarting=false;screen(qs(".workspace").dataset.screen as "navigation"|"list"|"note");}
  dialogFocus = document.activeElement as HTMLElement;
  if (isPhone() && history.state?.quiccie) {
    phoneDialog = dialog.id;
    history.pushState(
      { quiccie: { ...history.state.quiccie, dialog: dialog.id } },
      "",
    );
  }
  dialog.showModal();
}
async function closePhoneDialog(dialog: HTMLDialogElement) {
  if (!dialog.open) return;
  await new Promise<void>((resolve) => {
    dialog.addEventListener("close", () => resolve(), { once: true });
    dialog.close();
  });
  if (dialogBack) await dialogBack;
}
let phoneLimit = 80;
let recentPaths: string[] = [];
try {
  recentPaths = JSON.parse(localStorage.getItem("quiccie-recent") || "[]");
} catch {}
const isPhone = () =>
  matchMedia("(max-width: 850px), (pointer: coarse) and (max-width: 1100px)")
    .matches;
function screen(value: "navigation" | "list" | "note") {
  qs(".workspace").dataset.screen = value;
  updatePhone();
  if (!isPhone() || restoringPhone || appStarting) return;
  qs("#detail").hidden = true;
  const state = {
    section: phoneSection,kind:contentKind,space:activeSpace,navMode,folderBrowsing,
    screen: value,
    folder,
    filter,
    query,
    path: value === "note" ? current?.path : undefined,
  };
  const old = history.state?.quiccie;
  if (
    old &&
    old.section === state.section && old.space===state.space && old.kind===state.kind &&
    old.screen === state.screen &&
    old.folder === state.folder &&
    old.path === state.path
  )
    history.replaceState({ quiccie: state }, "");
  else history.pushState({ quiccie: state }, "");
}
function clearOtherDestination(){
 if(!current||current.path.split('/').includes('Agent Memory')===(contentKind==='memory'))return;
 selectionVersion++;current=undefined;draft='';front='';
 qs('#word-count').textContent='';qs('#reader').innerHTML='';qs('#backlinks').innerHTML='';qs('#note-path').textContent='Your library';qs('#note-path').removeAttribute('title');qs('#empty').hidden=false;showMode();
}
type ViewPosition={folder:string;filter:string;query:string;listScroll:number;treeScroll:number;limit:number};
const viewPositions=new Map<string,ViewPosition>();
let viewScope=activeSpace+'|'+contentKind;
const browseModes=new Map<string,PhoneSection>();
function rememberView(){
 viewPositions.set(viewScope+'|'+phoneSection,{folder,filter,query,listScroll:qs('#note-items')?.scrollTop||0,treeScroll:qs('#folders')?.scrollTop||0,limit:phoneLimit});
 if(phoneSection==='files'||phoneSection==='projects')browseModes.set(viewScope,phoneSection);
}
function projectRoot(path:string){
 if(contentKind==='memory')return path.match(/^(.*Agent Memory\/(?:projects\/[^/]+|global))(?:\/|$)/)?.[1]||'';
 return noteProjects(notes.filter(n=>inSpace(n.path)&&inKind(n.path)).map(n=>n.path),spaces).find(p=>path===p||path.startsWith(p+'/'))||'';
}
function visibleParent(path:string){
 if(navMode==='projects'&&path===projectRoot(path))return '';
 const parent=parentFolder(path,spaces),base=((spaces.find(s=>s.id===activeSpace)?.prefix||'')+(contentKind==='memory'?'Agent Memory':'')).replace(/\/$/,'');
 return parent===base?'':parent;
}
async function phoneTab(requested: PhoneSection | 'browse', initializing = false) {
 if(!initializing){phoneNavigationVersion++;appStarting=false;}
 const navigation=phoneNavigationVersion;
 try{await flush();}catch{return;}
 if(navigation!==phoneNavigationVersion)return;
 if(!initializing)rememberView();
 if(requested==='notes'||requested==='memory')chooseSpace(activeSpace,requested==='memory'?'memory':'notes');
 viewScope=activeSpace+'|'+contentKind;
 const section=requested==='browse'?(browseModes.get(viewScope)||'files'):requested;
 clearOtherDestination();phoneSection=section;
 const saved=viewPositions.get(viewScope+'|'+section);
 folder=saved?.folder||'';
 if(folder&&!notes.some(n=>inSpace(n.path)&&inKind(n.path)&&n.path.startsWith(folder+'/')))folder='';
 folderBrowsing=section==='files'||section==='projects';
 if(folderBrowsing){navMode=section;browseModes.set(viewScope,section);}
 else folder='';
 filter=section==='search'||section==='notes'||section==='memory'?'all':saved?.filter||'all';
 query=section==='search'?saved?.query||'':'';searchHits=undefined;
 phoneLimit=saved?.limit||80;qs<HTMLInputElement>('#search').value=query;
 renderTree();renderList();
 screen(isPhone()&&folderBrowsing&&!folder?'navigation':'list');
 qs('#note-items').scrollTop=saved?.listScroll||0;qs('#folders').scrollTop=saved?.treeScroll||0;
 if(section==='search'){if(query)qs<HTMLInputElement>('#search').dispatchEvent(new Event('input'));qs<HTMLInputElement>('#search').focus();}else if(!appStarting)(document.activeElement as HTMLElement)?.blur();
}

function updatePhone() {
  const workspace = document.querySelector<HTMLElement>(".workspace");
  if (!workspace) return;
  if(["notes","memory"].includes(phoneSection))phoneSection=contentKind==="memory"?"memory":"notes";
  workspace.dataset.section = phoneSection;
  workspace.dataset.editing = String(!reading);
  const title = folder
    ? folderLabel(folder,spaces)
    : {
        notes: "Notes",
        memory: "Agent memory",
        files: "Folders",
        projects: "Projects",
        search: "Search",
      }[phoneSection];
  qs("#phone-title").textContent = title;
  qs("#phone-subtitle").textContent = folder
    ? breadcrumbs(folder,spaces).slice(0,-1).map(c=>c.label).join(" / ") || "Your library"
    : phoneSection === "projects"
      ? (spaces.find(s=>s.id===activeSpace)?.name || "All spaces")
      : phoneSection === "search"
        ? "Find what you need"
        : "Your library";
  qs("#phone-chips").hidden = !["notes","memory"].includes(phoneSection) || !!folder;
  qs('[data-phone-filter="all"]').textContent=contentKind==='memory'?'All memory':'All notes';
  qs('[data-phone-filter="indexes"]').hidden=contentKind!=='memory';
  qs('#phone-new span').textContent=contentKind==='memory'?'New memory':'New note';
  qs('#phone-subtitle').textContent=(spaces.find(s=>s.id===activeSpace)?.name||'All spaces')+' · '+(contentKind==='memory'?'Agent memory':'Notes');
  qs("#phone-folder-back").hidden = !folder;
  const parent=visibleParent(folder);
  qs("#phone-folder-back span").textContent=parent?'Up to '+folderLabel(parent,spaces):navMode==='projects'?'Back to projects':'Back to folders';
  qs('#phone-browse-views').hidden=!['files','projects'].includes(phoneSection);
  document
    .querySelectorAll<HTMLButtonElement>("[data-phone-tab]")
    .forEach((b) => {
      if (b.dataset.phoneTab === phoneSection || b.dataset.phoneTab==='browse'&&['files','projects'].includes(phoneSection))
        b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
  document
    .querySelectorAll<HTMLButtonElement>("[data-phone-filter]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.phoneFilter === filter)),
    );
  qs("#phone-note-title").textContent =
    current ? notePresentation(current.path,current.content).title : "Note";
  qs("#phone-note-location").textContent =
    current ? displayPath(current.path.split("/").slice(0,-1).join("/"),spaces) : "Your library";
  qs("#phone-edit").textContent = reading ? "Edit" : "Done";
  qs("#phone-edit").setAttribute(
    "aria-label",
    reading ? "Edit note" : "Finish editing",
  );
}
function pushPhonePanel() {
  if (isPhone() && history.state?.quiccie && !history.state.quiccie.panel)
    history.pushState(
      { quiccie: { ...history.state.quiccie, panel: true } },
      "",
    );
}
async function phoneBack() {
  await flush();
  (document.activeElement as HTMLElement)?.blur();
  if (history.state?.quiccie?.screen === "note") {
    history.back();
    return;
  }
  screen("list");
}
window.addEventListener("popstate", async (e) => {
  if (finishDialogBack) {
    const finish = finishDialogBack;
    finishDialogBack = undefined;
    dialogBack = undefined;
    finish();
    return;
  }
  if (phoneDialog) {
    const dialog = document.getElementById(phoneDialog) as HTMLDialogElement;
    phoneDialog = undefined;
    dialog?.close();
    return;
  }
  if (!isPhone() || !document.querySelector(".workspace")) return;
  await flush();
  const state = e.state?.quiccie;
  if (!state) {
    phoneTab("notes");
    return;
  }
  restoringPhone = true;
  try {
    if(state.kind)chooseSpace(state.space||activeSpace,state.kind);
    phoneSection = state.section;
    viewScope=activeSpace+'|'+contentKind;
    folderBrowsing=state.folderBrowsing??!!state.folder;
    folder = state.folder && notes.some(n=>inSpace(n.path)&&inKind(n.path)&&n.path.startsWith(state.folder+"/")) ? state.folder : "";
    filter = state.filter || "all";
    query = state.query || "";
    searchHits = undefined;
    qs<HTMLInputElement>("#search").value = query;
    navMode = state.navMode || (phoneSection === "projects" ? "projects" : "files");
    if (state.screen === "note" && notes.some((n) => n.path === state.path && inSpace(n.path) && inKind(n.path)))
      await select(state.path);
    else {
      screen(state.screen === "note" ? "list" : state.screen);
      renderList();
      renderTree();
      if(phoneSection==='search'&&query)qs<HTMLInputElement>('#search').dispatchEvent(new Event('input'));
    }
  } finally {
    restoringPhone = false;
  }
});
let searchHits: Map<string, number> | undefined;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let notes: Note[] = [],
  current: Note | undefined,
  front = "",
  source = false,
  loading = false,
  filter = "all",
  query = "";
document.addEventListener("click", async (e) => {
  if ((e.target as HTMLElement).closest("[data-close-detail]")) {
    qs("#detail").hidden = true;
    if (isPhone() && history.state?.quiccie?.panel) history.back();
    return;
  }
  const link = (e.target as HTMLElement).closest<HTMLAnchorElement>(
    "a[data-wiki], #reader a",
  );
  if (!link) return;
  e.preventDefault();
  const href = link.dataset.wiki ?? link.getAttribute("href") ?? "";
  if (/^(https?:|mailto:|\/api\/)/i.test(href)) {
    window.open(href, "_blank", "noopener,noreferrer");
    return;
  }
  const anchor = href.includes("#") ? href.slice(href.indexOf("#") + 1) : "";
  const scrollToAnchor=()=>scrollToNoteAnchor(link.closest<HTMLElement>(".embed-body")||qs("#reader"),anchor);
  if(href.startsWith('#')){scrollToAnchor();return;}
  const found=resolveNote(href,link.dataset.noteSource||current?.path||'',notes);
  if (found) {
    await select(found.path);
    if (anchor) scrollToAnchor();
  } else toast("The linked note is missing or its name is ambiguous.");
});
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let draft = "";
let saving = 0;
const qs = <T extends HTMLElement = HTMLElement>(s: string) =>
  document.querySelector<T>(s)!;
async function login() {
  root.innerHTML = `<main class="login"><div class="brand">q<span>quiccie</span></div><section><p class="eyebrow">A SPACE FOR YOUR THOUGHTS</p><h1>Keep what matters.</h1><p>Notes, ideas, and knowledge.<br>Ready when you need them.</p><form id="login"><label>Username<input class="input input-bordered" name="username" autocomplete="username" value="owner" required></label><label>Password<input class="input input-bordered" name="password" type="password" autocomplete="current-password" required></label><button class="btn btn-primary primary">Sign in <span aria-hidden="true">→</span></button><p role="alert" id="login-error"></p></form></section><footer>QUICCIE &nbsp; / &nbsp; YOUR NOTES, TOGETHER</footer></main>`;
  qs<HTMLFormElement>("#login").onsubmit = async (e) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget as HTMLFormElement);
    try {
      await api("login", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(data)),
      });
      await app();
    } catch (e: any) {
      qs("#login-error").textContent = e.message;
    }
  };
}
async function app() {
  const initialPhoneNavigationVersion=phoneNavigationVersion;
  appStarting = true;
  current = undefined;
  selectionVersion = 0;
  editor?.destroy();
  root.innerHTML = `<div class="workspace" data-screen="navigation"><aside class="sidebar"><div class="brand">q<span>quiccie</span></div><button id="new-note" class="btn new-note">＋ <span>New note</span><kbd>N</kbd></button><div class="nav-label">LIBRARY</div><nav><button data-filter="recent">◷ <span>Recent notes</span></button><button data-filter="all" class="active">▤ <span>Notes</span><small id="count"></small></button><button data-filter="memory">◇ <span>Agent memory</span></button><button data-filter="indexes" hidden><span>Imported indexes</span></button></nav><div class="tree-tabs"><button id="files-tab" aria-pressed="true">Folders</button><button id="projects-tab" aria-pressed="false">Projects</button></div><ul id="folders" aria-label="Note folders"></ul><a class="apk-link" href="/download/quiccie.apk">Download Android app</a><div class="sidebar-footer"><div class="avatar">Q</div><div><strong>owner</strong><small>Workspace</small></div><button id="logout" title="Sign out">↗</button></div></aside><main class="main"><header class="topbar"><button id="browse" class="mobile-only">Folders</button><div class="crumb">Workspace <span>/</span> <strong id="collection">All notes</strong></div><div class="search-wrap"><span>⌕</span><span id="search-scope" class="search-scope"></span><input id="search" aria-describedby="search-scope" placeholder="Search notes or [type:feedback]" aria-label="Search notes"><kbd>⌘ K</kbd></div><button id="theme" class="btn btn-ghost btn-sm" title="Change theme" aria-label="Change theme"><i data-lucide="moon"></i></button><span id="sync-state" class="badge badge-outline sync-state">Connecting…</span></header><div class="columns"><section class="note-list"><div class="list-head"><h2 id="list-title">All notes</h2><span id="list-count"></span></div><div id="note-items"></div></section><section class="document"><div class="document-head"><button id="back-list" class="mobile-only">Back</button><span id="note-path">Your library</span><div><button id="history" title="Note history">◷ History</button><button id="read-mode" aria-pressed="true">Read</button><button id="edit-mode" aria-pressed="false">Edit</button><button id="source" title="Edit Markdown source">Markdown</button><button id="attach" title="Add attachment">＋ File</button><button id="delete" title="Delete note">Delete</button></div></div><div id="conflict" hidden></div><div id="toolbar" class="toolbar"></div><div class="page-scroll"><div id="empty" class="empty"><span class="empty-mark">q</span><h1>A little space to think.</h1><p>Select a note, or create something new.</p></div><article id="reader" class="tiptap" hidden></article><div id="editor"></div><textarea id="source-editor" aria-label="Markdown source" hidden spellcheck="false"></textarea><div id="backlinks"></div></div><footer class="document-footer"><span id="word-count"></span><span id="save-state">Your notes stay with you.</span></footer></section><aside id="detail" hidden></aside></div></main></div><input type="file" id="file" hidden><dialog id="new-dialog" aria-labelledby="new-title"><form id="new-form" method="dialog"><h2 id="new-title">New note</h2><label>Note path<input class="input input-bordered" id="new-path" placeholder="Ideas/My note.md" required></label><p>Use a folder name to group your notes.</p><div class="dialog-actions"><button type="button" id="cancel-new">Cancel</button><button class="btn btn-primary primary" id="create" value="create">Create note</button></div><p id="new-error" role="alert"></p></form></dialog>`;
  qs(".workspace").insertAdjacentHTML(
    "afterbegin",
    phoneHTML.header + phoneHTML.noteHeader + `<button class="note-sync-visible phone-only" data-sync-open><span aria-hidden="true">↻</span><span data-sync-label>Not checked</span><span aria-hidden="true">›</span></button>`,
  );
  qs(".workspace").insertAdjacentHTML("beforeend", phoneHTML.nav);
  root.insertAdjacentHTML("beforeend", phoneHTML.dialogs + syncDialog);
  qs(".phone-brand-row").insertAdjacentHTML("afterend", `<button class="library-sync-visible" data-sync-open><span aria-hidden="true">↻</span><span data-sync-label>Not checked</span><span aria-hidden="true">›</span></button>`);
  document.querySelector('#space-dialog')?.remove();
  mountSpaces(async()=>{const navigation=++phoneNavigationVersion;rememberView();await flush();if(navigation!==phoneNavigationVersion)return;viewScope=activeSpace+'|'+contentKind;current=undefined;folder="";folderBrowsing=false;query="";searchHits=undefined;filter="all";qs<HTMLInputElement>("#search").value="";qs("#reader").hidden=true;qs("#editor").hidden=true;qs("#source-editor").hidden=true;qs("#backlinks").innerHTML="";qs("#note-path").textContent="Your library";qs("#empty").hidden=false;screen("list");await refresh();if(navigation!==phoneNavigationVersion)return;if(isPhone())await phoneTab(contentKind==="memory"?"memory":"notes",true);else{renderList();renderTree();}},openPhoneDialog,closePhoneDialog);
  qs("#sync-state").insertAdjacentHTML("afterend", `<button class="desktop-sync-visible" data-sync-open><span aria-hidden="true">↻</span><span data-sync-label>Not checked</span><span aria-hidden="true">›</span></button>`);
  phoneIcons();
  document.querySelectorAll<HTMLDialogElement>("dialog").forEach((dialog) =>
    dialog.addEventListener("close", () => {
      dialogFocus?.focus();
      if (phoneDialog === dialog.id) phoneDialog = undefined;
      if (isPhone() && history.state?.quiccie?.dialog === dialog.id) {
        dialogBack = new Promise<void>((resolve) => {
          finishDialogBack = resolve;
        });
        history.back();
      }
    }),
  );
  document
    .querySelectorAll<HTMLButtonElement>("[data-phone-tab]")
    .forEach(
      (b) => (b.onclick = () => phoneTab(b.dataset.phoneTab as PhoneSection | "browse")),
    );
  document.querySelectorAll<HTMLButtonElement>("[data-phone-filter]").forEach(
    (b) =>
      (b.onclick = () => {
        filter = b.dataset.phoneFilter!;
 if(filter==="personal"||filter==="work")chooseSpace(filter==="work"?"work":"personal","notes");
        phoneLimit = 80;
        qs("#list-title").textContent =
          filter === "recent" ? "Recent notes" : b.textContent;
        renderList();
        updatePhone();
        screen("list");
      }),
  );
  qs("#phone-folder-back").onclick = () => {
    const parent=visibleParent(folder);enterFolder(parent);
    if(!parent)screen('navigation');
  };
  qs("#phone-new").onclick = () => qs<HTMLButtonElement>("#new-note").click();
  qs("#phone-back").onclick = () => void phoneBack();
  qs("#phone-edit").onclick = async () => {
    if (reading) {
      qs<HTMLButtonElement>("#edit-mode").click();
      if (source) qs<HTMLTextAreaElement>("#source-editor").focus();
      else editor.commands.focus();
    } else {
      await flush();
      reading = true;
      (document.activeElement as HTMLElement)?.blur();
      showMode();
      void sync();
    }
  };
  qs("#phone-more").onclick = () => {
    qs("#phone-actions-path").textContent = current?.path || "";
    void openPhoneDialog("#phone-actions");
  };
  qs("#phone-settings").onclick = () =>
    void openPhoneDialog("#phone-preferences");
  document
    .querySelectorAll<HTMLButtonElement>("[data-close-sheet]")
    .forEach(
      (b) =>
        (b.onclick = () => b.closest<HTMLDialogElement>("dialog")!.close()),
    );
  document
    .querySelectorAll<HTMLDialogElement>(".phone-sheet")
    .forEach((dialog) =>
      dialog.addEventListener("click", (e) => {
        if (e.target === dialog) {
          const r = dialog.getBoundingClientRect();
          if (e.clientY < r.top || e.clientX < r.left || e.clientX > r.right)
            dialog.close();
        }
      }),
    );
  document.querySelectorAll<HTMLButtonElement>("[data-phone-action]").forEach(
    (b) =>
      (b.onclick = async () => {
        await closePhoneDialog(b.closest<HTMLDialogElement>("dialog")!);
        qs<HTMLButtonElement>("#" + b.dataset.phoneAction).click();
      }),
  );
  const requestSync = async () => {
    try {
      await flush();
      if(syncState.phase === "auth") { await login(); return; }
      if(syncState.conflicts) {
        const all=await library();
        for(const note of all) if((await pendingFor(note.path))?.conflict){await select(note.path);await conflict();return;}
      }
      await sync();
    } catch { toast("Cannot save on this device. Keep this page open and try again."); }
  };
  const openSync=()=>{paintSync();void openPhoneDialog("#sync-dialog");};
  document.querySelectorAll<HTMLButtonElement>("[data-sync-open]").forEach(b=>b.onclick=openSync);
  qs("#phone-sync").onclick=openSync;
  qs("#sync-close").onclick=()=>qs<HTMLDialogElement>("#sync-dialog").close();
  qs("#sync-action").onclick=async()=>{
    if(syncState.phase==='auth'||syncState.conflicts)await closePhoneDialog(qs<HTMLDialogElement>("#sync-dialog"));
    await requestSync();
  };
  qs("#phone-sync-now").onclick=async()=>{await closePhoneDialog(qs<HTMLDialogElement>("#phone-preferences"));openSync();};
  await refreshSyncState();paintSync();
  qs("#files-tab").onclick = () => void phoneTab('files');
  qs("#projects-tab").onclick = () => void phoneTab('projects');
  qs("#browse").onclick = () =>
    isPhone() ? phoneTab("files") : screen("navigation");
  qs("#back-list").onclick = () => {
    void flush();
    screen("list");
  };
  qs("#read-mode").onclick = async () => {
    await flush();
    reading = true;
    showMode();
  };
  qs("#edit-mode").onclick = () => {
    if (!canEditRich(draft, front + editor.getMarkdown())) {
      toast("Use Markdown to keep the structure of this note.");
      source = true;
    } else source = false;
    reading = false;
    loadEditor(draft);
    showMode();
  };
  editor = makeEditor(qs("#editor"), (text) => {
    if (!loading && current) {
      draft = front + text;
      changed();
    }
  });
  toolbar(qs("#toolbar"), editor);
  showMode();
  createIcons({
    icons: { Moon },
    attrs: { width: 16, height: 16, "stroke-width": 1.6 },
  });
  qs("#theme").onclick = () => {
    const theme =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("quiccie-theme", theme);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--rail").trim());
  };
  qs<HTMLDialogElement>("#new-dialog").addEventListener("click", (e) => {
    if (e.target !== e.currentTarget) return;
    const bounds = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (
      e.clientX < bounds.left ||
      e.clientX > bounds.right ||
      e.clientY < bounds.top ||
      e.clientY > bounds.bottom
    )
      qs<HTMLDialogElement>("#new-dialog").close("cancel");
  });
  qs("#cancel-new").onclick = () =>
    qs<HTMLDialogElement>("#new-dialog").close("cancel");
  qs("#new-note").onclick = async () => {
    qs<HTMLFormElement>("#new-form").reset();
    if(folder && inKind(folder+"/New.md"))qs<HTMLInputElement>("#new-path").value=folder+"/";
    qs("#new-error").textContent = "";
    await openPhoneDialog("#new-dialog");
    qs<HTMLInputElement>("#new-path").focus();
  };
  qs<HTMLFormElement>("#new-form").onsubmit = async (e) => {
    e.preventDefault();
    let p = qs<HTMLInputElement>("#new-path").value.trim();
    if (
      !p ||
      p
        .split("/")
        .some(
          (part) =>
            !part || part.startsWith(".") || /[\\:\x00-\x1f]/.test(part),
        ) ||
      new TextEncoder().encode(p).length > 1021
    ) {
      qs("#new-error").textContent =
        "Enter a relative note path. Do not use hidden folders or parent paths.";
      qs<HTMLInputElement>("#new-path").focus();
      return;
    }
    try {p=notePath(p);} catch(error){qs("#new-error").textContent=(error as Error).message;return;}
    if (!p.endsWith(".md")) p += ".md";
    if (notes.some((n) => n.path === p)) {
      qs("#new-error").textContent =
        "A note has this path. Use a different path.";
      return;
    }
    const create = qs<HTMLButtonElement>("#create");
    create.disabled = true;
    try {
      await flush();
      await edit(p, "# " + p.split("/").pop()!.slice(0, -3) + "\n\n");
      await closePhoneDialog(qs<HTMLDialogElement>("#new-dialog"));
      await refresh();
      await select(p);
      reading = false;
      source = false;
      showMode();
      if (isPhone()) editor.commands.focus("end");
      void sync();
    } catch (error: any) {
      qs("#new-error").textContent =
        error.message || "The note could not be saved.";
    } finally {
      create.disabled = false;
    }
  };
  document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(b=>b.onclick=async()=>{
   const target=b.dataset.filter!;
   await phoneTab(target==='all'?'notes':target==='memory'||target==='indexes'?'memory':contentKind==='memory'?'memory':'notes');
   if(target==='recent'||target==='indexes'){filter=target;renderList();screen('list');}
  });
  qs<HTMLInputElement>("#search").oninput = () => {
    if(phoneSection!=='search')rememberView();
    query = qs<HTMLInputElement>("#search").value;
    folder = "";folderBrowsing=false;
    filter = "all";
    phoneSection = "search";
    screen("list");
    searchHits = undefined;
    renderList();
    clearTimeout(searchTimer);
    const term = query;
 const searchSpace=activeSpace,searchKind=contentKind;
    if (term.trim() && !term.endsWith("/") && !hasPropertyQuery(term))
      searchTimer = setTimeout(async () => {
        try {
          const hits: Note[] = await api(
            "search?q=" + encodeURIComponent(term)+ (activeSpace==="*"?"":"&space="+encodeURIComponent(activeSpace))+(contentKind==="all"?"":"&kind="+contentKind),
          );
          if (query === term && activeSpace===searchSpace && contentKind===searchKind) {
            searchHits = new Map(hits.map((n, i) => [n.path, i]));
            renderList();
          }
        } catch {}
      }, 180);
  };
  qs("#source").onclick = () => {
    if (!current) return;
    reading = false;
    source = true;
    qs<HTMLTextAreaElement>("#source-editor").value = draft;
    showMode();
  };
  qs<HTMLTextAreaElement>("#source-editor").oninput = () => {
    draft = qs<HTMLTextAreaElement>("#source-editor").value;
    changed();
  };
  qs("#history").onclick = showHistory;
  qs("#delete").onclick = async () => {
    if (current && confirm("Delete this note? Its history will remain.")) {
      await flush();
      await edit(current.path, draft, true, current.checksum || null);
      current = undefined;
      showMode();
      screen("list");
      await refresh();
      void sync();
    }
  };
  qs("#attach").onclick = () => qs<HTMLInputElement>("#file").click();
  qs<HTMLInputElement>("#file").onchange = attachment;
  qs("#logout").onclick = async () => {
    await flush();
    try {
      await api("logout", { method: "POST", body: "{}" });
    } catch (e: any) {
      if (e.status !== 401) {
        toast("Connect to the server to sign out.");
        return;
      }
    }
    await login();
  };
  if (isPhone()) {
    filter = "all";
    screen("list");
  }
  await refresh();
  await sync();
  await refresh();
  const scoped=notes.filter(n=>inSpace(n.path)&&inKind(n.path)&&!importedIndex(n.path,spaces));
  if(folder && !scoped.some(n=>n.path.startsWith(folder+"/")))folder="";
  if (scoped.length && !current && selectionVersion === 0 && !isPhone()) {
    const last = localStorage.getItem("quiccie-last-note");
    await select(
      scoped.find((n) => n.path === last)?.path ??
        scoped.find((n) => n.path === "Home.md")?.path ??
        scoped[0].path,
    );
  }
  if (isPhone() && phoneNavigationVersion===initialPhoneNavigationVersion) {
    if(folder){phoneSection=navMode==="projects"?"projects":"files";enterFolder(folder,true);}else await phoneTab(contentKind==="memory"?"memory":"notes",true);
    history.replaceState(
      {
        quiccie: {
          section: phoneSection,kind:contentKind,space:activeSpace,
          screen: "list",
          folder,
          filter,
          query: "",
        },
      },
      "",
    );
  }
  appStarting = false;
  updatePhone();
}
let editor: ReturnType<typeof makeEditor>;
function showMode() {
  updatePhone();
  qs("#reader").hidden = !reading || !current;
  qs("#reader").innerHTML = current ? renderNote(draft,{path:current.path,lookup:(target,from)=>resolveNote(target,from,notes),attachments:attachmentPaths}) : "";
  const propertyPath=current?.path;
  if(current)bindProperties(qs("#reader"),()=>current?.path===propertyPath?draft:'',async value=>{if(current?.path!==propertyPath)throw Error('The selected note changed. Close this dialog and try again.');draft=value;loadEditor(value);changed();await flush();void sync();},dialog=>{
    dialog.id='property-editor-dialog';
    dialog.addEventListener('close',()=>{dialogFocus?.focus();if(phoneDialog===dialog.id)phoneDialog=undefined;if(isPhone()&&history.state?.quiccie?.dialog===dialog.id){dialogBack=new Promise<void>(resolve=>{finishDialogBack=resolve});history.back();}});
    void openPhoneDialog('#'+dialog.id);
  });
  qs("#editor").hidden = reading || source || !current;
  qs("#toolbar").hidden = reading || source || !current;
  qs("#source-editor").hidden = reading || !source || !current;
  qs("#read-mode").setAttribute("aria-pressed", String(reading));
  qs("#edit-mode").setAttribute("aria-pressed", String(!reading && !source));
  qs("#source").setAttribute("aria-pressed", String(!reading && source));
}
function loadEditor(content: string) {
  const parts = splitFrontmatter(content);
  front = parts.front;
  loading = true;
  editor.commands.setContent(parts.body, {
    contentType: "markdown",
    emitUpdate: false,
  });
  loading = false;
  qs<HTMLTextAreaElement>("#source-editor").value = content;
  showMode();
}
function changed() {
  localSave("saving");
  qs("#save-state").textContent = "Saving on this device…";
  qs("#word-count").textContent = draft.trim().split(/\s+/).length + " words";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flush().then(() => sync()).catch(() => {}), 400);
}
async function flush() {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  if (current && draft !== current.content) {
    const note = current,
      saved = draft;
    saving++;
    try {
      await edit(note.path, saved, false, note.checksum || null, note.content);
    } catch(e) {
      localSave("failed");
      qs("#save-state").textContent="Cannot save on this device. Keep this page open.";
      throw e;
    } finally {
      saving--;
    }
    note.content = saved;
    if (current !== note || draft !== saved) {localSave("saving");return;}
    localSave("saved");
    qs("#save-state").textContent = "Saved on this device";
    await refresh();
  } else if(current && draft === current.content && !saving) {
    localSave("saved");
    qs("#save-state").textContent="Saved on this device";
  }
}
async function refresh() {
  notes = await library();
  attachmentPaths=await localAttachmentPaths();
  if (!document.querySelector("#note-items")) return;
  qs("#count").textContent = String(notes.filter(n=>inSpace(n.path)&&inKind(n.path)).length);
  renderList();
  renderTree();
  updatePhone();
}
function enterFolder(path:string,initializing=false){
  if(isPhone()&&!initializing){phoneNavigationVersion++;appStarting=false;}
  phoneSection=navMode==="projects"?"projects":"files";
  folder=path;folderBrowsing=true;filter="all";query="";searchHits=undefined;phoneLimit=80;
  qs<HTMLInputElement>("#search").value="";
  qs("#list-title").textContent=folder?folderLabel(folder,spaces):navMode==="projects"?"Projects":"All folders";
  qs("#collection").textContent=folder?displayPath(folder,spaces):"All notes";
  localStorage.setItem("quiccie-folder",folder);
  localStorage.setItem("quiccie-nav-mode",navMode);
  renderTree();renderList();screen("list");
}
function renderTree() {
  const root = buildTree(notes.filter(n=>inSpace(n.path)&&inKind(n.path)).map((n) => n.path));
  const titles=new Map(notes.map(n=>[n.path,n.content]));
  const prefix=spaces.find(s=>s.id===activeSpace)?.prefix||'';
  let folderRoot=root;
  if(activeSpace!=='*')for(const part of (prefix+(contentKind==='memory'?'Agent Memory/':'')).split('/').filter(Boolean)){folderRoot=folderRoot.children.get(part)||{name:'',path:'',file:false,children:new Map()};}
  qs("#folders").innerHTML =
    navMode === "projects"
      ? (contentKind==="memory" ? projectHTML(root, expanded, current?.path, spaces, titles) : ordinaryProjectHTML(root, notes.filter(n=>inSpace(n.path)&&inKind(n.path)).map(n=>n.path), expanded, current?.path, spaces, titles))
      : treeHTML(folderRoot, expanded, current?.path, spaces, titles);
  qs("#files-tab").setAttribute("aria-pressed", String(navMode === "files"));
  qs("#projects-tab").setAttribute(
    "aria-pressed",
    String(navMode === "projects"),
  );
  qs("#folders")
    .querySelectorAll<HTMLButtonElement>("[data-toggle]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          const path = b.dataset.toggle!;
          if (expanded.has(path)) expanded.delete(path);
          else expanded.add(path);
          localStorage.setItem(
            "quiccie-expanded",
            JSON.stringify([...expanded]),
          );
          renderTree();
        }),
    );
  qs("#folders")
    .querySelectorAll<HTMLButtonElement>("[data-folder]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          const path=b.dataset.folder!;
          if(expanded.has(path))expanded.delete(path);else expanded.add(path);
          localStorage.setItem("quiccie-expanded",JSON.stringify([...expanded]));
          enterFolder(path);
        }),
    );
  qs("#folders")
    .querySelectorAll<HTMLButtonElement>("[data-tree-note]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          const path = b.dataset.treeNote!;
          folder = path.split("/").slice(0, -1).join("/");
          filter = "all";
          query = "";
          searchHits = undefined;
          qs<HTMLInputElement>("#search").value = "";
          qs("#list-title").textContent = folderLabel(folder,spaces) || "Notes";
          qs("#collection").textContent = folder ? displayPath(folder,spaces) : "Notes";
          void select(path);
        }),
    );
}

function renderList() {
  if(spaces.some(s=>folder===s.prefix+"Agent Memory/projects"))folder=folder.slice(0,-9);
  localStorage.setItem("quiccie-browsing",String(folderBrowsing));
  localStorage.setItem("quiccie-folder",folder);
  localStorage.setItem("quiccie-nav-mode",navMode);
  let shown = notes.filter(
    (n) =>
      inSpace(n.path) && inKind(n.path) &&
      (!folder || n.path.startsWith(folder + "/")) &&
      
      (filter !== "memory" || n.path.includes("Agent Memory/")) &&
      (folderBrowsing || (filter==='indexes'?importedIndex(n.path,spaces):!importedIndex(n.path,spaces))) &&
      
      (!query ||
        (hasPropertyQuery(query)?matchesPropertyQuery(n.content,n.path,query):searchHits
          ? searchHits.has(n.path)
          : (n.path + " " + n.content)
              .toLowerCase()
              .includes(query.toLowerCase()))),
  );
  const libraryLabel=contentKind==='memory'?'Agent memory':'Notes';
  qs('#new-note span').textContent=contentKind==='memory'?'New memory':'New note';
  qs('#new-title').textContent=contentKind==='memory'?'New memory':'New note';
  const indexes=notes.filter(n=>inSpace(n.path)&&inKind(n.path)&&importedIndex(n.path,spaces)).length;
  qs('[data-filter="indexes"]').hidden=contentKind!=='memory';
  qs('[data-filter="all"]').classList.toggle('active',contentKind==='notes');
  qs('[data-filter="memory"]').classList.toggle('active',contentKind==='memory');
  qs('#count').textContent=String(notes.filter(n=>inSpace(n.path)&&!n.path.split('/').includes('Agent Memory')).length);
  qs('[data-filter="recent"] span').textContent=contentKind==='memory'?'Recent memory':'Recent notes';
  if(!folder&&!folderBrowsing)qs('#list-title').textContent=filter==='indexes'?'Imported indexes':query?'Search results':filter==='recent'?(contentKind==='memory'?'Recent memory':'Recent notes'):libraryLabel;
  qs('#collection').textContent=libraryLabel;
  if(folderBrowsing)qs('#list-title').textContent=folder?folderLabel(folder,spaces):navMode==='projects'?'Projects':'Folders';
  qs('#search-scope').textContent='Search: '+(spaces.find(s=>s.id===activeSpace)?.name||'All spaces')+' · '+libraryLabel+' · All folders';
  const children=new Set<string>();
  if(folderBrowsing && !query){
    const projectRoot=!folder&&navMode==="projects"&&contentKind==="memory";
    if(projectRoot){
      const direct=new Set<string>();
      for(const note of shown){const {prefix,parts}=location(note.path,spaces);if(parts[0]!=="Agent Memory")continue;
        if(parts[1]==="projects"&&parts.length>3)children.add(prefix+parts.slice(0,3).join("/"));
        else if(parts.length>2&&parts[1]!=="projects")children.add(prefix+parts.slice(0,2).join("/"));
        else direct.add(note.path);
      }
      shown=shown.filter(n=>direct.has(n.path));
    }else if(!folder&&navMode==='projects'){
      for(const root of noteProjects(shown.map(n=>n.path),spaces))children.add(root);
      shown=[];
    }else{
      const base=folder|| (activeSpace==='*'?'':((spaces.find(s=>s.id===activeSpace)?.prefix||'')+(contentKind==='memory'?'Agent Memory':'')).replace(/\/$/,''));
      for(const note of shown){const child=childFolder(note.path,base,spaces);if(child)children.add(child);}
      shown=shown.filter(n=>parentFolder(n.path,spaces)===base);
    }
  }
  if (filter === "recent") {
    shown = shown.filter(n=>recentPaths.includes(n.path));
    shown.sort((a, b) => {
      const ai = recentPaths.indexOf(a.path),
        bi = recentPaths.indexOf(b.path);
      if (ai >= 0 || bi >= 0) return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
      return b.updated.localeCompare(a.updated);
    });
  }
  if (isPhone() && phoneSection === "search" && !query.trim()) shown = [];
  if (searchHits)
    shown.sort((a, b) => searchHits!.get(a.path)! - searchHits!.get(b.path)!);
  if(isPhone()&&current){const selectedIndex=shown.findIndex(n=>n.path===current?.path);if(selectedIndex>=phoneLimit)phoneLimit=Math.ceil((selectedIndex+1)/80)*80;}
  qs("#list-count").textContent = shown.length+" notes"+(children.size?" · "+children.size+" folders":"");
  qs("#note-items").innerHTML =
    (isPhone() ? shown.slice(0, phoneLimit) : shown)
      .map(n=>{const info=notePresentation(n.path,n.content);return `<button class="note-card ${current?.path===n.path?"selected":""}" data-path="${esc(n.path)}" title="${esc(n.path)}"><span class="note-title">${esc(info.title)}</span><span class="note-excerpt">${esc(info.excerpt)}</span><span class="note-meta">${esc(displayPath(n.path.split("/").slice(0,-1).join("/"),spaces))}${info.historical?" · Historical memory":""}</span></button>`;})
      .join("") ||
    `<div class="list-empty"><strong>${isPhone() && phoneSection === "search" && !query ? "Search your notes" : "No notes found"}</strong><p>${isPhone() && phoneSection === "search" && !query ? "Search by title or note text." : "Try another search or create a note."}</p></div>`;
  if(folderBrowsing && !query){
    const root=navMode==='projects'?projectRoot(folder):'';
    const parts=folder?breadcrumbs(folder,spaces).filter(c=>!root||c.path===root||c.path.startsWith(root+'/')):[];
    const crumbs='<nav class="folder-crumbs" aria-label="Folder path"><button data-enter-folder="">'+(navMode==="projects"?"Projects":"All folders")+'</button>'+(root?'<span>/ '+esc((location(folder,spaces).space?.name||'Personal')+' · '+(contentKind==='memory'?'Agent memory':'Notes'))+'</span>':'')+parts.map(part=>`<span aria-hidden="true">/</span><button data-enter-folder="${esc(part.path)}"${part.space?` data-enter-space="${esc(part.space)}"`:""}>${esc(part.label)}</button>`).join("")+"</nav>";
    const folders=[...children].sort().map(path=>`<button class="folder-card" data-enter-folder="${esc(path)}" title="${esc(path)}"><span aria-hidden="true">▱</span><strong>${esc((activeSpace==="*"&&!folder?(location(path,spaces).space?.name||"Personal")+" / ":"")+folderLabel(path,spaces))}</strong><span aria-hidden="true">›</span></button>`).join("");
    if(children.size && !shown.length)qs("#note-items").innerHTML="";
    qs("#note-items").insertAdjacentHTML("afterbegin",crumbs+folders);
    qs("#note-items").querySelectorAll<HTMLButtonElement>("[data-enter-folder]").forEach(b=>b.onclick=()=>{
      const path=b.dataset.enterFolder!;
      if(b.dataset.enterSpace)chooseSpace(b.dataset.enterSpace);
      if(path)expanded.add(path);
      localStorage.setItem("quiccie-expanded",JSON.stringify([...expanded]));
      enterFolder(path);
      if(!path && isPhone())screen("navigation");
    });
  }
  if(contentKind==='memory'&&!folderBrowsing&&filter!=='indexes'&&indexes){
    qs('#note-items').insertAdjacentHTML('afterbegin',`<button class="index-access">Imported indexes (${indexes})</button>`);
    qs('.index-access').onclick=()=>{filter='indexes';query='';searchHits=undefined;qs<HTMLInputElement>('#search').value='';renderList();updatePhone();};
  }
  if (isPhone() && shown.length > phoneLimit) {
    qs("#note-items").insertAdjacentHTML(
      "beforeend",
      '<button id="phone-load-more">Show more notes</button>',
    );
    qs("#phone-load-more").onclick = () => {
      phoneLimit += 80;
      renderList();
    };
  }
  document
    .querySelectorAll<HTMLButtonElement>("[data-path]")
    .forEach((b) => (b.onclick = () => void select(b.dataset.path!)));
}
async function select(path: string) {
  if(isPhone()){phoneNavigationVersion++;appStarting=false;}
  const version = ++selectionVersion;
  await flush();
  if (version !== selectionVersion) return;
  current = notes.find((n) => n.path === path);
  if (!current) return;
  const targetKind=path.split('/').includes('Agent Memory')?'memory':'notes';
  if(targetKind!==contentKind){chooseSpace(activeSpace,targetKind);folder='';folderBrowsing=false;phoneSection=targetKind==='memory'?'memory':'notes';filter='all';}
  draft = current.content;
  reading = true;
  localStorage.setItem("quiccie-last-note", path);
  recentPaths = [path, ...recentPaths.filter((p) => p !== path)].slice(0, 40);
  localStorage.setItem("quiccie-recent", JSON.stringify(recentPaths));
  screen("note");
  loadEditor(draft);
  qs("#empty").hidden = true;
  qs("#save-state").textContent = "Available offline";
  showMode();
  renderTree();
  qs("#note-path").textContent = displayPath(path.split("/").slice(0,-1).join("/"),spaces)+" / "+notePresentation(path,current.content).title;
  qs("#note-path").title=path;
  qs("#word-count").textContent = draft.trim().split(/\s+/).length + " words";
  qs("#detail").hidden = true;
  renderList();
  await conflict();
  const stem = path.split("/").pop()!.replace(/\.md$/, "");
  const links = notes.filter(
    (n) =>
      n.path !== path &&
      (n.content.includes("[[" + stem) ||
        n.content.includes("](" + path + ")")),
  );
  qs("#backlinks").innerHTML = links.length
    ? "<h3>Linked from</h3>" +
      links
        .map(
          (n) =>
            `<button data-backlink="${esc(n.path)}">↗ ${esc(n.path)}</button>`,
        )
        .join("")
    : "";
  document
    .querySelectorAll<HTMLButtonElement>("[data-backlink]")
    .forEach((b) => (b.onclick = () => void select(b.dataset.backlink!)));
}
async function conflict() {
  if (!current) return;
  const path = current.path;
  const p = await pendingFor(path);
  if (current?.path !== path) return;
  const box = qs("#conflict");
  box.hidden = !p?.conflict;
  if (p?.conflict) {
    box.innerHTML = `<strong>This note changed elsewhere.</strong><p>Your edit is safe on this device. Compare both versions before you continue.</p><button id="compare">Compare versions</button>`;
    qs("#compare").onclick = async () => {
      try {
        const remote: Note = await api(
          "notes?include_deleted=1&path=" + encodeURIComponent(path),
        );
        if (current?.path !== path) return;
        const panel = qs("#detail");
        panel.hidden = false;
        pushPhonePanel();
        panel.innerHTML = `<button data-close-detail>Close</button><h2>${remote.deleted ? "Deleted on the server" : "Saved version"}</h2><pre>${esc(remote.content)}</pre><button id="keep-mine">Save my version</button><button id="keep-server">Use saved version; keep my edit in Conflicts</button>`;
        qs("#keep-mine").onclick = () => void resolveCurrent(true, remote);
        qs("#keep-server").onclick = () => void resolveCurrent(false, remote);
      } catch (e: any) {
        toast(e.message);
      }
    };
  }
}
async function resolveCurrent(mine: boolean, reviewed: Note) {
  if (!current) return;
  const p = current.path;
  await resolve(p, mine, reviewed);
  await refresh();
  if (notes.some((n) => n.path === p)) await select(p);
  else {
    current = undefined;
    draft = "";
    showMode();
    qs("#conflict").hidden = true;
    qs("#detail").hidden = true;
    qs("#empty").hidden = false;
    screen("list");
  }
}
async function showHistory() {
  if (!current) return;
  const path = current.path;
  try {
    const records: Note[] = await api(
      "history?path=" + encodeURIComponent(path),
    );
    if (current?.path !== path) return;
    const panel = qs("#detail");
    panel.hidden = !panel.hidden;
    if (panel.hidden) {
      if (isPhone() && history.state?.quiccie?.panel) history.back();
      return;
    }
    pushPhonePanel();
    panel.innerHTML =
      "<button data-close-detail>Close</button><h2>Note history</h2>" +
      records
        .reverse()
        .map(
          (n, i) =>
            `<details><summary>${new Date(n.updated).toLocaleString()}</summary><pre>${esc(n.content)}</pre><button data-revision="${i}">Restore this version</button></details>`,
        )
        .join("");
    panel.querySelectorAll<HTMLButtonElement>("[data-revision]").forEach(
      (b) =>
        (b.onclick = async () => {
          if (current?.path !== path) return;
          draft = records[Number(b.dataset.revision)].content;
          loadEditor(draft);
          await flush();
          void sync();
        }),
    );
  } catch (e: any) {
    toast(e.message);
  }
}
async function attachment() {
  const file = qs<HTMLInputElement>("#file").files?.[0];
  if (!file || !current) return;
  try {
    const p = "Attachments/" + crypto.randomUUID() + "-" + file.name;
    await addAttachment(p, file);
    const link =
      (file.type.startsWith("image/") ? "!" : "") +
      "[" +
      file.name +
      "](/api/attachment?path=" +
      encodeURIComponent(p) +
      ")";
    draft += "\n\n" + link + "\n";
    loadEditor(draft);
    await flush();
    void sync();
  } catch (e: any) {
    toast(e.message);
  }
}
function toast(message: string) {
  const el = document.createElement("div");
  el.className = "toast";
  el.role = "alert";
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), 6000);
}
window.addEventListener("quiccie-sync-state", ()=>paintSync());
window.addEventListener("quiccie-sync", async (e) => {
  if (!document.querySelector("#sync-state")) return;
  const status = (e as CustomEvent).detail;
  qs("#sync-state").textContent = status;
  paintSync();
  qs("#phone-sync").setAttribute(
    "aria-label",
    status === "Sign in to sync" ? "Sign in to sync" : "Sync notes: " + status,
  );
  qs("#phone-sync").dataset.status =
    status === "Synced"
      ? "ok"
      : status.includes("Conflict")
        ? "conflict"
        : "offline";
  await loadSpaces();
  await refresh();
  await conflict();
  if (current && !(await pendingFor(current.path))) {
    const fresh = notes.find((n) => n.path === current!.path);
    if (fresh && fresh.checksum !== current.checksum) {
      if (fresh.content === current.content) current.checksum = fresh.checksum;
      else if (!saveTimer && !saving && draft === current.content) {
        current = fresh;
        draft = fresh.content;
        loadEditor(draft);
      }
    }
  }
});
window.addEventListener("online", () => void sync());
window.addEventListener("beforeunload", (e) => {
  if (saveTimer || saving || (current && draft !== current.content)) {
    e.preventDefault();
  }
});
setInterval(() => void sync(), 10000);
window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "k") {
    e.preventDefault();
    if (isPhone() && document.querySelector(".workspace")) phoneTab("search");
    document.querySelector<HTMLInputElement>("#search")?.focus();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    void flush().then(() => sync());
  }
});
document.documentElement.dataset.theme =
  localStorage.getItem("quiccie-theme") ??
  (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
document
  .querySelector('meta[name="theme-color"]')
  ?.setAttribute(
    "content",
    getComputedStyle(document.documentElement).getPropertyValue("--rail").trim(),
  );
if ("serviceWorker" in navigator)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
api("me")
  .then(app)
  .catch(async () => {
    if ((await library()).length) await app();
    else await login();
  });

let phoneHeight = window.innerHeight;
let phoneWidth = window.innerWidth;
function updateKeyboard() {
  if (window.innerWidth !== phoneWidth) {
    phoneWidth = window.innerWidth;
    phoneHeight = window.innerHeight;
  }
  phoneHeight = Math.max(phoneHeight, window.innerHeight);
  const editable = (document.activeElement as HTMLElement)?.matches(
    "input,textarea,[contenteditable=true]",
  );
  document.documentElement.classList.toggle(
    "phone-keyboard",
    isPhone() && !!editable && window.innerHeight < phoneHeight - 140,
  );
}
window.visualViewport?.addEventListener("resize", updateKeyboard);
document.addEventListener("focusin", updateKeyboard);
document.addEventListener("focusout", () => setTimeout(updateKeyboard, 0));

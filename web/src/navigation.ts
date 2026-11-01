import {folderLabel,notePresentation,location,noteProjects} from './organization';
import type {Space} from "./spaces";
import { escapeHTML as esc } from "./render";
export interface Tree {
  name: string;
  path: string;
  children: Map<string, Tree>;
  file: boolean;
}
export function buildTree(paths: string[]): Tree {
  const root: Tree = { name: "", path: "", children: new Map(), file: false };
  for (const path of paths) {
    let node = root;
    const parts = path.split("/");
    parts.forEach((name, i) => {
      if (!node.children.has(name))
        node.children.set(name, {
          name,
          path: parts.slice(0, i + 1).join("/"),
          children: new Map(),
          file: false,
        });
      node = node.children.get(name)!;
      if (i === parts.length - 1) node.file = true;
    });
  }
  return root;
}
const folderIcon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9H3Z"/></svg>';
const noteIcon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 3h9l5 5v13H5Z M14 3v6h5 M8 13h8 M8 17h6"/></svg>';
const count = (node: Tree): number =>
  node.file
    ? 1
    : [...node.children.values()].reduce((sum, n) => sum + count(n), 0);
export function treeHTML(
  root: Tree,
  expanded: Set<string>,
  selected: string | undefined,
  spaces: Space[] = [],
  content: Map<string,string> = new Map(),
): string {
  const parts=location(root.path,spaces).parts;
  const children=parts.length===1&&parts[0]==="Agent Memory" ? [...(root.children.get("projects")?.children.values()||[]),...[...root.children.values()].filter(n=>n.name!=="projects")] : [...root.children.values()];
  return children
    .sort(
      (a, b) => Number(a.file) - Number(b.file) || a.name.localeCompare(b.name),
    )
    .map((node) =>
      node.file
        ? `<li><button class="tree-note ${selected === node.path ? "selected" : ""}" data-tree-note="${esc(node.path)}" title="${esc(node.path)}">${noteIcon}<span class="tree-folder-label">${esc(notePresentation(node.path,content.get(node.path)||"").title)}</span></button></li>`
        : `<li><div class="tree-row"><button class="tree-toggle" aria-label="Expand ${esc(folderLabel(node.path,spaces))}" aria-expanded="${expanded.has(node.path)}" data-toggle="${esc(node.path)}">${expanded.has(node.path) ? "▾" : "▸"}</button><button class="tree-folder" aria-expanded="${expanded.has(node.path)}" data-folder="${esc(node.path)}" title="${esc(node.path)}">${folderIcon}<span class="tree-folder-label">${esc(folderLabel(node.path,spaces))}</span><small title="Includes subfolders">${count(node)} notes</small></button></div>${expanded.has(node.path) ? `<ul>${treeHTML(node, expanded, selected, spaces, content)}</ul>` : ""}</li>`,
    )
    .join("");
}
export function projectHTML(
  root: Tree,
  expanded: Set<string>,
  selected: string | undefined,
  spaces: Space[] = [],
  content: Map<string,string> = new Map(),
): string {
  return spaces.map(space=>{let node:Tree|undefined=root;for(const part of (space.prefix+'Agent Memory').split('/'))node=node?.children.get(part);return [esc(space.name)+' projects',node];})
    .map(([label, node]) => {
      const memory = node as Tree | undefined;
      if (!memory) return "";
      const group: Tree = {
        name: "",
        path: "",
        file: false,
        children: new Map([...(memory.children.get("projects")?.children.values()||[])].map(n=>[n.path,n])),
      };
      const shared = memory.children.get("global");
      if (shared)
        group.children.set(shared.path, { ...shared, name: "Shared memory" });
      for(const extra of memory.children.values())if(extra.name!=="projects"&&extra.name!=="global")group.children.set(extra.path,extra);
      return `<li class="project-group"><h3>${label}</h3><ul>${treeHTML(group, expanded, selected, spaces, content)}</ul></li>`;
    })
    .join("");
}

export function ordinaryProjectHTML(root:Tree,paths:string[],expanded:Set<string>,selected:string|undefined,spaces:Space[],content:Map<string,string>){
 const groups=new Map<string,{label:string;tree:Tree}>();
 for(const path of noteProjects(paths,spaces)){let node:Tree|undefined=root;for(const part of path.split('/'))node=node?.children.get(part);if(!node)continue;
  const space=location(path,spaces).space;const id=space?.id||'personal';
  const group=groups.get(id)||{label:(space?.name||'Personal')+' projects',tree:{name:'',path:'',file:false,children:new Map()}};group.tree.children.set(path,node);groups.set(id,group);
 }
 return [...groups.values()].map(g=>`<li class="project-group"><h3>${esc(g.label)}</h3><ul>${treeHTML(g.tree,expanded,selected,spaces,content)}</ul></li>`).join('')||'<li class="list-empty">No project folders in this space. Use Folders for loose notes.</li>';
}

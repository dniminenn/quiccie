export interface Space {id:string;name:string;prefix:string;shared_project:string}
export const defaultSpaces:Space[]=[{id:'personal',name:'Personal',prefix:'',shared_project:'global'},{id:'work',name:'Work',prefix:'Work/',shared_project:'work'}];
let catalog=defaultSpaces;
export function setSpaceCatalog(spaces:Space[]){catalog=spaces;}
export function pathSpaceInfo(path:string){return catalog.filter(s=>s.prefix&&path.startsWith(s.prefix)).sort((a,b)=>b.prefix.length-a.prefix.length)[0]??(path.startsWith('Spaces/')?undefined:catalog.find(s=>!s.prefix));}
export function pathSpace(path:string){return pathSpaceInfo(path)?.id||'';}

import { syncState, type SyncState } from './sync';
export const syncDialog = `<dialog id="sync-dialog" class="sync-dialog" aria-labelledby="sync-title"><div class="sheet-title"><h2 id="sync-title">Sync</h2><button id="sync-close" aria-label="Close sync panel">×</button></div><div class="sync-summary"><strong id="sync-heading"></strong><p id="sync-description"></p></div><dl><div><dt>Last successful sync</dt><dd id="sync-last"></dd></div><div><dt>Waiting on this device</dt><dd id="sync-pending"></dd></div><div><dt>Notes to review</dt><dd id="sync-conflicts"></dd></div><div><dt>Server</dt><dd>${location.host}</dd></div></dl><button id="sync-action" class="primary">Check now</button></dialog>`;
export function statusLabel(s: SyncState) {
 if(s.local==='failed'||s.phase==='storage')return 'Not saved · Device storage error';
 if(s.local==='saving')return 'Saving on this device…';
 const waiting=`${s.pending} ${s.pending===1?'change':'changes'} waiting`;
 switch(s.phase){
 case 'sending':return 'Syncing · Sending changes';
 case 'receiving':return 'Syncing · Receiving changes';
 case 'pending':return 'Saved locally · '+waiting;
 case 'offline':return 'Offline · '+waiting;
 case 'error':return 'Sync failed · '+waiting;
 case 'auth':return 'Sign in to sync · '+waiting;
 case 'conflict':return `Review needed · ${s.conflicts} ${s.conflicts===1?'note':'notes'}`;
 case 'synced':return 'Up to date · Checked '+(s.lastSuccess?new Date(s.lastSuccess).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'never');
 default:return 'Not checked · Open sync details';
 }
}
export function paintSync(s=syncState){
 const label=statusLabel(s);
 document.querySelectorAll<HTMLElement>('[data-sync-label]').forEach(el=>el.textContent=label);
 document.querySelectorAll<HTMLElement>('[data-sync-open]').forEach(el=>{el.dataset.phase=s.phase;el.setAttribute('aria-label','Sync status: '+label);});
 const q=(id:string)=>document.querySelector<HTMLElement>(id);
 if(!q('#sync-heading'))return;
 q('#sync-heading')!.textContent=label;
 q('#sync-description')!.textContent=s.local==='failed'||s.phase==='storage'?'Keep this page open. Retry the local save before leaving.':s.phase==='auth'?'Sign in again. Your local notes remain available.':s.conflicts?'Both versions remain saved. Review the conflicting notes.':s.phase==='synced'?'This device and the server have the same changes.':s.phase==='error'?'Cannot complete sync. Check the connection and try again.':'Your saved notes remain available on this device.';
 q('#sync-last')!.textContent=s.lastSuccess?new Date(s.lastSuccess).toLocaleString():'Never';
 q('#sync-pending')!.textContent=String(s.pending);
 q('#sync-conflicts')!.textContent=String(s.conflicts);
 const action=q('#sync-action') as HTMLButtonElement;
 action.disabled=['sending','receiving'].includes(s.phase);
 action.textContent=action.disabled?'Sync in progress':s.local==='failed'||s.phase==='storage'?'Retry save':s.phase==='auth'?'Sign in':s.conflicts?'Review versions':['error','offline'].includes(s.phase)?'Retry sync':s.pending?'Sync now':'Check now';
 const settings=q('#phone-sync-status');if(settings)settings.textContent=label;
}

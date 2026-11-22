import type {MidiSession} from './midi';
const DB='piano-roll-coaster',STORE='sessions';
function open():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function request<T>(mode:IDBTransactionMode,fn:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,mode),r=fn(tx.objectStore(STORE));r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();});}
export async function saveSession(s:MidiSession){await request('readwrite',store=>store.put(s));}
export async function loadSessions(){return (await request<MidiSession[]>('readonly',store=>store.getAll())).sort((a,b)=>b.created-a.created);}
export async function deleteSession(id:string){await request('readwrite',store=>store.delete(id));}

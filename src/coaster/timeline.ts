import type {MidiSession,MidiEvent} from './midi';
export function transpose(session:MidiSession,semitones:number):MidiSession{
 const events=session.events.map((event):MidiEvent=>{const command=event.data[0]&0xf0;if((command===0x90||command===0x80)&&event.data.length>=3){const note=Math.max(21,Math.min(108,event.data[1]+semitones));return {...event,data:[event.data[0],note,...event.data.slice(2)]};}return {...event,data:[...event.data]};});
 return {...session,id:crypto.randomUUID(),created:Date.now(),name:session.name+' ('+(semitones>0?'+':'')+semitones+' demi-tons)',events};
}
export function trimSession(session:MidiSession,start:number,end:number):MidiSession{
 const from=Math.max(0,Math.min(start,session.duration)),to=Math.max(from,Math.min(end,session.duration));
 const events=session.events.filter(e=>e.t>=from&&e.t<=to).map(e=>({...e,t:e.t-from,data:[...e.data]}));
 return {...session,id:crypto.randomUUID(),created:Date.now(),name:session.name+' (extrait)',duration:to-from,events};
}

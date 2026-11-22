export type MidiEvent = {t:number;data:number[]};
export type MidiSession = {id:string;name:string;created:number;duration:number;events:MidiEvent[];seed:number};
export class CoasterMidi {
 access:MIDIAccess|null=null;
 inputId='';outputId='';onEvent:(data:number[],t:number)=>void=()=>{};
 async connect(){
  if(!navigator.requestMIDIAccess)throw Error('Web MIDI indisponible sur ce navigateur');
  this.access=await navigator.requestMIDIAccess({sysex:false});
  this.access.onstatechange=()=>this.bind();
  this.bind();
 }
 get inputs(){return [...(this.access?.inputs.values()||[])].map(d=>({id:d.id,name:d.name||'MIDI IN'}));}
 get outputs(){return [...(this.access?.outputs.values()||[])].map(d=>({id:d.id,name:d.name||'MIDI OUT'}));}
 selectInput(id:string){this.inputId=id;this.bind();}
 selectOutput(id:string){this.outputId=id;}
 private bind(){
  if(!this.access)return;
  for(const i of this.access.inputs.values())i.onmidimessage=null;
  if(!this.inputs.some(i=>i.id===this.inputId))this.inputId=this.inputs[0]?.id||'';
  if(!this.outputs.some(i=>i.id===this.outputId))this.outputId=this.outputs[0]?.id||'';
  const input=this.access.inputs.get(this.inputId);
  if(input)input.onmidimessage=e=>{if(e.data)this.onEvent([...e.data],performance.now());};
 }
 get output(){return this.access?.outputs.get(this.outputId)||null;}
 send(data:number[],when?:number){const o=this.output;if(!o)throw Error('Aucune sortie MIDI sélectionnée');o.send(data,when);}
 panic(){
  const o=this.output;if(!o)return;
  o.clear();
  for(let ch=0;ch<16;ch++){o.send([0xb0|ch,64,0]);o.send([0xb0|ch,123,0]);o.send([0xb0|ch,120,0]);}
 }
 disconnect(){this.panic();if(this.access){this.access.onstatechange=null;for(const i of this.access.inputs.values())i.onmidimessage=null;}this.access=null;}
}
export class MidiRecorder {
 private startTime=0;private events:MidiEvent[]=[];recording=false;
 start(){this.startTime=performance.now();this.events=[];this.recording=true;}
 push(data:number[],now=performance.now()){if(this.recording)this.events.push({t:Math.max(0,now-this.startTime),data:[...data]});}
 stop():MidiSession{this.recording=false;const duration=Math.max(0,performance.now()-this.startTime);return {id:crypto.randomUUID(),name:'Voyage '+new Date().toLocaleString('fr-FR'),created:Date.now(),duration,events:this.events.slice(),seed:Math.floor(Math.random()*4294967295)};}
}
export class MidiPlayer {
 private timers:number[]=[];private midi:CoasterMidi;playing=false;
 constructor(midi:CoasterMidi){this.midi=midi;}
 play(session:MidiSession,onFinish:()=>void=()=>{}){
  if(!this.midi.output)throw Error('Sortie MIDI non connectée');
  this.stop();this.playing=true;
  const start=performance.now()+350;
  for(const event of session.events){
   const status=event.data[0]&0xf0;
   if(status===0xf0)continue;
   this.midi.send(event.data,start+event.t);
  }
  this.timers.push(window.setTimeout(()=>{this.playing=false;onFinish();},Math.max(0,session.duration)+450));
 }
 stop(){this.timers.forEach(clearTimeout);this.timers=[];this.midi.panic();this.playing=false;}
}

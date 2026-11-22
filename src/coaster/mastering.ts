export type MasterSettings={warmth:number;presence:number;reverb:number;gain:number};
export const defaultMaster:MasterSettings={warmth:20,presence:15,reverb:12,gain:90};
export async function masterAudio(blob:Blob,settings:MasterSettings):Promise<Blob>{
 const buffer=await blob.arrayBuffer();
 const decode=new AudioContext();
 let source:AudioBuffer;
 try{source=await decode.decodeAudioData(buffer);}finally{await decode.close();}
 const rate=source.sampleRate;
 const context=new OfflineAudioContext(Math.min(2,source.numberOfChannels),Math.ceil((source.duration+Math.min(2,settings.reverb/100*2))*rate),rate);
 const input=context.createBufferSource();input.buffer=source;
 const warmth=context.createBiquadFilter();warmth.type='lowshelf';warmth.frequency.value=240;warmth.gain.value=settings.warmth/10;
 const presence=context.createBiquadFilter();presence.type='peaking';presence.frequency.value=3000;presence.Q.value=.8;presence.gain.value=settings.presence/10;
 const compressor=context.createDynamicsCompressor();compressor.threshold.value=-15;compressor.knee.value=12;compressor.ratio.value=2;compressor.attack.value=.008;compressor.release.value=.25;
 const gain=context.createGain();gain.gain.value=settings.gain/100;
 input.connect(warmth);warmth.connect(presence);presence.connect(compressor);compressor.connect(gain);gain.connect(context.destination);
 if(settings.reverb>0){
  const delay=context.createDelay(1);delay.delayTime.value=.095;
  const feedback=context.createGain();feedback.gain.value=Math.min(.45,settings.reverb/230);
  const wet=context.createGain();wet.gain.value=settings.reverb/200;
  presence.connect(delay);delay.connect(feedback);feedback.connect(delay);delay.connect(wet);wet.connect(gain);
 }
 input.start(0);
 const rendered=await context.startRendering();
 return encodeWav(rendered);
}
export function encodeWav(buffer:AudioBuffer):Blob{
 const channels=buffer.numberOfChannels,length=buffer.length,bytes=44+length*channels*2;
 const array=new ArrayBuffer(bytes),view=new DataView(array);let offset=0;
 const str=(s:string)=>{for(let i=0;i<s.length;i++)view.setUint8(offset++,s.charCodeAt(i));};
 const u16=(n:number)=>{view.setUint16(offset,n,true);offset+=2;};
 const u32=(n:number)=>{view.setUint32(offset,n,true);offset+=4;};
 str('RIFF');u32(bytes-8);str('WAVE');str('fmt ');u32(16);u16(1);u16(channels);u32(buffer.sampleRate);u32(buffer.sampleRate*channels*2);u16(channels*2);u16(16);str('data');u32(length*channels*2);
 for(let i=0;i<length;i++)for(let ch=0;ch<channels;ch++){const sample=Math.max(-1,Math.min(1,buffer.getChannelData(ch)[i]));view.setInt16(offset,sample<0?sample*32768:sample*32767,true);offset+=2;}
 return new Blob([array],{type:'audio/wav'});
}

export type VideoOptions={fps:number;duration:number;audio?:Blob|null;onProgress?:(value:number)=>void};
export async function recordVideo(canvas:HTMLCanvasElement,play:()=>void,stop:()=>void,options:VideoOptions):Promise<Blob>{
 if(!canvas.captureStream||typeof MediaRecorder==='undefined')throw Error('Capture vidéo non disponible sur ce navigateur');
 const type=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
 if(!type)throw Error('Encodage WebM non disponible');
 const stream=canvas.captureStream(options.fps);
 let context:AudioContext|null=null;
 if(options.audio){
  context=new AudioContext();const array=await options.audio.arrayBuffer();const decoded=await context.decodeAudioData(array);
  const source=context.createBufferSource();source.buffer=decoded;
  const destination=context.createMediaStreamDestination();source.connect(destination);
  destination.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
  source.start();
 }
 const chunks:Blob[]=[];const recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:4500000});
 const finished=new Promise<Blob>((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onerror=()=>reject(Error('Erreur export vidéo'));recorder.onstop=()=>resolve(new Blob(chunks,{type}));});
 recorder.start(500);play();
 const begin=performance.now();
 try{
  await new Promise<void>(resolve=>{const tick=()=>{const elapsed=performance.now()-begin;options.onProgress?.(Math.min(100,Math.round(elapsed/options.duration*100)));if(elapsed>=options.duration)resolve();else setTimeout(tick,150);};tick();});
  stop();recorder.stop();const result=await finished;return result;
 }finally{stream.getTracks().forEach(t=>t.stop());if(context)await context.close();}
}

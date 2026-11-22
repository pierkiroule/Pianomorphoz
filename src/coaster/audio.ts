export type AudioDevice={id:string;name:string};
export class UsbAudioCapture {
 private stream:MediaStream|null=null;private recorder:MediaRecorder|null=null;private chunks:Blob[]=[];
 async devices():Promise<AudioDevice[]>{
  if(!navigator.mediaDevices?.enumerateDevices)throw Error('Capture audio indisponible');
  return (await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput').map(d=>({id:d.deviceId,name:d.label||'Entrée audio'}));
 }
 async start(deviceId:string){
  if(this.recorder)throw Error('Capture déjà active');
  this.stream=await navigator.mediaDevices.getUserMedia({audio:{deviceId:deviceId?{exact:deviceId}:undefined,channelCount:{ideal:2},echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
  const format=['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(t=>MediaRecorder.isTypeSupported(t));
  if(!format){this.stream.getTracks().forEach(t=>t.stop());this.stream=null;throw Error('Encodeur audio non disponible');}
  this.chunks=[];
  this.recorder=new MediaRecorder(this.stream,{mimeType:format,audioBitsPerSecond:192000});
  this.recorder.ondataavailable=e=>{if(e.data.size)this.chunks.push(e.data);};
  this.recorder.start(1000);
 }
 stop():Promise<Blob>{
  const recorder=this.recorder;
  if(!recorder)throw Error('Aucun enregistrement audio en cours');
  return new Promise((resolve,reject)=>{
   recorder.onerror=()=>reject(Error('Erreur de capture audio'));
   recorder.onstop=()=>{const blob=new Blob(this.chunks,{type:recorder.mimeType});this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.recorder=null;this.chunks=[];resolve(blob);};
   recorder.stop();
  });
 }
 abort(){if(this.recorder?.state==='recording')this.recorder.stop();this.stream?.getTracks().forEach(t=>t.stop());}
}

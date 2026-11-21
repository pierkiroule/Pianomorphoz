export type PianoFx={reverb:number;width:number;warmth:number;presence:number;output:number;monitor:boolean};
export const defaultPianoFx:PianoFx={reverb:22,width:115,warmth:30,presence:35,output:85,monitor:false};
export type AudioBands={low:number;mid:number;high:number;level:number;transient:number};
export class AudioEngine{
 context:AudioContext|null=null;analyser:AnalyserNode|null=null;source:AudioNode|null=null;
 stream:MediaStream|null=null;destination:MediaStreamAudioDestinationNode|null=null;
 player:HTMLAudioElement|null=null;private fileUrl:string|null=null;
 private low: BiquadFilterNode|null=null;private presence:BiquadFilterNode|null=null;
 private compressor:DynamicsCompressorNode|null=null;private dry:GainNode|null=null;
 private wet:GainNode|null=null;private convolver:ConvolverNode|null=null;
 private output:GainNode|null=null;private monitor:GainNode|null=null;
 private splitter:ChannelSplitterNode|null=null;private merger:ChannelMergerNode|null=null;
 private midGain:GainNode|null=null;private sideGain:GainNode|null=null;
 private midL:GainNode|null=null;private midR:GainNode|null=null;
 private sideL:GainNode|null=null;private sideR:GainNode|null=null;
 private fx:PianoFx={...defaultPianoFx};private lastLevel=0;
 async init(){
  this.context??=new AudioContext();await this.context.resume();
  if(this.analyser)return;
  const c=this.context;
  this.analyser=c.createAnalyser();this.analyser.fftSize=2048;this.analyser.smoothingTimeConstant=.7;
  this.destination=c.createMediaStreamDestination();
  this.low=c.createBiquadFilter();this.low.type='lowshelf';this.low.frequency.value=220;
  this.presence=c.createBiquadFilter();this.presence.type='peaking';this.presence.frequency.value=2700;this.presence.Q.value=.65;
  this.compressor=c.createDynamicsCompressor();this.compressor.threshold.value=-16;this.compressor.knee.value=14;this.compressor.ratio.value=2;this.compressor.attack.value=.008;this.compressor.release.value=.24;
  this.dry=c.createGain();this.wet=c.createGain();this.convolver=c.createConvolver();
  this.convolver.buffer=this.impulse(c);
  this.output=c.createGain();this.monitor=c.createGain();
  this.splitter=c.createChannelSplitter(2);this.merger=c.createChannelMerger(2);
  this.midGain=c.createGain();this.sideGain=c.createGain();
  this.midL=c.createGain();this.midR=c.createGain();this.sideL=c.createGain();this.sideR=c.createGain();
  // Mid/side matrix: L=(L+R)/2 + width*(L-R)/2; R=(L+R)/2 - width*(L-R)/2.
  const inputL=c.createGain(),inputR=c.createGain(),invR=c.createGain(),invSide=c.createGain();
  inputL.gain.value=.5;inputR.gain.value=.5;invR.gain.value=-.5;invSide.gain.value=-1;
  this.low.connect(this.presence);this.presence.connect(this.compressor);
  this.compressor.connect(this.dry);this.compressor.connect(this.convolver);
  this.convolver.connect(this.wet);
  this.dry.connect(this.output);this.wet.connect(this.output);
  this.output.connect(this.analyser);this.analyser.connect(this.destination);
  this.output.connect(this.monitor);this.monitor.connect(c.destination);
  // Width processing after the dynamics stage, before dry/wet summing.
  this.compressor.disconnect(this.dry);this.compressor.disconnect(this.convolver);
  this.compressor.connect(this.splitter);
  this.splitter.connect(inputL,0);this.splitter.connect(inputR,1);
  this.splitter.connect(invR,1);
  inputL.connect(this.midGain);inputR.connect(this.midGain);
  inputL.connect(this.sideGain);invR.connect(this.sideGain);
  this.midGain.connect(this.midL);this.midGain.connect(this.midR);
  this.sideGain.connect(this.sideL);this.sideGain.connect(invSide);invSide.connect(this.sideR);
  this.midL.connect(this.merger,0,0);this.sideL.connect(this.merger,0,0);
  this.midR.connect(this.merger,0,1);this.sideR.connect(this.merger,0,1);
  this.merger.connect(this.dry);this.merger.connect(this.convolver);
  this.setFx(this.fx);
 }
 private impulse(c:AudioContext){
  const length=Math.floor(c.sampleRate*2.4),b=c.createBuffer(2,length,c.sampleRate);
  for(let ch=0;ch<2;ch++){const a=b.getChannelData(ch);let seed=ch?919:117;
   for(let i=0;i<length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const t=i/c.sampleRate;a[i]=((seed/4294967296)*2-1)*Math.pow(1-t/2.4,2.4)*(.6+.4*Math.sin(i*.013+ch));}}
  return b;
 }
 setFx(next:Partial<PianoFx>){
  this.fx={...this.fx,...next};if(!this.context)return;
  const t=this.context.currentTime;
  this.low?.gain.setTargetAtTime((this.fx.warmth-30)*.12,t,.04);
  this.presence?.gain.setTargetAtTime((this.fx.presence-35)*.1,t,.04);
  this.sideGain?.gain.setTargetAtTime(this.fx.width/100,t,.04);
  this.dry?.gain.setTargetAtTime(1,t,.04);
  this.wet?.gain.setTargetAtTime(this.fx.reverb/100*.45,t,.04);
  this.output?.gain.setTargetAtTime(this.fx.output/100,t,.04);
  this.monitor?.gain.setTargetAtTime(this.fx.monitor?1:0,t,.02);
 }
 private detach(){
  this.source?.disconnect();this.source=null;
  this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;
  if(this.player){this.player.pause();this.player.src='';this.player=null;}
  if(this.fileUrl){URL.revokeObjectURL(this.fileUrl);this.fileUrl=null;}
 }
 async microphone(deviceId?:string){
  await this.init();this.detach();
  this.stream=await navigator.mediaDevices.getUserMedia({audio:{deviceId:deviceId?{exact:deviceId}:undefined,channelCount:2,echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
  this.source=this.context!.createMediaStreamSource(this.stream);this.source.connect(this.low!);
  this.setFx({monitor:false});
 }
 async devices(){await this.init();return(await navigator.mediaDevices.enumerateDevices()).filter(x=>x.kind==='audioinput');}
 async file(file:File){
  await this.init();this.detach();this.player=new Audio();this.fileUrl=URL.createObjectURL(file);
  this.player.src=this.fileUrl;this.player.controls=true;
  this.source=this.context!.createMediaElementSource(this.player);this.source.connect(this.low!);
  this.setFx({monitor:true});await this.player.play();
 }
 bands():AudioBands{
  if(!this.analyser||!this.context)return {low:0,mid:0,high:0,level:0,transient:0};
  const a=new Uint8Array(this.analyser.frequencyBinCount);this.analyser.getByteFrequencyData(a);
  const hz=this.context.sampleRate/this.analyser.fftSize;
  const band=(from:number,to:number)=>{const start=Math.max(0,Math.floor(from/hz)),end=Math.min(a.length,Math.ceil(to/hz));let sum=0;
   for(let i=start;i<end;i++)sum+=a[i]*a[i];return Math.sqrt(sum/Math.max(1,end-start))/255;};
  const low=band(35,240),mid=band(240,2000),high=band(2000,9000);
  const level=Math.min(1,low*.35+mid*.45+high*.2);
  const transient=Math.max(0,level-this.lastLevel);this.lastLevel=this.lastLevel*.75+level*.25;
  return {low,mid,high,level,transient};
 }
 level(){return this.bands().level;}
 stop(){this.detach();this.analyser?.disconnect();this.analyser=null;this.destination=null;void this.context?.close();this.context=null;}
}
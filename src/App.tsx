import {useEffect,useRef,useState} from 'react';
import {CoasterMidi,MidiPlayer,MidiRecorder} from './coaster/midi';
import type {MidiSession} from './coaster/midi';
import {UsbAudioCapture} from './coaster/audio';
import {FiberCoaster} from './coaster/visual';
import {saveSession,loadSessions,deleteSession} from './coaster/storage';
import './coaster.css';
type Tab='jouer'|'sculpter'|'produire';
export default function App(){
 const canvas=useRef<HTMLCanvasElement>(null),visual=useRef<FiberCoaster|null>(null),midi=useRef(new CoasterMidi()),recorder=useRef(new MidiRecorder()),player=useRef(new MidiPlayer(midi.current)),audio=useRef(new UsbAudioCapture());
 const [tab,setTab]=useState<Tab>('jouer'),[status,setStatus]=useState('Connecter le Yamaha'),[connected,setConnected]=useState(false);
 const [inputs,setInputs]=useState<{id:string;name:string}[]>([]),[outputs,setOutputs]=useState<{id:string;name:string}[]>([]),[input,setInput]=useState(''),[output,setOutput]=useState('');
 const [devices,setDevices]=useState<{id:string;name:string}[]>([]),[device,setDevice]=useState('');
 const [sessions,setSessions]=useState<MidiSession[]>([]),[session,setSession]=useState<MidiSession|null>(null),[recording,setRecording]=useState(false),[replaying,setReplaying]=useState(false),[capturing,setCapturing]=useState(false),[position,setPosition]=useState(0),[audioBlob,setAudioBlob]=useState<Blob|null>(null),[audioUrl,setAudioUrl]=useState('');
 const [error,setError]=useState('');const tail=useRef<number|null>(null);
 const refresh=async()=>setSessions(await loadSessions());
 useEffect(()=>{if(!canvas.current)return;const v=new FiberCoaster(canvas.current);visual.current=v;const resize=()=>v.resize();addEventListener('resize',resize);void refresh().catch(e=>setError(String(e)));return()=>{removeEventListener('resize',resize);v.destroy();visual.current=null;player.current.stop();midi.current.disconnect();audio.current.abort();if(tail.current)clearTimeout(tail.current);};},[]);
 useEffect(()=>{midi.current.onEvent=(data,now)=>{recorder.current.push(data,now);if(!session||recording)visual.current?.note(data);};},[recording,session]);
 useEffect(()=>()=>{if(audioUrl)URL.revokeObjectURL(audioUrl);},[audioUrl]);
 function choose(s:MidiSession){player.current.stop();setReplaying(false);setSession(s);visual.current?.setSession(s);setPosition(0);setTab('sculpter');}
 async function connect(){try{setError('');await midi.current.connect();const ins=midi.current.inputs,outs=midi.current.outputs;setInputs(ins);setOutputs(outs);setInput(midi.current.inputId);setOutput(midi.current.outputId);setConnected(true);setStatus('MIDI connecté');}catch(e){setError(String(e));}}
 async function scanAudio(){try{setError('');const d=await audio.current.devices();setDevices(d);if(d.length&&!device)setDevice(d[0].id);if(!d.length)setError('Aucune entrée audio disponible');}catch(e){setError(String(e));}}
 function startRecord(){if(!connected){setError('Connecter le MIDI avant d’enregistrer');return;}player.current.stop();visual.current?.setSession(null);recorder.current.start();setRecording(true);setStatus('Enregistrement MIDI en cours');setError('');}
 async function stopRecord(){const s=recorder.current.stop();setRecording(false);if(!s.events.length){setStatus('Aucune note capturée');return;}await saveSession(s);await refresh();choose(s);setStatus(s.events.length+' événements MIDI enregistrés');}
 function preview(){if(!session)return;visual.current?.seek(position);visual.current?.play();setStatus('Prévisualisation visuelle');}
 function pause(){visual.current?.pause();}
 function seek(value:number){setPosition(value);visual.current?.seek(value);}
 async function capture(){
  if(!session)return;
  if(!midi.current.output){setError('Sélectionner une sortie MIDI');return;}
  if(!device){setError('Choisir l’entrée audio USB du Yamaha');return;}
  try{
   setError('');setTab('produire');setStatus('Ouverture de la capture audio USB…');
   await audio.current.start(device);setCapturing(true);setReplaying(true);
   visual.current?.seek(0);visual.current?.play();
   player.current.play(session,()=>{
    setReplaying(false);setStatus('Capture des résonances finales…');
    tail.current=window.setTimeout(async()=>{try{const blob=await audio.current.stop();setAudioBlob(blob);setAudioUrl(URL.createObjectURL(blob));setStatus('Audio Yamaha capturé — prêt pour écoute');}catch(e){setError(String(e));}finally{setCapturing(false);}},3500);
   });
   setStatus('Le Yamaha rejoue le MIDI — capture audio active');
  }catch(e){setError(String(e));setCapturing(false);setReplaying(false);player.current.stop();}
 }
 async function stopAll(){player.current.stop();visual.current?.pause();setReplaying(false);if(tail.current)clearTimeout(tail.current);tail.current=null;if(capturing){try{const blob=await audio.current.stop();setAudioBlob(blob);setAudioUrl(URL.createObjectURL(blob));}catch(e){setError(String(e));}setCapturing(false);}setStatus('Arrêt sécurisé');}
 function downloadAudio(){if(!audioBlob)return;const url=URL.createObjectURL(audioBlob),a=document.createElement('a');a.href=url;a.download='piano-roll-coaster-yamaha.'+(audioBlob.type.includes('mp4')?'m4a':'webm');a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
 function downloadMidi(){if(!session)return;const blob=new Blob([JSON.stringify(session,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='piano-roll-coaster-session.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
 return <main className="coaster"><canvas ref={canvas} className="coaster-stage"/><header className="coaster-header"><div><strong>Piano Roll Coaster <span>•°</span></strong><small>Le grand huit contemplatif de la musique</small></div><span className="coaster-status">{status}</span></header>
 <nav className="coaster-nav">{(['jouer','sculpter','produire'] as Tab[]).map((v,i)=><button key={v} className={tab===v?'selected':''} onClick={()=>setTab(v)}>{i+1}. {v[0].toUpperCase()+v.slice(1)}</button>)}</nav>
 <section className="coaster-panel">
 {tab==='jouer'&&<><h2>Jouer</h2><p>Connecter le Yamaha en USB. Le mobile enregistre les événements MIDI, sans capturer de vidéo.</p><button className="primary" onClick={()=>void connect()}>{connected?'Reconnecter MIDI':'Connecter MIDI'}</button>
 {connected&&<><label>Entrée MIDI<select value={input} onChange={e=>{setInput(e.target.value);midi.current.selectInput(e.target.value);}}>{inputs.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label>Sortie MIDI<select value={output} onChange={e=>{setOutput(e.target.value);midi.current.selectOutput(e.target.value);}}>{outputs.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label></>}
 <div className="coaster-actions">{recording?<button className="primary" onClick={()=>void stopRecord()}>■ Terminer la prise</button>:<button className="primary" disabled={!connected} onClick={startRecord}>● Enregistrer le MIDI</button>}</div>
 <h3>Mes voyages</h3>{sessions.length===0?<p>Aucune session enregistrée.</p>:sessions.map(s=><div className="coaster-session" key={s.id}><button onClick={()=>choose(s)}>{s.name}<small>{(s.duration/1000).toFixed(1)} s · {s.events.length} événements</small></button><button aria-label="Supprimer" onClick={()=>void deleteSession(s.id).then(refresh)}>×</button></div>)}</>}
 {tab==='sculpter'&&<><h2>Sculpter</h2>{!session?<p>Enregistrer ou choisir une session MIDI dans Jouer.</p>:<><p>{session.name} · {(session.duration/1000).toFixed(1)} secondes</p><label>Timeline <span>{(position/1000).toFixed(1)} s</span><input type="range" min="0" max={session.duration} step="100" value={position} onChange={e=>seek(Number(e.target.value))}/></label><div className="coaster-actions"><button onClick={preview}>▶ Prévisualiser</button><button onClick={pause}>Ⅱ Pause</button><button onClick={downloadMidi}>Exporter la session JSON</button></div><p>Le tunnel utilise les 88 notes du piano. La relecture MIDI pilote les fibres et la caméra FPV.</p><button className="primary" onClick={()=>setTab('produire')}>Produire le son Yamaha →</button></>}</>}
 {tab==='produire'&&<><h2>Produire</h2><p>Le mobile renvoie la performance MIDI au piano. Le Yamaha génère son propre son, capturé par USB audio sans retour vers les enceintes.</p><button onClick={()=>void scanAudio()}>Détecter les entrées audio</button>{devices.length>0&&<label>Entrée audio Yamaha<select value={device} onChange={e=>setDevice(e.target.value)}><option value="">Choisir une entrée</option>{devices.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>}
 <div className="coaster-actions"><button className="primary" disabled={!session||!connected||!device||capturing} onClick={()=>void capture()}>▶ Rejouer MIDI + enregistrer USB</button><button onClick={()=>void stopAll()} disabled={!capturing&&!replaying}>■ STOP / PANIC</button></div>
 {audioUrl&&<><h3>Prise audio Yamaha</h3><audio controls src={audioUrl}/><button onClick={downloadAudio}>Télécharger l'audio original</button></>}
 <p className="coaster-note">Mastering hors ligne et export vidéo différé : prochaines étapes. Cette version valide d'abord le circuit MIDI IN → MIDI OUT → audio USB sur Android.</p></>}
 {error&&<p className="coaster-error" role="alert">{error}</p>}
 </section></main>;
}

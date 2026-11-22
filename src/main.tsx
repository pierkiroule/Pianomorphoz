import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import AquarelleVivante from './AquarelleVivante';
import './styles.css';

const params=new URLSearchParams(window.location.search);
const legacy=params.has('studio')||params.has('legacy');
createRoot(document.getElementById('root')!).render(
 <React.StrictMode>{legacy?<App/>:<AquarelleVivante/>}</React.StrictMode>
);

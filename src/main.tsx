import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import AquarelleVivante from './AquarelleVivante';
import './styles.css';
const params=new URLSearchParams(window.location.search);
createRoot(document.getElementById('root')!).render(<React.StrictMode>{params.has('aquarelle')?<AquarelleVivante/>:<App/>}</React.StrictMode>);

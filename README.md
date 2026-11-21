# Sonomorphoz •°

**Donnez une forme vivante à vos sons.**

PWA mobile-first en **React 19 + Vite 6 + TypeScript**, moteur Canvas 2D modulaire.

## Démarrer

```bash
npm install
npm run dev
npm run build
```

Déployer sur Vercel : framework Vite, build `npm run build`, dossier `dist`.

## Modules

- `src/engine/visual.ts` : quatre univers picturaux, caméra, palette, post-FX.
- `src/engine/audio.ts` : microphone, entrées audio, fichiers, Web Audio API, sans retour micro.
- `src/engine/midi.ts` : Web MIDI, vélocité, notes, pédale.
- `src/storage/presets.ts` : sauvegarde locale et export JSON.
- `src/App.tsx` : interface Jouer / Créer / Galerie, capture PNG, enregistrement vidéo.
- `vite-plugin-pwa` : manifest et service worker générés.

## Limitations

Web MIDI dépend du navigateur et du matériel. La captation audio USB dépend de l'OS. L'analyse audio actuelle utilise l'énergie spectrale, sans reconnaissance fine des notes. Les médias importés ne sont pas sauvegardés. La vidéo dépend des codecs MediaRecorder du navigateur. Les presets sont stockés en localStorage. Aucun serveur ni compte. Tester sur les appareils cibles avant de qualifier la PWA de prête pour la production.

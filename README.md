# Sonomorphoz •°

**Donnez une forme vivante à vos sons.**

Application mobile-first de synthèse picturale audiovisuelle, sans backend ni compte.

## Utilisation

Ouvrir l'application dans Chrome ou Edge sur HTTPS. Appuyer sur **Jouer** pour choisir une source : microphone, piano USB MIDI (si Web MIDI disponible), entrée audio ou fichier audio. **Créer** propose quatre Morphoz (encre, géométrie, aquarelle, filaments), palettes personnalisées, densité, intensité, liberté, caméra, effets et image/vidéo de fond. **Galerie** sauvegarde les presets dans le navigateur.

## Déploiement

Site statique : déployer la racine du dépôt sur Vercel (Framework Preset: Other, Output Directory: vide) ou GitHub Pages. Le service worker nécessite HTTPS ou localhost. Aucun build requis.

## Limitations connues

- L'USB MIDI dépend du navigateur, des permissions et du périphérique ; iOS Safari ne prend pas en charge Web MIDI de manière générale.
- Les entrées USB audio ne sont disponibles que si le navigateur les expose comme périphériques d'entrée.
- La réactivité audio actuelle repose sur l'énergie spectrale globale ; détection de hauteur et timbre avancée à développer.
- Les presets sont stockés dans localStorage. Les médias importés ne sont pas persistés.
- L'enregistrement est limité aux codecs pris en charge par MediaRecorder et à la capture Canvas ; la piste audio dépend de la source connectée.
- Les post-FX sont des effets légers Canvas, pas encore des shaders GPU.
- Le traitement sonore en sortie (réverbération, delay, etc.) n'est pas encore implémenté.

## Licence

Aucune licence déclarée à ce stade.

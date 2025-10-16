# BeaverKiosk Reference

## Vision
BeaverKiosk est une application kiosque moderne qui regroupe deux services phares : **BeaverPhone** pour la téléphonie locale et **BeaverNet.ca** pour les services infonuagiques. L'expérience est pensée pour des écrans tactiles grand public qui doivent rester disponibles hors connexion tout en conservant une charte visuelle chaleureuse inspirée des couleurs orangées de la marque.【F:README.md†L1-L27】

## Démarrage rapide
1. Installer les dépendances avec `npm install`.
2. Lancer l'application Electron via `npm start`.
3. Le processus principal démarre un serveur HTTP sur `http://127.0.0.1:5000` et charge automatiquement la page `page/menu.html` dans la fenêtre Electron.【F:README.md†L13-L27】【F:main.js†L18-L98】

## Structure des dossiers
- `page/` : toutes les interfaces utilisateur (menu, BeaverPhone, domotique, etc.).
- `main.js` : processus principal Electron, serveur de contenu HTTP, gestion des fenêtres et des cookies.
- `preload.js` : pont sécurisé pour l'UI et gestion WebSocket BeaverPhone.
- `docs/` : notes d'architecture (ex. double canal WebSocket).
- `icon/` et `contact/` : médias utilisés par les tuiles et les cartes contacts.【F:main.js†L18-L120】【F:docs/double-websocket.md†L1-L36】【F:page/menu.html†L1-L120】

## Liste des applications
- BeaverPhone (version finale)

## Scripts clés
### main.js
- Démarre un serveur de contenu qui distribue les fichiers statiques depuis `page/` et les dossiers médias, en sécurisant les accès (GET/HEAD uniquement, interdiction des traversées de répertoires).【F:main.js†L18-L120】
- Crée la fenêtre Electron principale, applique des raccourcis globaux et gère la persistance des cookies/sessions utilisateurs pour une expérience continue hors ligne.【F:main.js†L122-L279】

### preload.js
- Expose une API limitée (`goHome`, `getBatteryLevel`) à la fenêtre de rendu via `contextBridge`.
- Établit une connexion WebSocket BeaverPhone, relaie les événements du dialpad et envoie un ping keep-alive toutes les 30 s pour maintenir la session Termux ouverte.【F:preload.js†L1-L74】

## Intégration WebSocket BeaverPhone
- **URL** : `ws://192.168.1.60:5001` (serveur Termux local).
- **Cycle de vie** : lors de l'ouverture, l'UI reçoit l'événement `connected`; en cas de fermeture ou d'erreur, un statut `disconnected` est diffusé et une reconnexion est tentée après 5 s.【F:preload.js†L19-L63】【F:docs/double-websocket.md†L5-L24】
- **Événements émis** : `dial`, `hangup`, `dtmf`, `clear`, plus un ping automatique (`{ type: "ping" }`) pour maintenir la liaison active.【F:preload.js†L46-L74】
- **Propagation UI** : `preload.js` diffuse l'état via `beaverphone:ws-status`, et `page/beaverphone.html` met à jour l'indicateur de connexion pour informer l'utilisateur en temps réel.【F:preload.js†L9-L63】【F:page/beaverphone.html†L1044-L1100】

## Expérience utilisateur BeaverPhone
- Clavier numérique riche avec états (prêt, en appel, en attente) et actions principales (composer, raccrocher, haut-parleur, pause, réinitialisation) synchronisées avec les évènements WebSocket.【F:page/beaverphone.html†L400-L620】【F:page/beaverphone.html†L1101-L1196】
- Liste de contacts rapides configurable côté client, chaque carte déclenchant automatiquement une composition et la transmission WS correspondante.【F:page/beaverphone.html†L986-L1196】
- Interface bilingue (FR/EN) grâce à un dictionnaire embarqué et à un observateur `locale.subscribe` qui regénère dynamiquement les libellés.【F:page/beaverphone.html†L690-L960】【F:page/beaverphone.html†L1197-L1248】

## Menu principal et navigation
- `page/menu.html` présente des tuiles de services (BeaverPhone, BeaverNet, domotique, alarme) en grille responsive avec transitions inspirées des launchers Android. Chaque carte est une simple ancre vers la page HTML cible et peut être dupliquée pour ajouter de nouveaux services.【F:page/menu.html†L1-L220】【F:page/menu.html†L221-L400】
- Le composant de sélection de langue agit directement sur les contenus textuels via un dictionnaire `translations`, ce qui permet un fonctionnement hors ligne total.【F:page/menu.html†L120-L220】【F:page/menu.html†L400-L520】

## Design system et charte graphique
- **Typographie** : police principale `Inter` (fallback `Segoe UI`) sur l'ensemble des pages, assurant lisibilité et ton contemporain.【F:page/menu.html†L23-L72】【F:page/beaverphone.html†L17-L80】
- **Palette** : fond sombre dégradé (`#1e1e2f` → `#09090f`), accent orange `#f89422` et variantes (`#ff9f33`), complétées par des blancs adoucis pour les textes secondaires. Les panneaux utilisent des effets de flou et d'ombre pour renforcer la profondeur.【F:page/menu.html†L7-L120】【F:page/beaverphone.html†L7-L120】【F:page/home-automation.html†L7-L88】
- **Composants** : cartes carrées arrondies, boutons pill, indicateurs d'état `status-pill` et `ws-indicator` harmonisés sur des bordures translucides et des animations subtiles (`wsPulse`).【F:page/menu.html†L130-L220】【F:page/beaverphone.html†L200-L360】
- **Iconographie** : icônes vectorielles `svg` intégrées directement dans les boutons pour garantir un rendu net sur écrans haute densité; dossier `icon/` pour les logos haute résolution des applications.【F:page/menu.html†L221-L400】【F:page/beaverphone.html†L400-L560】

## Autres interfaces
- **BeaverHome (domotique)** : reprend la même charte, propose des cartes d'état, des interrupteurs et graphiques fictifs pour la gestion résidentielle. Sert de modèle pour d'autres services interactifs.【F:page/home-automation.html†L1-L200】
- **BeaverAlarm** : page d'alarme minimaliste pour la surveillance et les scénarios d'urgence, partageant le même squelette responsive.【F:page/beaveralarm.html†L1-L200】

## Bonnes pratiques d'extension
- Ajouter de nouveaux services en créant une page HTML dans `page/` et en ajoutant une tuile correspondante dans `menu.html`.
- Étendre la téléphonie en écoutant l'événement `beaverphone:dialpad` côté preload pour propager de nouvelles commandes Termux.
- Personnaliser les traductions en enrichissant les objets `translations` dans chaque page, ce qui permet d'ajouter des langues sans toucher au code de rendu.【F:page/menu.html†L400-L520】【F:page/beaverphone.html†L690-L960】

## Ressources complémentaires
- Documentation sur la double couche WebSocket et le serveur local dans `docs/double-websocket.md`.
- Icônes et images contacts dans `icon/` et `contact/`, prêts pour des déclinaisons futures (ex. logos municipaux ou entreprises partenaires).【F:docs/double-websocket.md†L1-L36】【F:page/beaverphone.html†L950-L1024】


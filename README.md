# Beaver Kiosk

Une interface de menu minimaliste pour kiosque qui propose deux services principaux :
BeaverPhone pour la téléphonie locale et BeaverNet.ca pour les services nuagiques.

## Aperçu
- **React + Vite** : l'interface du kiosque est fournie par une véritable application React (avec Hot Module Replacement) située dans `renderer/`.
- **Routage unifié** : le menu principal et le composeur BeaverPhone sont servis par une seule SPA et naviguent grâce à React Router.
- **Electron** : `main.js` charge automatiquement le serveur de dev Vite en environnement de développement et le bundle statique en production.
- **preload.js** : conserve la passerelle WebSocket et les événements personnalisés `beaverphone:dialpad` pour la numérotation.

## Démarrage rapide
1. Installer les dépendances :
   ```bash
   npm install
   ```
2. Lancer le mode développement (Electron + Vite avec hot reload) :
   ```bash
   npm run dev
   ```
3. Produire le bundle statique pour la distribution :
   ```bash
   npm run build
   ```
4. Démarrer l'application empaquetée (nécessite un build préalable) :
   ```bash
   npm start
   ```

## Langues et traduction
- Le kiosque démarre en **français** et propose un sélecteur de langue local qui bascule instantanément l'interface en **anglais**.
- Les traductions sont chargées depuis un dictionnaire embarqué dans `renderer/src/routes/MenuPage.jsx`.
- Pour ajouter une nouvelle langue, complétez simplement l'objet `translations` dans cette page et ajoutez la carte correspondante si nécessaire.

## Personnalisation
- Ajoutez de nouvelles cartes dans `MenuPage.jsx` ou modifiez le tableau `CARD_CONFIG` pour lier d'autres services.
- Mettez à jour les styles globaux dans `renderer/src/styles/` pour adapter les couleurs et la typographie à votre identité visuelle.
- Réutilisez la fonction `dispatchDialpadEvent` du `BeaverphonePage.jsx` pour connecter la numérotation à votre logique métier côté preload.

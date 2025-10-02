# Beaver Kiosk

Une interface de menu minimaliste pour kiosque qui propose deux services principaux :
BeaverPhone pour la téléphonie locale et BeaverNet.ca pour les services nuagiques.

## Aperçu
- **menu.html** : écran d'accueil avec un message de bienvenue et des cartes interactives.
- **beaverphone.html** : clavier numérique basique qui déclenche des événements de numérotation.
- **main.js / preload.js** : scripts utilisés par l'application Electron.
- **service de traduction local** : commutateur intégré pour passer du français à l'anglais sans connexion réseau.

## Lancer l'application
1. Installer les dépendances :
   ```bash
   npm install
   ```
2. Démarrer l'application :
   ```bash
   npm start
   ```

L'application affichera le menu d'accueil où il suffit de toucher ou de cliquer sur la carte désirée.

## Langues et traduction
- Le kiosque démarre en **français** et propose un sélecteur de langue local qui bascule instantanément l'interface en **anglais**.
- Le service est purement client (fonctionne sur Debian, Ubuntu ou tout autre Linux sans dépendance réseau) : les traductions sont chargées depuis un dictionnaire JavaScript embarqué.
- Pour ajouter une nouvelle langue, complétez simplement l'objet `translations` dans `menu.html` avec un nouveau code de langue et ses chaînes.

## Personnalisation
- Ajoutez de nouvelles cartes dans `menu.html` pour offrir davantage de services.
- Modifiez les styles intégrés pour adapter les couleurs et la typographie à votre identité visuelle.
- Utilisez les événements personnalisés du `beaverphone.html` pour connecter la numérotation à votre logique métier.

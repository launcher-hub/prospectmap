<p align="center">
  <h1 align="center">📍 ProspectMap</h1>
  <p align="center">
    <strong>Trouvez les commerces locaux sans site web autour de vous</strong>
  </p>
  <p align="center">
    Outil gratuit de prospection commerciale basé sur OpenStreetMap
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/100%25-gratuit-brightgreen?style=for-the-badge" alt="100% gratuit">
  <img src="https://img.shields.io/badge/Aucune-clé%20API-blue?style=for-the-badge" alt="Aucune clé API">
  <img src="https://img.shields.io/badge/PHP-8.0+-purple?style=for-the-badge" alt="PHP 8+">
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="License MIT">
</p>

---

## ✨ Fonctionnalités

| Fonctionnalité | Description |
|---|---|
| 🔍 **Recherche d'adresse** | Géocodage instantané via Photon (OpenStreetMap) |
| 🗺️ **Carte interactive** | Leaflet.js avec tuiles OpenStreetMap, marqueurs colorés par catégorie |
| 🏪 **20 types de commerces** | Restaurants, cafés, boutiques, coiffeurs, médecins, banques… |
| 📡 **Détection en 3 niveaux** | Tags OSM → Vérification HTTP → Recherche Photon+Nominatim |
| ⚡ **Affichage progressif** | Résultats immédiats + vérification au fil de l'eau |
| 📋 **Copie en 1 clic** | Informations formatées pour CRM ou prompt IA |
| 🔗 **Liens utiles** | Google Maps, itinéraire, recherche de site web, page OSM |
| 📱 **Responsive** | Fonctionne sur mobile, tablette et desktop |
| ⚙️ **Rayon configurable** | De 300m à 5km |
| 🎛️ **Filtres par catégorie** | Activez/désactivez les types de commerces |

---

## 🚀 Installation ultra-simple

### Prérequis

- Un serveur web avec **PHP 8.0+** (Apache, Nginx, WAMP, MAMP, XAMPP, hébergement mutualisé…)
- **OU** simplement un navigateur web (fonctionne aussi sans PHP, avec des fonctionnalités réduites)

### Étape 1 — Télécharger

**Option A — Git (recommandé)**
```bash
git clone https://github.com/VOTRE_USERNAME/prospectmap.git
cd prospectmap
```

**Option B — Télécharger le ZIP**
1. Cliquez sur le bouton **<> Code** en haut à droite de cette page
2. Cliquez sur **Download ZIP**
3. Décompressez le fichier

### Étape 2 — Lancer

**Avec un serveur PHP local (recommandé)**
```bash
cd prospectmap
php -S localhost:8080
```
Puis ouvrez **http://localhost:8080** dans votre navigateur.

**Avec XAMPP / WAMP / MAMP**
Copiez le dossier dans `htdocs/` (XAMPP) ou `www/` (WAMP/MAMP) puis ouvrez `http://localhost/prospectmap`.

**Avec un hébergement web**
Uploadez tous les fichiers via FTP dans le dossier de votre site. C'est tout.

**Sans serveur PHP (mode limité)**
Ouvrez simplement le fichier `index.html` dans votre navigateur. La vérification HTTP des sites ne fonctionnera pas, mais tout le reste oui.

### Étape 3 — Utiliser

1. Entrez une adresse dans la barre de recherche
2. La carte affiche tous les commerces autour (marqueurs orange = pas de site tagué)
3. Cliquez sur **🔍 Vérifier les X commerces** pour lancer la détection approfondie
4. Les marqueurs passent :
   - 🔴 **Rouge** → Pas de site web détecté
   - 🟢 **Vert** → A un site web
   - 🟠 **Orange** → En attente de vérification
5. Cliquez sur un marqueur pour voir les détails + liens
6. **📋 Copier** pour récupérer les infos formatées

---

## 🏗️ Architecture

```
prospectmap/
├── index.html              ← Page principale
├── css/
│   └── style.css           ← Styles (responsive, thème clair)
├── js/
│   ├── app.js              ← Orchestrateur (2 phases : recherche + vérification)
│   ├── api.js              ← Appels APIs (Photon, Overpass, proxy PHP)
│   ├── map.js              ← Carte Leaflet (marqueurs, popups, cercle)
│   ├── ui.js               ← Interface (sidebar, filtres, notifications)
│   └── utils.js            ← Fonctions utilitaires pures
├── api/
│   ├── api.php             ← Proxy API unifié (Nominatim, Overpass, HTTP check)
│   └── cache/              ← Cache fichier des résultats API
└── README.md
```

### Flux technique

```
Utilisateur entre une adresse
        │
        ▼
   [Photon API] ← Géocodage rapide (pas de rate limit)
        │
        ▼
   [Overpass API] via proxy PHP ← Recherche commerces dans le rayon
        │
        ▼
   Affichage immédiat sur la carte (tous les commerces)
        │
        ▼
   Utilisateur clique "Vérifier"
        │
        ▼
   Pour chaque commerce sans site :
   ├─ [Photon] → Trouve l'ID OSM du commerce
   ├─ [Nominatim reverse] via proxy → Récupère les extratags (website, tel, email)
   └─ [Proxy HTTP] → Vérifie si l'URL OSM est accessible
        │
        ▼
   Mise à jour progressive (marqueur + carte sidebar)
```

---

## 🔧 APIs utilisées (100% gratuites, sans clé API)

| API | Usage | Rate limit |
|---|---|---|
| [Photon](https://photon.komoot.io) | Géocodage d'adresses | ~Illimité |
| [Overpass API](https://overpass-api.de) | Recherche commerces OSM | 2 req/s |
| [Nominatim](https://nominatim.openstreetmap.org) | Reverse lookup (extratags) | 1 req/s |
| [OpenStreetMap](https://www.openstreetmap.org) | Tuiles de carte | ~Illimité |

> **Note** : Toutes les requêtes passent par le proxy PHP (`api/api.php`) pour éviter les problèmes CORS et ajouter du cache côté serveur.

---

## ⚙️ Personnalisation

### Ajouter un type de commerce

Dans `js/utils.js`, ajoutez une entrée au objet `CATEGORIES` :

```javascript
mon_commerce: {
  label: 'Mon Commerce',
  color: '#ff6600',
  icon: '🏪',
  overpassKey: 'shop=mon_type'  // ou 'amenity=mon_type'
}
```

### Changer le pays par défaut

Dans `js/api.js`, modifiez le paramètre Photon :

```javascript
lang: 'fr'   // 'de', 'en', 'es', 'it', 'nl'…
```

Et dans la requête Overpass, retirez le filtre pays si nécessaire.

### Modifier les couleurs

Toutes les couleurs sont des variables CSS dans `css/style.css` :

```css
:root {
  --primary: #3498db;    /* Bleu principal */
  --danger: #e74c3c;     /* Rouge (pas de site) */
  --success: #27ae60;    /* Vert (a un site) */
  --warning: #f39c12;    /* Orange (en attente) */
}
```

---

## 🔒 Sécurité

- ✅ Validation de toutes les entrées utilisateur
- ✅ Protection XSS (échappement HTML systématique)
- ✅ Rate limiting côté serveur (60 req/min/IP)
- ✅ Cache fichier pour réduire les appels API
- ✅ Blacklist des domaines internes dans le proxy HTTP
- ✅ Headers CORS configurés
- ✅ Aucune donnée personnelle collectée

---

## 🤝 Contribuer

Les contributions sont les bienvenues ! Voici comment :

1. **Forkez** ce repository
2. Créez une branche : `git checkout -b ma-fonctionnalite`
3. Commitez vos changements : `git commit -m "Ajout de X"`
4. Poussez : `git push origin ma-fonctionnalite`
5. Ouvrez une **Pull Request**

> ⚠️ Les pull requests nécessitent l'approbation du mainteneur avant d'être fusionnées.

---

## 📝 Licence

Ce projet est sous licence [MIT](LICENSE).

Les données proviennent d'[OpenStreetMap](https://www.openstreetmap.org/copyright) sous licence [ODbL](https://opendatacommons.org/licenses/odbl/).

---

<p align="center">
  Fait avec ❤️ pour les entrepreneurs et commerciaux qui veulent trouver de nouveaux clients
</p>

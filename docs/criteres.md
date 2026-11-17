# Critères

Texte des exigences du travail de session (Web V), section par section. Chaque exigence a un identifiant (`AUTH-01`) que les branches (`feature/<page>/auth-01`), les commits (footer `Refs: AUTH-01`) et la matrice `docs/EXIGENCES.md` reprennent.

Ce fichier est la source du texte des critères ; leur statut (complet, partiel, non fait) vit dans `docs/EXIGENCES.md`. Une ambiguïté tranchée se documente dans `docs/EXIGENCES.md`, colonne « Notes et choix ».

## 3. Contraintes techniques (TECH)

- **TECH-01** — Next.js (App Router, version stable actuelle) avec React.
- **TECH-02** — TypeScript à 100 %.
  - Aucun fichier .js/.jsx dans le dépôt.
  - `strict: true` dans tsconfig.json.
  - Aucun `any` explicite (règle ESLint `@typescript-eslint/no-explicit-any` en erreur).
  - Aucun `@ts-ignore` ou `@ts-expect-error` sans commentaire justificatif.
- **TECH-03** — Tailwind CSS pour le style.
- **TECH-04** — Base de données PostgreSQL, avec l'ORM de votre choix (Prisma, Drizzle, etc.).
  - Les migrations sont versionnées dans le dépôt.
  - Un script de seed crée des données de démonstration : corpus de textes, utilisateurs et historique.
- **TECH-05** — Déploiement sur un serveur (VPS).
  - Serveur loué à vos frais (DigitalOcean, AWS EC2, FlyIO, etc.) ou fourni par le cégep.
  - L'application est accessible publiquement en HTTPS.
  - L'application doit être fonctionnelle en production au checkpoint 1 et à la remise finale.
- **TECH-06** — Visualisation de la progression des participants en temps réel : la technologie est libre (WebSocket, MQTT ou autre).
- **TECH-07** — Toutes les entrées côté serveur sont validées par un schéma (Zod ou équivalent) : actions serveur, routes API et messages temps réel.
- **TECH-08** — Coûts.
  - Les frais du serveur (TECH-05) sont à votre charge, sauf si vous utilisez un serveur du cégep.
  - Tout autre service externe (stockage d'images, service temps réel, etc.) doit utiliser un forfait gratuit.
  - L'enseignant ne doit rien payer pour corriger (une clé d'accès peut lui être fournie).
- **TECH-09** — Intégration continue avec GitHub Actions. Chaque push exécute le lint, la vérification de types (`tsc --noEmit`) et les tests unitaires.
- **TECH-10** — Un fichier `.env.example` documente toutes les variables d'environnement. Aucun secret n'est commité.

## 4. Identité visuelle et design (DES)

- **DES-01** — Nom du site trouvé par vous, sans IA.
  - Le nom doit être original : vérifier qu'il n'est pas déjà utilisé par un produit connu.
  - Démarche documentée dans `docs/DEMARCHE-CREATIVE.md` : liste des noms envisagés, raison du choix final.
- **DES-02** — Logo conçu par vous, sans IA.
  - Croquis (photo papier ou tablette) joints à la démarche créative.
  - La vectorisation ou la mise au propre du croquis dans un outil (Figma, Illustrator, Inkscape) est permise.
  - Le logo est utilisé dans l'application et comme favicon.
- **DES-03** — Direction artistique documentée avant le développement. La démarche créative contient :
  - un moodboard de 3 à 5 références ;
  - la palette de couleurs ;
  - les typographies.
- **DES-04** — Design unique. Un site qui a l'air « généré par défaut » sera pénalisé. Signes à éviter :
  - composants shadcn/ui non personnalisés ;
  - dégradé violet générique dans la section d'accueil (hero section) ;
  - émojis en guise d'icônes ;
  - mise en page de landing page type SaaS sans lien avec le thème.
  - La piste de progression doit être un élément signature du design.
- **DES-05** — Thèmes clair et sombre.
  - Un sélecteur permet de changer de thème, et la préférence système est respectée par défaut.
  - Aucun flash du mauvais thème au chargement.
  - Exception : direction artistique volontairement mono-thème, justifiée dans la démarche créative.
- **DES-06** — Responsive : toutes les pages sont utilisables en format mobile (360 px de largeur et plus). Sur mobile, la course est remplacée par un message recommandant un clavier physique.

## 5. Fonctionnalités

### Vocabulaire

| Terme | Définition |
|---|---|
| Salle | Espace de jeu identifié par un code. Elle a un créateur (l'hôte), des participants et une configuration. Elle peut enchaîner plusieurs courses. |
| Course | Une manche jouée dans une salle, sur un texte donné, du décompte jusqu'aux résultats. |
| Participant | Utilisateur connecté, invité ou bot qui prend part à la course. |
| Spectateur | Personne présente dans la salle qui suit la course sans taper. Ne compte pas dans le nombre de participants. |
| Invité | Personne qui participe sans compte. |
| MPM | Mots par minute (WPM). Voir l'annexe A. |

### 5.2 Comptes et profil (AUTH)

- **AUTH-01** — Authentification.
  - Connexion par OAuth avec Discord et GitHub. Les deux fournisseurs doivent être offerts.
  - Une connexion par nom d'utilisateur et mot de passe est aussi permise, y compris en production. Elle est notamment utile pour les tests de bout en bout (TEST-03).
  - Une librairie est permise (Auth.js, Better Auth, etc.).
- **AUTH-02** — Un invité choisit un pseudonyme (3 à 20 caractères) avant de rejoindre une salle. Sa session est conservée par un cookie signé.
- **AUTH-03** — Un invité ne peut pas créer de salle. Il n'a ni historique persistant ni photo de profil ; un avatar généré est affiché à la place.
- **AUTH-04** — Un utilisateur connecté peut téléverser une photo de profil.
  - Types acceptés : JPEG, PNG et WebP.
  - Taille maximale de 2 Mo, validée côté serveur.
  - Image redimensionnée avant l'affichage.
- **AUTH-05** — Un utilisateur connecté peut modifier son pseudonyme d'affichage.
- **AUTH-06** — Page de profil avec les statistiques personnelles :
  - meilleur MPM, MPM moyen et précision moyenne ;
  - nombre de courses et nombre de victoires ;
  - graphique de progression du MPM dans le temps.

### 5.3 Salles et visibilité (SALLE)

- **SALLE-01** — Un utilisateur connecté peut créer une salle et en devient l'hôte. L'hôte choisit d'être participant ou seulement spectateur.
- **SALLE-02** — Chaque salle a un code court unique de 6 caractères alphanumériques, sans caractères ambigus (0/O, 1/I/L).
- **SALLE-03** — La salle a l'une de ces trois visibilités :

  | Visibilité | Apparaît dans l'explorateur et « Faire une course » | Accès |
  |---|---|---|
  | Publique | Oui | Directement ou avec le code |
  | Sur code | Non | Avec le code ou un lien d'invitation |
  | Privée | Non | Avec un lien d'invitation seulement |

- **SALLE-04** — Liens d'invitation.
  - L'hôte génère un lien distinct par invité. L'interface permet de générer plusieurs liens, de les copier et de voir leur statut (non utilisé, ou utilisé par qui).
  - Chaque lien contient un jeton aléatoire non devinable (au moins 128 bits d'entropie).
  - Un lien est à usage unique : à sa première utilisation, il est associé à l'adresse IP de la personne qui l'a utilisé. Une personne ayant une autre adresse IP est refusée.
  - La personne associée au lien peut le réutiliser pour se reconnecter à la salle.
  - Le lien d'un participant expulsé (SALLE-07) est révoqué.
  - Tous les liens deviennent invalides à la fermeture de la salle.
  - Le code seul ne suffit pas pour entrer dans une salle privée.
- **SALLE-05** — L'hôte configure une capacité maximale (minimum 2, maximum 30 participants). Les spectateurs ne comptent pas dans la capacité.
- **SALLE-06** — Une personne ne peut être que dans une seule salle à la fois.
  - La règle est garantie côté serveur (contrainte en base de données), pas seulement dans l'interface.
  - Si la personne tente de rejoindre une autre salle, on lui propose de quitter la salle actuelle.
  - Un deuxième onglet ouvert sur la même salle ne crée pas de doublon.
- **SALLE-07** — L'hôte peut expulser un participant ou un spectateur. Celui-ci ne peut plus rejoindre cette salle.
- **SALLE-08** — Si l'hôte quitte la salle, le rôle d'hôte passe à la personne humaine connectée (participant ou spectateur) présente depuis le plus longtemps. S'il n'en reste aucune, la salle est fermée.
- **SALLE-09** — On ne peut rejoindre une salle que lorsqu'elle est en attente ou sur l'écran des résultats. On ne peut jamais rejoindre une course en cours.
- **SALLE-10** — Le code de salle est protégé contre la force brute : limite de tentatives par IP, par exemple 10 par minute.

### 5.4 Rejoindre une course (JOIN)

- **JOIN-01** — Rejoindre par code : un champ accessible dès la page d'accueil.
- **JOIN-02** — Explorateur de salles :
  - liste des salles publiques ;
  - pour chaque salle : nombre de participants et capacité, langue du texte, complexité, hôte et état ;
  - filtres minimum : langue et complexité ;
  - la liste se met à jour sans rechargement manuel.
- **JOIN-03** — Bouton « Faire une course » (partie rapide). Le système choisit, parmi les salles publiques joignables et non pleines, celle qui est la plus proche de sa capacité maximale. En cas d'égalité, la plus ancienne l'emporte. Si aucune salle n'est disponible :
  - un utilisateur connecté voit un message l'informant qu'aucune salle n'est disponible, et on lui offre de créer une salle publique avec la configuration par défaut, dont il devient l'hôte ;
  - un invité voit un état vide et un message l'informant qu'aucune salle n'est disponible.

### 5.5 Configuration de la course (CONF)

L'hôte configure les options suivantes dans la salle d'attente. Il peut les modifier entre deux courses.

- **CONF-01** — Temps maximal : aucun, ou une durée entre 30 secondes et 10 minutes.
- **CONF-02** — Langue du texte : français ou anglais. Ce réglage est indépendant de la langue de l'interface.
- **CONF-03** — Type de texte :
  - Cohérent : passages réels tirés d'un corpus stocké en base de données, par exemple des textes du domaine public.
  - Aléatoire : mots tirés d'un dictionnaire.
- **CONF-04** — Longueur du texte en nombre de mots.
- **CONF-05** — Complexité : facile, moyen ou difficile. Critères mesurables (longueur des mots, fréquence d'usage, caractères spéciaux…) définis et documentés.
- **CONF-06** — Options à activer ou désactiver : ponctuation, nombres, majuscules et accents (pour le français).
- **CONF-07** — Caractères à inclure ou à exclure. S'applique au texte aléatoire. En mode cohérent, soit l'option est désactivée, soit seuls les passages compatibles sont choisis. Comportement retenu documenté.
- **CONF-08** — Mode d'erreur :
  - Correction obligatoire : le joueur ne peut pas avancer tant que l'erreur n'est pas corrigée.
  - Libre : le joueur continue, et l'erreur est comptabilisée.
- **CONF-09** — Bonus de remontée activés ou non.
- **CONF-10** — Ajout et retrait de bots, avec le niveau de chacun.
- **CONF-11** — Visibilité et capacité (voir SALLE-03 et SALLE-05).
- **CONF-12** — Toutes les personnes présentes dans la salle voient la configuration en temps réel.

### 5.6 Déroulement d'une course (COURSE)

- **COURSE-01** — La course passe par des états explicites, modélisés par une machine à états documentée : `EN_ATTENTE → DÉCOMPTE → EN_COURSE → RÉSULTATS → (EN_ATTENTE | FERMÉE)`.
- **COURSE-02** — L'hôte ne peut lancer la course que si la salle compte au moins 2 participants, dont au moins 1 humain. Les bots comptent dans ce minimum ; les spectateurs, non.
- **COURSE-03** — Un décompte synchronisé (3, 2, 1) précède la course. Le texte n'est révélé qu'au début du décompte.
- **COURSE-04** — Zone de frappe :
  - retour visuel immédiat (caractère correct, incorrect, curseur) ;
  - MPM et précision affichés en direct ;
  - le coller est désactivé.
- **COURSE-05** — Piste de progression en temps réel.
  - Chaque participant (humain ou bot) apparaît avec son avatar, son nom, sa position et son MPM courant.
  - Le mouvement est fluide : interpolation encouragée, au moins environ 4 mises à jour perçues par seconde.
  - Le joueur local est clairement mis en évidence.
  - Les spectateurs voient la piste, sans zone de frappe.
- **COURSE-06** — Serveur autoritaire. Le serveur est la source de vérité pour :
  - le temps de départ et de fin ;
  - la progression et le classement ;
  - l'application des bonus.
  - Il rejette les progressions impossibles, comme un saut de progression ou une vitesse irréaliste.
- **COURSE-07** — Un joueur peut abandonner la course, avec une confirmation.
- **COURSE-08** — Déconnexion : un joueur qui recharge la page ou perd sa connexion reprend là où il était s'il revient dans les 30 secondes. Passé ce délai, il est considéré comme ayant abandonné.
- **COURSE-09** — La course se termine lorsque tous les participants ont terminé ou abandonné, ou lorsque le temps maximal est écoulé.
- **COURSE-10** — Classement final :
  - d'abord, les joueurs qui ont terminé, par temps d'arrivée ;
  - ensuite, ceux qui n'ont pas terminé avant la fin du temps, par progression ;
  - enfin, ceux qui ont abandonné, par progression au moment de l'abandon.
- **COURSE-11** — Sur l'écran des résultats, l'hôte peut :
  - relancer une course avec les mêmes participants, en modifiant la configuration au besoin ;
  - fermer la salle.
  - Les autres personnes peuvent rester ou quitter.

### 5.7 Bots (BOT)

- **BOT-01** — Il existe cinq niveaux de bots. Plages indicatives, ajustables si les valeurs retenues sont documentées :

  | Niveau | MPM visé | Taux d'erreur indicatif |
  |---|---|---|
  | Noob | 10–20 | ~12 % |
  | Débutant | 20–35 | ~8 % |
  | Intermédiaire | 35–60 | ~5 % |
  | Expert | 70–100 | ~2 % |
  | Impossible | 140+ | ~0,5 % |

- **BOT-02** — La vitesse d'un bot varie pendant la course : accélérations, hésitations, ralentissements sur les mots difficiles. Une vitesse constante n'est pas acceptée.
- **BOT-03** — Les bots font des erreurs qui les ralentissent (temps de correction). Ils respectent le mode d'erreur configuré.
- **BOT-04** — Les bots sont clairement identifiés comme tels dans l'interface. Ils sont soumis aux bonus et malus comme les humains.
- **BOT-05** — Le moteur des bots est déterministe à partir d'une graine (seed), afin d'être testable unitairement.

### 5.8 Bonus de remontée (BONUS)

L'objectif est de donner une chance de revenir aux joueurs en retard.

- **BONUS-01** — Lorsque les bonus sont activés, un joueur en retard reçoit un bonus à des points de contrôle. Est en retard le joueur en dernière position ou à plus de 25 % de progression derrière le meneur. Les points de contrôle sont atteints lorsque le meneur passe 25 %, 50 % et 75 % du texte. Un joueur reçoit au plus 3 bonus par course. La règle exacte est à documenter.
- **BONUS-02** — Il existe au moins 3 types de bonus, dont au moins un qui aide le joueur en retard et au moins un qui ralentit le meneur. Exemples :
  - +3 mots : ajoute 3 mots au texte du meneur seulement ;
  - -3 mots : retire 3 mots au texte du joueur en retard seulement ;
  - Brouillard : les prochains mots du meneur sont flous pendant quelques secondes.
- **BONUS-03** — L'activation d'un bonus est annoncée visuellement sur la piste et chez le joueur ciblé.
- **BONUS-04** — Le calcul de la progression et du MPM reste cohérent lorsqu'un texte est allongé ou réduit par un bonus.

### 5.9 Résultats et statistiques (RES)

- **RES-01** — Podium des 3 premiers.
- **RES-02** — Tableau complet : rang, participant, MPM, MPM brut, précision, nombre d'erreurs, temps, statut (terminé, temps écoulé ou abandon) et bonus reçus.
- **RES-03** — Au moins 2 graphiques, dont :
  - l'évolution du MPM dans le temps pour tous les participants, sur un même graphique ;
  - les touches les plus manquées du joueur, par exemple sous forme de clavier en carte de chaleur.
- **RES-04** — Un indicateur signale un record personnel battu.
- **RES-05** — Les résultats de chaque participant humain connecté sont persistés. Cela inclut la série temporelle du MPM, nécessaire pour réafficher les graphiques.

### 5.10 Historique (HIST)

- **HIST-01** — Chaque course terminée apparaît dans l'historique de l'utilisateur connecté, avec pagination.
- **HIST-02** — Cliquer sur une course de l'historique réaffiche sa page de résultats complète.

### 5.11 Internationalisation (I18N)

- **I18N-01** — Tous les textes de l'interface sont disponibles en français et en anglais : libellés, messages d'erreur, états vides, métadonnées des pages. Aucune chaîne n'est codée en dur.
- **I18N-02** — Un sélecteur de langue est accessible sur toutes les pages. Le choix est conservé (cookie ou profil). Par défaut, la langue du navigateur est utilisée.
- **I18N-03** — Les dates et les nombres sont formatés selon la langue choisie.

## 6. Qualité

### 6.1 Tests (TEST)

- **TEST-01** — Tests unitaires sur la logique.
- **TEST-02** — Tests de bout en bout (end-to-end) avec Playwright.
- **TEST-03** — Les tests de bout en bout ne fonctionnent pas avec l'authentification OAuth. Utiliser la connexion par nom d'utilisateur et mot de passe (AUTH-01).

### 6.2 Performance (PERF)

- **PERF-01** — Lighthouse donne au moins 90 dans chaque catégorie sur la page d'accueil.
- **PERF-02** — Les mises à jour de progression envoyées au réseau sont regroupées ou limitées (par exemple 10 messages par seconde au maximum par joueur). On n'écrit pas en base de données à chaque frappe.
- **PERF-03** — La piste reste fluide avec la capacité maximale de participants.

### 6.3 Accessibilité (A11Y)

- **A11Y-01** — Les textes ont un bon contraste avec leur arrière-plan, dans les deux thèmes (niveau WCAG AA).
- **A11Y-02** — Les bonnes balises HTML sont utilisées :
  - `<button>` … (texte illisible à la conversion du .docx : à recopier depuis l'énoncé) ;
  - titres `<h1>` à `<h6>` dans un ordre logique ;
  - `<header>`, `<nav>`, `<main>` et `<footer>` pour structurer les pages ;
  - `<table>` pour les données tabulaires, comme les résultats.
- **A11Y-03** — Les images ont un texte alternatif et les champs de formulaire ont un libellé.
- **A11Y-04** — Le site peut être parcouru au clavier, avec un indicateur de focus visible.

### 6.4 Sécurité (SEC)

- **SEC-01** — Toutes les actions réservées à l'hôte (lancer, configurer, générer des liens, expulser, fermer) sont autorisées côté serveur.
- **SEC-02** — Les téléversements sont validés côté serveur : type réel du fichier et taille.
- **SEC-03** — Les mots de passe sont hachés avec un algorithme adapté (Argon2, bcrypt ou scrypt) et ne sont jamais stockés ni journalisés en clair.

## Annexe A — Définitions de calcul

- MPM (net) = (nombre de caractères correctement tapés ÷ 5) ÷ minutes écoulées
- MPM brut = (nombre total de caractères tapés ÷ 5) ÷ minutes écoulées
- Précision = frappes correctes ÷ frappes totales × 100
- Progression = caractères validés ÷ longueur totale du texte (en tenant compte des mots ajoutés ou retirés par un bonus)
- Les espaces comptent comme des caractères.

## Livrables liés (sections 7 et 8)

- `docs/EXIGENCES.md` : matrice de traçabilité (ID, statut complet / partiel / non fait, fichiers principaux, tests associés, notes et choix). Une exigence déclarée « complète » alors qu'elle ne l'est pas est pénalisée plus sévèrement qu'une exigence honnêtement déclarée « partielle » ou « non faite ».
- `docs/ARCHITECTURE.md` : modèle de données, machine à états (COURSE-01), flux temps réel, ADR temps réel et bots.
- `docs/DEMARCHE-CREATIVE.md` (DES-01 à DES-03), `docs/IA.md`, `README.md`.

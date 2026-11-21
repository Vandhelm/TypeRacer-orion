// CONF-05 : liste de référence des mots très fréquents, pour mesurer la « fréquence d'usage » d'un niveau du dictionnaire.
// Environ 300 mots par langue, formes fléchies courantes comprises. Français : mots très fréquents choisis à la main,
// rangés par catégorie. Anglais : d'après les premiers rangs de la liste Fry (« Instant Words »), quelques mots retirés.
// C'est une approximation documentée (docs/ARCHITECTURE.md, « Complexité du texte »).
export const FREQUENT_WORDS = {
  fr: `le la les l un une des de du d et à au aux en dans par pour sur avec sans sous ce cette ces cet ça cela ceci
    il elle ils elles je tu nous vous on me te se lui leur leurs y qui que quoi dont où ne pas plus rien tout tous toute toutes
    être est sont était suis es sommes êtes été avoir a ai as avons avez ont avait eu faire fait dire dit pouvoir peut
    aller va voir vu savoir sait vouloir veut venir vient falloir faut devoir doit prendre pris trouver donner parler mettre
    passer croire tenir rester penser aimer partir connaître comprendre arriver attendre entendre sortir regarder demander
    laisser vivre manger boire répondre suivre écrire lire jouer chercher porter tomber ouvrir montrer
    mon ma mes ton ta tes son sa ses notre votre nos vos mais ou donc car si comme quand alors bien très encore toujours
    jamais déjà aussi peu beaucoup trop moins assez ici là maintenant aujourd'hui hier demain oui non avant après pendant
    depuis chez vers entre contre devant derrière près loin puis enfin vite tard tôt mal mieux autant
    jour nuit soir matin temps heure an année fois moment vie mort homme femme enfant ami père mère fils fille frère sœur
    main tête yeux œil visage cœur corps bras pied voix eau feu terre air ciel soleil mer nom mot chose maison porte rue
    ville pays monde travail argent table chambre salle chef place côté fond point part fin route chemin livre lettre
    pain vin voiture école histoire guerre gens idée question raison mois semaine
    petit grand bon mauvais beau belle vieux jeune nouveau premier dernier seul autre même vrai plein haut long
    noir blanc rouge chaud froid`,
  en: `the of and to a in is it you that he was for on are with as i his they be at one have this from or had by not
    word but what some we can out other were all there when up use your how said an each she which do their time if will
    way about many then them write would like so these her long make thing see him two has look more day could go come did
    number no most people my over know water than call first who may down side been now find any new work part take get
    place made live where after back little only round man year came show every good me give our under name very through
    just great think say help low line turn much mean before move right boy old too same tell does set three want air well
    also play small end put home read hand large even land here must big high such follow act why ask men change went light
    kind off need house try us again point mother world near build earth father head stand own page should country found
    answer school grow study still learn food sun four between keep eye never last let thought city tree cross hard start
    might story saw far sea draw left late run while close night real life few open seem together next white children begin
    got walk example paper always music those both mark often letter until mile river feet care second book carry took
    eat room friend began idea fish once hear horse sure watch color face wood main enough girl young ready above ever red
    list though feel talk bird soon body dog family leave song door black short class wind question happen complete ship
    area half rock order fire south problem piece told knew pass since top whole king space heard best hour better true
    during hundred five remember step early hold west ground reach fast morning table sing listen cold hot love child woman
    street fine drink into`,
} as const;

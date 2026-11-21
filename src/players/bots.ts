// Les bots du jeu (AUTH-03, AUTH-06) : une liste fermée, partagée par le salon et le serveur.
// Le serveur ne croit pas le drapeau « bot » du navigateur : seul un nom de cette liste peut avoir un historique de bot.
export const BOT_NAMES = ["Thon_Rouge", "Wasabi99", "Saba_Sensei", "Nori_Ninja", "Ebi_Fry", "Uni_Kun", "Tako_San"] as const;

export const isBotName = (name: string) => BOT_NAMES.some((bot) => bot.toLowerCase() === name.toLowerCase());

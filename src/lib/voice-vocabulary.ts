/**
 * Correcciones conservadoras de transcripciones de Microsoft Edge/Chrome.
 * Solo normaliza equivalencias del MENU. No interpreta pedidos, no inventa
 * productos ni ejecuta acciones: esas decisiones pertenecen al motor.
 *
 * Se aplica exclusivamente a solicitudes marcadas como voz de navegador,
 * para no alterar los webhooks existentes de Twilio.
 */
export function normalizeVoiceTranscript(utterance: string): string {
  return utterance
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(?:piza|pizas|pitsa|pitsas)\b/g, "pizza")
    .replace(/\b(?:peperoni|peperroni|peperonni|pepperony|pepperoni|peperone)\b/g, "pepperoni")
    .replace(/\b(?:hawaiiana|hawaiianas|hawaiyana|hawaiyanas|hawaiano|hawaianas)\b/g, "hawaiana")
    .replace(/\b(?:margherita|margerita|marguerita|margaritas)\b/g, "margarita")
    // Solo bebidas genéricas; nunca convertir marcas o ingredientes no ofrecidos.
    .replace(/\b(?:sodas?|refrescos?|gaseosas?|colas?)\b/g, "gaseosa")
    .replace(/\b(?:grandes?)\b/g, "familiar")
    .replace(/\b(?:medianos?)\b/g, "mediana")
    .replace(/\b(?:porfa|porfis)\b/g, "por favor")
    .replace(/\s+/g, " ")
    .trim();
}

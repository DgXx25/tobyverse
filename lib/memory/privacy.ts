/** Memory-only boundaries. Never apply these filters to chat storage or work notes. */
export function excludesMemory(text: string): boolean {
  return /\bconfidential\b|\bprivate\s*[:;]|\boff[ -]the[ -]record\b|\b(?:do not|don['’]?t|never)\s+(?:(?:want you to|want to|ever)\s+)?(?:remember|memorize|store|save|retain|learn)\b|\b(?:keep|leave)\s+(?:this|it)\s+(?:out of|off)\s+(?:your\s+)?memory\b|კონფიდენციალურ|არ(?:აფერი)?\s+(?:დაიმახსოვრ|დამიმახსოვრ|შეინახ|ჩაიწერ|დაამახსოვრ)|ნუ\s+(?:დაიმახსოვრ|შეინახ|ჩაიწერ)/i.test(text);
}

// Conservative recognizable identifiers. Names alone are allowed when explicitly shared.
// Financial concepts/percentages remain useful; personal amounts and account details do not.
const sensitive = [
  /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/u,
  /\+?(?:\d[\s().-]*){9,}/,
  /\b(?:phone|mobile|telephone|tel)\s*(?:number|no\.?)?\s*[:=]?\s*\+?[\d(][\d\s().-]{5,}/i,
  /(?:ტელეფონი|მობილური)\s*[:=]?\s*\+?[\d(][\d\s().-]{5,}/,
  /\b[A-Z]{2}\s?\d{2}(?:[\s-]?[A-Z0-9]){10,30}\b/i,
  /\b(?:ssn|social security|passport|personal id|national id|tax id|account number|card number|routing number|iban)\s*(?:number|no\.?|#)?\s*[:=]?\s*[A-Z0-9][A-Z0-9\s-]{3,}/i,
  /(?:პირადი\s*(?:ნომერი|ნომრის)|პასპორტ|საბანკო\s*ანგარიშ|ბარათის\s*ნომერი)\s*[:#=]?\s*[\p{L}\d][\p{L}\d\s-]{3,}/u,
  /\b(?:password|passcode|api[ _-]?key|access[ _-]?token|secret[ _-]?key)\s*[:=]\s*\S+/i,
  /(?:პაროლი|საიდუმლო\s*კოდი)\s*[:=]\s*\S+/,
  /\b(?:address|home address|mailing address)\s*[:=]\s*\S+/i,
  /(?:მისამართი)\s*[:=]\s*\S+/,
  /\b\d{1,6}\s+[\p{L}\p{N}\s.'-]{2,50}\s(?:street|st\.?|road|rd\.?|avenue|ave\.?|lane|ln\.?)\b/iu,
  /(?:[$€£₾]\s*\d[\d,.]*|\d[\d,.]*\s*(?:USD|EUR|GEL|GBP|ლარი|ლარს|დოლარი|დოლარს|ევრო)(?![\p{L}\p{N}]))/iu,
  /\b(?:my|their|his|her|user['’]?s)\s+(?:salary|income|debt|balance|net worth|bank account|credit card)\b/i,
  /\b(?:salary|income|debt|balance|net worth)\s*[:=]\s*\d/i,
  /(?:ჩემი|მისი)\s*(?:ხელფასი|შემოსავალი|ვალი|საბანკო\s*ანგარიში|ბარათი)/,
];

export function containsSensitiveMemory(text: string): boolean {
  return excludesMemory(text) || sensitive.some(pattern => pattern.test(text));
}

/** Reject the full unit rather than retaining a fragment of a private fact. Check before clipping. */
export function memorySafeText(value: unknown): string {
  return typeof value === "string" && !containsSensitiveMemory(value) ? value : "";
}

/** Remove excluded user turns and their replies, so assistant echoes cannot restore private context. */
export function memorySafeTurns<T extends { role?: string; content: string }>(turns: T[]): T[] {
  let excluded = false;
  return turns.filter(turn => {
    if (turn.role !== "assistant") excluded = containsSensitiveMemory(turn.content) || isWorkNoteRequest(turn.content);
    return !excluded && !containsSensitiveMemory(turn.content);
  });
}

/** Saving a task artifact is different from remembering a personal preference. */
export function isWorkNoteRequest(text: string): boolean {
  // A preference ABOUT future note writing is memory evidence. Only recognize it at
  // the start, so "Save a note: I always ..." keeps its meaning as an artifact body.
  const preferenceLead = /^(?:(?:please\s+)?remember(?:\s+that)?[,:]?\s+)?(?:i (?:prefer|like)\b|my preference\b|(?:from now on[,\s]+)?when(?:ever)? you\b)|^(?:დაიმახსოვრე[,\s]+(?:რომ\s+)?)?(?:მირჩევნია|მომწონს|როცა|როდესაც)/i;
  const durable = /\bi (?:prefer|like)\b|\balways\b|\bnever\b|from now on|მირჩევნია|მომწონს|ყოველთვის|არასდროს/i;
  if (preferenceLead.test(text.trim()) && durable.test(text)) return false;
  return /\bjot(?:\s+down)?\b|ჩაინიშნ|\b(?:save|create|write|update|make|add)\b.{0,45}\b(?:work\s+)?notes?\b|\bnotes?\b.{0,25}\b(?:save|create|update)\b|(?:შეინახ|შექმ|დაწერ|განაახლ|ჩაიწერ).{0,45}(?:ჩანაწერ|ნოუთ|ნოუტ|შენიშვნ)|(?:ჩანაწერ|ნოუთ|ნოუტ|შენიშვნ).{0,25}(?:შეინახ|შექმ|დაწერ)/i.test(text);
}

export type PdfPageRef = {
  page: number;
  textPath: string;
  imagePath?: string;
  heading?: string;
  terms?: string[];
};

export function pdfRetrievalLimitForPlan(plan: unknown): 4 | 6 {
  return plan === "pro" || plan === "max" || plan === "admin" ? 6 : 4;
}

export function planPdfBatches(pageCount: number, batchSize: number) {
  const total = Math.max(0, Math.floor(pageCount));
  const size = Math.max(1, Math.floor(batchSize));
  const batches: { startPage: number; endPage: number }[] = [];
  for (let startPage = 1; startPage <= total; startPage += size) {
    batches.push({ startPage, endPage: Math.min(total, startPage + size - 1) });
  }
  return batches;
}

export function nextPdfPage(pageCount: number, pages: Array<{ page: number }>): number {
  const done = new Set(pages.map(({ page }) => Math.floor(page)).filter((page) => page > 0));
  let next = 1;
  while (next <= pageCount && done.has(next)) next += 1;
  return next;
}

function pageNumberFromQuery(query: string): number | null {
  const patterns = [
    /\b(?:page|slide)\s*#?\s*(\d+)\b/i,
    /(?:მე\s*[-–]?\s*)?(\d+)\s*(?:-?ე\s*)?(?:გვერდ(?:ზე|ი|ს)?|სლაიდ(?:ზე|ი|ს)?)/i,
    /(?:გვერდ(?:ზე|ი|ს)?|სლაიდ(?:ზე|ი|ს)?)\s*#?\s*(\d+)/i,
  ];
  for (const pattern of patterns) {
    const match = query.match(pattern);
    const page = match ? Number(match[1]) : 0;
    if (Number.isInteger(page) && page > 0) return page;
  }
  return null;
}

function queryTerms(query: string): string[] {
  return Array.from(new Set((query.toLocaleLowerCase().match(/[\p{L}]{3,}|\d+/gu) ?? []).filter(Boolean)));
}

export function selectPdfPages<T extends PdfPageRef>(query: string, pages: T[], maxPages: number): T[] {
  const chapter = query.match(/\bchapter\s*(\d+)\b/i) ?? query.match(/თავი\s*#?\s*(\d+)/i);
  if (chapter) {
    const label = `chapter ${chapter[1]}`;
    const exactHeadings = pages.filter((page) => {
      const heading = (page.heading ?? "").toLocaleLowerCase().replace(/\s+/g, " ");
      return heading.includes(label);
    });
    if (exactHeadings.length) return exactHeadings.slice(0, Math.max(1, Math.min(6, Math.floor(maxPages))));
    const numberMentions = pages.filter((page) => (page.terms ?? []).some((term) => term.toLocaleLowerCase() === chapter[1]));
    if (numberMentions.length) return numberMentions.slice(0, Math.max(1, Math.min(6, Math.floor(maxPages))));
  }
  const pageNumber = pageNumberFromQuery(query);
  if (pageNumber !== null) return pages.filter((page) => page.page === pageNumber).slice(0, 1);

  const terms = queryTerms(query);
  const scored = pages.map((page, index) => {
    const heading = (page.heading ?? "").toLocaleLowerCase();
    const pageTerms = new Set((page.terms ?? []).map((term) => term.toLocaleLowerCase()));
    const score = terms.reduce((sum, term) => sum + (heading.includes(term) ? 3 : 0) + (pageTerms.has(term) ? 2 : 0), 0);
    return { page, index, score };
  });
  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(0, Math.min(6, Math.floor(maxPages))))
    .map(({ page }) => page);
}

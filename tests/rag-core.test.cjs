/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) request = path.join(root, request.slice(2));
  return originalResolve.call(this, request, parent, isMain, options);
};
require.extensions[".ts"] = function (module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(output, filename);
};

const { chunkPages, chunkText, pagesFromMarkedText, CHUNK_MAX_TOKENS } = require("../lib/rag/chunk.ts");
const { formatChunks, parseChunks } = require("../lib/rag/format.ts");
const { bm25, reciprocalRankFusion, pickDiverse, parseLocator, cosine, l2normalize } = require("../lib/rag/rank.ts");
const { stem, queryTerms, chunkTerms, estimateTokens } = require("../lib/rag/tokens.ts");
const { focusedSourceIds, selectSearchSources, focusQueryForTurn } = require("../lib/rag/source-focus.ts");

test("a named checked source is searched instead of a similarly relevant older source", () => {
  const sources = [
    { id: "old", title: "ლექცია 1-3 (1)" },
    { id: "new", title: "სემინარი 3" },
  ];
  assert.deepEqual(focusedSourceIds(sources, "სემინარი 3 რომ ავტვირთე, პირობა რა წერია?"), ["new"]);
  assert.deepEqual(focusedSourceIds(sources.slice(0, 1), "სემინარი 3 რომ ავტვირთე, პირობა რა წერია?"), []);
});

test("a question about a freshly uploaded source uses the newest checked source", () => {
  const now = Date.now();
  const sources = [
    { id: "old", title: "ლექცია", createdAt: now - 86_400_000 },
    { id: "new", title: "სემინარი 3", createdAt: now - 60_000 },
  ];
  assert.deepEqual(focusedSourceIds(sources, "ახლახანს ატვირთულ სემინარში რა წერია?", now), ["new"]);
});

test("source search honors checked items and a named document", () => {
  const sources = [
    { id: "old", title: "ლექცია 1-3 (1)", chunks: 3 },
    { id: "new", title: "სემინარი 3", chunks: 2 },
  ];
  assert.deepEqual(selectSearchSources(sources, [], "რეგრესია ამიხსენი").usable.map((item) => item.id), ["old", "new"]);
  assert.deepEqual(selectSearchSources(sources, ["new"], "რეგრესია ამიხსენი").usable.map((item) => item.id), ["new"]);
  assert.deepEqual(selectSearchSources(sources, ["__none__"], "რეგრესია ამიხსენი").usable, []);
  assert.deepEqual(selectSearchSources(sources, [], "სემინარი 3-ის ცხრილი ამიხსენი").usable.map((item) => item.id), ["new"]);
  assert.deepEqual(selectSearchSources(sources, [], "სემინარი 3 შეადარე ლექციას").usable.map((item) => item.id), ["old", "new"]);
});

test("a short source follow-up keeps the checked document named in the previous question", () => {
  const sources = [
    { id: "lecture", title: "ლექცია 1-3 (1)", chunks: 2 },
    { id: "seminar", title: "სემინარი 3", chunks: 1 },
  ];
  const focus = focusQueryForTurn(sources, "ახლა შეგიძლია წაიკითხო?", ["სემინარი 3 რომ ავტვირთე, პირობა რა წერია?"]);
  assert.deepEqual(selectSearchSources(sources, [], focus).usable.map((item) => item.id), ["seminar"]);
  const fileFocus = focusQueryForTurn(sources, "ფაილში ფოტოს სახით არსებული ცხრილის მონაცემები რა არის?", ["სემინარი 3 რომ ავტვირთე, პირობა რა წერია?"]);
  assert.deepEqual(selectSearchSources(sources, [], fileFocus).usable.map((item) => item.id), ["seminar"]);
  const longFileQuestion = "შეგიძლია ამოცანის პირობა მითხრა? ფაილში ორიგინალში ფოტოს სახით არის მოცემული სტატისტიკური ცხრილი და ატვირთვის შემდეგ შენთვის ხელმისაწვდომ ტექსტში მისი ყველა მონაცემი წერია თუ არა?";
  assert.deepEqual(selectSearchSources(sources, [], focusQueryForTurn(sources, longFileQuestion, ["სემინარი 3-ში რა წერია?"])).usable.map((item) => item.id), ["seminar"]);
  assert.equal(focusQueryForTurn(sources, "ინფლაცია ამიხსენი", ["სემინარი 3-ში რა წერია?"]), "ინფლაცია ამიხსენი");
  assert.equal(focusQueryForTurn(sources, "ახლა ინფლაცია ამიხსენი", ["სემინარი 3-ში რა წერია?"]), "ახლა ინფლაცია ამიხსენი");
  assert.equal(focusQueryForTurn(sources, "ლექცია 1-3 (1) შეაჯამე", ["სემინარი 3-ში რა წერია?"]), "ლექცია 1-3 (1) შეაჯამე");
  assert.equal(focusQueryForTurn(sources.slice(0, 1), "ახლა შეგიძლია წაიკითხო?", ["სემინარი 3-ში რა წერია?"]), "ახლა შეგიძლია წაიკითხო?");
});

function longPage(seed, sentences = 40) {
  return Array.from({ length: sentences }, (_, i) => `${seed} sentence number ${i} explains one idea about the topic in plain words.`).join(" ");
}

test("chunks stay bounded and keep page numbers in document order", () => {
  const pages = Array.from({ length: 12 }, (_, i) => ({ page: i + 1, text: longPage(`Page${i + 1}`) }));
  const chunks = chunkPages(pages);
  assert.ok(chunks.length > 6);
  for (const chunk of chunks) {
    assert.ok(chunk.tokens <= CHUNK_MAX_TOKENS + 90, `chunk too large: ${chunk.tokens}`);
    assert.ok(chunk.page >= 1 && chunk.pageEnd >= chunk.page);
  }
  const ids = chunks.map((chunk) => chunk.id);
  assert.deepEqual([...ids].sort(), ids, "ids sort in document order");
  assert.equal(chunks[0].page, 1);
  assert.ok(chunks[chunks.length - 1].pageEnd >= 12);
});

test("chunking is deterministic so a retried index run overwrites instead of duplicating", () => {
  const pages = [{ page: 1, text: longPage("A") }, { page: 2, text: longPage("B") }];
  assert.deepEqual(chunkPages(pages, 7), chunkPages(pages, 7));
  assert.ok(chunkPages(pages, 7)[0].id.startsWith("c00007-"));
});

test("a heading starts a new chunk and becomes the section for what follows", () => {
  const text = [
    "Chapter 1 Introduction",
    longPage("Intro", 14),
    "Chapter 2 Supply and demand",
    longPage("Market", 14),
  ].join("\n");
  const chunks = chunkText(text);
  const market = chunks.find((chunk) => chunk.text.includes("Market sentence number 3"));
  assert.ok(market);
  assert.match(market.section, /Chapter 2/);
  const intro = chunks.find((chunk) => chunk.text.includes("Intro sentence number 3"));
  assert.match(intro.section, /Chapter 1/);
});

test("Georgian text is chunked without losing characters", () => {
  const sentence = "ეკონომიკური აზრის განვითარების ისტორია იწყება ძველი საბერძნეთიდან და გრძელდება დღემდე. ";
  const text = sentence.repeat(120);
  const chunks = chunkText(text);
  assert.ok(chunks.length >= 2);
  const joined = chunks.map((chunk) => chunk.text).join(" ");
  assert.ok(joined.includes("ეკონომიკური აზრის განვითარების ისტორია"));
  for (const chunk of chunks) assert.ok(chunk.tokens <= CHUNK_MAX_TOKENS + 90);
});

test("text with no punctuation is hard-split instead of becoming one giant chunk", () => {
  const blob = Array.from({ length: 4000 }, (_, i) => `word${i}`).join(" ");
  const chunks = chunkText(blob);
  assert.ok(chunks.length > 3);
  for (const chunk of chunks) assert.ok(chunk.tokens <= CHUNK_MAX_TOKENS + 90);
});

test("slide markers recover slide numbers for pptx text", () => {
  const pages = pagesFromMarkedText("Slide 1\nWelcome\n\nSlide 2\nSupply curves\n\nSlide 3\nDemand curves");
  assert.deepEqual(pages.map((page) => page.page), [1, 2, 3]);
  const chunks = chunkPages(pages);
  assert.equal(chunks[0].page, 1);
});

test("numbered text format round-trips", () => {
  const chunks = [
    { id: "c00001-0000", page: 3, pageEnd: 4, section: "2.1 Basics", text: "First chunk body." },
    { id: "c00001-0001", page: 0, pageEnd: 0, section: "", text: "Unpaged body." },
    { id: "c00002-0000", page: 9, pageEnd: 9, section: "A | B", text: "Pipe in heading." },
  ];
  const parsed = parseChunks(formatChunks(chunks));
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].page, 3);
  assert.equal(parsed[0].pageEnd, 4);
  assert.equal(parsed[0].section, "2.1 Basics");
  assert.equal(parsed[1].page, 0);
  assert.equal(parsed[1].text, "Unpaged body.");
  assert.equal(parsed[2].section, "A / B");
});

test("stems line up between index terms and query terms", () => {
  assert.equal(stem("chloroplasts"), stem("chloroplast"));
  assert.equal(stem("ეკონომიკის"), stem("ეკონომიკური"));
  assert.equal(stem("წიგნები"), stem("წიგნის"));
  const terms = chunkTerms("Photosynthesis converts light into chemical energy. Photosynthesis happens in chloroplasts.");
  assert.ok(terms.includes(queryTerms("how does photosynthesis work")[0]) || queryTerms("how does photosynthesis work").some((term) => terms.includes(term)));
});

test("token estimate charges Georgian more than the same count of Latin letters", () => {
  assert.ok(estimateTokens("ა".repeat(400)) > estimateTokens("a".repeat(400)) * 2);
});

test("bm25 puts the chunk that actually answers the question first", () => {
  const docs = [
    { id: "a", text: "The mitochondria produce ATP through cellular respiration.", item: "a" },
    { id: "b", text: "Photosynthesis in chloroplasts turns light into sugar.", item: "b" },
    { id: "c", text: "Tax policy and monetary policy in modern economies.", item: "c" },
  ];
  const ranked = bm25("how do chloroplasts do photosynthesis", docs).sort((x, y) => y.score - x.score);
  assert.equal(ranked[0].item, "b");
});

test("rank fusion rewards agreement between vector and keyword lists", () => {
  const fused = reciprocalRankFusion([["x", "a", "b"], ["a", "y", "x"]]);
  assert.equal(fused[0].id, "a");
  assert.deepEqual(new Set(fused.map((item) => item.id)), new Set(["x", "a", "b", "y"]));
});

test("diversity drops overlapping duplicates and caps one book's share", () => {
  const sentence = "the quick brown fox jumps over the lazy dog near the quiet river bank today";
  const ranked = [
    { id: "1", materialId: "m1", text: sentence },
    { id: "2", materialId: "m1", text: `${sentence} again` },
    { id: "3", materialId: "m1", text: "completely different content about economics and trade routes across the sea" },
    { id: "4", materialId: "m1", text: "another unrelated passage on geometry triangles circles and their many angles" },
    { id: "5", materialId: "m2", text: "second source talks about biology cells membranes and the transport of water" },
  ];
  const picked = pickDiverse(ranked, 5, { perMaterialCap: 2 });
  assert.ok(!(picked.some((item) => item.id === "1") && picked.some((item) => item.id === "2")));
  assert.equal(picked.filter((item) => item.materialId === "m1").length, 2);
  assert.ok(picked.some((item) => item.materialId === "m2"));
});

test("locators understand English and Georgian page and chapter asks", () => {
  assert.deepEqual(parseLocator("what is on page 83"), { page: 83 });
  assert.deepEqual(parseLocator("რა წერია მე-12 გვერდზე?"), { page: 12 });
  assert.deepEqual(parseLocator("summarize chapter 5"), { chapter: 5 });
  assert.deepEqual(parseLocator("explain inflation"), {});
});

test("vector helpers behave", () => {
  assert.ok(Math.abs(cosine([1, 0], [1, 0]) - 1) < 1e-9);
  assert.ok(Math.abs(cosine([1, 0], [0, 1])) < 1e-9);
  const unit = l2normalize([3, 4]);
  assert.ok(Math.abs(Math.hypot(...unit) - 1) < 1e-9);
});

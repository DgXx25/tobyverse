/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  collectChatMedia,
  formatSearchAge,
  groupChatResultsByDate,
  normalizeSearchText,
  searchDeletionScope,
  shouldLeaveDeletedSearchRoute,
  searchChats,
  searchMedia,
} = require("../lib/search/chat-search.ts");

const chats = [
  {
    id: "english-content",
    projectId: "science",
    threadId: "english-content",
    title: "Energy notes",
    projectTitle: "Science",
    updatedAt: "2026-09-23T09:00:00.000Z",
    href: "/c/english-content",
    messages: [
      {
        id: "m0",
        role: "assistant",
        content: "Mitochondria make ATP for the cell.",
        createdAt: "2026-09-23T08:59:00.000Z",
      },
    ],
  },
  {
    id: "biology",
    projectId: "science",
    threadId: "biology",
    title: "უჯრედის ბიოლოგია",
    projectTitle: "Science",
    updatedAt: "2026-09-23T08:00:00.000Z",
    href: "/c/biology",
    messages: [
      {
        id: "m1",
        role: "user",
        content: "ამიხსენი მიტოქონდრიის ფუნქცია და ენერგიის წარმოქმნა",
        createdAt: "2026-09-23T07:59:00.000Z",
      },
    ],
  },
  {
    id: "mitochondria-title",
    projectId: "science",
    threadId: "mitochondria-title",
    title: "Mitochondria revision",
    projectTitle: "Science",
    updatedAt: "2026-09-22T08:00:00.000Z",
    href: "/c/mitochondria-title",
    messages: [],
  },
  {
    id: "history",
    projectId: "history",
    threadId: "main",
    title: "საქართველოს ისტორია",
    projectTitle: "History",
    updatedAt: "2026-09-21T08:00:00.000Z",
    href: "/c/history",
    messages: [
      {
        id: "m2",
        role: "assistant",
        content: "დავით აღმაშენებელმა დიდგორის ბრძოლაში გაიმარჯვა.",
        createdAt: "2026-09-21T08:00:00.000Z",
      },
    ],
  },
];

test("normalization makes English matching case-insensitive without changing Georgian", () => {
  assert.equal(normalizeSearchText("  MÍTOCHONDRIA — ფუნქცია  "), "mitochondria ფუნქცია");
});

test("title matches rank ahead of message-only matches", () => {
  const results = searchChats(chats, "mitochondria");

  assert.deepEqual(results.map((result) => result.chat.id), [
    "mitochondria-title",
    "english-content",
  ]);
});

test("repeated weak message hits cannot outrank an exact title match", () => {
  const noisy = {
    id: "noisy",
    projectId: "science",
    threadId: "noisy",
    title: "Loose notes",
    updatedAt: "2026-09-23T10:00:00.000Z",
    href: "/c/noisy",
    messages: Array.from({ length: 20 }, (_, index) => ({
      id: `noise-${index}`,
      role: "assistant",
      content: "The mitochondria appears once in this long conversation.",
      createdAt: "2026-09-23T10:00:00.000Z",
    })),
  };

  assert.equal(searchChats([...chats, noisy], "mitochondria")[0].chat.id, "mitochondria-title");
});

test("chat search finds Georgian keywords inside message context", () => {
  const [result] = searchChats(chats, "მიტოქონდრიის ენერგიის");

  assert.equal(result.chat.id, "biology");
  assert.equal(result.matchedMessageId, "m1");
  assert.match(result.excerpt, /მიტოქონდრიის ფუნქცია და ენერგიის/);
});

test("empty chat query returns recent conversations", () => {
  assert.deepEqual(searchChats(chats, "").map((result) => result.chat.id), [
    "english-content",
    "biology",
    "mitochondria-title",
    "history",
  ]);
});

test("media search uses title, alt text, chat title, and nearby message context", () => {
  const media = [
    {
      id: "cell-diagram",
      chatId: "biology",
      chatTitle: "უჯრედის ბიოლოგია",
      title: "Cell diagram",
      alt: "mitochondria diagram",
      context: "ATP energy production",
      src: "https://example.com/cell.png",
      thumb: "https://example.com/cell-thumb.png",
      createdAt: "2026-09-23T08:00:00.000Z",
    },
    {
      id: "battle-map",
      chatId: "history",
      chatTitle: "საქართველოს ისტორია",
      title: "დიდგორის რუკა",
      alt: "battle map",
      context: "დავით აღმაშენებელი",
      src: "https://example.com/map.png",
      thumb: "https://example.com/map-thumb.png",
      createdAt: "2026-09-21T08:00:00.000Z",
    },
  ];

  assert.deepEqual(searchMedia(media, "ATP mitochondria").map((item) => item.id), ["cell-diagram"]);
  assert.deepEqual(searchMedia(media, "დავით").map((item) => item.id), ["battle-map"]);
});

test("media collection keeps the source chat and nearby message context", () => {
  const [item] = collectChatMedia([
    {
      id: "biology",
      projectId: "science",
      threadId: "biology",
      title: "უჯრედის ბიოლოგია",
      updatedAt: "2026-09-23T08:00:00.000Z",
      href: "/c/biology",
      messages: [
        {
          id: "m1",
          role: "assistant",
          content: "აი მიტოქონდრიის დიაგრამა და მისი ნაწილები.",
          createdAt: "2026-09-23T07:59:00.000Z",
          images: [
            {
              url: "users/u1/projects/science/materials/m1/cell.png",
              thumb: "users/u1/projects/science/materials/m1/cell.png",
              title: "Cell diagram",
              alt: "mitochondria diagram",
              kind: "upload",
              storagePath: "users/u1/projects/science/materials/m1/cell.png",
            },
          ],
        },
      ],
    },
  ]);

  assert.deepEqual(item, {
    id: "biology:m1:0",
    chatId: "biology",
    chatTitle: "უჯრედის ბიოლოგია",
    title: "Cell diagram",
    alt: "mitochondria diagram",
    context: "აი მიტოქონდრიის დიაგრამა და მისი ნაწილები.",
    src: "users/u1/projects/science/materials/m1/cell.png",
    thumb: "users/u1/projects/science/materials/m1/cell.png",
    kind: "upload",
    storagePath: "users/u1/projects/science/materials/m1/cell.png",
    createdAt: "2026-09-23T07:59:00.000Z",
  });
});

test("media collection preserves repeated images when their chat context differs", () => {
  const repeatedImage = {
    url: "https://example.com/shared.png",
    thumb: "https://example.com/shared.png",
    title: "Shared diagram",
  };
  const items = collectChatMedia([
    {
      id: "chemistry",
      projectId: "science",
      threadId: "chemistry",
      title: "Chemistry",
      updatedAt: null,
      href: "/c/chemistry",
      messages: [{ id: "c1", role: "assistant", content: "molecule context", createdAt: null, images: [repeatedImage] }],
    },
    {
      id: "biology",
      projectId: "science",
      threadId: "biology",
      title: "Biology",
      updatedAt: null,
      href: "/c/biology",
      messages: [{ id: "b1", role: "assistant", content: "cell context", createdAt: null, images: [repeatedImage] }],
    },
  ]);

  assert.deepEqual(searchMedia(items, "cell").map((item) => item.chatId), ["biology"]);
  assert.equal(items.length, 2);
});

test("chat results group into Grok-style date sections", () => {
  const now = new Date("2026-09-23T12:00:00.000Z");
  const results = searchChats(chats, "");
  const groups = groupChatResultsByDate(results, now);

  assert.deepEqual(groups.map((group) => [group.label, group.results.map((result) => result.chat.id)]), [
    ["Today", ["english-content", "biology"]],
    ["Yesterday", ["mitochondria-title"]],
    ["Last 7 Days", ["history"]],
  ]);
  assert.equal(formatSearchAge("2026-09-23T10:00:00.000Z", now), "2 hours ago");
  assert.equal(formatSearchAge("2026-09-22T08:00:00.000Z", now), "Yesterday");
});

test("delete scope never removes a standalone container for a nested thread", () => {
  assert.equal(searchDeletionScope({ isDefaultThread: false, projectListed: false }), "thread");
  assert.equal(searchDeletionScope({ isDefaultThread: true, projectListed: true }), "thread");
  assert.equal(searchDeletionScope({ isDefaultThread: true, projectListed: false }), "container");
});

test("deleting a container leaves any active route inside that container", () => {
  assert.equal(shouldLeaveDeletedSearchRoute({
    deletesContainer: true,
    activeProjectId: "standalone",
    deletedProjectId: "standalone",
    activeHref: "/c/nested-thread",
    deletedHref: "/c/standalone",
  }), true);
  assert.equal(shouldLeaveDeletedSearchRoute({
    deletesContainer: false,
    activeProjectId: "project",
    deletedProjectId: "project",
    activeHref: "/c/other-thread",
    deletedHref: "/c/deleted-thread",
  }), false);
});

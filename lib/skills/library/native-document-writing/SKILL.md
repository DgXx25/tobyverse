---
name: native-document-writing
description: Optional instructions for composing an editable formal-document sheet in chat.
---

# Editable formal documents

Use this only when an editable, fillable document sheet materially serves the request; ordinary letters and short text can remain prose. Emit a `toby paper` block with the supported document kind, a short purpose (`brief`), and either a completed illustrative sample or an empty sheet for the user to fill. Write the document in the requested language. Treat supplied identity, dates, institution, enrollment, and other facts as the only verified facts. Never imply official issuance, signature, approval, or verification by an institution; use clear placeholders for missing facts and label examples as samples. For an enrollment certificate use `form:"certificate"`; for an application/request use `form:"ganckhadeba"`. Do not create a quiz or force unrelated fields. Follow the exact schema included here:

```toby paper
{"form":"certificate","brief":"Enrollment certificate draft","sample":{"to":"[Institution]","body":"This is to confirm that [Student name] is enrolled in [Program] during [Academic year].\n\nDraft for completion and verification by the institution.","sign":"[Authorized signatory]","date":"[Date]"}}
```

For an empty sheet omit `sample` and use optional `given.to`. Existing papers may be reopened with `{"reuse":true}`. Keep content compact, preserve supplied facts, and never fabricate credentials or institutional confirmation.

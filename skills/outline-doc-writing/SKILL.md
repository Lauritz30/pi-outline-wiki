---
name: outline-doc-writing
description: Write and edit documents in the Outline wiki so they are findable, correct and safe to change. Use whenever creating a new wiki page, updating an existing one, restructuring a collection, or when the user asks to "document this in the wiki", "write it up in Outline", "update the runbook" or "add a page". Covers where a page belongs, how to structure it, how to update without destroying other people's work, and when to comment instead of edit.
allowed-tools: outline_collections, outline_structure, outline_search, outline_list, outline_read, outline_create, outline_update, outline_move, outline_archive, outline_comment
---

# Writing in the Outline wiki

A wiki page you write is read by people who were not in this session. Write
for them.

## Before you create anything

1. `outline_search` for the topic. **Extending an existing page is almost
   always better than adding a second one.** Duplicates are how wikis die.
2. If nothing exists, `outline_collections` then `outline_structure` on the
   likely collection, so the new page lands where people will look for it.
3. If the right home is ambiguous, ask the user which collection rather than
   picking one at random.

## Where a page goes

- A new topic in an existing area: `outline_create` with
  `parentDocumentId` set to the area's index page.
- A genuinely new area: `outline_create` with `collectionId` only.
- Unsure, or the content is still rough: `publish: false` creates a private
  draft. Tell the user it is a draft and how to publish it.

## Structure that survives

Outline renders the title separately, so **do not repeat the title as an H1**
in the body. Start with a one- or two-sentence summary of what the page is
for, then headings.

Shapes that work:

- **Reference / convention page:** summary, the rule, examples of right and
  wrong, exceptions, who to ask.
- **Runbook:** when to use it, prerequisites, numbered steps with the exact
  commands, how to verify it worked, how to roll back, escalation contact.
- **Decision record:** context, the decision, alternatives considered and why
  they lost, consequences, date and participants.
- **Overview / index:** what lives in this area, one line per child page,
  links to them.

Write plainly. Prefer short paragraphs and real commands in fenced code
blocks over prose describing commands. Date anything time-sensitive
explicitly ("as of 2026-09") so a future reader can judge its age.

## Updating without collateral damage

`outline_update` with the default `mode: replace` **overwrites the entire
body**. Only replace after `outline_read`, and only when you are genuinely
rewriting the page.

- Adding a new section, entry or note: `mode: append`.
- Adding a notice or a newest-first log entry: `mode: prepend`.
- Fixing a typo in a long page: read it, then replace with the corrected
  full text.

Never silently rewrite someone else's page to say something different. If you
disagree with existing content, or if a change is a judgement call the team
should make, `outline_comment` on the page instead of editing it.

## Retiring pages

`outline_archive` is the right tool for a page that is obsolete - it stays
searchable and can be restored. `outline_delete` is for pages that should
never have existed, and permanent deletion only when the user explicitly asks
for it.

`outline_move` re-files a page and takes its children with it; use it when
the content is fine but the location is wrong.

## Finish the job

After writing, tell the user the page title, its id and its URL, and say in
one line what you put there. If you created a draft, say that too.

---
name: outline-wiki
description: Research the team's Outline wiki before answering questions about internal systems, conventions, decisions, runbooks or onboarding. Use whenever a question is about "how we do it here" rather than about general knowledge or the code in front of you - for example architecture decisions, deployment steps, naming conventions, ownership, incident history, or anything the user refers to as "the wiki", "our docs", "Confluence-style notes" or Outline. Also use it to check whether the wiki already covers something before writing a new page.
allowed-tools: outline_status, outline_collections, outline_structure, outline_search, outline_list, outline_read, outline_comments, outline_export
---

# Researching the Outline wiki

The wiki is the team's memory. Code says what the system does; the wiki says
why, who owns it, and what was already tried. Read it before guessing.

## When to reach for it

Use the wiki when the answer depends on this organisation:

- "How do we deploy X?" / "What is our release process?"
- "Why did we choose Y?" / "Is there a decision record for this?"
- "Who owns service Z?"
- "What is our convention for naming / branching / logging?"
- The user mentions a page, a runbook, an ADR, or onboarding notes.

Do **not** use it for general programming questions, or for facts that the
repository in front of you answers directly.

## The loop

1. **Search, do not browse.** `outline_search` with two or three distinctive
   nouns. "postgres failover" beats "how does our database failover work".
2. **Read the top hits.** The search snippet is not the answer.
   `outline_read` on the one or two most promising ids.
3. **Follow the structure.** If a page looks like an index, use
   `outline_read` with `includeChildren: true`, or `outline_structure` on its
   collection, to see what sits under it.
4. **Answer with citations.** Name the document title and id you used, so the
   user can open it. If several pages disagree, say so and give the update
   dates - wikis rot.

## Search that actually finds things

- Start broad, then filter. Only add `collectionId` after
  `outline_collections` told you which collection is relevant.
- If a search returns nothing, try a synonym, an acronym, and the spelled-out
  form before concluding the wiki is silent. Teams write "k8s" and
  "Kubernetes" in different pages.
- Recent-work questions ("what changed lately?") are `outline_list`, not
  `outline_search`.
- Something that existed but is gone is usually archived, not deleted:
  re-run the search with `statusFilter: ["published", "archived"]`.

## Ids

Every tool takes a document id. Ids come from search, list or structure
output - never invent one. An Outline URL like
`https://acme.getoutline.com/doc/runbook-deploy-aBc123XyZ` also works: pass
the trailing `runbook-deploy-aBc123XyZ` slug as `id`.

## Honesty rules

- If the wiki has nothing on the topic, say "the wiki does not cover this"
  rather than filling the gap with plausible-sounding invention.
- Distinguish what the wiki claims from what you verified in the code. A page
  last updated two years ago is a hypothesis, not a fact.
- Check `outline_comments` on a page before treating it as settled; open
  questions and corrections often live in the comments, not the body.

## Pulling content into the repo

When the user wants wiki content available offline or in the repository, use
`outline_export` with a `targetDir` instead of reading page after page
through the model - it writes markdown files directly and costs no context.

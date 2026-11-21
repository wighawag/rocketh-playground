---
title: 'The "Open in playground" link on rocketh.dev only appears when a reader hovers the code block'
type: observation
status: spotted
spotted: 2026-11-21
---

template-svelte-docs's `codeBlockAction` link (its PR #9) is styled like the Copy button, including Copy's behaviour: hidden (`opacity: 0`) until the code block is hovered or the link focused, always visible on touch screens (`@media (hover: none)`). The builder kept it that way because an always-visible link would overlap the language label in the block's corner.

For Copy that is fine: a reader looking to copy hovers. "Open in playground" is an invitation a reader does not know to look for, so on a desktop most will never see it. Spec `open-in-playground`'s first story is "an Open in playground button on a deploy script". Options: make the action always visible in the template (moving the language label aside when there is one), or override it in rocketh-website's own CSS. The first is the template's call, since any site's action has the same problem.

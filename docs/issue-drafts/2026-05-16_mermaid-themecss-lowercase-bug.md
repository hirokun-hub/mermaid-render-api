# Issue draft: themeCSS `foreignObject` selector silently lowercased

**Status**: Draft for second-opinion review (2026-05-16)
**Target**: New Bug Issue in `mermaid-js/mermaid` (not a comment on existing issues)
**Decision basis**: `docs/expert-reviews/2026-05-16_mermaid-issue-report-validity-best-practices.md`

---

## Issue title

```
[Bug] themeCSS `foreignObject` selector silently lowercased in generated SVG, breaking workaround in standalone mode (v11.15.0)
```

## Issue body (English, ready to post)

---

### Summary

In Mermaid v11.15.0, the popular workaround `themeCSS: ".label foreignObject { overflow: visible; }"` (originally shared in #790, 11 hearts) silently fails for SVGs rendered in standalone mode (e.g. `<img src="...svg">`, GitHub Markdown, Slack, Notion). Direct inspection of the generated SVG reveals that the selector is emitted as lowercase `foreignobject` inside `<style>`, while the DOM nodes themselves keep the canonical `<foreignObject>` casing. Because CSS selector matching in the SVG/XML namespace is case-sensitive, the rule never matches.

### Reproduction

Minimal reproduction (pure ASCII, no CJK required):

**`diagram.mmd`**

```
flowchart TD
  A["PrimeDrive auto + check"] --> B["(test + ok)"]
  B --> C["multi line<br>(manual + done)"]
```

**`config.json`** (with the popular workaround)

```json
{
  "theme": "default",
  "htmlLabels": true,
  "flowchart": {
    "htmlLabels": true,
    "useMaxWidth": true
  },
  "themeCSS": ".label foreignObject { overflow: visible; }"
}
```

**Command**

```
mmdc -i diagram.mmd -o output.svg -c config.json -e svg
```

### Observed behavior

`grep` against the produced SVG (verbatim counts):

| condition                    | `foreignobject` (lowercase) in file | `foreignObject` (PascalCase) in file |
|------------------------------|------------------------------------:|-------------------------------------:|
| with `themeCSS` (above)      | **1** (only in `<style>` selector)  | 10 (all DOM nodes)                   |
| without `themeCSS`           | **0**                                | 10 (all DOM nodes)                   |

The single lowercase occurrence in the `<style>` element looks like this:

```css
#my-svg .label foreignobject{overflow:visible;}
```

…while every DOM node retains the original casing:

```xml
<foreignObject width="174.4375" height="24">
  <div xmlns="http://www.w3.org/1999/xhtml" style="...">
    <span class="nodeLabel"><p>PrimeDrive auto + check</p></span>
  </div>
</foreignObject>
```

So the lowercasing is **specific to the `themeCSS` selector pipeline**; it is not a generic transformation applied to the whole SVG output.

Full raw evidence (commit-pinned permalinks):

- With themeCSS:  https://github.com/hirokun-hub/mermaid-render-api/blob/d607ee4/docs/svg-themecss-lowercase-verification-2026-05-16/output-with-themeCSS.svg
- Without themeCSS: https://github.com/hirokun-hub/mermaid-render-api/blob/d607ee4/docs/svg-themecss-lowercase-verification-2026-05-16/output-no-themeCSS.svg

You can reproduce the `grep` counts above with `grep -o foreignobject <file> | wc -l` and `grep -o foreignObject <file> | wc -l` against either SVG.

### Expected behavior

`themeCSS: ".label foreignObject { overflow: visible; }"` should take effect in both inline SVG (HTML host) and standalone SVG (`<img>` / direct file) rendering paths, since users have relied on this workaround since 2019.

### Why standalone SVG breaks but inline SVG works

The same generated SVG is interpreted under two different selector matching regimes depending on how it is rendered:

- **Inline SVG inside an HTML document** — the HTML parser is case-insensitive for element type selectors, so `.label foreignobject` happily matches `<foreignObject>` and the workaround works.
- **Standalone SVG (`<img src="...svg">`, raw `.svg` file in a browser, GitHub Markdown image preview, Slack image, Notion embed)** — the file is parsed as XML and CSS selector matching follows the XML namespace rules, which are case-sensitive. `foreignobject` does **not** match `<foreignObject>`, so the rule is a no-op. See [MDN: Type selectors — Case sensitivity](https://developer.mozilla.org/en-US/docs/Web/CSS/Type_selectors).

This neatly explains the long-standing pattern where users report "the #790 workaround works for me" and "the #790 workaround doesn't work for me" with apparently identical configurations: the deciding factor is the embedding mode, not the configuration.

### Root cause analysis (verified) vs. remaining unknown

**Verified by direct SVG inspection**:

- The `themeCSS` value goes through some part of Mermaid's CSS pipeline that **lowercases the type-selector token** before it is written into the SVG `<style>` element.
- DOM serialization itself preserves the casing of `<foreignObject>`, so this is *not* a generic case-folding of the entire SVG output.

**Not yet verified — left for maintainer bisection**:

The exact stage where the lowercasing happens is not pinpointed yet. Plausible candidates, all of which I have not been able to rule out:

1. Mermaid string preprocessing of `themeCSS` before it reaches `stylis` (in `createUserStyles` / `getStyles` in `packages/mermaid/src/mermaidAPI.ts`).
2. Browser CSSOM serialization in the rendering context. If Mermaid round-trips the CSS through `CSSStyleSheet` / `cssText` while the document is parsed as HTML, the browser will ASCII-lowercase type selectors per the CSSOM spec, regardless of whether the surrounding markup is SVG.
3. Downstream sanitization (DOMPurify or similar) of the `<style>` content.

Independent inspection of `stylis` alone (by a peer reviewer of this report) showed that `compile() + stringify()` preserves the casing of `foreignObject`, so (1) is not the obvious culprit but cannot be excluded without checking the surrounding code paths. (2) feels likely to me as a CSSOM behavior, but I have not instrumented Mermaid's runtime to confirm.

### Suggested fix direction

I am **not opening a PR** at this point — I would like to defer to your judgment on which direction is preferred. Two reasonable shapes:

- **Avoid the CSS pipeline entirely** for this concern: emit `<foreignObject overflow="visible">` (SVG attribute) or `<foreignObject style="overflow: visible">` directly when Mermaid generates the element. SVG's `overflow` attribute is well-defined and not affected by HTML/XML selector-case differences. See [MDN: SVG `overflow` attribute](https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/overflow).
- **Fix the lowercasing in the `themeCSS` pipeline** so the type-selector casing is preserved end-to-end. This restores the documented workaround for everyone and does not require any markup change.

The first option is more robust in my opinion because it sidesteps the entire HTML-vs-XML selector matching issue and works across all embedding modes without depending on CSS at all.

I would be happy to follow up with a PR for either direction once you tell me which path you prefer.

### Workaround tested downstream

For full disclosure: in my own renderer (linked at the bottom), I work around this by post-processing the generated SVG and injecting `style="overflow: visible"` directly into every `<foreignObject>` element. Across 7 representative label patterns × 14 nodes, I observed 6/6 clip-prone cases resolved and 0/7 patterns regressing in layout. This is consistent with the diagnosis above — once the attribute is on the element itself, the selector-case problem is bypassed entirely.

I am sharing this only as confirmation that the proposed direction is sound in practice, not as a substitute for an upstream fix.

### Environment

| field                          | value                                          |
|--------------------------------|------------------------------------------------|
| `mermaid` (core)               | 11.15.0 (bundled inside `@mermaid-js/mermaid-cli`) |
| `@mermaid-js/mermaid-cli`      | 11.14.0                                        |
| renderer                       | `dagre-wrapper` (default)                      |
| `htmlLabels`                   | `true` (default)                               |
| host OS                        | macOS Darwin 25.3.0                            |
| Puppeteer flags                | `--no-sandbox`                                 |

### Related issues (not duplicates of this report, but adjacent)

- #790 — the original "text cut off in SVG export" report, where the `themeCSS` workaround was shared in 2019. The workaround is documented there but its mode-dependent failure was never explained.
- #6424 — "Long Words are Cut Off" (open since 2025-03). Closest symptom match to this report.
- #5785 — "flowchart node label disappears when too wide" (open since 2024).
- #4918 — "Long labels truncated when exported as SVG" (open since 2023).
- #7354 — "Long text clipped in flowchart boxes" (open since 2026-01, approved for investigation). Different shape (vertical box not expanding on multi-line labels), but in the same neighborhood.
- #58 — "Generated SVG works poorly outside web browsers" (open since 2014). Long-standing context.
- #2688 — "Replace foreignObject with standard SVG" (closed). Background on the foreignObject discussion.

### Note on a related but separate problem

I also have quantitative data on a **separate** issue I observed during the same investigation: server-side text-width prediction (via the font available to Puppeteer/Chromium during measurement) diverges from client-side rendering width when the consumer machine falls back to a different font, by roughly +9 to +15 px on pure ASCII labels like `"PrimeDrive auto + check"`. This is not specific to CJK input. I will file it as a separate issue to keep the scope of this report focused; mentioning it here only so the discussions can cross-reference each other later.

### For full context

This report originated from a Mermaid-based rendering API project I maintain at https://github.com/hirokun-hub/mermaid-render-api — the verification artifacts linked above (raw SVGs, configs, expert review trail) live under `docs/` there. Happy to provide additional traces, alternative configurations, or run targeted diagnostics if helpful.

---

## Notes for the author (not for posting)

### What this draft deliberately avoids

- **No "root cause: Mermaid lowercases the selector" assertion as fact.** The lowercasing is observed in the output; the *stage* is hypothesized and explicitly left for maintainer bisection.
- **No PR.** The decision tree on direction (attribute vs. CSS-pipeline fix) is given to the maintainer.
- **No links to Japanese-only internal docs.** All references the maintainer might click are language-agnostic (SVG file blobs).
- **No issue brigading.** Related issues are listed with relationship explained, not piled on as duplicates.

### Permalink commit

All `blob/d607ee4/...` permalinks are pinned to the verification commit so the SVG files cannot disappear from under the issue thread.

### Next steps before posting

1. Second-opinion review across multiple AIs (see `docs/expert-reviews/` directory for ongoing reviews).
2. User final approval.
3. `gh issue create --repo mermaid-js/mermaid --title "..." --body-file <this draft body>` once approved.

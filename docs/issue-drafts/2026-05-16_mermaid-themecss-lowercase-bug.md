# Issue draft: themeCSS `foreignObject` selector silently lowercased

**Status**: Draft v2 (2026-05-16) — incorporates bisect to PR #7737 and develop-branch confirmation
**Target**: New Bug Issue in `mermaid-js/mermaid` (not a comment on existing issues)
**Decision basis**: `docs/expert-reviews/2026-05-16_mermaid-issue-final-review-best-practices.md`

---

## Issue title

```
[Bug] themeCSS lowercases foreignObject selector, breaking SVG workaround in standalone mode
```

(Version is in the Setup section, not the title.)

## Issue body (English, ready to post)

---

### Description

In Mermaid 11.15.0, a commonly suggested workaround `themeCSS: ".label foreignObject { overflow: visible; }"` (shared in #790 in 2019, 11 hearts) silently fails for SVGs rendered in standalone mode (`<img src="...svg">`, GitHub Markdown, Slack, Notion, raw `.svg` file in a browser).

Direct inspection of the generated SVG shows that the selector is emitted as lowercase `foreignobject` inside `<style>`, while the DOM nodes themselves keep the canonical `<foreignObject>` casing. Because CSS selector matching in the SVG/XML namespace is case-sensitive, the rule never matches in standalone mode. In inline SVG mode (rendered inside an HTML document), HTML's case-insensitive matching makes the rule work anyway — which is why this bug presents as "the #790 workaround works for me sometimes and not other times" across different embedding modes.

I bisected this between releases: **11.14.0 preserves the selector casing, 11.15.0 lowercases it**, and the regression is still present on `develop` (build `v11.15.0+2a51ae4`) as of 2026-05-16. The most likely cause is PR #7737 ("fix: create CSS styles using the CSSOM" by @ashishjain0512, merged into 11.15.0), which switched the themeCSS pipeline from stylis to the CSSStyleSheet API. I have **not** done commit-level bisect inside PR #7737, so I am treating "PR #7737 is the cause" as the leading hypothesis from the timing and the nature of the change rather than as a verified fact.

I do not believe this is a security vulnerability; this report is about a functional regression in casing handling of themeCSS selectors. I noticed 11.15.0 includes CSS-injection hardening for the themeCSS pipeline (CVE-2026-41159 / -41148 / -41149) and want to be explicit this is a separate concern from those.

### Steps to reproduce

1. Save the following as `diagram.mmd`:

   ```
   flowchart TD
     A["PrimeDrive auto + check"] --> B["(test + ok)"]
     B --> C["multi line<br>(manual + done)"]
   ```

2. Save the following as `config.json` (using the workaround from #790):

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

3. Run `mmdc -i diagram.mmd -o output.svg -c config.json -e svg`.

4. Inspect the produced `output.svg`:

   ```
   grep -o foreignobject output.svg | wc -l
   grep -o foreignObject output.svg | wc -l
   ```

   On 11.15.0 you get **1** (lowercase, inside `<style>`) and **10** (PascalCase, all DOM nodes).

5. Open `output.svg` directly in a browser (or embed it via `<img src="output.svg">`). Labels with edge-of-bounds text clip; the `overflow: visible` rule does not apply.

6. (Optional) Drop the same SVG into an inline-SVG HTML page. The labels do not clip, because HTML's case-insensitive selector matching saves the workaround.

### Observed behavior (with bisect)

`grep` counts on the produced SVG, holding the input constant and varying only the Mermaid core version:

| Environment                                  | `foreignobject` (lowercase) | `foreignObject` (PascalCase) | `<style>` selector emitted        |
|----------------------------------------------|----------------------------:|-----------------------------:|-----------------------------------|
| mermaid **11.14.0** (pre PR #7737)           |                       **0** |                           11 | `.label foreignObject{...}`       |
| mermaid **11.15.0** (current latest release) |                       **1** |                           10 | `.label foreignobject{...}`       |
| **develop** branch (v11.15.0+2a51ae4)        |                       **1** |                           10 | `.label foreignobject{...}`       |

(Same `diagram.mmd` and `config.json` for all three; same Puppeteer/Chromium version for the two CLI runs; develop-branch row obtained from the Mermaid Live Editor develop site on 2026-05-16.)

So:

- 11.14.0 preserved the `foreignObject` PascalCase selector and the #790 workaround functioned correctly.
- 11.15.0 lowercases the selector inside `<style>`.
- The same lowercasing is still present on `develop` as of 2026-05-16 — the bug is not yet fixed upstream.

DOM nodes are unaffected in all three environments:

```xml
<foreignObject width="174.4375" height="24">
  <div xmlns="http://www.w3.org/1999/xhtml" style="...">
    <span class="nodeLabel"><p>PrimeDrive auto + check</p></span>
  </div>
</foreignObject>
```

So the lowercasing is **specific to the themeCSS selector pipeline**; it is not a generic transformation applied to the whole SVG output.

### Expected behavior

`themeCSS: ".label foreignObject { overflow: visible; }"` should take effect in both inline SVG (HTML host) and standalone SVG (`<img>` / direct file) rendering paths, since users have relied on this workaround since 2019 and the documented behavior in #790 implies casing preservation.

### Why standalone SVG breaks but inline SVG works

The same generated SVG is interpreted under two different selector matching regimes depending on how it is rendered:

- **Inline SVG inside an HTML document** — the HTML parser is case-insensitive for element type selectors, so `.label foreignobject` matches `<foreignObject>` and the workaround works.
- **Standalone SVG (`<img src="...svg">`, raw `.svg` file in a browser, GitHub Markdown image preview, Slack image, Notion embed)** — the file is parsed as XML and CSS selector matching follows the XML namespace rules, which are case-sensitive. `foreignobject` does **not** match `<foreignObject>`, so the rule is a no-op. See [MDN: Type selectors — Case sensitivity](https://developer.mozilla.org/en-US/docs/Web/CSS/Type_selectors).

This appears to explain the long-standing pattern where users report "the #790 workaround works for me" and "the #790 workaround doesn't work for me" with apparently identical configurations: the deciding factor is the embedding mode, not the configuration.

### Cause analysis (release-bisected, commit-level not bisected)

**What is bisected**: between Mermaid 11.14.0 and 11.15.0. With the same input, 11.14.0 emits `.label foreignObject{...}` (PascalCase preserved) and 11.15.0 emits `.label foreignobject{...}` (lowercased). The regression sits at this release boundary.

**Leading hypothesis (not commit-level bisected)**: PR #7737 ("fix: create CSS styles using the CSSOM"), merged into 11.15.0, switched the themeCSS construction path to use the `CSSStyleSheet` API instead of stylis. That timing matches and the nature of the change is consistent with the observed lowercasing. An independent check of stylis alone (`compile() + stringify()`) did not reproduce the lowercasing, which is consistent with PR #7737 being the source rather than stylis. I have not run a commit-by-commit bisect inside PR #7737, so I am not claiming this PR is the cause with certainty.

**Spec-level explanation (plausible mechanism, not instrumented)**: per [W3C CSSOM Module Level 1](https://www.w3.org/TR/cssom-1/) (serialize a selector), a CSS rule constructed via the `CSSStyleSheet` API has its type-selector identifier ASCII-lowercased when the host document is parsed as HTML. Puppeteer's Chromium parses its host document as HTML, so this normalization is in scope for any CSSOM-built selector in this context. That offers a clean explanation for `foreignObject` → `foreignobject`, but I have not instrumented Mermaid's runtime to confirm the lowercasing happens at exactly this step rather than at a neighbouring one.

A note on framing: the CSSOM lowercasing itself is spec-conformant browser behavior — not a Mermaid defect. The user-visible regression is that the documented behavior of the themeCSS workaround silently changed between 11.14.0 → 11.15.0.

### Suggested fix direction

I am holding off on a PR for now — I would like to defer to your judgment on which direction is preferred. Two reasonable shapes:

- **Consider bypassing the CSS pipeline** for this specific concern: emit `<foreignObject overflow="visible">` (SVG attribute) or `<foreignObject style="overflow: visible">` directly when Mermaid generates the element. SVG's `overflow` attribute is defined at the SVG markup level and is completely independent of the CSS selector pipeline, the HTML-vs-XML parser mode, and the CSSOM serialization rules. This is robust against any future CSS-pipeline rewrite (including further CSSOM/sanitization changes). See [MDN: SVG `overflow` attribute](https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/overflow).
- **Restore selector casing in the themeCSS pipeline** end-to-end so the workaround shared in previous issues continues to function. This is more invasive because it touches the CSSOM round-trip and may require generating CSS that does not pass through `CSSStyleSheet`'s lowercase normalization at all.

My current preference is the first option, because it sidesteps the entire HTML/XML selector-case interaction and works across all embedding modes without depending on CSS at all.

I would be happy to follow up with a PR for either direction once you tell me which path you prefer.

### Workaround tested downstream

For full disclosure: in my own renderer (linked at the bottom), I work around this by post-processing the generated SVG and injecting `style="overflow: visible"` directly into every `<foreignObject>` element. Across 7 representative label patterns × 14 nodes, I observed 6/6 clip-prone cases resolved and 0/7 patterns regressing in layout. This is consistent with the diagnosis above — once the attribute is on the element itself, the selector-case problem is bypassed entirely.

I am sharing this only as confirmation that the proposed direction is sound in practice, not as a substitute for an upstream fix.

### Setup

| field                          | value                                                                  |
|--------------------------------|------------------------------------------------------------------------|
| `mermaid` (core)               | 11.15.0 (also confirmed on develop branch v11.15.0+2a51ae4, 2026-05-16) |
| `@mermaid-js/mermaid-cli`      | 11.14.0 (used as the runner; bundles mermaid core via caret range)     |
| Renderer                       | `dagre-wrapper` (default)                                              |
| `htmlLabels`                   | `true` (default)                                                       |
| Browser (in Puppeteer)         | Headless Chromium (bundled with mermaid-cli 11.14.0)                    |
| Host OS                        | macOS Darwin 25.3.0                                                    |
| Puppeteer flags                | `--no-sandbox`                                                         |

### Pre-submission checks

- Reproduced on Mermaid 11.15.0 (current latest release).
- Bisected to PR #7737 by re-running with mermaid 11.14.0 + mermaid-cli 11.14.0 explicitly pinned: 11.14.0 preserves casing.
- Confirmed reproducible on `develop` branch via https://develop.git.mermaid.live as of 2026-05-16 (build `v11.15.0+2a51ae4`).
- This is not the security hardening from CVE-2026-41159 / -41148 / -41149 (all three are patched in 11.15.0). This report is about a functional regression in casing handling, not a security issue.

### Related issues

**Adjacent (not duplicates of this report)**:

- #790 — the original "text cut off in SVG export" report, where the themeCSS workaround was shared in 2019. The workaround is shared there but its mode-dependent failure was never explained.
- #6424 — "Long Words are Cut Off" (open since 2025-03). Closest symptom match to this report, but does not address selector casing or the standalone-mode failure mode of the themeCSS workaround.
- #5785 — "flowchart node label disappears when too wide" (open since 2024).
- #4918 — "Long labels truncated when exported as SVG" (open since 2023).
- #7354 — "Long text clipped in flowchart boxes" (open since 2026-01, approved for investigation). Different shape (vertical box not expanding on multi-line labels), but in the same neighborhood.
- #58 — "Generated SVG works poorly outside web browsers" (open since 2014). Long-standing context.
- #2688 — "Replace foreignObject with standard SVG". Background on the foreignObject discussion.

**Historical context (not duplicates)**:

- PR #445 (Jan 2017, merged by @knsv): "fix cli css style selector text lowercase problem". A similar class of bug was fixed in the CLI's `cloneCssStyles` path nine years ago. The current report concerns a different code path (themeCSS + CSSOM in v11.15.0), but it suggests this is a recurring class of bug that might benefit from a regression test guarding selector casing in generated SVG `<style>` blocks.

### Note on a related but separate problem

I also have quantitative data on a **separate** issue I observed during the same investigation: server-side text-width prediction (via the font available to Puppeteer/Chromium during measurement) diverges from client-side rendering width when the consumer machine falls back to a different font, by roughly +9 to +15 px on pure ASCII labels like `"PrimeDrive auto + check"`. This is not specific to CJK input. I am mentioning it here only so the two reports can cross-reference each other later; I will not file the separate issue unless I confirm independently that it is reproducible in the upstream Mermaid library without any of my downstream code paths involved.

### For full context

The verification artifacts referenced above live in a Mermaid-based rendering API project I maintain at https://github.com/hirokun-hub/mermaid-render-api. Commit-pinned permalinks to the raw SVGs (open them as text — the evidence is in the `<style>` element):

- 11.15.0 + themeCSS:  https://github.com/hirokun-hub/mermaid-render-api/blob/75bcb4d/docs/svg-themecss-lowercase-verification-2026-05-16/output-with-themeCSS.svg
- 11.15.0, no themeCSS (control): https://github.com/hirokun-hub/mermaid-render-api/blob/75bcb4d/docs/svg-themecss-lowercase-verification-2026-05-16/output-no-themeCSS.svg
- 11.14.0 + themeCSS (pre PR #7737): https://github.com/hirokun-hub/mermaid-render-api/blob/75bcb4d/docs/svg-themecss-lowercase-verification-2026-05-16/output-with-themeCSS-mermaid11140.svg
- 11.14.0, no themeCSS (control): https://github.com/hirokun-hub/mermaid-render-api/blob/75bcb4d/docs/svg-themecss-lowercase-verification-2026-05-16/output-no-themeCSS-mermaid11140.svg
- develop branch (v11.15.0+2a51ae4): https://github.com/hirokun-hub/mermaid-render-api/blob/75bcb4d/docs/svg-themecss-lowercase-verification-2026-05-16/output-with-themeCSS-develop-2026-05-16.svg

You can verify the `grep` counts in the table above against any of these files independently.

Happy to provide additional traces, alternative configurations, or run targeted diagnostics if helpful.

---

## Notes for the author (not for posting)

### What this draft v2 changed from v1

- **Title shortened** — version moved to Setup, per second-opinion review.
- **"Root cause" section reframed (not upgraded to "verified")** — the previous draft said "remaining unknown" for the stage; this draft reframes as: release-level bisect between 11.14.0 and 11.15.0 is verified, PR #7737 is the leading hypothesis (timing + nature of change), and the CSSOM-spec mechanism is a plausible explanation. The header reads "Cause analysis (release-bisected, commit-level not bisected)" to keep the certainty boundary visible.
- **CVE context added** — explicit "not a security issue" line to avoid misclassification.
- **PR #445 (2017) added** as "Historical context (not duplicates)" — same class of bug was fixed once nine years ago.
- **11.14.0 vs. 11.15.0 vs. develop bisect table added** — three-environment comparison.
- **Structure reshaped to Mermaid Bug Report template** — Description / Steps to reproduce (numbered) / Setup / Suggested Solutions / Additional Context.
- **Setup added Browser line** and noted develop-branch confirmation.
- **Pre-submission checks** section added per template guidance.
- **Expression softening** applied per expert review: `popular workaround` → `commonly suggested workaround`; `This neatly explains` → `This appears to explain`; `Avoid the CSS pipeline entirely` → `Consider bypassing the CSS pipeline`; `documented workaround` → `workaround shared in previous issues`; `I am not opening a PR at this point` → `I am holding off on a PR for now`; `The first option is more robust in my opinion` → `My current preference is the first option`.
- **Permalink commit updated** — `d607ee4` → `75bcb4d` (the verification commit that includes the new 11.14.0 and develop-branch artifacts).
- **"For full context" softened** — `this report originated from` → `the verification artifacts ... live in a Mermaid-based rendering API project I maintain at` (factual framing).

### What this draft v2 deliberately avoids

- **No PR.** The decision tree on direction (attribute vs. CSS-pipeline fix) is given to the maintainer.
- **No links to Japanese-only internal docs.** All references the maintainer might click are language-agnostic (SVG file blobs).
- **No issue brigading.** Related issues are listed with relationship explained, not piled on as duplicates.

### Next steps before posting

1. ~~Second-opinion review across multiple AIs~~ — done. See `docs/expert-reviews/2026-05-16_mermaid-issue-final-review-best-practices.md`.
2. User final approval.
3. `gh issue create --repo mermaid-js/mermaid --title "..." --body-file <body file>` once approved.

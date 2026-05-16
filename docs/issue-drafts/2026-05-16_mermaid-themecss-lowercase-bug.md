# Issue draft: themeCSS `foreignObject` selector silently lowercased

**Status**: **Posted as `mermaid-js/mermaid#7759`** on 2026-05-16
**Posted URL**: https://github.com/mermaid-js/mermaid/issues/7759
**Source draft**: v2.1 (2026-05-16) — incorporates v2 + second-opinion review on v2 differential
**Target**: New Bug Issue in `mermaid-js/mermaid` (not a comment on existing issues)
**Decision basis**: `docs/expert-reviews/2026-05-16_mermaid-issue-final-review-best-practices.md` and the second-opinion review applied below

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

I bisected this between releases: **11.14.0 preserves the selector casing, 11.15.0 lowercases it**, and the regression is still present on `develop` (build `v11.15.0+2a51ae4`) as of 2026-05-16. The leading candidate is PR #7737 ("fix: create CSS styles using the CSSOM" by @ashishjain0512, merged into 11.15.0), which introduces a CSSOM-based step in the themeCSS construction path. The PR also includes related changes such as handling `&` in CSS namespacing, so it is not a wholesale replacement of stylis. I have **not** done a commit-level bisect inside PR #7737, so I am treating "PR #7737 is the cause" as the leading hypothesis based on the timing and the nature of the change rather than as a verified fact.

To be clear, this is not a security report. Mermaid 11.15.0 also includes CSS-injection hardening in the themeCSS pipeline (CVE-2026-41159 / -41148 / -41149), so I want to be explicit that this report is about a separate functional regression — a regression in casing handling of themeCSS selectors, not a vulnerability.

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

5. Open `output.svg` directly in a browser (or embed it via `<img src="output.svg">`). Text at the edges of the labels is clipped; the `overflow: visible` rule does not apply.

6. (Optional) Drop the same SVG into an inline-SVG HTML page. The labels do not clip, because HTML's case-insensitive selector matching saves the workaround.

### Observed behavior (with bisect)

`grep` counts on the produced SVG, holding the input constant and varying only the Mermaid core version:

| Environment                                  | `foreignobject` (lowercase) | `foreignObject` (PascalCase) | `<style>` selector emitted        |
|----------------------------------------------|----------------------------:|-----------------------------:|-----------------------------------|
| mermaid **11.14.0** (pre PR #7737)           |                       **0** |                           11 | `.label foreignObject{...}`       |
| mermaid **11.15.0** (current latest release) |                       **1** |                           10 | `.label foreignobject{...}`       |
| **develop** branch (v11.15.0+2a51ae4)        |                       **1** |                           10 | `.label foreignobject{...}`       |

(Same `diagram.mmd` and `config.json` for all three. For the two CLI rows, only the Mermaid core version was changed; the same mermaid-cli/Puppeteer setup was used. The develop-branch row was obtained by downloading the SVG from the Mermaid Live Editor's develop deployment (`develop.git.mermaid.live`) on 2026-05-16; the Live Editor renders SVG with the same CSSOM-built `<style>` block as the CLI path — only the outer rendering context differs.)

Summary:

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

**Leading hypothesis (not commit-level bisected)**: PR #7737 ("fix: create CSS styles using the CSSOM"), merged into 11.15.0, introduces a CSSOM-based step in the themeCSS construction path (commit `37ff937`), alongside related changes such as handling `&` in CSS namespacing. The timing matches and the nature of the change is consistent with the observed lowercasing. An independent check of stylis alone (`compile() + stringify()`) did not reproduce the lowercasing, which is consistent with PR #7737 being the source rather than stylis. I have not run a commit-by-commit bisect inside PR #7737, so I am not claiming this PR is the cause with certainty.

**Spec-level explanation (plausible mechanism, not instrumented)**: per [W3C Selectors Level 4](https://www.w3.org/TR/selectors-4/) (case sensitivity) and [W3C CSSOM Module Level 1](https://www.w3.org/TR/cssom-1/) (serialize a selector), HTML documents treat element type selectors as case-insensitive; when CSS is built via the `CSSStyleSheet` API in an HTML-hosted context, the resulting selector serialization is consistent with the lowercased form. Puppeteer's Chromium parses its host document as HTML, so this normalization is in scope for any CSSOM-built selector in this context. That offers a clean explanation for `foreignObject` → `foreignobject`, but I have not instrumented Mermaid's runtime to confirm the lowercasing happens at exactly this step rather than at a neighbouring one.

A note on framing: the CSSOM lowercasing itself is spec-conformant browser behavior — not a Mermaid defect. The user-visible regression is that a workaround shared in previous issues changed behavior silently between 11.14.0 and 11.15.0.

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
- Release-bisected to the 11.14.0 → 11.15.0 boundary by re-running with mermaid 11.14.0 + mermaid-cli 11.14.0 explicitly pinned: 11.14.0 preserves casing. PR #7737 (merged into 11.15.0) is the leading hypothesis; not commit-level bisected.
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

- PR #445 (Jan 2017, merged by @knsv): "fix cli css style selector text lowercase problem". A similar selector-casing issue was fixed in the CLI's `cloneCssStyles` path nine years ago. The current report concerns a different code path (themeCSS + CSSOM in v11.15.0), but the recurrence may be worth noting when designing the fix.

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

### What v2.1 changed from v2 (second-opinion differential review)

- **§3.6 internal consistency fix (required)** — `Bisected to PR #7737` → `Release-bisected to the 11.14.0 → 11.15.0 boundary` + explicit note that PR #7737 is a leading hypothesis, not commit-level bisected. Aligns the Pre-submission checks line with the §3.3 Cause analysis framing.
- **§3.1 CVE wording firmness** — `I do not believe this is a security vulnerability` → `To be clear, this is not a security report` (avoids the non-native reading of "I do not believe" as report-author uncertainty); also fixed `want to be explicit this is` → `want to be explicit that this is`.
- **§3.2 / §3.3 PR #7737 description precision** — `switched the themeCSS pipeline from stylis to the CSSStyleSheet API` → `introduces a CSSOM-based step in the themeCSS construction path`, with an added note that PR #7737 includes related stylis-touching changes (e.g. `&` namespacing), so it is not a wholesale replacement. Avoids overclaim about the internals of PR #7737.
- **§3.3 CSSOM mechanism precision** — added W3C Selectors Level 4 (case sensitivity) alongside CSSOM Module Level 1; reframed the lowercasing as the result of HTML's case-insensitive type-selector treatment that CSSOM then serializes, not as something CSSOM serialization itself produces.
- **§3.3 closing line softened** — `the documented behavior of the themeCSS workaround silently changed` → `a workaround shared in previous issues changed behavior silently` (avoids implying the workaround is officially documented).
- **§3.7 PR #445 framing softened** — `recurring class of bug that might benefit from a regression test guarding selector casing` → `the recurrence may be worth noting when designing the fix` (less prescriptive; leaves the choice of mitigation entirely to the maintainer).
- **§3.4 register fix** — `So:` → `Summary:` (more formal register matching surrounding prose).
- **§3.5 step 5 phrasing** — `Labels with edge-of-bounds text clip` → `Text at the edges of the labels is clipped` (more natural English).
- **§3.2 collocation** — `the leading hypothesis from the timing and the nature of the change` → `the leading hypothesis based on the timing and the nature of the change`.
- **§3.4 caveat expanded** — `same Puppeteer/Chromium version for the two CLI runs` made explicit and extended to clarify how the develop-branch row was obtained (downloaded from `develop.git.mermaid.live`), pre-empting a likely maintainer question.

### What this draft v2.1 deliberately avoids

- **No PR.** The decision tree on direction (attribute vs. CSS-pipeline fix) is given to the maintainer.
- **No links to Japanese-only internal docs.** All references the maintainer might click are language-agnostic (SVG file blobs).
- **No issue brigading.** Related issues are listed with relationship explained, not piled on as duplicates.

### Posting timeline

1. ~~Second-opinion review across multiple AIs (v1)~~ — done. See `docs/expert-reviews/2026-05-16_mermaid-issue-final-review-best-practices.md`.
2. ~~Second-opinion differential review on v2 → v2.1~~ — done. Three reviewers (O / A / G) all judged "post as is" or "post after minor edits"; all minor edits are reflected above.
3. ~~User final approval~~ — granted 2026-05-16.
4. ~~`gh issue create --repo mermaid-js/mermaid --title "..." --body-file <body file>`~~ — posted 2026-05-16T12:24:06Z as **mermaid-js/mermaid#7759** (initial label: `Status: Triage`).

### Post-submission watchpoints

- Watch for `Status: Triage` → `Status: Approved` transition over the next 24-48 hours. If the label has not moved after 48 hours and there is no maintainer comment, a single one-time bump comment is acceptable; multiple bumps are not.
- If a maintainer asks for a PR direction (SVG attribute injection vs. CSSOM-pipeline fix), respond with the preference stated in the Issue body and request guidance before opening a PR.
- If a maintainer flags this as a duplicate of an existing issue, surface the new evidence (release-level bisect to 11.14.0 → 11.15.0 boundary, develop-branch confirmation) that distinguishes this report.

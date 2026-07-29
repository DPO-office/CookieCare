# RandTrust — UI/UX Design System Audit
**Date:** July 2026  
**Scope:** Full frontend codebase (`/frontend/src`)  
**Methodology:** Static code analysis of all page and component files  
**Reference Products:** OneTrust, Vanta, Drata, DataGrail, Linear

---

## Executive Summary

RandTrust is a functionally complete enterprise SaaS platform. However, the UI has grown organically across 11+ feature areas without a shared design system contract. The result is a product that *looks* consistent at a glance (same primary blue, same card shape) but breaks down under scrutiny: page headers are structured differently across every single feature, spacing values are inconsistent, three parallel upload flows share no common component, and there is no token-driven system for typography or spacing. The fixes required are not a redesign — they are a normalisation pass using an agreed set of tokens and patterns already partially present in the code.

---

## 1. LAYOUT INCONSISTENCIES


### 1.1 Page Header Structure — HIGH

**What is inconsistent:**  
Every page constructs its header differently. There is no shared `<PageHeader>` component.

| Page | Header padding | Title bottom margin | Subtitle class | Divider |
|---|---|---|---|---|
| Dashboard | `px-8 py-6`, `mb-6` | `mt-1` | `text-[13px]` | none |
| Analyze Agreements | `px-8 py-7`, `mb-8 pb-5 border-b` | `mt-1.5` | `text-sm` | `border-b border-gray-100` |
| Draft Agreements | `px-10 pt-8 pb-6` (inside workspace) | `mt-1` | `text-[13px]` | none |
| Ask AI Lawyer | `px-10 pt-8 pb-0` | `mt-1` | `text-[13px]` | none |
| Negotiate Redlines | `px-10 pt-8 pb-6` | `mt-1` | `text-[13px]` | none |
| Cookie Scanner | `px-10 py-8`, `mb-8` | `mt-1` | `text-[13px]` | none |
| Vulnerability Scanner | `px-10 py-8`, `mb-8` | `mt-1` | `text-[13px]` | none |
| Vendor Review (upload) | `px-10 py-8`, `mb-8` inside `max-w-5xl` | `mb-2.5` | `text-[13.5px]` | none |
| DPA Review (upload) | `px-10 py-8`, `mb-8` inside `max-w-5xl` | `mb-2.5` | `text-[13.5px]` | none |
| AI Ethics (upload) | `px-10 py-8`, `mb-8` inside `max-w-5xl` | `mb-2.5` | `text-[13.5px]` | none |
| Admin Panel | `px-10 py-8`, `mb-10` (with icon in title) | `mt-1.5 ml-12` | `text-[13px]` | none |

**Why it affects UX:**  
The eye perceives different visual weights as the user navigates. The Analyze page has a bottom border divider no other page has. The Admin Panel inserts an icon directly into the `<h1>` tag, which is architecturally incorrect and creates misalignment with the subtitle. The Vendor/DPA/Ethics upload pages use `text-[13.5px]` subtitles while every other page uses `text-[13px]`. These micro-differences accumulate into a feeling of incompleteness.

**Recommendation:**  
Create a shared `<PageHeader title subtitle />` component with fixed tokens: `px-10 pt-8 pb-0`, title `text-[26px] font-bold tracking-tight` in brand blue, subtitle `text-[13px] text-gray-500 mt-1`. Use it on every page. Remove the icon from the Admin Panel h1 — place it as a decorative element alongside, not inside, the heading.

---

### 1.2 Content Container Width Strategy — HIGH

**What is inconsistent:**  
Pages that should be full-width (scanners, results pages) behave consistently. However, the three "upload" pages (Vendor Review, DPA Review, AI Ethics) wrap their content in `max-w-5xl mx-auto` while the scanner pages (Cookie Scanner, Vulnerability Scanner) stretch to full width with just `px-10`. There is no documented rule for when to cap width.

**Why it affects UX:**  
The upload pages feel centred and constrained; the scanner pages feel wide and open. On large monitors this makes the product feel architecturally inconsistent — two tools under the same "Privacy" section render at completely different layout widths.

**Recommendation:**  
Define a single layout contract: tool pages that are primarily form/upload-based use `max-w-4xl mx-auto`. Tool pages with results tables or data grids remain full-width. Apply this rule uniformly across Cookie Scanner, Vulnerability Scanner, Analyze Agreements (form state), and the three upload-state pages.

---

### 1.3 Vertical Section Spacing — MEDIUM

**What is inconsistent:**  
The gap between the page header and first content block varies widely:  
- Dashboard: `mb-6` (24px)  
- Analyze: `mb-8` with a divider (32px + border)  
- Draft/Negotiate: no explicit gap — padding is absorbed into `pt-8 pb-6`  
- Admin Panel: `mb-10` (40px)  
- Vendor/DPA/Ethics upload: `mb-8` (32px)  

The gap between cards/sections within a page also varies: `mb-6`, `mb-8`, `space-y-5`, `space-y-6`.

**Why it affects UX:**  
Users perceive vertical rhythm as a signal of content hierarchy. When spacing is arbitrary, the eye cannot efficiently group related content. The Admin Panel's `mb-10` header gap feels isolated and disconnected from its table below.

**Recommendation:**  
Adopt a 4-point spacing scale. Define three canonical section gaps as Tailwind utilities or CSS vars: `--section-gap-sm: 24px` (mb-6), `--section-gap-md: 32px` (mb-8), `--section-gap-lg: 40px` (mb-10). Use `mb-6` between all KPI cards and their neighbours; use `mb-8` between the page header and the first content section; never exceed `mb-8` for in-page section gaps.

---

### 1.4 Page-Level Scroll Container — MEDIUM

**What is inconsistent:**  
Some pages own their own scroll container (`overflow-y-auto` on the page root), others use `min-h-screen` and rely on the browser's default scroll:

- Dashboard: `overflow-y-auto … min-h-screen` — double scroll signal
- Cookie Scanner: `overflow-y-auto … min-h-screen` — same issue
- Vulnerability Scanner: `overflow-y-auto pb-12 … min-h-screen`
- Analyze: `overflow-hidden` with internal scroll — correct pattern
- Vendor/DPA/Ethics results: `overflow-y-auto` — correct
- DraftAgreement: `overflow-hidden flex h-screen` — correct

**Why it affects UX:**  
`min-h-screen` on a page that is already inside a `h-screen overflow-hidden` shell (`App.tsx`) has no effect, but it signals to the reader that the component does not understand its layout context. The double `overflow-y-auto + min-h-screen` is a code smell that can cause double scrollbars in some edge cases.

**Recommendation:**  
Remove `min-h-screen` from all pages that live inside the main shell. The scroll container should be the `<main>` wrapper or the top-level div of each page — not both. Standardise: every full-page feature component should start with `<div className="flex-1 overflow-y-auto px-10 py-8">`.

---

## 2. TYPOGRAPHY INCONSISTENCIES

### 2.1 Page Title Sizes — HIGH

**What is inconsistent:**  
All page titles use `text-[26px]` *except* the results pages of DPA Review, AI Ethics, and Vendor Review, which switch to `text-[24px]`. This creates a subtle but real size change between the upload state and results state *of the same feature*.

**Why it affects UX:**  
When the page transitions from upload → results, the visual anchor (the title) shrinks by 2px. This creates an imperceptible but cumulative feeling of the UI "deflating" after an AI analysis runs.

**Recommendation:**  
Standardise all page-level `<h1>` to `text-[26px] font-bold tracking-tight`. The results states are still the same "page" — there is no reason to reduce the title size on completion.

---

### 2.2 Section Heading Sizes — MEDIUM

**What is inconsistent:**  
Section headings (`<h2>`, `<h3>`) within cards and panels have no consistent size:
- "What we'll analyze" heading in upload pages: `text-[16px] font-bold`
- "Target audit scope" in Vulnerability Scanner: `text-[14px] font-bold`
- "Audit settings" in Cookie Scanner form: `text-[14px] font-bold`
- "Download report" in Cookie Scanner results: `text-[14px] font-bold`
- Document Ledger header in Dashboard: `text-[13px] font-bold`
- Sidebar section headers (Legal, Privacy, etc.): `text-[10px] font-semibold uppercase tracking-wider`
- Score Breakdown sidebar labels: use `section-label` CSS class (not defined in audited files — appears to be a custom class)

**Why it affects UX:**  
There is no clear h2/h3/h4 hierarchy. `text-[16px]` and `text-[14px]` are used interchangeably for the same visual role. The `section-label` class in the results pages is a good pattern — but it is only used on sidebar widgets, not universally.

**Recommendation:**  
Define three explicit heading tokens:  
- `heading-page`: `text-[26px] font-bold tracking-tight` — page `<h1>`  
- `heading-section`: `text-[15px] font-semibold text-gray-900` — card/section `<h2>`  
- `heading-card`: `text-[13px] font-semibold text-gray-700` — widget/card header  
- `label-category`: `text-[11px] font-semibold uppercase tracking-wider text-gray-500` — table headers, sidebar labels  

Apply these tokens through a utility class or Tailwind variant. Never use arbitrary pixel sizes for type hierarchy.

---

### 2.3 Subtitle / Description Text — LOW

**What is inconsistent:**  
Page-level subtitle text varies between `text-[13px]` (most pages) and `text-[13.5px]` (Vendor Review, DPA, AI Ethics upload pages). Body text inside cards uses `text-[12px]`, `text-[12.5px]`, `text-[13px]` with no clear rule.

**Why it affects UX:**  
Fractional font sizes (`13.5px`) are not standard Tailwind values and produce inconsistent rendering across browsers. They also indicate that individual components were sized by feel rather than from a type scale.

**Recommendation:**  
Lock all descriptive text to `text-[13px]` (page subtitles) and `text-xs` / `text-[12px]` (card body text). Remove all `text-[13.5px]` instances and replace with `text-[13px]`. Establish a type scale: 26/18/15/13/12/11/10px.

---

### 2.4 Inline Hardcoded Pixel Sizes vs Tailwind Scale — MEDIUM

**What is inconsistent:**  
The codebase uses a mixture of arbitrary pixel-bracket sizing (`text-[26px]`, `text-[13px]`, `w-[17px]`, `h-[18px]`) and standard Tailwind scale classes (`text-sm`, `text-xs`). Both patterns appear even within the same file (Analyze Agreements uses `text-sm` for one subtitle and `text-[28px]` for its title, while every other page uses `text-[26px]`).

**Specific case:** `InteractAnalyze.tsx` uses `text-[28px]` for the page title — 2px larger than every other page.

**Why it affects UX:**  
This creates a visually heavier "Analyze Agreements" page compared to all other pages. It also makes the codebase harder to maintain — a global typography change requires finding every `text-[NNpx]` instance instead of updating a single token.

**Recommendation:**  
Define Tailwind custom text size tokens in `tailwind.config` or use CSS variables. Migrate all `text-[28px]` instances on Analyze Agreements to `text-[26px]` immediately. Long-term: prohibit arbitrary bracket sizes in favour of named tokens.

---

## 3. COMPONENT INCONSISTENCIES

### 3.1 Button Styles — HIGH

**What is inconsistent:**  
There is no shared `<Button>` component. Every feature implements buttons inline with slightly different spacing:

| Context | Class | Padding | Rounded | Shadow | Height |
|---|---|---|---|---|---|
| Primary action (Scanner) | `bg-[#2175D9] text-white text-[13px] font-semibold rounded-xl px-6 py-2.5` | `px-6 py-2.5` | `rounded-xl` | `shadow-xs` | inferred ~40px |
| Primary action (Vendor Results) | `btn-primary w-full justify-center py-2.5` | `py-2.5` (from util class) | ? | ? | ? |
| Secondary action (Results) | `btn-secondary text-[12px] py-2 px-4` | `px-4 py-2` | ? | ? | ? |
| Sidebar nav item | `px-3 py-2 rounded-lg text-[13px]` | `px-3 py-2` | `rounded-lg` | none | inferred ~36px |
| TopNav profile menu item | `px-4 py-2 text-[12.5px]` | `px-4 py-2` | none | none | ~36px |
| Negotiate Redlines toolbar button | `h-9 px-3 rounded-xl` | `px-3` explicit `h-9` | `rounded-xl` | `shadow-xs` | explicit 36px |

The `btn-primary` and `btn-secondary` classes are referenced but not defined in the files audited — they appear to be Tailwind utilities or custom CSS. Their definition needs audit.

**Why it affects UX:**  
Buttons of the same importance level (primary CTAs) have different padding, different corner radii, different font sizes. The eye perceives these as *different component types*, which increases cognitive load.

**Recommendation:**  
Create a `<Button variant="primary" | "secondary" | "ghost" size="sm" | "md" | "lg">` component. Define exact tokens:
- **Primary**: `bg-[#2175D9] text-white rounded-xl px-5 py-2.5 text-[13px] font-semibold shadow-xs`
- **Secondary**: `bg-white text-gray-700 border border-gray-200 rounded-xl px-5 py-2.5 text-[13px] font-medium hover:bg-gray-50 shadow-xs`
- **Ghost**: `text-gray-600 hover:bg-gray-100 rounded-lg px-3 py-2 text-[13px] font-medium`
- **Icon button**: explicit `w-9 h-9 rounded-xl flex items-center justify-center`

Replace all inline button styling with this component. Remove `btn-primary` / `btn-secondary` if they exist.

---

### 3.2 Upload Areas — HIGH

**What is inconsistent:**  
Three feature areas implement file upload independently:  
- **Vendor Review** (`UploadState.tsx`): large gradient card with dashed border, icon animates on hover, shows document type badges  
- **DPA Review** (`DPAUploadState.tsx`): nearly identical, with slightly different padding and smaller icon container  
- **AI Ethics** (`EthicsUploadState.tsx`): identical structure to Vendor Review, but with different badge labels and icon size  

All three have identical drag-drop logic, identical file-preview cards after upload, and identical "Browse files" underline styling. Yet all three are 200+ line standalone files.

**Why it affects UX:**  
If one upload area has a bug, the others keep the bug. If the UX for one is improved (e.g., error handling for file size), the improvement doesn't propagate. The visual delta between them is so small that users perceive them as the same component — but they aren't.

**Recommendation:**  
Extract a shared `<FileUploadZone onFilesSelected acceptedTypes badges>` component immediately. All three should use the same component with configuration props. This is the single most impactful refactor for enterprise polish. This is how Linear, Notion, and Vanta handle shared upload UX.

---

### 3.3 Empty States — MEDIUM

**What is inconsistent:**  
Empty states use inconsistent structure:  
- Dashboard (no docs): icon in rounded square `w-10 h-10 rounded-xl bg-gray-50 border border-gray-100`, title `text-[13px] font-semibold`, subtitle `text-[12px]`  
- Cookie Scanner (pre-scan): similar icon box, title `text-[14px] font-bold tracking-tight`, subtitle `text-[12px]`  
- Vault library (no items — in code): no icon, just text (assumed from similar pattern)  
- Analyze Agreements (no selected folders): not shown in files audited, but expected to exist

The copy patterns are good ("Ready to scan" / "No documents yet"), but the visual hierarchy is inconsistent.

**Why it affects UX:**  
An empty state is a first-run experience. If it feels inconsistent, the user perceives the product as incomplete.

**Recommendation:**  
Create an `<EmptyState icon title subtitle />` component. Use it everywhere a "no data" state appears. Lock the structure: icon inside `w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center`, title `text-[14px] font-semibold text-gray-700`, subtitle `text-[12px] text-gray-500 max-w-sm leading-relaxed`.

---

### 3.4 Badge Components — MEDIUM

**What is inconsistent:**  
Badge styles vary by feature:  
- **Dashboard KPI badge** (score): `px-2.5 py-1 rounded-md text-[11px] font-bold` with dynamic BG color  
- **Admin panel role badge**: `text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md border` with semantic colors  
- **Vendor Review finding status**: `px-2.5 py-0.5 rounded-md text-[11px] font-semibold` (from `FindingBadge.tsx`)  
- **Cookie Scanner severity badge**: inline classes, `px-2.5 py-0.5 rounded-md text-[11px] font-semibold` (from `severityBadgeClass` util)  
- **Sidebar "soon" badge**: `text-[9px] font-semibold tracking-wider uppercase rounded px-1.5 py-0.5 bg-gray-100 text-gray-400`  

The padding and text size vary (`text-[9px]`, `text-[10px]`, `text-[11px]`). Some badges use `font-semibold`, others use `font-bold`. Some have border, others don't.

**Why it affects UX:**  
Badges are semantic indicators (status, role, category). When they look visually inconsistent, users cannot build a mental model of what each badge "means" at a glance.

**Recommendation:**  
Create a `<Badge variant="success" | "warning" | "error" | "neutral" | "info" size="sm" | "md">` component:  
- **Size sm**: `px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide`  
- **Size md**: `px-2.5 py-1 rounded-md text-[11px] font-semibold`  
Variants control background and text color only. Standardise all badge usage across the app.

---

### 3.5 Card/Panel Border Radius — LOW

**What is inconsistent:**  
Cards use `rounded-[18px]`, `rounded-[20px]`, `rounded-xl` (12px), `rounded-2xl` (16px), `rounded-[14px]`, and `rounded-[16px]` with no clear rule. The most common value is `rounded-[18px]`, followed by `rounded-xl`.

**Why it affects UX:**  
Inconsistent border radius creates a lack of visual cohesion. On a 4K monitor, a `rounded-xl` card next to a `rounded-[18px]` card looks like they belong to different products.

**Recommendation:**  
Choose one: `rounded-[18px]` (current majority) or `rounded-xl` (standard Tailwind scale). Replace all others. Never use `rounded-[14px]` or `rounded-[20px]` again.

---

### 3.6 Progress / Analyzing State — MEDIUM

**What is inconsistent:**  
Three features (Vendor Review, DPA Review, AI Ethics) have custom `AnalyzingState` components. Cookie Scanner and Vulnerability Scanner use the shared `<AiProgressOverlay>` component instead. The three custom analyzing states are not audited in detail here, but the fact that they exist alongside `AiProgressOverlay` suggests a split pattern.

**Why it affects UX:**  
"Loading" is one of the highest-anxiety moments in the UX. Inconsistent patterns for loading/analyzing states mean the app feels like multiple products during the high-stakes AI processing phase.

**Recommendation:**  
Standardise all long-running AI operations to use `<AiProgressOverlay>`. If `AnalyzingState` components have unique UI that `AiProgressOverlay` does not support (step-by-step status), extend `AiProgressOverlay` to accept a `steps` prop and retire the one-off components.

---

### 3.7 Input Field Styles — MEDIUM

**What is inconsistent:**  
Text inputs appear in two main styles across the codebase:

**Style A** (Scanner/Vuln Scanner forms):  
`bg-gray-50 border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-[13px] focus:bg-white focus:ring-2 focus:ring-gray-100 focus:border-gray-300`

**Style B** (Analyze Agreements DocumentSelector):  
`border border-gray-200 bg-gray-50/80 px-3.5 py-2 text-sm rounded-lg focus:ring-2 focus:ring-gray-200`

Differences: `rounded-xl` vs `rounded-lg`, `py-2.5` vs `py-2`, `text-[13px]` vs `text-sm`, `focus:ring-gray-100` vs `focus:ring-gray-200`.

**Why it affects UX:**  
Users tab between inputs across features. When focus rings and heights differ, the experience feels unstable.

**Recommendation:**  
Standardise to: `bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-100 focus:border-gray-300 transition`.

---

### 3.8 Tabs Component — MEDIUM

**What is inconsistent:**  
The findings/recommendations tab pattern appears identically in three results pages (DPA, Vendor, AI Ethics) but each has it hardcoded inline:

```jsx
// All three have this exact structure, repeated three times:
<div className="flex items-center gap-2">
  {(["findings", "recommendations"] as const).map((t) => (
    <button className={`... ${activeTab === t ? "bg-[#2175D9] text-white" : "bg-white text-gray-500 border..."}`}>
```

The inline style background `style={{ background: "#2175D9" }}` is used instead of the Tailwind utility `bg-brand-primary` (which exists in `index.css` via `@theme`).

**Why it affects UX:**  
Duplicated code means any future change to tab styling (e.g. pill shape vs underline) requires updating three files. More importantly, the inline `style={{ background: "#2175D9" }}` bypasses the CSS variable system that is already defined, making a brand colour change require touching dozens of inline styles.

**Recommendation:**  
Create a `<Tabs tabs activeTab onChange>` component. Replace all three inline tab implementations. Use `bg-brand-primary` Tailwind class instead of `style={{ background: "#2175D9" }}` everywhere active states are set.

---

## 4. BRANDING INCONSISTENCIES

### 4.1 Primary Color Application — HIGH

**What is inconsistent:**  
The brand color `#2175D9` is defined in three places: `index.css` (CSS variables), `colors.ts` (JS constants), and as inline `style` attributes throughout the codebase. Despite having `--brand-primary` as a CSS variable and `bg-brand-primary` as a Tailwind token (via `@theme`), no component actually uses the token — everything uses the hardcoded hex or inline style.

Count of `style={{ background: "#2175D9" }}` occurrences: 15+ across various files.  
Count of `style={{ color: "#2175D9" }}` occurrences: 10+ (all page title headings).

**Why it affects UX:**  
Any rebranding requires a manual find-and-replace operation across 25+ files. This is not enterprise-grade maintainability.

**Recommendation:**  
Replace all `style={{ background: "#2175D9" }}` with `className="bg-brand-primary"` and all `style={{ color: "#2175D9" }}` with `className="text-brand-primary"`. These tokens already exist — they're just not being used. This is a one-sprint refactor with zero visual change.

---

### 4.2 Notification/Accent Color (Indigo) vs Brand Blue — MEDIUM

**What is inconsistent:**  
The TopNav notification dot and the user avatar gradient both use `#6366F1` (Indigo / Tailwind indigo-500). The profile role badge in the dropdown also uses `#6366F1` as background. This is a distinct second brand color that appears nowhere else in the UI.

**Why it affects UX:**  
The indigo colour has no semantic relationship to the brand blue used everywhere else. Users cannot build a consistent color model. It makes the TopNav feel like it belongs to a different product.

**Recommendation:**  
Replace the notification dot, avatar gradient, and role badge with the primary brand color `#2175D9`. If a distinct "user/identity" accent is needed, derive it from the brand palette (a darker shade or a complementary tint), not an arbitrary indigo. The avatar could use `bg-brand-primary` with white text.

---

### 4.3 Shadow Scale Inconsistency — LOW

**What is inconsistent:**  
Cards mix `shadow-xs`, `shadow-sm`, `shadow-md` and `shadow` with no consistent elevation system:
- Most result cards: `shadow-xs`
- Hover state on upload zone: `shadow-md`
- TopNav: custom `boxShadow: "0 1px 3px rgba(15,23,42,0.04)"`  
- Dropdown menus: `boxShadow: "0 8px 24px rgba(15,23,42,0.10), 0 2px 6px rgba(15,23,42,0.06)"`

**Why it affects UX:**  
Inconsistent shadow elevations make the Z-axis feel arbitrary. Cards and dropdowns at different elevations should follow a system (0 = no shadow, 1 = xs, 2 = sm, 3 = md).

**Recommendation:**  
Define 4 elevation levels: resting cards (`shadow-xs`), hovered/interactive (`shadow-sm`), floating panels/dropdowns (custom `0 8px 24px...`), modals (`shadow-xl`). Apply consistently. Remove `shadow-md` from the default resting state of upload zones.

---

### 4.4 Border Color Standardisation — LOW

**What is inconsistent:**  
Borders use `border-gray-200`, `border-gray-100`, and inline `borderRight: "1px solid #E4E4E7"` / `borderBottom: "1px solid #E4E4E7"`. The Sidebar and TopNav use hex strings; everything else uses Tailwind classes.

**Why it affects UX:**  
Minor — but inline hex border strings bypass Tailwind's dark mode and responsive utilities, creating a maintenance risk.

**Recommendation:**  
Replace `borderRight: "1px solid #E4E4E7"` and `borderBottom: "1px solid #E4E4E7"` with Tailwind `border-r border-gray-200` and `border-b border-gray-200` in Sidebar.tsx and TopNav.tsx.

---

## 5. NAVIGATION INCONSISTENCIES

### 5.1 Sidebar Section Headers — MEDIUM

**What is inconsistent:**  
Sidebar section headers (Legal, Privacy, Security, AI Ethics) use `text-[10px] font-semibold tracking-wider uppercase`. This is visually appropriate but the chevron toggle creates an ambiguous interaction: these are *both* section headers AND collapse controls. The "Administration" section appears only for admins, but the sidebar does not communicate that "Privacy Dashboard" and "Privacy Score" are disabled (they use `text-gray-300` which is very close to the enabled `text-gray-500` — a contrast issue).

**Why it affects UX:**  
The `text-gray-300` "disabled" state is insufficient contrast for an enterprise product. Users may not immediately understand that those features are unavailable vs simply not selected. On a calibrated monitor the text is almost invisible.

**Recommendation:**  
Replace the "soon" badge from `text-[9px] font-semibold tracking-wider uppercase rounded px-1.5 py-0.5 bg-gray-100 text-gray-400` to a consistent badge using the new `<Badge>` component (neutral variant, size sm). Use `text-gray-400` instead of `text-gray-300` for disabled item labels to meet WCAG AA contrast. Add a cursor `cursor-not-allowed` to disabled items for clarity.

---

### 5.2 Active State Styling — LOW

**What is inconsistent:**  
Active sidebar items use `bg-[#2175D9] text-white shadow-sm` with `style={{ background: "#2175D9" }}` hardcoded inline. As noted in section 4.1, this bypasses the design token system. Additionally, the top-level section button (when a child is active) shows `bg-[#2175D9]` in the collapsed state, which is correct, but in the expanded state the section header button does NOT show any active indicator — only the child item does. This means in the expanded state there is no visual connection between the active child and its parent group.

**Why it affects UX:**  
In the expanded sidebar, a user navigating to "Analyze Agreements" sees the active child highlighted but the "Legal" section header above it looks identical to "Privacy" and "Security". There is no grouping signal.

**Recommendation:**  
When any child of a section is active, give the section header a subtle left indicator or background: `text-gray-700 font-semibold` (not the full blue fill). This creates a hierarchy signal without competing with the active child item.

---

### 5.3 TopNav Missing Page Context — MEDIUM

**What is inconsistent:**  
The TopNav (`TopNav.tsx`) receives `activeTab` and `setActiveTab` as props but does not use them to display the current page name, breadcrumb, or any page-level context. It is purely a user profile + notification bar.

Compare to enterprise SaaS products (Vanta, OneTrust, Linear): their topbars show the current module or section name alongside the user controls.

**Why it affects UX:**  
On a page like "DPA Review Results," there is no visual anchor in the top chrome that tells the user "you are in DPA Review." The only indicator is the active sidebar item, which is off-screen on small monitors when the sidebar is visible.

**Recommendation:**  
Add a page title slot to `TopNav.tsx`:  
```tsx
<div className="flex-1 flex items-center">
  <span className="text-[14px] font-semibold text-gray-800">{currentPageLabel}</span>
</div>
```  
Derive the label from `activeTab` using the same navigation map used by the Sidebar. This costs 5 lines of code and significantly improves contextual orientation.

---

## 6. UX PATTERN INCONSISTENCIES

### 6.1 Three Parallel Feature Patterns With No Shared Foundation — HIGH

**What is inconsistent:**  
DPA Review, Vendor Review, and AI Ethics all follow the same three-state UX flow:  
`upload → analyzing → results`  

But the implementation is completely independent. The upload state is a different file. The analyzing state is a different file. The results state is a different file. The only shared thing is the approximate layout shape and the `px-10 py-8` padding.

Specific divergences:
- `DPAUploadState` uses `flex-col lg:flex-row lg:items-center` in the hero
- `UploadState` (Vendor) uses `flex-col lg:flex-row lg:items-start`
- `EthicsUploadState` uses `flex-col lg:flex-row lg:items-start`

The results pages have width differences in the right sidebar: Vendor uses `xl:w-[300px]`, DPA uses `xl:w-[320px]`, Ethics uses `xl:w-[300px]`.

**Why it affects UX:**  
A user who uses Vendor Review and then uses DPA Review will notice the layout shift between the two right sidebars (300px vs 320px). The difference is small but visible. More critically, this triple-duplication increases maintenance cost and bug surface area dramatically.

**Recommendation:**  
Create a `<ReviewFeatureShell uploadState analyzingState resultsState>` layout wrapper. Extract `<ReviewUploadZone>`, `<ReviewAnalyzingShell>`, and `<ReviewResultsShell>` as shared components. Each feature configures the content; the shell handles layout, padding, and scroll. This is the most impactful architectural decision for long-term consistency.

---

### 6.2 Information Density — The Dashboard — MEDIUM

**What is inconsistent:**  
The Dashboard is sparse: three KPI cards and a document ledger table. It has no navigation affordances to other features, no quick actions, no recent activity beyond the document list, and no onboarding prompts when the document list is empty. The KPI cards show hardcoded icons that do not match the navigation icons used in the sidebar (e.g., `FileCheck` vs `FileText`).

**Why it affects UX:**  
For a user logging in for the first time, the dashboard offers no guidance on what to do next. The empty state says "Create or import a document to get started" but there's no "Create a document" CTA button anywhere on the dashboard. The quick actions row seen in comparable products (OneTrust, Vanta) is absent.

**Recommendation:**  
Add a "Quick Actions" row below the KPI cards with shortcut buttons to the most-used features: "Scan a website → Cookie Scanner", "Upload for DPA Review", "Draft an Agreement". Ensure the Dashboard's empty state has a direct CTA. Use consistent icons between KPI cards and sidebar nav items.

---

### 6.3 Analyze Agreements — Two Different Visual Backgrounds — MEDIUM

**What is inconsistent:**  
The Analyze Agreements form state uses `bg-[#F7F8FA]` as the page background. The app shell (`App.tsx`) and every other page use `bg-[#FAFAFB]`. These are two different hex values — close but not identical.

Additionally, the Analyze form state wraps its content in:
```
<div className="flex-1 overflow-y-auto px-8 py-7 w-full bg-[#F7F8FA]">
```
The `px-8` (32px) is inconsistent with every other page using `px-10` (40px).

**Why it affects UX:**  
The slight background color shift when navigating to Analyze Agreements is perceptible on well-calibrated monitors. The 8px reduced horizontal margin makes content feel more cramped on that page.

**Recommendation:**  
Change `bg-[#F7F8FA]` to `bg-[#FAFAFB]` and `px-8` to `px-10` in `InteractAnalyze.tsx` form state.

---

### 6.4 Hover State Inconsistency — MEDIUM

**What is inconsistent:**  
Interactive hover states are implemented with three different patterns:
1. Tailwind hover classes: `hover:bg-gray-50 hover:text-gray-900 hover:shadow-xs` (most components)
2. `onMouseEnter`/`onMouseLeave` JS handlers with direct style mutations (TopNav buttons, profile menu items)
3. CSS custom properties via inline style + transition (upload zones)

The TopNav buttons use JavaScript hover events instead of CSS hover classes, which is unusual and unnecessary.

**Why it affects UX:**  
JavaScript hover handlers are slightly slower than CSS hover (one event loop tick), which can make hover responses feel laggy on older machines. It also means hover state is not reflected in CSS inspector tools.

**Recommendation:**  
Replace all `onMouseEnter`/`onMouseLeave` style manipulation in `TopNav.tsx` with equivalent Tailwind hover classes. Use `group-hover` utilities where a parent hover should affect children.

---

### 6.5 Draft Agreements — Workspace Background — LOW

**What is inconsistent:**  
The Draft Agreements workspace (when a document is open in the editor) uses `bg-[#F2F4F7]` as the editor area background and `bg-[#FAFBFD]` for the outer shell. Both of these differ from the app-wide `bg-[#FAFAFB]`.

**Why it affects UX:**  
The editor is a special-case layout (full-screen document editor), so a different background is appropriate. The issue is that `#FAFBFD` is not significantly different from `#FAFAFB` — it creates an invisible inconsistency that clutters the codebase without a perceptible visual benefit.

**Recommendation:**  
Keep `bg-[#F2F4F7]` for the editor canvas (good, intentional differentiation from app chrome). Change the outer draft shell from `bg-[#FAFBFD]` to `bg-[#FAFAFB]` to align with the app default.

---

### 6.6 Ask AI Lawyer — Two Inconsistent Layout States — LOW

**What is inconsistent:**  
The Ask AI Lawyer page has two layout states: a "landing" state and a "chat" state. The landing state uses `px-10` (no vertical scroll). The chat state uses `px-10 py-8`. This is fine. However, the page header `<h1>` appears in BOTH states with identical copy, but in the chat state it also has a right-side action row (`Show Sources` button). This means the page header is duplicated in the JSX — it appears once in the landing state block and once in the chat state block.

**Why it affects UX:**  
The header duplication is a maintenance risk. If the page title needs to change, it must be changed in two places in the same file. It also signals that the component structure needs a header "hoisted" above the conditional rendering.

**Recommendation:**  
Hoist the page header out of the conditional rendering blocks. Move it above the `{!hasResult ? ... : ...}` conditional. The right-side action row (Sources button) can be rendered conditionally within the shared header.

---

## 7. SPECIFIC PAGE-BY-PAGE AUDIT

### Dashboard
- ✅ KPI card grid (3-col) is clean and consistent internally
- ⚠️ `px-8` instead of `px-10` — unique horizontal margin
- ⚠️ Title uses `text-[26px]` but `PRIMARY_BRAND` import is unused — dead code
- ⚠️ No quick-action affordances for empty state
- ⚠️ `min-h-screen` on a page inside an `overflow-hidden` shell is a no-op

### Analyze Agreements
- ⚠️ `text-[28px]` title — 2px larger than every other page
- ⚠️ `bg-[#F7F8FA]` — slightly different background from app default
- ⚠️ `px-8 py-7` — different padding from app standard `px-10 py-8`
- ⚠️ DocumentSelector uses `rounded-2xl` and `shadow-sm` while other cards use `rounded-[18px]` and `shadow-xs`
- ⚠️ DocumentSelector search input uses `text-sm` (16px? or 14px?) vs `text-[13px]` everywhere else

### Draft Agreements
- ✅ Most consistent page — clear separation between generator and editor
- ⚠️ `bg-[#FAFBFD]` outer shell — use `bg-[#FAFAFB]`
- ⚠️ Mode toggle uses `bg-gray-100` pill with `rounded-xl` children — this is a good pattern, but the same pattern in results page tabs uses different styling

### Ask AI Lawyer
- ✅ Composer bar is excellent — clean interaction model
- ⚠️ Page header duplicated in two rendering branches
- ⚠️ Landing padding `pt-8 pb-0` vs chat state `py-8` — inconsistent
- ⚠️ Keyboard shortcut hint (`Enter to send`) uses `<kbd>` tags — good — but the separator uses raw "·" character. Standardise to `<span>` with `text-gray-300`

### Negotiate Redlines
- ✅ Page header matches Draft Agreements pattern well (`px-10 pt-8`)
- ✅ Document selector in header is a good pattern
- ⚠️ Export buttons use `<Printer>` icon for PDF — semantically confusing (Print ≠ PDF)
- ⚠️ `bg-[#FAFAFB]` — correct ✅

### Cookie Scanner
- ✅ Consistent with other scanner pages
- ⚠️ ScanForm uses `p-7` (28px padding) — non-standard. Use `p-6` (24px) or `p-8` (32px)
- ⚠️ Results grid uses `lg:grid-cols-4` for score + 3 KPIs — doesn't match the `md:grid-cols-3` pattern from Dashboard

### DPA Review
- ⚠️ Upload page title is 30 words long: "Data Processing Agreement Reviewer" — the longest title in the app. All other feature titles are 2-3 words max.
- ⚠️ Right sidebar `xl:w-[320px]` vs Vendor/Ethics `xl:w-[300px]`
- ✅ Results page is the most complete and well-structured of the three review features

### Vendor Review
- ✅ Upload state has the best-designed feature card grid
- ⚠️ `UploadState` button at bottom references `btn-primary` which may or may not be defined consistently
- ⚠️ Header subtitle uses `text-[13.5px]` — non-standard

### Vulnerability Scanner
- ✅ Closest to the Cookie Scanner pattern — good internal consistency
- ⚠️ SSL/TLS card uses `p-6` while Security Score card uses `p-7` — inconsistent within the same 3-col grid
- ⚠️ Score display box `w-24 h-24 rounded-2xl` — inconsistent with Vendor/DPA/Ethics `w-[72px] h-[72px] rounded-2xl`

### AI Ethics
- ✅ Shares the same upload/results pattern as Vendor/DPA — same positives and negatives
- ⚠️ Results header shows `text-[24px]` instead of `text-[26px]`
- ⚠️ `EthicsAnalyzingState` exists as a custom component separate from `AiProgressOverlay`

### Admin Panel
- ⚠️ Icon placed inside `<h1>` tag — remove
- ⚠️ `mb-10` header gap — use `mb-8`
- ⚠️ Table uses `rounded-[18px]` outer card — consistent ✅
- ✅ Action buttons (Approve/Reject) are the most consistently styled buttons in the app

---

## 8. PRIORITISED RECOMMENDATION BACKLOG

### 🔴 HIGH PRIORITY — Implement first (maximum impact, often simple fixes)

| # | Issue | Files Affected | Effort |
|---|---|---|---|
| H1 | Extract shared `<FileUploadZone>` component | VendorUploadState, DPAUploadState, EthicsUploadState | Medium |
| H2 | Create `<PageHeader title subtitle>` component and apply to all 11 pages | All page files | Low |
| H3 | Replace all `style={{ background/color: "#2175D9" }}` with `className="bg-brand-primary"` / `text-brand-primary` | 25+ files | Low |
| H4 | Standardise active tab pattern into `<Tabs>` component | DPAResultsState, VendorResultsState, EthicsResultsState | Low |
| H5 | Fix `text-[28px]` title in Analyze Agreements to `text-[26px]` | InteractAnalyze.tsx | Trivial |
| H6 | Fix `px-8` in Analyze form state to `px-10` | InteractAnalyze.tsx | Trivial |
| H7 | Fix `bg-[#F7F8FA]` to `bg-[#FAFAFB]` in Analyze form state | InteractAnalyze.tsx | Trivial |
| H8 | Create `<Button>` component with primary/secondary/ghost/icon variants | All pages | Medium |
| H9 | Replace indigo accent color (`#6366F1`) in TopNav with brand blue | TopNav.tsx | Low |

---

### 🟡 MEDIUM PRIORITY — Second sprint

| # | Issue | Files Affected | Effort |
|---|---|---|---|
| M1 | Add page name to TopNav left slot | TopNav.tsx | Low |
| M2 | Extract `<ReviewFeatureShell>` for DPA/Vendor/Ethics | 6 component files | Medium |
| M3 | Standardise right sidebar width to `xl:w-[300px]` | DPAResultsState.tsx | Trivial |
| M4 | Standardise all results page `<h1>` to `text-[26px]` | DPAResultsState, VendorResultsState, EthicsResultsState | Trivial |
| M5 | Standardise input field CSS to single design token | DocumentSelector, ScanForm, VulnScanner | Low |
| M6 | Replace JS hover handlers with Tailwind hover classes in TopNav | TopNav.tsx | Low |
| M7 | Create `<Badge>` component and replace all badge inline styles | All pages | Medium |
| M8 | Create `<EmptyState icon title subtitle>` component | Dashboard, CookieScanner, VulnScanner | Low |
| M9 | Extend `<AiProgressOverlay>` with `steps` prop and retire custom AnalyzingState components | DPAAnalyzingState, AnalyzingState (Vendor), EthicsAnalyzingState | Medium |
| M10 | Replace `borderRight/Bottom: "1px solid #E4E4E7"` with Tailwind border classes | Sidebar.tsx, TopNav.tsx | Trivial |
| M11 | Hoist Ask AI Lawyer page header above conditional rendering | AskAILawyer.tsx | Low |
| M12 | Add Dashboard quick-action row pointing to key features | DashboardHome.tsx | Low |
| M13 | Fix Vulnerability Scanner SSL card padding (`p-6` vs `p-7`) | VulnerabilityScannerView.tsx | Trivial |
| M14 | Remove icon from Admin Panel `<h1>` | AdminPanel.tsx | Trivial |
| M15 | Standardise section spacing to use `mb-6` header gap, remove `mb-10` in Admin | AdminPanel.tsx | Trivial |

---

### 🟢 LOW PRIORITY — Polish sprint / technical debt

| # | Issue | Files Affected | Effort |
|---|---|---|---|
| L1 | Standardise border radius to `rounded-[18px]` everywhere (remove `rounded-xl` / `rounded-2xl` from card wrappers) | 15+ files | Low |
| L2 | Establish 4-level shadow scale and apply consistently | All result/card pages | Low |
| L3 | Remove `min-h-screen` from Dashboard and Cookie Scanner (no-op inside shell) | DashboardHome.tsx, CookieScanner.tsx | Trivial |
| L4 | Change Draft outer shell from `bg-[#FAFBFD]` to `bg-[#FAFAFB]` | DraftAgreement.tsx | Trivial |
| L5 | Fix DPA Review title to 2-3 words ("DPA Reviewer" or "DPA Review") | DPAUploadState.tsx | Trivial |
| L6 | Improve disabled sidebar item contrast from `text-gray-300` to `text-gray-400` | Sidebar.tsx | Trivial |
| L7 | Replace raw `·` separator in Ask AI Lawyer keyboard hint with `<span>` | AskAILawyer.tsx | Trivial |
| L8 | Change Printer icon to FilePdf or FileDown icon for PDF export in Negotiate | NegotiateHub.tsx | Trivial |
| L9 | Add a type scale CSS definition to `index.css` and migrate all `text-[NNpx]` to named tokens | index.css + all pages | High |
| L10 | Clean up unused imports (`PRIMARY_BRAND` in Dashboard.tsx, `React` in pre-React-18 pattern files, `Clock` in Sidebar.tsx) | Multiple files | Trivial |

---

## 9. DESIGN TOKEN SPECIFICATION (Recommended)

Define these tokens in `index.css` under `@layer base` / `@theme`:

```css
/* Spacing */
--page-padding-x: 40px;          /* px-10 */
--page-padding-y: 32px;          /* py-8  */
--section-gap:    32px;          /* mb-8  */
--card-gap:       24px;          /* mb-6  */
--card-padding:   20px;          /* p-5   */

/* Typography */
--text-page-title:    26px;      /* page h1 */
--text-section-head:  15px;      /* card/section h2 */
--text-card-head:     13px;      /* widget header */
--text-body:          13px;      /* default body */
--text-caption:       12px;      /* secondary description */
--text-label:         11px;      /* table headers, category labels */
--text-micro:         10px;      /* badges, pill labels */

/* Radius */
--radius-card:    18px;          /* rounded-[18px] for all cards */
--radius-input:   12px;          /* rounded-xl for all inputs */
--radius-badge:    6px;          /* rounded-md for all badges */
--radius-button:  12px;          /* rounded-xl for all buttons */

/* Elevation */
--shadow-card:    0 1px 2px rgba(15,23,42,0.04), 0 1px 4px rgba(15,23,42,0.04);
--shadow-hover:   0 2px 8px rgba(15,23,42,0.08);
--shadow-float:   0 8px 24px rgba(15,23,42,0.10), 0 2px 6px rgba(15,23,42,0.06);
```

---

## 10. IMPLEMENTATION SEQUENCE

Suggested implementation order for maximum coherence with minimum rework:

**Week 1 — Foundation (H3, H5, H6, H7, M3, M4, M10, L3, L4, L10)**  
All trivial fixes. No component creation. Fixes the most visible inconsistencies. PR is small and reviewable in one pass.

**Week 2 — Shared Components (H2, H8, M7, M8)**  
Create `<PageHeader>`, `<Button>`, `<Badge>`, `<EmptyState>`. Replace usages across all pages. This is the highest-leverage week — one component replaces 11 independent implementations.

**Week 3 — Upload Unification (H1, M9)**  
Extract `<FileUploadZone>` and consolidate the three analyzing states. This eliminates ~600 lines of duplicated code.

**Week 4 — Navigation & Color System (H4, H9, M1, M6)**  
Tabs component, brand color token migration, TopNav page label, fix indigo accent.

**Week 5 — Review Feature Shell (M2, M5, M11, M12, M14, M15)**  
`<ReviewFeatureShell>` extraction, input standardisation, Dashboard quick-actions, remaining layout polish.

**Ongoing — Typography Scale (L9)**  
The type scale migration is the longest-tail item. It should happen incrementally, file by file, during other feature work.

---

*Audit produced by Kiro design system analysis — RandTrust frontend v1.x*

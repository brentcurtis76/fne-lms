# GENERA — Orchestration Handoff Document

**Prepared by:** Brent Curtis
**Date:** April 2026
**Purpose:** Provide complete context and orchestration instructions for producing GENERA's full planning documentation set using a Cowork-orchestrated, Claude Code-executed workflow.

---

## How This Document Is Structured

This document has two main sections:

**Part A — Project Context (for Cowork to absorb):** Everything about GENERA, the pedagogical model, users, technical decisions, and open questions. This is the shared knowledge base.

**Part B — Orchestration Instructions (for Cowork to execute):** The workflow, roles, prompt templates, and checkpoints for producing the five documents.

Cowork should read both parts carefully before beginning any work.

---

# PART A — PROJECT CONTEXT

## Who I Am

I'm Brent Curtis — solo developer and tech lead at Fundación Nueva Educación (FNE) in Santiago, Chile. I'm bilingual (English/Spanish), approaching 50, based in Santiago. I also serve as pastor at Comunidad Anglicana San Andrés (CASA).

I don't work alone in the traditional sense — I orchestrate a multi-agent AI development pipeline. Claude Code is my primary executor. I have a custom agent ecosystem including Jake 2.0, Cowork as orchestrator, and various MCP-connected tools. **I will not be hiring human help.** The development strategy relies on cutting-edge AI tooling, which is evolving rapidly.

## What GENERA Is

GENERA is a relational intelligence and student wellbeing platform that accompanies students from early childhood through graduation. It is not a school management tool — it is a **practice container** for a specific pedagogical model inspired by Escola Virolai (Barcelona) and developed by Fundación Nueva Educación over many years with approximately 13 Chilean schools currently in the network.

The attached research document confirms that no existing platform integrates individual student development, classroom social dynamics, and early warning detection across the full school journey. GENERA is a genuinely novel system.

## The Pedagogical Model — Non-Negotiable Practices

These are not features to be designed. They are the pedagogical heart of the system. Everything technical must serve these:

### Proyecto de Autoconocimiento

A structured self-knowledge project adapted to the student's developmental stage. Generative, not a form. The platform helps design, support, and hold it. It is the foundation upon which the Plan Personal is built. Each stage of development has its own type of proyecto.

### Plan Personal

Built on the proyecto de autoconocimiento. Contains personal growth objectives organized into thematic categories (self, relationships, family, how I learn, contextual/free). Category names and quantity are customizable per school — **this is still under debate with Arnoldo (see Open Decisions below)**. The underlying structure and tips remain consistent. Progressively student-led as the student matures.

### Equipo Base and the Circle

Students work in stable groups of 3-6 called equipos base. They open and close each week in a circle ritual led by the students themselves — not the asesor. The asesor rotates across 3-4 equipos base and is only occasionally present. The interface for the circle must work for a student facilitator standing in front of their group — simple, visual, almost like a shared screen. What gets recorded is what the group chooses to share. The asesor can add an observation layer when present but does not own the record.

### Family Presentations

The equipo base collectively prepares and presents their growth and learning to their families plus 1-2 guests the students choose (typically a grandparent or close friend). This replaces traditional parent-teacher meetings. The student is the author and presenter of their own story — not the subject being discussed. The platform must support preparation, design, delivery, and hold the resulting artifacts.

## The Four User Roles

### Asesor (name still pending — "sostén" has been proposed)

Manages 3-4 equipos base = 15-20 students total. Has one-on-one sessions with each student. Rotates through circles. Sees a unified dashboard showing individual growth, group dynamics, and alert signals — all synthesized, not in separate modules. **Does NOT see raw session content** — only metrics and what students/groups choose to share. Does significant fieldwork, which is why the app must work well on their phone.

### Student

From early childhood through graduation. Role shifts dramatically by developmental stage:
- Early childhood: data comes from asesor and family observation; the child's voice enters indirectly
- Middle childhood (around age 8): direct self-reporting begins, in guided ways
- Adolescence: the student fully owns their narrative

Always the author, never just the subject.

### Family

Co-constructor in early years, progressively transitioning to audience and support as the student gains agency. Pays a direct B2C subscription for the "Acompañamiento Personalizado" component. Receives the family presentation instead of a parent-teacher meeting.

### School Leadership / FNE

Sees macro metrics only — session frequency, plan personal completion percentage, group health indicators. Cannot read content of sessions or plans. FNE as platform operator also cannot access content — confirmed design decision.

## The System's Three Operational Levels

These must be interconnected — not separate modules:

1. **Individual** — Plan personal, proyecto de autoconocimiento, longitudinal growth trajectory, one-on-one session records
2. **Group** — Sociogram (built from both asesor observation and student self-reporting), equipo base dynamics, circle records, family presentations
3. **Signals** — Early warning flags emerging from the combination of individual and group data. A flag means something different at age 6 vs age 16. Students with ASD or other diagnoses/relevant personal situations are context that changes interpretation of all other data — not a separate module.

## Business Model — Two Distinct Products (flexibility needed)

### Product 1 — Institutional (B2B)

The tutoring, plan personal, sociogram, and early warning system. Paid by the school or subsidized by FNE. Payment management needs to have multiple possible configurations. The data architecture must support this flexibility from day one.

### Product 2 — Acompañamiento Personalizado (B2C)

Paid directly by families via subscription. This is the family-facing layer — emotional connection exercises, content structured by developmental stage, programs like "te miro, te veo" and "Vamos lá", regular updates beyond the annual school report. Consumer-grade UX. Real payment gateway (Transbank for Chile, Stripe possibly for international).

**Important:** the business model needs flexibility for variable configurations. Different schools, different family segments, different pricing arrangements. Build the data model to support this from the start.

## The RAG / Knowledge Base

### Purpose

A foundational knowledge base that feeds the platform's AI capabilities. **Not user-facing as an exploration tool.** Its role is:
- Feed contextual tips to asesores based on developmental stage, student situation, session content
- Feed personalized content to families based on their child's stage and current focus
- Serve as the theoretical/pedagogical foundation for anything AI-generated across the platform

### Source Materials

Mixed formats:
- PDFs (academic papers, books, FNE internal materials)
- Books (some likely scanned, requiring OCR)
- Videos (requiring transcription via Whisper or similar)
- Internal FNE documents
- Material from Escola Virolai
- Third-party educational and psychological literature

### Technical Approach

Build on Supabase pgvector (already in use in my existing agent architecture for Jake/Open Brain). Ingestion pipeline needs:
- PDF extraction
- OCR for scanned documents
- Video transcription (Whisper or equivalent, latest model at time of implementation)
- Chunking strategy appropriate for educational content
- Embedding model (needs research — landscape changes rapidly)
- Metadata tagging by developmental stage, topic, framework, source

### Legal Consideration

Material is referential only — not distributed or displayed to users. But storage of third-party copyrighted material still has legal implications even in referential use. **Include a recommendation for legal due diligence before bulk ingestion** in the execution plan document.

## Technical Stack Decisions

### Confirmed

- **Web**: Next.js + Supabase + TypeScript (current stack, working well)
- **Database**: Supabase Postgres with pgvector extension for RAG
- **Mobile**: React Native + Expo (confirmed direction — optimal for solo developer with AI orchestration, TypeScript reuse, 80-90% code share iOS/Android, OTA updates avoid Apple review friction for iterations)
- **Mobile scope**: Family app first; Asesor app migration follows once institutional layer is stable. Asesores do significant fieldwork so having everything on phone is practical.
- **AI orchestration**: Claude Code + custom agent stack (Cowork, Jake 2.0, MCP connectors)
- **Payment**: Transbank for Chile (B2C subscription)
- **Compliance framework**: Ley 21.719 (Chilean data privacy for minors, effective December 2026)

### Needs Research by Claude Code During Document Production

The AI tooling landscape changes weekly. Claude Code should research the current state of relevant tools when producing the technical documents — not rely on training data:
- Best embedding models for multilingual educational content (Spanish primary, some English)
- Best RAG frameworks / orchestration tools
- Current best practices for multi-format ingestion pipelines
- Latest Claude API capabilities (tool use, extended thinking, multi-agent patterns)
- Expo / React Native latest stable versions and relevant libraries
- Supabase latest capabilities (realtime, edge functions, storage)
- Any new tools that emerged recently and are relevant

## Timeline

### Target

Beta versions tested with pilot schools by **December 2026**.

This is an ambitious but realistic target given:
- Development velocity with Claude Code + Opus 4.7 + agent orchestration
- Single developer working through AI pipeline
- Dual product (institutional + family app)
- Multi-platform (web + iOS + Android)
- Legal compliance deadlines align (Ley 21.719 December 2026)

The execution plan document should propose a realistic phase breakdown with concrete milestones between now (April 2026) and December 2026. Include buffer for app store review cycles (especially Apple), legal processes (Ley 21.719 parent consent portal has 2-week turnaround), and iteration based on pilot feedback.

## Current User Base and Scale Targets

- Current: approximately 500 users on the existing GENERA platform
- Scaling target: approximately 20,000 users
- Pilot phase: 2-3 schools initially, expanding to more as system stabilizes
- Ecuador expansion mentioned by Arnoldo (Coral's network) — needs to be considered in architecture but not necessarily launched in MVP

## Key Stakeholders

- **Arnoldo** — FNE visionary and decision-maker. Main point of friction currently: wants fixed categories for plan personal (scalability, cross-school comparability, Ecuador network).
- **Sandra** — asesora from Virolai (Barcelona), deep methodological expertise
- **Mora** — part of FNE team, works closely with Chilean schools, aligned with Sandra and me on category flexibility
- **Coral Regí** — works with Ecuador network, relevant for international expansion
- **Brent (me)** — solo developer and tech lead

## Open Decisions Requiring Resolution

1. **Categories debate with Arnoldo** — still no consensus. Sandra, Mora, and I argue for customizable; Arnoldo wants fixed. Proposed compromise: foundation defines structural framework and recommended template; schools can rename and show/hide categories; tips and underlying logic remain consistent. **This needs to be resolved before data architecture is finalized.** The pitch document should include clear arguments for the compromise position, grounded in the research findings.

2. **Final name for the asesor role** — "tutor" has wrong connotations in Chile, "asesor" is confusing with Barcelona advisors, "sostén" has been proposed. Still open.

3. **Sociogram construction methodology** — research document addresses this. Built from both asesor observations AND student self-reporting, with age-appropriate design.

4. **Circle interface design** — needs to work for a student facilitator in front of their group without adult supervision. Not yet designed.

5. **Sensitive data protocol** — platform is explicitly NOT a protocol system for serious incidents (bullying, abuse). When a tutor encounters serious information, the tip is "stop recording, handle through school protocols." Legal liability implications for FNE still need formal legal advice.

6. **App launch strategy** — family app first, asesor app later. Specific sequencing needs to be in the execution plan.

## Research Document Context

Attached separately in the FNE working folder: a comprehensive research synthesis covering ten design questions. It draws from over 20 platforms (Panorama Education, DESSA, Branching Minds, Storypark, ClassDojo and more) and dozens of research sources across developmental psychology, sociometric methodology, inclusive education, positive psychology, and pedagogical traditions spanning five continents.

Key findings to remember:
- No existing platform does all three things (individual + group + signals) across full school journey
- Developmental psychology provides clear interface design implications by age stage
- Sociogram methodology has 90-year evidence base but requires ethical care
- Strength-based approaches (DESSA) have strong research support
- Longitudinal student data architecture is critical (Branching Minds model)
- Parent-owned narrative approach (Storypark model) offers template for family layer
- ClassDojo's simplicity is a market signal but its behaviorist model is contraindicated

The research document should be referenced throughout all five documents as the evidentiary foundation.

---

# PART B — ORCHESTRATION INSTRUCTIONS

## The Problem We're Solving

Producing five comprehensive, coherent planning documents for GENERA without degrading context quality in any single session. Continuity between documents is crucial — Document 3 (Roadmap) must reflect decisions made in Document 1 (Vision), and so on.

## The Architecture

**Cowork** (you, the orchestrator):
- Holds the project memory across the entire document production process
- Lives in the same FNE working folder as Claude Code
- Manages decisions, conversations with Brent, and iteration on outputs
- Composes and dispatches prompts to Claude Code sessions
- Never writes documents directly — only orchestrates

**Claude Code** (the executor):
- Gets a fresh session for each document
- Receives minimal, focused context — the handoff, the research, approved prior documents, and specific instructions for the current document
- For Document 2 only: instructed to explore the existing GENERA codebase in the FNE folder before producing the document
- Writes the document as a markdown file in the FNE folder
- Session closes when document is complete

**Brent** (the supervisor):
- Reviews each document after it's produced
- Iterates with Cowork on feedback (not with CC directly)
- Approves the document before Cowork moves to the next
- Makes the key decisions (categories debate, role naming, etc.) that feed into documents

## The Five Documents

### Document 1 — Vision & Pedagogy (non-technical, for pitch)
For Arnoldo, Sandra, Mora, Coral and other FNE team members. Narrative explanation of what GENERA is. The four users, the pedagogical practices, the three operational levels, the business model, conceptual mockups of key screens. Should make clear why this is worth building and why the compromise on categories serves everyone's interests.

### Document 2 — Technical Architecture & Development Plan (technical, blueprint)
For Brent as master development guide. Complete stack, data model, system architecture, RAG architecture and ingestion pipeline, mobile app architecture, API design, integration strategy (Supabase, Transbank, Whisper, Claude API, etc.), compliance architecture for Ley 21.719, security, performance, scalability. Deep technical detail. **CC explores the existing codebase before producing this one.**

### Document 3 — Roadmap & Execution Plan
For Brent and for presenting to the team. Phases from now (April 2026) to December 2026 beta with pilots. Milestones, dependencies, risks, mitigation strategies, tooling and agent orchestration strategy, decisions pending (and their critical timing). Include a visual Gantt representation. Account realistically for development velocity given AI orchestration approach.

### Document 4 — Mockup Brief
Prioritized list of screens needed with detailed descriptions, user flows, and states. Organized by user role and priority. Ready to hand to a designer (or to feed into v0/Figma/similar).

### Document 5 — Decisions Pending & Open Questions
Everything unresolved. Who decides, by when, what are the implications of each option, recommended position. Includes the categories debate with Arnoldo structured as a conversation guide.

## The Workflow

### Phase 0 — Orientation

Cowork reads this entire document and the attached research synthesis. Cowork confirms understanding with Brent and asks any clarifying questions about the orchestration plan or project context before starting.

### Phase 1 — Pre-Document Checkpoint (before each document)

Before dispatching a prompt to Claude Code for each document, Cowork has a conversation with Brent covering:

- Any open decisions that specifically affect this document (e.g., before Document 1, confirm the positioning on the categories debate; before Document 2, confirm stack assumptions)
- Any new information since the last document was approved
- Specific emphasis or framing Brent wants for this document
- Any references, examples, or constraints Cowork should pass to Claude Code

Cowork should actively ask these questions — not wait for Brent to volunteer them.

### Phase 2 — Prompt Composition

Cowork composes a focused prompt for Claude Code using the templates below. The prompt should include:

- The relevant sections of Part A from this handoff (Cowork curates what's relevant, not dumps everything)
- The research document attached as reference
- All previously approved documents, clearly labeled as approved prior outputs
- Specific instructions for this document from the templates below
- Decisions and emphasis captured in the pre-document checkpoint
- Explicit instruction to ask clarifying questions before writing if anything is unclear

### Phase 3 — Dispatch and Production

Cowork dispatches the prompt to a fresh Claude Code session in the FNE folder. Claude Code:
- Confirms it has read all inputs
- Asks clarifying questions if needed (routed back through Cowork to Brent)
- For Document 2 only: explores the existing codebase before writing
- Produces the document as a markdown file in the FNE folder
- Notifies Cowork when complete

### Phase 4 — Review and Iteration

Brent reviews the document. Any feedback goes to Cowork. Cowork either:
- Composes a revision prompt for Claude Code (minor changes)
- Discusses substantive issues with Brent and then dispatches revision
- Approves the document and moves to Phase 1 for the next document

### Phase 5 — Completion

After all five documents are approved, Cowork produces a brief summary of:
- Key decisions made during production
- Any open questions that emerged but weren't resolved
- Recommended next steps (likely: begin implementing Phase 1 of the roadmap)

## Prompt Templates for Claude Code

Cowork uses these as starting points and fills in the specifics from Part A and the pre-document checkpoint. Each prompt should open with the same framing:

> You are Claude Code working in the FNE folder for the GENERA project. This is a fresh session dedicated to producing a single planning document. You have been given a handoff document with full project context, a research synthesis, and any previously approved documents.
>
> Before writing, confirm you have read all inputs and ask any clarifying questions. Do not begin writing until any open questions are resolved.
>
> Your task is to produce [DOCUMENT NAME] as described below. Save it as [FILENAME].md in the FNE folder.

### Template — Document 1 (Vision & Pedagogy)

> **Document to produce:** Vision & Pedagogy document for GENERA, targeted at the FNE team (Arnoldo, Sandra, Mora, Coral) as a pitch and shared understanding.
>
> **Audience considerations:** Non-technical. Should be readable by educators without losing depth. Can use narrative, metaphor, and illustrative examples. Should make the vision emotionally compelling while remaining grounded.
>
> **Required sections:**
> - Opening narrative of what GENERA is and why it matters
> - The four users and how GENERA serves each
> - The four non-negotiable pedagogical practices
> - The three operational levels and how they interconnect
> - How the system accompanies a student across developmental stages
> - The dual business model (institutional + family subscription) and the reasoning
> - The categories compromise position, framed persuasively for Arnoldo
> - Conceptual descriptions of 3-5 key screens (text descriptions sufficient; no need to generate actual mockups)
> - Closing: what this enables that nothing else does
>
> **Reference the research synthesis throughout.** Tie claims to research findings.
>
> **Length:** Whatever it takes to be complete and compelling. Quality over brevity, but avoid padding.

### Template — Document 2 (Technical Architecture)

> **Document to produce:** Technical Architecture & Development Plan for GENERA, targeted at Brent as the master development blueprint.
>
> **Audience considerations:** Deeply technical. Assume reader is an experienced developer who orchestrates AI pipelines. Should be specific enough to execute against.
>
> **Before writing:** Explore the existing GENERA codebase in this FNE folder. Understand the current state of the platform — what's built, what patterns are used, what can be reused, what needs to be replaced or refactored. Reference specific files where relevant. Do not propose rebuilds of things that already work.
>
> **Also before writing:** Research the current state of relevant tools via web search. The AI tooling landscape changes rapidly. Do not rely on training data for technology recommendations — confirm current versions, capabilities, and best practices.
>
> **Required sections:**
> - Executive summary of the architecture
> - Current state assessment (what exists, what can be leveraged)
> - Complete data model for new capabilities
> - System architecture (web, mobile, backend, AI services)
> - RAG architecture and multi-format ingestion pipeline
> - Mobile app architecture (React Native + Expo)
> - Integration strategy (Supabase, Transbank, Claude API, Whisper, etc.)
> - Ley 21.719 compliance architecture
> - Security model
> - Performance and scalability considerations for 500 → 20,000 users
> - AI orchestration strategy (how Claude Code + agents fit into development workflow)
> - Testing strategy
>
> **Reference Document 1 throughout** for what each technical decision serves.

### Template — Document 3 (Roadmap & Execution)

> **Document to produce:** Roadmap & Execution Plan from April 2026 to December 2026 beta launch with pilot schools.
>
> **Audience considerations:** Brent as primary user, but also presentable to FNE team. Should be both an execution tool and a communication document.
>
> **Required sections:**
> - Phase breakdown from April 2026 to December 2026
> - Milestones and concrete deliverables per phase
> - Dependencies and critical path
> - Risk register with mitigation strategies
> - AI orchestration and development velocity assumptions
> - Decision timing (when each open decision must be resolved)
> - Pilot school engagement strategy
> - Gantt visualization (can be described textually or as a table if visual generation isn't practical)
> - Budget of effort (hours/weeks per phase given AI orchestration model)
>
> **Reference Documents 1 and 2** for what's being built. This document is about when and how.

### Template — Document 4 (Mockup Brief)

> **Document to produce:** Mockup Brief — a prioritized, detailed specification of screens to be designed.
>
> **Audience considerations:** Could be used by Brent in v0 or Figma, or handed to a designer. Must be specific enough that someone can design from it without guessing.
>
> **Required structure:**
> - Screens organized by user role (asesor, student, family, school leadership)
> - Screens organized by priority tier (P0 MVP, P1 early post-MVP, P2 later)
> - For each screen: purpose, user context, states (empty, loading, populated, error), key interactions, data requirements, developmental stage variations where relevant
> - User flows connecting screens for key journeys (e.g., student preparing for family presentation, asesor reviewing semáforo dashboard)
>
> **Reference Documents 1, 2, and 3** for what's being built and when.

### Template — Document 5 (Decisions & Open Questions)

> **Document to produce:** Decisions Pending & Open Questions — a decision log and conversation guide.
>
> **Audience considerations:** Brent primarily, with sections formatted for use in conversations with specific stakeholders (especially Arnoldo for the categories debate).
>
> **Required structure:**
> - Each decision: what's at stake, who decides, when it must be decided, options with implications, recommended position
> - Categories debate specifically: structured as a conversation guide for Arnoldo, with arguments grounded in the research synthesis
> - Questions that emerged during document production but weren't resolved
> - Dependencies: which decisions block which development activities
>
> **Reference all prior documents** — this document surfaces the unresolved from everything that came before.

## Key Principles for Cowork

1. **Protect your context.** Don't load full documents into your own conversation if you can avoid it. Reference them by file location and let Claude Code read them directly.

2. **Curate what Claude Code sees.** Don't dump this entire handoff into every CC prompt. For Document 1, CC needs the pedagogical model deeply but can skim the technical stack. For Document 2, the opposite.

3. **Ask Brent, don't assume.** For any ambiguity that would materially change a document, ask Brent before dispatching. Brent explicitly requested this.

4. **Maintain coherence.** Each document builds on the prior ones. CC won't remember its own prior sessions — you carry that memory by explicitly feeding approved documents as reference.

5. **Trust CC to produce, you to orchestrate.** You don't write. CC writes. You make sure CC has what it needs.

6. **For Document 2, CC explores the codebase.** Instruct CC explicitly to use file exploration tools in the FNE folder before writing. Do not bypass this.

## Starting Instruction from Brent

When Cowork first receives this document, Brent will say something like:

> Read the handoff document and research synthesis in this folder. Confirm you have understood your role as orchestrator for the GENERA documentation project. Ask any clarifying questions about the plan before we begin Phase 0.

Cowork should then enter the workflow described above.

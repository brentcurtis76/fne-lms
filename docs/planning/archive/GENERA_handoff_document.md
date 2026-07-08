# GENERA — Handoff Document for Next Session

**Prepared by:** Brent Curtis, in collaboration with Claude Opus 4.7
**Date:** April 2026
**Purpose:** Provide complete context for a new conversation that will produce the full documentation set needed to plan and execute GENERA's development and pilot phase.

---

## How to Use This Document

Paste this entire document at the start of a new Claude conversation, together with the attached research document (`compass_artifact_wf-2c7bc2e3-aadd-4ea1-8ed3-641450dbb300_text_markdown.md`). Then issue the instruction described in the final section.

---

## Who I Am

I'm Brent Curtis — solo developer and tech lead at Fundación Nueva Educación (FNE) in Santiago, Chile. I'm bilingual (English/Spanish), approaching 50, based in Santiago. I also serve as pastor at Comunidad Anglicana San Andrés (CASA).

I don't work alone in the traditional sense — I orchestrate a multi-agent AI development pipeline. Claude Code is my primary executor. I have a custom agent ecosystem including Jake 2.0, Cowork as orchestrator, and various MCP-connected tools. **I will not be hiring human help.** The development strategy relies on cutting-edge AI tooling, which is evolving rapidly. The new session should research and recommend the most current tools available at the time of the conversation.

---

## What GENERA Is

GENERA is a relational intelligence and student wellbeing platform that accompanies students from early childhood through graduation. It is not a school management tool — it is a **practice container** for a specific pedagogical model inspired by Escola Virolai (Barcelona) and developed by Fundación Nueva Educación over many years with approximately 13 Chilean schools currently in the network.

The attached research document (read it carefully) confirms that no existing platform integrates individual student development, classroom social dynamics, and early warning detection across the full school journey. GENERA is a genuinely novel system.

---

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

---

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

---

## The System's Three Operational Levels

These must be interconnected — not separate modules:

1. **Individual** — Plan personal, proyecto de autoconocimiento, longitudinal growth trajectory, one-on-one session records
2. **Group** — Sociogram (built from both asesor observation and student self-reporting), equipo base dynamics, circle records, family presentations
3. **Signals** — Early warning flags emerging from the combination of individual and group data. A flag means something different at age 6 vs age 16. Students with ASD or other diagnoses/relevant personal situations are context that changes interpretation of all other data — not a separate module.

---

## Business Model — Two Distinct Products (flexibility needed)

### Product 1 — Institutional (B2B)

The tutoring, plan personal, sociogram, and early warning system. Paid by the school or subsidized by FNE. Payment management needs to have multiple possible configurations. The data architecture must support this flexibility from day one.

### Product 2 — Acompañamiento Personalizado (B2C)

Paid directly by families via subscription. This is the family-facing layer — emotional connection exercises, content structured by developmental stage, programs like "te miro, te veo" and "Vamos lá", regular updates beyond the annual school report. Consumer-grade UX. Real payment gateway (Transbank for Chile, Stripe possibly for international).

**Important:** the business model needs flexibility for variable configurations. Different schools, different family segments, different pricing arrangements. Build the data model to support this from the start.

---

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

---

## Technical Stack Decisions

### Confirmed

- **Web**: Next.js + Supabase + TypeScript (current stack, working well)
- **Database**: Supabase Postgres with pgvector extension for RAG
- **Mobile**: React Native + Expo (confirmed direction — optimal for solo developer with AI orchestration, TypeScript reuse, 80-90% code share iOS/Android, OTA updates avoid Apple review friction for iterations)
- **Mobile scope**: Family app first; Asesor app migration follows once institutional layer is stable. Asesores do significant fieldwork so having everything on phone is practical.
- **AI orchestration**: Claude Code + custom agent stack (Cowork, Jake 2.0, MCP connectors)
- **Payment**: Transbank for Chile (B2C subscription)
- **Compliance framework**: Ley 21.719 (Chilean data privacy for minors, effective December 2026)

### Needs Research in New Session

The AI tooling landscape changes weekly. The new session should research the current state of:
- Best embedding models for multilingual educational content (Spanish primary, some English)
- Best RAG frameworks / orchestration tools
- Current best practices for multi-format ingestion pipelines
- Latest Claude API capabilities (tool use, extended thinking, multi-agent patterns)
- Expo / React Native latest stable versions and relevant libraries
- Supabase latest capabilities (realtime, edge functions, storage)
- Any new tools that emerged recently and are relevant

---

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

---

## Current User Base and Scale Targets

- Current: approximately 500 users on the existing GENERA platform
- Scaling target: approximately 20,000 users
- Pilot phase: 2-3 schools initially, expanding to more as system stabilizes
- Ecuador expansion mentioned by Arnoldo (Coral's network) — needs to be considered in architecture but not necessarily launched in MVP

---

## Key Stakeholders

- **Arnoldo** — FNE visionary and decision-maker. Main point of friction currently: wants fixed categories for plan personal (scalability, cross-school comparability, Ecuador network). 
- **Sandra** — asesora from Virolai (Barcelona), deep methodological expertise
- **Mora** — part of FNE team, works closely with Chilean schools, aligned with Sandra and me on category flexibility
- **Coral Regí** — works with Ecuador network, relevant for international expansion
- **Brent (me)** — solo developer and tech lead

---

## Open Decisions Requiring Resolution

1. **Categories debate with Arnoldo** — still no consensus. Sandra, Mora, and I argue for customizable; Arnoldo wants fixed. Proposed compromise: foundation defines structural framework and recommended template; schools can rename and show/hide categories; tips and underlying logic remain consistent. **This needs to be resolved before data architecture is finalized.** The pitch document should include clear arguments for the compromise position, grounded in the research findings.

2. **Final name for the asesor role** — "tutor" has wrong connotations in Chile, "asesor" is confusing with Barcelona advisors, "sostén" has been proposed. Still open.

3. **Sociogram construction methodology** — research document addresses this. Built from both asesor observations AND student self-reporting, with age-appropriate design.

4. **Circle interface design** — needs to work for a student facilitator in front of their group without adult supervision. Not yet designed.

5. **Sensitive data protocol** — platform is explicitly NOT a protocol system for serious incidents (bullying, abuse). When a tutor encounters serious information, the tip is "stop recording, handle through school protocols." Legal liability implications for FNE still need formal legal advice.

6. **App launch strategy** — family app first, asesor app later. Specific sequencing needs to be in the execution plan.

---

## What I Need From the New Session

The new session should produce **a set of five documents** that together provide everything I need to:
- Present a compelling pitch to the FNE team (Arnoldo, Sandra, Mora, Coral)
- Execute the development plan with minimal surprises
- Resolve the outstanding decisions
- Brief a designer (myself or potentially a contractor later) on what mockups to produce

### The Five Documents

**Document 1 — Vision & Pedagogy (non-technical, for pitch)**
For Arnoldo, Sandra, Mora, Coral and other FNE team members. Narrative explanation of what GENERA is. The four users, the pedagogical practices, the three operational levels, the business model, conceptual mockups of key screens. Should make clear why this is worth building and why the compromise on categories serves everyone's interests.

**Document 2 — Technical Architecture & Development Plan (technical, blueprint)**
For me as the master development guide. Complete stack, data model, system architecture, RAG architecture and ingestion pipeline, mobile app architecture, API design, integration strategy (Supabase, Transbank, Whisper, Claude API, etc.), compliance architecture for Ley 21.719, security, performance, scalability. Deep technical detail.

**Document 3 — Roadmap & Execution Plan**
For me and for presenting to the team. Phases from now (April 2026) to December 2026 beta with pilots. Milestones, dependencies, risks, mitigation strategies, tooling and agent orchestration strategy, decisions pending (and their critical timing). Include a visual Gantt representation. Account realistically for development velocity given AI orchestration approach.

**Document 4 — Mockup Brief**
Prioritized list of screens needed with detailed descriptions, user flows, and states. Organized by user role and priority. Ready to hand to a designer (or to feed into v0/Figma/similar).

**Document 5 — Decisions Pending & Open Questions**
Everything unresolved. Who decides, by when, what are the implications of each option, recommended position. Includes the categories debate with Arnoldo structured as a conversation guide.

### Format

Each document as its own markdown file. The new session should produce them one at a time, getting my feedback before moving to the next. Start with Document 1.

### Length

Whatever it takes to leave minimal room for execution surprises due to lack of anticipation. My concern is not page count — it is completeness and quality.

### Mockups

I have not decided whether to generate mockups with v0, Figma, or other tools. The Mockup Brief (Document 4) should describe what is needed so the decision can be made later. If the new session can produce conceptual mockups as SVG or HTML artifacts inline in Document 1 to make the pitch more compelling, that's welcome.

---

## Research Document Context

Attached separately: a comprehensive research synthesis (`compass_artifact_wf-2c7bc2e3-aadd-4ea1-8ed3-641450dbb300_text_markdown.md`) covering ten design questions. It draws from over 20 platforms (Panorama Education, DESSA, Branching Minds, Storypark, ClassDojo and more) and dozens of research sources across developmental psychology, sociometric methodology, inclusive education, positive psychology, and pedagogical traditions spanning five continents.

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

## Instruction to Start the New Session

When pasting this into a new conversation, use this framing:

> I'm attaching two documents. The first is a handoff document from my previous session with Claude. The second is a research synthesis on GENERA — the platform described in the handoff.
>
> Please read both carefully before responding.
>
> Your task is to produce the five documents described in the handoff, starting with Document 1 (Vision & Pedagogy). Before you begin writing, confirm you have read and understood both documents, and ask any clarifying questions that you need answered before producing Document 1.
>
> Throughout the process, research the current state of AI tooling, React Native/Expo best practices, RAG architecture, and any other relevant technical landscape — since the field evolves rapidly and my previous session's knowledge may be outdated.

---

## Final Notes

- The new session should default to web search for anything technical — the landscape changes weekly
- The new session should feel free to push back on any assumption if the research or current tooling suggests a better path
- My biggest concern is execution — producing a plan that is actually achievable and that I can present with confidence
- I orchestrate AI agents; I am not a traditional solo developer. Plan accordingly — velocity is higher than traditional estimates, but so is the need for clear specifications that agents can execute against.

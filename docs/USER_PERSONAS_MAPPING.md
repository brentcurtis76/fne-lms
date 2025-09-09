# User Personas & Primary Questions Mapping

## Executive Summary
This document defines the key user personas for the FNE LMS reporting dashboard and maps their primary questions to specific dashboard components. This guides the card-based design and ensures each persona gets the information they need within the 5-second comprehension rule.

## User Personas

### 1. School Administrator (Administrador de Escuela)
**Role:** `admin`
**Context:** Oversees entire school's LMS usage, teacher performance, and student outcomes
**Technical Proficiency:** Medium to High
**Time Constraints:** High - needs quick insights for decision making

#### Primary Questions:
1. **"How is my school performing overall?"**
   - Cards: KPI Summary, School Performance Overview
   - Key Metrics: Overall completion rates, active user counts, course progress

2. **"Which teachers need support?"**
   - Cards: Teacher Performance, At-Risk Indicators
   - Key Metrics: Course completion rates, student engagement, time spent teaching

3. **"Are students engaging with collaborative spaces?"**
   - Cards: Community Health, Workspace Activity
   - Key Metrics: Community participation, peer interactions, collaborative project completion

4. **"What trends should I be aware of?"**
   - Cards: Progress Trends, Performance Analytics
   - Key Metrics: Month-over-month changes, seasonal patterns, comparative performance

#### Dashboard Priority:
1. KPI Summary (5-second overview)
2. Performance Trends (visual trends)
3. Teacher Support Needs (action items)
4. Collaborative Engagement (community health)

---

### 2. Community Manager (Líder de Comunidad)
**Role:** `lider_comunidad`
**Context:** Manages specific learning communities, focuses on engagement and collaboration
**Technical Proficiency:** Medium
**Time Constraints:** Medium - balances management with direct community interaction

#### Primary Questions:
1. **"How healthy is my community?"**
   - Cards: Community Health Score, Member Engagement
   - Key Metrics: Activity levels, member participation, collaboration frequency

2. **"Who are my most/least engaged members?"**
   - Cards: Member Activity, Engagement Rankings
   - Key Metrics: Login frequency, course progress, peer interactions

3. **"What collaborative activities are working?"**
   - Cards: Workspace Activity, Social Learning Metrics
   - Key Metrics: Document shares, peer support, cross-community connections

4. **"How do we compare to other communities?"**
   - Cards: Comparative Analytics, Benchmarking
   - Key Metrics: Relative performance, best practices, improvement opportunities

#### Dashboard Priority:
1. Community Health Score (immediate status)
2. Member Engagement Levels (who needs attention)
3. Collaborative Success Stories (what's working)
4. Improvement Opportunities (what needs focus)

---

### 3. Teacher/Instructor (Docente)
**Role:** `docente`
**Context:** Focuses on student progress in assigned courses, classroom management
**Technical Proficiency:** Low to Medium
**Time Constraints:** Very High - needs actionable insights quickly

#### Primary Questions:
1. **"How are my students progressing?"**
   - Cards: Student Progress Overview, Course Completion
   - Key Metrics: Individual student progress, assignment completion, quiz scores

2. **"Who needs immediate attention?"**
   - Cards: At-Risk Students, Performance Alerts
   - Key Metrics: Students falling behind, missed assignments, low engagement

3. **"Are my teaching materials effective?"**
   - Cards: Course Analytics, Content Performance
   - Key Metrics: Lesson completion rates, time spent per module, student feedback

4. **"How can I improve collaboration in my courses?"**
   - Cards: Student Collaboration, Peer Learning
   - Key Metrics: Group project participation, peer support metrics, discussion activity

#### Dashboard Priority:
1. Student Progress (immediate classroom needs)
2. At-Risk Alert System (urgent interventions)
3. Course Effectiveness (teaching improvement)
4. Collaboration Opportunities (enhanced learning)

---

### 4. Network Supervisor (Supervisor de Red)
**Role:** `supervisor_de_red`
**Context:** Oversees multiple schools within a network, strategic oversight
**Technical Proficiency:** High
**Time Constraints:** Medium - strategic focus with periodic deep dives

#### Primary Questions:
1. **"How is the network performing as a whole?"**
   - Cards: Network-wide KPIs, Cross-School Analytics
   - Key Metrics: Network completion rates, resource utilization, performance gaps

2. **"Which schools need strategic support?"**
   - Cards: School Comparison, Performance Gaps
   - Key Metrics: Relative performance, resource needs, improvement trends

3. **"Are schools collaborating effectively?"**
   - Cards: Inter-School Collaboration, Network Health
   - Key Metrics: Cross-school projects, resource sharing, best practice adoption

4. **"What are the long-term trends and opportunities?"**
   - Cards: Strategic Analytics, Predictive Insights
   - Key Metrics: Growth trajectories, capacity planning, network expansion opportunities

#### Dashboard Priority:
1. Network Performance Overview (strategic context)
2. School Comparative Analysis (resource allocation)
3. Collaboration Effectiveness (network synergy)
4. Strategic Opportunities (growth planning)

---

### 5. Educational Consultant (Consultor)
**Role:** `consultor`
**Context:** Provides guidance to teachers and administrators, focuses on pedagogy and outcomes
**Technical Proficiency:** High
**Time Constraints:** Medium - analytical focus with detailed reporting needs

#### Primary Questions:
1. **"What pedagogical patterns are emerging?"**
   - Cards: Learning Analytics, Teaching Effectiveness
   - Key Metrics: Learning pattern analysis, content effectiveness, student engagement patterns

2. **"Where can I add the most value?"**
   - Cards: Intervention Opportunities, Impact Analysis
   - Key Metrics: Teacher support needs, student performance gaps, improvement potential

3. **"How effective are my recommendations?"**
   - Cards: Consultation Impact, Outcome Tracking
   - Key Metrics: Before/after comparisons, improvement trajectories, success stories

4. **"What best practices should be shared?"**
   - Cards: Success Stories, Best Practice Identification
   - Key Metrics: High-performing patterns, replicable strategies, scaling opportunities

#### Dashboard Priority:
1. Pedagogical Insights (professional expertise)
2. Impact Measurement (effectiveness tracking)
3. Intervention Opportunities (value addition)
4. Best Practice Documentation (knowledge sharing)

## Card Mapping Matrix

| Card Type | Admin | Community Manager | Teacher | Network Supervisor | Consultant |
|-----------|-------|------------------|---------|-------------------|------------|
| KPI Summary | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| Student Progress | ⭐⭐ | ⭐ | ⭐⭐⭐ | ⭐ | ⭐⭐ |
| Community Health | ⭐⭐ | ⭐⭐⭐ | ⭐ | ⭐⭐ | ⭐⭐ |
| Workspace Activity | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| Performance Analytics | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| At-Risk Alerts | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| Collaboration Metrics | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| Comparative Analysis | ⭐⭐ | ⭐⭐⭐ | ⭐ | ⭐⭐⭐ | ⭐⭐ |
| Strategic Insights | ⭐⭐⭐ | ⭐ | ⭐ | ⭐⭐⭐ | ⭐⭐⭐ |

**Legend:** ⭐⭐⭐ = Essential, ⭐⭐ = Important, ⭐ = Nice to have

## Design Implications

### Card Layout Priority by Persona
1. **Top Row (5-second comprehension):** Role-specific KPIs and alerts
2. **Second Row (immediate action):** Urgent items requiring attention
3. **Third Row (context):** Performance trends and comparative data
4. **Bottom Row (exploration):** Detailed analytics and collaborative insights

### Responsive Considerations
- **Mobile-first for Teachers:** Quick student progress checks between classes
- **Tablet-optimized for Community Managers:** Touch-friendly community management
- **Desktop-focused for Strategic Roles:** Complex analytics and multi-screen workflows

### Interaction Patterns
- **Click-through depth:** Summary → Details → Individual records
- **Filtering scope:** Role-appropriate data boundaries
- **Export capabilities:** Match reporting needs (admin = comprehensive, teacher = student-focused)

This persona mapping ensures our card-based dashboard delivers the right information to the right people in the right format, supporting the 5-second comprehension rule while enabling deeper exploration when needed.
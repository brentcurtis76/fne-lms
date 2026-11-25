# Charts on the platform

Written by `scripts/redesign/inventory.mjs` from commit `a908cc8b5`. For the later proposal of chart colours: the approved look fixes colours for one series only (DESIGN.md section 6).

A series is one set of bars, one line, one area or one shape. A pie has one series and several slices.

| Screen | File | Chart | Series | How many | Colours today | Shown when |
|---|---|---|---|---|---|---|
| /admin/qa/coverage | `pages/admin/qa/coverage.tsx` l.594 | LineChart | Line `lines`; Line `statements`; Line `functions`; Line `branches` | 4 | `#fbbf24`, `#f59e0b`, `#6b7280`, `#1f1f1f` | `!(loading) && stats && stats.total_reports > 0 && trends.length > 1` |
| /admin/qa/coverage | `pages/admin/qa/coverage.tsx` l.633 | BarChart | Bar `avg_lines` «Cobertura» (slices: one colour per data row) | 1 | per slice | `!(loading) && stats && stats.total_reports > 0 && stats.by_suite.length > 1` |
| /admin/qa | `pages/admin/qa/index.tsx` l.684 | AreaChart | Area `passed`; Area `failed` | 2 | `url(#colorPassed)`, `url(#colorFailed)` | `!(loadingTrends) && !(trendData.length === 0)` |
| /admin/qa/lighthouse | `pages/admin/qa/lighthouse.tsx` l.596 | LineChart | Line `LCP`; Line `INP`; Line `FCP`; Line `TTFB` | 4 | `#fbbf24`, `#f59e0b`, `#6b7280`, `#1f1f1f` | `activeTab === 'vitals' && !(loadingVitals) && vitalStats && Object.keys(vitalStats.by_vital).length > 0 && vitalTrends.length > 0` |
| /admin/qa/lighthouse | `pages/admin/qa/lighthouse.tsx` l.843 | AreaChart | Area `performance`; Line `accessibility`; Line `best_practices`; Line `seo` | 4 | `url(#colorPerf)`, `#6b7280`, `#1f1f1f`, `#f59e0b` | `activeTab === 'lighthouse' && !(loadingLighthouse) && lighthouseStats && lighthouseStats.total_audits > 0 && lighthouseTrends.length > 0` |
| /admin/qa/load-tests | `pages/admin/qa/load-tests.tsx` l.672 | LineChart | Line `response_time_p95`; Line `response_time_p99`; Line `error_rate` | 3 | `#fbbf24`, `#f59e0b`, `#6b7280` | `!(loading) && stats && stats.total_tests > 0 && trends.length > 1` |
| /community/transformation/report (to be deleted) | `pages/community/transformation/report.tsx` l.179 | RadarChart | Radar `level` «Nivel Promedio» | 1 | `{COLORS.brand_blue}` |  |
| /community/transformation/report (to be deleted) | `pages/community/transformation/report.tsx` l.206 | BarChart | Bar `level` (slices: one colour per data row) | 1 | per slice |  |
| /consultor/sessions/reports | `pages/consultor/sessions/reports.tsx` l.664 | BarChart | Bar `completed` «Completadas»; Bar `cancelled` «Canceladas»; Bar `other` «Otras» | 3 | `rgb(var(--color-legacy-10b981))`, `rgb(var(--color-red-500))`, `rgb(var(--color-gray-400))` |  |
| /consultor/sessions/reports | `pages/consultor/sessions/reports.tsx` l.681 | PieChart | Pie `count` (slices: one colour per data row) | 1 | per slice |  |
| /consultor/sessions/reports | `pages/consultor/sessions/reports.tsx` l.706 | PieChart | Pie `count` (slices: one colour per data row) | 1 | per slice |  |
| /consultor/sessions/reports | `pages/consultor/sessions/reports.tsx` l.731 | AreaChart | Area `avg_attendance_rate` «Asistencia (%)» | 1 | `{FNE_COLORS.brand_accent_light}` |  |
| /consultor/sessions/reports | `pages/consultor/sessions/reports.tsx` l.752 | BarChart | Bar `total` «Total»; Bar `completed` «Completadas» | 2 | `rgb(var(--color-serie-1, var(--color-blue-500)))`, `rgb(var(--color-serie-2, var(--color-legacy-10b981)))` | `isAdmin && analyticsData.sessions_by_school.length > 0` |
| /consultor/sessions/reports | `pages/consultor/sessions/reports.tsx` l.779 | BarChart | Bar `sessions_led` «Sesiones dirigidas» | 1 | `{FNE_COLORS.brand_accent}` | `isAdmin && analyticsData.top_consultants && analyticsData.top_consultants.length > 0` |
| /directivo/assessments/dashboard | `pages/directivo/assessments/dashboard.tsx` l.553 | BarChart | Bar `score` (slices: one colour per data row) | 1 | per slice | `!(!hasResults) && activeTab === 'overview'` |
| /directivo/assessments/dashboard | `pages/directivo/assessments/dashboard.tsx` l.584 | RadarChart | Radar `score` «Promedio» | 1 | `rgb(var(--color-blue-600))` | `!(!hasResults) && activeTab === 'overview' && radarData.length >= 3` |
| /directivo/assessments/dashboard | `pages/directivo/assessments/dashboard.tsx` l.647 | PieChart | Pie `value` (slices: one colour per data row) | 1 | per slice | `!(!hasResults) && activeTab === 'courses' && scoredCourses.length > 0` |
| /school/migration-plan | `pages/school/migration-plan/index.tsx` l.564 | PieChart | Pie `value` (slices: 2) | 1 | `none` | `grades.length > 0 && each [1, 2, 3, 4, 5]` |
| /demo/assessments/[templateId]/results, /docente/assessments/[instanceId]/results | `components/assessment/results/ResultsCharts.tsx` l.44 | BarChart | Bar `score` | 1 | `#fbbf24` |  |
| /demo/assessments/[templateId]/results, /docente/assessments/[instanceId]/results | `components/assessment/results/ResultsCharts.tsx` l.67 | RadarChart | Radar `score` «Puntuación» | 1 | `#fbbf24` | `moduleScores.length >= 3` |
| /reporte-horas | `components/hours/SchoolHoursReport.tsx` l.91 | PieChart | Pie `value` (slices: one colour per data row) | 1 | per slice |  |
| /detailed-reports | `components/reports/AnalyticsDashboard.tsx` l.384 | LineChart | Line `lessons_completed` «Lecciones Completadas»; Line `unique_users` «Usuarios Activos» | 2 | `rgb(var(--color-serie-1, 10 10 10))`, `rgb(var(--color-serie-2, 251 191 36))` |  |
| /detailed-reports | `components/reports/AnalyticsDashboard.tsx` l.425 | AreaChart | Area `total_time_hours` «Total Horas»; Area `avg_time_per_user` «Promedio por Usuario» | 2 | `{withAlpha('rgb(var(--color-serie-1, var(--color-legacy-10b981)))', '30')}`, `{withAlpha('rgb(var(--color-serie-2, var(--color-blue-500)))', '30')}` |  |
| /reports | `components/reports/AnalyticsVisualization.tsx` l.269 | LineChart | Line `completedLessons` «Lecciones Completadas»; Line `activeUsers` «Usuarios Activos» | 2 | `rgb(var(--color-serie-1, 10 10 10))`, `rgb(var(--color-serie-2, 251 191 36))` |  |
| /reports | `components/reports/AnalyticsVisualization.tsx` l.311 | BarChart | Bar `completionRate` «Tasa de Completación (%)» | 1 | `{FNE_COLORS.success}` |  |
| /reports | `components/reports/AnalyticsVisualization.tsx` l.344 | BarChart | Bar `count` «Número de Estudiantes» | 1 | `{FNE_COLORS.info}` |  |
| /reports | `components/reports/AnalyticsVisualization.tsx` l.371 | AreaChart | Area `totalHours` «Total Horas»; Area `avgHoursPerUser` «Promedio por Usuario» | 2 | `{withAlpha('rgb(var(--color-serie-1, 10 10 10))', '80')}`, `{withAlpha('rgb(var(--color-serie-2, 251 191 36))', '80')}` |  |
| /reports | `components/reports/AnalyticsVisualization.tsx` l.413 | ScatterChart | Scatter `avgScore` | 1 | `{FNE_COLORS.success}` |  |
| /reports | `components/reports/LearningPathAnalytics.tsx` l.220 | BarChart | Bar `completionRate` «Tasa de Completación (%)» | 1 | `rgb(var(--color-blue-500))` | `ratedPaths.length > 0` |
| /reports | `components/reports/LearningPathAnalytics.tsx` l.262 | LineChart | Line `completions` «Completaciones de curso»; Line `enrollments` «Nuevas asignaciones» | 2 | `rgb(var(--color-serie-1, var(--color-blue-500)))`, `rgb(var(--color-serie-2, var(--color-legacy-10b981)))` | `data.completionTrends.length > 0` |
| no screen uses this file | `components/reports/ResponsiveChart.tsx` l.118 | LineChart | Line `{key}` (one per item of a list) | varies (one per item of a list) | `{colors[index % colors.length]}` | `type === 'line'` |
| no screen uses this file | `components/reports/ResponsiveChart.tsx` l.140 | AreaChart | Area `{key}` (one per item of a list) | varies (one per item of a list) | `{'${colors[index % colors.length]}30'}` | `type === 'area'` |
| no screen uses this file | `components/reports/ResponsiveChart.tsx` l.161 | BarChart | Bar `{key}` (one per item of a list) | varies (one per item of a list) | `{colors[index % colors.length]}` | `type === 'bar'` |
| no screen uses this file | `components/reports/ResponsiveChart.tsx` l.180 | PieChart | Pie `value` (slices: one colour per data row) | 1 | `#8884d8` | `type === 'pie'` |
| /vias-transformacion/[id] (to be deleted) | `components/transformation/EvaluationCharts.tsx` l.165 | RadarChart | Radar `level` «Nivel Promedio» | 1 | `{COLORS.brand_blue}` |  |
| /vias-transformacion/[id] (to be deleted) | `components/transformation/EvaluationCharts.tsx` l.214 | BarChart | Bar `level` (slices: one colour per data row) | 1 | per slice |  |

36 charts drawn with recharts.

## Charts drawn without recharts (found by hand)

- No chart drawn without recharts was found on a platform screen (searched for hand-drawn SVG shapes and conic gradients on 13 Nov 2026). Progress bars and progress rings are not counted as charts.
- components/propuestas-web/ModuleTimeline.tsx draws a timeline for the public proposal page (a document surface, outside the redesign).
- components/reports/ResponsiveChart.tsx can draw a line, area, bar or pie chart with one series per key, but no screen uses it.


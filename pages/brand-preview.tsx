/**
 * Genera Brand Preview Page
 * Visual mockup of the new brand applied to UI components
 * This is a standalone preview - does NOT modify any existing code
 */

import React, { useState } from 'react';
import Head from 'next/head';
import Footer from '@/components/Footer';

// Genera Brand Colors
const GENERA_COLORS = {
  primary: '#0a0a0a',      // Black - Primary
  accent: '#fbbf24',       // Yellow - Accent
  accentHover: '#f59e0b',  // Intense Yellow - Hover
  accentLight: '#fcd34d',  // Light Yellow - Highlights
  light: '#ffffff',        // White - Background
  grayDark: '#1f1f1f',     // Dark Gray - Secondary text
  grayMedium: '#6b7280',   // Medium Gray - Tertiary text
};

// Current FNE Colors (for comparison)
const FNE_COLORS = {
  primary: '#0a0a0a',      // Navy Blue
  accent: '#fbbf24',       // Gold Yellow
  background: '#e8e5e2',   // Beige
};

export default function BrandPreview() {
  const [activeTab, setActiveTab] = useState<'genera' | 'comparison' | 'audit'>('genera');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <>
      <Head>
        <title>Genera Brand Preview</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div className="min-h-screen bg-gray-100">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Genera Brand Preview</h1>
                <p className="text-sm text-gray-500 mt-1">Vista previa del nuevo branding - Sin modificar codigo existente</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('genera')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === 'genera'
                      ? 'bg-[#0a0a0a] text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Genera (Nuevo)
                </button>
                <button
                  onClick={() => setActiveTab('comparison')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === 'comparison'
                      ? 'bg-[#0a0a0a] text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Comparacion
                </button>
                <button
                  onClick={() => setActiveTab('audit')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === 'audit'
                      ? 'bg-[#0a0a0a] text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Auditoria Visual
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-8">
          {activeTab === 'genera' ? (
            <GeneraBrandShowcase sidebarCollapsed={sidebarCollapsed} setSidebarCollapsed={setSidebarCollapsed} />
          ) : activeTab === 'comparison' ? (
            <BrandComparison />
          ) : (
            <VisualStyleAudit />
          )}
        </main>
      </div>
    </>
  );
}

// ============================================
// GENERA BRAND SHOWCASE
// ============================================

function GeneraBrandShowcase({
  sidebarCollapsed,
  setSidebarCollapsed
}: {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
}) {
  return (
    <div className="space-y-12">
      {/* Section 1: Brand Elements */}
      <section>
        <SectionTitle>1. Elementos de Marca</SectionTitle>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Logo */}
          <div className="bg-white rounded-xl p-8 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Logo Principal</h3>

            {/* Logo on light background */}
            <div className="bg-white border border-gray-200 rounded-lg p-8 mb-4 flex flex-col items-center">
              <GeneraLogo variant="dark" size="large" />
              <p className="text-xs text-gray-500 mt-4">Fondo claro</p>
            </div>

            {/* Logo on dark background */}
            <div className="bg-[#0a0a0a] rounded-lg p-8 flex flex-col items-center">
              <GeneraLogo variant="light" size="large" />
              <p className="text-xs text-gray-400 mt-4">Fondo oscuro</p>
            </div>
          </div>

          {/* Color Palette */}
          <div className="bg-white rounded-xl p-8 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Paleta de Colores</h3>

            <div className="space-y-3">
              <ColorSwatch
                name="Primary (Black)"
                hex="#0a0a0a"
                className="bg-[#0a0a0a]"
                textLight
              />
              <ColorSwatch
                name="Accent (Yellow)"
                hex="#fbbf24"
                className="bg-[#fbbf24]"
              />
              <ColorSwatch
                name="Accent Hover"
                hex="#f59e0b"
                className="bg-[#f59e0b]"
              />
              <ColorSwatch
                name="Accent Light"
                hex="#fcd34d"
                className="bg-[#fcd34d]"
              />
              <ColorSwatch
                name="Background (White)"
                hex="#ffffff"
                className="bg-white border border-gray-200"
              />
              <ColorSwatch
                name="Dark Gray"
                hex="#1f1f1f"
                className="bg-[#1f1f1f]"
                textLight
              />
              <ColorSwatch
                name="Medium Gray"
                hex="#6b7280"
                className="bg-[#6b7280]"
                textLight
              />
            </div>
          </div>
        </div>

        {/* Typography */}
        <div className="bg-white rounded-xl p-8 shadow-sm mt-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Tipografia - Inter</h3>

          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <p className="text-sm text-gray-500 mb-2">Light (300) - Logo</p>
              <p className="text-3xl font-light tracking-[0.2em] text-[#0a0a0a]">GENERA</p>
              <p className="text-sm font-light tracking-[0.15em] text-[#6b7280] mt-1">HUB DE TRANSFORMACION</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-2">Regular (400) - Body</p>
              <p className="text-base font-normal text-[#1f1f1f]">
                Acompanamos a las comunidades educativas hacia una transformacion profunda.
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-2">Bold (700) - Headings</p>
              <p className="text-2xl font-bold text-[#0a0a0a]">Mi Panel</p>
              <p className="text-xl font-bold text-[#0a0a0a] mt-2">Cursos Activos</p>
            </div>
          </div>
        </div>

        {/* Logo Variants Gallery */}
        <div className="bg-white rounded-xl p-8 shadow-sm mt-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Variantes de Logo Disponibles</h3>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Full Logo - Light BG */}
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-3">Full - Fondo Claro</p>
              <div className="bg-white flex items-center justify-center h-32">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/genera/logo-full-on-light.svg" alt="Logo full on light" className="max-h-28 w-auto" />
              </div>
              <p className="text-xs text-gray-400 mt-2 font-mono">/genera/logo-full-on-light.svg</p>
            </div>

            {/* Full Logo - Dark BG */}
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-3">Full - Fondo Oscuro</p>
              <div className="bg-[#0a0a0a] rounded flex items-center justify-center h-32">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/genera/logo-full-on-dark.svg" alt="Logo full on dark" className="max-h-28 w-auto" />
              </div>
              <p className="text-xs text-gray-400 mt-2 font-mono">/genera/logo-full-on-dark.svg</p>
            </div>

            {/* Horizontal Logo - Light BG */}
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-3">Horizontal - Fondo Claro</p>
              <div className="bg-white flex items-center justify-center h-32">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/genera/logo-horizontal-on-light.svg" alt="Logo horizontal on light" className="max-h-12 w-auto" />
              </div>
              <p className="text-xs text-gray-400 mt-2 font-mono">/genera/logo-horizontal-on-light.svg</p>
            </div>

            {/* Horizontal Logo - Dark BG */}
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-3">Horizontal - Fondo Oscuro</p>
              <div className="bg-[#0a0a0a] rounded flex items-center justify-center h-32">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/genera/logo-horizontal-on-dark.svg" alt="Logo horizontal on dark" className="max-h-12 w-auto" />
              </div>
              <p className="text-xs text-gray-400 mt-2 font-mono">/genera/logo-horizontal-on-dark.svg</p>
            </div>

            {/* Compact Logo - Light BG */}
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-3">Compact - Fondo Claro</p>
              <div className="bg-white flex items-center justify-center h-32">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/genera/logo-compact-on-light.svg" alt="Logo compact on light" className="max-h-14 w-auto" />
              </div>
              <p className="text-xs text-gray-400 mt-2 font-mono">/genera/logo-compact-on-light.svg</p>
            </div>

            {/* Compact Logo - Dark BG */}
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-3">Compact - Fondo Oscuro</p>
              <div className="bg-[#0a0a0a] rounded flex items-center justify-center h-32">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/genera/logo-compact-on-dark.svg" alt="Logo compact on dark" className="max-h-14 w-auto" />
              </div>
              <p className="text-xs text-gray-400 mt-2 font-mono">/genera/logo-compact-on-dark.svg</p>
            </div>

            {/* Icon - Light BG */}
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-3">Icono - Fondo Claro</p>
              <div className="bg-white flex items-center justify-center h-32">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/genera/icon-on-light.svg" alt="Icon on light" className="w-16 h-16" />
              </div>
              <p className="text-xs text-gray-400 mt-2 font-mono">/genera/icon-on-light.svg</p>
            </div>

            {/* Icon - Dark BG */}
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-3">Icono - Fondo Oscuro</p>
              <div className="bg-[#0a0a0a] rounded flex items-center justify-center h-32">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/genera/icon-on-dark.svg" alt="Icon on dark" className="w-16 h-16" />
              </div>
              <p className="text-xs text-gray-400 mt-2 font-mono">/genera/icon-on-dark.svg</p>
            </div>

            {/* Favicon */}
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-3">Favicon</p>
              <div className="bg-gray-100 rounded flex items-center justify-center h-32 gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/genera/genera-favicon.svg" alt="Favicon" className="w-8 h-8" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/genera/genera-favicon.svg" alt="Favicon" className="w-6 h-6" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/genera/genera-favicon.svg" alt="Favicon" className="w-4 h-4" />
              </div>
              <p className="text-xs text-gray-400 mt-2 font-mono">/genera/genera-favicon.svg</p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Navigation Mockups */}
      <section>
        <SectionTitle>2. Navegacion</SectionTitle>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Sidebar Mockup */}
          <div className="lg:col-span-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Sidebar</h3>
            <div className="rounded-xl overflow-hidden shadow-lg">
              <MockSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
            </div>
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="mt-4 text-sm text-[#0a0a0a] hover:text-[#fbbf24] transition-colors"
            >
              {sidebarCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
            </button>
          </div>

          {/* Header Mockup */}
          <div className="lg:col-span-2">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Header</h3>
            <div className="rounded-xl overflow-hidden shadow-lg">
              <MockHeader />
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Buttons */}
      <section>
        <SectionTitle>3. Botones</SectionTitle>

        <div className="bg-white rounded-xl p-8 shadow-sm">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Primary Button */}
            <div>
              <p className="text-sm text-gray-500 mb-3">Primary</p>
              <button className="w-full px-6 py-3 bg-[#0a0a0a] text-white rounded-lg font-medium hover:bg-[#1f1f1f] transition-colors">
                Guardar
              </button>
              <button className="w-full mt-2 px-6 py-3 bg-[#0a0a0a] text-white rounded-lg font-medium opacity-50 cursor-not-allowed">
                Deshabilitado
              </button>
            </div>

            {/* Secondary/Accent Button */}
            <div>
              <p className="text-sm text-gray-500 mb-3">Secondary (Accent)</p>
              <button className="w-full px-6 py-3 bg-[#fbbf24] text-[#0a0a0a] rounded-lg font-medium hover:bg-[#f59e0b] transition-colors">
                Continuar
              </button>
              <button className="w-full mt-2 px-6 py-3 bg-[#fbbf24] text-[#0a0a0a] rounded-lg font-medium opacity-50 cursor-not-allowed">
                Deshabilitado
              </button>
            </div>

            {/* Outline Button */}
            <div>
              <p className="text-sm text-gray-500 mb-3">Outline</p>
              <button className="w-full px-6 py-3 bg-transparent border-2 border-[#0a0a0a] text-[#0a0a0a] rounded-lg font-medium hover:bg-[#0a0a0a] hover:text-white transition-colors">
                Cancelar
              </button>
              <button className="w-full mt-2 px-6 py-3 bg-transparent border-2 border-gray-300 text-gray-400 rounded-lg font-medium cursor-not-allowed">
                Deshabilitado
              </button>
            </div>

            {/* Ghost Button */}
            <div>
              <p className="text-sm text-gray-500 mb-3">Ghost</p>
              <button className="w-full px-6 py-3 bg-transparent text-[#0a0a0a] rounded-lg font-medium hover:bg-gray-100 transition-colors">
                Ver mas
              </button>
              <button className="w-full mt-2 px-6 py-3 bg-transparent text-[#fbbf24] rounded-lg font-medium hover:bg-[#fbbf24]/10 transition-colors">
                Accion secundaria
              </button>
            </div>
          </div>

          {/* Button Sizes */}
          <div className="mt-8 pt-8 border-t border-gray-200">
            <p className="text-sm text-gray-500 mb-3">Tamanos</p>
            <div className="flex flex-wrap items-center gap-4">
              <button className="px-3 py-1.5 bg-[#0a0a0a] text-white text-sm rounded-md font-medium">
                Small
              </button>
              <button className="px-5 py-2.5 bg-[#0a0a0a] text-white rounded-lg font-medium">
                Medium
              </button>
              <button className="px-8 py-3.5 bg-[#0a0a0a] text-white text-lg rounded-lg font-medium">
                Large
              </button>
              <button className="p-3 bg-[#0a0a0a] text-white rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: Cards */}
      <section>
        <SectionTitle>4. Cards</SectionTitle>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Course Card */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100 hover:shadow-lg transition-shadow">
            <div className="h-32 bg-gradient-to-br from-[#0a0a0a] to-[#1f1f1f] flex items-center justify-center">
              <svg className="w-12 h-12 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 bg-[#fbbf24]/20 text-[#0a0a0a] text-xs font-medium rounded">
                  En progreso
                </span>
              </div>
              <h4 className="font-bold text-[#0a0a0a] mb-1">Liderazgo Transformacional</h4>
              <p className="text-sm text-[#6b7280] mb-4">Modulo 3 de 8</p>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-[#fbbf24] h-2 rounded-full" style={{ width: '45%' }}></div>
              </div>
              <p className="text-xs text-[#6b7280] mt-2">45% completado</p>
            </div>
          </div>

          {/* Stats Card */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-[#6b7280]">Cursos Completados</h4>
              <div className="w-10 h-10 bg-[#fbbf24]/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-[#fbbf24]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <p className="text-4xl font-bold text-[#0a0a0a]">12</p>
            <p className="text-sm text-[#6b7280] mt-1">+3 este mes</p>
          </div>

          {/* Notification Card */}
          <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-[#fbbf24]">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-[#fbbf24]/20 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-[#fbbf24]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <div>
                <h4 className="font-semibold text-[#0a0a0a]">Nueva tarea asignada</h4>
                <p className="text-sm text-[#6b7280] mt-1">Tienes una nueva tarea en el curso de Liderazgo.</p>
                <p className="text-xs text-[#6b7280] mt-2">Hace 5 minutos</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 5: Form Elements */}
      <section>
        <SectionTitle>5. Elementos de Formulario</SectionTitle>

        <div className="bg-white rounded-xl p-8 shadow-sm">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Inputs */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#1f1f1f] mb-1.5">
                  Input normal
                </label>
                <input
                  type="text"
                  placeholder="Escribe aqui..."
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-[#fbbf24] outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1f1f1f] mb-1.5">
                  Input con error
                </label>
                <input
                  type="text"
                  defaultValue="Valor invalido"
                  className="w-full px-4 py-2.5 border border-red-500 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                />
                <p className="text-sm text-red-500 mt-1">Este campo es requerido</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1f1f1f] mb-1.5">
                  Select
                </label>
                <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-[#fbbf24] outline-none bg-white">
                  <option>Selecciona una opcion</option>
                  <option>Opcion 1</option>
                  <option>Opcion 2</option>
                </select>
              </div>
            </div>

            {/* Checkboxes & Toggles */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#1f1f1f] mb-3">
                  Checkboxes
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" defaultChecked className="w-5 h-5 rounded border-gray-300 text-[#fbbf24] focus:ring-[#fbbf24]" />
                    <span className="text-[#1f1f1f]">Opcion seleccionada</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" className="w-5 h-5 rounded border-gray-300 text-[#fbbf24] focus:ring-[#fbbf24]" />
                    <span className="text-[#1f1f1f]">Opcion sin seleccionar</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1f1f1f] mb-3">
                  Toggle Switch
                </label>
                <div className="space-y-2">
                  <MockToggle defaultChecked label="Notificaciones activadas" />
                  <MockToggle label="Modo oscuro" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 6: Alerts & Toasts */}
      <section>
        <SectionTitle>6. Alertas y Toasts</SectionTitle>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Alerts - On Brand */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Alertas (On-Brand)</h3>

            {/* Info Alert - Gray subtle */}
            <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#0a0a0a] rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <span className="font-semibold text-[#0a0a0a]">Informacion</span>
                  <p className="text-sm text-[#6b7280] mt-0.5">Este es un mensaje informativo.</p>
                </div>
              </div>
            </div>

            {/* Success Alert - Yellow accent */}
            <div className="bg-[#fbbf24]/10 border border-[#fbbf24] p-4 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#fbbf24] rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-[#0a0a0a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <span className="font-semibold text-[#0a0a0a]">Completado</span>
                  <p className="text-sm text-[#1f1f1f] mt-0.5">La operacion se completo correctamente.</p>
                </div>
              </div>
            </div>

            {/* Error Alert - Black with strong contrast */}
            <div className="bg-[#0a0a0a] p-4 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-[#0a0a0a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <div>
                  <span className="font-semibold text-white">Error</span>
                  <p className="text-sm text-gray-300 mt-0.5">Hubo un problema al procesar tu solicitud.</p>
                </div>
              </div>
            </div>

            {/* Warning Alert - Yellow outline */}
            <div className="bg-white border-2 border-[#fbbf24] p-4 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 border-2 border-[#fbbf24] rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-[#fbbf24]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <span className="font-semibold text-[#0a0a0a]">Atencion</span>
                  <p className="text-sm text-[#6b7280] mt-0.5">Revisa esta informacion antes de continuar.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Toasts - On Brand */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Toast Notifications (On-Brand)</h3>

            {/* Success Toast - Yellow accent bar */}
            <div className="bg-white rounded-lg shadow-lg overflow-hidden flex items-stretch">
              <div className="w-1.5 bg-[#fbbf24]"></div>
              <div className="flex items-center gap-3 p-4 flex-1">
                <div className="w-10 h-10 bg-[#fbbf24] rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-[#0a0a0a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-[#0a0a0a]">Guardado exitosamente</p>
                  <p className="text-sm text-[#6b7280]">Los cambios han sido guardados.</p>
                </div>
                <button className="text-gray-400 hover:text-[#0a0a0a] transition-colors p-1">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Error Toast - Black accent bar */}
            <div className="bg-white rounded-lg shadow-lg overflow-hidden flex items-stretch">
              <div className="w-1.5 bg-[#0a0a0a]"></div>
              <div className="flex items-center gap-3 p-4 flex-1">
                <div className="w-10 h-10 bg-[#0a0a0a] rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-[#0a0a0a]">Error al guardar</p>
                  <p className="text-sm text-[#6b7280]">Intenta nuevamente.</p>
                </div>
                <button className="text-gray-400 hover:text-[#0a0a0a] transition-colors p-1">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Loading Toast - Subtle gray */}
            <div className="bg-white rounded-lg shadow-lg overflow-hidden flex items-stretch">
              <div className="w-1.5 bg-gray-400"></div>
              <div className="flex items-center gap-3 p-4 flex-1">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-[#6b7280] animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-[#0a0a0a]">Procesando...</p>
                  <p className="text-sm text-[#6b7280]">Por favor espera.</p>
                </div>
              </div>
            </div>

            {/* Inverted Toast - Dark mode style */}
            <div className="bg-[#0a0a0a] rounded-lg shadow-lg overflow-hidden flex items-stretch">
              <div className="w-1.5 bg-[#fbbf24]"></div>
              <div className="flex items-center gap-3 p-4 flex-1">
                <div className="w-10 h-10 bg-[#fbbf24] rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-[#0a0a0a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-white">Nueva notificacion</p>
                  <p className="text-sm text-gray-400">Tienes una nueva tarea asignada.</p>
                </div>
                <button className="text-gray-500 hover:text-white transition-colors p-1">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 7: Badges */}
      <section>
        <SectionTitle>7. Badges y Tags</SectionTitle>

        <div className="bg-white rounded-xl p-8 shadow-sm">
          <p className="text-sm text-gray-600 mb-6">Sistema de badges usando solo la paleta Genera (negro, amarillo, blanco, grises).</p>

          {/* Primary badges */}
          <div className="mb-6">
            <p className="text-xs text-gray-500 mb-3 uppercase tracking-wide">Primarios</p>
            <div className="flex flex-wrap gap-3">
              <span className="px-3 py-1 bg-[#0a0a0a] text-white text-sm font-medium rounded-full">
                Default
              </span>
              <span className="px-3 py-1 bg-[#fbbf24] text-[#0a0a0a] text-sm font-medium rounded-full">
                Accent
              </span>
              <span className="px-3 py-1 bg-[#fbbf24]/20 text-[#0a0a0a] text-sm font-medium rounded-full">
                Accent Light
              </span>
              <span className="px-3 py-1 border border-[#0a0a0a] text-[#0a0a0a] text-sm font-medium rounded-full">
                Outline
              </span>
              <span className="px-3 py-1 border border-[#fbbf24] text-[#0a0a0a] text-sm font-medium rounded-full">
                Outline Accent
              </span>
            </div>
          </div>

          {/* Status badges - On Brand */}
          <div className="mb-6">
            <p className="text-xs text-gray-500 mb-3 uppercase tracking-wide">Estados (On-Brand)</p>
            <div className="flex flex-wrap gap-3">
              <span className="px-3 py-1 bg-[#fbbf24] text-[#0a0a0a] text-sm font-medium rounded-full inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-[#0a0a0a] rounded-full"></span>
                Completado
              </span>
              <span className="px-3 py-1 bg-[#0a0a0a] text-white text-sm font-medium rounded-full inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-[#fbbf24] rounded-full animate-pulse"></span>
                En progreso
              </span>
              <span className="px-3 py-1 bg-white border-2 border-[#0a0a0a] text-[#0a0a0a] text-sm font-medium rounded-full inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 border border-[#0a0a0a] rounded-full"></span>
                Pendiente
              </span>
              <span className="px-3 py-1 bg-gray-100 text-gray-500 text-sm font-medium rounded-full">
                Inactivo
              </span>
            </div>
          </div>

          {/* Role badges */}
          <div className="mb-6">
            <p className="text-xs text-gray-500 mb-3 uppercase tracking-wide">Roles</p>
            <div className="flex flex-wrap gap-3">
              <span className="px-3 py-1 bg-[#0a0a0a] text-[#fbbf24] text-sm font-medium rounded-full">
                Admin
              </span>
              <span className="px-3 py-1 bg-[#1f1f1f] text-white text-sm font-medium rounded-full">
                Directivo
              </span>
              <span className="px-3 py-1 bg-[#374151] text-white text-sm font-medium rounded-full">
                Docente
              </span>
              <span className="px-3 py-1 bg-[#6b7280] text-white text-sm font-medium rounded-full">
                Estudiante
              </span>
            </div>
          </div>

          {/* Category badges */}
          <div>
            <p className="text-xs text-gray-500 mb-3 uppercase tracking-wide">Categorias</p>
            <div className="flex flex-wrap gap-3">
              <span className="px-3 py-1 bg-gray-900 text-white text-sm font-medium rounded-full">
                Curso
              </span>
              <span className="px-3 py-1 bg-gray-700 text-white text-sm font-medium rounded-full">
                Modulo
              </span>
              <span className="px-3 py-1 bg-gray-500 text-white text-sm font-medium rounded-full">
                Leccion
              </span>
              <span className="px-3 py-1 bg-[#fbbf24] text-[#0a0a0a] text-sm font-medium rounded-full">
                Tarea
              </span>
              <span className="px-3 py-1 bg-[#fcd34d] text-[#0a0a0a] text-sm font-medium rounded-full">
                Quiz
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Section 8: Progress Indicators */}
      <section>
        <SectionTitle>8. Indicadores de Progreso</SectionTitle>

        <div className="bg-white rounded-xl p-8 shadow-sm">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Linear progress */}
            <div>
              <p className="text-sm text-gray-600 mb-4">Barras de progreso</p>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-[#0a0a0a]">Progreso del curso</span>
                    <span className="text-[#6b7280]">75%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-[#fbbf24] h-2 rounded-full" style={{ width: '75%' }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-[#0a0a0a]">Completado</span>
                    <span className="text-[#6b7280]">100%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-[#0a0a0a] h-2 rounded-full" style={{ width: '100%' }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-[#0a0a0a]">Sin iniciar</span>
                    <span className="text-[#6b7280]">0%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-[#fbbf24] h-2 rounded-full" style={{ width: '0%' }}></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Circular progress */}
            <div>
              <p className="text-sm text-gray-600 mb-4">Indicadores circulares</p>
              <div className="flex items-center gap-6">
                {/* 75% */}
                <div className="relative w-20 h-20">
                  <svg className="w-20 h-20 transform -rotate-90">
                    <circle cx="40" cy="40" r="36" stroke="#e5e7eb" strokeWidth="8" fill="none" />
                    <circle cx="40" cy="40" r="36" stroke="#fbbf24" strokeWidth="8" fill="none" strokeDasharray="226" strokeDashoffset="56" strokeLinecap="round" />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-[#0a0a0a]">75%</span>
                </div>
                {/* 100% */}
                <div className="relative w-20 h-20">
                  <svg className="w-20 h-20 transform -rotate-90">
                    <circle cx="40" cy="40" r="36" stroke="#e5e7eb" strokeWidth="8" fill="none" />
                    <circle cx="40" cy="40" r="36" stroke="#0a0a0a" strokeWidth="8" fill="none" strokeDasharray="226" strokeDashoffset="0" strokeLinecap="round" />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-6 h-6 text-[#0a0a0a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                </div>
                {/* 0% */}
                <div className="relative w-20 h-20">
                  <svg className="w-20 h-20 transform -rotate-90">
                    <circle cx="40" cy="40" r="36" stroke="#e5e7eb" strokeWidth="8" fill="none" />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-[#6b7280]">0%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 9: Footer */}
      <section>
        <SectionTitle>9. Footer (Componente Real)</SectionTitle>

        <div className="rounded-xl overflow-hidden shadow-lg">
          <Footer />
        </div>
      </section>
    </div>
  );
}

// ============================================
// BRAND COMPARISON
// ============================================

function BrandComparison() {
  return (
    <div className="space-y-8">
      <div className="bg-white rounded-xl p-8 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Comparacion de Colores</h2>

        <div className="grid md:grid-cols-2 gap-8">
          {/* FNE Current */}
          <div>
            <h3 className="text-lg font-semibold text-gray-700 mb-4">Genera (Actual)</h3>
            <div className="space-y-3">
              <ColorSwatch name="Primary (Navy)" hex="#0a0a0a" className="bg-[#0a0a0a]" textLight />
              <ColorSwatch name="Accent (Gold)" hex="#fbbf24" className="bg-[#fbbf24]" />
              <ColorSwatch name="Background (Beige)" hex="#e8e5e2" className="bg-[#e8e5e2]" />
            </div>

            <div className="mt-6 p-4 bg-[#e8e5e2] rounded-lg">
              <button className="px-4 py-2 bg-[#0a0a0a] text-white rounded-lg mr-2">Primary</button>
              <button className="px-4 py-2 bg-[#fbbf24] text-[#0a0a0a] rounded-lg">Accent</button>
            </div>
          </div>

          {/* Genera New */}
          <div>
            <h3 className="text-lg font-semibold text-gray-700 mb-4">Genera (Nuevo)</h3>
            <div className="space-y-3">
              <ColorSwatch name="Primary (Black)" hex="#0a0a0a" className="bg-[#0a0a0a]" textLight />
              <ColorSwatch name="Accent (Yellow)" hex="#fbbf24" className="bg-[#fbbf24]" />
              <ColorSwatch name="Background (White)" hex="#ffffff" className="bg-white border border-gray-200" />
            </div>

            <div className="mt-6 p-4 bg-white border border-gray-200 rounded-lg">
              <button className="px-4 py-2 bg-[#0a0a0a] text-white rounded-lg mr-2">Primary</button>
              <button className="px-4 py-2 bg-[#fbbf24] text-[#0a0a0a] rounded-lg">Accent</button>
            </div>
          </div>
        </div>
      </div>

      {/* Side by Side Headers */}
      <div className="grid md:grid-cols-2 gap-8">
        <div>
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Header FNE (Actual)</h3>
          <div className="rounded-xl overflow-hidden shadow-lg">
            <div className="bg-gradient-to-r from-[#0a0a0a] via-[#004080] to-[#0a0a0a] p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-lg"></div>
                  <span className="text-white font-semibold">Genera</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 bg-[#fbbf24] rounded-full"></div>
                  <div className="w-8 h-8 bg-white/20 rounded-full"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Header Genera (Nuevo)</h3>
          <div className="rounded-xl overflow-hidden shadow-lg">
            <MockHeader />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// COMPONENT HELPERS
// ============================================

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xl font-bold text-gray-900 mb-6 pb-2 border-b border-gray-200">
      {children}
    </h2>
  );
}

function ColorSwatch({
  name,
  hex,
  className,
  textLight = false
}: {
  name: string;
  hex: string;
  className: string;
  textLight?: boolean;
}) {
  return (
    <div className={`flex items-center gap-4 p-3 rounded-lg ${className}`}>
      <div className="flex-1">
        <p className={`font-medium ${textLight ? 'text-white' : 'text-gray-900'}`}>{name}</p>
        <p className={`text-sm font-mono ${textLight ? 'text-white/70' : 'text-gray-600'}`}>{hex}</p>
      </div>
      <button
        onClick={() => navigator.clipboard.writeText(hex)}
        className={`text-xs px-2 py-1 rounded ${textLight ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-black/10 text-gray-700 hover:bg-black/20'}`}
      >
        Copiar
      </button>
    </div>
  );
}

function GeneraLogo({ variant, size }: { variant: 'dark' | 'light'; size: 'small' | 'large' }) {
  // Use real logos from /genera/ folder
  const logoSrc = variant === 'dark'
    ? '/genera/logo-full-on-light.svg'
    : '/genera/logo-full-on-dark.svg';

  const dimensions = size === 'large'
    ? { width: 200, height: 160 }
    : { width: 140, height: 110 };

  return (
    <div className="flex flex-col items-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoSrc}
        alt="Genera - Hub de Transformación"
        width={dimensions.width}
        height={dimensions.height}
        className="object-contain"
      />
    </div>
  );
}

function MockSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  // Professional SVG icons instead of emojis
  const menuItems = [
    {
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
      label: 'Mi Panel',
      active: true
    },
    {
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
      label: 'Mi Perfil',
      active: false
    },
    {
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
      label: 'Mi Aprendizaje',
      active: false
    },
    {
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      label: 'Comunidad',
      active: false
    },
    {
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      label: 'Reportes',
      active: false
    },
    {
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      label: 'Configuracion',
      active: false
    },
  ];

  return (
    <div className={`bg-[#0a0a0a] text-white ${collapsed ? 'w-16' : 'w-64'} transition-all duration-300`}>
      {/* Logo */}
      <div className="p-4 border-b border-white/10">
        {collapsed ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src="/genera/icon-on-dark.svg"
            alt="Genera"
            className="w-8 h-8 mx-auto"
          />
        ) : (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/genera/icon-on-dark.svg"
              alt="Genera"
              className="w-10 h-10"
            />
            <div>
              <p className="font-light tracking-[0.1em] text-sm text-white">GENERA</p>
              <p className="text-xs text-white/50">Fundación Nueva Educación</p>
            </div>
          </div>
        )}
      </div>

      {/* Menu Items */}
      <nav className="p-2">
        {menuItems.map((item, idx) => (
          <div
            key={idx}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 cursor-pointer transition-colors ${
              item.active
                ? 'bg-[#fbbf24] text-[#0a0a0a]'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10">
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
          <div className="w-8 h-8 bg-[#fbbf24] rounded-full flex items-center justify-center">
            <span className="text-[#0a0a0a] text-sm font-bold">BC</span>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">Brent Curtis</p>
              <p className="text-xs text-white/50">Administrador</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MockHeader() {
  return (
    <div className="bg-[#0a0a0a] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Hub de Transformación text */}
          <span className="text-white font-light tracking-wide text-sm">Hub de Transformación</span>

          {/* School Badge */}
          <div className="px-3 py-1.5 bg-white/10 rounded-lg border border-white/20">
            <span className="text-white/90 text-sm">Colegio Demo</span>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Notification */}
          <button className="relative p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span className="absolute top-1 right-1 w-2 h-2 bg-[#fbbf24] rounded-full"></span>
          </button>

          {/* Avatar */}
          <div className="w-8 h-8 bg-[#fbbf24] rounded-full flex items-center justify-center">
            <span className="text-[#0a0a0a] text-sm font-bold">BC</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MockToggle({ defaultChecked = false, label }: { defaultChecked?: boolean; label: string }) {
  const [checked, setChecked] = useState(defaultChecked);

  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <button
        type="button"
        onClick={() => setChecked(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          checked ? 'bg-[#fbbf24]' : 'bg-gray-300'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
      <span className="text-[#1f1f1f]">{label}</span>
    </label>
  );
}

// ============================================
// VISUAL STYLE AUDIT
// ============================================

function VisualStyleAudit() {
  return (
    <div className="space-y-8">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Off-Brand Colors" value="54" subtitle="archivos afectados" color="red" />
        <StatCard title="Inline SVGs" value="68" subtitle="archivos con SVG" color="yellow" />
        <StatCard title="Gradientes" value="45+" subtitle="a actualizar" color="blue" />
        <StatCard title="Emojis" value="32" subtitle="archivos" color="gray" />
      </div>

      {/* Section 1: Off-Brand Colors */}
      <section className="bg-white rounded-xl p-8 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900 mb-2">1. Colores Fuera de Marca</h2>
        <p className="text-gray-600 mb-6">Estos colores no encajan con la paleta Genera (negro/amarillo/blanco) y deben reemplazarse.</p>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Current Off-Brand */}
          <div>
            <h3 className="text-lg font-semibold text-red-600 mb-4 flex items-center gap-2">
              <span className="w-3 h-3 bg-red-500 rounded-full"></span>
              Colores a Eliminar
            </h3>
            <div className="space-y-3">
              <OffBrandColorRow
                name="Purple"
                tailwind="purple-*"
                hex="#8b5cf6"
                files={35}
                bgClass="bg-purple-500"
              />
              <OffBrandColorRow
                name="Violet"
                tailwind="violet-*"
                hex="#7c3aed"
                files={8}
                bgClass="bg-violet-500"
              />
              <OffBrandColorRow
                name="Indigo"
                tailwind="indigo-*"
                hex="#6366f1"
                files={15}
                bgClass="bg-indigo-500"
              />
              <OffBrandColorRow
                name="Pink"
                tailwind="#ec4899"
                hex="#ec4899"
                files={2}
                bgClass="bg-pink-500"
              />
              <OffBrandColorRow
                name="Fuchsia"
                tailwind="fuchsia-*"
                hex="#c026d3"
                files={1}
                bgClass="bg-fuchsia-500"
              />
            </div>
          </div>

          {/* Replacements */}
          <div>
            <h3 className="text-lg font-semibold text-green-600 mb-4 flex items-center gap-2">
              <span className="w-3 h-3 bg-green-500 rounded-full"></span>
              Reemplazos Recomendados
            </h3>
            <div className="space-y-3">
              <ReplacementRow
                from="purple-*"
                to="gray-*"
                fromBg="bg-purple-500"
                toBg="bg-gray-500"
                reason="Neutral"
              />
              <ReplacementRow
                from="violet-*"
                to="gray-*"
                fromBg="bg-violet-500"
                toBg="bg-gray-500"
                reason="Neutral"
              />
              <ReplacementRow
                from="indigo-*"
                to="brand_primary"
                fromBg="bg-indigo-500"
                toBg="bg-[#0a0a0a]"
                reason="Usar negro"
              />
              <ReplacementRow
                from="#ec4899"
                to="#fbbf24"
                fromBg="bg-pink-500"
                toBg="bg-[#fbbf24]"
                reason="Usar amarillo"
              />
              <ReplacementRow
                from="#8b5cf6"
                to="#6b7280"
                fromBg="bg-purple-500"
                toBg="bg-[#6b7280]"
                reason="Gris medio"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Badge Examples */}
      <section className="bg-white rounded-xl p-8 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900 mb-2">2. Badges - Antes vs Despues</h2>
        <p className="text-gray-600 mb-6">Comparacion visual de badges con colores actuales vs reemplazos Genera.</p>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Before */}
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-4">ACTUAL (Off-Brand)</h3>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 bg-purple-100 text-purple-800 text-sm rounded-full">Ensayo</span>
              <span className="px-3 py-1 bg-indigo-100 text-indigo-800 text-sm rounded-full">Ruta</span>
              <span className="px-3 py-1 bg-violet-100 text-violet-800 text-sm rounded-full">Preguntas</span>
              <span className="px-3 py-1 bg-pink-100 text-pink-800 text-sm rounded-full">Familias</span>
              <span className="px-3 py-1 bg-fuchsia-100 text-fuchsia-800 text-sm rounded-full">Proposito</span>
            </div>
          </div>

          {/* After */}
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-4">GENERA (On-Brand)</h3>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 bg-gray-100 text-gray-800 text-sm rounded-full">Ensayo</span>
              <span className="px-3 py-1 bg-[#0a0a0a] text-white text-sm rounded-full">Ruta</span>
              <span className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded-full">Preguntas</span>
              <span className="px-3 py-1 bg-[#fbbf24]/20 text-[#0a0a0a] text-sm rounded-full">Familias</span>
              <span className="px-3 py-1 bg-[#fbbf24] text-[#0a0a0a] text-sm rounded-full">Proposito</span>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Gradients */}
      <section className="bg-white rounded-xl p-8 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900 mb-2">3. Gradientes</h2>
        <p className="text-gray-600 mb-6">Gradientes actuales vs versiones Genera.</p>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Before */}
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-4">ACTUAL</h3>
            <div className="space-y-3">
              <div className="h-16 rounded-lg bg-gradient-to-r from-[#0a0a0a] via-[#004080] to-[#0a0a0a] flex items-center justify-center text-white text-sm">
                Header Gradient (Navy)
              </div>
              <div className="h-16 rounded-lg bg-gradient-to-br from-[#0a0a0a] to-[#fbbf24] flex items-center justify-center text-white text-sm">
                Progress Gradient
              </div>
              <div className="h-16 rounded-lg bg-gradient-to-r from-blue-500 via-purple-500 to-orange-500 flex items-center justify-center text-white text-sm">
                Rainbow (Programas)
              </div>
              <div className="h-16 rounded-lg bg-gradient-to-br from-purple-50 to-violet-50 flex items-center justify-center text-purple-800 text-sm">
                Purple Background
              </div>
            </div>
          </div>

          {/* After */}
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-4">GENERA</h3>
            <div className="space-y-3">
              <div className="h-16 rounded-lg bg-[#0a0a0a] flex items-center justify-center text-white text-sm">
                Header (Solid Black)
              </div>
              <div className="h-16 rounded-lg bg-gradient-to-br from-[#0a0a0a] to-[#fbbf24] flex items-center justify-center text-white text-sm">
                Progress Gradient
              </div>
              <div className="h-16 rounded-lg bg-gradient-to-r from-[#0a0a0a] via-[#1f1f1f] to-[#fbbf24] flex items-center justify-center text-white text-sm">
                Black to Yellow
              </div>
              <div className="h-16 rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center text-gray-800 text-sm">
                Neutral Background
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: Transformation Area Colors */}
      <section className="bg-white rounded-xl p-8 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900 mb-2">4. Colores de Areas de Transformacion</h2>
        <p className="text-gray-600 mb-6">Las 7 areas de transformacion necesitan colores distintivos. Opciones:</p>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Option A: Grayscale */}
          <div className="border rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 mb-3">Opcion A: Escala de Grises</h4>
            <div className="space-y-2">
              {['Proposito', 'Personalizacion', 'Aprendizaje', 'Evaluacion', 'Liderazgo', 'Familias', 'Trabajo Docente'].map((area, i) => (
                <div key={area} className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded bg-gray-${(i + 3) * 100}`} style={{ backgroundColor: `rgb(${200 - i * 25}, ${200 - i * 25}, ${200 - i * 25})` }}></div>
                  <span className="text-sm text-gray-700">{area}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Option B: Yellow Variations */}
          <div className="border rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 mb-3">Opcion B: Variaciones Amarillo</h4>
            <div className="space-y-2">
              {[
                { name: 'Proposito', bg: '#fbbf24' },
                { name: 'Personalizacion', bg: '#f59e0b' },
                { name: 'Aprendizaje', bg: '#fcd34d' },
                { name: 'Evaluacion', bg: '#fde68a' },
                { name: 'Liderazgo', bg: '#0a0a0a' },
                { name: 'Familias', bg: '#1f1f1f' },
                { name: 'Trabajo Docente', bg: '#374151' },
              ].map((area) => (
                <div key={area.name} className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: area.bg }}></div>
                  <span className="text-sm text-gray-700">{area.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Option C: Professional Multi-color */}
          <div className="border rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 mb-3">Opcion C: Multi-color Profesional</h4>
            <div className="space-y-2">
              {[
                { name: 'Proposito', bg: '#0a0a0a' },
                { name: 'Personalizacion', bg: '#374151' },
                { name: 'Aprendizaje', bg: '#1d4ed8' },
                { name: 'Evaluacion', bg: '#059669' },
                { name: 'Liderazgo', bg: '#fbbf24' },
                { name: 'Familias', bg: '#dc2626' },
                { name: 'Trabajo Docente', bg: '#7c3aed' },
              ].map((area) => (
                <div key={area.name} className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: area.bg }}></div>
                  <span className="text-sm text-gray-700">{area.name}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">Nota: Violeta aun presente</p>
          </div>
        </div>
      </section>

      {/* Section 5: Files Summary */}
      <section className="bg-white rounded-xl p-8 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900 mb-2">5. Archivos Prioritarios</h2>
        <p className="text-gray-600 mb-6">Archivos con mayor cantidad de colores off-brand.</p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 font-medium text-gray-700">Archivo</th>
                <th className="text-center py-2 px-4 font-medium text-gray-700">Purple</th>
                <th className="text-center py-2 px-4 font-medium text-gray-700">Indigo</th>
                <th className="text-center py-2 px-4 font-medium text-gray-700">Pink</th>
                <th className="text-center py-2 pl-4 font-medium text-gray-700">Prioridad</th>
              </tr>
            </thead>
            <tbody>
              <FileRow file="components/learning-paths/EnhancedProgressIndicators.tsx" purple={5} indigo={4} pink={0} priority="Alta" />
              <FileRow file="pages/community/workspace.tsx" purple={2} indigo={3} pink={0} priority="Alta" />
              <FileRow file="components/assignments/AssignmentCard.tsx" purple={3} indigo={0} pink={0} priority="Media" />
              <FileRow file="components/admin/assignment-matrix/SourceBadge.tsx" purple={2} indigo={1} pink={0} priority="Media" />
              <FileRow file="pages/directivo/assessments/dashboard.tsx" purple={1} indigo={0} pink={1} priority="Alta" />
              <FileRow file="components/reports/LearningPathAnalytics.tsx" purple={1} indigo={0} pink={0} priority="Baja" />
              <FileRow file="types/messaging.ts" purple={1} indigo={1} pink={0} priority="Baja" />
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 6: Emoji Usage */}
      <section className="bg-white rounded-xl p-8 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900 mb-2">6. Uso de Emojis</h2>
        <p className="text-gray-600 mb-6">32 archivos usan emojis. Revisar si son apropiados para una imagen profesional.</p>

        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <h3 className="text-sm font-medium text-green-600 mb-3">OK - Momentos Celebratorios</h3>
            <div className="flex flex-wrap gap-4 text-2xl">
              <span title="Quiz completado">🎉</span>
              <span title="Logro">🏆</span>
              <span title="Exito">✨</span>
              <span title="Completado">🌟</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">Usar en: resultados de quiz, logros, felicitaciones</p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-red-600 mb-3">Revisar - Interfaces Profesionales</h3>
            <div className="flex flex-wrap gap-4 text-2xl">
              <span title="Navegacion">📚</span>
              <span title="Acciones">🚀</span>
              <span title="Ideas">💡</span>
              <span title="Objetivos">🎯</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">Considerar reemplazar con iconos SVG en: menus, botones, headers</p>
          </div>
        </div>
      </section>
    </div>
  );
}

// Helper components for Visual Audit
function StatCard({ title, value, subtitle, color }: { title: string; value: string; subtitle: string; color: string }) {
  const colorClasses = {
    red: 'bg-red-50 border-red-200 text-red-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    gray: 'bg-gray-50 border-gray-200 text-gray-700',
  };

  return (
    <div className={`rounded-lg border p-4 ${colorClasses[color as keyof typeof colorClasses]}`}>
      <p className="text-sm font-medium opacity-80">{title}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
      <p className="text-xs opacity-60 mt-1">{subtitle}</p>
    </div>
  );
}

function OffBrandColorRow({ name, tailwind, hex, files, bgClass }: { name: string; tailwind: string; hex: string; files: number; bgClass: string }) {
  return (
    <div className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
      <div className={`w-8 h-8 rounded ${bgClass}`}></div>
      <div className="flex-1">
        <p className="font-medium text-gray-900">{name}</p>
        <p className="text-xs text-gray-500">{tailwind} / {hex}</p>
      </div>
      <span className="text-sm text-red-600 font-medium">{files} archivos</span>
    </div>
  );
}

function ReplacementRow({ from, to, fromBg, toBg, reason }: { from: string; to: string; fromBg: string; toBg: string; reason: string }) {
  return (
    <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
      <div className={`w-6 h-6 rounded ${fromBg}`}></div>
      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
      </svg>
      <div className={`w-6 h-6 rounded ${toBg}`}></div>
      <div className="flex-1">
        <p className="text-sm text-gray-700">{from} → {to}</p>
      </div>
      <span className="text-xs text-gray-500">{reason}</span>
    </div>
  );
}

function FileRow({ file, purple, indigo, pink, priority }: { file: string; purple: number; indigo: number; pink: number; priority: string }) {
  const priorityColors = {
    Alta: 'bg-red-100 text-red-800',
    Media: 'bg-yellow-100 text-yellow-800',
    Baja: 'bg-gray-100 text-gray-800',
  };

  return (
    <tr className="border-b border-gray-100">
      <td className="py-2 pr-4 font-mono text-xs text-gray-600">{file}</td>
      <td className="py-2 px-4 text-center">{purple > 0 ? <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-xs">{purple}</span> : '-'}</td>
      <td className="py-2 px-4 text-center">{indigo > 0 ? <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded text-xs">{indigo}</span> : '-'}</td>
      <td className="py-2 px-4 text-center">{pink > 0 ? <span className="px-2 py-0.5 bg-pink-100 text-pink-800 rounded text-xs">{pink}</span> : '-'}</td>
      <td className="py-2 pl-4 text-center">
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${priorityColors[priority as keyof typeof priorityColors]}`}>{priority}</span>
      </td>
    </tr>
  );
}

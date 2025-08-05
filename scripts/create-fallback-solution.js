#!/usr/bin/env node

/**
 * Team Images Fallback Solution Generator
 * 
 * This script creates an improved version of the equipo.tsx page with:
 * 1. Fallback placeholder images for missing photos
 * 2. Better error handling for broken image links
 * 3. Loading states and progressive image loading
 */

const fs = require('fs');
const path = require('path');

// Missing images list (from our check)
const missingImages = [
  'Gabriela Naranjo',
  'Brent Curtis', 
  'Sandra Entrena',
  'Boris Mir',
  'Pepe Menéndez',
  'Sergi Del Moral',
  'Betlem Cuesta',
  'Carlo de Britos',
  'Marta Cárdenas', // Note: filename is actually "Marta Cardenas" in URL
  'Maite Pino',
  'Claudia López de Lamadrid', // Note: filename is actually "Claudia Lopez" in URL  
  'Enrique Vergara',
  'Marta Segura',
  'Laia Garcés', // Note: filename is actually "Laia Garces" in URL
  'Marta Ortega',
  'Estefanía del Ramón' // Note: filename is actually "Estefania del Ramon" in URL
];

/**
 * Generate a color-based avatar for team members without photos
 * @param {string} name - Team member name
 * @returns {string} - SVG data URL for placeholder avatar
 */
function generatePlaceholderAvatar(name) {
  // Create initials from name
  const initials = name
    .split(' ')
    .map(word => word.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
  
  // Generate a consistent color based on name hash
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Convert hash to RGB color (avoiding too dark or too light colors)
  const hue = Math.abs(hash) % 360;
  const saturation = 60 + (Math.abs(hash) % 40); // 60-100%
  const lightness = 50 + (Math.abs(hash) % 20);  // 50-70%
  
  const svgAvatar = `
    <svg width="192" height="192" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="gradient-${hash}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:hsl(${hue}, ${saturation}%, ${lightness}%)" />
          <stop offset="100%" style="stop-color:hsl(${hue + 20}, ${saturation}%, ${lightness - 10}%)" />
        </linearGradient>
      </defs>
      <circle cx="96" cy="96" r="96" fill="url(#gradient-${hash})" />
      <text x="96" y="106" font-family="system-ui, -apple-system, sans-serif" 
            font-size="48" font-weight="600" text-anchor="middle" 
            fill="white" opacity="0.9">${initials}</text>
    </svg>`.replace(/\s+/g, ' ').trim();
  
  return `data:image/svg+xml;base64,${Buffer.from(svgAvatar).toString('base64')}`;
}

/**
 * Create React component for team member image with fallback
 */
function createTeamMemberImageComponent() {
  return `
import React, { useState, useCallback } from 'react';

interface TeamMemberImageProps {
  src: string;
  alt: string;
  name: string;
  className?: string;
}

const TeamMemberImage: React.FC<TeamMemberImageProps> = ({ src, alt, name, className = '' }) => {
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Generate placeholder avatar
  const generatePlaceholderAvatar = useCallback((memberName: string) => {
    const initials = memberName
      .split(' ')
      .map(word => word.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
    
    let hash = 0;
    for (let i = 0; i < memberName.length; i++) {
      hash = memberName.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const hue = Math.abs(hash) % 360;
    const saturation = 60 + (Math.abs(hash) % 40);
    const lightness = 50 + (Math.abs(hash) % 20);
    
    const svgAvatar = \`
      <svg width="192" height="192" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="gradient-\${hash}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:hsl(\${hue}, \${saturation}%, \${lightness}%)" />
            <stop offset="100%" style="stop-color:hsl(\${hue + 20}, \${saturation}%, \${lightness - 10}%)" />
          </linearGradient>
        </defs>
        <circle cx="96" cy="96" r="96" fill="url(#gradient-\${hash})" />
        <text x="96" y="106" font-family="system-ui, -apple-system, sans-serif" 
              font-size="48" font-weight="600" text-anchor="middle" 
              fill="white" opacity="0.9">\${initials}</text>
      </svg>\`.replace(/\\s+/g, ' ').trim();
    
    return \`data:image/svg+xml;base64,\${btoa(svgAvatar)}\`;
  }, []);

  const handleImageLoad = () => {
    setIsLoading(false);
  };

  const handleImageError = () => {
    setImageError(true);
    setIsLoading(false);
  };

  if (imageError) {
    return (
      <div className={\`relative \${className}\`}>
        <img
          src={generatePlaceholderAvatar(name)}
          alt={alt}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/10 rounded-full flex items-end justify-center pb-2">
          <span className="text-xs text-white/70 font-medium bg-black/20 px-2 py-1 rounded-full">
            Sin foto
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={\`relative \${className}\`}>
      {isLoading && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle>
            <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={\`w-full h-full object-cover transition-opacity duration-300 \${isLoading ? 'opacity-0' : 'opacity-100'}\`}
        onLoad={handleImageLoad}
        onError={handleImageError}
      />
    </div>
  );
};

export default TeamMemberImage;`;
}

/**
 * Generate upload checklist for missing images
 */
function generateUploadChecklist() {
  console.log('📋 TEAM IMAGES UPLOAD CHECKLIST');
  console.log('=' .repeat(60));
  console.log('');
  console.log('🎯 Upload Location: Supabase Storage');
  console.log('📂 Bucket: resources');
  console.log('📁 Folder: Equipo/');
  console.log('📐 Format: PNG files');
  console.log('📏 Recommended Size: 400x400px or larger (square aspect ratio)');
  console.log('');
  
  console.log('❌ MISSING IMAGES TO UPLOAD:');
  console.log('-' .repeat(40));
  
  // Group by team for easier organization
  const equipoFNE = ['Gabriela Naranjo', 'Brent Curtis'];
  const equipoInternacional = ['Sandra Entrena', 'Boris Mir', 'Pepe Menéndez', 'Sergi Del Moral', 'Betlem Cuesta'];
  const asesoresTecnicos = ['Carlo de Britos', 'Marta Cárdenas', 'Maite Pino', 'Claudia López de Lamadrid', 'Enrique Vergara', 'Marta Segura', 'Laia Garcés', 'Marta Ortega', 'Estefanía del Ramón'];
  
  console.log('\n🏢 EQUIPO FNE (2 missing):');
  equipoFNE.forEach((name, index) => {
    console.log(`  ${index + 1}. ${name}.png`);
  });
  
  console.log('\n🌍 EQUIPO INTERNACIONAL (5 missing):');
  equipoInternacional.forEach((name, index) => {
    console.log(`  ${index + 1}. ${name}.png`);
  });
  
  console.log('\n👨‍🏫 ASESORES TÉCNICOS (9 missing):');
  asesoresTecnicos.forEach((name, index) => {
    console.log(`  ${index + 1}. ${name}.png`);
  });
  
  console.log('');
  console.log('⚠️  SPECIAL CHARACTER NOTES:');
  console.log('- Marta Cárdenas → Upload as "Marta Cardenas.png"');
  console.log('- Claudia López de Lamadrid → Upload as "Claudia Lopez.png"');
  console.log('- Laia Garcés → Upload as "Laia Garces.png"');
  console.log('- Estefanía del Ramón → Upload as "Estefania del Ramon.png"');
  console.log('');
  
  console.log('🔗 SUPABASE STORAGE ACCESS:');
  console.log('1. Go to: https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj');
  console.log('2. Navigate to: Storage → resources → Equipo');
  console.log('3. Upload PNG files with exact names listed above');
  console.log('4. Test the equipo page after upload');
  console.log('');
  
  console.log('✨ QUALITY GUIDELINES:');
  console.log('- Use professional headshot photos');
  console.log('- Square aspect ratio (1:1) preferred');
  console.log('- Minimum 400x400px resolution');
  console.log('- Good lighting and clear facial visibility');
  console.log('- Consistent style across team photos if possible');
}

/**
 * Main function to create fallback solution
 */
function createFallbackSolution() {
  console.log('🔧 Creating Team Images Fallback Solution...');
  console.log('=' .repeat(60));
  
  // Create the TeamMemberImage component
  const componentCode = createTeamMemberImageComponent();
  const componentPath = path.join(__dirname, '..', 'components', 'TeamMemberImage.tsx');
  
  try {
    // Ensure components directory exists
    const componentsDir = path.dirname(componentPath);
    if (!fs.existsSync(componentsDir)) {
      fs.mkdirSync(componentsDir, { recursive: true });
    }
    
    fs.writeFileSync(componentPath, componentCode);
    console.log(`✅ Created: ${componentPath}`);
  } catch (error) {
    console.error(`❌ Error creating component: ${error.message}`);
  }
  
  console.log('');
  console.log('📝 IMPLEMENTATION STEPS:');
  console.log('-' .repeat(30));
  console.log('1. ✅ TeamMemberImage component created');
  console.log('2. 🔄 Update equipo.tsx to use the new component');
  console.log('3. 📤 Upload missing team member photos');
  console.log('4. 🧪 Test the improved user experience');
  console.log('');
  
  console.log('🎨 COMPONENT FEATURES:');
  console.log('- ✅ Automatic fallback to generated avatars');
  console.log('- ✅ Loading states with smooth transitions');
  console.log('- ✅ Color-coded avatars based on names');
  console.log('- ✅ Professional "Sin foto" indicators');
  console.log('- ✅ Graceful error handling');
  console.log('');
  
  // Generate upload checklist
  generateUploadChecklist();
  
  console.log('');
  console.log('🚀 NEXT STEPS:');
  console.log('1. Review the generated TeamMemberImage.tsx component');
  console.log('2. Update equipo.tsx to import and use <TeamMemberImage />');
  console.log('3. Upload the 16 missing team member photos to Supabase');
  console.log('4. Test the page to ensure fallbacks work correctly');
  console.log('5. Gradually replace placeholder avatars as photos are uploaded');
}

// Run the solution creator
if (require.main === module) {
  createFallbackSolution();
}

module.exports = { 
  createFallbackSolution, 
  generatePlaceholderAvatar,
  missingImages 
};
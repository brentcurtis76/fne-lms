const fs = require('fs');
const path = require('path');
const glob = require('glob');

const projectRoot = path.resolve(__dirname, '..');
const files = glob.sync('**/*.{ts,tsx,js,jsx}', {
  cwd: projectRoot,
  ignore: ['node_modules/**', 'dist/**', '.next/**', 'scripts/**'],
});

let filesChanged = 0;

function ensureReactImport(content) {
    const importToAdd = "import { useSupabaseClient } from '@supabase/auth-helpers-react';";
    const authImportRegex = /import\s+{[^}]*}\s+from\s+['"]@supabase\/auth-helpers-react['"];?/;
    if (content.includes('useSupabaseClient')) return content;
    if (authImportRegex.test(content)) {
        return content.replace(authImportRegex, (match) => match.replace('}', ', useSupabaseClient }'));
    } else {
        return `${importToAdd}\n${content}`;
    }
}

function ensureReactHook(content) {
    const hookToAdd = 'const supabase = useSupabaseClient();';
    if (content.includes(hookToAdd)) return content;
    const componentRegex = /((\bconst|\bfunction)\s+[A-Z][^=]*=>\s*{|function\s+[A-Z][^\(]*\([^\)]*\)\s*{)/;
    const match = content.match(componentRegex);
    if (match) {
        const insertionPoint = match.index + match[0].length;
        return `${content.slice(0, insertionPoint)}\n  ${hookToAdd}${content.slice(insertionPoint)}`;
    }
    return content;
}

files.forEach(file => {
    const filePath = path.join(projectRoot, file);
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;

    const oldImportRegex = /(['"])(..\/)*lib\/supabase(['"])/g;

    if (oldImportRegex.test(content)) {
        if (file.endsWith('.tsx') || file.endsWith('.jsx')) {
            // For React components, switch to the hook
            content = content.replace(/import\s+{[^}]*supabase[^}]*}\s+from\s+['"](..\/)*lib\/supabase['"];?/g, '');
            content = content.replace(/const\s*{\s*supabase\s*}\s*=\s*await\s*import\(['"](..\/)*lib\/supabase['"]\);?/g, '');
            content = ensureReactImport(content);
            content = ensureReactHook(content);
        } else {
            // For non-React files, correct the path
            const relativePath = path.relative(path.dirname(filePath), path.join(projectRoot, 'lib', 'supabase-wrapper'));
            const correctedPath = (relativePath.startsWith('.') ? relativePath : `./${relativePath}`).replace(/\\/g, '/');
            content = content.replace(oldImportRegex, `$1${correctedPath}$3`);
        }

        content = content.replace(/(\r\n|\n){3,}/g, '\n\n');

        if (content !== originalContent) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Refactored: ${file}`);
            filesChanged++;
        }
    }
});

console.log(`\nRefactoring complete. ${filesChanged} files were updated.`);

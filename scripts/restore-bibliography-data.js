import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function restoreBibliographyData() {
  const blockId = '6e4962ec-2145-4492-be3f-4cceafc1b470';
  
  // Restore original payload
  const originalPayload = {
    "items": [
      {
        "id": "mg8ue0ucv",
        "url": "https://drive.google.com/file/d/1LFDdT3JkU5teJpzjbI06qhRpmj4VPNi1/view?usp=sharing",
        "type": "link",
        "year": "2025",
        "title": "Qué son los objetivos SMART",
        "author": "",
        "category": "",
        "description": ""
      },
      {
        "id": "jofbg0373",
        "url": "",
        "type": "pdf",
        "year": "2025",
        "title": "prueba pdf",
        "author": "",
        "category": "",
        "description": ""
      }
    ],
    "title": "Apunte sobre los objetivos SMART",
    "sortBy": "manual",
    "description": "Dejamos un apunte sobre los objetivos SMART y una lista de cotejo para poder evaluar los objetivos. ",
    "showCategories": false
  };
  
  const { error } = await supabase
    .from('blocks')
    .update({ payload: originalPayload })
    .eq('id', blockId);
    
  if (error) {
    console.error('Error restoring data:', error);
  } else {
    console.log('✅ Data restored to original state');
  }
}

restoreBibliographyData();
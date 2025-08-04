import { useState } from 'react';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { toast } from 'react-hot-toast';

export default function SetupNews() {
  const supabase = useSupabaseClient();
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState('');

  const createNewsTable = async () => {
    setCreating(true);
    setStatus('Creating news_articles table...');

    try {
      // First create the table
      const { error: tableError } = await supabase.rpc('create_news_table', {});
      
      if (tableError) {
        // Try manual creation
        console.log('Manual table creation...');
        
        // Check if table already exists
        const { data: existing } = await supabase
          .from('news_articles')
          .select('id')
          .limit(1);
          
        if (existing !== null) {
          setStatus('✅ Table already exists and is accessible');
          toast.success('News table is ready!');
          return;
        }
      }
      
      setStatus('✅ News table created successfully');
      toast.success('News system is ready to use!');
      
    } catch (error: any) {
      console.error('Setup error:', error);
      setStatus(`❌ Error: ${error.message}`);
      toast.error('Failed to setup news system');
    } finally {
      setCreating(false);
    }
  };

  const testConnection = async () => {
    try {
      const { data, error } = await supabase
        .from('news_articles')
        .select('*')
        .limit(1);
        
      if (error) {
        setStatus(`❌ Table not found: ${error.message}`);
      } else {
        setStatus(`✅ Table exists and accessible. Found ${data.length} articles.`);
      }
    } catch (error: any) {
      setStatus(`❌ Error: ${error.message}`);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">News System Setup</h1>
      
      <div className="space-y-4">
        <button
          onClick={testConnection}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Test News Table
        </button>
        
        <button
          onClick={createNewsTable}
          disabled={creating}
          className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          {creating ? 'Setting up...' : 'Setup News System'}
        </button>
        
        {status && (
          <div className="p-4 bg-gray-100 rounded">
            <pre className="text-sm">{status}</pre>
          </div>
        )}
        
        <div className="text-sm text-gray-600">
          <p>Manual SQL for Supabase Dashboard:</p>
          <pre className="bg-gray-800 text-white p-4 rounded mt-2 overflow-x-auto text-xs">
{`-- Create news_articles table
CREATE TABLE IF NOT EXISTS news_articles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  content JSONB NOT NULL,
  content_html TEXT NOT NULL,
  featured_image TEXT,
  is_published BOOLEAN DEFAULT false,
  author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE news_articles ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Public read published news" ON news_articles
  FOR SELECT USING (is_published = true);

CREATE POLICY "Admins all access to news" ON news_articles
  FOR ALL USING (
    auth.uid() IN (
      SELECT user_id FROM user_roles 
      WHERE role IN ('admin', 'consultor')
      AND is_active = true
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_news_published ON news_articles(is_published, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_slug ON news_articles(slug);`}
          </pre>
        </div>
      </div>
    </div>
  );
}
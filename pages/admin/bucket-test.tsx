import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import Head from 'next/head';
import Link from 'next/link';
import Header from '../../components/layout/Header';

export default function BucketTest() {
  const supabase = createClientComponentClient();
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createBucketResult, setCreateBucketResult] = useState<any>(null);
  
  // List of buckets to test
  const bucketNames = ['resources', 'thumbnails', 'public', 'files', 'assets'];
  
  useEffect(() => {
    const testBuckets = async () => {
      try {
        setLoading(true);
        
        // Get environment variables
        const envInfo = {
          NEXT_PUBLIC_STORAGE_BUCKET: process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'Not set (will use fallback)',
          SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Set' : 'Not set',
          SUPABASE_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Set' : 'Not set'
        };
        
        // Test each bucket
        const bucketResults: Record<string, any> = {};
        
        for (const bucket of bucketNames) {
          try {
            console.log(`Testing bucket: ${bucket}`);
            const { data, error } = await supabase.storage.from(bucket).list();
            
            bucketResults[bucket] = {
              exists: !error,
              error: error ? error.message : null,
              files: data || [],
              fileCount: data ? data.length : 0
            };
          } catch (e: any) {
            bucketResults[bucket] = {
              exists: false,
              error: e.message,
              exception: true
            };
          }
        }
        
        setResults({
          environment: envInfo,
          buckets: bucketResults,
          timestamp: new Date().toISOString()
        });
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    
    testBuckets();
  }, []);
  
  const handleCreateBucket = async (bucketName: string) => {
    try {
      // This may not work with the client-side API, but we'll try
      const { data, error } = await supabase.rpc('create_storage_bucket', {
        name: bucketName,
        public: true
      });
      
      setCreateBucketResult({
        bucket: bucketName,
        success: !error,
        data,
        error: error ? error.message : null
      });
      
      // Refresh the bucket tests
      window.location.reload();
    } catch (e: any) {
      setCreateBucketResult({
        bucket: bucketName,
        success: false,
        error: e.message
      });
    }
  };
  
  return (
    <>
      <Head>
        <title>Supabase Bucket Test | LMS</title>
      </Head>
      
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">Supabase Storage Bucket Test</h1>
          
          <div className="mb-6">
            <Link href="/admin/course-builder">
              <button className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition">
                ← Volver al Administrador
              </button>
            </Link>
          </div>
          
          {loading ? (
            <div className="p-4 bg-gray-100 rounded-lg">
              <p className="text-gray-700">Probando buckets de almacenamiento...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-100 rounded-lg">
              <p className="text-red-700">Error: {error}</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="p-4 bg-blue-50 rounded-lg">
                <h2 className="text-lg font-semibold mb-2">Variables de Entorno</h2>
                <pre className="bg-gray-800 text-white p-3 rounded overflow-x-auto">
                  {JSON.stringify(results?.environment, null, 2)}
                </pre>
              </div>
              
              <div className="p-4 bg-gray-50 rounded-lg">
                <h2 className="text-lg font-semibold mb-2">Resultados de Buckets</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  {bucketNames.map(bucket => {
                    const bucketInfo = results?.buckets?.[bucket];
                    const exists = bucketInfo?.exists;
                    
                    return (
                      <div 
                        key={bucket}
                        className={`p-4 rounded-lg ${exists ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}
                      >
                        <h3 className="font-medium flex justify-between">
                          <span>Bucket: {bucket}</span>
                          <span className={exists ? 'text-green-600' : 'text-red-600'}>
                            {exists ? 'Accesible' : 'No Accesible'}
                          </span>
                        </h3>
                        
                        {exists ? (
                          <div className="mt-2">
                            <p className="text-sm text-gray-600">Archivos: {bucketInfo.fileCount}</p>
                          </div>
                        ) : (
                          <div className="mt-2">
                            <p className="text-sm text-red-600">{bucketInfo.error}</p>
                            
                            <button
                              onClick={() => handleCreateBucket(bucket)}
                              className="mt-2 px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
                            >
                              Intentar Crear Bucket
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                
                {createBucketResult && (
                  <div className={`p-4 rounded-lg mt-4 ${createBucketResult.success ? 'bg-green-100' : 'bg-red-100'}`}>
                    <h3 className="font-medium">Resultado de Crear Bucket: {createBucketResult.bucket}</h3>
                    <pre className="bg-gray-800 text-white p-2 rounded mt-2 text-sm overflow-x-auto">
                      {JSON.stringify(createBucketResult, null, 2)}
                    </pre>
                  </div>
                )}
                
                <div className="mt-4">
                  <p className="text-sm text-gray-600">
                    Nota: La creación de buckets podría requerir permisos de administrador en Supabase y es posible que no funcione desde el cliente.
                    Si los buckets no son accesibles, deberá crearlos desde el panel de control de Supabase.
                  </p>
                </div>
              </div>
              
              <div className="p-4 bg-yellow-50 rounded-lg">
                <h2 className="text-lg font-semibold mb-2">Solución Recomendada</h2>
                <ol className="list-decimal list-inside space-y-2">
                  <li>Verifique que el bucket <strong>resources</strong> existe en su proyecto de Supabase</li>
                  <li>Asegúrese de que el bucket tenga los permisos correctos (público para archivos públicos)</li>
                  <li>Cree un archivo <code className="bg-gray-200 px-1">.env.local</code> en la raíz del proyecto con:
                    <pre className="bg-gray-800 text-white p-2 rounded mt-1 text-sm">
                      NEXT_PUBLIC_STORAGE_BUCKET=resources
                    </pre>
                  </li>
                  <li>Reinicie el servidor de desarrollo</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

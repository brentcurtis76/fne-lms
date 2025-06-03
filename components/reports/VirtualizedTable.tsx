import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { FixedSizeList as List } from 'react-window';
import useDebounce from '../../hooks/useDebounce';
import LoadingSkeleton from '../common/LoadingSkeleton';

interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (value: any, row: any) => React.ReactNode;
  className?: string;
  width: number;
}

interface VirtualizedTableProps {
  data: any[];
  columns: TableColumn[];
  height?: number;
  itemSize?: number;
  searchable?: boolean;
  searchPlaceholder?: string;
  onRowClick?: (row: any) => void;
  loading?: boolean;
  className?: string;
  overscan?: number;
}

interface RowData {
  items: any[];
  columns: TableColumn[];
  onRowClick?: (row: any) => void;
}

const Row = React.memo<{
  index: number;
  style: React.CSSProperties;
  data: RowData;
}>(({ index, style, data }) => {
  const { items, columns, onRowClick } = data;
  const row = items[index];

  const getNestedValue = (obj: any, path: string): any => {
    if (path.includes('.')) {
      return path.split('.').reduce((o, p) => o?.[p], obj);
    }
    return obj[path];
  };

  return (
    <div
      style={style}
      className={`flex border-b border-gray-100 ${
        onRowClick ? 'hover:bg-gray-50 cursor-pointer' : 'hover:bg-gray-50'
      }`}
      onClick={() => onRowClick?.(row)}
    >
      {columns.map((column) => (
        <div
          key={column.key}
          className={`p-4 flex items-center ${column.className || ''}`}
          style={{ width: column.width, minWidth: column.width }}
        >
          <div className="truncate">
            {column.render
              ? column.render(getNestedValue(row, column.key), row)
              : String(getNestedValue(row, column.key) || '')}
          </div>
        </div>
      ))}
    </div>
  );
});

Row.displayName = 'VirtualizedTableRow';

export default function VirtualizedTable({
  data,
  columns,
  height = 400,
  itemSize = 60,
  searchable = true,
  searchPlaceholder = "Buscar...",
  onRowClick,
  loading = false,
  className = "",
  overscan = 10
}: VirtualizedTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  } | null>(null);

  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const listRef = useRef<List>(null);

  // Filter data based on search term
  const filteredData = useMemo(() => {
    if (!debouncedSearchTerm) return data;
    
    return data.filter((row) =>
      columns.some((column) => {
        const value = getNestedValue(row, column.key);
        return String(value || '').toLowerCase().includes(debouncedSearchTerm.toLowerCase());
      })
    );
  }, [data, debouncedSearchTerm, columns]);

  // Sort filtered data
  const sortedData = useMemo(() => {
    if (!sortConfig) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aValue = getNestedValue(a, sortConfig.key);
      const bValue = getNestedValue(b, sortConfig.key);

      // Handle null/undefined values
      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      // Convert to strings for comparison if not numbers
      const aVal = typeof aValue === 'number' ? aValue : String(aValue).toLowerCase();
      const bVal = typeof bValue === 'number' ? bValue : String(bValue).toLowerCase();

      if (aVal < bVal) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aVal > bVal) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [filteredData, sortConfig]);

  const handleSort = useCallback((key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    
    setSortConfig({ key, direction });
    
    // Scroll to top when sorting
    if (listRef.current) {
      listRef.current.scrollToItem(0);
    }
  }, [sortConfig]);

  const handleSearch = useCallback((value: string) => {
    setSearchTerm(value);
    
    // Scroll to top when searching
    if (listRef.current) {
      listRef.current.scrollToItem(0);
    }
  }, []);

  const getNestedValue = (obj: any, path: string): any => {
    if (path.includes('.')) {
      return path.split('.').reduce((o, p) => o?.[p], obj);
    }
    return obj[path];
  };

  const getSortIcon = (columnKey: string) => {
    if (!sortConfig || sortConfig.key !== columnKey) {
      return (
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    
    return sortConfig.direction === 'asc' ? (
      <svg className="w-4 h-4 text-[#fdb933]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 text-[#fdb933]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);

  if (loading) {
    return (
      <div className={`bg-white border border-gray-200 rounded-lg overflow-hidden ${className}`}>
        <div className="p-4">
          <LoadingSkeleton variant="text" width="w-64" height="h-4" className="mb-4" />
        </div>
        <div className="space-y-2 p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <LoadingSkeleton key={i} variant="text" height="h-12" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-lg overflow-hidden ${className}`}>
      {/* Search Bar */}
      {searchable && (
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-[#fdb933] focus:border-[#fdb933]"
            />
          </div>
          {debouncedSearchTerm && (
            <div className="mt-2 text-sm text-gray-500">
              Mostrando {sortedData.length} de {data.length} registros
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <div className="bg-gray-50 border-b border-gray-200">
        <div className="flex" style={{ width: totalWidth }}>
          {columns.map((column) => (
            <div
              key={column.key}
              className={`p-4 font-medium text-gray-700 ${
                column.sortable !== false ? 'cursor-pointer hover:bg-gray-100' : ''
              } ${column.className || ''}`}
              style={{ width: column.width, minWidth: column.width }}
              onClick={() => column.sortable !== false && handleSort(column.key)}
            >
              <div className="flex items-center space-x-1">
                <span className="truncate">{column.label}</span>
                {column.sortable !== false && getSortIcon(column.key)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Virtualized Body */}
      <div style={{ height }}>
        {sortedData.length > 0 ? (
          <List
            ref={listRef}
            height={height}
            itemCount={sortedData.length}
            itemSize={itemSize}
            itemData={{
              items: sortedData,
              columns,
              onRowClick
            }}
            overscanCount={overscan}
            width="100%"
          >
            {Row}
          </List>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-500 p-8">
              {debouncedSearchTerm ? (
                <div>
                  <svg className="mx-auto h-12 w-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 48 48">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <h3 className="text-sm font-medium text-gray-900 mb-1">No se encontraron resultados</h3>
                  <p className="text-sm text-gray-500">Intenta ajustar los términos de búsqueda</p>
                </div>
              ) : (
                <div>
                  <svg className="mx-auto h-12 w-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 48 48">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m-6 4h6m-6 4h6" />
                  </svg>
                  <h3 className="text-sm font-medium text-gray-900 mb-1">No hay datos disponibles</h3>
                  <p className="text-sm text-gray-500">Los datos aparecerán aquí cuando estén disponibles</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Statistics Footer */}
      <div className="bg-gray-50 px-4 py-3 border-t border-gray-200">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <div>
            Total de registros: <span className="font-medium">{sortedData.length}</span>
          </div>
          <div>
            Cargados: <span className="font-medium">{data.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
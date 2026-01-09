import React, { useState, useRef, useEffect } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { motion } from 'framer-motion';

interface ResponsiveChartProps {
  type: 'line' | 'area' | 'bar' | 'pie';
  data: any[];
  dataKeys: string[];
  colors: string[];
  title: string;
  height?: number;
  showLegend?: boolean;
  showGrid?: boolean;
  enableGestures?: boolean;
  onExport?: () => void;
  className?: string;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <motion.div 
        className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg max-w-xs"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.1 }}
      >
        <p className="font-medium text-gray-900 mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }} className="text-sm">
            {entry.name}: <span className="font-semibold">{entry.value}</span>
          </p>
        ))}
      </motion.div>
    );
  }
  return null;
};

const CustomLegend = ({ payload }: any) => {
  return (
    <div className="flex flex-wrap justify-center gap-3 mt-4">
      {payload.map((entry: any, index: number) => (
        <div key={index} className="flex items-center">
          <div 
            className="w-3 h-3 rounded-full mr-2" 
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-sm text-gray-600">{entry.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function ResponsiveChart({
  type,
  data,
  dataKeys,
  colors,
  title,
  height = 300,
  showLegend = true,
  showGrid = true,
  enableGestures = true,
  onExport,
  className = ""
}: ResponsiveChartProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Gesture handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!enableGestures || !isMobile) return;
    // Touch handling would be implemented here for swipe gestures
  };

  const renderChart = () => {
    const commonProps = {
      data,
      margin: { top: 20, right: 30, left: 20, bottom: 5 }
    };

    const tickProps = {
      tick: { fontSize: isMobile ? 10 : 12 },
      interval: (isMobile ? 'preserveStartEnd' : 0) as any
    };

    switch (type) {
      case 'line':
        return (
          <LineChart {...commonProps}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />}
            <XAxis dataKey="label" {...tickProps} />
            <YAxis {...tickProps} />
            <Tooltip content={<CustomTooltip />} />
            {showLegend && !isMobile && <Legend content={<CustomLegend />} />}
            {dataKeys.map((key, index) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={colors[index % colors.length]}
                strokeWidth={isMobile ? 2 : 3}
                dot={!isMobile}
                activeDot={{ r: 6, stroke: colors[index % colors.length], strokeWidth: 2 }}
              />
            ))}
          </LineChart>
        );

      case 'area':
        return (
          <AreaChart {...commonProps}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />}
            <XAxis dataKey="label" {...tickProps} />
            <YAxis {...tickProps} />
            <Tooltip content={<CustomTooltip />} />
            {showLegend && !isMobile && <Legend content={<CustomLegend />} />}
            {dataKeys.map((key, index) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={colors[index % colors.length]}
                fill={`${colors[index % colors.length]}30`}
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        );

      case 'bar':
        return (
          <BarChart {...commonProps}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />}
            <XAxis dataKey="label" {...tickProps} />
            <YAxis {...tickProps} />
            <Tooltip content={<CustomTooltip />} />
            {showLegend && !isMobile && <Legend content={<CustomLegend />} />}
            {dataKeys.map((key, index) => (
              <Bar
                key={key}
                dataKey={key}
                fill={colors[index % colors.length]}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        );

      case 'pie':
        return (
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => isMobile ? `${(percent * 100).toFixed(0)}%` : `${name} ${(percent * 100).toFixed(1)}%`}
              outerRadius={isMobile ? 60 : 80}
              fill="#8884d8"
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        );

      default:
        return null;
    }
  };

  return (
    <motion.div
      ref={chartRef}
      className={`bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onTouchStart={handleTouchStart}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 truncate">{title}</h3>
        <div className="flex items-center space-x-2">
          {onExport && (
            <button
              onClick={onExport}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Exportar gráfico"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </button>
          )}
          {isMobile && (
            <button
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Pantalla completa"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="p-4">
        <ResponsiveContainer width="100%" height={isMobile ? Math.min(height, 250) : height}>
          {renderChart()}
        </ResponsiveContainer>
      </div>

      {/* Mobile Legend */}
      {showLegend && isMobile && dataKeys.length > 1 && (
        <div className="px-4 pb-4">
          <div className="flex flex-wrap gap-2">
            {dataKeys.map((key, index) => (
              <div key={key} className="flex items-center text-xs">
                <div 
                  className="w-3 h-3 rounded-full mr-1" 
                  style={{ backgroundColor: colors[index % colors.length] }}
                />
                <span className="text-gray-600">{key}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
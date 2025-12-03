import React from 'react';
import { Check } from 'lucide-react';
import { CHILEAN_GRADES, GRADE_CATEGORIES, type ChileanGrade, type GradeCategory } from '@/types/grades';

interface GradeSelectorProps {
  selectedGrades: ChileanGrade[];
  onSelectionChange: (grades: ChileanGrade[]) => void;
  disabled?: boolean;
}

export default function GradeSelector({
  selectedGrades,
  onSelectionChange,
  disabled = false,
}: GradeSelectorProps) {
  const handleToggleGrade = (grade: ChileanGrade) => {
    if (disabled) return;

    if (selectedGrades.includes(grade)) {
      onSelectionChange(selectedGrades.filter(g => g !== grade));
    } else {
      onSelectionChange([...selectedGrades, grade]);
    }
  };

  const handleToggleCategory = (category: GradeCategory) => {
    if (disabled) return;

    const categoryGrades = GRADE_CATEGORIES[category].grades as readonly ChileanGrade[];
    const allSelected = categoryGrades.every(g => selectedGrades.includes(g));

    if (allSelected) {
      // Remove all grades in this category
      onSelectionChange(selectedGrades.filter(g => !categoryGrades.includes(g)));
    } else {
      // Add all grades in this category
      const newGrades = [...selectedGrades];
      categoryGrades.forEach(g => {
        if (!newGrades.includes(g)) {
          newGrades.push(g);
        }
      });
      onSelectionChange(newGrades);
    }
  };

  const handleSelectAll = () => {
    if (disabled) return;
    onSelectionChange([...CHILEAN_GRADES]);
  };

  const handleClearAll = () => {
    if (disabled) return;
    onSelectionChange([]);
  };

  const isCategoryFullySelected = (category: GradeCategory) => {
    const categoryGrades = GRADE_CATEGORIES[category].grades as readonly ChileanGrade[];
    return categoryGrades.every(g => selectedGrades.includes(g));
  };

  const isCategoryPartiallySelected = (category: GradeCategory) => {
    const categoryGrades = GRADE_CATEGORIES[category].grades as readonly ChileanGrade[];
    const selectedCount = categoryGrades.filter(g => selectedGrades.includes(g)).length;
    return selectedCount > 0 && selectedCount < categoryGrades.length;
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 p-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">
            {selectedGrades.length} de {CHILEAN_GRADES.length} grados seleccionados
          </span>
          <div className="flex gap-2 text-xs">
            <button
              onClick={handleSelectAll}
              disabled={disabled}
              className="text-yellow-600 hover:text-yellow-700 disabled:text-gray-400"
            >
              Seleccionar todos
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={handleClearAll}
              disabled={disabled || selectedGrades.length === 0}
              className="text-gray-500 hover:text-gray-700 disabled:text-gray-400"
            >
              Limpiar
            </button>
          </div>
        </div>
      </div>

      {/* Grade categories */}
      <div className="divide-y divide-gray-100">
        {(Object.entries(GRADE_CATEGORIES) as [GradeCategory, typeof GRADE_CATEGORIES[GradeCategory]][]).map(
          ([categoryKey, category]) => {
            const isFullySelected = isCategoryFullySelected(categoryKey);
            const isPartiallySelected = isCategoryPartiallySelected(categoryKey);

            return (
              <div key={categoryKey} className="p-3">
                {/* Category header */}
                <label
                  className={`flex items-center gap-2 mb-2 cursor-pointer ${
                    disabled ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isFullySelected}
                    ref={el => {
                      if (el) {
                        el.indeterminate = isPartiallySelected;
                      }
                    }}
                    onChange={() => handleToggleCategory(categoryKey)}
                    disabled={disabled}
                    className="h-4 w-4 rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"
                  />
                  <span className="text-sm font-medium text-gray-700">{category.label}</span>
                  <span className="text-xs text-gray-400">
                    ({category.grades.filter(g => selectedGrades.includes(g as ChileanGrade)).length}/
                    {category.grades.length})
                  </span>
                </label>

                {/* Grade checkboxes */}
                <div className="grid grid-cols-4 gap-2 ml-6">
                  {category.grades.map(grade => {
                    const isSelected = selectedGrades.includes(grade as ChileanGrade);

                    return (
                      <label
                        key={grade}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded text-sm cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleGrade(grade as ChileanGrade)}
                          disabled={disabled}
                          className="sr-only"
                        />
                        {isSelected && <Check className="h-3 w-3 flex-shrink-0" />}
                        <span className="truncate">{grade}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          }
        )}
      </div>
    </div>
  );
}

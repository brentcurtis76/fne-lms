-- Migration: Update early bird deadline from November 2025 to March 2026
-- Date: 2024-12-19
-- Description: Changes the early bird payment deadline from "30 de noviembre de 2025" to "31 de marzo de 2026"

-- Update pasantias_programs descriptions
UPDATE pasantias_programs
SET description = REPLACE(description, '30 de noviembre de 2025', '31 de marzo de 2026')
WHERE description LIKE '%30 de noviembre de 2025%';

-- Verify the update
SELECT id, name, description
FROM pasantias_programs
WHERE description LIKE '%marzo de 2026%';

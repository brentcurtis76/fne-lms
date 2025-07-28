-- Find users from Colegio Metodista de Santiago
SELECT 
  p.id,
  p.first_name,
  p.last_name,
  p.email,
  s.name as school_name
FROM profiles p
JOIN schools s ON p.school_id = s.id
WHERE s.name LIKE '%Metodista%Santiago%'
ORDER BY p.first_name, p.last_name
LIMIT 10;
EOF < /dev/null
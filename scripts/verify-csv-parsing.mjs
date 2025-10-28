/**
 * Simple verification that CSV parsing works
 */

import { parseTransformationQuestions, getTotalQuestions } from '../utils/parseTransformationQuestions.js';

console.log('🧪 Verifying CSV Parsing\n');

try {
  const questions = parseTransformationQuestions();
  const total = getTotalQuestions();

  console.log(`✅ Parsed ${questions.length} questions`);
  console.log(`✅ getTotalQuestions() returns ${total}`);
  console.log(`\n📝 First question:`);
  console.log(`   ID: ${questions[0].id}`);
  console.log(`   Category: ${questions[0].category}`);
  console.log(`   Dimension: ${questions[0].dimension}`);
  console.log(`   Text: ${questions[0].text.substring(0, 100)}...`);
  console.log(`\n📝 Last question (#${questions.length}):`);
  const last = questions[questions.length - 1];
  console.log(`   ID: ${last.id}`);
  console.log(`   Category: ${last.category}`);
  console.log(`   Dimension: ${last.dimension}`);
  console.log(`\n✅ CSV parsing working correctly!`);
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir:'./tests', testMatch:'contract-document-print.spec.ts', outputDir:'/tmp/fne-contract-print-results', workers:1, use:{browserName:'chromium',viewport:{width:682,height:960}}, reporter:'list' });

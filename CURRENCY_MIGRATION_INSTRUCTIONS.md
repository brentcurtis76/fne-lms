# 💰 Currency Support Migration for Expense Reports

## 📋 Step 1: Apply Database Migration

**Go to Supabase Dashboard → SQL Editor and run this:**

```sql
-- Add currency support to expense items
ALTER TABLE expense_items 
ADD COLUMN currency VARCHAR(3) DEFAULT 'CLP' CHECK (currency IN ('CLP', 'USD', 'EUR'));

ALTER TABLE expense_items 
ADD COLUMN original_amount DECIMAL(10,2);

ALTER TABLE expense_items 
ADD COLUMN conversion_rate DECIMAL(10,4);

ALTER TABLE expense_items 
ADD COLUMN conversion_date DATE;

-- Update existing records to have CLP currency and copy amounts
UPDATE expense_items 
SET 
  currency = 'CLP',
  original_amount = amount,
  conversion_rate = 1.0000,
  conversion_date = CURRENT_DATE
WHERE currency IS NULL;
```

## 🔄 Step 2: Verify Migration

After running the SQL, verify the columns were added:

```sql
SELECT 
  id, 
  description, 
  amount, 
  currency, 
  original_amount, 
  conversion_rate 
FROM expense_items 
LIMIT 3;
```

## 🌟 Features Being Added

### **Multi-Currency Support:**
- ✅ **CLP** (Chilean Peso) - Default currency
- ✅ **USD** (US Dollar) - New support
- ✅ **EUR** (Euro) - New support

### **Automatic Conversion:**
- Real-time exchange rates from reliable API
- Stores original amount and conversion rate
- Displays both original and converted amounts
- Maintains CLP totals for reporting consistency

### **Enhanced UI:**
- Currency selector in expense form
- Display of original currency amounts
- Conversion rate indicators
- Multi-currency totals in reports

## 📊 Database Schema Changes

| Column | Type | Description |
|--------|------|-------------|
| `currency` | VARCHAR(3) | Currency code (CLP, USD, EUR) |
| `original_amount` | DECIMAL(10,2) | Amount in original currency |
| `conversion_rate` | DECIMAL(10,4) | Exchange rate to CLP |
| `conversion_date` | DATE | Date of conversion |

The existing `amount` field will continue to store the CLP equivalent for consistent reporting.

## 🚀 After Migration

Once you've run the SQL migration, the system will support:
1. **Adding expenses in USD/EUR**
2. **Automatic conversion to CLP**
3. **Displaying both original and converted amounts**
4. **Currency-aware totals and reports**
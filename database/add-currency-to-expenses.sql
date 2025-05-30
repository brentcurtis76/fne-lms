-- Add currency support to expense items
-- This allows expenses to be recorded in USD, EUR, or CLP

-- Add currency field to expense_items table
ALTER TABLE expense_items 
ADD COLUMN currency VARCHAR(3) DEFAULT 'CLP' CHECK (currency IN ('CLP', 'USD', 'EUR'));

-- Add original amount field to store the amount in the original currency
ALTER TABLE expense_items 
ADD COLUMN original_amount DECIMAL(10,2);

-- Add conversion rate field to track the exchange rate used
ALTER TABLE expense_items 
ADD COLUMN conversion_rate DECIMAL(10,4);

-- Add conversion date to track when the rate was applied
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

-- Add comments for documentation
COMMENT ON COLUMN expense_items.currency IS 'Currency code: CLP (Chilean Peso), USD (US Dollar), EUR (Euro)';
COMMENT ON COLUMN expense_items.original_amount IS 'Amount in the original currency before conversion';
COMMENT ON COLUMN expense_items.conversion_rate IS 'Exchange rate used to convert to CLP (1 unit of original currency = X CLP)';
COMMENT ON COLUMN expense_items.conversion_date IS 'Date when the conversion rate was applied';

-- The amount field will continue to store the CLP equivalent for reporting consistency
-- Make cliente_id nullable: schools are not yet clients when licitación is created.
ALTER TABLE licitaciones ALTER COLUMN cliente_id DROP NOT NULL;
